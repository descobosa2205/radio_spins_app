"""Importar COMPRADORES desde un fichero (Excel o CSV): motor puro.

Aquí no hay Flask ni base de datos: solo leer el fichero, **reconocer sus columnas** y normalizar
los valores. Quién ya está, qué se crea y qué dato se completa lo decide `app.py`, que es el único
que puede mirar la base de datos.

El lector del fichero es **el mismo** que el de terceros (`promoter_import.read_rows` /
`parse_columns`): un solo sitio que sabe leer un Excel o un CSV con la cabecera desplazada, con
rótulos como «N.º de teléfono» y con los números que Excel escribe como «638123456.0». Lo único
propio de aquí es a QUÉ campos de un comprador se puede volcar una columna.

Reglas de la casa que se aplican aquí:
- Lo que NO se reconoce **no se calla ni se tira**: la columna sale con `field=None` para que la
  pantalla pregunte a qué corresponde (o se marque para omitirla).
- El TELÉFONO se deja en formato internacional con `sms_utils.normalize_phone`, el punto único de
  «cómo se escribe un teléfono»: un listado con «34600111222» o «600 111 222» queda utilizable para
  mandar un SMS sin que nadie lo repase.
- Un comprador se identifica por su EMAIL y, si no lo trae, por su TELÉFONO. Una fila sin ninguno de
  los dos no se puede importar (no hay a quién escribirle ni con quién no duplicarlo).
"""

from __future__ import annotations

import re

import sms_utils
from promoter_import import (          # el lector de ficheros es común a los dos importadores
    TARGET_IGNORE,
    _cell_text,
    norm_header,
    parse_columns,
    read_rows,
    strip_accents,
    _alias_re,
)

# ── Campos de un comprador a los que se puede volcar una columna ─────────────────────────────────
# (clave, etiqueta, tipo, alias)
FIELDS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("email", "Email", "email",
     ("email", "e mail", "correo", "correo electronico", "mail", "email comprador",
      "correo comprador", "email cliente")),
    ("name", "Nombre y apellidos", "text",
     ("nombre y apellidos", "nombre completo", "comprador", "cliente", "titular", "asistente",
      "nombre comprador")),
    ("first_name", "Nombre", "text", ("nombre", "nombre de pila", "first name", "name")),
    ("last_name", "Apellidos", "text",
     ("apellidos", "apellido", "apellido1", "last name", "surname")),
    ("phone", "Teléfono", "phone",
     ("telefono", "tlf", "tel", "movil", "celular", "phone", "mobile", "telefono movil",
      "telefono contacto", "whatsapp")),
    ("tickets", "Entradas", "int",
     ("entradas", "n entradas", "num entradas", "numero de entradas", "cantidad", "unidades",
      "tickets", "localidades")),
    ("amount", "Importe", "money",
     ("importe", "total", "precio", "importe total", "gastado", "amount", "precio total")),
    ("category", "Categoría de entrada", "text",
     ("categoria", "categoria de entrada", "tipo de entrada", "tipo entrada", "entrada", "zona",
      "localidad", "sector", "abono", "producto")),
    ("marketing", "Acepta publicidad", "bool",
     ("acepta publicidad", "publicidad", "acepta recibir publicidad", "marketing", "rgpd",
      "consentimiento", "newsletter", "acepta comunicaciones")),
    ("purchase_at", "Fecha de compra", "date",
     ("fecha", "fecha de compra", "fecha compra", "comprado el", "date", "fecha pedido")),
]
FIELD_LABELS = {key: label for key, label, _k, _a in FIELDS}
FIELD_KINDS = {key: kind for key, _l, kind, _a in FIELDS}
FIELD_KEYS = [key for key, _l, _k, _a in FIELDS]

_SI = {"si", "s", "sí", "yes", "y", "true", "verdadero", "1", "x", "ok", "acepta"}
_NO = {"no", "n", "false", "falso", "0", "", "-"}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$")


def guess_field(header) -> str | None:
    """A qué campo de un comprador corresponde una columna. None = no se reconoce (se pregunta)."""
    key = norm_header(header)
    if not key:
        return None
    for field, _label, _kind, aliases in FIELDS:
        for alias in aliases:
            if key == norm_header(alias):
                return field
    # Segunda pasada: el rótulo CONTIENE el alias («nº de teléfono móvil» → phone). Los alias más
    # largos ganan, para que «tipo de entrada» no se lo lleve «entrada».
    plano = strip_accents(str(header or "")).lower()
    candidatos = []
    for field, _label, _kind, aliases in FIELDS:
        for alias in aliases:
            a = norm_header(alias).replace(" ", "")
            if len(a) >= 3 and _alias_re(alias).search(plano):
                candidatos.append((len(a), field))
    if candidatos:
        candidatos.sort(reverse=True)
        return candidatos[0][1]
    return None


def clean_email(value) -> str:
    """El correo tal como se guarda (en minúsculas). Si no parece un correo, vacío: mejor no
    importarlo que dar de alta a un comprador con un email que no existe."""
    txt = _cell_text(value).replace(" ", "").strip().strip("<>").lower()
    if not txt or not _EMAIL_RE.match(txt):
        return ""
    return txt


