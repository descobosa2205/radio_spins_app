# Crea el ESQUEMA en la BD NUEVA (Frankfurt) usando las migraciones de la propia app
# (init_db + todos los ensure_*), de forma síncrona y con log por paso.
# NO toca la BD vieja: inyecta la URL nueva como DATABASE_URL antes de importar models.
# Uso:  .venv/bin/python tools/migracion_frankfurt/crear_esquema.py

import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BASE)


def leer_env(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


nuevo = leer_env(os.path.join(BASE, "migracion_frankfurt.env"))
NUEVO_DB = nuevo["NUEVO_DATABASE_URL"]
if "gyezqnqyxpwxxevdjhgf" not in NUEVO_DB:
    sys.exit("SEGURIDAD: la URL no parece la del proyecto NUEVO; me niego a continuar.")

# Inyectar ANTES de importar config/models (config usa load_dotenv(override=False) -> esto gana)
os.environ["DATABASE_URL"] = NUEVO_DB
os.environ["SUPABASE_URL"] = nuevo.get("NUEVO_SUPABASE_URL", "")
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = nuevo.get("NUEVO_SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "migracion")

import psycopg2  # noqa: E402

conn = psycopg2.connect(NUEVO_DB, connect_timeout=10)
conn.autocommit = True
conn.cursor().execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
conn.close()
print("[ext] uuid-ossp OK")

import models  # noqa: E402  (el engine ya apunta a la BD nueva)

# Mismo orden que el arranque de la app (app.py::_bootstrap_schema_bg)
ORDEN = [
    "init_db",
    "ensure_artist_feature_schema", "ensure_discografica_schema", "ensure_isrc_and_song_detail_schema",
    "ensure_song_delivery_schema", "ensure_song_royalties_schema", "ensure_editorial_schema",
    "ensure_ingresos_schema", "ensure_royalty_liquidations_schema", "ensure_album_schema",
    "ensure_concerts_schema_enhancements", "ensure_third_party_and_contract_sheet_schema",
    "ensure_concert_artwork_schema", "ensure_invitation_schema", "ensure_entity_links_schema",
    "ensure_radio_import_schema", "ensure_simulations_schema", "ensure_fotos_schema",
    "ensure_artist_calendar_schema", "ensure_personnel_and_operations_schema",
    "ensure_bag_expense_schema", "ensure_marketing_country_schema", "ensure_contracting_embargo_schema",
    "ensure_actions_contracting_admin_schema", "ensure_roadmap_onesheet_schema",
    "ensure_chartmetric_schema", "ensure_performance_indexes",
]
hechas = set()
for nombre in ORDEN:
    fn = getattr(models, nombre, None)
    if fn is None:
        print(f"[skip] {nombre} (no existe en models)")
        continue
    print(f"[run ] {nombre} ...", flush=True)
    fn()
    hechas.add(nombre)

# Red de seguridad: cualquier ensure_* nuevo que la lista no conozca (idempotentes todos)
extras = [n for n in dir(models) if n.startswith("ensure_") and callable(getattr(models, n)) and n not in hechas]
for nombre in sorted(extras):
    print(f"[run+] {nombre} (extra no listado)", flush=True)
    getattr(models, nombre)()

conn = psycopg2.connect(NUEVO_DB)
cur = conn.cursor()
cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
print(f"\nESQUEMA CREADO: {cur.fetchone()[0]} tablas en la BD nueva ✅")
conn.close()
