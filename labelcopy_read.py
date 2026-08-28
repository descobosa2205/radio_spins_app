# -*- coding: utf-8 -*-
"""Lector de LABEL COPY en PDF (motor puro: ni Flask ni base de datos).

Sirve para volcar de golpe los datos de las canciones ANTIGUAS a partir de sus Label Copy.

⚠️ Un mismo PDF puede traer VARIAS canciones (los LC se guardaban uno detrás de otro), así que lo
primero es partirlo: cada vez que aparece el rótulo «Título» empieza una canción nueva. Se usa ese
rótulo y no la portada «Label Copy» porque los LC de otras fuentes no la llevan.

El emparejamiento rótulo → valor se hace sobre los RENGLONES VISUALES del PDF (las coordenadas de
cada trozo), que es lo mismo que hace `invoice_read`: con el texto plano, los rótulos y los valores
salen en bloques separados y desordenados.
"""

from __future__ import annotations

import re
import unicodedata

try:                                    # el lector de renglones ya existe: no se duplica
    from invoice_read import pdf_rows
except Exception:                       # pragma: no cover
    def pdf_rows(data, max_pages=3, y_tol=3.0):
        return []


# ---------------------------------------------------------------- campos del LC
# clave interna → (etiqueta que se enseña, rótulos que valen en el PDF)
FIELDS = {
    "title":               ("Título",                  ["titulo", "title", "titulo de la obra", "titulo del tema"]),
    "interpreters":        ("Intérpretes",             ["interpretes", "interprete", "artista", "artistas", "performer", "performers"]),
    "version":             ("Versión",                 ["version", "version del tema"]),
    "release_date":        ("Fecha de publicación",    ["fecha de publicacion", "fecha de lanzamiento", "fecha de publicacion del single", "release date"]),
    "isrc":                ("Códigos ISRC",            ["codigos isrc", "codigo isrc", "isrc", "isrc audio"]),
    "duration":            ("Duración",                ["duracion timing", "duracion", "timing", "duration"]),
    "tiktok_start":        ("Inicio en Tik Tok",       ["inicio en tik tok", "inicio en tiktok", "tiktok start"]),
    "bpm":                 ("BPM",                     ["bpm", "tempo"]),
    "genre":               ("Género",                  ["genero", "generos", "genre", "genres"]),
    "copyright_text":      ("Copyright",               ["copyright", "(c)", "(p)"]),
    "producers":           ("Productor",               ["productor", "productores", "produccion", "producer", "producers"]),
    "recording_engineer":  ("Ingeniero de grabación",  ["ingeniero de grabacion", "tecnico de grabacion", "recording engineer"]),
    "studio":              ("Estudio de grabación",    ["estudio de grabacion", "estudio", "studio"]),
    "recording_date":      ("Fecha de grabación",      ["fecha de grabacion", "recording date"]),
    "mixing_engineer":     ("Ingeniero de mezcla",     ["ingeniero de mezcla", "tecnico de mezcla", "mezcla", "mixing engineer", "mixed by"]),
    "mastering_engineer":  ("Ingeniero de mastering",  ["ingeniero de mastering", "tecnico de mastering", "mastering", "mastered by"]),
    "arrangers":           ("Arreglista",              ["arreglista", "arreglistas", "arreglos", "arranger", "arrangers"]),
    "musicians":           ("Músicos",                 ["musicos", "musico", "musicians"]),
}

# Los que se guardan como LISTA de nombres
LIST_FIELDS = ("producers", "arrangers")

EMPTY_VALUES = {"", "-", "—", "–", "n/a", "na", "sin datos", "no aplica"}

_AUTHORS_HEAD = ("reparto autoral", "autores", "reparto de autoria", "autoria", "authors", "writers")
_AUTHORS_END = ("porcentaje total", "total", "reparto editorial", "%total")
_ROLE_HINTS = ("autor", "compositor", "letra", "musica", "adaptador", "arreglista",
               "composer", "lyricist", "writer", "adapter", "music", "lyrics")