def clean_money(value) -> str:
    """Un importe de un fichero («1.234,56 €», «1234.56») como número con punto decimal."""
    txt = _cell_text(value).replace("€", "").replace(" ", "").strip()
    if not txt:
        return ""
    negativo = txt.startswith("-")
    txt = txt.lstrip("-+")
    if "," in txt and "." in txt:
        # El separador decimal es el ÚLTIMO que aparece.
        if txt.rfind(",") > txt.rfind("."):
            txt = txt.replace(".", "").replace(",", ".")
        else:
            txt = txt.replace(",", "")
    elif "," in txt:
        txt = txt.replace(",", ".")
    txt = re.sub(r"[^0-9.]", "", txt)
    # ⚠️⚠️ SOLO PUNTOS: aquí el punto es de MILES (modelo de euros), así que manda cuántos dígitos
    # sigue al último: 1 o 2 son DECIMALES («1234.56», lo canónico) y 3 o más —o varios puntos— son
    # MILES («1.234» son mil doscientos treinta y cuatro, y «1.234.567» un millón). Es la misma regla
    # que `_parse_money_decimal` (app.py) e `invoice_read.parse_amount`; antes «1.234» se importaba
    # como 1,234 € y «1.234.567» como 1234,567 € (bug real de dinero en la importación).
    if "." in txt:
        trozos = txt.split(".")
        if len(trozos) > 2 or len(trozos[-1]) not in (1, 2):
            txt = "".join(trozos)
    if not txt or txt == ".":
        return ""
    return ("-" if negativo else "") + txt


def clean_date(value) -> str:
    """Una fecha del fichero en «dd/mm/aaaa» (con la hora detrás si la trae), o vacío."""
    txt = _cell_text(value)
    if not txt:
        return ""
    m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", txt)          # 2026-08-21
    if m:
        dia, mes, anio = m.group(3), m.group(2), m.group(1)
    else:
        m = re.search(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})", txt)  # 21/08/2026
        if not m:
            return ""
        dia, mes, anio = m.group(1), m.group(2), m.group(3)
        if len(anio) == 2:
            anio = "20" + anio
    try:
        d, mo, y = int(dia), int(mes), int(anio)
    except Exception:
        return ""
    if not (1 <= d <= 31 and 1 <= mo <= 12 and 1900 <= y <= 2100):
        return ""
    hora = re.search(r"(\d{1,2}):(\d{2})", txt)
    salida = "%02d/%02d/%04d" % (d, mo, y)
    if hora:
        salida += " %02d:%02d" % (int(hora.group(1)), int(hora.group(2)))
    return salida


def normalize_value(field: str, value) -> str:
    """El valor tal como se va a guardar en ese campo."""
    txt = _cell_text(value)
    if not txt:
        return ""
    kind = FIELD_KINDS.get(field, "text")
    if kind == "email":
        return clean_email(txt)
    if kind == "phone":
        # ⚠️ Con su PREFIJO: un listado con «34600111222» o «600 111 222» tiene que quedar
        # utilizable para mandar un SMS sin que nadie lo repase. Si no es creíble, se queda como
        # está (no se pierde lo que venía en el fichero).
        return sms_utils.normalize_phone(txt) or txt
    if kind == "int":
        digitos = re.sub(r"\D", "", txt)
        return digitos or ""
    if kind == "money":
        return clean_money(txt)
    if kind == "date":
        return clean_date(txt)
    if kind == "bool":
        key = norm_header(txt)
        if key in _SI:
            return "1"
        if key in _NO:
            return "0"
        return "1" if key.startswith("acept") else "0"
    return re.sub(r"\s+", " ", txt).strip()


def parse_file(data: bytes, filename: str = "") -> dict:
    """Lee el fichero y devuelve sus columnas (con el campo reconocido y ejemplos) y sus filas."""
    return parse_columns(read_rows(data, filename), guess_field)


def apply_mapping(rows: list[list], mapping: dict) -> list[dict]:
    """Convierte las filas del fichero en compradores: [{campo: valor}].

    El nombre se compone si el fichero trae «Nombre» y «Apellidos» por separado. Las filas sin
    email NI teléfono salen igual (con `_sin_contacto`) para poder decir cuántas se descartan y
    por qué, en vez de que desaparezcan sin más.
    """
    salida = []
    for row in rows or []:
        valores: dict[str, str] = {}
        for key, target in (mapping or {}).items():
            try:
                idx = int(key)
            except Exception:
                continue
            if idx < 0 or idx >= len(row):
                continue
            crudo = _cell_text(row[idx])
            if not crudo:
                continue
            destino = (target or {}).get("field") if isinstance(target, dict) else target
            destino = (destino or "").strip()
            if not destino or destino == TARGET_IGNORE or destino not in FIELD_LABELS:
                continue
            limpio = normalize_value(destino, crudo)
            if limpio:
                valores[destino] = limpio
        nombre = (valores.pop("first_name", "") + " " + valores.pop("last_name", "")).strip()
        if nombre and not valores.get("name"):
            valores["name"] = nombre
        if not valores:
            continue
        valores["_sin_contacto"] = "" if (valores.get("email") or valores.get("phone")) else "1"
        salida.append(valores)
    return salida
