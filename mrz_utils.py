"""Lectura de la BANDA LEGIBLE POR MÁQUINA (MRZ) de DNI, NIE y pasaporte.

Motor PURO: no toca base de datos, ni Flask, ni el navegador. Recibe el texto que ha salido del OCR
y devuelve los datos ya validados. Así se puede probar solo, y es lo que hace que el escaneo sea
fiable: **el MRZ lleva dígitos de control**, así que se sabe si lo leído está bien o si el OCR se ha
inventado un carácter. Sin eso, un «8» que se lee como «B» pasaba como si fuera un dato bueno.

Formatos (norma OACI 9303):
  · **TD1** — 3 líneas de 30. Es el del **DNI y el NIE españoles** (tarjeta) y el permiso de conducir.
    Línea 1: `ID` + país(3) + nº de SOPORTE(9) + control(1) + datos opcionales(15)
             ⚠️ En el DNI español el número del documento (12345678Z / X1234567L) NO está en el hueco
             del «número de documento»: ahí va el **número de soporte** (p. ej. BAA000589). El DNI/NIE
             va en los **datos opcionales**. Por eso antes se rascaba del texto impreso y fallaba.
    Línea 2: nacimiento(6)+control(1) + sexo(1) + caducidad(6)+control(1) + nacionalidad(3) +
             datos opcionales(11) + control compuesto(1)
    Línea 3: APELLIDOS<<NOMBRES
  · **TD3** — 2 líneas de 44. Es el del **pasaporte**.
    Línea 1: `P` + tipo + país(3) + APELLIDOS<<NOMBRES
    Línea 2: nº(9)+control(1) + nacionalidad(3) + nacimiento(6)+control(1) + sexo(1) +
             caducidad(6)+control(1) + datos personales(14) + control(1) + control compuesto(1)

⚠️ **Paridad obligatoria** con `static/js/doc_scan.js`: la lógica de aquí está espejada allí para el
escaneo de ficheros en el navegador. Si se toca una, se toca la otra.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date

# Peso de cada posición al calcular el dígito de control (se repite 7-3-1).
_PESOS = (7, 3, 1)
# Letra de control del DNI/NIE español (posición = número mod 23).
_LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE"
# El NIE empieza por X, Y o Z, que valen 0, 1 y 2 al calcular la letra.
_PREFIJO_NIE = {"X": "0", "Y": "1", "Z": "2"}

SEXOS = {"M": "M", "F": "F", "X": "", "<": ""}


def _limpia_linea(linea: str) -> str:
    """Deja solo lo que puede haber en un MRZ: A-Z, 0-9 y el relleno «<»."""
    texto = unicodedata.normalize("NFKD", str(linea or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9<]", "", texto.upper())


def _valor(caracter: str) -> int:
    if caracter.isdigit():
        return int(caracter)
    if caracter == "<":
        return 0
    if "A" <= caracter <= "Z":
        return ord(caracter) - 55        # A=10 … Z=35
    return 0


def check_digit(campo: str) -> str:
    """Dígito de control OACI de un campo del MRZ."""
    total = 0
    for i, caracter in enumerate(str(campo or "")):
        total += _valor(caracter) * _PESOS[i % 3]
    return str(total % 10)


def check_ok(campo: str, digito: str) -> bool:
    """¿Cuadra el dígito de control? Un «<» en el dígito se acepta como «no informado»."""
    digito = (digito or "").strip()
    if digito in ("", "<"):
        return True
    return check_digit(campo) == digito


def _fecha(yymmdd: str, futura: bool, hoy: date | None = None) -> str:
    """`aammdd` del MRZ a ISO. `futura` = es una caducidad (siglo XXI seguro)."""
    if not re.fullmatch(r"[0-9]{6}", yymmdd or ""):
        return ""
    yy, mm, dd = int(yymmdd[:2]), yymmdd[2:4], yymmdd[4:6]
    if not (1 <= int(mm) <= 12) or not (1 <= int(dd) <= 31):
        return ""
    hoy = hoy or date.today()
    if futura:
        año = 2000 + yy
    else:
        # Nacimiento: si 20xx sale en el futuro, es del siglo pasado.
        año = 2000 + yy if (2000 + yy) <= hoy.year else 1900 + yy
    try:
        date(año, int(mm), int(dd))
    except ValueError:
        return ""
    return f"{año:04d}-{mm}-{dd}"


def title_case(texto: str) -> str:
    """«JUAN CARLOS DE LA PEÑA» → «Juan Carlos de la Peña» (respeta guiones y apóstrofos)."""
    minusculas = {"de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von", "der", "di"}
    salida, palabras = [], re.split(r"(\s+)", str(texto or "").strip().lower())
    for i, palabra in enumerate(palabras):
        if not palabra.strip():
            salida.append(palabra)
            continue
        if i > 0 and palabra in minusculas:
            salida.append(palabra)
            continue
        salida.append(re.sub(r"(^|[\-'’])([a-záéíóúñüàèìòùç])",
                             lambda m: m.group(1) + m.group(2).upper(), palabra))
    return "".join(salida)


def _nombre(campo: str) -> dict:
    """`APELLIDOS<<NOMBRES` → apellidos, nombre y nombre completo."""
    partes = str(campo or "").split("<<")
    apellidos = re.sub(r"\s+", " ", partes[0].replace("<", " ")).strip()
    nombres = re.sub(r"\s+", " ", "<".join(partes[1:]).replace("<", " ")).strip() if len(partes) > 1 else ""
    completo = f"{nombres} {apellidos}".strip() if nombres else apellidos
    return {
        "last_name": title_case(apellidos),
        "first_name": title_case(nombres),
        "full_name": title_case(completo),
    }


# ------------------------------- DNI / NIE españoles ---------------------------------------------
def normalize_doc_number(valor) -> str:
    """Número de documento comparable: sin espacios, guiones ni puntos, en mayúsculas."""
    return re.sub(r"[^A-Z0-9]", "", str(valor or "").upper())


def dni_letter(numero: str) -> str:
    """Letra que le toca a un DNI (8 dígitos) o a un NIE (X/Y/Z + 7 dígitos)."""
    numero = normalize_doc_number(numero)
    cuerpo = numero
    if cuerpo[:1] in _PREFIJO_NIE:
        cuerpo = _PREFIJO_NIE[cuerpo[0]] + cuerpo[1:]
    if not cuerpo.isdigit():
        return ""
    return _LETRAS_DNI[int(cuerpo) % 23]


def is_valid_dni(valor) -> bool:
    """DNI español: 8 dígitos + letra de control."""
    numero = normalize_doc_number(valor)
    if not re.fullmatch(r"[0-9]{8}[A-Z]", numero):
        return False
    return dni_letter(numero[:8]) == numero[-1]


def is_valid_nie(valor) -> bool:
    """NIE: X, Y o Z + 7 dígitos + letra de control."""
    numero = normalize_doc_number(valor)
    if not re.fullmatch(r"[XYZ][0-9]{7}[A-Z]", numero):
        return False
    return dni_letter(numero[:8]) == numero[-1]


def doc_number_kind(valor) -> str:
    """DNI | NIE | PASSPORT | OTHER — qué clase de número es."""
    numero = normalize_doc_number(valor)
    if is_valid_dni(numero):
        return "DNI"
    if is_valid_nie(numero):
        return "NIE"
    # Pasaporte español: 3 letras + 6 dígitos (AAA123456) o los formatos antiguos.
    if re.fullmatch(r"[A-Z]{2,3}[0-9]{6}", numero) or re.fullmatch(r"[A-Z][0-9]{7,8}", numero):
        return "PASSPORT"
    return "OTHER"


def find_spanish_id(texto: str) -> str:
    """Busca un DNI o un NIE VÁLIDO en un texto suelto (el impreso del documento).

    Se valida la letra de control para no colar ruido del OCR: sin esto, cualquier tira de 8 dígitos
    seguida de una letra se tomaba por un DNI."""
    arriba = normalize_doc_number(texto) if False else str(texto or "").upper()
    for patron in (r"[XYZ][\-\s]?[0-9]{7}[\-\s]?[A-Z]", r"[0-9]{8}[\-\s]?[A-Z]"):
        for encaje in re.finditer(patron, arriba):
            candidato = normalize_doc_number(encaje.group(0))
            if is_valid_dni(candidato) or is_valid_nie(candidato):
                return candidato
    return ""


# ------------------------------------- MRZ TD1 ---------------------------------------------------
def parse_td1(lineas: list[str], *, hoy: date | None = None) -> dict:
    """DNI / NIE / permiso de conducir (3 líneas de 30)."""
    l1, l2, l3 = (lineas + ["", "", ""])[:3]
    l1, l2, l3 = l1.ljust(30, "<")[:30], l2.ljust(30, "<")[:30], l3
    soporte = l1[5:14].replace("<", "").strip()
    opcional1 = l1[15:30].replace("<", "").strip()
    nacimiento_raw, dc_nac = l2[0:6], l2[6]
    sexo = l2[7]
    caducidad_raw, dc_cad = l2[8:14], l2[14]
    nacionalidad = l2[15:18].replace("<", "").strip()
    opcional2 = l2[18:29].replace("<", "").strip()
    dc_compuesto = l2[29]

    # El DNI/NIE va en los datos opcionales; el hueco «número de documento» lleva el nº de soporte.
    numero = ""
    for candidato in (opcional1, opcional2):
        encontrado = find_spanish_id(candidato)
        if encontrado:
            numero = encontrado
            break
    if not numero:
        # Documento no español (u OACI genérico): el número es el del hueco de siempre.
        numero = normalize_doc_number(soporte)

    compuesto = l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29]
    checks = {
        "document": check_ok(l1[5:14], l1[14]),
        "birth": check_ok(nacimiento_raw, dc_nac),
        "expiry": check_ok(caducidad_raw, dc_cad),
        "composite": check_ok(compuesto, dc_compuesto),
    }
    datos = {
        "format": "TD1",
        "number": numero,
        "support_number": normalize_doc_number(soporte),
        "birth": _fecha(nacimiento_raw, False, hoy),
        "expiry": _fecha(caducidad_raw, True, hoy),
        "sex": SEXOS.get(sexo, ""),
        "nationality": nacionalidad,
        "checks": checks,
        # Se da por bueno cuando cuadran nacimiento y caducidad; el compuesto suele fallar si el OCR
        # se come un carácter de los datos opcionales, y aun así el resto del dato es correcto.
        "valid": bool(checks["birth"] and checks["expiry"]),
        "valid_strict": bool(all(checks.values())),
    }
    datos.update(_nombre(l3))
    return datos


# ------------------------------------- MRZ TD3 ---------------------------------------------------
def parse_td3(lineas: list[str], *, hoy: date | None = None) -> dict:
    """Pasaporte (2 líneas de 44)."""
    l1, l2 = (lineas + ["", ""])[:2]
    l1, l2 = l1.ljust(44, "<")[:44], l2.ljust(44, "<")[:44]
    pais = l1[2:5].replace("<", "").strip()
    numero, dc_num = l2[0:9], l2[9]
    nacionalidad = l2[10:13].replace("<", "").strip()
    nacimiento_raw, dc_nac = l2[13:19], l2[19]
    sexo = l2[20]
    caducidad_raw, dc_cad = l2[21:27], l2[27]
    personales, dc_personales = l2[28:42], l2[42]
    dc_compuesto = l2[43]

    compuesto = l2[0:10] + l2[13:20] + l2[21:28] + l2[28:43]
    checks = {
        "document": check_ok(numero, dc_num),
        "birth": check_ok(nacimiento_raw, dc_nac),
        "expiry": check_ok(caducidad_raw, dc_cad),
        "personal": check_ok(personales, dc_personales),
        "composite": check_ok(compuesto, dc_compuesto),
    }
    datos = {
        "format": "TD3",
        "number": normalize_doc_number(numero),
        "support_number": "",
        "issuing_country": pais,
        "birth": _fecha(nacimiento_raw, False, hoy),
        "expiry": _fecha(caducidad_raw, True, hoy),
        "sex": SEXOS.get(sexo, ""),
        "nationality": nacionalidad,
        "checks": checks,
        "valid": bool(checks["document"] and checks["birth"] and checks["expiry"]),
        "valid_strict": bool(all(checks.values())),
    }
    # El nombre va en la línea 1, tras `P` + tipo + país.
    datos.update(_nombre(l1[5:44]))
    return datos


# --------------------------------- Punto de entrada ----------------------------------------------
def _candidatas(texto: str) -> list[str]:
    """Líneas del OCR que tienen pinta de MRZ (largas y solo con A-Z0-9<)."""
    salida = []
    for cruda in re.split(r"[\r\n]+", str(texto or "")):
        limpia = _limpia_linea(cruda)
        if len(limpia) >= 24 and limpia.count("<") >= 1:
            salida.append(limpia)
    return salida


def parse_mrz(texto: str, *, kind: str | None = None, hoy: date | None = None) -> dict | None:
    """Lee el MRZ de un texto de OCR. Devuelve los datos o None si no hay MRZ reconocible.

    Elige TD3 o TD1 por la FORMA de las líneas, no por lo que diga el usuario: si alguien sube un
    pasaporte diciendo que es un DNI, se lee bien igualmente."""
    lineas = _candidatas(texto)
    if not lineas:
        return None
    pedido = (kind or "").strip().upper()

    # --- TD3: dos líneas de ~44, una empieza por P ---
    largas = [l for l in lineas if len(l) >= 40]
    l1_td3 = next((l for l in largas if l.startswith("P")), None)
    if l1_td3 is not None:
        resto = [l for l in largas if l is not l1_td3]
        l2_td3 = next((l for l in resto if re.match(r"^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}", l)), None)
        if l2_td3 is not None:
            return parse_td3([l1_td3, l2_td3], hoy=hoy)

    # --- TD1: tres líneas de ~30 ---
    medianas = [l for l in lineas if 26 <= len(l) <= 34]
    l1_td1 = next((l for l in medianas if re.match(r"^I[A-Z0-9<]", l)), None)
    l2_td1 = next((l for l in medianas if re.match(r"^[0-9]{6}[0-9<][MFX<][0-9]{6}", l)), None)
    l3_td1 = next((l for l in medianas
                   if "<<" in l and not re.match(r"^[0-9]", l) and l is not l1_td1), None)
    if l2_td1 is not None:
        return parse_td1([l1_td1 or "", l2_td1, l3_td1 or ""], hoy=hoy)

    # --- Solo hay el renglón del nombre (OCR a medias): al menos se saca el nombre ---
    nombre = next((l for l in lineas if "<<" in l and not re.match(r"^[0-9]", l)), None)
    if nombre is not None:
        datos = {"format": "TD1" if pedido != "PASSPORT" else "TD3", "number": "", "support_number": "",
                 "birth": "", "expiry": "", "sex": "", "nationality": "",
                 "checks": {}, "valid": False, "valid_strict": False}
        datos.update(_nombre(nombre))
        return datos if datos.get("full_name") else None
    return None


def extract_fields(texto: str, kind: str | None = None, *, hoy: date | None = None) -> dict:
    """Campos oficiales de un documento a partir del texto del OCR (MRZ + impreso de respaldo)."""
    mrz = parse_mrz(texto, kind=kind, hoy=hoy) or {}
    numero = mrz.get("number") or ""
    tipo_pedido = (kind or "").strip().upper()
    # En DNI/NIE, si el MRZ no ha dado un número válido, se rebusca en el impreso.
    if tipo_pedido != "PASSPORT" and not (is_valid_dni(numero) or is_valid_nie(numero)):
        del_impreso = find_spanish_id(texto)
        if del_impreso:
            numero = del_impreso
    return {
        "number": numero,
        "number_kind": doc_number_kind(numero),
        "support_number": mrz.get("support_number") or "",
        "full_name": mrz.get("full_name") or "",
        "first_name": mrz.get("first_name") or "",
        "last_name": mrz.get("last_name") or "",
        "birth": mrz.get("birth") or "",
        "expiry": mrz.get("expiry") or "",
        "sex": mrz.get("sex") or "",
        "nationality": mrz.get("nationality") or "",
        "mrz_format": mrz.get("format") or "",
        "mrz_valid": bool(mrz.get("valid")),
        "mrz_valid_strict": bool(mrz.get("valid_strict")),
        "checks": mrz.get("checks") or {},
    }


def build_td1(*, support: str, birth: str, sex: str, expiry: str, nationality: str,
              doc_number: str, surname: str, given: str) -> list[str]:
    """Arma un MRZ TD1 válido. Se usa para PROBAR el lector (y para documentación); las fechas van
    en `aammdd`."""
    l1 = ("ID" + "ESP" + support.ljust(9, "<")[:9] + check_digit(support.ljust(9, "<")[:9])
          + doc_number.ljust(15, "<")[:15]).ljust(30, "<")[:30]
    l2 = (birth + check_digit(birth) + sex + expiry + check_digit(expiry)
          + nationality.ljust(3, "<")[:3] + "<" * 11)
    compuesto = l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29]
    l2 = (l2 + check_digit(compuesto)).ljust(30, "<")[:30]
    l3 = (surname.upper().replace(" ", "<") + "<<" + given.upper().replace(" ", "<")).ljust(30, "<")[:30]
    return [l1, l2, l3]


def build_td3(*, doc_number: str, nationality: str, birth: str, sex: str, expiry: str,
              surname: str, given: str) -> list[str]:
    """Arma un MRZ TD3 válido (para probar el lector)."""
    l1 = ("P<" + nationality.ljust(3, "<")[:3]
          + surname.upper().replace(" ", "<") + "<<" + given.upper().replace(" ", "<")).ljust(44, "<")[:44]
    num = doc_number.ljust(9, "<")[:9]
    personales = "<" * 14
    cuerpo = (num + check_digit(num) + nationality.ljust(3, "<")[:3] + birth + check_digit(birth)
              + sex + expiry + check_digit(expiry) + personales + check_digit(personales))
    compuesto = cuerpo[0:10] + cuerpo[13:20] + cuerpo[21:28] + cuerpo[28:43]
    l2 = (cuerpo + check_digit(compuesto)).ljust(44, "<")[:44]
    return [l1, l2]
