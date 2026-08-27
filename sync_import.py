"""Lectura de un Excel/CSV de SUPERVISORES de sincronización (motor puro: ni Flask ni BD).

⚠️ El LECTOR es el mismo que el de la importación de terceros (`promoter_import.read_rows` /
`parse_columns`), que ya sabe de cabeceras desplazadas, rótulos como «N.º de teléfono» y números que
Excel escribe con decimales. Lo único propio de aquí es **a qué campos se puede volcar una columna**
—o sea el reconocedor— y cómo se normalizan el tipo, la región y los idiomas.
"""

from __future__ import annotations

import re

from promoter_import import (  # el lector, compartido a propósito
    TARGET_ALT,
    TARGET_IGNORE,
    _alias_re,
    _cell_text,
    norm_header,
    parse_columns,
    read_rows,
    strip_accents,
)

# (clave, etiqueta, tipo, alias de cabecera)
FIELDS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("name", "Nombre", "text",
     ("nombre", "nombre completo", "name", "full name", "contacto", "contact", "supervisor",
      "nick", "alias", "empresa", "compania", "company", "agencia", "productora", "razon social")),
    ("email", "Email", "email",
     ("email", "e mail", "correo", "correo electronico", "mail", "email contacto", "e mail address",
      "email address")),
    ("phone", "Teléfono", "phone",
     ("telefono", "tlf", "tel", "movil", "celular", "phone", "mobile", "telephone",
      "n de telefono", "numero de telefono")),
    ("sup_type", "Tipo", "sup_type",
     ("tipo", "tipo de tercero", "categoria", "rol", "perfil", "type", "role", "actividad")),
    ("region", "Región donde opera", "region",
     ("region", "zona", "territorio", "pais", "country", "market", "mercado", "ambito",
      "area", "region donde opera")),
    ("languages", "Idiomas", "languages",
     ("idioma", "idiomas", "lengua", "lenguas", "language", "languages", "lang")),
    ("company", "Empresa / agencia", "text",
     ("empresa a la que pertenece", "agencia a la que pertenece", "compania", "sello",
      "organizacion", "organization", "estudio")),
    ("notes", "Notas", "text",
     ("notas", "nota", "observaciones", "comentarios", "notes", "comments", "remarks")),
]

FIELD_LABELS = {k: l for k, l, _t, _a in FIELDS}
FIELD_KINDS = {k: t for k, _l, t, _a in FIELDS}
FIELD_KEYS = [k for k, _l, _t, _a in FIELDS]

# ── Catálogos ────────────────────────────────────────────────────────────────────────
SUPERVISOR_TYPES: list[tuple[str, str]] = [
    ("MUSIC_SUPERVISOR", "Music Supervisor"),
    ("AD_AGENCY", "Agencia de publicidad"),
    ("AD_PRODUCER", "Productora de anuncios"),
]
TYPE_LABELS = dict(SUPERVISOR_TYPES)
DEFAULT_TYPE = "MUSIC_SUPERVISOR"

_TYPE_VALUES = {
    "MUSIC_SUPERVISOR": {"music supervisor", "music supervisors", "supervisor", "supervisores",
                         "supervisor musical", "supervision musical", "music sup", "musica"},
    "AD_AGENCY": {"agencia publicidad", "agencia de publicidad", "agencia", "publicidad",
                  "ad agency", "advertising agency", "agency", "creative agency"},
    "AD_PRODUCER": {"productora de anuncios", "productora anuncios", "productora", "produccion",
                    "ad producer", "production company", "producer", "productor"},
}

# Región: un país, toda Latinoamérica o global.
REGION_LATAM = "LATAM"
REGION_GLOBAL = "GLOBAL"
REGION_COUNTRY = "COUNTRY"
REGION_KINDS: list[tuple[str, str]] = [
    (REGION_GLOBAL, "Global"),
    (REGION_LATAM, "Latinoamérica"),
    (REGION_COUNTRY, "Un país"),
]
DEFAULT_REGION_KIND = REGION_GLOBAL

_LATAM_VALUES = {"latam", "latinoamerica", "latino america", "america latina", "latin america",
                 "hispanoamerica", "sudamerica", "south america", "latam region"}
_GLOBAL_VALUES = {"global", "mundial", "worldwide", "internacional", "international", "todo el mundo",
                  "ww", "world"}

# Idiomas de las sincronizaciones. TODOS nacen con español e inglés.
LANGUAGES: list[tuple[str, str]] = [
    ("ES", "Español"), ("EN", "Inglés"), ("PT", "Portugués"), ("FR", "Francés"),
    ("IT", "Italiano"), ("DE", "Alemán"), ("CA", "Catalán"), ("EU", "Euskera"),
    ("GL", "Gallego"), ("JA", "Japonés"), ("ZH", "Chino"), ("KO", "Coreano"),
    ("AR", "Árabe"), ("RU", "Ruso"), ("NL", "Neerlandés"), ("SV", "Sueco"),
    ("INSTRUMENTAL", "Instrumental"),
]
LANGUAGE_LABELS = dict(LANGUAGES)
DEFAULT_LANGUAGES = ["ES", "EN"]

