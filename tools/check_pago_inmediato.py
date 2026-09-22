#!/usr/bin/env python3
"""SOLICITUD DE PAGO INMEDIATO · prueba de regresión (sep 2026).

Lo que pidió Dani: cuando alguien pide un pago inmediato, a administración le llega un CORREO con
el estilo de la casa. Se comprueba con la app REAL y su propia BD (`radiopago`, que se RECREA):

  1. la solicitud avisa a administración **y le manda el correo** (antes solo salía la campanita);
  2. el correo lleva: **logo de la empresa arriba a la derecha**, el **título centrado**
     «Solicitud de pago inmediato», la **cabecera de la actividad** con sus datos, los **datos del
     pago** (concepto, a quién se le paga, bolsa, por qué es urgente…), **quién lo ha pedido con su
     foto** y el botón **«Gestionar pago»**;
  3. el importe que se enseña es el que se pide (el gasto entero, un % o una parte);
  4. y si el gasto **no cuelga de una actividad**, el correo sigue teniendo cabecera (la de la
     bolsa): un correo sin cabecera no dice de qué habla.

    /tmp/python/bin/python3 tools/check_pago_inmediato.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, decimal, re

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radiopago"
import psycopg2
_c = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname="postgres")
_c.autocommit = True
_cur = _c.cursor()
_cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (_BD,))
if not _cur.fetchone():
    _cur.execute("CREATE DATABASE %s ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0" % _BD)
    _c.close()
    _c2 = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname=_BD)
    _c2.autocommit = True
    _c2.cursor().execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    _c2.close()
else:
    _c.close()
os.environ["DATABASE_URL"] = "postgresql://postgres@127.0.0.1:54329/%s?sslmode=disable" % _BD
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "t")
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / n).write_text("x")

import models
models.Base.metadata.drop_all(models.engine)
models.Base.metadata.create_all(models.engine)
import app as A

A.app.config["WTF_CSRF_ENABLED"] = False
D = decimal.Decimal
HOY = datetime.date.today()
OK, KO = [], []
ENVIADOS = []          # los correos que habrían salido


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:240]) if (extra and not cond) else ""))


def _correo_falso(to, subject, html, *a, **k):
    ENVIADOS.append({"to": to, "subject": subject, "html": html})
    return True, None


A._send_optional_email = _correo_falso

print("\n── 1. Semilla: administración, actividad, bolsa y gasto ───────────────")
s = models.SessionLocal()
try:
    # Quien PIDE el pago (producción) y quien lo RECIBE (administración).
    # ⚠️ Quien pide el pago trabaja en la bolsa: sin permiso sobre bolsas el gate lo rebota con un
    # 403 (`BAG_ACCESS_KEYS`). En la prueba se le da rol de dirección, que es lo que hace el resto
    # de comprobaciones de la casa: lo que se está probando es el AVISO, no el permiso.
    pide = models.User(email="produccion@33producciones.es", password_hash="x", role=10)
    admin = models.User(email="administracion@33producciones.es", password_hash="x", role=1)
    s.add_all([pide, admin]); s.flush()
    s.add(models.UserProfile(user_id=pide.id, nick="Produ", departments=["Producción"],
                             photo_url="https://x/foto-produ.jpg"))
    s.add(models.UserProfile(user_id=admin.id, nick="Admin", departments=["Administración"]))
    emp = models.GroupCompany(name="33 Producciones", logo_url="/static/img/logo_33_producciones.png")
    art = models.Artist(name="Los Ñus", photo_url="https://x/losnus.jpg")
    ven = models.Venue(name="Sala Prueba", municipality="Sevilla", province="Sevilla")
    prov = models.Promoter(nick="Backline SL")
    s.add_all([emp, art, ven, prov]); s.flush()
    c = models.Concert(artist_id=art.id, venue_id=ven.id, date=HOY + datetime.timedelta(days=20),
                       sale_type="VENDIDO", capacity=300, activity_type="CONCIERTO",
                       status="CONFIRMADO", billing_company_id=emp.id)
    s.add(c); s.flush()
    bag = models.WorkflowBag(title="Bolsa del concierto", artist_id=art.id, artist_ids=[str(art.id)],
                             bag_type="CONCIERTO", status="ACTIVA", company_id=emp.id,
                             linked_type="CONCERT", linked_id=c.id)
    s.add(bag); s.flush()
    gasto = models.BagExpense(bag_id=bag.id, concept="Alquiler de backline",
                              amount_gross=D("1210"), covered_by="BOLSA", provider_id=prov.id,
                              invoice_number="F-2026-88")
    s.add(gasto); s.flush()
    UID, ADMIN_ID, BAG, GASTO, CID = str(pide.id), str(admin.id), str(bag.id), str(gasto.id), str(c.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10

print("\n── 2. Se pide el pago inmediato: aviso Y correo ───────────────────────")
ENVIADOS.clear()
r = cli.post("/bolsas/%s/expenses/%s/request-payment" % (BAG, GASTO), data={
    "amount_mode": "TOTAL", "reason": "El proveedor no entrega sin el pago por delante",
    "send_receipt": "1",
}, follow_redirects=True)
check("la solicitud se acepta", r.status_code == 200, r.status_code)
s = models.SessionLocal()
try:
    g = s.get(models.BagExpense, A.to_uuid(GASTO))
    check("el gasto queda marcado como pago inmediato", g.immediate_payment_requested is True)
    avisos = s.query(models.AppNotification).filter(models.AppNotification.ref_type == "EXPENSE").all()
    check("a administración le llega el aviso", len(avisos) >= 1, [(n.kind, n.title) for n in avisos])
finally:
    s.close()
check("⚠️ y le sale el CORREO", len(ENVIADOS) >= 1, len(ENVIADOS))
correo = (ENVIADOS or [{}])[0]
html = correo.get("html") or ""
check("va a administración", any("administracion@" in (d or "") for d in
                                 ([correo.get("to")] if isinstance(correo.get("to"), str) else (correo.get("to") or []))),
      correo.get("to"))
check("el asunto lo dice", "pago inmediato" in (correo.get("subject") or "").lower(), correo.get("subject"))

print("\n── 3. El correo, como lo pidió Dani ───────────────────────────────────")
check("título centrado «Solicitud de pago inmediato»",
      re.search(r'text-align:center[^>]*>\s*Solicitud de pago inmediato', html) is not None)
check("logo de la empresa arriba a la DERECHA",
      re.search(r'text-align:right[^"]*"><img src="[^"]*logo_33_producciones', html) is not None)
check("la cabecera de la ACTIVIDAD (su artista)", "Los Ñus" in html)
check("con sus datos (el recinto)", "Sala Prueba" in html)
check("los datos del pago: el concepto", "Alquiler de backline" in html)
check("a quién se le paga", "Backline SL" in html)
check("la bolsa", "Bolsa del concierto" in html)
check("por qué es urgente", "no entrega sin el pago" in html)
check("el nº de factura", "F-2026-88" in html)
check("que hay que mandarle el justificante", "justificante" in html)
check("el importe que se pide (el gasto entero)", "1.210,00" in html, html[:0])
check("⚠️ QUIÉN lo ha pedido…", "Produ" in html)
check("…CON SU FOTO", "foto-produ.jpg" in html)
check("y el botón «Gestionar pago»", "Gestionar pago" in html)
check("que lleva a gestionarlo", "tab=pendiente" in html and "subtab=solicitudes" in html)

print("\n── 4. Un % del gasto se dice como tal ─────────────────────────────────")
# ⚠️ Por correo se avisa SOLO LA PRIMERA VEZ de cada cosa (regla de la casa), así que volver a
# pedirlo sobre el MISMO gasto no manda otro: el contenido se comprueba en el motor, que es el
# punto único por el que pasa el correo se pida desde donde se pida.
s = models.SessionLocal()
try:
    g = s.get(models.BagExpense, A.to_uuid(GASTO))
    g.immediate_payment_amount_mode = "PERCENT"
    g.immediate_payment_percent = D("50")
    g.immediate_payment_amount = D("605")
    s.commit()
    with A.app.test_request_context("/"):
        datos = A._immediate_payment_email(s, g, amount=D("605"),
                                           solicitante={"nick": "Produ", "photo_url": "https://x/foto-produ.jpg"})
    html2 = A._notice_email_html(**{k: v for k, v in datos.items() if k != "subject"})
finally:
    s.close()
check("se dice que es un % del gasto", "% del gasto" in html2, html2[:200])
check("con su porcentaje", "50" in html2)
check("y el importe que se pide", "605,00" in html2)

print("\n── 5. Sin actividad detrás, el correo sigue teniendo cabecera ─────────")
s = models.SessionLocal()
try:
    bag2 = models.WorkflowBag(title="Bolsa general", bag_type="GENERAL", status="ACTIVA",
                              company_id=A.to_uuid([str(x.id) for x in s.query(models.GroupCompany).all()][0]))
    s.add(bag2); s.flush()
    g2 = models.BagExpense(bag_id=bag2.id, concept="Material de oficina", amount_gross=D("300"),
                           covered_by="BOLSA")
    s.add(g2); s.flush()
    BAG2, GASTO2 = str(bag2.id), str(g2.id)
    s.commit()
finally:
    s.close()
ENVIADOS.clear()
cli.post("/bolsas/%s/expenses/%s/request-payment" % (BAG2, GASTO2), data={
    "amount_mode": "TOTAL", "reason": "Urge",
}, follow_redirects=True)
html3 = (ENVIADOS or [{}])[0].get("html") or ""
check("hay correo igualmente", bool(html3))
check("con la cabecera de la BOLSA", "Bolsa general" in html3)
check("y su botón", "Gestionar pago" in html3)

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
