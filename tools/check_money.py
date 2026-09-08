# -*- coding: utf-8 -*-
"""EL DINERO NO SE ALTERA · prueba de regresión de los parsers de importes.

⚠️⚠️ En España el PUNTO es de miles y de millón, y la COMA es la decimal. Pero el PROGRAMA escribe
canónico (punto decimal), así que hay DOS parsers y el formato lo decide **el ORIGEN del dato**:

  · `_parse_money_decimal`  ← lo que **ESCRIBE UNA PERSONA** (un formulario, un PDF, un Excel):
                              «40.000» son CUARENTA MIL.
  · `_money_value`          ← lo que **YA ES UN DATO** (una columna `Numeric`, un JSONB, un
                              snapshot, un cálculo): «316.663» son 316 con 663 milésimas.

Confundirlos altera importes por mil: en sep 2026 una liquidación de royalties de 316,66 € salió
como 316.663,00 € y a facturar 383.162,23 € (captura del bug). Si se toca un parser, esto tiene que
seguir en verde:  python3 tools/check_money.py
"""
import io
import os
import re
import sys
from decimal import Decimal

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FALLOS = []


def ok(titulo, cond, detalle=""):
    print(("  OK   " if cond else "  FALLO") + " · " + titulo + ("" if cond else "  " + detalle))
    if not cond:
        FALLOS.append(titulo)


def _carga_parsers():
    """Los dos parsers de app.py, sin importar la app (que necesita BD)."""
    src = io.open(os.path.join(RAIZ, "app.py"), encoding="utf-8").read()
    i = src.index("def _money_number(")
    j = src.index("\n# ---", i)
    ns = {"Decimal": Decimal, "re": re}
    from decimal import InvalidOperation
    ns["InvalidOperation"] = InvalidOperation
    exec(src[i:j], ns)
    return ns["_money_value"], ns["_parse_money_decimal"], ns["_money_json_safe"]


valor, persona, json_safe = _carga_parsers()

# ── 1) LO QUE ESCRIBE UNA PERSONA: el punto es de MILES ───────────────────────────────────────
print("\n=== 1) Lo que escribe una persona (formularios, PDF, Excel) ===")
CASOS_PERSONA = [
    ("40.000", "40000"),          # cuarenta mil (el bug de sep: salía 40)
    ("2.500.000", "2500000"),
    ("1.234,56", "1234.56"),
    ("316,66", "316.66"),
    ("1234.56", "1234.56"),       # canónico del navegador
    ("40000.00", "40000.00"),
    ("12.3456", "12.3456"),       # 4 decimales NO pueden ser un grupo de miles
    ("1.234.56", "1234.56"),      # miles + decimal
    ("1,234.56", "1234.56"),      # formato de allí
    ("1.5", "1.5"),
    ("100", "100"),
    # ⚠️⚠️ UN IMPORTE CASI NUNCA LLEGA SOLO: viene con su moneda y su nota detrás. El texto de
    # detrás ROMPÍA la regla de los separadores y el respaldo pegaba las cifras de todo lo que
    # hubiera: «1.500 € + IVA» daba **1,5 €** y «1.500 € + IVA (21%)» daba **1,50021** (bug real de
    # dinero, sep 2026 — el importe orientativo de una petición).
    ("1.500 € + IVA", "1500"),
    ("1.500 € + IVA (21%)", "1500"),
    ("40.000 € más IVA", "40000"),
    ("12.000 € netos", "12000"),
    ("Total: 1.500", "1500"),
    ("2.500€", "2500"),
    ("3000 euros", "3000"),
    ("-1.500 €", "-1500"),
    ("-40.000", "-40000"),
    ("1.200,50 €", "1200.50"),
    ("", "0"),
    (None, "0"),
]
for crudo, esperado in CASOS_PERSONA:
    got = persona(crudo)
    ok("persona %-14r → %s" % (crudo, esperado), got == Decimal(esperado), "salió %s" % got)

# ── 2) LO QUE YA ES UN DATO: el punto es DECIMAL ──────────────────────────────────────────────
print("\n=== 2) Lo que ya es un dato (columna, JSONB, snapshot, cálculo) ===")
CASOS_DATO = [
    ("316.663", "316.663"),       # ⚠️ EL BUG: se leía 316663
    ("316.6633", "316.6633"),
    ("0.333", "0.333"),
    ("66.4992", "66.4992"),
    ("383.16", "383.16"),
    ("40000.00", "40000.00"),
    ("316,66", "316.66"),         # un JSON viejo con coma
    ("1.234,56", "1234.56"),      # ya formateado a la española
    ("2.500.000", "2500000"),     # texto de miles que alguien guardó sin parsear
    ("", "0"),
    (None, "0"),
]
for crudo, esperado in CASOS_DATO:
    got = valor(crudo)
    ok("dato    %-14r → %s" % (crudo, esperado), got == Decimal(esperado), "salió %s" % got)

