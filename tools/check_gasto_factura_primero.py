#!/usr/bin/env python3
"""AÑADIR UN GASTO EMPEZANDO POR LA FACTURA · prueba de regresión (sep 2026).

Lo pidió Dani: «lo primero que tiene que aparecer es subir la factura o el ticket; cuando se sube te
rellena todos los campos; si el proveedor está en nuestra base de datos se selecciona, y si le falta
algún campo —como la cuenta bancaria— se muestra en amarillo para rellenarlo y queda guardado. No
siempre hay factura, así que nada de esto es obligatorio. Y la factura se ve a la izquierda».

Con la app REAL y su propia BD (`radiogfp`, que se RECREA en cada pasada):

  1. el formulario pinta la FACTURA como PRIMER módulo, con el visor a la izquierda;
  2. al leer una factura, el proveedor se reconoce por su **CIF** (y sale elegido);
  3. también por su **CUENTA** y por su **NOMBRE**, en ese orden de preferencia;
  4. ⚠️ NUESTRO CIF y NUESTRA cuenta —que salen en toda factura que recibimos— NO se cogen;
  5. su ficha dice **qué le falta** (lo que se pinta en amarillo) y lo rellenado se **guarda en
     ella**: en el tercero, o en la SOCIEDAD si el gasto factura con ella;
  6. una cuenta inválida o NUESTRA se rechaza diciendo por qué;
  7. lo escrito en los recuadros amarillos se guarda **también al guardar el gasto**;
  8. y sin factura el gasto se crea igual: nada de esto es obligatorio.

    /tmp/python/bin/python3 tools/check_gasto_factura_primero.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, io as _io

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radiogfp"
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
A._bag_document_upload = lambda fs: ("https://x/%s" % (getattr(fs, "filename", "f") or "f"),
                                     (getattr(fs, "filename", "f") or "f"), "application/pdf")

OK, KO = [], []
NUESTRO_CIF = "A12345674"
CIF_BACKLINE = "B82165283"
IBAN_SONIDO = "ES9121000418450200051332"
IBAN_NUESTRO = "ES7921000813610123456789"
IBAN_OTRO = "ES6000491500051234567892"


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:240]) if (extra and not cond) else ""))


def pdf(lineas) -> bytes:
    """Una factura de mentira pero de VERDAD (PDF con texto, como las que llegan)."""
    from io import BytesIO
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 9)
    y = 760
    for t in lineas:
        c.drawString(40, y, t)
        y -= 16
    c.showPage()
    c.save()
    return buf.getvalue()


def detecta(datos_pdf):
    return cli.post("/api/bolsas/documento",
                    data={"document": (_io.BytesIO(datos_pdf), "factura.pdf")},
                    content_type="multipart/form-data").get_json() or {}


print("\n── 1. Semilla ─────────────────────────────────────────────────────────")
s = models.SessionLocal()
try:
    u = models.User(email="gfp@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Gfp"))
    emp = models.GroupCompany(name="33 Producciones", tax_info="33 Producciones SL · CIF %s" % NUESTRO_CIF)
    s.add(emp); s.flush()
    s.add(models.GroupCompanyBankAccount(company_id=emp.id, alias="La nuestra", iban=IBAN_NUESTRO))
    art = models.Artist(name="Los Ñus")
    # El proveedor que se reconoce por su CIF (y al que le falta TODO lo demás).
    backline = models.Promoter(nick="Backline SL", tax_id=CIF_BACKLINE)
    # El que se reconoce por su CUENTA (ya le hemos pagado alguna vez).
    sonido = models.Promoter(nick="Sonido Directo", bank_account=IBAN_SONIDO)
    # El que se reconoce por su NOMBRE.
    catering = models.Promoter(nick="Catering La Cuchara")
    # ⚠️ Y una trampa de verdad: alguien dio de alta NUESTRA empresa como tercero. Su CIF sale en
    # todas las facturas que recibimos, así que sin descartarlo el «proveedor» seríamos nosotros.
    nosotros = models.Promoter(nick="33 Producciones (tercero)", tax_id=NUESTRO_CIF)
    s.add_all([art, backline, sonido, catering, nosotros]); s.flush()
    bag = models.WorkflowBag(title="Bolsa", artist_id=art.id, bag_type="CONCIERTO",
                             status="ACTIVA", company_id=emp.id)
    s.add(bag); s.flush()
    UID, BAG = str(u.id), str(bag.id)
    BACKLINE, SONIDO, CATERING, NOSOTROS = str(backline.id), str(sonido.id), str(catering.id), str(nosotros.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10
check("la app arranca con la BD de prueba", True)

print("\n── 2. El formulario: la FACTURA es el primer módulo y el visor está ───")
html = cli.get("/bolsas/%s" % BAG).get_data(as_text=True)
i_fact, i_datos = html.find("Factura o ticket"), html.find(">Datos<")
i_prov, i_pago = html.find(">Proveedor<"), html.find("Estado del pago")
check("la pantalla de la bolsa responde", "<form" in html)
check("1º Factura o ticket", 0 < i_fact < i_datos, (i_fact, i_datos))
check("2º Datos", i_datos < i_prov, (i_datos, i_prov))
check("3º Proveedor", i_prov < i_pago, (i_prov, i_pago))
check("la factura se ve A LA IZQUIERDA (zona del visor)", "data-be-viewer" in html and "be-split" in html)
check("y la ficha del proveedor tiene su zona", "data-be-prov-card" in html and "data-be-prov-fields" in html)
check("nada es obligatorio salvo el concepto",
      html.count('name="concept"') >= 1 and "No siempre" in html)

print("\n── 3. Se reconoce al proveedor por su CIF (y NO por el nuestro) ───────")
d = detecta(pdf([
    "FACTURA  Nº de factura: 2026/0147",
    "Fecha de factura: 12/09/2026",
    "Cliente: 33 Producciones SL   NIF: %s" % NUESTRO_CIF,     # el NUESTRO va DELANTE
    "Emite: Backline SL   CIF: %s" % CIF_BACKLINE,
    "Domiciliación del cobro: %s" % IBAN_NUESTRO,              # y nuestra cuenta, también delante
    "Cuenta del proveedor: %s" % IBAN_SONIDO,
    "Base imponible: 1.000,00 EUR",
    "IVA 21%: 210,00 EUR",
    "Total a pagar: 1.210,00 EUR",
]))
check("lo lee como FACTURA", d.get("kind") == "FACTURA", d.get("kind"))
check("saca el nº", d.get("invoice_number") == "2026/0147", d.get("invoice_number"))
check("saca la fecha", d.get("issue_date") == "2026-09-12", d.get("issue_date"))
check("saca el total", (d.get("amount_gross") or "").startswith("1210"), d.get("amount_gross"))
check("⚠️ reconoce al PROVEEDOR por su CIF", (d.get("provider") or {}).get("id") == BACKLINE,
      (d.get("provider"), d.get("matched_by")))
check("y lo dice", d.get("matched_by") == "CIF", d.get("matched_by"))
check("⚠️ NO coge NUESTRO CIF (aunque va delante)", (d.get("provider") or {}).get("id") != NOSOTROS,
      d.get("provider"))
check("⚠️ NI NUESTRA cuenta: coge la del proveedor",
      A._iban_clean(d.get("bank_account") or "") == A._iban_clean(IBAN_SONIDO), d.get("bank_account"))
faltan = ((d.get("profile") or {}).get("missing") or [])
check("dice qué le falta a su ficha", "bank_account" in faltan and "fiscal_address" in faltan, faltan)
check("y no pide lo que ya tiene (su CIF)", "tax_id" not in faltan, faltan)

print("\n── 4. Por su CUENTA y por su NOMBRE ───────────────────────────────────")
d2 = detecta(pdf(["Factura 55", "Fecha: 01/09/2026", "Pago por transferencia a %s" % IBAN_SONIDO,
                  "Total a pagar: 121,00 EUR"]))
check("reconocido por la CUENTA", (d2.get("provider") or {}).get("id") == SONIDO and d2.get("matched_by") == "CUENTA",
      (d2.get("provider"), d2.get("matched_by")))
d3 = detecta(pdf(["Factura 77", "Fecha: 02/09/2026", "Catering La Cuchara",
                  "Servicio de catering", "Total a pagar: 300,00 EUR"]))
check("reconocido por el NOMBRE", (d3.get("provider") or {}).get("id") == CATERING and d3.get("matched_by") == "NOMBRE",
      (d3.get("provider"), d3.get("matched_by")))
d4 = detecta(pdf(["Factura 88", "Fecha: 03/09/2026", "Proveedor que no tenemos SL",
                  "Total a pagar: 50,00 EUR"]))
check("si no lo tenemos, no se inventa nadie", not (d4.get("provider") or {}).get("id"), d4.get("provider"))

print("\n── 5. Su ficha: lo que falta se rellena y QUEDA GUARDADO ──────────────")
r = cli.get("/api/bolsas/proveedor/ficha?id=%s" % BACKLINE).get_json() or {}
check("la ficha dice lo que hay y lo que falta", r.get("ok") and "bank_account" in (r.get("missing") or []), r)
r = cli.post("/api/bolsas/proveedor/ficha", data={
    "provider_id": BACKLINE, "prov_email": "admin@backline.es", "prov_phone": "600111222",
    "prov_fiscal_address": "Calle Mayor 1", "prov_fiscal_postal_code": "28013",
    "prov_fiscal_city": "Madrid", "prov_fiscal_province": "Madrid",
    "bank_account": IBAN_SONIDO}).get_json() or {}
check("se guarda y la ficha queda completa", r.get("ok") and r.get("complete"), r.get("missing"))
s = models.SessionLocal()
try:
    p = s.get(models.Promoter, A.to_uuid(BACKLINE))
    check("⚠️ y de verdad está en SU ficha", A._iban_is_valid(p.bank_account or "")
          and (p.contact_email or "") == "admin@backline.es" and (p.fiscal_city or "") == "Madrid",
          (p.bank_account, p.contact_email, p.fiscal_city))
finally:
    s.close()

print("\n── 6. Una cuenta que no vale, o que es NUESTRA, se rechaza ────────────")
r = cli.post("/api/bolsas/proveedor/ficha", data={"provider_id": CATERING, "bank_account": "ES00 0000"})
check("una cuenta inválida se rechaza", r.status_code == 400 and "no es válido" in (r.get_json() or {}).get("error", "").lower(),
      r.get_json())
r = cli.post("/api/bolsas/proveedor/ficha", data={"provider_id": CATERING, "bank_account": IBAN_NUESTRO})
check("una cuenta NUESTRA se rechaza", r.status_code == 400 and "nuestra" in (r.get_json() or {}).get("error", "").lower(),
      r.get_json())
# ⚠️ «12345678Z» SÍ es válido (es el DNI de ejemplo de toda la vida): el que no vale es el mismo
# número con otra letra, y eso es justo lo que hay que cazar (la letra es el control del módulo 23).
r = cli.post("/api/bolsas/proveedor/ficha", data={"provider_id": CATERING, "prov_tax_id": "12345678A"})
check("un CIF/NIF con la letra cambiada se rechaza", r.status_code == 400, r.get_json())
r = cli.post("/api/bolsas/proveedor/ficha", data={"provider_id": CATERING, "prov_tax_id": "12345678Z"})
check("y uno bueno se guarda", (r.get_json() or {}).get("ok"), r.get_json())

print("\n── 7. Si factura una SOCIEDAD, la ficha que se completa es la de ELLA ─")
s = models.SessionLocal()
try:
    soc = models.PromoterCompany(promoter_id=A.to_uuid(CATERING), legal_name="La Cuchara Servicios SL")
    s.add(soc); s.flush()
    SOC = str(soc.id)
    s.commit()
finally:
    s.close()
r = cli.get("/api/bolsas/proveedor/ficha?id=%s&company_id=%s" % (CATERING, SOC)).get_json() or {}
check("la ficha es la de la sociedad", r.get("company_id") == SOC and "bank_account" in (r.get("missing") or []), r)
r = cli.post("/api/bolsas/proveedor/ficha", data={"provider_id": CATERING, "company_id": SOC,
                                                  "bank_account": IBAN_OTRO, "prov_tax_id": CIF_BACKLINE})
check("se guarda", (r.get_json() or {}).get("ok"), r.get_json())
s = models.SessionLocal()
try:
    soc = s.get(models.PromoterCompany, A.to_uuid(SOC))
    ter = s.get(models.Promoter, A.to_uuid(CATERING))
    check("⚠️ la cuenta va a la SOCIEDAD (es de donde sale el pago)",
          A._iban_clean(soc.bank_account or "") == A._iban_clean(IBAN_OTRO), soc.bank_account)
    check("y el tercero se queda como estaba", not (ter.bank_account or ""), ter.bank_account)
finally:
    s.close()

print("\n── 8. Lo escrito en amarillo se guarda TAMBIÉN al guardar el gasto ────")
r = cli.post("/bolsas/%s/expenses" % BAG, data={
    "category": "PRODUCCION", "concept": "Backline", "amount_value": "1.210", "amount_mode": "GROSS",
    "provider_id": SONIDO, "document_type": "FACTURA", "bank_account": IBAN_SONIDO,
    "prov_email": "hola@sonidodirecto.es", "prov_fiscal_city": "Bilbao",
    "document": (_io.BytesIO(pdf(["Factura 99", "Total a pagar: 1.210,00 EUR"])), "f.pdf"),
}, content_type="multipart/form-data", follow_redirects=True)
s = models.SessionLocal()
try:
    p = s.get(models.Promoter, A.to_uuid(SONIDO))
    gastos = s.query(models.BagExpense).filter(models.BagExpense.bag_id == A.to_uuid(BAG)).all()
    check("el gasto se crea", len(gastos) == 1, [g.concept for g in gastos])
    check("⚠️ y los datos del proveedor quedan en su ficha",
          (p.contact_email or "") == "hola@sonidodirecto.es" and (p.fiscal_city or "") == "Bilbao",
          (p.contact_email, p.fiscal_city))
finally:
    s.close()

print("\n── 9. SIN factura el gasto se crea igual (no es obligatoria) ──────────")
cli.post("/bolsas/%s/expenses" % BAG, data={
    "category": "OTROS", "concept": "Sin factura", "amount_value": "50", "amount_mode": "GROSS",
    "document_type": "SIN_DOCUMENTO"}, content_type="multipart/form-data", follow_redirects=True)
s = models.SessionLocal()
try:
    gastos = s.query(models.BagExpense).filter(models.BagExpense.bag_id == A.to_uuid(BAG)).all()
    check("se crea sin pedir nada más", len(gastos) == 2, [g.concept for g in gastos])
finally:
    s.close()

print("\n── 10. La ficha del gasto se abre sin error (las dos pestañas) ────────")
for url in ("/bolsas/%s" % BAG, "/bolsas/%s?tab=gastos" % BAG):
    check("responde %s" % url, cli.get(url).status_code == 200)

print("\n═══════════════════════════════════════════════════════════════════════")
print("  %d bien · %d mal" % (len(OK), len(KO)))
if KO:
    print("  Falla: " + " · ".join(KO))
sys.exit(1 if KO else 0)
