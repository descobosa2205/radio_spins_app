# supabase_utils.py
from uuid import uuid4
from supabase import create_client, Client

from config import settings

_supabase: Client | None = None


def supabase_client() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError(
                "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno."
            )
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase


def _upload_bytes(data: bytes, key: str, content_type: str) -> str:
    """Sube bytes a Supabase Storage y devuelve URL pública."""
    client = supabase_client()

    resp = client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=key,
        file=data,
        file_options={
            "content-type": content_type,
            "cache-control": "3600",
            "upsert": "false",
        },
    )

    # Algunas versiones devuelven dict con 'error'
    if isinstance(resp, dict) and resp.get("error"):
        msg = resp["error"].get("message", "Error subiendo a Storage")
        raise RuntimeError(msg)

    return client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(key)


def upload_png(file_storage, folder: str) -> str | None:
    """Sube un PNG (si viene) y devuelve URL pública."""
    if not file_storage or not getattr(file_storage, "filename", ""):
        return None

    fname = (file_storage.filename or "").lower()
    if not fname.endswith(".png"):
        raise ValueError("Solo se permiten imágenes PNG.")

    key = f"{folder}/{uuid4().hex}.png"
    data = file_storage.read()
    file_storage.stream.seek(0)
    return _upload_bytes(data, key, "image/png")


def upload_image(file_storage, folder: str) -> str | None:
    """Sube una imagen (formatos comunes) y devuelve URL pública.

    Formatos soportados:
    - PNG
    - JPG/JPEG
    - WEBP
    - GIF
    - SVG

    Nota: Validamos por extensión (y content-type si viene informado).
    """

    if not file_storage or not getattr(file_storage, "filename", ""):
        return None

    fname = (file_storage.filename or "").lower().strip()
    ext_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }

    ext = None
    for k in ext_map.keys():
        if fname.endswith(k):
            ext = k
            break

    if not ext:
        raise ValueError("Formato de imagen no permitido. Sube PNG/JPG/WEBP/GIF/SVG.")

    content_type = ext_map[ext]
    # Si werkzeug nos pasa un mimetype de imagen, lo respetamos.
    mt = (getattr(file_storage, "mimetype", "") or "").lower()
    if mt.startswith("image/"):
        content_type = mt

    key = f"{folder}/{uuid4().hex}{ext}"
    data = file_storage.read()
    file_storage.stream.seek(0)
    return _upload_bytes(data, key, content_type)


def upload_pdf(file_storage, folder: str) -> str | None:
    """Sube un PDF (si viene) y devuelve URL pública."""
    if not file_storage or not getattr(file_storage, "filename", ""):
        return None

    fname = (file_storage.filename or "").lower()
    if not fname.endswith(".pdf"):
        raise ValueError("Solo se permiten archivos PDF.")

    key = f"{folder}/{uuid4().hex}.pdf"
    data = file_storage.read()
    file_storage.stream.seek(0)
    return _upload_bytes(data, key, "application/pdf")
