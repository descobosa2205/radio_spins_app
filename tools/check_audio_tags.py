# -*- coding: utf-8 -*-
"""PRUEBA DE REGRESIÓN de `audio_tags.py` (los metadatos que van dentro de lo que se descarga).

Hace DOS cosas:
 1) lee de vuelta lo escrito con un lector propio (sin depender de nada), y
 2) se lo da a **ffmpeg de verdad** (el binario de imageio-ffmpeg) y comprueba que lo que enseña es
    lo que se puso. ⚠️ Esto es lo que de verdad demuestra que un reproductor lo va a leer: un lector
    escrito por uno mismo puede estar de acuerdo con su propio error.

    python3 tools/check_audio_tags.py
"""
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import audio_tags as T

FALLOS = []


def comprueba(nombre, ok, detalle=""):
    print(("  OK   " if ok else "  MAL  ") + nombre + (("  ·  " + str(detalle)) if detalle else ""))
    if not ok:
        FALLOS.append(nombre)


# ---------------------------------------------------------------- lector propio de ID3v2.3
def lee_id3(data):
    assert data[:3] == b"ID3", "no hay etiqueta"
    tam = 0
    for b in data[6:10]:
        tam = (tam << 7) | b
    i, fin, out = 10, 10 + tam, []
    while i + 10 <= fin:
        fid = data[i:i + 4]
        if fid == b"\x00\x00\x00\x00":
            break
        n = int.from_bytes(data[i + 4:i + 8], "big")
        payload = data[i + 10:i + 10 + n]
        out.append((fid.decode("ascii"), payload))
        i += 10 + n
    return out, fin


def texto_de(payload):
    if not payload:
        return ""
    if payload[0] == 1:
        return payload[1:].decode("utf-16", "ignore").replace("﻿", "").strip("\x00")
    return payload[1:].decode("latin-1", "ignore").strip("\x00")


MP3_MIN = (b"\xff\xfb\x90\x00" + b"\x00" * 100)     # no es un mp3 de verdad: vale para ver bytes

TAGS = {
    "title": "Ñandú (versión café)",
    "artist": "Los Ñus",
    "album": "Maquetas",
    "authors": ["Pepe Autor", "María Compositora"],
    "producers": ["Estudio Perico", "Mario Mezclas"],
    "genre": "Pop",
    "year": "2026",
    "comment": "Autores: Pepe Autor · Productores: Estudio Perico",
}

print("· ID3 en un MP3")
salida = T.mp3_with_tags(MP3_MIN, TAGS, cover=(b"\xff\xd8\xff\xe0JPEGFALSO", "image/jpeg"))
frames, fin = lee_id3(salida)
mapa = dict(frames)
comprueba("el audio NO se toca", salida[fin:] == MP3_MIN)
comprueba("título con ñ y acentos", texto_de(mapa.get("TIT2")) == TAGS["title"],
          texto_de(mapa.get("TIT2")))
comprueba("artista", texto_de(mapa.get("TPE1")) == "Los Ñus")
comprueba("autores en TCOM", texto_de(mapa.get("TCOM")) == "Pepe Autor / María Compositora")
comprueba("productores en TXXX", "Estudio Perico / Mario Mezclas" in texto_de(mapa.get("TXXX")))
comprueba("productores en IPLS", "Mario Mezclas" in texto_de(mapa.get("IPLS")))
comprueba("portada (APIC)", b"JPEGFALSO" in (mapa.get("APIC") or b""))
comprueba("género y año", texto_de(mapa.get("TCON")) == "Pop" and texto_de(mapa.get("TYER")) == "2026")

print("· no se acumulan DOS etiquetas")
otra = T.mp3_with_tags(salida, {"title": "Otro nombre"})
frames2, fin2 = lee_id3(otra)
comprueba("la anterior se quita", otra[fin2:] == MP3_MIN)
comprueba("y manda la nueva", texto_de(dict(frames2).get("TIT2")) == "Otro nombre")

