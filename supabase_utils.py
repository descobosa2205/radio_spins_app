# supabase_utils.py
import io
from uuid import uuid4
from supabase import create_client, Client
from config import settings

_supabase: Client | None = None

def supabase_client() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno.")
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase

def upload_png(file_storage, folder: str) -> str | None:
    if not file_storage or not getattr(file_storage, "filename", ""):
        return None

    fname = (file_storage.filename or "").lower()
    if not fname.endswith(".png"):
        raise ValueError("Solo se permiten imágenes PNG.")

    key = f"{folder}/{uuid4().hex}.png"
    client = supabase_client()

    data = file_storage.read()
    file_storage.stream.seek(0)

    # file_options: usar strings y 'content-type' (con guion)
    resp = client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=key,
        file=data,
        file_options={"content-type": "image/png", "cache-control": "3600", "upsert": "false"}
    )

    # Algunas versiones devuelven dict con 'error'
    if isinstance(resp, dict) and resp.get("error"):
        msg = resp["error"].get("message", "Error subiendo a Storage")
        raise RuntimeError(msg)

    public_url = client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(key)
    return public_url