# supabase_utils.py
import os
from pathlib import Path
import mimetypes
from uuid import uuid4
from supabase import create_client, Client
try:
    import httpx
except Exception:  # pragma: no cover
    httpx = None
try:
    from supabase.lib.client_options import ClientOptions
except Exception:  # pragma: no cover
    ClientOptions = None

from config import settings

_supabase: Client | None = None

# Timeout AMPLIO para el cliente de Storage. El default de storage3 es 20 s (escalar): subir un vídeo
# grande de Render a Supabase lo supera, httpx lanzaba WriteTimeout y saltaba el fallback de
# upload_file que cargaba el vídeo ENTERO en memoria (OOM del worker -> 502). connect/pool cortos;
# read/write largos (lo que dura la subida). Override por env STORAGE_CLIENT_TIMEOUT.
_STORAGE_TIMEOUT_S = float(os.getenv("STORAGE_CLIENT_TIMEOUT", "300"))
# Tope del fallback en memoria de upload_file: por encima NO se lee el archivo entero (evita el OOM);
# se propaga un error legible. Imágenes/PDF pequeños conservan el reintento defensivo.
_MEM_FALLBACK_MAX_BYTES = int(os.getenv("UPLOAD_MEMORY_FALLBACK_MAX_BYTES", str(25 * 1024 * 1024)))


def _build_client_options():
    """Opciones del cliente con timeout amplio para Storage. DEFENSIVO: si la API difiere en la
    versión instalada, devuelve None y el cliente se crea sin opciones (comportamiento anterior)."""
    if ClientOptions is None:
        return None
    candidates = []
    if httpx is not None:
        try:
            candidates.append(httpx.Timeout(connect=15.0, read=_STORAGE_TIMEOUT_S,
                                            write=_STORAGE_TIMEOUT_S, pool=15.0))
        except Exception:
            pass
    candidates.append(_STORAGE_TIMEOUT_S)  # el tipo admite int/float/httpx.Timeout
    for candidate in candidates:
        try:
            return ClientOptions(storage_client_timeout=candidate)
        except Exception:
            continue
    return None


def supabase_client() -> Client:
    global _supabase
    if _supabase is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError(
                "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno."
            )
        options = _build_client_options()
        if options is not None:
            try:
                _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)
            except Exception:
                # Si la firma de create_client difiere en la versión instalada, NO rompemos TODO el
                # almacenamiento: creamos el cliente como siempre (timeout por defecto).
                _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        else:
            _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase


class StorageObjectTooLargeError(RuntimeError):
    """El archivo supera el tamaño máximo permitido por Supabase Storage.

    Se lanza cuando Supabase responde «Payload too large / The object exceeded the
    maximum allowed size». Lleva el tamaño (bytes) para poder mostrarlo al usuario.
    """

    def __init__(self, message: str, size_bytes: int | None = None):
        super().__init__(message)
        self.size_bytes = size_bytes


def _human_size(num_bytes) -> str | None:
    """Formatea bytes a un tamaño legible en español (coma decimal)."""
    try:
        size = float(num_bytes)
    except (TypeError, ValueError):
        return None
    if size < 0:
        return None
    units = ("B", "KB", "MB", "GB", "TB")
    idx = 0
    while size >= 1024 and idx < len(units) - 1:
        size /= 1024.0
        idx += 1
    if idx == 0:
        return f"{int(size)} B"
    return f"{size:.1f}".replace(".", ",") + " " + units[idx]


def _stream_size(file_obj) -> int | None:
    """Mide el tamaño de un stream sin consumirlo (seek al final y vuelta)."""
    try:
        pos = file_obj.tell()
    except Exception:
        return None
    try:
        file_obj.seek(0, 2)  # SEEK_END
        size = file_obj.tell()
        file_obj.seek(pos)  # restaura la posición para no romper la subida
        return size
    except Exception:
        try:
            file_obj.seek(pos)
        except Exception:
            pass
        return None


def _too_large_error(size_bytes: int | None) -> StorageObjectTooLargeError:
    human = _human_size(size_bytes)
    prefix = f"El archivo pesa {human} y " if human else "El archivo "
    return StorageObjectTooLargeError(
        prefix
        + "supera el tamaño máximo permitido en el almacenamiento (Supabase Storage). "
        "Aumenta el límite de subida en Supabase (Storage) o reduce/comprime el archivo.",
        size_bytes=size_bytes,
    )


def _is_too_large_error(exc) -> bool:
    """Detecta si un error de Supabase es por exceso de tamaño (varias versiones)."""
    parts = [str(exc)]
    for attr in ("message", "error", "code", "reason"):
        val = getattr(exc, attr, None)
        if val:
            parts.append(str(val))
    text = " ".join(parts).lower()
    markers = (
        "maximum allowed size",
        "object exceeded",
        "exceeded the maximum",
        "payload too large",
        "entitytoolarge",
    )
    if any(m in text for m in markers):
        return True
    for attr in ("status", "status_code", "statusCode"):
        try:
            if int(getattr(exc, attr, None)) == 413:
                return True
        except (TypeError, ValueError):
            pass
    return False


def _raise_storage_error(exc, size_bytes: int | None = None):
    """Convierte una excepción de Supabase Storage en un error claro y la relanza."""
    if _is_too_large_error(exc):
        raise _too_large_error(size_bytes) from exc
    msg = str(getattr(exc, "message", "") or "") or str(exc) or "Error subiendo el archivo al almacenamiento."
    raise RuntimeError(msg) from exc


