#!/usr/bin/env python3
"""EL PLAN DE PAGOS DE UNA ACTIVIDAD · prueba de regresión (sep 2026).

Lo que se cobra de una actividad no es solo el caché. Esta prueba cubre, con la app REAL y su
propia BD de prueba (`radioequipos`, que se RECREA en cada pasada), los EQUIPOS que se le facturan
al promotor cuando es él quien los cubre:

  1. con «Promotor cubre equipos» + «Sí, se le factura» + importe, la línea entra en el PLAN DE
     PAGOS como un cobro más, con su marca (no es caché);
  2. cambiar el importe ACTUALIZA esa línea (no crea otra) y conserva su factura/cobro;
  3. decir que NO la retira… salvo que ya esté facturada o cobrada;
  4. ese importe NO se reparte con el artista (`_artist_cash_concert_settled`);
  5. y guardar la sección «Cachés» desde la ficha NO se la lleva por delante.

    /tmp/python/bin/python3 tools/check_plan_pagos.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, decimal

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_DSN = "postgresql://postgres@127.0.0.1:54329/radioequipos?sslmode=disable"
_BD = "radioequipos"
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
os.environ["DATABASE_URL"] = _DSN
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
AYER = HOY - datetime.timedelta(days=15)
OK, KO = [], []


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:220]) if (extra and not cond) else ""))


print("\n── 1. Semilla ─────────────────────────────────────────────────────────")
s = models.SessionLocal()
try:
    u = models.User(email="eq@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Equipos"))
    emp = models.GroupCompany(name="33 Producciones")
    art = models.Artist(name="Los Ñus")
    ven = models.Venue(name="Sala Prueba", municipality="Sevilla", province="Sevilla")
    s.add_all([emp, art, ven]); s.flush()
    c = models.Concert(artist_id=art.id, venue_id=ven.id, date=AYER, sale_type="VENDIDO",
                       capacity=500, activity_type="CONCIERTO", status="CONFIRMADO",
                       payment_terms_json=[{"concept": "Caché", "amount": 9000}])
    s.add(c); s.flush()
    s.add(models.ConcertCache(concert_id=c.id, kind="FIXED", amount=D("9000")))
    UID, CID, AID = str(u.id), str(c.id), str(art.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10


def guarda_equipamiento(**extra):
    datos = {"equipment_option": "PROMOTER"}
    datos.update(extra)
    return cli.post("/conciertos/%s/seccion/equipamiento" % CID, data=datos, follow_redirects=True)


def plan():
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        return list(c.payment_terms_json or [])
    finally:
        s.close()


print("\n── 2. «Sí, se le factura» mete su línea en el plan de pagos ───────────")
guarda_equipamiento(equipment_billed="1", equipment_billed_amount="1.500,00")
filas = plan()
equipos = [f for f in filas if (f.get("kind") or "") == "EQUIPMENT"]
check("la línea de los equipos entra en el plan de pagos", len(equipos) == 1, filas)
check("con su importe (1.500, leído a la española)", equipos and A._money_value(equipos[0].get("amount")) == D("1500"),
      equipos and equipos[0].get("amount"))
check("y con su concepto", equipos and equipos[0].get("concept") == "Equipos", equipos and equipos[0].get("concept"))
check("el caché sigue estando", any((f.get("kind") or "") != "EQUIPMENT" for f in filas), filas)
s = models.SessionLocal()
try:
    eq = s.query(models.ConcertEquipment).filter_by(concert_id=A.to_uuid(CID)).first()
    check("y queda apuntado en el equipamiento", eq is not None and eq.billed_to_promoter is True
          and A._money_value(eq.billed_amount) == D("1500"), eq and (eq.billed_to_promoter, eq.billed_amount))
finally:
    s.close()

print("\n── 3. Cambiar el importe ACTUALIZA la línea, no crea otra ─────────────")
guarda_equipamiento(equipment_billed="1", equipment_billed_amount="2.000")
filas = plan()
equipos = [f for f in filas if (f.get("kind") or "") == "EQUIPMENT"]
check("sigue habiendo UNA sola línea de equipos", len(equipos) == 1, filas)
check("con el importe nuevo", equipos and A._money_value(equipos[0].get("amount")) == D("2000"),
      equipos and equipos[0].get("amount"))

print("\n── 4. NO se reparte con el artista ────────────────────────────────────")
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        importe, de_donde, cobrado = A._artist_cash_concert_settled(c)
        check("el importe que se reparte es el del caché (9.000), no 11.000",
              importe == D("9000"), (importe, de_donde))
        filas_vista = A._concert_payment_rows(c)
        check("pero la línea de equipos SÍ se ve en el plan de pagos",
              any(r.get("is_equipment") for r in filas_vista), [r.get("concept") for r in filas_vista])
        check("y el total del plan sí la incluye (es un cobro más)",
              sum((A._money_or_zero(r["amount"]) for r in filas_vista), D("0")) == D("11000"),
              [r["amount"] for r in filas_vista])
    finally:
        s.close()

print("\n── 5. Guardar «Cachés» desde la ficha NO se la lleva por delante ──────")
cli.post("/conciertos/%s/seccion/caches" % CID, data={
    "cache_kind[]": "FIXED", "cache_amount[]": "9.000", "cache_concept[]": "",
    "payment_terms_present": "1",
    "payment_concept[]": "Caché", "payment_amount[]": "9.000", "payment_due_date[]": "", "payment_idx[]": "0",
    "promoter_costs_present": "1",
}, follow_redirects=True)
filas = plan()
equipos = [f for f in filas if (f.get("kind") or "") == "EQUIPMENT"]
check("la línea de equipos sigue ahí tras guardar los cachés", len(equipos) == 1, filas)
check("y con su importe intacto", equipos and A._money_value(equipos[0].get("amount")) == D("2000"),
      equipos and equipos[0].get("amount"))

print("\n── 6. Decir que NO la retira… salvo que ya esté cobrada ───────────────")
guarda_equipamiento(equipment_billed="0")
filas = plan()
check("al decir que no, la línea se retira",
      not [f for f in filas if (f.get("kind") or "") == "EQUIPMENT"], filas)
# Y ahora con rastro: se factura, se cobra y se intenta quitar.
guarda_equipamiento(equipment_billed="1", equipment_billed_amount="800")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    filas = list(c.payment_terms_json or [])
    for f in filas:
        if (f.get("kind") or "") == "EQUIPMENT":
            f["collected_at"] = "2026-09-01"
    c.payment_terms_json = filas
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(c, "payment_terms_json")
    s.commit()
finally:
    s.close()
guarda_equipamiento(equipment_billed="0")
filas = plan()
equipos = [f for f in filas if (f.get("kind") or "") == "EQUIPMENT"]
check("una línea YA COBRADA no se borra (eso ya ha pasado)", len(equipos) == 1, filas)

print("\n── 7. La pantalla lo dice ─────────────────────────────────────────────")
html = cli.get("/conciertos/%s?tab=general" % CID).get_data(as_text=True)
check("la ficha abre (200)", "Equipamiento" in html)
check("el plan de pagos marca la línea como «no es caché»", "No es caché" in html, )
check("y el módulo de equipamiento pregunta si se le factura",
      "¿Hay que facturarle los equipos al promotor?" in html)

print("\n── 8. LOS SOCIOS: cada uno cubre su parte del caché ───────────────────")
# La actividad pasa a PARTICIPADOS: nuestra empresa (60%) y dos socios (30% y 10%).
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    c.sale_type = "PARTICIPADOS"
    emp = s.query(models.GroupCompany).first()
    socio1 = models.Promoter(nick="Socio Uno")
    socio2 = models.Promoter(nick="Socio Dos")
    s.add_all([socio1, socio2]); s.flush()
    S1, S2, EMP = str(socio1.id), str(socio2.id), str(emp.id)
    s.add(models.ConcertCompanyShare(concert_id=c.id, company_id=emp.id, pct=60, pct_base="PROFIT"))
    s.add(models.ConcertPromoterShare(concert_id=c.id, promoter_id=socio1.id, pct=30, pct_base="PROFIT"))
    s.add(models.ConcertPromoterShare(concert_id=c.id, promoter_id=socio2.id, pct=10, pct_base="PROFIT"))
    s.commit()
finally:
    s.close()

with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        filas = A._concert_cache_partner_rows(s, c)
        check("se reparte entre los tres socios", len(filas) == 3, [f["name"] for f in filas])
        por_nombre = {f["name"]: f for f in filas}
        check("de entrada, cada uno cubre lo que participa (60/30/10 de 9.000)",
              por_nombre["33 Producciones"]["amount"] == D("5400.00")
              and por_nombre["Socio Uno"]["amount"] == D("2700.00")
              and por_nombre["Socio Dos"]["amount"] == D("900.00"),
              {k: str(v["amount"]) for k, v in por_nombre.items()})
        check("y lo de NUESTRA empresa está marcado como propio",
              por_nombre["33 Producciones"]["own"] is True)
    finally:
        s.close()

# Se activa desde la ficha (sección Cachés), con el centinela.
cli.post("/conciertos/%s/seccion/caches" % CID, data={
    "cache_partner_present": "1", "cache_partner_split": "1",
    "cache_kind[]": "FIXED", "cache_amount[]": "9.000", "cache_concept[]": "",
    "payment_terms_present": "1",
    "payment_concept[]": "Caché", "payment_amount[]": "9.000", "payment_due_date[]": "", "payment_idx[]": "0",
}, follow_redirects=True)
filas = plan()
socios = [f for f in filas if (f.get("kind") or "") == "PARTNER"]
check("se crea una línea por SOCIO (no por nuestra empresa)", len(socios) == 2,
      [(f.get("concept"), f.get("amount")) for f in filas])
check("con su parte del caché (2.700 y 900)",
      sorted(A._money_value(f["amount"]) for f in socios) == [D("900.00"), D("2700.00")],
      [f.get("amount") for f in socios])
check("⚠️ lo de nuestra empresa NO aparece como pendiente de cobro",
      not any("33 Producciones" in (f.get("concept") or "") for f in filas),
      [f.get("concept") for f in filas])

# Se cambia lo que cubre un socio: a mano, 3.000 €.
cli.post("/conciertos/%s/seccion/caches" % CID, data={
    "cache_partner_present": "1", "cache_partner_split": "1",
    "partner_cache_amount_PROMOTER_%s" % S1: "3.000",
    "cache_kind[]": "FIXED", "cache_amount[]": "9.000", "cache_concept[]": "",
    "payment_terms_present": "1",
    "payment_concept[]": "Caché", "payment_amount[]": "9.000", "payment_due_date[]": "", "payment_idx[]": "0",
}, follow_redirects=True)
filas = plan()
socios = [f for f in filas if (f.get("kind") or "") == "PARTNER"]
check("cambiar lo que cubre un socio ACTUALIZA su línea (no crea otra)", len(socios) == 2,
      [(f.get("concept"), f.get("amount")) for f in socios])
check("con el importe escrito a mano (3.000)",
      any(A._money_value(f["amount"]) == D("3000") for f in socios), [f.get("amount") for f in socios])

with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        importe, de_donde, _cob = A._artist_cash_concert_settled(c)
        check("⚠️ lo que se reparte con el ARTISTA sigue siendo el caché (9.000), no las partes",
              importe == D("9000"), (importe, de_donde))
    finally:
        s.close()

# Y al desmarcarlo, las líneas se retiran.
cli.post("/conciertos/%s/seccion/caches" % CID, data={
    "cache_partner_present": "1",
    "cache_kind[]": "FIXED", "cache_amount[]": "9.000", "cache_concept[]": "",
    "payment_terms_present": "1",
    "payment_concept[]": "Caché", "payment_amount[]": "9.000", "payment_due_date[]": "", "payment_idx[]": "0",
}, follow_redirects=True)
filas = plan()
check("al desmarcarlo, las líneas de los socios se retiran",
      not [f for f in filas if (f.get("kind") or "") == "PARTNER"], filas)
check("y el caché y los equipos siguen ahí", len(filas) == 2, filas)

html = cli.get("/conciertos/%s?tab=general" % CID).get_data(as_text=True)
check("la ficha pregunta si el caché lo cubren los socios", "El caché lo cubren los socios" in html)
check("y dice que lo nuestro no se cobra", "Nuestra: no se cobra" in html)

print("\n── 9. El aviso de «forma de pago» no reclama lo que es NUESTRO ────────")
# Con el reparto puesto: solo hay que cobrar la parte de los socios (3.000 + 900 de 9.000).
cli.post("/conciertos/%s/seccion/caches" % CID, data={
    "cache_partner_present": "1", "cache_partner_split": "1",
    "partner_cache_amount_PROMOTER_%s" % S1: "3.000",
    "cache_kind[]": "FIXED", "cache_amount[]": "9.000", "cache_concept[]": "",
    "payment_terms_present": "1",
}, follow_redirects=True)
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        est = A._concert_cache_payment_state(s, c)
        check("lo que hay que repartir es solo la parte de los socios (9.000 − 5.400)",
              est["cache_total"] == D("3600.00"), (est["cache_total"], est.get("own_total")))
        check("y lo nuestro se cuenta aparte", est.get("own_total") == D("5400.00"), est.get("own_total"))
        check("⚠️ los EQUIPOS no cuentan como caché configurado",
              est["configured_total"] == D("3900.00"), est["configured_total"])
    finally:
        s.close()

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
