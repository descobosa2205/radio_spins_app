"""Lectura de una LIQUIDACIÓN DE ROYALTIES que nos manda una compañía externa.

Motor PURO: aquí no hay Flask ni base de datos. Se le da el fichero (PDF, Excel o CSV) y devuelve
las LÍNEAS que ha podido leer —qué tema es y cuánto ha generado— más el total y el periodo si se
reconocen. Quién es cada tema en nuestra base de datos, cómo se agrupan las líneas repetidas y qué
se hace con ellas lo decide `app.py`, que es el único que puede mirar la base de datos.

Se apoya en los lectores que ya tiene la casa, no en unos nuevos:
  · **`invoice_read.pdf_rows`** reconstruye los RENGLONES VISUALES del PDF con las coordenadas
    reales de cada trozo. Hace falta por lo mismo que en una factura: una liquidación es una TABLA y
    con el texto plano los códigos, los títulos y los importes salen en bloques desordenados.
  · **`invoice_read.parse_amount`** (con su orden de alternativas, el que evita que «1140,97» se lea
    «114») y **`looks_like_amount`** / **`looks_like_date`** para los importes.
  · **`promoter_import.read_rows`** es el lector ÚNICO de Excel/CSV de la casa (primera hoja, sniff
    del delimitador, codificaciones, los decimales que mete Excel) y **`_header_index`** /
    **`_alias_re`** el reconocimiento de la cabecera con rótulos como «I.S.R.C.».

Reglas de fondo:
- **Una línea vale si tiene un IMPORTE y algo con lo que identificar el tema** (un código o un
  título). Lo que no tenga importe no se devuelve: se cuenta en `warnings`, no desaparece en
  silencio.
- **En un PDF el importe de la línea es el ÚLTIMO número del renglón**: en una tabla de liquidación
  antes van las unidades o los streams y lo que se paga es lo de la derecha.
- **Las líneas se devuelven TAL CUAL, sin agrupar**: agrupar por código es cosa de quien llama.
- Todo va con red: una fila que reviente se cuenta en `warnings` y no tira la lectura entera; sin
  `pypdf` o sin `openpyxl` se devuelve `rows: []` y un aviso que lo dice.

⚠️ Si se toca este fichero, `tools/check_royalty_statement_read.py` tiene que seguir en verde.
"""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal, InvalidOperation
from typing import Optional

from invoice_read import (
    _label_pattern,
    looks_like_amount,
    looks_like_date,
    norm,
    parse_amount,
    pdf_rows,
)
from promoter_import import (
    _alias_re,
    _cell_text,
    _header_index,
    norm_header,
    read_rows,
    strip_accents,
)

# Una liquidación es LARGA (una factura son una o dos páginas; esto pueden ser veinte).
PDF_MAX_PAGES = 30

# ── Códigos: ISRC y código de barras ─────────────────────────────────────────────────────────────
# ⚠️ Los códigos vienen escritos de mil formas («ES-A2A-25-00001», «ES A2A 25 00001»,
# «ESA2A2500001»), así que el patrón admite guiones y espacios entre sus cuatro partes: país (2
# letras), registrante (3 alfanuméricos), año (2 dígitos) y designación (5 dígitos).
_SEP = r"[\s\-]*"
ISRC_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"[A-Za-z]{2}" + _SEP + r"[A-Za-z0-9]{3}" + _SEP + r"\d{2}" + _SEP + r"\d{5}"
    r"(?![A-Za-z0-9])")
# UPC/EAN: de 8 a 14 dígitos seguidos. ⚠️ `[\d.,]` en los dos lados para no confundirlo con un
# TROZO de un importe («1234567890,12» no es un código de barras).
BARCODE_RE = re.compile(r"(?<![\d.,])(\d{8,14})(?![.,]?\d)")


def norm_code(text) -> str:
    """Un código en seco: sin guiones, espacios ni puntuación, en mayúsculas. Vacío si no hay."""
    return re.sub(r"[^0-9A-Za-z]+", "", str(text or "")).upper()


def find_code(text):
    """El código que hay en un texto: (código en seco, 'ISRC' | 'BARCODE'), o ('', '').

    El ISRC manda: identifica la grabación, mientras que un código de barras es del producto."""
    crudo = str(text or "")
    m = ISRC_RE.search(crudo)
    if m:
        return norm_code(m.group(0)), "ISRC"
    m = BARCODE_RE.search(crudo)
    if m:
        return norm_code(m.group(1)), "BARCODE"
    return "", ""