def norm(text) -> str:
    """Minúsculas, sin acentos y sin puntuación: para comparar rótulos."""
    t = unicodedata.normalize("NFKD", str(text or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9%]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _label_of(texto: str):
    """¿Es este texto el rótulo de un campo? Devuelve su clave."""
    n = norm(texto).rstrip(" :")
    if not n or len(n) > 40:
        return None
    for campo, (_etiqueta, rotulos) in FIELDS.items():
        if n in rotulos:
            return campo
    return None


def _clean(valor: str) -> str:
    v = re.sub(r"\s+", " ", str(valor or "").strip())
    return "" if norm(v) in EMPTY_VALUES else v


def parse_duration(texto: str):
    """«3:33» o «3 min 33 s» → segundos. Devuelve None si no se entiende."""
    t = _clean(texto)
    m = re.search(r"(\d{1,2})\s*[:'′]\s*(\d{1,2})", t)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.search(r"(\d{1,3})\s*min[a-z]*\.?\s*(\d{1,2})?", t, re.I)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2) or 0)
    m = re.fullmatch(r"(\d{1,4})\s*(?:s|seg|segundos)?", t, re.I)
    return int(m.group(1)) if m else None


def parse_date(texto: str):
    """Fecha en cualquier forma habitual → «aaaa-mm-dd» (o None)."""
    t = _clean(texto)
    m = re.search(r"(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})", t)
    if m:
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a = a + 2000 if a < 100 else a
        if 1 <= d <= 31 and 1 <= mes <= 12:
            return "%04d-%02d-%02d" % (a, mes, d)
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", t)
    if m:
        return "%04d-%02d-%02d" % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def parse_isrcs(texto: str) -> list:
    """Todos los ISRC del texto, TAL COMO están escritos (con o sin guiones).

    ⚠️ Un LC puede traer los de audio y los de vídeo («Audio: … · Vídeo: …»): aquí solo interesan
    los de AUDIO, así que se corta en cuanto aparece la palabra vídeo."""
    t = str(texto or "")
    corte = re.split(r"\b(?:v[ií]deo|video|videoclip)\b\s*:?", t, flags=re.I)[0]
    return re.findall(r"\b([A-Z]{2}[-\s]?[A-Z0-9]{3}[-\s]?\d{2}[-\s]?\d{5})\b", corte.upper())


def split_names(texto: str) -> list:
    """Un campo de varios nombres → lista. Separadores: coma, «y», «&», barra, punto y coma."""
    t = _clean(texto)
    if not t:
        return []
    partes = re.split(r"\s*[,;/•·|]\s*|\s+&\s+|\s+\by\b\s+|\s+\band\b\s+", t)
    return [p.strip(" .") for p in partes if p.strip(" .")]


def parse_musicians(texto: str) -> list:
    """«Guitarra: Julián Vera» por líneas → [{instrument, name}]."""
    filas = []
    for linea in re.split(r"[\n;]+", str(texto or "")):
        linea = _clean(linea)
        if not linea:
            continue
        if ":" in linea:
            inst, _sep, nombre = linea.partition(":")
            filas.append({"instrument": inst.strip(), "name": nombre.strip()})
        else:
            filas.append({"instrument": "", "name": linea})
    return [f for f in filas if f["name"] or f["instrument"]]


def parse_pct(texto: str):
    """«60.00%» / «60,00 %» → float."""
    m = re.search(r"(\d{1,3}(?:[.,]\d{1,2})?)\s*%?", str(texto or ""))
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", "."))
    except Exception:
        return None


# ---------------------------------------------------------------- lectura
def _row_cells(fila) -> list:
    return [t for _x, t in fila]


def _looks_author_row(celdas: list) -> bool:
    """¿Es una fila de la tabla de autores? Nombre + (rol) + (editorial) + %."""
    if len(celdas) < 2:
        return False
    if parse_pct(celdas[-1]) is None or "%" not in celdas[-1]:
        return False
    return bool(_clean(celdas[0]))


