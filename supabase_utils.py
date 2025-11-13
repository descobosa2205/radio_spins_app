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
    """
    Sube un PNG al bucket y devuelve su URL pública.
    - file_storage: werkzeug.datastructures.FileStorage
    """
    if not file_storage or file_storage.filename == "":
        return None
    fname = file_storage.filename.lower()
    if not fname.endswith(".png"):
        raise ValueError("Solo se permiten imágenes PNG.")
    data = file_storage.read()
    file_storage.stream.seek(0)

    key = f"{folder}/{uuid4().hex}.png"
    client = supabase_client()
    # upload (setea correctamente el content type)
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=key,
        file=data,
        file_options={"contentType": "image/png", "upsert": False}
    )
    # url pública
    public_url = client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(key)
    return public_url