# ── Importes ─────────────────────────────────────────────────────────────────────────────────────
# ⚠️ MISMO ORDEN DE ALTERNATIVAS que `invoice_read.AMOUNT` y por la misma razón: con el entero
# suelto delante, «1140,97» casaría solo «114». Aquí además se admite el formato inglés con coma de
# miles («1,234.56»), que es como llegan las liquidaciones de las compañías de fuera.
_MONEY_TOKEN = re.compile(
    r"(?<![\d.,])(?:"
    r"-?\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,4})?"      # 1.140,97 · 1,234.56 · 1 234,56 · 3.500
    r"|-?\d+[.,]\d{1,4}"                                # 1140,97 · 1234.5
    r"|-?\d+"                                           # 1140
    r")(?![\d])")
# Fechas: se quitan del renglón ANTES de buscar importes, o el año de una fecha al final de la fila
# («…  30/06/2026») pasaría por ser lo que se paga.
_DATE_ANY = re.compile(r"(?<!\d)(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})(?!\d)")


def parse_money(text) -> Optional[Decimal]:
    """Un importe → Decimal, en formato español («1.140,97») o inglés («1,234.56»). None si no hay.

    Con los DOS separadores presentes, el decimal es **el ÚLTIMO que aparece** (el criterio de
    `buyer_import.clean_money`, que es el más robusto). Con uno solo manda el criterio de la casa
    (`invoice_read.parse_amount`): la coma es decimal y un punto seguido de tres dígitos es de
    miles. ⚠️ Eso deja ambiguo un «1,234» a secas, que se lee 1,234 (en un fichero español es lo
    más probable); si viniera de un fichero inglés serían mil doscientos treinta y cuatro.

    Un importe entre paréntesis es NEGATIVO (así escriben los abonos muchas compañías).
    """
    crudo = _cell_text(text)
    if not crudo:
        return None
    crudo = crudo.replace("€", " ").replace("$", " ").replace("EUR", " ")
    negativo = bool(re.search(r"\(\s*[\d.,]+\s*\)", crudo))
    m = _MONEY_TOKEN.search(crudo)
    if not m:
        return None
    token = re.sub(r"[\s ]", "", m.group(0))
    if "." in token and "," in token:
        if token.rfind(",") > token.rfind("."):
            token = token.replace(".", "").replace(",", ".")
        else:
            token = token.replace(",", "")
        try:
            valor = Decimal(token)
        except InvalidOperation:
            return None
    else:
        valor = parse_amount(token)
        if valor is None:
            return None
    return -abs(valor) if negativo and valor > 0 else valor


def _money_tokens(texto: str):
    """Los importes de un renglón, en orden: [(inicio, fin, Decimal)].

    Se descartan los PORCENTAJES («21 %» es un tipo, no un importe) y las fechas se han quitado
    antes."""
    limpio = str(texto or "")
    salida = []
    for m in _MONEY_TOKEN.finditer(limpio):
        cola = limpio[m.end():m.end() + 3]
        if re.match(r"\s*%", cola):
            continue
        valor = parse_money(m.group(0))
        if valor is not None:
            salida.append((m.start(), m.end(), valor))
    return salida


def _last_amount(texto: str) -> Optional[Decimal]:
    """El ÚLTIMO importe de un texto (en una tabla de liquidación, lo que se paga)."""
    tokens = _money_tokens(_DATE_ANY.sub(" ", str(texto or "")))
    return tokens[-1][2] if tokens else None


