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
    # Clave secreta para el refresco diario automático (lo llama una tarea programada de Render).
    CHARTMETRIC_CRON_KEY = os.getenv("CHARTMETRIC_CRON_KEY")
    # Enterticket (ticketera del grupo): usuario/clave de API (los facilita Enterticket).
    ENTERTICKET_USER = os.getenv("ENTERTICKET_USER")
    ENTERTICKET_PASSWORD = os.getenv("ENTERTICKET_PASSWORD")
    ENTERTICKET_API_BASE = os.getenv("ENTERTICKET_API_BASE", "https://api.enterticket.es")
    # Clave del endpoint /cron/enterticket/refresh (si falta, se acepta la de Chartmetric).
    ENTERTICKET_CRON_KEY = os.getenv("ENTERTICKET_CRON_KEY") or os.getenv("CHARTMETRIC_CRON_KEY")
    # Web Push (notificaciones del navegador / centro de notificaciones). Claves VAPID: se generan una
    # vez (p. ej. con `vapid --gen` de py-vapid) y se ponen en Render. Sin ellas, el push queda
    # DESACTIVADO (la app funciona igual). VAPID_SUBJECT = "mailto:tu-correo" o la URL del sitio.
    VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
    VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:escobosa@33producciones.es")

settings = Settings()