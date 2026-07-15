# Copia los archivos del bucket `media` del proyecto Supabase VIEJO (Estocolmo) al NUEVO (Frankfurt).
#
# - REANUDABLE: consulta qué archivos ya existen en el destino y solo copia los que faltan.
#   Se puede cortar y relanzar sin miedo (las claves son UUID inmutables: nada se sobreescribe).
# - NO TOCA el proyecto viejo (solo lecturas/descargas públicas).
# - Uso:   .venv/bin/python tools/migracion_frankfurt/copiar_storage.py [--check]
#          --check: solo muestra cuántos archivos hay en cada lado y cuántos faltan.
#
# Credenciales: las del viejo salen de .env; las del nuevo de migracion_frankfurt.env (gitignored).

import os
import sys
import time
import tempfile
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import psycopg2

BUCKET = "media"
HILOS = 3
REINTENTOS = 3


def leer_env(path: str) -> dict:
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
viejo = leer_env(os.path.join(BASE, ".env"))
nuevo = leer_env(os.path.join(BASE, "migracion_frankfurt.env"))

VIEJO_URL = (viejo.get("SUPABASE_URL") or "").rstrip("/")
VIEJO_DB = viejo.get("DATABASE_URL") or ""
NUEVO_URL = (nuevo.get("NUEVO_SUPABASE_URL") or "").rstrip("/")
NUEVO_KEY = nuevo.get("NUEVO_SUPABASE_SERVICE_ROLE_KEY") or ""
NUEVO_DB = nuevo.get("NUEVO_DATABASE_URL") or ""

if not (VIEJO_URL and VIEJO_DB):
    sys.exit("Faltan SUPABASE_URL/DATABASE_URL en .env")
if not (NUEVO_URL and NUEVO_KEY and NUEVO_DB):
    sys.exit("Rellena migracion_frankfurt.env (URL, service_role y DATABASE_URL del proyecto nuevo)")


def listar_objetos(db_url: str) -> dict:
    """{ruta: bytes} de los objetos del bucket, leyendo storage.objects (una sola consulta)."""
    conn = psycopg2.connect(db_url, connect_timeout=10)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor()
    cur.execute(
        "SELECT name, COALESCE((metadata->>'size')::bigint, 0), COALESCE(metadata->>'mimetype','') "
        "FROM storage.objects WHERE bucket_id=%s",
        (BUCKET,),
    )
    out = {}
    for name, size, mime in cur.fetchall():
        if name and not name.endswith(".emptyFolderPlaceholder"):
            out[name] = (size, mime)
    conn.close()
    return out


def asegurar_bucket_nuevo():
    """Crea el bucket `media` (público) en el proyecto nuevo si no existe."""
    req = urllib.request.Request(
        f"{NUEVO_URL}/storage/v1/bucket",
        method="POST",
        data=b'{"id":"media","name":"media","public":true}',
        headers={"Authorization": f"Bearer {NUEVO_KEY}", "apikey": NUEVO_KEY, "Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=20)
        print("[bucket] creado `media` (público) en el proyecto nuevo")
    except urllib.error.HTTPError as e:
        if e.code in (400, 409):  # ya existe
            print("[bucket] `media` ya existe en el proyecto nuevo")
        else:
            raise


def copiar_uno(ruta: str, size: int, mime: str) -> str:
    """Descarga del viejo (URL pública) y sube al nuevo (API con service key). Devuelve estado."""
    ruta_q = urllib.parse.quote(ruta)
    origen = f"{VIEJO_URL}/storage/v1/object/public/{BUCKET}/{ruta_q}"
    destino = f"{NUEVO_URL}/storage/v1/object/{BUCKET}/{ruta_q}"
    for intento in range(1, REINTENTOS + 1):
        tmp = None
        try:
            # Descarga en streaming a fichero temporal (los masters WAV pueden ser enormes)
            with urllib.request.urlopen(origen, timeout=300) as r, tempfile.NamedTemporaryFile(delete=False) as f:
                tmp = f.name
                while True:
                    chunk = r.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            with open(tmp, "rb") as f:
                data = f.read()
            req = urllib.request.Request(
                destino,
                method="POST",
                data=data,
                headers={
                    "Authorization": f"Bearer {NUEVO_KEY}",
                    "apikey": NUEVO_KEY,
                    "Content-Type": mime or "application/octet-stream",
                    "x-upsert": "false",
                    "cache-control": "31536000",
                },
            )
            urllib.request.urlopen(req, timeout=600)
            return "ok"
        except urllib.error.HTTPError as e:
            if e.code == 409:
                return "ya-existia"
            if intento == REINTENTOS:
                return f"ERROR HTTP {e.code}"
            time.sleep(2 * intento)
        except Exception as e:
            if intento == REINTENTOS:
                return f"ERROR {type(e).__name__}"
            time.sleep(2 * intento)
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
    return "ERROR"


def main():
    solo_check = "--check" in sys.argv
    print("Listando origen (Estocolmo)...")
    origen = listar_objetos(VIEJO_DB)
    print(f"  origen: {len(origen)} archivos · {sum(s for s, _ in origen.values())/1e9:.2f} GB")
    print("Listando destino (Frankfurt)...")
    try:
        destino = listar_objetos(NUEVO_DB)
    except Exception as e:
        print(f"  (destino aún sin bucket o sin acceso: {type(e).__name__}) -> se asume vacío")
        destino = {}
    print(f"  destino: {len(destino)} archivos")
    faltan = {k: v for k, v in origen.items() if k not in destino}
    gb = sum(s for s, _ in faltan.values()) / 1e9
    print(f"  FALTAN por copiar: {len(faltan)} archivos · {gb:.2f} GB")
    if solo_check or not faltan:
        return

    asegurar_bucket_nuevo()
    # Pequeños primero (el grueso del nº de archivos vuela); los WAV gordos al final.
    pendientes = sorted(faltan.items(), key=lambda kv: kv[1][0])
    hechos = errores = 0
    bytes_ok = 0
    t0 = time.time()

    def trabajo(item):
        ruta, (size, mime) = item
        return ruta, size, copiar_uno(ruta, size, mime)

    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        for ruta, size, res in pool.map(trabajo, pendientes):
            if res in ("ok", "ya-existia"):
                hechos += 1
                bytes_ok += size
            else:
                errores += 1
                print(f"  !! {ruta}: {res}", flush=True)
            total = hechos + errores
            if total % 100 == 0 or total == len(pendientes):
                mins = (time.time() - t0) / 60
                print(f"[{total}/{len(pendientes)}] ok={hechos} err={errores} · {bytes_ok/1e9:.2f} GB · {mins:.1f} min", flush=True)

    print(f"FIN: {hechos} copiados, {errores} errores, {bytes_ok/1e9:.2f} GB en {(time.time()-t0)/60:.1f} min")
    if errores:
        print("Relanza el script para reintentar solo los que faltan (es reanudable).")


if __name__ == "__main__":
    main()