def _is_money_cell(texto) -> bool:
    """¿Esta celda es SOLO un importe? (para el barrido por posición, cuando no hay cabecera)."""
    crudo = _cell_text(texto).replace("€", "").replace("$", "").strip().strip("()").strip()
    if not crudo or not re.search(r"\d", crudo):
        return False
    if looks_like_date(crudo):
        return False
    if looks_like_amount(crudo):                       # formato español (invoice_read)
        return True
    return bool(re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|-?\d+\.\d{1,4}", crudo))


# ── El TOTAL de la liquidación ───────────────────────────────────────────────────────────────────
# En orden de prioridad: el rótulo más específico gana al genérico «total» (que también puede ser el
# de una columna o el de un subtotal por sección).
TOTAL_LABELS = (
    "total royalties", "total a liquidar", "total liquidacion", "total liquidado", "total neto",
    "total general", "importe total", "total", "suma", "suma total",
)


def _total_label_index(texto) -> Optional[int]:
    """Si el texto ES un rótulo de total, su prioridad (0 = el más específico); si no, None.

    ⚠️ Se exige que **detrás del rótulo no queden letras**: si no, un tema que se llamara «Total
    Eclipse of the Heart» se tomaría por la fila del total (y desaparecería de las líneas)."""
    crudo = _cell_text(texto).strip()
    if not crudo:
        return None
    for i, rotulo in enumerate(TOTAL_LABELS):
        m = re.match(r"\s*" + _label_pattern(rotulo) + r"[^A-Za-z0-9]{0,4}", crudo, re.IGNORECASE)
        if not m:
            continue
        cola = crudo[m.end():]
        if re.search(r"[A-Za-z]", strip_accents(cola)):
            continue
        return i
    return None


def _row_total(celdas, tiene_codigo: bool, texto_importe=None):
    """Si el renglón es el del TOTAL, devuelve (prioridad, importe); si no, None.

    Un renglón con código es una línea, nunca el total.

    ⚠️ `texto_importe` es la celda de la COLUMNA DE IMPORTE de ese renglón, y manda: la fila del
    total suele traer varias sumas («Total royalties | 1.290,66 | 2.090,00») y el último número de
    la fila sería el total de OTRA columna, no de la que estamos leyendo (bug real de la prueba).
    Sin columna reconocida se cae al último importe del renglón."""
    if tiene_codigo:
        return None
    for celda in celdas:
        prio = _total_label_index(celda)
        if prio is None:
            continue
        importe = _last_amount(texto_importe) if texto_importe else None
        if importe is None:
            importe = _last_amount(" ".join(_cell_text(c) for c in celdas))
        if importe is None:
            return None
        return prio, importe
    return None


# ── Columnas de una hoja (y de la cabecera de una tabla de un PDF) ───────────────────────────────
# Los alias se comparan sin acentos, sin puntuación y sin mayúsculas (`norm_header`), así que da
# igual cómo estén escritos aquí: «I.S.R.C.», «Código» y «codigo» son lo mismo.
COLUMN_ALIASES = (
    ("code", ("isrc", "codigo isrc", "isrc code", "upc", "ean", "upc ean", "codigo",
              "codigo de barras", "barcode", "cod producto", "codigo de producto", "product code",
              "codigo del producto", "referencia")),
    ("title", ("titulo", "tema", "cancion", "track", "title", "obra", "work", "song",
               "titulo de la obra", "nombre del tema", "track title")),
    ("artist", ("artista", "artist", "interprete", "performer", "artista principal",
                "artista interprete")),
    ("amount", ("importe", "importe neto", "neto", "net", "net royalties", "royalties", "royalty",
                "importe royalties", "liquidacion", "a liquidar", "importe a liquidar", "earnings",
                "ingresos", "revenue", "amount", "net amount", "importe liquidacion", "total")),
    ("period", ("periodo", "semestre", "trimestre", "mes", "period", "periodo de liquidacion")),
)
# ⚠️ De las columnas de importe, «neto / importe / royalties / a liquidar» GANAN a «total»: en una
# liquidación por líneas, «total» suele ser el bruto o el acumulado. Si solo hay «total», se usa esa.
AMOUNT_WEAK_ALIASES = ("total", "total euros", "total eur")
# Los códigos también van por prioridad: el ISRC identifica la grabación; el de barras, el producto.
CODE_STRONG_ALIASES = ("isrc", "codigo isrc", "isrc code")


def _alias_hits(header):
    """Los campos que reconoce un rótulo: [(posición del alias, -largo, campo, alias)] ordenado.

    Manda la posición: en «Periodo de liquidación» gana «periodo» (que empieza en 0) sobre
    «liquidación» (que es un alias de importe y empieza más adelante)."""
    key = norm_header(header)
    if not key:
        return []
    plano = strip_accents(str(header or "")).lower()
    salida = []
    for campo, aliases in COLUMN_ALIASES:
        for alias in aliases:
            corto = norm_header(alias).replace(" ", "")
            if len(corto) < 2:
                continue
            if key == norm_header(alias):
                salida.append((0, -len(corto), campo, alias))
                continue
            m = _alias_re(alias).search(plano)
            if m and len(corto) >= 3:
                salida.append((m.start(), -len(corto), campo, alias))
    salida.sort()
    return salida


def guess_column(header) -> Optional[str]:
    """A qué campo corresponde una columna de la liquidación. None = no nos hace falta."""
    hits = _alias_hits(header)
    return hits[0][2] if hits else None


def _column_score(header, campo: str) -> int:
    """Prioridad de una columna dentro de su campo: 0 la preferida, 1 la de respaldo."""
    aliases = [a for _p, _l, c, a in _alias_hits(header) if c == campo]
    if campo == "amount":
        return 0 if any(a not in AMOUNT_WEAK_ALIASES for a in aliases) else 1
    if campo == "code":
        return 0 if any(a in CODE_STRONG_ALIASES for a in aliases) else 1
    return 0


# ── Periodo ──────────────────────────────────────────────────────────────────────────────────────
_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9,
    "sept": 9, "oct": 10, "nov": 11, "dic": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "apr": 4, "aug": 8, "dec": 12,
}
_ORDINALES = {"primer": 1, "primero": 1, "1er": 1, "1o": 1, "1": 1, "i": 1,
              "segundo": 2, "2do": 2, "2o": 2, "2": 2, "ii": 2,
              "tercer": 3, "tercero": 3, "3er": 3, "3o": 3, "3": 3, "iii": 3,
              "cuarto": 4, "4to": 4, "4o": 4, "4": 4, "iv": 4}