print("· sin etiquetas, el archivo se devuelve tal cual")
comprueba("nada que poner", T.with_tags(MP3_MIN, ".mp3", {}) == MP3_MIN)
comprueba("formato que no se sabe etiquetar", T.with_tags(b"xxxx", ".m4a", TAGS) == b"xxxx")

print("· RIFF INFO en un WAV")
def wav_falso(datos=b"\x00" * 64):
    fmt = b"fmt " + (16).to_bytes(4, "little") + b"\x01\x00\x01\x00" + (44100).to_bytes(4, "little") \
          + (88200).to_bytes(4, "little") + b"\x02\x00\x10\x00"
    d = b"data" + len(datos).to_bytes(4, "little") + datos
    cuerpo = fmt + d
    return b"RIFF" + (4 + len(cuerpo)).to_bytes(4, "little") + b"WAVE" + cuerpo

w = T.wav_with_tags(wav_falso(), TAGS)
comprueba("sigue siendo un RIFF/WAVE", w[:4] == b"RIFF" and w[8:12] == b"WAVE")
comprueba("el tamaño del RIFF cuadra", int.from_bytes(w[4:8], "little") == len(w) - 8,
          "%d vs %d" % (int.from_bytes(w[4:8], "little"), len(w) - 8))
comprueba("lleva LIST/INFO", b"LIST" in w and b"INFO" in w)
comprueba("título", b"\xc3\x91and\xc3\xba" in w)     # «Ñandú» en UTF-8
comprueba("autores (IWRI) y productores (IENG)", b"IWRI" in w and b"IENG" in w)
comprueba("los datos del audio siguen ahí", b"data" in w)
w2 = T.wav_with_tags(w, {"title": "Otro"})
comprueba("no se acumulan dos LIST/INFO", w2.count(b"INFO") == 1, "INFO x%d" % w2.count(b"INFO"))

# ---------------------------------------------------------------- 2) ffmpeg DE VERDAD
print("· lo que lee ffmpeg (un reproductor de verdad)")
try:
    import imageio_ffmpeg
    exe = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    exe = ""
if not exe:
    print("  (sin ffmpeg: me salto la comprobación con un reproductor real)")
else:
    tmp = tempfile.mkdtemp()
    mp3 = os.path.join(tmp, "in.mp3")
    # Un MP3 DE VERDAD (silencio), para que ffmpeg lo pueda abrir.
    subprocess.run([exe, "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1",
                    "-b:a", "64k", mp3], capture_output=True, timeout=60)
    with open(mp3, "rb") as f:
        crudo = f.read()
    etiquetado = T.mp3_with_tags(crudo, TAGS)
    with open(mp3, "wb") as f:
        f.write(etiquetado)
    r = subprocess.run([exe, "-i", mp3], capture_output=True, timeout=60)
    info = (r.stderr or b"").decode("utf-8", "ignore")
    comprueba("ffmpeg lee el título", "Ñandú (versión café)" in info, info.count("title"))
    comprueba("ffmpeg lee el artista", "Los Ñus" in info)
    comprueba("ffmpeg lee los autores", "Pepe Autor" in info)
    comprueba("ffmpeg lee los productores", "Estudio Perico" in info)
    comprueba("ffmpeg sigue leyendo el audio", "Audio: mp3" in info)

    wav = os.path.join(tmp, "in.wav")
    subprocess.run([exe, "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1", wav],
                   capture_output=True, timeout=60)
    with open(wav, "rb") as f:
        crudo_w = f.read()
    with open(wav, "wb") as f:
        f.write(T.wav_with_tags(crudo_w, TAGS))
    r = subprocess.run([exe, "-i", wav], capture_output=True, timeout=60)
    info = (r.stderr or b"").decode("utf-8", "ignore")
    comprueba("ffmpeg lee el WAV etiquetado", "Ñandú (versión café)" in info and "Audio: pcm" in info,
              [l for l in info.splitlines() if "title" in l.lower()][:1])

print()
if FALLOS:
    print("FALLOS: %d ->" % len(FALLOS), ", ".join(FALLOS))
    sys.exit(1)
print("Todo en verde.")
