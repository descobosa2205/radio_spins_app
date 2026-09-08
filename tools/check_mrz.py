#!/usr/bin/env python3
"""Prueba de regresión del LECTOR DE DOCUMENTOS (`mrz_utils.py`): DNI, NIE y pasaporte.

Se comprueban las tres cosas que hacen que el lector funcione con documentos de verdad:
  1. la BANDA del reverso (MRZ) **con los errores típicos del OCR** (una «O» por un cero, la «M»
     del sexo leída como «H», las líneas pegadas en una sola…): antes cualquiera de esos casos
     tiraba la lectura ENTERA y el escáner se quedaba «pensando» hasta agotar los intentos;
  2. la CARA DELANTERA, que es la que la gente pone delante de la cámara y la que sube en una foto
     (en el DNI español el MRZ está en el reverso, así que sin esto no se leía nada);
  3. que NO cuele un dato inventado: un texto cualquiera no puede dar un número de documento.

    python3 tools/check_mrz.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mrz_utils as m  # noqa: E402

HOY = date(2026, 9, 8)
fallos: list[str] = []
hechas = 0


def ok(que: str, obtenido, esperado):
    global hechas
    hechas += 1
    if obtenido != esperado:
        fallos.append(f"{que}\n      esperado: {esperado!r}\n      obtenido: {obtenido!r}")


def campos(texto: str, kind: str = "DNI"):
    return m.extract_fields(texto, kind, hoy=HOY)


# ------------------------------------------------------------------ 1. LA BANDA DEL REVERSO (MRZ)
TD1 = m.build_td1(support="BAA000589", birth="800101", sex="M", expiry="300101",
                  nationality="ESP", doc_number="12345678Z",
                  surname="GARCIA LOPEZ", given="MARIA")
TD3 = m.build_td3(doc_number="AAA123456", nationality="ESP", birth="900215", sex="F",
                  expiry="320215", surname="PEREZ RUIZ", given="ANA MARIA")


def esperado_dni(**cambios):
    base = {"number": "12345678Z", "full_name": "Maria Garcia Lopez", "birth": "1980-01-01",
            "expiry": "2030-01-01"}
    base.update(cambios)
    return base


def resumen(texto, kind="DNI", claves=("number", "full_name", "birth", "expiry")):
    d = campos(texto, kind)
    return {k: d[k] for k in claves}


ok("TD1 limpio", resumen("\n".join(TD1)), esperado_dni())
# Los cinco errores de OCR que antes tiraban la lectura entera:
ok("TD1 · «O» por cero en la fecha",
   resumen("\n".join([TD1[0], TD1[1].replace("8001014", "8OO1014"), TD1[2]])), esperado_dni())
ok("TD1 · «I» y «O» en la caducidad",
   resumen("\n".join([TD1[0], TD1[1].replace("3001019", "3OO1O19"), TD1[2]])), esperado_dni())
ok("TD1 · sexo «M» leído como «H»",
   resumen("\n".join([TD1[0], TD1[1].replace("4M3", "4H3"), TD1[2]])), esperado_dni())
ok("TD1 · «S» por 5 en el DNI",
   resumen("\n".join([TD1[0].replace("12345678Z", "1234S678Z"), TD1[1], TD1[2]])), esperado_dni())
ok("TD1 · «1D» por «ID» en la primera línea",
   resumen("\n".join(["1DESP" + TD1[0][5:], TD1[1], TD1[2]])), esperado_dni())
ok("TD1 · dígito en el nombre («GARC1A»)",
   resumen("\n".join([TD1[0], TD1[1], TD1[2].replace("GARCIA", "GARC1A")])), esperado_dni())
# El OCR devuelve la banda de una vez, con las tres líneas pegadas:
ok("TD1 · las tres líneas pegadas", resumen("".join(TD1)), esperado_dni())
ok("TD1 · con texto alrededor",
   resumen("DOCUMENTO NACIONAL DE IDENTIDAD\n" + "\n".join(TD1) + "\nESPANA"), esperado_dni())
# Sin la primera línea no hay número (el DNI va en sus datos opcionales), pero el resto se salva:
sin_l1 = campos("\n".join([TD1[1], TD1[2]]))
ok("TD1 · sin la primera línea: fecha y nombre igual",
   (sin_l1["birth"], sin_l1["full_name"]), ("1980-01-01", "Maria Garcia Lopez"))

ok("TD3 limpio", resumen("\n".join(TD3), "PASSPORT"),
   {"number": "AAA123456", "full_name": "Ana Maria Perez Ruiz", "birth": "1990-02-15",
    "expiry": "2032-02-15"})
ok("TD3 · «O» por cero en la fecha",
   resumen("\n".join([TD3[0], TD3[1].replace("9002158", "9OO2158")]), "PASSPORT"),
   {"number": "AAA123456", "full_name": "Ana Maria Perez Ruiz", "birth": "1990-02-15",
    "expiry": "2032-02-15"})
ok("TD3 · las dos líneas pegadas", resumen("".join(TD3), "PASSPORT"),
   {"number": "AAA123456", "full_name": "Ana Maria Perez Ruiz", "birth": "1990-02-15",
    "expiry": "2032-02-15"})
# Un pasaporte subido como si fuera un DNI se lee igual (manda la FORMA de las líneas).
ok("TD3 subido como «DNI»", resumen("\n".join(TD3), "DNI")["number"], "AAA123456")

# Un NIE (X/Y/Z + 7 dígitos) en los datos opcionales.
NIE = m.build_td1(support="CAA111222", birth="951130", sex="F", expiry="280715",
                  nationality="MAR", doc_number="X1234567L", surname="EL AMRANI", given="FATIMA")
ok("TD1 · NIE", resumen("\n".join(NIE)),
   {"number": "X1234567L", "full_name": "Fatima El Amrani", "birth": "1995-11-30",
    "expiry": "2028-07-15"})
ok("TD1 · NIE con «O» por cero en la fecha",
   resumen("\n".join([NIE[0], NIE[1].replace("9511305", "95113O5"), NIE[2]]))["number"], "X1234567L")

# ------------------------------------------------------------------------ 2. LA CARA DELANTERA
ANVERSO_DNI = """DOCUMENTO NACIONAL DE IDENTIDAD
ESPANA
APELLIDOS
GARCIA LOPEZ
NOMBRE
MARIA
SEXO   NACIONALIDAD   FECHA DE NACIMIENTO
M      ESP            01 01 1980
IDESP        VALIDEZ
BAA000589    01 01 2030
DNI  12345678Z"""
ok("Anverso del DNI (rótulos y fechas con espacios)", resumen(ANVERSO_DNI),
   esperado_dni())
ok("Anverso · dice de dónde ha salido", campos(ANVERSO_DNI)["source"], "FRONT")
ok("Anverso · sexo y nacionalidad",
   (campos(ANVERSO_DNI)["sex"], campos(ANVERSO_DNI)["nationality"]), ("M", "ESP"))
ok("Anverso · número de soporte", campos(ANVERSO_DNI)["support_number"], "BAA000589")

ANVERSO_BARRAS = """APELLIDOS RUIZ MORENO
NOMBRE JUAN CARLOS
FECHA DE NACIMIENTO 14/07/1992
VALIDEZ 14/07/2032
DNI 87654321X"""
ok("Anverso · fechas con barras y valor en la misma línea", resumen(ANVERSO_BARRAS),
   {"number": "87654321X", "full_name": "Juan Carlos Ruiz Moreno", "birth": "1992-07-14",
    "expiry": "2032-07-14"})

ANVERSO_TIE = """TARJETA DE IDENTIDAD DE EXTRANJERO
NIE X1234567L
APELLIDOS
EL AMRANI
NOMBRE
FATIMA
FECHA DE NACIMIENTO 30 11 1995
VALIDEZ 15 07 2028"""
ok("Anverso · tarjeta de extranjero (NIE)", resumen(ANVERSO_TIE),
   {"number": "X1234567L", "full_name": "Fatima El Amrani", "birth": "1995-11-30",
    "expiry": "2028-07-15"})

# El OCR sucio del impreso: algún cero como «O» y algún uno como «l».
ANVERSO_SUCIO = """APELLIDOS
GARCIA LOPEZ
NOMBRE
MARIA
FECHA DE NACIMIENTO
Ol 01 1980
VALIDEZ
01 O1 2O30
DNI 12345678Z"""
ok("Anverso · con «O» y «l» en las fechas", resumen(ANVERSO_SUCIO), esperado_dni())
# ⚠️ El límite, a propósito: con un OCR tan malo que del año no queda nada legible («2O3O»), la
# fecha NO se adivina. Es mejor dejarla vacía para que se escriba a mano que colar una inventada.
ok("Anverso · OCR catastrófico: no se inventa la fecha",
   campos("""APELLIDOS
