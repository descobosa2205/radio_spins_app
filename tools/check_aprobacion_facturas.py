#!/usr/bin/env python3
"""UNA FACTURA SUBIDA PASA POR ADMINISTRACIÓN ANTES DE «PENDIENTE DE PAGO» · prueba de regresión (sep 2026).

Lo pidió Dani: «todas las facturas que se hayan subido tienen que pasar el proceso de aprobación por
administración: con la bolsa, o suelta cuando se haya solicitado el pago inmediato —tiene que aparecer
en Solicitudes antes para validarse, igual que una liquidación— para aprobarse ese gasto y que pase a
pendiente de pago». Antes, subir la factura marcaba el gasto CONSOLIDADO en el acto y entraba en «De
pago» sin pasar por nadie.

Con la app REAL y su propia BD (`radioaprob`, que se RECREA en cada pasada):

  1. subir la factura deja el gasto POR VALIDAR: no está en pendiente de pago, la bolsa lo dice y
     aun así la bolsa se puede cerrar (está documentado);
  2. SUELTA · pedir el pago inmediato lo lleva a Solicitudes con la misma línea que tendrá en pago
     (a quién se le paga, su cuenta, la factura); rechazar lo devuelve con su nota (y a quien lo pidió
     se le dice) y ACEPTAR lo valida: pasa a pendiente de pago;
  3. CON LA BOLSA · al cerrar la bolsa los gastos siguen por validar; «Validar ingresos/gastos» de la
     liquidación los valida todos y entran en pendiente de pago (también la PARTE de un gasto dividido);
  4. los demás caminos por los que entra una factura (reemplazar el documento, el enlace público del
     gasto, una acción de marketing, editar sin tocar) respetan la regla y no la saltan;
  5. y contabilidad solo ve lo VALIDADO.

    /tmp/python/bin/python3 tools/check_aprobacion_facturas.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, decimal, io as _io

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radioaprob"
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
# Sin Storage ni correo: lo que se prueba es el circuito de aprobación.
A._bag_document_upload = lambda fs: ("https://x/%s" % (getattr(fs, "filename", "f") or "f"),
                                     (getattr(fs, "filename", "f") or "f"), "application/pdf")
A._invoice_iban_from_upload = lambda fs: ""
A._send_optional_email = lambda *a, **k: (True, None)
D = decimal.Decimal
HOY = datetime.date.today()
OK, KO = [], []
IBAN = "ES9121000418450200051332"


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:260]) if (extra and not cond) else ""))


def pdf(nombre="factura.pdf"):
    return (_io.BytesIO(b"%PDF-1.4 factura"), nombre)


def gasto(gid):
    s = models.SessionLocal()
    try:
        g = s.get(models.BagExpense, A.to_uuid(gid))
        s.refresh(g)
        return g
    finally:
        s.close()


def gastos_de(bid):
    s = models.SessionLocal()
    try:
        return (s.query(models.BagExpense).filter(models.BagExpense.bag_id == A.to_uuid(bid))
                .order_by(models.BagExpense.created_at.asc()).all())
    finally:
        s.close()


def en_pago():
    """Los ids que están en «pendiente de pago» (la misma consulta que la pantalla y la remesa)."""
    s = models.SessionLocal()
    try:
        return {str(e.id) for e in A._payment_pending_expenses(s)}
    finally:
        s.close()


def contadores():
    s = models.SessionLocal()
    try:
        return A._admin_pending_counts(s)["pending_counts"]
    finally:
        s.close()


def avisos(uid, **filtros):
    s = models.SessionLocal()
    try:
        q = s.query(models.AppNotification).filter(models.AppNotification.user_id == A.to_uuid(uid))
        for k, v in filtros.items():
            q = q.filter(getattr(models.AppNotification, k) == v)
        return q.order_by(models.AppNotification.created_at.asc()).all()
    finally:
        s.close()


def eventos(gid):
    s = models.SessionLocal()
    try:
        return [e.kind for e in s.query(models.BagPaymentInteraction)
                .filter(models.BagPaymentInteraction.expense_id == A.to_uuid(gid))
                .order_by(models.BagPaymentInteraction.created_at.asc()).all()]
    finally:
        s.close()


print("\n── 1. Semilla ─────────────────────────────────────────────────────────")
s = models.SessionLocal()
try:
    # Quien apunta el gasto y pide el pago (producción) y quien lo valida (administración).
    # ⚠️ Rol de dirección para los dos, como el resto de comprobaciones de la casa: lo que se prueba
    # es el CIRCUITO, no el permiso. Son dos personas distintas para que los avisos vayan de una a otra.
    pide = models.User(email="produccion@33producciones.es", password_hash="x", role=10)
    admin = models.User(email="administracion@33producciones.es", password_hash="x", role=10)
    s.add_all([pide, admin]); s.flush()
    s.add(models.UserProfile(user_id=pide.id, nick="Produ", departments=["Producción"]))
    s.add(models.UserProfile(user_id=admin.id, nick="Admin", departments=["Administración"]))
    emp = models.GroupCompany(name="33 Producciones", logo_url="/static/img/logo_33_producciones.png")
    art = models.Artist(name="Los Ñus")
    ven = models.Venue(name="Sala Prueba", municipality="Sevilla", province="Sevilla")
    # Con su cuenta, para que el gasto con factura se pueda guardar (regla del IBAN).
    prov = models.Promoter(nick="Backline SL", bank_account=IBAN)
    s.add_all([emp, art, ven, prov]); s.flush()
    c = models.Concert(artist_id=art.id, venue_id=ven.id, date=HOY + datetime.timedelta(days=20),
                       sale_type="VENDIDO", capacity=300, activity_type="CONCIERTO",
                       status="CONFIRMADO", billing_company_id=emp.id)
    s.add(c); s.flush()
    bag = models.WorkflowBag(title="Bolsa del concierto", artist_id=art.id, artist_ids=[str(art.id)],
                             bag_type="CONCIERTO", status="ACTIVA", company_id=emp.id,
                             linked_type="CONCERT", linked_id=c.id)
    s.add(bag); s.flush()
    PIDE, ADMIN, BAG, PROV, CID, EMP = str(pide.id), str(admin.id), str(bag.id), str(prov.id), str(c.id), str(emp.id)
    ART = str(art.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()               # producción
with cli.session_transaction() as ses:
    ses["user_id"] = PIDE
    ses["role"] = 10
adm = A.app.test_client()               # administración
with adm.session_transaction() as ses:
    ses["user_id"] = ADMIN
    ses["role"] = 10
anon = A.app.test_client()


def alta(bid, concepto, con_factura=True, **extra):
    datos = {"category": "PRODUCCION", "concept": concepto, "amount_value": "1.210",
             "amount_mode": "GROSS", "provider_id": PROV, "document_type": "FACTURA",
             "invoice_number": "F-2026-88"}
    if con_factura:
        datos["document"] = pdf()
    datos.update(extra)
    r = cli.post("/bolsas/%s/expenses" % bid, data=datos, content_type="multipart/form-data",
                 follow_redirects=True)
    assert r.status_code == 200, r.status_code
    return str([g for g in gastos_de(bid) if g.concept == concepto][-1].id)


print("\n── 2. Subir la factura NO manda el gasto a pago: queda POR VALIDAR ────")
G1 = alta(BAG, "Alquiler de backline")
g = gasto(G1)
check("el gasto se crea con su factura", bool(g.attachment_url), g.attachment_url)
check("⚠️ y queda PENDIENTE_VALIDAR, no CONSOLIDADO", g.consolidation_status == "PENDIENTE_VALIDAR", g.consolidation_status)
check("no está en pendiente de pago", G1 not in en_pago(), en_pago())
check("el contador de «De pago» está a cero", contadores()["pago"] == 0, contadores())
html = cli.get("/bolsas/%s" % BAG).get_data(as_text=True)
check("la bolsa lo dice: «Por validar»", ">Por validar<" in html.replace("</i>", "").replace("\n", ""), )
check("y ya no lo llama «Sin consolidar»", ">Sin consolidar<" not in html)
check("la bolsa SÍ se puede cerrar (está documentado)", A._bag_expense_is_consolidated(g))
s = models.SessionLocal()
try:
    tot = A._concert_bag_expense_totals(s, s.get(models.Concert, A.to_uuid(CID)))
    check("y en el resultado de la actividad ya cuenta como coste real (1.000 € de base)",
          tot and tot["consolidated"] == D("1000.00"), tot and tot["consolidated"])
finally:
    s.close()

print("\n── 3. SUELTA · el pago inmediato pasa por Solicitudes ─────────────────")
r = cli.post("/bolsas/%s/expenses/%s/request-payment" % (BAG, G1),
             data={"amount_mode": "TOTAL", "reason": "El proveedor no entrega sin el pago por delante"},
             follow_redirects=True)
check("se pide el pago inmediato", r.status_code == 200 and "la validará en Solicitudes" in r.get_data(as_text=True))
check("sigue sin estar en pendiente de pago", G1 not in en_pago())
cnt = contadores()
check("cuenta en Solicitudes y no en De pago", cnt["solicitudes"] == 1 and cnt["pago"] == 0, cnt)
html = adm.get("/administracion?tab=pendiente&subtab=solicitudes").get_data(as_text=True)
check("administración la ve en Solicitudes", "Alquiler de backline" in html)
check("con la factura por validar", "Factura por validar" in html)
check("y el botón «Validar y pasar a pago»", "Validar y pasar a pago" in html)
check("con LA MISMA línea que tendrá en pago: a quién se le paga", "Backline SL" in html)
check("…su cuenta", A._iban_masked(IBAN) in html, A._iban_masked(IBAN))
check("…el nº de factura y el desglose", "F-2026-88" in html and "Base 1.000,00" in html)
check("…y quién lo pide", "Solicita: Produ" in html)
check("la factura se abre en el visor de pagos", 'data-pay-doc="https://x/factura.pdf"' in html and 'id="payDocModal"' in html)
check("y el pop-up de la cuenta está en la página", 'id="payBankModal"' in html)
pend_admin = [n for n in avisos(ADMIN, ref_type="EXPENSE", ref_id=G1) if n.read_at is None]
check("a administración le ha llegado el aviso", len(pend_admin) == 1, len(pend_admin))

print("\n── 4. RECHAZAR devuelve el gasto con su nota, y la factura no se pierde ─")
r = adm.post("/administracion/gastos/%s/solicitud-pago/REJECT" % G1, data={"note": "Falta el contrato firmado"},
             follow_redirects=True)
g = gasto(G1)
check("la solicitud se cierra", g.immediate_payment_requested is False)
check("queda rechazada con su nota", g.admin_review_status == "PAGO_RECHAZADO" and "contrato" in (g.admin_review_note or ""), g.admin_review_note)
check("⚠️ la factura sigue POR VALIDAR (seguirá con la liquidación)", g.consolidation_status == "PENDIENTE_VALIDAR", g.consolidation_status)
check("y no está en pendiente de pago", G1 not in en_pago())
check("el aviso de administración desaparece solo", all(n.read_at for n in avisos(ADMIN, ref_type="EXPENSE", ref_id=G1)))
resp = avisos(PIDE, kind="PAGO_RESPUESTA")
check("a quien lo pidió se le dice", len(resp) == 1 and "rechazado" in (resp[0].title or "").lower(), [(n.title, n.body) for n in resp])
check("con el motivo", bool(resp) and "contrato" in (resp[0].body or ""), [n.body for n in resp])
html = cli.get("/bolsas/%s" % BAG).get_data(as_text=True)
check("y la bolsa enseña el rechazo", "Pago inmediato rechazado" in html)

print("\n── 5. ACEPTAR ES VALIDAR: pasa a pendiente de pago ───────────────────")
cli.post("/bolsas/%s/expenses/%s/request-payment" % (BAG, G1), data={"amount_mode": "TOTAL", "reason": "Urge"},
         follow_redirects=True)
r = adm.post("/administracion/gastos/%s/solicitud-pago/ACCEPT" % G1, data={"note": "Visto con el promotor"},
             follow_redirects=True)
check("la respuesta lo dice", "queda validado y pasa a pendiente de pago" in r.get_data(as_text=True))
g = gasto(G1)
check("⚠️ el gasto queda CONSOLIDADO (validado)", g.consolidation_status == "CONSOLIDADO", g.consolidation_status)
check("con quién y cuándo", g.admin_review_status == "PAGO_ACEPTADO" and g.admin_reviewed_at is not None)
check("pendiente de pago", g.payment_status == "PENDIENTE", g.payment_status)
check("⚠️ y AHORA sí está en pendiente de pago", G1 in en_pago())
cnt = contadores()
check("los contadores cuadran (1 en De pago, 0 en Solicitudes)", cnt["pago"] == 1 and cnt["solicitudes"] == 0, cnt)
ev = eventos(G1)
check("deja rastro en el historial del gasto", "VALIDADO_ADMIN" in ev and "PAGO_ACEPTADO" in ev, ev)
resp = avisos(PIDE, kind="PAGO_RESPUESTA")
check("a quien lo pidió se le dice que está aceptado", len(resp) == 2 and "aceptado" in (resp[-1].title or "").lower(), [n.title for n in resp])
html = adm.get("/administracion?tab=pendiente&subtab=pago").get_data(as_text=True)
check("y se ve en «De pago»", "Alquiler de backline" in html)
html = cli.get("/bolsas/%s" % BAG).get_data(as_text=True)
check("en la bolsa ya no está «Por validar»", ">Por validar<" not in html.replace("</i>", "").replace("\n", ""))
check("sino validado por administración", "Validado por administración" in html)

print("\n── 6. Sin factura: se pide, se ve que no la hay y aceptar también valida ─")
G2 = alta(BAG, "Anticipo del sonido", con_factura=False)
check("un gasto sin factura nace PENDIENTE", gasto(G2).consolidation_status == "PENDIENTE", gasto(G2).consolidation_status)
cli.post("/bolsas/%s/expenses/%s/request-payment" % (BAG, G2), data={"amount_mode": "PERCENT", "percent": "50", "reason": "Anticipo"},
         follow_redirects=True)
html = adm.get("/administracion?tab=pendiente&subtab=solicitudes").get_data(as_text=True)
check("Solicitudes avisa de que no hay factura ni ticket", "Sin factura ni ticket" in html)
check("y dice que es un % del gasto", "% del gasto" in html)
adm.post("/administracion/gastos/%s/solicitud-pago/ACCEPT" % G2, data={}, follow_redirects=True)
g = gasto(G2)
check("aceptado sin documento: validado igualmente", g.consolidation_status == "CONSOLIDADO", g.consolidation_status)
check("y en pendiente de pago", G2 in en_pago())

print("\n── 7. CON LA BOLSA · validar la liquidación valida sus facturas ───────")
s = models.SessionLocal()
try:
    bag2 = models.WorkflowBag(title="Bolsa de la gira", artist_id=A.to_uuid(ART), artist_ids=[ART],
                              bag_type="GENERAL", status="ACTIVA", company_id=A.to_uuid(EMP))
    bag3 = models.WorkflowBag(title="Bolsa compartida", artist_id=A.to_uuid(ART), artist_ids=[ART],
                              bag_type="GENERAL", status="ACTIVA", company_id=A.to_uuid(EMP))
    s.add_all([bag2, bag3]); s.flush()
    BAG2, BAG3 = str(bag2.id), str(bag3.id)
    s.commit()
finally:
    s.close()
G3 = alta(BAG2, "Furgoneta")
G4 = alta(BAG2, "Hotel", invoice_number="H-77")
# El hotel se DIVIDE con otra bolsa antes de que nadie lo valide (el orden normal de la casa).
s = models.SessionLocal()
try:
    with A.app.test_request_context("/"):
        g4 = s.get(models.BagExpense, A.to_uuid(G4))
        res = A._split_apply(s, g4, [{"bag_id": BAG3, "mode": "EQUAL", "value": None}])
        s.commit()
    check("el hotel se divide entre dos bolsas", res.get("ok"), res)
    parte = (s.query(models.BagExpense).filter(models.BagExpense.bag_id == A.to_uuid(BAG3)).first())
    PARTE = str(parte.id) if parte else ""
    check("la PARTE espeja «por validar»", parte is not None and parte.consolidation_status == "PENDIENTE_VALIDAR",
          parte and parte.consolidation_status)
finally:
    s.close()
r = cli.post("/bolsas/%s/close" % BAG2, data={}, follow_redirects=True)
s = models.SessionLocal()
try:
    b2 = s.get(models.WorkflowBag, A.to_uuid(BAG2))
    check("la bolsa se cierra con todo documentado", (b2.status or "").upper() == "CERRADA" and b2.liquidation_status == "PENDIENTE_ADMIN",
          (b2.status, b2.liquidation_status, r.get_data(as_text=True)[-300:] if r.status_code != 200 else ""))
finally:
    s.close()
check("cerrada, sus gastos siguen POR VALIDAR", all(g.consolidation_status == "PENDIENTE_VALIDAR" for g in (gasto(G3), gasto(G4))),
      [gasto(G3).consolidation_status, gasto(G4).consolidation_status])
check("y ninguno está en pendiente de pago", not ({G3, G4} & en_pago()), en_pago())
html = adm.get("/administracion?tab=pendiente&subtab=liquidacion").get_data(as_text=True)
check("administración la ve en De liquidación", "Bolsa de la gira" in html and "Validar ingresos/gastos" in html)
r = adm.post("/administracion/bolsas/%s/cierre-liquidacion" % BAG2, data={"mode": "VALIDAR"}, follow_redirects=True)
check("«Validar ingresos/gastos» dice cuántos gastos valida", "2 gastos con factura quedan validados" in r.get_data(as_text=True),
      r.get_data(as_text=True)[:0])
s = models.SessionLocal()
try:
    b2 = s.get(models.WorkflowBag, A.to_uuid(BAG2))
    check("la liquidación pasa a cierre", b2.liquidation_status == "PENDIENTE_CIERRE", b2.liquidation_status)
finally:
    s.close()
check("⚠️ los dos gastos quedan VALIDADOS", all(g.consolidation_status == "CONSOLIDADO" for g in (gasto(G3), gasto(G4))),
      [gasto(G3).consolidation_status, gasto(G4).consolidation_status])
check("y se sabe que fue con la liquidación", gasto(G3).admin_review_status == "VALIDADO_LIQUIDACION", gasto(G3).admin_review_status)
check("y AHORA están en pendiente de pago", {G3, G4} <= en_pago(), en_pago())
if PARTE:
    check("la PARTE del hotel también queda validada (espejada)", gasto(PARTE).consolidation_status == "CONSOLIDADO", gasto(PARTE).consolidation_status)
    check("pero en pendiente de pago solo está el TITULAR", PARTE not in en_pago())
check("el historial lo dice", "VALIDADO_ADMIN" in eventos(G3), eventos(G3))

print("\n── 8. Los demás caminos respetan la regla ─────────────────────────────")
G5 = alta(BAG, "Catering")
cli.post("/bolsas/%s/expenses/%s/document" % (BAG, G5), data={"replace_policy": "replace", "document": pdf("otra.pdf")},
         content_type="multipart/form-data", follow_redirects=True)
g = gasto(G5)
check("reemplazar el documento de uno por validar lo deja por validar", g.consolidation_status == "PENDIENTE_VALIDAR" and "otra.pdf" in (g.attachment_url or ""),
      (g.consolidation_status, g.attachment_url))
cli.post("/bolsas/%s/expenses/%s/document" % (BAG, G1), data={"replace_policy": "replace", "document": pdf("v2.pdf")},
         content_type="multipart/form-data", follow_redirects=True)
check("y el de uno ya validado lo deja validado", gasto(G1).consolidation_status == "CONSOLIDADO", gasto(G1).consolidation_status)
# Editar sin tocar nada no cambia el estado (ni lo sube ni lo baja).
cli.post("/bolsas/%s/expenses/%s/edit" % (BAG, G5), data={"category": "PRODUCCION", "concept": "Catering", "provider_id": PROV,
                                                          "document_type": "FACTURA"}, follow_redirects=True)
check("editar sin tocar deja «por validar»", gasto(G5).consolidation_status == "PENDIENTE_VALIDAR", gasto(G5).consolidation_status)
cli.post("/bolsas/%s/expenses/%s/edit" % (BAG, G1), data={"category": "PRODUCCION", "concept": "Alquiler de backline", "provider_id": PROV,
                                                          "document_type": "FACTURA"}, follow_redirects=True)
check("y validado sigue validado", gasto(G1).consolidation_status == "CONSOLIDADO", gasto(G1).consolidation_status)
# El enlace público del gasto (el proveedor sube el documento él mismo).
G6 = alta(BAG, "Transporte", con_factura=False)
token = A._make_bag_expense_upload_token(G6)
r = anon.post("/public/bolsas/gastos/documento/%s" % token, data={"document": pdf("transporte.pdf")},
              content_type="multipart/form-data")
g = gasto(G6)
check("por el enlace público entra la factura", r.status_code == 200 and bool(g.attachment_url), (r.status_code, g.attachment_url))
check("y queda POR VALIDAR", g.consolidation_status == "PENDIENTE_VALIDAR", g.consolidation_status)
check("sin pasar a pendiente de pago", G6 not in en_pago())
# Una acción de MARKETING: la acción se consolida con su documento, el gasto lo valida administración.
s = models.SessionLocal()
try:
    promo = models.Promotion(kind="MARKETING", name="Campaña", subject_type="ARTIST", subject_id=A.to_uuid(ART),
                             artist_ids=[ART], company_id=A.to_uuid(EMP), snapshot={"title": "Campaña"},
                             request_kind="ACTION", action_types=["EXTERIOR"])
    s.add(promo); s.flush()
    A._ensure_promotion_bag(s, promo)
    s.flush()
    act = models.PromotionActivity(promotion_id=promo.id, activity_date=HOY, activity_kind="MARKETING",
                                   action_type="EXTERIOR", amount_gross=D("605"), amount_net=D("500"), amount_tax=D("105"))
    s.add(act); s.flush()
    gm = models.BagExpense(bag_id=promo.bag_id, category="MARKETING", concept="Vallas", amount_gross=D("605"),
                           amount_net=D("500"), amount_tax=D("105"), covered_by="BOLSA", provider_id=A.to_uuid(PROV))
    s.add(gm); s.flush()
    act.bag_expense_id = gm.id
    PROMO, ACT, GM = str(promo.id), str(act.id), str(gm.id)
    s.commit()
finally:
    s.close()
r = cli.post("/marketing/%s/acciones/%s/documento" % (PROMO, ACT), data={"document": pdf("vallas.pdf")},
             content_type="multipart/form-data", follow_redirects=True)
s = models.SessionLocal()
try:
    act = s.get(models.PromotionActivity, A.to_uuid(ACT))
    check("la acción de marketing queda consolidada con su documento", act.consolidation_status == "CONSOLIDADO", act.consolidation_status)
finally:
    s.close()
check("pero su gasto en la bolsa queda POR VALIDAR", gasto(GM).consolidation_status == "PENDIENTE_VALIDAR", gasto(GM).consolidation_status)
check("y no está en pendiente de pago", GM not in en_pago())

print("\n── 9. Contabilidad solo ve lo validado ────────────────────────────────")
s = models.SessionLocal()
try:
    with A.app.test_request_context("/"):
        filtros = {f["id"]: f for f in A._accounting_company_filters(s)} if hasattr(A, "_accounting_company_filters") else {}
    pend = filtros.get(EMP, {}).get("pending", filtros.get(EMP, {}).get("count"))
    validados = (s.query(models.BagExpense).join(models.WorkflowBag, models.WorkflowBag.id == models.BagExpense.bag_id)
                 .filter(models.WorkflowBag.company_id == A.to_uuid(EMP),
                         models.BagExpense.consolidation_status.in_(list(A.BAG_CONSOLIDATED_STATUSES))).count())
    por_validar = (s.query(models.BagExpense).filter(models.BagExpense.consolidation_status == "PENDIENTE_VALIDAR").count())
    check("hay gastos por validar que contabilidad NO cuenta", por_validar >= 3, por_validar)
    check("y lo pendiente de contabilizar de la empresa es exactamente lo VALIDADO (%d)" % validados,
          pend == validados, (pend, validados, filtros.get(EMP)))
finally:
    s.close()

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
