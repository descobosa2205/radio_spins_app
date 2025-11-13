import os
from dotenv import load_dotenv, find_dotenv

# Carga el .env esté donde esté (sube hasta encontrarlo)
load_dotenv(find_dotenv(), override=False)

def _norm_db_url(url: str | None) -> str | None:
    if not url:
        return None
    # Acepta distintos prefijos y normaliza a psycopg2
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    # Añade sslmode=require si no está
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url

class Settings:
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret")

    # Admitimos varios nombres por si estás en un entorno que expone otros:
    _RAW_DB_URL = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("SUPABASE_POSTGRES_URL")
    )
    DATABASE_URL = _norm_db_url(_RAW_DB_URL)

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # server-only
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "media")

    BRAND_PRIMARY = os.getenv("BRAND_PRIMARY", "#1f7ae0")
    BRAND_ACCENT = os.getenv("BRAND_ACCENT", "#ffd000")

settings = Settings()