# -*- coding: utf-8 -*-
"""ETIQUETAS de un archivo de audio: los METADATOS que van DENTRO de lo que se descarga.

Cuando alguien se baja una canción o una maqueta, el archivo tiene que llevar puesto **quién es**:
el título, el artista, los AUTORES, los PRODUCTORES, el género, el año y la PORTADA. Si no, en el
ordenador de quien lo recibe queda un «pista 01» sin dueño.

⚠️ Módulo **PURO**: ni Flask ni base de datos ni ffmpeg. Se prueba suelto con
`tools/check_audio_tags.py`, que además lee de vuelta lo escrito con ffmpeg de verdad.

⚠️⚠️ **NO SE RECODIFICA NADA.** Las etiquetas se ESCRIBEN sobre el archivo tal cual:
· **MP3** → se le quita el ID3v2 que traiga (si trae) y se le antepone el nuestro. Es una cabecera
  delante del audio: ni se toca un solo byte del sonido ni se pierde calidad.
· **WAV** → un trozo `LIST/INFO` de RIFF (INAM, IART, …) antes de los datos. Es lo que admite el
  formato; los programas que lo leen lo enseñan y los que no, se lo saltan.

Se escribe **ID3v2.3** (no 2.4) a propósito: es el que entienden TODOS —Windows, iTunes, los coches
y los reproductores viejos—, y es lo que se busca en un archivo que se manda a un tercero.
"""

# Qué campos se pueden poner (y en qué orden se leen): un dict con estas claves.
TAG_KEYS = ("title", "artist", "album", "authors", "producers", "genre", "year", "track", "comment")

# ---------------------------------------------------------------- ID3v2.3 (MP3)

_ID3_TEXT_FRAMES = (
    ("TIT2", "title"),      # título
    ("TPE1", "artist"),     # el artista
    ("TALB", "album"),      # el disco (o la playlist de la que sale)
    ("TCON", "genre"),      # género
    ("TYER", "year"),       # año
    ("TRCK", "track"),      # nº de pista
)