def _check_dict_response(resp, size_bytes: int | None) -> None:
    """Compat: algunas versiones devuelven dict con 'error' en vez de excepción."""
    if isinstance(resp, dict) and resp.get("error"):
        err = resp["error"] or {}
        msg = err.get("message", "Error subiendo a Storage")
        low = str(msg).lower()
        if any(m in low for m in ("maximum allowed size", "too large", "exceeded")):
            raise _too_large_error(size_bytes)
        raise RuntimeError(msg)


def _upload_bytes(data: bytes, key: str, content_type: str) -> str:
    """Sube bytes a Supabase Storage y devuelve URL pública."""
    client = supabase_client()
    size_bytes = len(data) if data is not None else None

    try:
        resp = client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=key,
            file=data,
            file_options={
                "content-type": content_type,
                # Las claves son UUID únicos (el contenido de una URL no cambia jamás): caché larga
                # de 1 año. Con la caché corta de antes (1 h) las miniaturas caducaban y se
                # re-descargaban todas en ráfaga, provocando fallos intermitentes de carga.
                "cache-control": "31536000",
                "upsert": "false",
            },
        )
    except StorageObjectTooLargeError:
        raise
    except Exception as e:
        _raise_storage_error(e, size_bytes=size_bytes)

    # Algunas versiones devuelven dict con 'error'
    _check_dict_response(resp, size_bytes)

    return _public_url(client, key)


def _public_url(client: Client, key: str) -> str:
    """URL pública LIMPIA de un objeto. storage3 0.7.x añade siempre un «?» final (query vacía) en
    get_public_url; ese sufijo se guardaba en BD y algunos clientes de correo y previsualizadores
    de enlaces lo digieren mal. Se recorta antes de devolverla/guardarla."""
    url = client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(key) or ""
    return url.rstrip("?")


def _upload_fileobj(file_obj, key: str, content_type: str) -> str:
    """Sube usando el stream del archivo cuando la versión de supabase-py lo permite."""
    client = supabase_client()
    size_bytes = _stream_size(file_obj)
    try:
        resp = client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=key,
            file=file_obj,
            file_options={
                "content-type": content_type,
                "cache-control": "31536000",   # claves UUID inmutables: caché larga (ver _upload_bytes)
                "upsert": "false",
            },
        )
    except StorageObjectTooLargeError:
        raise
    except Exception as e:
        _raise_storage_error(e, size_bytes=size_bytes)
    _check_dict_response(resp, size_bytes)
    return _public_url(client, key)


def _rewind_file_storage(file_storage) -> None:
    try:
        file_storage.stream.seek(0)
    except Exception:
        try:
            file_storage.seek(0)
        except Exception:
            pass


def _content_type_for_upload(file_storage, suffix: str) -> str:
    mt = (getattr(file_storage, "mimetype", "") or "").strip()
    if mt and mt != "application/octet-stream":
        return mt
    guessed = mimetypes.types_map.get((suffix or "").lower()) or mimetypes.guess_type("archivo" + (suffix or ""))[0]
    if guessed:
        return guessed
    if (suffix or "").lower() in {".wav", ".wave"}:
        return "audio/wav"
    return "application/octet-stream"


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


def upload_file(file_storage, folder: str, allowed_extensions: set[str] | None = None) -> str | None:
    """Sube un archivo genérico y devuelve URL pública.

    - Conserva la extensión original si existe.
    - Si `allowed_extensions` se informa, valida por sufijo en minúsculas.
    """
    if not file_storage or not getattr(file_storage, "filename", ""):
        return None

    filename = (file_storage.filename or "").strip()
    suffix = Path(filename).suffix.lower()
    if allowed_extensions is not None:
        allowed = {str(x).lower() for x in (allowed_extensions or set())}
        if suffix not in allowed:
            raise ValueError("Formato de archivo no permitido.")

    key = f"{folder}/{uuid4().hex}{suffix}"
    content_type = _content_type_for_upload(file_storage, suffix)
    _rewind_file_storage(file_storage)
    try:
        return _upload_fileobj(file_storage.stream, key, content_type)
    except StorageObjectTooLargeError:
        # El archivo es demasiado grande: reintentar leyéndolo en memoria no cambiaría
        # el resultado, así que propagamos el error claro directamente.
        raise
    except Exception:
        # Fallback en memoria SOLO para archivos pequeños. Con vídeos grandes, file_storage.read()
        # cargaba el archivo ENTERO en RAM (+ otra copia en el multipart de httpx) -> OOM del worker
        # -> SIGKILL -> 502 (sin JSON). Por encima del tope, propagamos el error real: el endpoint
        # responde un error legible en vez de reventar el proceso.
        size = _stream_size(file_storage.stream)
        if size is None or size > _MEM_FALLBACK_MAX_BYTES:
            raise
        _rewind_file_storage(file_storage)
        data = file_storage.read()
        _rewind_file_storage(file_storage)
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


def upload_pdf_bytes(data: bytes, folder: str) -> str:
    """Sube bytes de un PDF y devuelve URL pública."""
    if data is None:
        raise ValueError("No se indicó contenido PDF.")
    if not isinstance(data, (bytes, bytearray)) or len(data) == 0:
        raise ValueError("El PDF a subir está vacío.")
    key = f"{folder}/{uuid4().hex}.pdf"
    return _upload_bytes(bytes(data), key, "application/pdf")