_MES_RE = "|".join(sorted(_MESES, key=len, reverse=True))
_ORD_RE = "|".join(sorted(_ORDINALES, key=len, reverse=True))


def _semestre(anio: int, mes: int) -> str:
    return "%04d-S%d" % (anio, 1 if mes <= 6 else 2)


def parse_period(text) -> str:
    """El PERIODO de una liquidación normalizado a «2026-S1» / «2026-S2». '' si no se reconoce.

    Reconoce «S1 2026», «S2/2026», «2026-S1», «1er semestre 2026», «primer semestre de 2026»,
    «2026 H1», «H2 2026», «enero-junio 2026», «julio 2026» y «2026-07», y también los trimestres
    («T3 2026» → 2026-S2), porque la clave que se devuelve es de SEMESTRE.
    """
    crudo = str(text or "")
    limpio = norm(crudo)                     # minúsculas, sin acentos, sin puntuación
    if not limpio:
        return ""
    # S1 2026 · S2/2026 · h1 2026
    m = re.search(r"(?<![a-z0-9])[sh]\s?([12])\s*(\d{4})(?!\d)", limpio)
    if m:
        return "%s-S%s" % (m.group(2), m.group(1))
    # 2026 S1 · 2026-H2
    m = re.search(r"(?<!\d)(\d{4})\s*[sh]\s?([12])(?![0-9a-z])", limpio)
    if m:
        return "%s-S%s" % (m.group(1), m.group(2))
    # 1er semestre 2026 · primer semestre de 2026 · semestre 1 de 2026
    m = re.search(r"(?<![a-z0-9])(" + _ORD_RE + r")\s+semestre\s*(?:de\s*)?(\d{4})", limpio)
    if m:
        return "%s-S%d" % (m.group(2), min(2, _ORDINALES[m.group(1)]))
    m = re.search(r"semestre\s*(?:n\s*)?([12])\s*(?:de\s*)?(\d{4})", limpio)
    if m:
        return "%s-S%s" % (m.group(2), m.group(1))
    m = re.search(r"semestre\s*(?:de\s*)?(\d{4})\s*([12])(?!\d)", limpio)
    if m:
        return "%s-S%s" % (m.group(1), m.group(2))
    # T3 2026 · 3er trimestre 2026 (la clave sigue siendo el semestre en el que cae)
    m = re.search(r"(?<![a-z0-9])[tq]\s?([1-4])\s*(\d{4})(?!\d)", limpio)
    if m:
        return _semestre(int(m.group(2)), int(m.group(1)) * 3)
    m = re.search(r"(?<![a-z0-9])(" + _ORD_RE + r")\s+trimestre\s*(?:de\s*)?(\d{4})", limpio)
    if m:
        return _semestre(int(m.group(2)), _ORDINALES[m.group(1)] * 3)
    # enero-junio 2026 (manda el PRIMER mes del rango)
    m = re.search(r"(?<![a-z])(" + _MES_RE + r")\s*(?:a|hasta|al|to)?\s*(" + _MES_RE +
                  r")\s*(?:de\s*)?(\d{4})", limpio)
    if m:
        return _semestre(int(m.group(3)), _MESES[m.group(1)])
    # julio 2026 · julio de 2026
    m = re.search(r"(?<![a-z])(" + _MES_RE + r")\s*(?:de\s*)?(\d{4})(?!\d)", limpio)
    if m:
        return _semestre(int(m.group(2)), _MESES[m.group(1)])
    # 2026-07 · 07/2026 (sobre el texto CRUDO: en el normalizado serían dos números sueltos)
    m = re.search(r"(?<!\d)(\d{4})[-/](0?[1-9]|1[0-2])(?!\d)", crudo)
    if m:
        return _semestre(int(m.group(1)), int(m.group(2)))
    m = re.search(r"(?<!\d)(0?[1-9]|1[0-2])[-/](\d{4})(?!\d)", crudo)
    if m:
        return _semestre(int(m.group(2)), int(m.group(1)))
    return ""


