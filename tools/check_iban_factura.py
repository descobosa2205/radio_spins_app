#!/usr/bin/env python3
"""NINGUNA FACTURA LLEGA A PAGO SIN NÚMERO DE CUENTA · prueba de regresión (sep 2026).

Lo pidió Dani: «cuando se sube la factura por parte de cualquier tercero tiene que quedar fijado el
número de cuenta; no pueden llegar las facturas a pago sin tenerlo». La landing pública ya lo
exigía, pero **subiendo la factura desde el formulario del gasto** no — y de ahí salían los gastos
que llegaban a «pendiente de pago» sin IBAN.

Con la app REAL y su propia BD (`radioiban`, que se RECREA en cada pasada):

  1. un gasto CON FACTURA y sin cuenta **no se guarda**, y se dice de quién falta;
  2. poniéndola en el formulario, se guarda **y queda fijada en la ficha del tercero** (no hay que
     volver a escribirla nunca);
  3. una cuenta que no vale (mod-97) o que es NUESTRA se rechaza diciendo por qué;
  4. si factura una SOCIEDAD, la cuenta se guarda en la sociedad (que es de donde sale el pago);
  5. sin factura todavía **no se exige** (el gasto aún no va a pago), y lo que cubre el artista o el
     promotor tampoco;
  6. y lo que de verdad importa: con la cuenta puesta, el gasto llega a «pendiente de pago» **sin
     que le falte nada** (`sepa_check_payment`).

    /tmp/python/bin/python3 tools/check_iban_factura.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, decimal, io as _io

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radioiban"
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
# Sin Storage: lo que se prueba es la cuenta, no la subida.
A._bag_document_upload = lambda fs: ("https://x/%s" % (getattr(fs, "filename", "f") or "f"),
                                     (getattr(fs, "filename", "f") or "f"), "application/pdf")
A._invoice_iban_from_upload = lambda fs: ""      # la factura de la prueba NO trae IBAN dentro
D = decimal.Decimal
HOY = datetime.date.today()
OK, KO = [], []
IBAN_OK = "ES9121000418450200051332"
IBAN_MALO = "ES0000000000000000000000"
IBAN_NUESTRO = "ES7921000813610123456789"


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:220]) if (extra and not cond) else ""))


def pdf():
    return (_io.BytesIO(b"%PDF-1.4 factura"), "factura.pdf")


print("\n── 1. Semilla ─────────────────────────────────────────────────────────")
s = models.SessionLocal()
try:
    u = models.User(email="iban@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Iban"))
    emp = models.GroupCompany(name="33 Producciones")
    s.add(emp); s.flush()
    # Una cuenta NUESTRA, para comprobar que no se acepta como la del que cobra.
    s.add(models.GroupCompanyBankAccount(company_id=emp.id, alias="La nuestra", iban=IBAN_NUESTRO))
    art = models.Artist(name="Los Ñus")
    prov = models.Promoter(nick="Backline SL")
    s.add_all([art, prov]); s.flush()
    bag = models.WorkflowBag(title="Bolsa", artist_id=art.id, bag_type="CONCIERTO",
                             status="ACTIVA", company_id=emp.id)
    s.add(bag); s.flush()
    UID, BAG, PROV = str(u.id), str(bag.id), str(prov.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10


def gasto_nuevo(**extra):
    datos = {"category": "PRODUCCION", "concept": "Backline", "amount_value": "1.210",
             "amount_mode": "GROSS", "provider_id": PROV, "document_type": "FACTURA"}
    datos.update(extra)
    return cli.post("/bolsas/%s/expenses" % BAG, data=datos,
                    content_type="multipart/form-data", follow_redirects=True)


def gastos():
    s = models.SessionLocal()
    try:
        return (s.query(models.BagExpense).filter(models.BagExpense.bag_id == A.to_uuid(BAG))
                .order_by(models.BagExpense.created_at.asc()).all())
    finally:
        s.close()


def iban_del(pid):
    s = models.SessionLocal()
    try:
        return (s.get(models.Promoter, A.to_uuid(pid)).bank_account or "")
    finally:
        s.close()


print("\n── 2. Con factura y SIN cuenta, no se guarda ──────────────────────────")
r = gasto_nuevo(document=pdf())
html = r.get_data(as_text=True)
check("no se ha creado el gasto", not gastos(), [(g.concept, g.attachment_url) for g in gastos()])
check("y se dice que falta el número de cuenta", "falta el número de cuenta" in html.lower(), )
check("diciendo de QUIÉN", "Backline SL" in html)

print("\n── 3. Con la cuenta puesta, se guarda y queda FIJADA en su ficha ──────")
r = gasto_nuevo(document=pdf(), bank_account=IBAN_OK)
check("el gasto se crea", len(gastos()) == 1, [g.concept for g in gastos()])
check("⚠️ y la cuenta queda en la ficha del tercero", A._iban_is_valid(iban_del(PROV)), iban_del(PROV))
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        g = gastos()[0]
        g = s.get(models.BagExpense, g.id)
        ben = A._expense_beneficiary(s, g)
        check("el pago sabe a qué cuenta va", A._iban_is_valid(ben["iban"]), ben)
        check("y no le falta nada para la remesa",
              not A.sepa_check_payment({"name": ben["name"], "iban": ben["iban"],
                                        "bic": ben["bic"], "amount": D("1210")}),
              A.sepa_check_payment({"name": ben["name"], "iban": ben["iban"],
                                    "bic": ben["bic"], "amount": D("1210")}))
    finally:
        s.close()

print("\n── 4. Una cuenta que no vale, o que es NUESTRA, se rechaza ────────────")
s = models.SessionLocal()
try:
    p = s.get(models.Promoter, A.to_uuid(PROV))
    p.bank_account = None            # se le quita para poder probar el rechazo
    s.commit()
finally:
    s.close()
r = gasto_nuevo(concept="Otro", document=pdf(), bank_account=IBAN_MALO)
check("una cuenta inválida se rechaza", "no es válido" in r.get_data(as_text=True).lower())
check("y no se crea el gasto", len(gastos()) == 1, [g.concept for g in gastos()])
r = gasto_nuevo(concept="Otro", document=pdf(), bank_account=IBAN_NUESTRO)
check("una cuenta NUESTRA se rechaza", "empresa nuestra" in r.get_data(as_text=True).lower())
check("y tampoco se crea", len(gastos()) == 1, [g.concept for g in gastos()])

print("\n── 5. Sin factura todavía NO se exige ─────────────────────────────────")
r = gasto_nuevo(concept="Sin factura aún")
check("el gasto se crea sin pedir cuenta", len(gastos()) == 2, [g.concept for g in gastos()])
print("\n── 6. Lo que cubre el promotor tampoco se paga: no se exige ───────────")
r = gasto_nuevo(concept="Lo paga el promotor", document=pdf(), covered_by="PROMOTOR")
check("se crea igualmente", len(gastos()) == 3, [g.concept for g in gastos()])

print("\n── 7. Si factura una SOCIEDAD, la cuenta va en la sociedad ────────────")
s = models.SessionLocal()
try:
    p = s.get(models.Promoter, A.to_uuid(PROV))
    soc = models.PromoterCompany(promoter_id=p.id, legal_name="Backline Servicios SL")
    s.add(soc); s.flush()
    SOC = str(soc.id)
    p.bank_account = None
    s.commit()
finally:
    s.close()
r = gasto_nuevo(concept="Con sociedad", document=pdf(), provider_company_id=SOC, bank_account=IBAN_OK)
s = models.SessionLocal()
try:
    soc = s.get(models.PromoterCompany, A.to_uuid(SOC))
    check("la cuenta se guarda en la SOCIEDAD", A._iban_is_valid(soc.bank_account or ""), soc.bank_account)
    check("y el tercero se queda como estaba",
          not (s.get(models.Promoter, A.to_uuid(PROV)).bank_account or ""),
          s.get(models.Promoter, A.to_uuid(PROV)).bank_account)
finally:
    s.close()

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