# ── 3) UN NÚMERO NO SE PARSEA (ninguno de los dos lo toca) ────────────────────────────────────
print("\n=== 3) Un número no se parsea (Decimal de una columna, float de un JSONB) ===")
for crudo, esperado in [(Decimal("316.663"), "316.663"), (Decimal("40000.00"), "40000.00"),
                        (316.663, "316.663"), (40000, "40000"), (0, "0"),
                        (Decimal("-12.5"), "-12.5")]:
    ok("dato    %-14r → %s" % (crudo, esperado), valor(crudo) == Decimal(esperado), "salió %s" % valor(crudo))
    ok("persona %-14r → %s" % (crudo, esperado), persona(crudo) == Decimal(esperado), "salió %s" % persona(crudo))
ok("un booleano no es un importe", valor(True) == Decimal("0") and persona(True) == Decimal("0"))

# ── 4) LO QUE SE GUARDA EN UN JSONB VA COMO NÚMERO ────────────────────────────────────────────
print("\n=== 4) Un Decimal se guarda en JSON como NÚMERO, no como texto ===")
import json
guardado = json.loads(json.dumps({"total_amount": Decimal("316.663")}, default=json_safe))
ok("json.dumps(Decimal) → número", isinstance(guardado["total_amount"], float),
   "salió %r" % (guardado["total_amount"],))
ok("y al releerlo vale lo mismo", valor(guardado["total_amount"]) == Decimal("316.663"),
   "salió %s" % valor(guardado["total_amount"]))

# ── 5) EL CASO DE LA CAPTURA, DE PUNTA A PUNTA ────────────────────────────────────────────────
print("\n=== 5) El caso de la captura (liquidación de royalties de 316,66 €) ===")
base = valor("316.663")                      # como está guardado en un snapshot antiguo
total = (base * Decimal("1.21")).quantize(Decimal("0.01"))
ok("la base sigue siendo 316,66 €", base.quantize(Decimal("0.01")) == Decimal("316.66"), "salió %s" % base)
ok("a facturar 383,16 €, no 383.162,23 €", total == Decimal("383.16"), "salió %s" % total)

# ── 6) LOS OTROS MOTORES (facturas y ficheros) ────────────────────────────────────────────────
print("\n=== 6) Los otros motores: facturas escaneadas e importaciones ===")
sys.path.insert(0, RAIZ)
from invoice_read import parse_amount           # noqa: E402
from buyer_import import clean_money            # noqa: E402
for crudo, esperado in [("6.123", "6123"), ("1.234,56", "1234.56"), ("1234.56", "1234.56"),
                        ("12.3456", "12.3456"), ("2.500.000", "2500000")]:
    got = parse_amount(crudo)
    ok("factura %-12r → %s" % (crudo, esperado), got == Decimal(esperado), "salió %s" % got)
for crudo, esperado in [("1.234", "1234"), ("1.234.567", "1234567"), ("1234.56", "1234.56"),
                        ("12.3456", "12.3456"), ("1.234,56", "1234.56")]:
    got = clean_money(crudo)
    ok("fichero %-12r → %s" % (crudo, esperado), Decimal(got) == Decimal(esperado), "salió %s" % got)

# ── 7) EL ESPEJO EN EL NAVEGADOR (money_input.js) ─────────────────────────────────────────────
print("\n=== 7) El espejo en el navegador (money_input.js) ===")
js = io.open(os.path.join(RAIZ, "static/js/money_input.js"), encoding="utf-8").read()
ok("toCanonical: un grupo de miles tiene EXACTAMENTE 3 dígitos",
   "t[1].length === 3" in js and "not in (1, 2)" not in js)
ok("existe `fromServer` (el valor que pinta el servidor: punto decimal)", "function fromServer(" in js)
ok("`upgrade` lo usa para el valor inicial", re.search(r"display\(el\.value, true\)", js) is not None)

print("\n" + ("TODO OK" if not FALLOS else "FALLOS: %d\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS))))
sys.exit(1 if FALLOS else 0)