# ── Cabeceras y ruido ────────────────────────────────────────────────────────────────────────────
# Palabras que delatan un renglón de RÓTULOS (ahí no hay ninguna línea que leer).
HEADER_WORDS = {
    "isrc", "upc", "ean", "codigo", "barcode", "referencia", "titulo", "title", "tema", "cancion",
    "track", "obra", "work", "song", "artista", "artist", "interprete", "performer", "importe",
    "neto", "net", "royalties", "royalty", "liquidacion", "amount", "earnings", "ingresos",
    "revenue", "unidades", "units", "cantidad", "quantity", "streams", "reproducciones",
    "descargas", "downloads", "periodo", "period", "semestre", "trimestre", "pais", "country",
    "territorio", "territory", "plataforma", "tienda", "store", "tipo", "type", "porcentaje",
    "concepto", "descripcion", "producto", "product", "album", "total", "fecha", "date",
}


def _is_header_text(texto: str, tiene_codigo: bool) -> bool:
    """¿Este renglón es una CABECERA (solo rótulos)? Con un código dentro nunca lo es.

    ⚠️ Un renglón con un IMPORTE casi nunca es una cabecera, así que ahí se exigen TRES palabras de
    rótulo en vez de dos: con dos bastaba para tragarse una línea cuyo título lleve una («Tema sin
    ISRC · 45,10» desaparecía, bug real de la prueba)."""
    if tiene_codigo:
        return False
    palabras = set(norm(texto).split())
    minimo = 3 if _last_amount(texto) is not None else 2
    return len(palabras & HEADER_WORDS) >= minimo


def _clean_title(texto: str, codigo: str) -> str:
    """El TÍTULO de una línea: el texto quitando el código, las fechas, los importes y los %."""
    limpio = str(texto or "")
    if codigo:
        # El código puede venir con guiones o espacios: se busca otra vez y se quita.
        for regex in (ISRC_RE, BARCODE_RE):
            limpio = regex.sub(" ", limpio)
    limpio = _DATE_ANY.sub(" ", limpio)
    limpio = re.sub(r"\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,4})?|\d+[.,]\d{1,4}|\d+", " ", limpio)
    limpio = limpio.replace("%", " ").replace("€", " ")
    # Al quitar los números quedan comas y guiones huérfanos: fuera lo que no lleve ni letra ni
    # dígito (el mismo criterio que `invoice_read._concept_from`).
    limpio = " ".join(p for p in limpio.split()
                      if re.search(r"[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", p))
    return limpio.strip(" -·|,;:.\t")[:200]


def _line(code="", code_kind="", title="", artist="", amount=None, period="", raw="") -> dict:
    return {"code": code, "code_kind": code_kind, "title": " ".join(str(title or "").split()),
            "artist": " ".join(str(artist or "").split()), "amount": amount,
            "period": period, "raw": " ".join(str(raw or "").split())[:400]}


# ── PDF ──────────────────────────────────────────────────────────────────────────────────────────
def _pdf_layout(fila):
    """Las COLUMNAS de una cabecera de tabla: [(x, campo)]. [] si no se reconoce.

    Un campo no puede estar en dos columnas: gana la de mayor prioridad (y, a igualdad, la primera
    de izquierda a derecha, salvo el importe, que suele ir a la derecha)."""
    candidatos = []
    for x, texto in fila:
        campo = guess_column(texto)
        if campo:
            candidatos.append((float(x or 0.0), campo, _column_score(texto, campo)))
    mejor = {}
    for x, campo, score in candidatos:
        actual = mejor.get(campo)
        if actual is None or score < actual[1]:
            mejor[campo] = (x, score)
    layout = sorted((x, campo) for campo, (x, _s) in mejor.items())
    return layout if len(layout) >= 2 else []


def _pdf_cells(piezas, layout) -> dict:
    """Reparte los trozos de un renglón entre las columnas de la cabecera.

    Cada trozo va a la ÚLTIMA columna que empieza a su izquierda: `pdf_rows` da la x de inicio de
    cada celda y los importes suelen ir alineados a la derecha, así que su x cae entre su rótulo y
    el de la columna siguiente."""
    salida = {}
    for x, texto in piezas:
        campo = layout[0][1]
        for cx, c in layout:
            if float(x or 0.0) + 2.0 >= cx:
                campo = c
            else:
                break
        salida.setdefault(campo, []).append(str(texto))
    return {k: " ".join(v).strip() for k, v in salida.items()}


