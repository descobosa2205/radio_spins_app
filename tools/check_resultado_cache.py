#!/usr/bin/env python3
"""EL RESULTADO DE UNA ACTIVIDAD CON CACHÉ · prueba de regresión (sep 2026).

Lo pidió Dani: «solo muestra la proyección sobre el aforo y la barra de simulación cuando es una
actividad en la que nosotros (una empresa del grupo) somos la promotora y hay venta de entradas; si
no, se muestra un resumen provisional de resultado en el que se tiene en cuenta el caché: el % que
le corresponde a la oficina según contrato sobre el caché SIN IVA, y para el artista el caché menos
la comisión de la oficina, los gastos configurados y los comisionistas — y si el comisionista es
sobre el fee de la oficina, se descuenta de nuestra parte».

Con la app REAL y su propia BD (`radiores`, que se RECREA en cada pasada):

  1. una fecha VENDIDA a un promotor enseña el **resumen del caché**, no la barra ni la proyección;
  2. las cuentas salen EXACTAS: oficina = % del contrato · artista = caché − oficina − gastos −
     comisionistas;
  3. ⚠️ una comisión **sobre el fee de la oficina** se descuenta de NUESTRA parte, no del artista;
  4. una comisión que REDUCE el caché se descuenta ANTES de repartir;
  5. sin contrato del artista no se inventa ningún %: se dice «sin contrato» y el caché es suyo;
  6. los gastos son los configurados, y manda la BOLSA consolidada sobre el presupuesto;
  7. una actividad PROPIA con venta de entradas sigue enseñando la proyección y la barra;
  8. una propia SIN ticketing (o GRATUITA) cae al resumen del caché en vez de quedarse en blanco.

    /tmp/python/bin/python3 tools/check_resultado_cache.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, decimal

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radiores"
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
OK, KO = [], []
HOY = datetime.date.today()


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:240]) if (extra and not cond) else ""))


def eur(x):
    return A._money_value(x or 0).quantize(D("0.01"))


print("\n── 1. Semilla ─────────────────────────────────────────────────────────")
s = models.SessionLocal()
try:
    u = models.User(email="res@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Res"))
    emp = models.GroupCompany(name="33 Producciones")
    art = models.Artist(name="El Ñu")
    ven = models.Venue(name="Sala Ñu", municipality="Madrid")
    com1 = models.Promoter(nick="Comisionista de zona")
    com2 = models.Promoter(nick="Agente de la oficina")
    s.add_all([emp, art, ven, com1, com2]); s.flush()
    # EL CONTRATO del artista: 80 / 20 en conciertos.
    contrato = models.ArtistContract(artist_id=art.id, name="Booking", signed_date=HOY - datetime.timedelta(days=365))
    s.add(contrato); s.flush()
    s.add(models.ArtistContractCommitment(contract_id=contrato.id, concept="Conciertos",
                                          pct_artist=80, pct_office=20, base="GROSS"))
    # ── LA FECHA VENDIDA a un promotor: caché 10.000 € (sin IVA), sin taquilla nuestra.
    vendida = models.Concert(artist_id=art.id, venue_id=ven.id, date=HOY + datetime.timedelta(days=30),
                             status="CONFIRMADO", activity_type="CONCIERTO", sale_type="VENDIDO",
                             capacity=1000, created_by_user_id=u.id)
    s.add(vendida); s.flush()
    s.add(models.ConcertCache(concert_id=vendida.id, kind="FIXED", amount=10000))
    # Gastos configurados: presupuesto de 1.200 €.
    s.add(models.ConcertBudgetItem(concert_id=vendida.id, category="PRODUCCION",
                                   concept="Backline", amount_net=1200))
    # Un comisionista SOBRE EL FEE DE LA OFICINA (10%) y otro fijo sobre el caché (300 €).
    s.add(models.ConcertZoneAgent(concert_id=vendida.id, promoter_id=com2.id, commission_type="PERCENT",
                                  commission_pct=10, commission_base="OFFICE", apply_mode="EXPENSE"))
    s.add(models.ConcertZoneAgent(concert_id=vendida.id, promoter_id=com1.id, commission_type="AMOUNT",
                                  commission_amount=300, commission_base="GROSS", apply_mode="EXPENSE"))
    # ── LA FECHA PROPIA con venta de entradas (la proyección de siempre).
    propia = models.Concert(artist_id=art.id, venue_id=ven.id, date=HOY + datetime.timedelta(days=40),
                            status="CONFIRMADO", activity_type="CONCIERTO", sale_type="EMPRESA",
                            capacity=1000, group_company_id=emp.id, created_by_user_id=u.id)
    s.add(propia); s.flush()
    s.add(models.ConcertTicketType(concert_id=propia.id, name="General", qty_for_sale=1000, price=22))
    s.add(models.ConcertCache(concert_id=propia.id, kind="FIXED", amount=6000))
    # ── UNA PROPIA SIN TICKETING (todavía sin configurar la venta).
    sin_venta = models.Concert(artist_id=art.id, venue_id=ven.id, date=HOY + datetime.timedelta(days=50),
                               status="RESERVADO", activity_type="CONCIERTO", sale_type="EMPRESA",
                               capacity=500, group_company_id=emp.id, created_by_user_id=u.id)
    s.add(sin_venta); s.flush()
    s.add(models.ConcertCache(concert_id=sin_venta.id, kind="FIXED", amount=4000))
    UID, VENDIDA, PROPIA, SIN_VENTA = str(u.id), str(vendida.id), str(propia.id), str(sin_venta.id)
    ART = str(art.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10
check("la app arranca con la BD de prueba", True)


def resumen(cid):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(cid))
        with A.app.test_request_context("/"):
            return A._concert_cache_result(s, c), A._concert_result_mode(s, c)
    finally:
        s.close()


print("\n── 2. Una fecha VENDIDA no enseña la proyección, sino el caché ────────")
rc, modo = resumen(VENDIDA)
check("el modo es CACHÉ", modo == "CACHE", modo)
html = cli.get("/conciertos/%s?tab=resultado" % VENDIDA).get_data(as_text=True)
check("la pestaña abre (200)", "Resumen provisional del resultado" in html)
check("⚠️ NO sale la tabla de % de aforo", "% aforo" not in html)
check("⚠️ NI la barra de reparto por socios", "data-sim-partners" not in html)
check("y se explica por qué", "no se cobra en taquilla" in html)

print("\n── 3. Las cuentas, exactas ────────────────────────────────────────────")
# caché 10.000 · oficina 20% = 2.000 · comisión sobre NUESTRO fee 10% = 200 → oficina 1.800
# artista = 10.000 − 2.000 − 1.200 (presupuesto) − 300 (comisionista) = 6.500
check("el caché es el configurado (sin IVA)", eur(rc["cache_net"]) == D("10000.00"), rc["cache_net"])
check("la comisión de la oficina es su % del contrato", eur(rc["office_fee"]) == D("2000.00"), rc["office_fee"])
check("⚠️ la comisión SOBRE NUESTRO FEE sale de la oficina",
      eur(rc["commissions"]["office_total"]) == D("200.00"), rc["commissions"]["office_total"])
check("y la otra, del caché del artista",
      eur(rc["commissions"]["artist_total"]) == D("300.00"), rc["commissions"]["artist_total"])
check("los gastos son los configurados", eur(rc["expenses"]) == D("1200.00"), rc["expenses"])
check("⚠️ resultado potencial OFICINA = 1.800 €", eur(rc["office_result"]) == D("1800.00"), rc["office_result"])
check("⚠️ resultado potencial ARTISTA = 6.500 €", eur(rc["artist_result"]) == D("6500.00"), rc["artist_result"])
check("y el balance suma los dos", eur(rc["total_result"]) == D("8300.00"), rc["total_result"])
check("la pantalla enseña las dos cifras", "1.800,00" in html and "6.500,00" in html)
check("y dice el % del contrato", "20" in html and "según contrato" in html)

print("\n── 4. Una comisión que REDUCE el caché se descuenta antes ─────────────")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(VENDIDA))
    s.add(models.ConcertZoneAgent(concert_id=c.id, promoter_id=A.to_uuid(str(c.zone_agents[0].promoter_id)),
                                  commission_type="AMOUNT", commission_amount=1000,
                                  commission_base="GROSS", apply_mode="REDUCE"))
    s.commit()
finally:
    s.close()
rc2, _ = resumen(VENDIDA)
check("el caché que llega baja", eur(rc2["cache_net"]) == D("9000.00"), rc2["cache_net"])
check("y el reparto se hace sobre ESE", eur(rc2["office_fee"]) == D("1800.00"), rc2["office_fee"])
check("se dice cuánto reduce", eur(rc2["reduction"]) == D("1000.00"), rc2["reduction"])

print("\n── 5. Sin contrato NO se inventa ningún porcentaje ────────────────────")
s = models.SessionLocal()
try:
    for m in s.query(models.ArtistContractCommitment).all():
        s.delete(m)
    s.commit()
finally:
    s.close()
rc3, _ = resumen(VENDIDA)
check("la oficina se queda a cero", eur(rc3["office_fee"]) == D("0.00"), rc3["office_fee"])
check("⚠️ y se dice que falta el contrato", rc3["no_contract"], rc3["contract_label"])
html3 = cli.get("/conciertos/%s?tab=resultado" % VENDIDA).get_data(as_text=True)
check("la pantalla lo avisa", "no tiene contrato" in html3)
s = models.SessionLocal()
try:
    contrato = s.query(models.ArtistContract).first()
    s.add(models.ArtistContractCommitment(contract_id=contrato.id, concept="Conciertos",
                                          pct_artist=80, pct_office=20, base="GROSS"))
    s.commit()
finally:
    s.close()

print("\n── 6. Los gastos: manda la BOLSA consolidada sobre el presupuesto ─────")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(VENDIDA))
    bag = models.WorkflowBag(title="Bolsa", linked_type="CONCERT", linked_id=c.id, status="ACTIVA",
                             artist_id=A.to_uuid(ART))
    s.add(bag); s.flush()
    s.add(models.BagExpense(bag_id=bag.id, concept="Sonido", amount_net=2000, amount_gross=2420,
                            consolidation_status="CONSOLIDADO", category="PRODUCCION"))
    s.add(models.BagExpense(bag_id=bag.id, concept="Sin factura", amount_net=500, amount_gross=605,
                            consolidation_status="PENDIENTE", category="OTROS"))
    s.commit()
finally:
    s.close()
rc4, _ = resumen(VENDIDA)
check("manda lo consolidado de la bolsa", eur(rc4["expenses"]) == D("2000.00"), rc4["expenses"])
check("y se dice de dónde sale", rc4["expenses_source"] == "BOLSA", rc4["expenses_source"])

print("\n── 7. Una PROPIA con venta sigue con su proyección y su barra ─────────")
rc5, modo5 = resumen(PROPIA)
check("el modo es TAQUILLA", modo5 == "TAQUILLA", modo5)
h5 = cli.get("/conciertos/%s?tab=resultado" % PROPIA).get_data(as_text=True)
check("sale la tabla de % de aforo", "% aforo" in h5)
check("y el reparto por socios con su barra", "data-sim-partners" in h5)
check("no sale el resumen de caché", "Resumen provisional del resultado" not in h5)

print("\n── 8. Una propia SIN ticketing cae al resumen del caché ───────────────")
rc6, modo6 = resumen(SIN_VENTA)
check("el modo es CACHÉ", modo6 == "CACHE", modo6)
h6 = cli.get("/conciertos/%s?tab=resultado" % SIN_VENTA).get_data(as_text=True)
check("y enseña el resumen (no una pantalla vacía)", "Resumen provisional del resultado" in h6)
check("con su caché", "4.000,00" in h6)
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(PROPIA))
    c.sale_type = "GRATUITO"
    s.commit()
finally:
    s.close()
_, modo7 = resumen(PROPIA)
check("una GRATUITA también (no se vende nada)", modo7 == "CACHE", modo7)

print("\n═══════════════════════════════════════════════════════════════════════")
print("  %d bien · %d mal" % (len(OK), len(KO)))
if KO:
    print("  Falla: " + " · ".join(KO))
sys.exit(1 if KO else 0)