def _syncsafe(n: int) -> bytes:
    """El tamaño de la CABECERA de un ID3v2 va en «syncsafe»: 7 bits útiles por byte."""
    n = max(0, int(n))
    return bytes(((n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F))


def _frame(frame_id: str, payload: bytes) -> bytes:
    """Un frame de ID3v2.3: id (4) + tamaño (4, entero normal) + 2 banderas + contenido."""
    if not payload:
        return b""
    return (frame_id.encode("ascii")[:4].ljust(4, b" ")
            + len(payload).to_bytes(4, "big") + b"\x00\x00" + payload)


def _utf16(texto: str) -> bytes:
    """Texto de un frame en UTF-16 con BOM. ⚠️ Con acentos y ñ el ISO-8859-1 no vale."""
    return b"\x01" + "﻿".encode("utf-16-le") + (texto or "").encode("utf-16-le") + b"\x00\x00"


def _text_frame(frame_id: str, texto: str) -> bytes:
    texto = (texto or "").strip()
    return _frame(frame_id, _utf16(texto)) if texto else b""


def _txxx(descripcion: str, texto: str) -> bytes:
    """Un TXXX (texto «de usuario»): es donde los programas guardan lo que no tiene frame propio,
    como el PRODUCTOR."""
    texto = (texto or "").strip()
    if not texto:
        return b""
    payload = (b"\x01" + "﻿".encode("utf-16-le")
               + (descripcion or "").encode("utf-16-le") + b"\x00\x00"
               + "﻿".encode("utf-16-le") + texto.encode("utf-16-le") + b"\x00\x00")
    return _frame("TXXX", payload)


def _ipls(pares: list) -> bytes:
    """IPLS: la lista de «gente implicada» (función, nombre), que es donde va el productor en 2.3."""
    pares = [(f, n) for f, n in (pares or []) if (n or "").strip()]
    if not pares:
        return b""
    trozos = ["﻿"]
    for funcion, nombre in pares:
        trozos.append(funcion + "\x00" + nombre + "\x00")
    payload = b"\x01" + "".join(trozos).encode("utf-16-le")
    return _frame("IPLS", payload)


def _comm(texto: str) -> bytes:
    """El COMENTARIO (COMM): idioma + descripción vacía + el texto."""
    texto = (texto or "").strip()
    if not texto:
        return b""
    payload = (b"\x01" + b"spa" + "﻿".encode("utf-16-le") + b"\x00\x00"
               + "﻿".encode("utf-16-le") + texto.encode("utf-16-le") + b"\x00\x00")
    return _frame("COMM", payload)


def _apic(datos: bytes, mime: str = "image/jpeg") -> bytes:
    """La PORTADA (APIC), como «cover front» (tipo 3)."""
    if not datos:
        return b""
    payload = (b"\x00" + (mime or "image/jpeg").encode("ascii") + b"\x00"
               + b"\x03" + b"\x00")          # descripción vacía (codificación 0 → un solo \x00)
    return _frame("APIC", payload + datos)


def strip_id3(data: bytes) -> bytes:
    """Quita el ID3v2 que ya trajera el MP3.

    ⚠️ Si no se quita, el archivo acaba con DOS etiquetas y cada programa lee una: unos enseñarían
    lo viejo y otros lo nuevo."""
    if len(data) < 10 or data[:3] != b"ID3":
        return data
    tam = 0
    for b in data[6:10]:
        if b & 0x80:                      # no es syncsafe: no me fío, lo dejo como está
            return data
        tam = (tam << 7) | b
    fin = 10 + tam
    # ID3v2.4 puede llevar un pie de 10 bytes.
    if len(data) > 5 and (data[5] & 0x10):
        fin += 10
    return data[fin:] if 0 < fin <= len(data) else data


def mp3_with_tags(data: bytes, tags: dict, cover: tuple = None) -> bytes:
    """El MP3 con sus etiquetas puestas (sin tocar el audio)."""
    tags = dict(tags or {})
    partes = []
    for frame_id, clave in _ID3_TEXT_FRAMES:
        partes.append(_text_frame(frame_id, str(tags.get(clave) or "")))
    autores = [x for x in (tags.get("authors") or []) if (x or "").strip()]
    productores = [x for x in (tags.get("producers") or []) if (x or "").strip()]
    if autores:
        # TCOM es «compositor»: es donde iTunes, Windows y los coches enseñan a los AUTORES.
        partes.append(_text_frame("TCOM", " / ".join(autores)))
    if productores:
        partes.append(_txxx("PRODUCER", " / ".join(productores)))
        partes.append(_ipls([("producer", n) for n in productores]))
    partes.append(_comm(str(tags.get("comment") or "")))
    if cover and cover[0]:
        partes.append(_apic(cover[0], cover[1] if len(cover) > 1 else "image/jpeg"))
    cuerpo = b"".join(p for p in partes if p)
    if not cuerpo:
        return data
    cabecera = b"ID3" + b"\x03\x00" + b"\x00" + _syncsafe(len(cuerpo))
    return cabecera + cuerpo + strip_id3(data)


# ---------------------------------------------------------------- RIFF INFO (WAV)

_WAV_INFO_FIELDS = (
    (b"INAM", "title"),
    (b"IART", "artist"),
    (b"IPRD", "album"),
    (b"IGNR", "genre"),
    (b"ICRD", "year"),
    (b"ITRK", "track"),
    (b"ICMT", "comment"),
)


def _riff_chunk(cid: bytes, payload: bytes) -> bytes:
    """Un trozo de RIFF: id (4) + tamaño (4, little-endian) + contenido, con relleno a par."""
    relleno = b"\x00" if (len(payload) % 2) else b""
    return cid + len(payload).to_bytes(4, "little") + payload + relleno


def wav_with_tags(data: bytes, tags: dict) -> bytes:
    """El WAV con su trozo `LIST/INFO` (lo que el formato admite como metadatos).

    ⚠️ Un WAV NO lleva portada: eso es cosa del MP3 (APIC). Aquí van los textos."""
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return data
    tags = dict(tags or {})
    autores = [x for x in (tags.get("authors") or []) if (x or "").strip()]
    productores = [x for x in (tags.get("producers") or []) if (x or "").strip()]
    campos = []
    for cid, clave in _WAV_INFO_FIELDS:
        valor = str(tags.get(clave) or "").strip()
        if valor:
            campos.append((cid, valor))
    if autores:
        campos.append((b"IWRI", " / ".join(autores)))       # escrito por (los autores)
    if productores:
        campos.append((b"IENG", " / ".join(productores)))   # el técnico/productor
    if not campos:
        return data
    trozos = b"".join(_riff_chunk(cid, texto.encode("utf-8") + b"\x00") for cid, texto in campos)
    lista = _riff_chunk(b"LIST", b"INFO" + trozos)
    # ⚠️ Se quita el LIST/INFO que ya hubiera: si no, quedarían dos y cada programa leería uno.
    cuerpo = _wav_without_info(data[12:])
    salida = b"RIFF" + (4 + len(cuerpo) + len(lista)).to_bytes(4, "little") + b"WAVE" + cuerpo + lista
    return salida


def _wav_without_info(cuerpo: bytes) -> bytes:
    """Los trozos del WAV menos el `LIST/INFO` que ya tuviera."""
    salida, i = [], 0
    while i + 8 <= len(cuerpo):
        cid = cuerpo[i:i + 4]
        tam = int.from_bytes(cuerpo[i + 4:i + 8], "little")
        fin = i + 8 + tam + (tam % 2)
        if fin > len(cuerpo):                 # trozo cortado: se deja lo que queda tal cual
            salida.append(cuerpo[i:])
            return b"".join(salida)
        if not (cid == b"LIST" and cuerpo[i + 8:i + 12] == b"INFO"):
            salida.append(cuerpo[i:fin])
        i = fin
    if i < len(cuerpo):
        salida.append(cuerpo[i:])
    return b"".join(salida)


# ---------------------------------------------------------------- punto único

def with_tags(data: bytes, ext: str, tags: dict, cover: tuple = None) -> bytes:
    """PUNTO ÚNICO: el audio con sus etiquetas, según lo que sea.

    Lo que no se sabe etiquetar se devuelve **tal cual**: nunca se estropea un archivo por no poder
    ponerle el nombre."""
    if not data or not tags:
        return data
    ext = ("." + (ext or "").strip().lower().lstrip(".")) if ext else ""
    try:
        if ext == ".mp3":
            return mp3_with_tags(data, tags, cover)
        if ext in (".wav", ".wave"):
            return wav_with_tags(data, tags)
    except Exception:
        return data
    return data