def _author_from_row(celdas: list) -> dict:
    """Reparte las celdas de una fila de autores; el orden del LC es Autor · Rol · Editorial · %."""
    pct = parse_pct(celdas[-1])
    medio = [_clean(c) for c in celdas[1:-1]]
    medio = [c for c in medio if c]
    nombre, rol, editorial = _clean(celdas[0]), "", ""
    if len(medio) >= 2:
        rol, editorial = medio[0], medio[1]
    elif len(medio) == 1:
        # Con una sola columna en medio hay que adivinar si es el rol o la editorial.
        rol = medio[0] if norm(medio[0]) in _ROLE_HINTS else ""
        editorial = "" if rol else medio[0]
    return {"name": nombre, "role": rol, "publisher": editorial, "pct": pct}


def _finish(datos: dict) -> dict:
    """Normaliza los valores crudos de una canción."""
    crudo = datos.pop("_raw", {})
    salida = {"authors": datos.get("authors") or []}
    for campo, valor in crudo.items():
        valor = _clean(valor) if campo != "musicians" else valor
        if campo in LIST_FIELDS:
            salida[campo] = split_names(valor)
        elif campo == "musicians":
            salida[campo] = parse_musicians(valor)
        elif campo == "isrc":
            salida["isrcs"] = parse_isrcs(valor)
        elif campo == "duration":
            salida["duration_seconds"] = parse_duration(valor)
        elif campo == "tiktok_start":
            salida["tiktok_start_seconds"] = parse_duration(valor)
        elif campo in ("release_date", "recording_date"):
            salida[campo] = parse_date(valor)
        elif campo == "bpm":
            m = re.search(r"\d{2,3}", valor or "")
            salida["bpm"] = int(m.group(0)) if m else None
        elif campo == "interpreters":
            salida["interpreters"] = split_names(valor)
            salida["interpreters_text"] = valor
        else:
            salida[campo] = valor
    return {k: v for k, v in salida.items() if v not in (None, "", [], {})}


def read_pdf(data: bytes, max_pages: int = 40) -> list:
    """Las canciones que hay en un PDF de Label Copy.

    Devuelve una lista de diccionarios con los campos que se hayan podido leer. Una canción sin
    título no se devuelve: sin él no hay forma de casarla ni de crearla."""
    filas = pdf_rows(data, max_pages=max_pages)
    if not filas:
        return []

    canciones, actual, campo_abierto, en_autores = [], None, None, False

    def cerrar():
        if actual and (actual.get("_raw") or {}).get("title"):
            canciones.append(_finish(actual))

    for fila in filas:
        celdas = _row_cells(fila)
        if not celdas:
            continue
        primero = celdas[0]
        campo = _label_of(primero)
        texto_fila = " ".join(celdas)

        # ---- ¿empieza la tabla de autores?
        if norm(texto_fila) in _AUTHORS_HEAD or norm(primero) in _AUTHORS_HEAD:
            en_autores, campo_abierto = True, None
            continue
        if en_autores:
            if any(norm(texto_fila).startswith(f) for f in _AUTHORS_END):
                en_autores = False
                continue
            if norm(primero) in ("autor", "author") and len(celdas) >= 3:
                continue                                    # la cabecera de la tabla
            if _looks_author_row(celdas):
                if actual is not None:
                    actual.setdefault("authors", []).append(_author_from_row(celdas))
                continue
            if campo is None:
                continue                                    # ruido dentro de la tabla
            en_autores = False                              # un rótulo la cierra

        # ---- un rótulo conocido
        if campo:
            if campo == "title":
                cerrar()
                actual = {"_raw": {}, "authors": []}
            if actual is None:
                actual = {"_raw": {}, "authors": []}
            valor = " ".join(celdas[1:]).strip()
            # El mismo rótulo dos veces (p. ej. el ISRC de vídeo): se queda el primero.
            if campo in actual["_raw"] and actual["_raw"][campo]:
                campo_abierto = None
                continue
            actual["_raw"][campo] = valor
            campo_abierto = campo if valor or campo == "musicians" else campo
            continue

        # ---- continuación de un campo de varias líneas (Músicos, Copyright…)
        if actual is not None and campo_abierto and len(celdas) == 1:
            if norm(primero) in ("label copy", "enlaces", "sin portada"):
                continue
            actual["_raw"][campo_abierto] = (actual["_raw"].get(campo_abierto, "") + "\n" + primero).strip()

    cerrar()
    return canciones
