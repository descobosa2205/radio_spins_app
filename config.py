import os
import secrets
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
    # Nunca usar una clave fija conocida: si falta la variable, generamos una aleatoria
    # (así un despliegue mal configurado no queda con la clave por defecto pública).
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY") or secrets.token_urlsafe(48)

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

    # --- Integraciones externas (OPCIONALES) ---
    # Si la credencial falta, la integración queda DESACTIVADA y no afecta a la app.
    # ⚠️ Estas credenciales NO deben ir en el .env versionado: ponerlas en el panel de Render.
    #
    # Pleo (gastos): "Standalone API Key" que Pleo habilita para uso interno (auth HTTP Basic).
    PLEO_API_KEY = os.getenv("PLEO_API_KEY")
    PLEO_API_BASE = os.getenv("PLEO_API_BASE", "https://external.pleo.io")
    # Chartmetric (métricas): refresh token de larga duración que Chartmetric envía por email.
    CHARTMETRIC_REFRESH_TOKEN = os.getenv("CHARTMETRIC_REFRESH_TOKEN")
    CHARTMETRIC_API_BASE = os.getenv("CHARTMETRIC_API_BASE", "https://api.chartmetric.com")

settings = Settings()