_LANG_VALUES = {
    "ES": {"es", "esp", "espanol", "castellano", "spanish", "spa"},
    "EN": {"en", "ing", "ingles", "english", "eng"},
    "PT": {"pt", "portugues", "portuguese", "brasileno", "por", "pt br"},
    "FR": {"fr", "frances", "french", "fra"},
    "IT": {"it", "italiano", "italian", "ita"},
    "DE": {"de", "aleman", "german", "deu", "ger"},
    "CA": {"ca", "catalan", "cat"},
    "EU": {"eu", "euskera", "vasco", "basque", "eus"},
    "GL": {"gl", "gallego", "galician", "glg"},
    "JA": {"ja", "japones", "japanese", "jpn"},
    "ZH": {"zh", "chino", "chinese", "mandarin", "zho"},
    "KO": {"ko", "coreano", "korean", "kor"},
    "AR": {"ar", "arabe", "arabic", "ara"},
    "RU": {"ru", "ruso", "russian", "rus"},
    "NL": {"nl", "neerlandes", "holandes", "dutch", "nld"},
    "SV": {"sv", "sueco", "swedish", "swe"},
    "INSTRUMENTAL": {"instrumental", "sin voz", "no vocals", "instrumentales"},
}


def guess_field(header) -> str | None:
    """Qué campo de Syncro es una columna del fichero (None = se pregunta en la pantalla)."""
    h = norm_header(header)
    if not h:
        return None
    for key, _label, _kind, aliases in FIELDS:
        for alias in aliases:
            if _alias_re(alias).search(h):
                return key
    return None


def normalize_type(value) -> str:
    """El tipo de agente, tolerante con cómo esté escrito («Music Supervisors», «agencia»…)."""
    v = strip_accents(_cell_text(value)).lower().strip()
    if not v:
        return ""
    for key, valores in _TYPE_VALUES.items():
        if v in valores:
            return key
    for key, valores in _TYPE_VALUES.items():
        if any(token and token in v for token in valores):
            return key
    return ""


def normalize_region(value) -> tuple[str, str]:
    """(region_kind, país). «Latam»/«global» se reconocen; cualquier otra cosa es un PAÍS."""
    crudo = _cell_text(value).strip()
    v = strip_accents(crudo).lower().strip(" .,-")
    if not v:
        return "", ""
    if v in _LATAM_VALUES or "latam" in v or "latinoameric" in v:
        return REGION_LATAM, ""
    if v in _GLOBAL_VALUES:
        return REGION_GLOBAL, ""
    return REGION_COUNTRY, crudo[:80]


def normalize_languages(value) -> list[str]:
    """Los idiomas de una celda («ES, EN» · «español/inglés» · «Spanish and English»)."""
    crudo = _cell_text(value)
    if not crudo:
        return []
    trozos = [t for t in re.split(r"[,;/|+&]| y | and | e ", crudo) if t and t.strip()]
    salida = []
    for t in trozos:
        v = strip_accents(t).lower().strip(" .()[]")
        if not v:
            continue
        for code, valores in _LANG_VALUES.items():
            if v in valores and code not in salida:
                salida.append(code)
                break
    return salida


def normalize_value(field: str, value):
    """Deja el valor de una celda listo para guardar, según el campo."""
    kind = FIELD_KINDS.get(field, "text")
    crudo = _cell_text(value)
    if kind == "sup_type":
        return normalize_type(crudo)
    if kind == "region":
        return normalize_region(crudo)
    if kind == "languages":
        return normalize_languages(crudo)
    if kind == "email":
        return crudo.strip().lower()
    if kind == "phone":
        return crudo.strip()
    return crudo.strip()


def parse_file(data: bytes, filename: str = "") -> dict:
    """Columnas reconocidas + filas del fichero (mismo formato que la importación de terceros)."""
    return parse_columns(read_rows(data, filename), guess_field)


def apply_mapping(rows: list[list], mapping: dict) -> list[dict]:
    """Convierte las filas en fichas de supervisor: {"values": {campo: valor}}.

    Los idiomas se acumulan si vienen en varias columnas y la región se devuelve ya repartida en
    `region_kind` / `region_country`."""
    out = []
    for row in rows or []:
        values: dict = {}
        idiomas: list[str] = []
        for key, target in (mapping or {}).items():
            try:
                idx = int(key)
            except Exception:
                continue
            if idx < 0 or idx >= len(row):
                continue
            destino = (target or {}).get("field") if isinstance(target, dict) else target
            destino = (destino or "").strip()
            if not destino or destino in (TARGET_IGNORE, TARGET_ALT):
                continue
            if destino not in FIELD_KEYS:
                continue
            valor = normalize_value(destino, row[idx])
            if destino == "languages":
                for code in (valor or []):
                    if code not in idiomas:
                        idiomas.append(code)
                continue
            if destino == "region":
                kind, pais = valor
                if kind:
                    values["region_kind"] = kind
                    values["region_country"] = pais
                continue
            if valor:
                values[destino] = valor
        if idiomas:
            values["languages"] = idiomas
        if any(values.get(k) for k in ("name", "email", "phone")):
            out.append({"values": values})
    return out