def _read_pdf(data: bytes, salida: dict) -> None:
    filas = pdf_rows(data, max_pages=PDF_MAX_PAGES)
    if not filas:
        try:
            __import__("pypdf")                        # solo para saber si está instalada
        except Exception:
            salida["warnings"].append(
                "No se ha podido leer el PDF: falta la biblioteca pypdf en el servidor.")
            return
        salida["warnings"].append("No se ha podido sacar nada de texto del PDF "
                                  "(¿es un escaneo, una imagen?).")
        return
    paginas = _pdf_page_count(data)
    if paginas > PDF_MAX_PAGES:
        salida["warnings"].append(
            "El PDF tiene %d páginas y solo se han leído las %d primeras."
            % (paginas, PDF_MAX_PAGES))

    layout, cabecera_vista = [], False
    sin_importe = 0
    totales = []
    cabecera_texto = []
    for fila in filas:
        try:
            piezas = [(x, _cell_text(t)) for x, t in fila]
            celdas = [t for _x, t in piezas if t]
            if not celdas:
                continue
            texto = " ".join(celdas)
            codigo, tipo = find_code(texto)

            if _is_header_text(texto, bool(codigo)):
                nueva = _pdf_layout(piezas)
                if nueva:
                    layout, cabecera_vista = nueva, True
                elif not cabecera_vista:
                    cabecera_texto.append(texto)
                continue

            campos = _pdf_cells(piezas, layout) if layout else {}
            total = _row_total(celdas, bool(codigo), campos.get("amount"))
            if total is not None:
                totales.append(total)
                continue
            if not cabecera_vista:
                cabecera_texto.append(texto)
            # El importe: el de su columna y, si ahí no hay nada, el ÚLTIMO del renglón.
            sin_codigo = texto
            if codigo:
                sin_codigo = ISRC_RE.sub(" ", texto) if tipo == "ISRC" else BARCODE_RE.sub(" ", texto)
            importe = _last_amount(campos.get("amount", "")) if campos.get("amount") else None
            if importe is None:
                importe = _last_amount(sin_codigo)

            titulo = campos.get("title", "")
            if titulo:
                titulo = _clean_title(titulo, codigo)
            if not titulo and not layout:
                titulo = _clean_title(texto, codigo)
            artista = _clean_title(campos.get("artist", ""), "") if campos.get("artist") else ""
            periodo = parse_period(campos.get("period", "")) if campos.get("period") else ""

            if importe is None:
                # Solo se cuenta como «línea sin importe» lo que de verdad parece una línea: si no,
                # el membrete y los pies de página inflarían el aviso.
                if codigo or (cabecera_vista and titulo):
                    sin_importe += 1
                continue
            # Sin cabecera reconocida no se da por buena una línea sin código: cualquier renglón
            # con un número («Página 1») pasaría por línea.
            if not codigo and not (cabecera_vista and titulo):
                continue
            salida["rows"].append(_line(codigo, tipo, titulo, artista, importe, periodo, texto))
        except Exception as exc:                       # una fila mala no tira la lectura entera
            salida["warnings"].append("Un renglón del PDF no se ha podido leer (%s)." % _motivo(exc))

    if totales:
        totales.sort(key=lambda t: t[0])
        mejores = [imp for prio, imp in totales if prio == totales[0][0]]
        salida["total"] = mejores[-1]                  # el último con el rótulo más específico
    if sin_importe:
        salida["warnings"].append(
            "%d línea%s sin importe: no se ha%s cargado."
            % (sin_importe, "s" if sin_importe > 1 else "", "n" if sin_importe > 1 else ""))
    if not cabecera_vista:
        salida["warnings"].append(
            "No se ha reconocido la cabecera de la tabla: solo se han leído los renglones con un "
            "código (ISRC o código de barras).")
    salida["period"] = salida["period"] or parse_period(" ".join(cabecera_texto[:40]))


def _pdf_page_count(data: bytes) -> int:
    try:
        from io import BytesIO

        from pypdf import PdfReader
        return len(PdfReader(BytesIO(data)).pages)
    except Exception:
        return 0


# ── Excel / CSV ──────────────────────────────────────────────────────────────────────────────────
def _sheet_mapping(header):
    """{campo: [índices de columna, por prioridad]} de una fila de cabecera."""
    encontrado = {}
    for idx, rotulo in enumerate(header):
        campo = guess_column(rotulo)
        if not campo:
            continue
        encontrado.setdefault(campo, []).append((_column_score(rotulo, campo), idx))
    return {campo: [i for _s, i in sorted(lista)] for campo, lista in encontrado.items()}