GARCIA LOPEZ
VALIDEZ
Ol Ol 2O3O""")["expiry"], "")

# Sin rótulos de fecha: la más antigua es el nacimiento y la futura la caducidad.
ok("Anverso · sin rótulos de fecha",
   resumen("APELLIDOS\nSOLER VIDAL\nNOMBRE\nPAU\n03/03/1975\n03/03/2029\n11111111H"),
   {"number": "11111111H", "full_name": "Pau Soler Vidal", "birth": "1975-03-03",
    "expiry": "2029-03-03"})
# Un DNI caducado no tiene ninguna fecha futura: no se inventa una caducidad.
ok("Anverso · documento caducado (no se inventa la caducidad)",
   campos("APELLIDOS\nSOLER VIDAL\nNOMBRE\nPAU\n03 03 1975\n03 03 2019\n11111111H")["expiry"], "")

# El nombre del MRZ manda sobre el del impreso (viene partido en apellidos/nombre y validado).
mezcla = campos(ANVERSO_DNI + "\n" + "\n".join(TD1))
ok("Las dos caras juntas: manda el MRZ",
   (mezcla["source"], mezcla["first_name"], mezcla["last_name"]), ("MRZ", "Maria", "Garcia Lopez"))

# ------------------------------------------------- 2 bis. LO QUE DEVUELVE EL OCR DE VERDAD
# ⚠️ Esto no es inventado: es lo que sacó tesseract leyendo un DNI dibujado en un lienzo, y trae los
# tres fallos típicos que antes dejaban la lectura en nada: las fechas PEGADAS («0101 1980»), la
# LETRA de control leída como un dígito («…78Z» → «…782») y los rellenos «<» leídos como K y L.
OCR_ANVERSO = """DOCUMENTO NACIONAL DE IDENTIDAD
APELLIDOS
GARCIA LOPEZ
NOMBRE
MARIA
SEXO         NACIONALIDAD FECHA DE NACIMIENTO
M       ESP          0101 1980
IDESP                          VALIDEZ
BAA000589           01012030
DNI 123456782"""
ok("OCR real · anverso completo", resumen(OCR_ANVERSO), esperado_dni())
ok("OCR real · anverso, sexo", campos(OCR_ANVERSO)["sex"], "M")
# La letra de control solo se recupera junto a su rótulo: en un texto suelto, un teléfono de nueve
# dígitos podría colar por azar (la letra acierta 1 de cada 23 veces).
ok("la letra no se recupera de un número suelto",
   campos("ALGO 123456782 OTRA COSA")["number"], "")
ok("un teléfono de nueve dígitos no es un DNI",
   campos("TELEFONO 638123456")["number"], "")

# El rótulo del número también lo lee mal («DN» por «DNI»): con dos o más rótulos de documento, se
# admite que la letra de control se haya leído como un dígito.
OCR_ROTULO_MALO = OCR_ANVERSO.replace("DNI 123456782", "DN 123456782")
ok("OCR real · rótulo mal leído («DN»)", resumen(OCR_ROTULO_MALO), esperado_dni())
ok("un teléfono con rótulo no es un DNI",
   campos("APELLIDOS RUIZ\nNOMBRE ANA\nVALIDEZ 01 01 2030\nTELEFONO 638123456")["number"], "")
ok("nueve dígitos en un texto que no es un documento",
   campos("CONTRATO 123456789 CLAUSULA SEGUNDA")["number"], "")

OCR_REVERSO = """IDESPBAA000589512345678Z<<<<<<
8001014M3001019ESP<LLLLLLLLL1
GARCIA<KLOPEZ<<MARIAKLLLLLLLLL"""
r_rev = campos(OCR_REVERSO)
ok("OCR real · reverso: rellenos «<» leídos como L",
   (r_rev["number"], r_rev["birth"], r_rev["nationality"]), ("12345678Z", "1980-01-01", "ESP"))
# ⚠️ Y cuando el OCR mete un carácter DE MÁS, todo se desplaza: eso no se puede arreglar, así que lo
# que tiene que pasar es que el fotograma NO se dé por bueno (la cámara prueba con el siguiente).
desplazado = m.parse_mrz("""IDESPBAAQ00058951234567872<<<<<
8001014M3001019ESP<LLLLLLLLL1
GARCIA<KLOPEZ<<MARIAKLLLLLLLLL""", hoy=HOY) or {}
ok("un carácter de más: el número no se da por bueno",
   m.doc_number_kind(desplazado.get("number") or "") in ("DNI", "NIE") or desplazado.get("valid_strict"),
   False)

# ------------------------------------------------------------- 3. QUE NO CUELE NADA INVENTADO
for texto in (
    "CONTRATO DE ARRENDAMIENTO ENTRE LAS PARTES FACTURA 123456 TOTAL 1.234,56",
    "ESCOBOSA MARTINEZ DANIEL",
    "IBAN ES9121000418450200051332",
    "TELEFONO 638123456 MOVIL 600111222",
    "PEDIDO 20260908 REFERENCIA ABCDEFGHI",
    "LOREM IPSUM DOLOR SIT AMET CONSECTETUR ADIPISCING",
):
    ok(f"no inventa un número en: {texto[:34]}…", campos(texto)["number"], "")
ok("no inventa un nombre de un texto suelto",
   campos("FACTURA NUMERO 7 CONCEPTO SERVICIOS")["full_name"], "")
# Una fecha imposible no se acepta.
ok("fecha imposible (31 de febrero)",
   campos("APELLIDOS\nSOLER\nNOMBRE\nPAU\nFECHA DE NACIMIENTO 31 02 1990")["birth"], "")

# ------------------------------------------------------------------ 4. LAS PIEZAS POR SEPARADO
ok("check_digit (norma OACI)", m.check_digit("800101"), "4")
ok("letra del DNI", m.dni_letter("12345678"), "Z")
ok("letra del NIE", m.dni_letter("X1234567"), "L")
ok("DNI válido", m.is_valid_dni("12345678Z"), True)
ok("DNI con la letra mal", m.is_valid_dni("12345678A"), False)
ok("repara un DNI con «O» y «S»", m.repara_dni("1234S678Z"), "12345678Z")
ok("repara un NIE con «I» por 1", m.repara_dni("XI234567L"), "X1234567L")
ok("no repara si la letra no cuadra", m.repara_dni("12345678A"), "")
ok("no repara lo que no es un número", m.repara_dni("GARCIALOP"), "")
ok("tipo de número · DNI", m.doc_number_kind("12345678Z"), "DNI")
ok("tipo de número · NIE", m.doc_number_kind("X1234567L"), "NIE")
ok("tipo de número · pasaporte", m.doc_number_kind("AAA123456"), "PASSPORT")
# La reparación guiada por el dígito de control, cuando la solución es única.
ok("un dígito de control que no cuadra no da fecha inventada",
   m.parse_td1([TD1[0], "8001019M3001019ESP<<<<<<<<<<<1", TD1[2]])["birth"] in ("", "1980-01-01"), True)

# ------------------------------------------------------------------------------------ resultado
print(f"check_mrz: {hechas} comprobaciones")
if fallos:
    print(f"\n❌ {len(fallos)} FALLOS:\n")
    for f in fallos:
        print("  · " + f)
    sys.exit(1)
print("✅ todo en verde")
