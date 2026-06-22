# chartmetric_utils.py
#
# Cliente fino para la API de Chartmetric (métricas musicales). Mismo patrón que supabase_utils.py.
#
# DESACTIVADO POR DEFECTO: si no hay CHARTMETRIC_REFRESH_TOKEN, `chartmetric_configured()` devuelve
# False y nada llama a Chartmetric. La integración no puede afectar al resto de la web.
#
# Acceso (lo gestiona Dani con Chartmetric): la API es un add-on de PAGO. Chartmetric envía por email
# un "refresh token" de larga duración. Con él se piden access tokens de 1 hora (POST /api/token).
#
# Uso recomendado en la app: NO llamar a Chartmetric en cada carga de página (límite de peticiones).
# Resolver y guardar una vez el Chartmetric ID (CMID) de cada artista a partir de su Spotify ID, y
# refrescar las métricas en segundo plano cacheándolas en vuestra BD.
from __future__ import annotations

import threading
import time

import requests

from config import settings

_TIMEOUT = 20

# Caché del access token en memoria del proceso (se renueva al caducar). Con lock por los hilos.
_token_lock = threading.Lock()
_access_token: str | None = None
_access_token_expiry: float = 0.0  # epoch segundos


def chartmetric_configured() -> bool:
    """True solo si hay refresh token. Si es False, la integración está desactivada."""
    return bool(settings.CHARTMETRIC_REFRESH_TOKEN)


def _base() -> str:
    return (settings.CHARTMETRIC_API_BASE or "https://api.chartmetric.com").rstrip("/")


def _get_access_token(force: bool = False) -> str:
    """Devuelve un access token válido, renovándolo si caducó. Cachea ~55 min."""
    global _access_token, _access_token_expiry
    if not chartmetric_configured():
        raise RuntimeError("Integración con Chartmetric no configurada (falta CHARTMETRIC_REFRESH_TOKEN).")
    with _token_lock:
        now = time.time()
        if not force and _access_token and now < _access_token_expiry:
            return _access_token
        try:
            resp = requests.post(
                _base() + "/api/token",
                json={"refreshtoken": settings.CHARTMETRIC_REFRESH_TOKEN},
                headers={"Accept": "application/json"},
                timeout=_TIMEOUT,
            )
        except requests.RequestException as e:
            raise RuntimeError(f"No se pudo conectar con Chartmetric: {e}") from e
        if resp.status_code >= 400:
            raise RuntimeError(f"Chartmetric rechazó el refresh token ({resp.status_code}).")
        data = resp.json()
        token = data.get("token")
        if not token:
            raise RuntimeError("Chartmetric no devolvió access token.")
        # expires_in suele ser 3600s; renovamos un poco antes (margen de 5 min).
        expires_in = int(data.get("expires_in") or 3600)
        _access_token = token
        _access_token_expiry = time.time() + max(60, expires_in - 300)
        return _access_token


def _get(path: str, params: dict | None = None) -> dict:
    """GET autenticado a la API de Chartmetric. Reintenta una vez si el token caducó (401)."""
    if not chartmetric_configured():
        raise RuntimeError("Integración con Chartmetric no configurada (falta CHARTMETRIC_REFRESH_TOKEN).")
    url = _base() + path
    for attempt in (1, 2):
        token = _get_access_token(force=(attempt == 2))
        try:
            resp = requests.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                timeout=_TIMEOUT,
            )
        except requests.RequestException as e:
            raise RuntimeError(f"No se pudo conectar con Chartmetric: {e}") from e
        if resp.status_code == 401 and attempt == 1:
            continue  # token caducado: forzar refresco y reintentar una vez
        if resp.status_code == 429:
            raise RuntimeError("Chartmetric: límite de peticiones excedido (429). Reintenta más tarde.")
        if resp.status_code >= 400:
            raise RuntimeError(f"Chartmetric devolvió un error {resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except ValueError:
            return {}
    raise RuntimeError("Chartmetric: no se pudo autenticar tras reintentar.")


def get_chartmetric_id_from_spotify(spotify_artist_id: str) -> dict:
    """Mapea un Spotify artist ID al Chartmetric ID (y otros IDs vinculados).

    Endpoint: GET /api/artist/spotify/:spotify_id/get-ids
    """
    return _get(f"/api/artist/spotify/{spotify_artist_id}/get-ids")


def get_artist(cmid: int | str) -> dict:
    """Metadata del artista por su Chartmetric ID."""
    return _get(f"/api/artist/{cmid}")


def get_artist_stat(cmid: int | str, source: str, params: dict | None = None) -> dict:
    """Serie temporal de métricas de un artista por plataforma.

    `source` (ej.): spotify, instagram, youtube_channel, tiktok, facebook, soundcloud.
    Ej. de params: {"field": "followers", "since": "2024-01-01"}. CONFIRMAR nombres de params.
    """
    return _get(f"/api/artist/{cmid}/stat/{source}", params=params)


def get_artist_urls(cmid: int | str) -> list:
    """Enlaces a los perfiles del artista por plataforma. Devuelve lista de {domain, url[]}."""
    data = _get(f"/api/artist/{cmid}/urls")
    return data.get("obj", data) if isinstance(data, dict) else data


def get_artist_playlists(cmid: int | str, platform: str = "spotify", status: str = "current", limit: int = 100) -> list:
    """Playlists (actuales o pasadas) en las que está el artista, por plataforma.

    `platform`: spotify | applemusic | amazon. `status`: current | past.
    Cada item trae (bajo 'playlist'): position, peak_position, period (días), added_at, name,
    image_url, owner_name/curator_name, editorial, followers, track/cm_track.
    """
    data = _get(f"/api/artist/{cmid}/{platform}/{status}/playlists", params={"limit": limit})
    return data.get("obj", data) if isinstance(data, dict) else data


def chartmetric_ping() -> tuple[bool, str]:
    """Prueba de conexión para la página de Integraciones. Devuelve (ok, mensaje). No lanza."""
    if not chartmetric_configured():
        return (False, "No configurada (falta CHARTMETRIC_REFRESH_TOKEN).")
    try:
        _get_access_token(force=True)
        return (True, "Conexión correcta (access token obtenido).")
    except RuntimeError as e:
        return (False, str(e))