def _cell(row, idxs) -> str:
    """El primer valor con contenido de esas columnas (por orden de prioridad)."""
    for idx in idxs or []:
        if 0 <= idx < len(row):
            texto = _cell_text(row[idx])
            if texto:
                return texto
    return ""


def _resplit_csv(data: bytes, filas):
    """Vuelve a partir un CSV que el sniffer haya partido por donde no toca.

    ⚠️ BUG REAL: `csv.Sniffer` se queda con la COMA cuando aparece de forma consistente en todas
    las líneas, y en un CSV español la coma es el separador DECIMAL: «…;Tema;120;45,10» se partía en
    «…;Tema;120;45» y «10», así que el importe salía 10 y el título traía media fila pegada. Si
    alguna celda sigue trayendo dos o más punto y coma (o tabuladores, o barras), el fichero era de
    ESE separador y se lee otra vez con él. No se toca `promoter_import`, que es de todos.
    """
    if not data or bytes(data[:2]) == b"PK":            # un .xlsx es un zip: eso no se toca
        return filas
    for sep in (";", "\t", "|"):
        if not any(str(c or "").count(sep) >= 2 for fila in filas for c in (fila or [])):
            continue
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                texto = data.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            return filas
        nuevas = [list(f) for f in csv.reader(io.StringIO(texto), delimiter=sep)]
        return nuevas or filas
    return filas


def _read_sheet(data: bytes, filename: str, salida: dict) -> None:
    try:
        filas = read_rows(data, filename)
    except ImportError as exc:
        salida["warnings"].append(
            "No se ha podido leer el Excel: falta la biblioteca %s en el servidor."
            % (getattr(exc, "name", "") or "openpyxl"))
        return
    filas = _resplit_csv(data, filas)
    filas = [[_cell_text(c) for c in (f or [])] for f in filas]

    # La cabecera la busca el lector de la casa, pero se le exige que reconozca AL MENOS DOS
    # columnas: si no, una fila de título como «Periodo: S1 2026 | Compañía X» se tomaría por
    # cabecera (reconoce «periodo») y la primera línea de verdad se perdería.
    h = _header_index(filas, guess_column)
    mapping = _sheet_mapping(filas[h]) if 0 <= h < len(filas) else {}
    if len(mapping) < 2:
        mejor, mejor_n = None, 0
        for i, fila in enumerate(filas[:30]):
            m = _sheet_mapping(fila)
            if len(m) > mejor_n:
                mejor, mejor_n, mapping = i, len(m), m
        h = mejor if mejor is not None else h
    hay_cabecera = len(mapping) >= 2 and "amount" in mapping

    cuerpo = filas[h + 1:] if hay_cabecera else filas
    if hay_cabecera:
        salida["period"] = parse_period(" ".join(" ".join(f) for f in filas[:h + 1]))
    else:
        salida["warnings"].append(
            "No se ha reconocido la cabecera del fichero: las columnas se han deducido por "
            "posición (la primera que parece un código, la última que parece un importe y el texto "
            "más largo como título).")

    sin_importe = 0
    totales = []
    for fila in cuerpo:
        try:
            celdas = [c for c in fila if c]
            if not celdas:
                continue                                # fila vacía: fuera
            texto = " ".join(celdas)
            if hay_cabecera:
                codigo, tipo = find_code(_cell(fila, mapping.get("code")) or texto)
                celda_importe = _cell(fila, mapping.get("amount"))
            else:
                codigo, tipo = find_code(texto)
                celda_importe = None

            total = _row_total(celdas, bool(codigo), celda_importe)
            if total is not None:
                totales.append(total)
                continue
            if _is_header_text(texto, bool(codigo)):
                continue                                # otra cabecera (fichero por bloques)

            if hay_cabecera:
                titulo = _cell(fila, mapping.get("title"))
                artista = _cell(fila, mapping.get("artist"))
                importe = parse_money(celda_importe)
                periodo = parse_period(_cell(fila, mapping.get("period")))
            else:
                titulo, artista, importe, periodo = _sweep_row(fila, codigo)

            if importe is None:
                if codigo or titulo:
                    sin_importe += 1
                continue
            if not codigo and not titulo:
                continue                                # sin nada con lo que identificar el tema
            salida["rows"].append(_line(codigo, tipo, titulo, artista, importe, periodo, texto))
        except Exception as exc:
            salida["warnings"].append("Una fila del fichero no se ha podido leer (%s)."
                                      % _motivo(exc))

    if totales:
        totales.sort(key=lambda t: t[0])
        mejores = [imp for prio, imp in totales if prio == totales[0][0]]
        salida["total"] = mejores[-1]
    if sin_importe:
        salida["warnings"].append(
            "%d fila%s con tema pero sin importe: no se ha%s cargado."
            % (sin_importe, "s" if sin_importe > 1 else "", "n" if sin_importe > 1 else ""))


