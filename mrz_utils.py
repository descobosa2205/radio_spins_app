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
    arriba = str(texto or "").upper()
    # ⚠️ Los límites de los extremos son imprescindibles: sin ellos «PEDIDO 20260908 REFERENCIA»
    # daba el «DNI» 20260908R —la letra la aportaba la palabra siguiente y la de control acierta
    # por azar 1 de cada 23 veces—.
    for patron in (r"(?<![0-9A-Z])[XYZ][\-\s]?[0-9]{7}[\-\s]?[A-Z](?![A-Z0-9])",
                   r"(?<![0-9A-Z])[0-9]{8}[\-\s]?[A-Z](?![A-Z0-9])"):
        for encaje in re.finditer(patron, arriba):
            candidato = normalize_doc_number(encaje.group(0))
            if is_valid_dni(candidato) or is_valid_nie(candidato):
                return candidato
    return ""


# ================== REPARAR LO QUE EL OCR LEE MAL (por POSICIÓN) =================================
# ⚠️⚠️ ESTO ES LO QUE HACE QUE EL LECTOR FUNCIONE DE VERDAD. En el MRZ cada posición SOLO puede ser
# una cosa: una fecha son seis DÍGITOS y la nacionalidad tres LETRAS. Así que cuando el OCR devuelve
# una «O» donde va un cero, no hay que descartar la lectura: hay que traducirla.
# Antes, UNA sola «O» en la fecha tiraba el MRZ **entero** (ni el nombre se salvaba) y el escáner se
# quedaba «pensando» hasta agotar los intentos: es exactamente lo que se veía como «el lector no
# funciona» y «tarda muchísimo».
#
# Dos capas, en este orden:
#   1) traducción por POSICIÓN — determinista y sin riesgo: lo que debe ser dígito se pasa a dígito
#      y lo que debe ser letra se pasa a letra;
#   2) si aun así el dígito de control no cuadra, se prueban variantes de UN carácter y se acepta
#      solo cuando hay UNA que cuadre. Con dudas no se adivina: se descarta el fotograma y se prueba
#      con el siguiente (que es lo que ya hacía el bucle de la cámara).
#
# ⚠️ Las letras que NO se parecen a ningún dígito (H, K, M, N, W) **no se traducen**: si aparecen en
# un campo numérico, la lectura está tan mal que reparar sería inventar.
_A_DIGITO = {
    "O": "0", "Q": "0", "D": "0", "U": "0", "C": "0",
    "I": "1", "L": "1", "J": "1", "V": "1",
    "Z": "2", "E": "3", "A": "4", "S": "5", "G": "6",
    "T": "7", "Y": "7", "B": "8", "R": "8", "P": "9",
}
_A_LETRA = {"0": "O", "1": "I", "2": "Z", "3": "E", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B", "9": "G"}
# La «M» del sexo en OCR-B se confunde con H/N/W, y la «F» con E/P/R. Lo que no se reconozca queda
# como «no informado» («<»), que ya NO invalida la línea: antes un sexo mal leído tiraba el MRZ.
_SEXO_OCR = {"H": "M", "N": "M", "W": "M", "K": "M", "E": "F", "P": "F", "R": "F"}
# Caracteres que el OCR puede colar en lugar de un dígito (para buscar números en el impreso).
_CONF = "0-9" + "".join(sorted(_A_DIGITO))


def _rellenos(campo: str) -> str:
    """El «<» del MRZ se confunde a menudo con K, L o C: una racha de 3+ letras IDÉNTICAS es relleno.

    ⚠️ Solo se aplica a las zonas de RELLENO (los datos opcionales y el nombre), nunca al número de
    documento: un pasaporte «AAA123456» tiene tres letras iguales de verdad."""
    return re.sub(r"([A-Z])\1{2,}", lambda m: "<" * len(m.group(0)), str(campo or ""))


def _a_digitos(campo: str) -> str:
    """Posición que SOLO puede ser numérica: las letras confundibles pasan a su dígito."""
    return "".join(c if (c.isdigit() or c == "<") else _A_DIGITO.get(c, c) for c in str(campo or ""))


def _a_letras(campo: str) -> str:
    """Posición que SOLO puede ser alfabética: los dígitos confundibles pasan a su letra."""
    return "".join(_A_LETRA.get(c, c) if c.isdigit() else c for c in str(campo or ""))


def _sexo(caracter: str) -> str:
    caracter = (caracter or "<").upper()
    if caracter in ("M", "F", "X", "<"):
        return caracter
    return _SEXO_OCR.get(caracter, "<")


def _variantes_un_digito(campo: str):
    """El campo con UN dígito cambiado (todas las combinaciones)."""
    for i in range(len(campo)):
        for alt in "0123456789":
            if alt != campo[i]:
                yield campo[:i] + alt + campo[i + 1:]


def _arregla_por_check(campo: str, digito: str, valida=None) -> str:
    """Corrige un carácter del campo si con eso cuadra su dígito de control.

    Solo se acepta cuando la solución es ÚNICA (y pasa la comprobación extra que se pase, p. ej.
    «es una fecha de calendario creíble»). Si hay más de una posibilidad, se devuelve lo leído: es
    mejor descartar el fotograma que colar un dato inventado."""
    campo = str(campo or "")
    if check_ok(campo, digito) and (valida is None or valida(campo)):
        return campo
    if not str(digito or "").isdigit() or not campo.isdigit():
        return campo
    encontradas = []
    for candidato in _variantes_un_digito(campo):
        if check_digit(candidato) == digito and (valida is None or valida(candidato)):
            encontradas.append(candidato)
            if len(encontradas) > 1:
                return campo
    return encontradas[0] if len(encontradas) == 1 else campo


def _fecha_creible(yymmdd: str, futura: bool, hoy: date | None = None) -> bool:
    return bool(_fecha(yymmdd, futura, hoy))


def repara_td1(l1: str, l2: str, l3: str) -> tuple:
    """Deja las tres líneas del TD1 con lo que puede haber en cada posición."""
    l1 = str(l1 or "").ljust(30, "<")[:30]
    l2 = str(l2 or "").ljust(30, "<")[:30]
    n1 = (_a_letras(l1[0:5]) + l1[5:14] + _a_digitos(l1[14]) + _rellenos(l1[15:30]))
    if n1[:1] in ("1", "|"):                      # «ID» leído como «1D»
        n1 = "I" + n1[1:]
    n2 = (_a_digitos(l2[0:6]) + _a_digitos(l2[6]) + _sexo(l2[7]) + _a_digitos(l2[8:14])
          + _a_digitos(l2[14]) + _a_letras(l2[15:18]) + _rellenos(l2[18:29]) + _a_digitos(l2[29]))
    return n1, n2, _a_letras(_rellenos(l3))       # un nombre no lleva dígitos ni letras triples


def repara_td3(l1: str, l2: str) -> tuple:
    """Deja las dos líneas del TD3 (pasaporte) con lo que puede haber en cada posición."""
    l1 = str(l1 or "").ljust(44, "<")[:44]
    l2 = str(l2 or "").ljust(44, "<")[:44]
    n1 = _a_letras(l1[0:5] + _rellenos(l1[5:44]))   # tipo + país + nombre: todo alfabético
    n2 = (l2[0:9] + _a_digitos(l2[9]) + _a_letras(l2[10:13]) + _a_digitos(l2[13:19])
          + _a_digitos(l2[19]) + _sexo(l2[20]) + _a_digitos(l2[21:27]) + _a_digitos(l2[27])
          + _rellenos(l2[28:42]) + _a_digitos(l2[42]) + _a_digitos(l2[43]))
    return n1, n2


_A_LETRA_CONTROL = {"0": "O", "1": "I", "2": "Z", "3": "E", "4": "A", "5": "S", "6": "G",
                    "7": "T", "8": "B", "9": "G"}


def repara_dni(valor: str, *, letra_confundible: bool = False) -> str:
    """DNI/NIE con las confusiones del OCR corregidas, o «» si no cuadra la letra de control.

    ⚠️ La LETRA no se toca nunca: es la comprobación. Reparándola, cualquier tira de ocho dígitos
    daría un «DNI válido» y entraría ruido en la base."""
    crudo = normalize_doc_number(valor)
    if is_valid_dni(crudo) or is_valid_nie(crudo):
        return crudo
    if len(crudo) != 9:
        return ""
    cuerpo, letra = crudo[:-1], crudo[-1]
    if not letra.isalpha():
        # ⚠️ La letra de control leída como un DÍGITO («12345678Z» → «123456782») es el fallo más
        # típico del OCR del impreso. Se traduce a la letra que se le parece y **se comprueba el
        # mod-23**: si cuadra, es la buena (por azar solo acertaría 1 de cada 23). Solo se hace
        # cuando el número viene pegado a su rótulo («DNI …»), porque en un texto suelto cualquier
        # teléfono de nueve dígitos podría colar.
        if not (letra_confundible and letra in _A_LETRA_CONTROL and cuerpo.isdigit()):
            return ""
        letra = _A_LETRA_CONTROL[letra]
    prefijo = ""
    if cuerpo[:1] in _PREFIJO_NIE:
        prefijo, cuerpo = cuerpo[0], cuerpo[1:]
    elif cuerpo[:1] in ("X", "Y", "Z"):
        prefijo, cuerpo = cuerpo[0], cuerpo[1:]
    candidato = prefijo + _a_digitos(cuerpo) + letra
    if is_valid_dni(candidato) or is_valid_nie(candidato):
        return candidato
    return ""


def find_spanish_id_ocr(texto: str) -> str:
    """DNI o NIE dentro de un texto que puede traer confusiones del OCR («O» por 0, «S» por 5…).

    Primero se busca en limpio (`find_spanish_id`); solo si no aparece nada se admiten los
    caracteres confundibles, y entonces se exige que **al menos 6 de los 8 sean dígitos de verdad**:
    sin eso, cualquier palabra de nueve letras podría traducirse a un número y colar por azar (la
    letra de control solo acierta 1 de cada 23)."""
    limpio = find_spanish_id(texto)
    if limpio:
        return limpio
    arriba = str(texto or "").upper()
    for patron in (rf"(?<![A-Z0-9])[XYZ][{_CONF}]{{7}}[A-Z](?![A-Z0-9])",
                   rf"(?<![A-Z0-9])[{_CONF}]{{8}}[A-Z](?![A-Z0-9])"):
        for encaje in re.finditer(patron, arriba):
            crudo = normalize_doc_number(encaje.group(0))
            cuerpo = crudo[1:-1] if crudo[:1] in ("X", "Y", "Z") else crudo[:-1]
            if sum(1 for c in cuerpo if c.isdigit()) < 6:
                continue
            arreglado = repara_dni(crudo)
            if arreglado:
                return arreglado
    return ""

# ------------------------------------- MRZ TD1 ---------------------------------------------------
def parse_td1(lineas: list[str], *, hoy: date | None = None, repara: bool = True) -> dict:
    """DNI / NIE / permiso de conducir (3 líneas de 30)."""
    l1, l2, l3 = (list(lineas) + ["", "", ""])[:3]
    if repara:
        l1, l2, l3 = repara_td1(l1, l2, l3)
    else:
        l1, l2 = l1.ljust(30, "<")[:30], l2.ljust(30, "<")[:30]
    soporte_raw = l1[5:14]
    dc_soporte = l1[14]
    opcional1 = l1[15:30].replace("<", "").strip()
    nacimiento_raw, dc_nac = l2[0:6], l2[6]
    sexo = l2[7]
    caducidad_raw, dc_cad = l2[8:14], l2[14]
    nacionalidad = l2[15:18].replace("<", "").strip()
    opcional2 = l2[18:29].replace("<", "").strip()
    dc_compuesto = l2[29]

    # Un carácter mal leído en una fecha se corrige con su dígito de control (solo si la solución es
    # única y la fecha resultante existe en el calendario).
    nacimiento_raw = _arregla_por_check(nacimiento_raw, dc_nac,
                                        lambda v: _fecha_creible(v, False, hoy))
    caducidad_raw = _arregla_por_check(caducidad_raw, dc_cad,
                                       lambda v: _fecha_creible(v, True, hoy))

    # El DNI/NIE va en los datos opcionales; el hueco «número de documento» lleva el nº de soporte.
    numero = ""
    for candidato in (opcional1, opcional2):
        encontrado = find_spanish_id(candidato) or repara_dni(candidato) or find_spanish_id_ocr(candidato)
        if encontrado:
            numero = encontrado
            break
    if not numero:
        # Documento no español (u OACI genérico): el número es el del hueco de siempre.
        numero = normalize_doc_number(soporte_raw)

    compuesto = l1[5:30] + l2[0:7] + l2[8:15] + l2[18:29]
    checks = {
        "document": check_ok(soporte_raw, dc_soporte),
        "birth": check_ok(nacimiento_raw, dc_nac),
        "expiry": check_ok(caducidad_raw, dc_cad),
        "composite": check_ok(compuesto, dc_compuesto),
    }
    datos = {
        "format": "TD1",
        "number": numero,
        "support_number": normalize_doc_number(soporte_raw),
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
def parse_td3(lineas: list[str], *, hoy: date | None = None, repara: bool = True) -> dict:
    """Pasaporte (2 líneas de 44)."""
    l1, l2 = (list(lineas) + ["", ""])[:2]
    if repara:
        l1, l2 = repara_td3(l1, l2)
    else:
        l1, l2 = l1.ljust(44, "<")[:44], l2.ljust(44, "<")[:44]
    pais = l1[2:5].replace("<", "").strip()
    numero, dc_num = l2[0:9], l2[9]
    nacionalidad = l2[10:13].replace("<", "").strip()
    nacimiento_raw, dc_nac = l2[13:19], l2[19]
    sexo = l2[20]
    caducidad_raw, dc_cad = l2[21:27], l2[27]
    personales, dc_personales = l2[28:42], l2[42]
    dc_compuesto = l2[43]

    nacimiento_raw = _arregla_por_check(nacimiento_raw, dc_nac,
                                        lambda v: _fecha_creible(v, False, hoy))
    caducidad_raw = _arregla_por_check(caducidad_raw, dc_cad,
                                       lambda v: _fecha_creible(v, True, hoy))

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


# ================== LA CARA DELANTERA (el impreso, que NO tiene MRZ) ============================
# ⚠️⚠️ EN EL DNI ESPAÑOL EL MRZ ESTÁ EN EL REVERSO, así que un lector que solo sepa leer el MRZ le
# pide a la gente «la parte de atrás»… y quien pone la cara de la foto —que es «el DNI» para
# cualquiera— no consigue nada nunca. Aquí se lee la CARA DELANTERA del impreso: el número (que se
# comprueba con su letra de control), el nombre y los apellidos (por sus rótulos) y las fechas.
#
# El pasaporte no necesita esto: su MRZ está en la propia página de datos.
_ANV_IGNORA = re.compile(
    r"\b(ESPA[NÑ]A|SPAIN|REINO|DOCUMENTO|NACIONAL|IDENTIDAD|IDENTITY|IDENTIFICACI[OÓ]N|MINISTERIO|"
    r"INTERIOR|DIRECCI[OÓ]N|GENERAL|POLIC[IÍ]A|TARJETA|EXTRANJERO|RESIDENCIA|PERMISO|CONDUCIR|"
    r"UNI[OÓ]N|EUROPEA|SEXO|SEX|NACIONALIDAD|NATIONALITY|VALIDEZ|IDESP|SOPORTE|DOMICILIO|EQUIPO|"
    r"HIJ[OA]|LUGAR|NACIMIENTO|CADUCIDAD|EXPEDICI[OÓ]N|N[UÚ]MERO|NUM|DNI|NIE|CARD|CARTE|IDENTITE)\b")
_RE_ANV_APELLIDOS = re.compile(r"\b(?:PRIMER\s+)?APELLIDOS?\b|\bSURNAMES?\b")
_RE_ANV_NOMBRE = re.compile(r"\bNOMBRES?\b|\bGIVEN\s+NAMES?\b")
# Las fechas del DNI van impresas con ESPACIOS («01 01 1980»), así que el patrón de siempre
# (`dd/mm/aaaa`) no encontraba ninguna. Se admiten además los caracteres que el OCR confunde con
# dígitos, y después se traduce y se comprueba el calendario.
# ⚠️ Los separadores son OPCIONALES: el OCR junta los grupos («0101 1980», «01011980») y con el
# patrón de siempre no se encontraba NINGUNA fecha. Lo que descarta la basura es el calendario.
_RE_ANV_FECHA = re.compile(rf"(?<![0-9])([{_CONF}]{{2}})[\s./\-]{{0,3}}([{_CONF}]{{2}})[\s./\-]{{0,3}}([{_CONF}]{{4}})(?![0-9])")
_RE_ANV_SOPORTE = re.compile(r"\b([A-Z]{3}[0-9]{6})\b")
# Rótulos que dicen «esto es un documento de identidad». Se cuentan los DISTINTOS: con dos o más, el
# texto es un documento y no un contrato ni una factura.
_RE_ANV_PISTAS = re.compile(
    r"\b(APELLIDOS?|NOMBRES?|VALIDEZ|NACIONALIDAD|IDESP|SOPORTE|NACIMIENTO|IDENTIDAD|"
    r"SURNAMES?|EXTRANJERO|CADUCIDAD)\b")
# Un teléfono también son nueve dígitos: si van pegados a su rótulo, no se tocan.
_RE_ANV_TELEFONO = re.compile(r"\b(?:TEL[EÉ]FONO|TELF?|M[OÓ]VIL|FAX|WHATSAPP)\b[^0-9]{0,12}$")


def _anv_limpia_nombre(texto: str) -> str:
    """Lo que puede ser un nombre o unos apellidos (y descarta los rótulos del documento)."""
    limpio = re.sub(r"[^A-ZÁÉÍÓÚÜÑÇ'\- ]", " ", str(texto or "").upper())
    limpio = re.sub(r"\s+", " ", limpio).strip(" -'")
    if len(limpio) < 2 or len(limpio) > 60:
        return ""
    if _ANV_IGNORA.search(limpio) or _RE_ANV_APELLIDOS.search(limpio) or _RE_ANV_NOMBRE.search(limpio):
        return ""
    return limpio


def _anv_valor_tras(lineas: list, patron, maximo: int = 2) -> str:
    """El valor que sigue a un rótulo: en la misma línea o en las siguientes (el DNI lo pone debajo)."""
    for i, linea in enumerate(lineas):
        encaje = patron.search(linea.upper())
        if not encaje:
            continue
        valor = _anv_limpia_nombre(linea[encaje.end():])
        if valor:
            return valor
        for k in range(1, maximo + 1):
            if i + k < len(lineas):
                valor = _anv_limpia_nombre(lineas[i + k])
                if valor:
                    return valor
        return ""
    return ""


def _anv_fechas(texto: str) -> list:
    """Fechas del impreso, con su posición en el texto: [(date, posición)]."""
    salida = []
    for encaje in _RE_ANV_FECHA.finditer(str(texto or "").upper()):
        crudo = "".join(encaje.groups())
        # ⚠️ Tiene que quedar algo legible de verdad: al menos 3 de los 8 caracteres son dígitos y
        # el AÑO (que es el trozo largo y el que decide) tiene 2 de sus 4. Con menos que eso no se
        # está leyendo una fecha: se está adivinando.
        if sum(1 for c in crudo if c.isdigit()) < 3:
            continue
        if sum(1 for c in encaje.group(3) if c.isdigit()) < 2:
            continue
        dd, mm, aaaa = (_a_digitos(g) for g in encaje.groups())
        if not (dd.isdigit() and mm.isdigit() and aaaa.isdigit()):
            continue
        try:
            fecha = date(int(aaaa), int(mm), int(dd))
        except ValueError:
            continue
        if 1900 <= fecha.year <= 2100:
            salida.append((fecha, encaje.start()))
    return salida


def _anv_fecha_tras(texto: str, patron: str, fechas: list) -> str:
    """La primera fecha que aparece tras un rótulo («FECHA DE NACIMIENTO», «VALIDEZ»…)."""
    arriba = str(texto or "").upper()
    for encaje in re.finditer(patron, arriba):
        for fecha, pos in fechas:
            if 0 <= pos - encaje.end() <= 90:
                return fecha.isoformat()
    return ""


def _dni_con_letra_leida_como_digito(plano: str) -> str:
    """Nueve dígitos donde el último es la letra de control mal leída («…78Z» → «…782»).

    Solo se usa cuando el texto ES un documento (dos o más rótulos) y solo si hay UNA solución: con
    dos candidatos distintos no se adivina. Lo que va pegado a «Teléfono» o «Móvil» se descarta."""
    encontradas = []
    for encaje in re.finditer(r"(?<![0-9A-Z])([0-9]{9})(?![0-9A-Z])", plano):
        if _RE_ANV_TELEFONO.search(plano[:encaje.start()]):
            continue
        arreglado = repara_dni(encaje.group(1), letra_confundible=True)
        if arreglado and arreglado not in encontradas:
            encontradas.append(arreglado)
    return encontradas[0] if len(encontradas) == 1 else ""


def parse_front(texto: str, *, hoy: date | None = None) -> dict:
    """Lee la CARA DELANTERA de un DNI/NIE (o el impreso de cualquier documento sin MRZ)."""
    hoy = hoy or date.today()
    lineas = [l.strip() for l in re.split(r"[\r\n]+", str(texto or "")) if l.strip()]
    plano = "\n".join(lineas).upper()

    # --- Número: el que va junto a su rótulo manda sobre cualquier otro del impreso ---
    numero = ""
    # ⚠️ El rótulo se admite MAL LEÍDO («DN» por «DNI», «N1E» por «NIE»): es lo que devuelve el OCR
    # de verdad, y sin esa tolerancia el número se quedaba sin leer teniéndolo delante.
    junto = re.search(r"\b(?:D\.?N\.?I?|N\.?[I1]\.?E|N[UÚ]M(?:ERO)?\.?\s*(?:DE\s+)?(?:DOCUMENTO|DNI|NIE)?)\b"
                      r"[^0-9A-Z]{0,12}([0-9A-Z][0-9A-Z\-\s]{7,13})", plano)
    if junto:
        numero = (find_spanish_id_ocr(junto.group(1))
                  or repara_dni(normalize_doc_number(junto.group(1))[:9], letra_confundible=True))
    if not numero:
        numero = find_spanish_id_ocr(plano)
    if not numero and len({m.group(1) for m in _RE_ANV_PISTAS.finditer(plano)}) >= 2:
        # Con dos o más rótulos de documento, lo que hay delante ES un DNI: se admite que la letra de
        # control se haya leído como un dígito, exigiendo que la solución sea ÚNICA.
        numero = _dni_con_letra_leida_como_digito(plano)

    # --- Nombre y apellidos por sus rótulos (el MRZ no está, así que es la única forma) ---
    apellidos = _anv_valor_tras(lineas, _RE_ANV_APELLIDOS)
    nombre = _anv_valor_tras(lineas, _RE_ANV_NOMBRE)

    # --- Fechas: primero por rótulo y, si no hay, por lógica (la más antigua es el nacimiento) ---
    fechas = _anv_fechas(plano)
    nacimiento = _anv_fecha_tras(plano, r"FECHA\s+DE\s+NACIMIENTO|F(?:ECHA)?\.?\s*NAC\b|NACIMIENTO|"
                                        r"DATE\s+OF\s+BIRTH|BIRTH", fechas)
    caducidad = _anv_fecha_tras(plano, r"VALIDEZ|V[AÁ]LIDO\s+HASTA|CADUCIDAD|EXPIRY|"
                                       r"DATE\s+OF\s+EXPIRY", fechas)
    if not nacimiento:
        pasadas = [f for f, _ in fechas if f < hoy]
        if pasadas:
            nacimiento = min(pasadas).isoformat()
    if not caducidad:
        futuras = [f for f, _ in fechas if f >= hoy]
        if futuras:
            caducidad = max(futuras).isoformat()
    # ⚠️ Si la de nacimiento y la de caducidad han salido la misma, no se sabe cuál es cuál.
    if nacimiento and nacimiento == caducidad:
        caducidad = ""

    soporte = ""
    encaje = _RE_ANV_SOPORTE.search(plano)
    if encaje:
        soporte = encaje.group(1)

    # ⚠️ El DNI pone los rótulos en una línea («SEXO NACIONALIDAD FECHA DE NACIMIENTO») y los
    # valores en la SIGUIENTE («M ESP 01 01 1980»), así que hay que mirar también la línea de abajo.
    sexo = ""
    encaje = re.search(r"\b(?:SEXO|SEX)\b[^A-Z0-9]{0,10}([MF])\b", plano)
    if encaje:
        sexo = encaje.group(1)
    else:
        for i, linea in enumerate(lineas):
            if re.search(r"\b(?:SEXO|SEX)\b", linea.upper()) and i + 1 < len(lineas):
                suelta = re.match(r"\s*([MF])\b", lineas[i + 1].upper())
                if suelta:
                    sexo = suelta.group(1)
                break

    nacionalidad = ""
    encaje = re.search(r"\b(?:NACIONALIDAD|NATIONALITY)\b[^A-Z]{0,10}([A-Z]{3})\b", plano)
    if encaje:
        nacionalidad = encaje.group(1)
    elif re.search(r"\bESP\b", plano):
        nacionalidad = "ESP"

    # ⚠️ El nombre solo se da por bueno si de verdad se ha leído un documento (hay número o hay
    # fechas): sobre un texto cualquiera, la palabra «NOMBRE» aparece en cualquier parte y se
    # colaba como si fuera el de una persona.
    if not (numero or fechas):
        nombre = apellidos = ""
    completo = f"{nombre} {apellidos}".strip() if (nombre and apellidos) else (nombre or apellidos)
    return {
        "source": "FRONT",
        "number": numero,
        "support_number": soporte,
        "first_name": title_case(nombre),
        "last_name": title_case(apellidos),
        "full_name": title_case(completo),
        "birth": nacimiento,
        "expiry": caducidad,
        "sex": sexo,
        "nationality": nacionalidad,
    }


# --------------------------------- Punto de entrada ----------------------------------------------
def _desdobla(linea: str) -> list:
    """El OCR puede devolver las líneas del MRZ PEGADAS en una sola: se parten por su longitud.

    Un TD1 son 3×30 (90) y un TD3 2×44 (88); leyendo la banda de una vez es normal que salgan juntas
    y, sin esto, esa lectura se descartaba entera.
    ⚠️ Se devuelven **todas** las particiones que encajan, no solo la primera: 88 caracteres son
    2×44 (un pasaporte) pero también entran en 3×30 y, quedándose con una, el pasaporte pegado se
    leía partido por donde no era. Quien decide es `parse_mrz`, que mira la FORMA de cada trozo."""
    n, salida = len(linea), []
    for ancho, veces in ((44, 2), (30, 3), (30, 2)):
        largo = ancho * veces
        if largo - 2 <= n <= largo + 2:
            salida.append([linea[k * ancho:(k + 1) * ancho] for k in range(veces)])
    if not salida:
        return [linea]
    trozos = []
    for particion in salida:
        for t in particion:
            if t and t not in trozos:
                trozos.append(t)
    return trozos


def _es_l2_td1(linea: str) -> bool:
    """¿Tiene la forma de la línea 2 de un TD1 (dos fechas + sexo), ya reparada?

    ⚠️ Se exige que la MAYORÍA de esas posiciones sean dígitos DE VERDAD (11 de 14): traduciendo a
    ciegas, «IDESPBAA000589…» —que es la línea 1— también casaba con «siete dígitos + sexo + siete
    dígitos» y se leía el MRZ del revés."""
    if not (26 <= len(linea) <= 34):
        return False
    crudo = linea[0:7] + linea[8:15]
    if sum(1 for c in crudo if c.isdigit()) < 11:
        return False
    forma = _a_digitos(linea[0:7]) + _sexo(linea[7:8]) + _a_digitos(linea[8:15])
    if not re.match(r"^[0-9]{7}[MFX<][0-9]{7}", forma):
        return False
    # Y que las dos fechas existan en el calendario.
    return bool(_fecha(forma[0:6], False) and _fecha(forma[8:14], True))


def _es_l1_td1(linea: str) -> bool:
    """Línea 1 del TD1: empieza por «I» y lleva el número de soporte (o sea, dígitos)."""
    if not (26 <= len(linea) <= 34) or _a_letras(linea[0:1]) != "I":
        return False
    return sum(1 for c in linea[5:15] if c.isdigit()) >= 4


def _es_l3_td1(linea: str) -> bool:
    """Línea del nombre: «APELLIDOS<<NOMBRES». Un nombre no lleva dígitos."""
    if not (26 <= len(linea) <= 34) or "<<" not in linea:
        return False
    if sum(1 for c in linea if c.isdigit()) > 2:
        return False
    return sum(1 for c in linea if c.isalpha()) >= 3


def _es_l2_td3(linea: str) -> bool:
    if len(linea) < 40:
        return False
    crudo = linea[13:20] + linea[21:28]
    if sum(1 for c in crudo if c.isdigit()) < 11:
        return False
    forma = (linea[0:9] + _a_digitos(linea[9:10]) + _a_letras(linea[10:13])
             + _a_digitos(linea[13:19]) + _a_digitos(linea[19:20]) + _sexo(linea[20:21])
             + _a_digitos(linea[21:27]))
    if not re.match(r"^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}[0-9<][MFX<][0-9]{6}", forma):
        return False
    return bool(_fecha(forma[13:19], False) and _fecha(forma[21:27], True))


def _candidatas(texto: str) -> list[str]:
    """Líneas del OCR que tienen pinta de MRZ (largas y solo con A-Z0-9<)."""
    salida = []
    for cruda in re.split(r"[\r\n]+", str(texto or "")):
        limpia = _limpia_linea(cruda)
        if len(limpia) < 24:
            continue
        for trozo in _desdobla(limpia):
            if len(trozo) < 24:
                continue
            # Se admite sin rellenos «<» si la forma ya es reconocible: una línea de fechas del TD1
            # puede venir sin ninguno y antes se descartaba.
            if "<" in trozo or _es_l2_td1(trozo) or _es_l2_td3(trozo):
                salida.append(trozo)
    return salida


def parse_mrz(texto: str, *, kind: str | None = None, hoy: date | None = None) -> dict | None:
    """Lee el MRZ de un texto de OCR. Devuelve los datos o None si no hay MRZ reconocible.

    Elige TD3 o TD1 por la FORMA de las líneas, no por lo que diga el usuario: si alguien sube un
    pasaporte diciendo que es un DNI, se lee bien igualmente.
    ⚠️ La forma se comprueba **sobre la línea ya reparada** (`_a_digitos`/`_a_letras`): antes una
    sola letra donde iba un dígito hacía que la línea no se reconociera y se perdía el MRZ entero."""
    lineas = _candidatas(texto)
    if not lineas:
        return None
    pedido = (kind or "").strip().upper()

    # --- TD3: dos líneas de ~44, una empieza por P ---
    largas = [l for l in lineas if len(l) >= 40]
    l1_td3 = next((l for l in largas if _a_letras(l[0:1]) == "P"), None)
    if l1_td3 is not None:
        resto = [l for l in largas if l is not l1_td3]
        l2_td3 = next((l for l in resto if _es_l2_td3(l)), None)
        if l2_td3 is not None:
            return parse_td3([l1_td3, l2_td3], hoy=hoy)

    # --- TD1: tres líneas de ~30 ---
    medianas = [l for l in lineas if 26 <= len(l) <= 34]
    l2_td1 = next((l for l in medianas if _es_l2_td1(l)), None)
    l1_td1 = next((l for l in medianas if l is not l2_td1 and _es_l1_td1(l)), None)
    l3_td1 = next((l for l in medianas
                   if l is not l1_td1 and l is not l2_td1 and _es_l3_td1(l)), None)
    if l2_td1 is not None:
        return parse_td1([l1_td1 or "", l2_td1, l3_td1 or ""], hoy=hoy)

    # --- Solo hay el renglón del nombre (OCR a medias): al menos se saca el nombre ---
    nombre = next((l for l in lineas if _es_l3_td1(l)), None)
    if nombre is not None:
        datos = {"format": "TD1" if pedido != "PASSPORT" else "TD3", "number": "", "support_number": "",
                 "birth": "", "expiry": "", "sex": "", "nationality": "",
                 "checks": {}, "valid": False, "valid_strict": False}
        datos.update(_nombre(_a_letras(nombre)))
        return datos if datos.get("full_name") else None
    return None


def extract_fields(texto: str, kind: str | None = None, *, hoy: date | None = None) -> dict:
    """Campos oficiales de un documento a partir del texto del OCR.

    ⚠️ Manda el MRZ (lleva el nombre partido en apellidos/nombre, las fechas sin ambigüedad y
    dígitos de control), pero **lo que el MRZ no dé lo rellena la CARA DELANTERA**: antes del
    impreso solo se rascaba el número, así que quien subía la foto del anverso de su DNI se quedaba
    sin nombre, sin apellidos y sin fechas."""
    mrz = parse_mrz(texto, kind=kind, hoy=hoy) or {}
    anverso = parse_front(texto, hoy=hoy)
    tipo_pedido = (kind or "").strip().upper()

    numero = mrz.get("number") or ""
    if tipo_pedido != "PASSPORT" and not (is_valid_dni(numero) or is_valid_nie(numero)):
        del_impreso = anverso.get("number") or ""
        if del_impreso:
            numero = del_impreso

    def elige(clave):
        return mrz.get(clave) or anverso.get(clave) or ""

    nombre_mrz = bool(mrz.get("full_name"))
    return {
        "number": numero,
        "number_kind": doc_number_kind(numero),
        "support_number": mrz.get("support_number") or anverso.get("support_number") or "",
        "full_name": elige("full_name"),
        "first_name": mrz.get("first_name") or ("" if nombre_mrz else anverso.get("first_name") or ""),
        "last_name": mrz.get("last_name") or ("" if nombre_mrz else anverso.get("last_name") or ""),
        "birth": elige("birth"),
        "expiry": elige("expiry"),
        "sex": elige("sex"),
        "nationality": elige("nationality"),
        "mrz_format": mrz.get("format") or "",
        "mrz_valid": bool(mrz.get("valid")),
        "mrz_valid_strict": bool(mrz.get("valid_strict")),
        # De dónde ha salido el dato: «MRZ» (la banda del reverso) o «FRONT» (la cara delantera).
        "source": "MRZ" if mrz.get("valid") else ("FRONT" if (anverso.get("number") or anverso.get("full_name")) else ""),
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
