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

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
