"""Importar CONTACTOS DE MEDIOS desde un fichero (Excel o CSV): motor puro.

Aquí no hay Flask ni base de datos: solo leer el fichero, **reconocer sus columnas** y normalizar
los valores. A qué medio va cada contacto lo decide una persona arrastrándolo en la pantalla de
vinculación, que es lo único que sabe qué medios hay.

El lector del fichero es **el mismo** que el de terceros y el de compradores
(`promoter_import.read_rows` / `parse_columns`): un solo sitio que sabe leer un Excel o un CSV con
la cabecera desplazada, con rótulos como «N.º de teléfono» y con los números que Excel escribe como
«638123456.0». Lo único propio de aquí es a QUÉ campos de un contacto se puede volcar una columna.

Reglas de la casa que se aplican aquí:
- Lo que NO se reconoce **no se calla ni se tira**: la columna sale con `field=None` para que la
  pantalla pregunte a qué corresponde (o se marque para omitirla).
- El TELÉFONO se deja en formato internacional con `sms_utils.normalize_phone`, el punto único de
  «cómo se escribe un teléfono».
- Una fila sin NADA con lo que llamar a esa persona (ni nick, ni nombre) no se importa: se dice
  cuántas se han quedado fuera, no desaparecen sin más.
"""

from __future__ import annotations

import re

import sms_utils
from promoter_import import (          # el lector de ficheros es común a los tres importadores
    TARGET_IGNORE,
    _cell_text,
    norm_header,
    parse_columns,
    read_rows,
    strip_accents,
    _alias_re,
)

# ── Campos de un contacto a los que se puede volcar una columna ──────────────────────────────────
# (clave, etiqueta, tipo, alias)
FIELDS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("media_name", "Medio", "text",
     ("medio", "medios", "emisora", "cadena", "soporte", "publicacion", "periodico", "revista",
      "programa medio", "media", "outlet", "empresa")),
    ("nick", "Nick", "text",
     ("nick", "alias", "como le llamamos", "nombre corto", "apodo")),
    ("name", "Nombre completo", "text",
     ("nombre completo", "nombre y apellidos", "contacto", "persona", "periodista", "nombre contacto",
      "full name")),
    ("first_name", "Nombre", "text", ("nombre", "nombre de pila", "first name", "name")),
    ("last_name", "Apellidos", "text",
     ("apellidos", "apellido", "apellido1", "last name", "surname")),
    ("program", "Programa", "text",
     ("programa", "programas", "espacio", "seccion", "show", "magazine", "franja")),
    ("role", "Cargo", "text",
     ("cargo", "puesto", "funcion", "rol", "responsabilidad", "position", "job")),
    ("phone", "Teléfono", "phone",
     ("telefono", "tlf", "tel", "movil", "celular", "phone", "mobile", "telefono movil",
      "telefono contacto", "whatsapp", "contacto telefono")),
    ("email", "Email", "email",
     ("email", "e mail", "correo", "correo electronico", "mail", "email contacto",
      "correo contacto")),
]
FIELD_LABELS = {key: label for key, label, _k, _a in FIELDS}
FIELD_KINDS = {key: kind for key, _l, kind, _a in FIELDS}
FIELD_KEYS = [key for key, _l, _k, _a in FIELDS]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$")


def guess_field(header) -> str | None:
    """A qué campo de un contacto corresponde una columna. None = no se reconoce (se pregunta)."""
    key = norm_header(header)
    if not key:
        return None
    for field, _label, _kind, aliases in FIELDS:
        for alias in aliases:
            if key == norm_header(alias):
                return field
    # Segunda pasada: el rótulo CONTIENE el alias («nº de teléfono móvil» → phone). Los alias más
    # largos ganan, para que «nombre completo» no se lo lleve «nombre».
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
    """El correo tal como se guarda (en minúsculas). Si no parece un correo, vacío."""
    txt = _cell_text(value).replace(" ", "").strip().strip("<>").lower()
    if not txt or not _EMAIL_RE.match(txt):
        return ""
    return txt


def normalize_value(field: str, value) -> str:
    """El valor tal como se va a guardar en ese campo."""
    txt = _cell_text(value)
    if not txt:
        return ""
    kind = FIELD_KINDS.get(field, "text")
    if kind == "email":
        return clean_email(txt)
    if kind == "phone":
        # Con su PREFIJO; si no es creíble se queda como está (no se pierde lo del fichero).
        return sms_utils.normalize_phone(txt) or txt
    return re.sub(r"\s+", " ", txt).strip()


def split_full_name(full: str) -> tuple[str, str]:
    """«APELLIDO1 APELLIDO2, NOMBRE» o «NOMBRE APELLIDO1 APELLIDO2» → (nombre, apellidos).

    Es la misma regla que `_split_full_name` de app.py, escrita aquí para que el motor siga siendo
    puro (este fichero no importa la app)."""
    s = " ".join((full or "").split())
    if not s:
        return "", ""
    if "," in s:
        last, first = s.split(",", 1)
        return first.strip(), last.strip()
    partes = s.split(" ")
    if len(partes) >= 3:
        return " ".join(partes[:-2]), " ".join(partes[-2:])
    if len(partes) == 2:
        return partes[0], partes[1]
    return s, ""


def apply_mapping(rows: list[list], mapping: dict) -> list[dict]:
    """Las filas del fichero con los nombres de campo que ha dicho la pantalla.

    `mapping` es {índice de columna: clave del campo}; lo que valga `TARGET_IGNORE` no se mira."""
    salida = []
    for row in rows or []:
        datos: dict[str, str] = {}
        for idx, field in (mapping or {}).items():
            if not field or field == TARGET_IGNORE:
                continue
            try:
                bruto = row[int(idx)]
            except Exception:
                continue
            valor = normalize_value(field, bruto)
            if valor and not datos.get(field):
                datos[field] = valor
        if datos:
            salida.append(datos)
    return salida


def contact_rows(rows: list[dict]) -> tuple[list[dict], int]:
    """De lo mapeado a los CONTACTOS que se van a importar.

    Devuelve `(filas, descartadas)`: una fila sin nada con lo que llamar a esa persona (ni nick, ni
    nombre completo, ni nombre/apellidos) no se puede importar y se cuenta aparte."""
    salida, fuera = [], 0
    for datos in rows or []:
        nombre = (datos.get("first_name") or "").strip()
        apellidos = (datos.get("last_name") or "").strip()
        if not (nombre or apellidos) and datos.get("name"):
            nombre, apellidos = split_full_name(datos.get("name") or "")
        nick = (datos.get("nick") or "").strip()
        if not (nick or nombre or apellidos):
            fuera += 1
            continue
        salida.append({
            "nick": nick,
            "first_name": nombre,
            "last_name": apellidos,
            "program": (datos.get("program") or "").strip(),
            "role": (datos.get("role") or "").strip(),
            "phone": (datos.get("phone") or "").strip(),
            "email": (datos.get("email") or "").strip(),
            "media_name": (datos.get("media_name") or "").strip(),
        })
    return salida, fuera


def parse_file(data: bytes, filename: str = "") -> dict:
    """Lee el fichero y devuelve sus columnas (con el campo reconocido y ejemplos) y sus filas."""
    return parse_columns(read_rows(data, filename), guess_field)
