# Copia TODOS los datos de la BD vieja (Estocolmo) a la nueva (Frankfurt).
# - La vieja se abre EN SOLO LECTURA (jamás se toca).
# - En la nueva: TRUNCATE de las tablas comunes (borra los seeds del arranque) y COPY masivo
#   con session_replication_role=replica (ignora el orden de las FKs).
# - Las tablas que existan solo en la vieja (legado retirado) se LISTAN y se saltan.
# Uso:  .venv/bin/python tools/migracion_frankfurt/copiar_datos.py

import io
import os
import sys
import time

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


VIEJO_DB = leer_env(os.path.join(BASE, ".env"))["DATABASE_URL"]
NUEVO_DB = leer_env(os.path.join(BASE, "migracion_frankfurt.env"))["NUEVO_DATABASE_URL"]
if "gyezqnqyxpwxxevdjhgf" not in NUEVO_DB:
    sys.exit("SEGURIDAD: el destino no parece el proyecto NUEVO; me niego a continuar.")
if "gyezqnqyxpwxxevdjhgf" in VIEJO_DB:
    sys.exit("SEGURIDAD: el ORIGEN apunta al proyecto nuevo; revisa los .env.")

viejo = psycopg2.connect(VIEJO_DB, connect_timeout=10)
viejo.set_session(readonly=True, autocommit=True)
nuevo = psycopg2.connect(NUEVO_DB, connect_timeout=10)
nuevo.autocommit = True
cv, cn = viejo.cursor(), nuevo.cursor()

def tablas(cur):
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
    return {r[0] for r in cur.fetchall()}

def columnas(cur, tabla):
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
        (tabla,),
    )
    return [r[0] for r in cur.fetchall()]

t_viejas, t_nuevas = tablas(cv), tablas(cn)
comunes = sorted(t_viejas & t_nuevas)
solo_viejas = sorted(t_viejas - t_nuevas)
if solo_viejas:
    print(f"AVISO: {len(solo_viejas)} tablas SOLO en la vieja (legado; NO se copian): {', '.join(solo_viejas)}")
print(f"Tablas a copiar: {len(comunes)}")

# FKs fuera durante la carga masiva (solo en la sesión del destino)
cn.execute("SET session_replication_role = replica")
print("TRUNCATE de las tablas comunes en destino (borra seeds del arranque)...")
cn.execute("TRUNCATE TABLE " + ", ".join(f'public."{t}"' for t in comunes) + " CASCADE")

t0 = time.time()
total_filas = 0
for t in comunes:
    cols = [c for c in columnas(cv, t) if c in set(columnas(cn, t))]
    col_list = ", ".join(f'"{c}"' for c in cols)
    buf = io.BytesIO()
    cv.copy_expert(f'COPY (SELECT {col_list} FROM public."{t}") TO STDOUT', buf)
    buf.seek(0)
    cn.copy_expert(f'COPY public."{t}" ({col_list}) FROM STDIN', buf)
    cn.execute(f'SELECT count(*) FROM public."{t}"')
    n = cn.fetchone()[0]
    total_filas += n
    print(f"  {t:45} {n:>8} filas")

# Secuencias: ajustar al máximo real de cada columna serial
cn.execute("""
  SELECT c.table_name, c.column_name, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name)
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.column_default LIKE 'nextval%'
""")
for tabla, col, seq in cn.fetchall():
    if seq:
        cn.execute(f'SELECT setval(%s, COALESCE((SELECT max("{col}") FROM public."{tabla}"), 0) + 1, false)', (seq,))
        print(f"  [seq] {seq} ajustada")

cn.execute("SET session_replication_role = DEFAULT")
print(f"\nDATOS COPIADOS: {total_filas} filas en {time.time()-t0:.1f}s ✅")
viejo.close(); nuevo.close()
