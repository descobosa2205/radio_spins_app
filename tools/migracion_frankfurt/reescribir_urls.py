# Reescribe en la BD NUEVA todas las URLs de Storage que apunten al proyecto viejo:
# sustituye la referencia del proyecto (gluyt... -> gyezq...) en TODAS las columnas de texto
# y JSON/JSONB del esquema public. Solo toca la BD NUEVA.
# Uso:  .venv/bin/python tools/migracion_frankfurt/reescribir_urls.py

import os
import re
import sys

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
REF_NUEVA = re.sub(r"https?://([^.]+)\.supabase\.co.*", r"\1", nuevo_env["NUEVO_SUPABASE_URL"])
NUEVO_DB = nuevo_env["NUEVO_DATABASE_URL"]
if REF_NUEVA not in NUEVO_DB or REF_VIEJA == REF_NUEVA:
    sys.exit("SEGURIDAD: referencias/URL incoherentes; me niego a continuar.")
print(f"Sustituyendo '{REF_VIEJA}' -> '{REF_NUEVA}' en la BD NUEVA")

conn = psycopg2.connect(NUEVO_DB, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()
cur.execute("""
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND data_type IN ('text','character varying','json','jsonb')
  ORDER BY table_name, column_name
""")
cols = cur.fetchall()
total = 0
for tabla, col, tipo in cols:
    if tipo in ("json", "jsonb"):
        sql = (
            f'UPDATE public."{tabla}" SET "{col}" = replace("{col}"::text, %s, %s)::{ "jsonb" if tipo=="jsonb" else "json" } '
            f'WHERE "{col}"::text LIKE %s'
        )
    else:
        sql = f'UPDATE public."{tabla}" SET "{col}" = replace("{col}", %s, %s) WHERE "{col}" LIKE %s'
    cur.execute(sql, (REF_VIEJA, REF_NUEVA, f"%{REF_VIEJA}%"))
    if cur.rowcount:
        total += cur.rowcount
        print(f"  {tabla}.{col} ({tipo}): {cur.rowcount} filas")

print(f"\nURLS REESCRITAS: {total} filas actualizadas ✅")
conn.close()