def _sweep_row(fila, codigo: str):
    """Barrido por POSICIÓN cuando no hay cabecera: (título, artista, importe, periodo).

    El importe es la ÚLTIMA celda que parece un importe (y que no es el propio código) y el título
    el texto más largo que no sea ninguno de los dos."""
    importe, idx_importe = None, None
    for i, celda in enumerate(fila):
        if codigo and norm_code(celda) == codigo:
            continue
        if _is_money_cell(celda):
            valor = parse_money(celda)
            if valor is not None:
                importe, idx_importe = valor, i
    titulo, periodo = "", ""
    for i, celda in enumerate(fila):
        if i == idx_importe or not celda:
            continue
        if codigo and norm_code(celda) == codigo:
            continue
        if not periodo:
            periodo = parse_period(celda)
        if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}", celda):
            continue
        if len(celda) > len(titulo):
            titulo = celda
    return titulo, "", importe, periodo


# ── Entrada ──────────────────────────────────────────────────────────────────────────────────────
# Los motivos que sueltan las bibliotecas van en inglés y no se entienden: los habituales se dicen
# en español (el resto se pasa tal cual, que es mejor que callarlo).
_MOTIVOS = (
    ("line contains nul", "el fichero no es un CSV ni un Excel (parece binario)"),
    ("not a zip file", "el fichero no es un Excel válido"),
    ("codificacion desconocida", "no se ha podido leer el CSV (codificación desconocida)"),
    ("esta vacio", "el fichero está vacío"),
)


def _motivo(exc) -> str:
    nombre = getattr(exc, "name", "") if isinstance(exc, ImportError) else ""
    if nombre:
        return "falta la biblioteca %s" % nombre
    texto = str(exc).strip()
    plano = norm(texto)
    for pista, claro in _MOTIVOS:
        if pista in plano:
            return claro
    return texto[:160] or exc.__class__.__name__


def _looks_pdf(data: bytes, filename: str = "") -> bool:
    if str(filename or "").lower().endswith(".pdf"):
        return True
    return bool(data) and bytes(data[:5]) == b"%PDF-"


def read_statement(data: bytes, filename: str = "") -> dict:
    """Lee una liquidación de royalties y devuelve sus líneas. Nunca levanta: lo que no se puede
    leer se dice en `warnings`.

    {
      "kind": "PDF" | "SHEET",
      "rows": [{"code", "code_kind", "title", "artist", "amount", "period", "raw"}],
      "total": Decimal | None,
      "period": str,                # «2026-S1» si se reconoce
      "warnings": [str, …],
    }
    """
    salida = {"kind": "SHEET", "rows": [], "total": None, "period": "", "warnings": []}
    if not data:
        salida["warnings"].append("No hay ningún documento que leer.")
        return salida
    try:
        if _looks_pdf(data, filename):
            salida["kind"] = "PDF"
            _read_pdf(data, salida)
        else:
            _read_sheet(data, filename, salida)
    except Exception as exc:
        salida["warnings"].append("No se ha podido leer el documento: %s." % _motivo(exc))

    # El periodo del documento: lo que diga su cabecera, lo que digan sus líneas o el nombre del
    # fichero (muchas compañías lo ponen ahí: «liquidacion_S1_2026.xlsx»).
    if not salida["period"]:
        salida["period"] = next((r["period"] for r in salida["rows"] if r["period"]), "")
    if not salida["period"]:
        salida["period"] = parse_period(filename)

    sin_codigo = sum(1 for r in salida["rows"] if not r["code"])
    if sin_codigo:
        salida["warnings"].append(
            "%d línea%s sin código: se identifica%s solo por el título."
            % (sin_codigo, "s" if sin_codigo > 1 else "", "n" if sin_codigo > 1 else ""))
    if not salida["rows"]:
        salida["warnings"].append("No se ha reconocido ninguna línea en el documento.")
    elif salida["total"] is None:
        salida["warnings"].append("No se ha reconocido el total de la liquidación en el documento.")
    return salida
