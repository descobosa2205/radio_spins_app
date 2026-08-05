"""Lectura de los DATOS de una factura (número, fechas e importes) a partir del PDF.

Motor PURO: no toca base de datos ni Flask. Recibe el PDF (o su texto) y devuelve lo que ha podido
leer, para que al subir una factura solo haya que preguntar lo que NO se ha podido sacar.

⚠️ Por qué hace falta esto y no basta una regex sobre el texto plano: muchas facturas son TABLAS, y
al extraer el texto los rótulos y los valores salen en bloques separados y en un orden que no tiene
nada que ver con lo que se ve. Ejemplo real (una de las facturas de prueba):

    Número de factura
    Vencimiento
    28/7/2026
    ...
    Fecha de factura
    1003

Ahí «1003» es el número de factura y «28/7/2026» la fecha de emisión, pero por el texto plano
parecería justo lo contrario. Por eso se reconstruyen las **líneas visuales** con las coordenadas de
cada trozo de texto y se emparejan rótulo → valor por COLUMNA:

  · mismo renglón, el valor inmediatamente a la derecha del rótulo;
  · un renglón de rótulos y el siguiente de valores, emparejados por posición;
  · y si no, por cercanía de la columna.

Comprobado con tres facturas reales de proveedores distintos (ver `tools/check_invoice_read.py`).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation

# ------------------------------- Importes -------------------------------------------------------
# ⚠️ EL ORDEN DE LAS ALTERNATIVAS IMPORTA. Antes la primera era
# `\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?`, que en «1140,97» casaba solo «114» (tres dígitos, y el grupo
# de los miles y el de los decimales son opcionales): cualquier importe de cuatro cifras SIN punto de
# miles se leía truncado. Aquí van primero los formatos completos y el entero suelto al final.
AMOUNT = (r"(-?\s*\d{1,3}(?:[.  ]\d{3})+(?:,\d{1,2})?"      # 6.123,39 · 1.285,91 · 6.123
          r"|-?\s*\d+,\d{1,2}"                                    # 1140,97 · 697,69
          r"|-?\s*\d+\.\d{1,2}(?!\d)"                             # 1140.97 (formato inglés)
          r"|-?\s*\d+)")                                          # 8 · 21
_AMOUNT_RE = re.compile(AMOUNT)
# ⚠️ `(?!\d)` en vez de `\b` al final: en los PDF los datos salen PEGADOS («Fecha: 28/7/2026N.º de
# factura: 8») y con `\b` la fecha no casaba porque después del año venía una letra.
_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?!\d)")
_DATE_ISO_RE = re.compile(r"(?<!\d)(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?!\d)")


# Los rótulos se buscan SIN mirar los acentos: en el documento pone «Número de factura» y el rótulo
# que buscamos está escrito sin tildes.
_ACENTOS = {"a": "aáàäâ", "e": "eéèëê", "i": "iíìïî", "o": "oóòöôº", "u": "uúùüû",
            "n": "nñ", "c": "cç"}


def _label_pattern(rotulo: str) -> str:
    """Patrón de un rótulo TOLERANTE a los acentos, a la puntuación y a las letras separadas.

    Los PDF escriben el mismo rótulo de mil formas: «N.º de factura», «I.V.A», «TOT AL», «Nº
    Factura», «Número». Se admite algo de puntuación (o un espacio) entre las letras y algo más entre
    las palabras, con lo que todas esas variantes casan sin tener que enumerarlas."""
    def _car(ch: str) -> str:
        variantes = _ACENTOS.get(ch.lower())
        return ("[" + variantes + variantes.upper() + "]") if variantes else re.escape(ch)

    palabras = [p for p in str(rotulo or "").split() if p]
    trozos = [r"[^A-Za-z0-9]{0,2}".join(_car(c) for c in palabra) for palabra in palabras]
    return r"[^A-Za-z0-9]{0,4}".join(trozos)


def norm(text: str) -> str:
    """Texto comparable: minúsculas, sin acentos, sin puntuación y con los espacios juntos.

    Los espacios se conservan como separador pero se colapsan: hay PDF que dibujan «TOT AL» o
    «I.V.A» y así los dos se reconocen igual."""
    raw = unicodedata.normalize("NFD", str(text or "")).encode("ascii", "ignore").decode("ascii")
    raw = re.sub(r"[^A-Za-z0-9%]+", " ", raw).strip().lower()
    return re.sub(r"\s+", " ", raw)


def _squash(text: str) -> str:
    """Como `norm` pero SIN espacios: «TOT AL» → «total», «I. V. A» → «iva»."""
    return re.sub(r"\s+", "", norm(text))


def parse_amount(text) -> Decimal | None:
    """Un importe suelto → Decimal. Devuelve None si no hay número (un 0 sí es un 0)."""
    raw = str(text or "").strip()
    if not raw:
        return None
    m = _AMOUNT_RE.search(raw.replace("€", " "))
    if not m:
        return None
    limpio = re.sub(r"[\s ]", "", m.group(1))
    # Formato español: el punto es de miles y la coma es decimal.
    if "," in limpio:
        limpio = limpio.replace(".", "").replace(",", ".")
    elif limpio.count(".") > 1:
        limpio = limpio.replace(".", "")
    elif re.search(r"\.\d{3}$", limpio):
        limpio = limpio.replace(".", "")          # «6.123» son seis mil ciento veintitrés
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


def parse_date(text) -> str:
    """Una fecha suelta → ISO (aaaa-mm-dd), o '' si no hay ninguna."""
    raw = str(text or "")
    m = _DATE_RE.search(raw)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return ""
    m = _DATE_ISO_RE.search(raw)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return ""
    return ""


def looks_like_amount(text: str) -> bool:
    limpio = re.sub(r"[\s €]", "", str(text or ""))
    return bool(re.fullmatch(r"-?\d{1,3}(?:[. ]\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?", limpio))


def looks_like_date(text: str) -> bool:
    return bool(_DATE_RE.fullmatch(str(text or "").strip()) or _DATE_ISO_RE.fullmatch(str(text or "").strip()))


# ------------------------------- Rótulos que buscamos --------------------------------------------
# Cada campo con los rótulos que puede llevar, ya normalizados (sin acentos ni puntuación). El orden
# manda: el primero que aparezca en el documento gana.
LABELS = {
    "invoice_number": [
        "numero de factura", "num de factura", "n de factura", "nº de factura", "no de factura",
        "numero factura", "factura numero", "factura n", "factura no", "num factura",
        "invoice number", "invoice no", "invoice",
    ],
    "issue_date": [
        "fecha de factura", "fecha factura", "fecha de emision", "fecha emision",
        "fecha de expedicion", "fecha expedicion", "fecha", "invoice date", "date",
    ],
    "due_date": [
        "fecha de vencimiento", "vencimiento", "due date",
    ],
    "amount_net": [
        "base imponible", "subtotal", "total sin iva", "total antes de iva", "base",
    ],
    "amount_vat": [
        "cuota de iva", "cuota iva", "iva", "i v a", "impuesto sobre el valor anadido",
    ],
    "retention_amount": [
        "retencion irpf", "retenciones", "retencion", "irpf", "ret irpf", "ret", "a cuenta",
    ],
    "amount_gross": [
        "total a pagar", "importe a pagar", "total factura", "total de la factura",
        "importe total", "total", "total eur",
    ],
}
# Rótulos que NO son lo que buscamos aunque se parezcan: se descartan antes de emparejar.
NOT_LABELS = {
    "invoice_number": ["numero de cliente", "num de cliente", "numero de pedido", "numero de albaran",
                       "numero de registro de iva", "numero de nif", "numero de cuenta",
                       "fecha de vencimiento", "vencimiento", "fecha de factura", "numero de pagina",
                       "pagina"],
    "issue_date": ["fecha de vencimiento", "vencimiento", "fecha de pago", "fecha de cobro"],
    "amount_gross": ["total a cuenta", "pagada", "pagado", "pendiente", "anticipo"],
    "amount_net": [],
    "amount_vat": ["numero de registro de iva", "registro de iva", "total sin iva", "iva incluido"],
    "retention_amount": [],
    "due_date": [],
}
# Palabras que delatan la CABECERA de una tabla: ahí los rótulos no llevan valor al lado.
TABLE_HEADER_WORDS = {"cantidad", "precio", "articulo", "descripcion", "tarifa", "importe",
                      "concepto", "unidades", "ud", "uds", "pvp", "detalle"}
# TODOS los rótulos que sabemos reconocer, incluidos los que NO nos interesan («número de cliente»,
# «página»…): hacen falta para contar cuántos rótulos hay en un renglón y emparejarlos por orden con
# los valores del renglón de debajo. De más largo a más corto, para que gane el más específico.
ALL_LABELS = sorted(
    {r for lista in LABELS.values() for r in lista}
    | {r for lista in NOT_LABELS.values() for r in lista}
    | {"numero de pagina", "pagina", "cliente", "articulo", "cantidad", "precio", "descripcion",
       "concepto", "forma de pago", "metodo de pago"},
    key=len, reverse=True)


def _label_head(texto: str, rotulo: str, campo: str):
    """Si el trozo EMPIEZA por ese rótulo, devuelve lo que va detrás (puede ser ''); si no, None.

    Así da igual que el valor venga pegado al rótulo («Total a pagar1209,42 €», «Fecha: 28/7/2026»,
    «N.º de factura: 8»), que es como sale de muchos PDF."""
    crudo = str(texto or "").strip()
    if not crudo:
        return None
    limpio = norm(crudo)
    for malo in NOT_LABELS.get(campo, []):
        if malo in limpio:
            return None
    # El rótulo con la puntuación que le quieran poner por medio («N.º de factura», «I.V.A»).
    m = re.match(r"\s*" + _label_pattern(rotulo) + r"[^A-Za-z0-9]{0,4}", crudo, re.IGNORECASE)
    if not m:
        return None
    cola = crudo[m.end():].strip(" :#-")
    # El PORCENTAJE pegado al rótulo no es el valor («IVA 21% 239,60»).
    if campo in ("amount_vat", "retention_amount", "amount_net", "amount_gross"):
        cola = re.sub(r"^\d{1,2}([.,]\d{1,2})?\s*%", "", cola).strip(" :#-")
    return cola


def _label_match(texto: str, campo: str) -> bool:
    """¿Este trozo de texto ES el rótulo de ese campo (y no uno de los que se le parecen)?"""
    return any(_label_head(texto, r, campo) is not None for r in LABELS.get(campo, []))


def _value_ok(texto: str, campo: str) -> bool:
    """¿Este trozo puede ser el VALOR de ese campo?"""
    crudo = str(texto or "").strip(" :€")
    if not crudo:
        return False
    if campo in ("issue_date", "due_date"):
        return looks_like_date(crudo)
    if campo in ("amount_net", "amount_vat", "retention_amount", "amount_gross"):
        return looks_like_amount(crudo) and not crudo.endswith("%")
    if campo == "invoice_number":
        # Un número de factura lleva al menos un dígito, admite / - . y no es una fecha ni un importe.
        if looks_like_date(crudo) or "%" in crudo:
            return False
        if not re.search(r"\d", crudo):
            return False
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-/._ ]{0,24}", crudo):
            return False
        # «1 / 1» es el número de página, no el de la factura.
        if re.fullmatch(r"\d+\s*/\s*\d+", crudo) and len(crudo.replace(" ", "")) <= 5:
            return False
        return True
    return True


# ------------------------------- Reconstrucción del PDF ------------------------------------------
def pdf_rows(data: bytes, max_pages: int = 3, y_tol: float = 3.0) -> list:
    """Renglones VISUALES del PDF: [[(x, texto), …], …], de arriba abajo y de izquierda a derecha.

    Usa las coordenadas reales de cada trozo (matriz de texto × matriz de transformación): con las
    de `tm` a secas, el texto dibujado dentro de un formulario sale en el sitio equivocado."""
    try:
        from pypdf import PdfReader
        from io import BytesIO
    except Exception:
        return []
    filas = []
    try:
        reader = PdfReader(BytesIO(data))
    except Exception:
        return []
    for page in reader.pages[:max_pages]:
        trozos = []

        def visitor(text, cm, tm, font, size, _t=trozos):
            if not text or not str(text).strip():
                return
            try:
                x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
                y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
                # El tamaño de la letra sale de la escala vertical del texto (para saber cuánto
                # ocupa cada trozo y así distinguir un hueco de verdad de dos letras seguidas).
                alto = abs(float(size or 0) * (cm[3] or 1)) or 10.0
            except Exception:
                return
            _t.append((y, x, str(text), alto))

        try:
            page.extract_text(visitor_text=visitor)
        except Exception:
            continue
        grupos = {}
        for y, x, t, alto in trozos:
            clave = next((k for k in grupos if abs(k - y) <= y_tol), None)
            grupos.setdefault(clave if clave is not None else round(y, 1), []).append((x, t, alto))
        for y in sorted(grupos, reverse=True):
            # Los trozos SEGUIDOS son la misma celda (un «844» + «,2» + «1» que el PDF dibuja por
            # separado es un solo importe); los separados por un hueco de verdad, celdas distintas.
            piezas, fin_x, actual, ini_x = [], None, "", None
            for x, t, alto in sorted(grupos[y], key=lambda p: p[0]):
                hueco = (x - fin_x) if (actual and fin_x is not None) else None
                if hueco is not None and hueco <= alto * 0.15:
                    actual += t                       # pegados: la misma palabra o el mismo número
                elif hueco is not None and hueco <= alto * 0.8:
                    actual += " " + t                 # un espacio: la misma celda
                else:
                    if actual.strip():
                        piezas.append((ini_x, actual.strip()))
                    actual, ini_x = t, x               # hueco de verdad: otra columna
                fin_x = x + len(t) * alto * 0.5      # ancho aproximado del trozo
            if actual.strip():
                piezas.append((ini_x, actual.strip()))
            if piezas:
                filas.append(piezas)
    return filas


def _row_text(fila) -> str:
    return " ".join(t for _x, t in fila)


def _is_table_header(fila) -> bool:
    palabras = set(norm(_row_text(fila)).split())
    return len(palabras & TABLE_HEADER_WORDS) >= 2


def _row_label_sequence(fila: list) -> list:
    """Los RÓTULOS que hay en un renglón, en orden.

    Una celda puede llevar VARIOS rótulos pegados («Número de cliente Número de factura Página»
    salen juntos porque el PDF los dibuja seguidos), así que no vale con mirar por dónde empieza la
    celda: se buscan todos y se ordenan por su posición."""
    texto = _row_text(fila)
    encontrados = []
    ocupado = [False] * len(texto)
    for rotulo in ALL_LABELS:
        for m in re.finditer(r"(?<![A-Za-z])" + _label_pattern(rotulo), texto, re.IGNORECASE):
            if any(ocupado[m.start():m.end()]):
                continue
            for i in range(m.start(), m.end()):
                ocupado[i] = True
            encontrados.append((m.start(), rotulo))
    return [r for _pos, r in sorted(encontrados)]


def _rows_for_label(filas: list, campo: str, rotulo: str) -> str:
    """Busca el valor de UN rótulo concreto emparejándolo en los renglones reconstruidos."""
    for idx, fila in enumerate(filas):
        piezas = list(fila)
        # (0) Renglón de RÓTULOS y el siguiente de VALORES, con varios rótulos por celda: se cuentan
        # los rótulos del renglón y los valores del de abajo y se emparejan por orden. Es como salen
        # las facturas maquetadas en tabla (y es el único modo de saber que «1003» es el número de
        # factura y «1001» el de cliente).
        if idx + 1 < len(filas):
            secuencia = _row_label_sequence(fila)
            if len(secuencia) >= 2 and rotulo in secuencia:
                abajo = filas[idx + 1]
                valores = [t for _x, t in abajo if str(t or "").strip()]
                if len(valores) == len(secuencia):
                    candidato = valores[secuencia.index(rotulo)]
                    if _value_ok(candidato, campo):
                        return candidato.strip(" :€")
        for i, (_x, texto) in enumerate(piezas):
            cola = _label_head(texto, rotulo, campo)
            if cola is None:
                continue
            # (1) El valor viene PEGADO al rótulo, en el mismo trozo.
            if cola and _value_ok(cola, campo):
                return cola
            # (2) El valor está a la derecha, en el mismo renglón.
            for _x2, siguiente in piezas[i + 1:]:
                if _value_ok(siguiente, campo):
                    return siguiente.strip(" :€")
                if _label_head(siguiente, rotulo, campo) is not None:
                    break                  # otro rótulo igual: este se ha quedado sin valor al lado
            # (3) Todos los rótulos primero y todos los valores después (una tabla de dos columnas
            # que la extracción junta en un solo renglón): se emparejan por posición.
            rotulos = [j for j, (_xx, tt) in enumerate(piezas) if not _value_ok(tt, campo) and norm(tt)]
            valores = [j for j, (_xx, tt) in enumerate(piezas) if _value_ok(tt, campo)]
            if rotulos and valores and min(valores) > max(rotulos) and len(rotulos) == len(valores):
                if i in rotulos:
                    return piezas[valores[rotulos.index(i)]][1].strip(" :€")
        # (4) Renglón de rótulos y el SIGUIENTE de valores: por posición o por columna.
        pos = next((j for j, (_x, t) in enumerate(piezas)
                    if _label_head(t, rotulo, campo) is not None), None)
        if pos is None or idx + 1 >= len(filas):
            continue
        abajo = filas[idx + 1]
        if len(abajo) == len(piezas) and _value_ok(abajo[pos][1], campo):
            return abajo[pos][1].strip(" :€")
        x_rotulo = piezas[pos][0]
        mejor, mejor_d = "", None
        for x, texto in abajo:
            if not _value_ok(texto, campo):
                continue
            d = abs((x or 0) - (x_rotulo or 0))
            if mejor_d is None or d < mejor_d:
                mejor, mejor_d = texto, d
        if mejor and (mejor_d is None or mejor_d < 90):
            return mejor.strip(" :€")
    return ""


def _from_rows(filas: list, campo: str) -> str:
    """El valor de un campo, probando sus rótulos EN ORDEN DE PRIORIDAD.

    ⚠️ Se recorre el documento entero por cada rótulo, no al revés: así «Total a pagar» gana a
    «Total» aunque en el papel vaya después (en una factura con retención, «Total» es base + IVA y lo
    que se paga es el «Total a pagar»)."""
    for rotulo in LABELS.get(campo, []):
        valor = _rows_for_label(filas, campo, rotulo)
        if valor:
            return valor
    return ""


def _from_text(text: str, campo: str) -> str:
    """Respaldo sobre el TEXTO PLANO: el rótulo y lo que va detrás en su misma línea.

    Los rótulos se prueban EN ORDEN sobre todo el texto (misma razón que en `_from_rows`)."""
    lineas = [l.strip() for l in (text or "").splitlines() if l.strip()]
    for bueno in LABELS.get(campo, []):
        # Se busca el rótulo con tolerancia a la puntuación («N.º de factura», «I.V.A»).
        # `(?<![A-Za-z])` en vez de `\b`: en los PDF el rótulo viene pegado al dato anterior
        # («…28/7/2026N.º de factura: 8») y con `\b` no casaba porque antes había un dígito.
        patron = r"(?<![A-Za-z])" + _label_pattern(bueno) + r"[^A-Za-z0-9]{0,4}"
        for limpia in lineas:
            m = re.search(patron, limpia, re.IGNORECASE)
            if not m:
                continue
            if any(malo in norm(limpia[:m.end()]) for malo in NOT_LABELS.get(campo, [])):
                continue
            cola = limpia[m.end():].strip(" :#-")
            if not cola:
                continue
            if campo in ("issue_date", "due_date"):
                iso = parse_date(cola)
                if iso:
                    return iso
                continue
            if campo in ("amount_net", "amount_vat", "retention_amount", "amount_gross"):
                # El porcentaje que va pegado al rótulo no es el importe («IVA 21% 239,60»).
                sin_pct = re.sub(r"^\d{1,2}([.,]\d{1,2})?\s*%", "", cola).strip()
                m2 = _AMOUNT_RE.search(sin_pct.replace("€", " "))
                if m2:
                    return m2.group(1).strip()
                continue
            # Número de factura: el primer trozo, cortado en el primer espacio doble.
            trozo = re.split(r"\s{2,}|[;|]", cola)[0].strip()
            trozo = trozo.split()[0] if trozo.split() else ""
            if _value_ok(trozo, campo):
                return trozo
    return ""


def _pct_from(text: str, filas: list, campo: str) -> float | None:
    """El PORCENTAJE que acompaña al IVA o a la retención («IVA 21%», «IRPF 15 %»)."""
    rotulos = LABELS["amount_vat"] if campo == "vat_pct" else LABELS["retention_amount"]
    fuentes = [_row_text(f) for f in filas] + list((text or "").splitlines())
    for linea in fuentes:
        limpia = norm(linea)
        for bueno in rotulos:
            m = re.search(re.escape(bueno) + r"\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%", limpia)
            if m:
                try:
                    return float(m.group(1).replace(",", "."))
                except ValueError:
                    continue
    return None


def _concept_from(text: str, filas: list) -> str:
    """CONCEPTO: la primera línea de detalle de verdad, saltando las cabeceras de la tabla."""
    candidatas = [_row_text(f) for f in filas] or (text or "").splitlines()
    cabecera_vista = False
    for i, linea in enumerate(candidatas):
        limpia = " ".join(str(linea or "").split())
        if not limpia:
            continue
        palabras = set(norm(limpia).split())
        if len(palabras & TABLE_HEADER_WORDS) >= 2:
            cabecera_vista = True
            continue
        if not cabecera_vista:
            continue
        # La línea de detalle: quitamos los importes y las cantidades del final.
        sin_importes = re.sub(r"(\d{1,3}(?:[.  ]\d{3})*(?:,\d{1,2})?|\d+[.,]\d{1,2}|\d+)\s*(?:%|€)?", " ", limpia)
        # Al quitar los importes quedan comas y puntos huérfanos («Liquidación de Royalties ,»): fuera
        # todo trozo que no lleve ni una letra ni un dígito.
        sin_importes = " ".join(p for p in sin_importes.split()
                               if re.search(r"[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", p))
        sin_importes = sin_importes.strip(" -·|,;:.")
        if len(sin_importes) >= 3 and re.search(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}", sin_importes):
            return sin_importes[:120]
    # Sin tabla reconocible, lo que venga tras «concepto»/«descripción».
    m = re.search(r"(?:concepto|descripci[oó]n|detalle)\s*[:\-]\s*(.{3,90})", text or "", re.I)
    if m:
        linea = re.split(r"[\r\n]", m.group(1))[0].strip(" .:-;|")
        if linea and not re.fullmatch(r"[\d\s.,€%]+", linea):
            return linea[:120]
    return ""


def read_fields(text: str = "", data: bytes | None = None, rows: list | None = None) -> dict:
    """Lo que se puede leer de la factura. Todo mejor esfuerzo: lo que no se sepa va vacío/None."""
    filas = rows if rows is not None else (pdf_rows(data) if data else [])
    salida = {"invoice_number": "", "issue_date": "", "due_date": "", "concept": "",
              "amount_net": None, "amount_vat": None, "retention_amount": None,
              "amount_gross": None, "vat_pct": None, "retention_pct": None}
    for campo in ("invoice_number", "issue_date", "due_date"):
        valor = _from_rows(filas, campo) or _from_text(text, campo)
        if campo == "invoice_number":
            salida[campo] = (valor or "").strip(" .:-#")[:40]
        else:
            salida[campo] = parse_date(valor) if valor else ""
    for campo in ("amount_net", "amount_vat", "retention_amount", "amount_gross"):
        valor = _from_rows(filas, campo)
        if not valor:
            valor = _from_text(text, campo)
        importe = parse_amount(valor) if valor else None
        if importe is not None and importe != 0:
            salida[campo] = abs(importe) if campo == "retention_amount" else importe
    salida["vat_pct"] = _pct_from(text, filas, "vat_pct")
    salida["retention_pct"] = _pct_from(text, filas, "retention_pct")
    salida["concept"] = _concept_from(text, filas)
    # Con el TOTAL y el % de IVA, la base y el IVA están determinados: hay facturas (las maquetadas
    # como tabla) donde el rótulo de la base no se puede leer pero el total sí.
    pct = salida["vat_pct"]
    if (salida["amount_net"] is None and salida["amount_gross"] is not None and pct
            and not salida["retention_amount"]):
        try:
            base = (salida["amount_gross"] / (Decimal("1") + Decimal(str(pct)) / Decimal("100")))
            salida["amount_net"] = base.quantize(Decimal("0.01"))
            if salida["amount_vat"] is None:
                salida["amount_vat"] = (salida["amount_gross"] - salida["amount_net"]).quantize(Decimal("0.01"))
        except (InvalidOperation, ZeroDivisionError):
            pass
    if salida["amount_vat"] is None and salida["amount_net"] is not None and pct:
        try:
            salida["amount_vat"] = (salida["amount_net"] * Decimal(str(pct)) / Decimal("100")).quantize(Decimal("0.01"))
        except (InvalidOperation, ZeroDivisionError):
            pass
    # La fecha de emisión NUNCA puede ser la del vencimiento (si solo se ha leído una, se comprueba).
    if salida["issue_date"] and salida["issue_date"] == salida["due_date"]:
        salida["due_date"] = ""
    return salida
