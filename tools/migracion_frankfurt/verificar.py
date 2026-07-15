# Verificación final de la migración: compara filas por tabla, comprueba que no quedan URLs
# del proyecto viejo en la BD nueva, compara el nº de archivos de Storage y prueba que unas
# cuantas fotos se descargan del proyecto nuevo. Todo de solo lectura.
# Uso:  .venv/bin/python tools/migracion_frankfurt/verificar.py

import os
import re
import sys
import urllib.request

import psycopg2

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def leer_env(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


viejo_env = leer_env(os.path.join(BASE, ".env"))
nuevo_env = leer_env(os.path.join(BASE, "migracion_frankfurt.env"))
REF_VIEJA = re.sub(r"https?://([^.]+)\.supabase\.co.*", r"\1", viejo_env["SUPABASE_URL"])

viejo = psycopg2.connect(viejo_env["DATABASE_URL"], connect_timeout=10)
viejo.set_session(readonly=True, autocommit=True)
nuevo = psycopg2.connect(nuevo_env["NUEVO_DATABASE_URL"], connect_timeout=10)
nuevo.set_session(readonly=True, autocommit=True)
cv, cn = viejo.cursor(), nuevo.cursor()

def tablas(cur):
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
    return {r[0] for r in cur.fetchall()}

problemas = 0

print("== 1) Filas por tabla (vieja vs nueva) ==")
for t in sorted(tablas(cv) & tablas(cn)):
    cv.execute(f'SELECT count(*) FROM public."{t}"'); a = cv.fetchone()[0]
    cn.execute(f'SELECT count(*) FROM public."{t}"'); b = cn.fetchone()[0]
    if a != b:
        problemas += 1
        print(f"  DESAJUSTE {t}: vieja={a} nueva={b}")
print("  (sin desajustes)" if problemas == 0 else f"  -> {problemas} tablas con desajuste")

print("== 2) ¿Quedan URLs del proyecto viejo en la nueva? ==")
cn.execute("""
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND data_type IN ('text','character varying','json','jsonb')
""")
restos = 0
for tabla, col, tipo in cn.fetchall():
    cast = "::text" if tipo in ("json", "jsonb") else ""
    cn.execute(f'SELECT count(*) FROM public."{tabla}" WHERE "{col}"{cast} LIKE %s', (f"%{REF_VIEJA}%",))
    n = cn.fetchone()[0]
    if n:
        restos += n
        print(f"  RESTO {tabla}.{col}: {n} filas")
print("  (limpio)" if restos == 0 else f"  -> {restos} referencias al proyecto viejo SIN reescribir")
problemas += 1 if restos else 0

print("== 3) Storage: nº de archivos ==")
def n_objetos(cur):
    cur.execute("SELECT count(*) FROM storage.objects WHERE bucket_id='media' AND name NOT LIKE '%.emptyFolderPlaceholder'")
    return cur.fetchone()[0]
a, b = n_objetos(cv), n_objetos(cn)
print(f"  vieja={a} nueva={b}" + ("  ✅" if b >= a else "  ❌ FALTAN ARCHIVOS"))
problemas += 1 if b < a else 0

print("== 4) Muestreo: descargar 5 fotos desde el proyecto NUEVO ==")
cn.execute("SELECT file_url FROM photos WHERE file_url IS NOT NULL ORDER BY created_at DESC LIMIT 5")
for (url,) in cn.fetchall():
    try:
        r = urllib.request.urlopen(url, timeout=20)
        ok = r.status == 200 and len(r.read(64)) > 0
        print(f"  {'OK ' if ok else 'MAL'} {url[:100]}")
        problemas += 0 if ok else 1
    except Exception as e:
        problemas += 1
        print(f"  MAL ({type(e).__name__}) {url[:100]}")

print(f"\nRESULTADO: {'TODO OK ✅' if problemas == 0 else f'{problemas} problema(s) — revisar antes de cambiar Render'}")
viejo.close(); nuevo.close()
sys.exit(0 if problemas == 0 else 1)
