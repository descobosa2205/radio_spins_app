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


# EL REFRESH TOKEN se puede guardar desde la app (Integraciones → Chartmetric) además de venir por
# entorno: si caduca o lo rotan, hay que poder cambiarlo sin tocar Render. `app.py` enchufa aquí un
# proveedor que lo lee de la BD; lo del entorno queda como respaldo.
_TOKEN_PROVIDER = None


def set_token_provider(fn) -> None:
    """Enchufa de dónde sale el refresh token (lo llama `app.py` al arrancar)."""
    global _TOKEN_PROVIDER
    _TOKEN_PROVIDER = fn


def clean_api_key(raw) -> str:
    """Limpia lo que se pega en el formulario: espacios, saltos de línea, comillas y el típico
    «refreshtoken:» delante. Mismo problema que dio la clave de Holded."""
    txt = str(raw or "").strip()
    for prefijo in ("refreshtoken:", "refresh_token:", "token:", "Bearer "):
        if txt.lower().startswith(prefijo.lower()):
            txt = txt[len(prefijo):]
    return txt.strip().strip('"').strip("'").strip()


def refresh_token_value() -> str:
    """El refresh token en vigor: el guardado en la app y, si no hay, el del entorno."""
    if _TOKEN_PROVIDER:
        try:
            guardado = clean_api_key(_TOKEN_PROVIDER())
            if guardado:
                return guardado
        except Exception:
            pass
    return clean_api_key(settings.CHARTMETRIC_REFRESH_TOKEN)


def reset_access_token() -> None:
    """Tira el access token cacheado. Hay que llamarlo al CAMBIAR el refresh token: si no, el
    proceso seguiría usando el token viejo hasta que caducase y «probar conexión» mentiría."""
    global _access_token, _access_token_expiry
    with _token_lock:
        _access_token, _access_token_expiry = None, 0.0


def chartmetric_configured() -> bool:
    """True solo si hay refresh token. Si es False, la integración está desactivada."""
    return bool(refresh_token_value())


def _base() -> str:
    return (settings.CHARTMETRIC_API_BASE or "https://api.chartmetric.com").rstrip("/")


def _get_access_token(force: bool = False) -> str:
    """Devuelve un access token válido, renovándolo si caducó. Cachea ~55 min."""
    global _access_token, _access_token_expiry
    refresco = refresh_token_value()
    if not refresco:
        raise RuntimeError("Chartmetric no está configurada: falta el refresh token.")
    with _token_lock:
        now = time.time()
        if not force and _access_token and now < _access_token_expiry:
            return _access_token
        try:
            resp = requests.post(
                _base() + "/api/token",
                json={"refreshtoken": refresco},
                headers={"Accept": "application/json"},
                timeout=_TIMEOUT,
            )
        except requests.RequestException as e:
            raise RuntimeError(f"No se pudo conectar con Chartmetric: {e}") from e
        if resp.status_code >= 400:
            # El motivo exacto ayuda a distinguir «token caducado» de «token mal pegado».
            detalle = (resp.text or "").strip()[:200]
            raise RuntimeError(
                f"Chartmetric rechazó el refresh token ({resp.status_code})."
                + (f" Dice: {detalle}" if detalle else "")
                + " Genera uno nuevo en Chartmetric (Developer API) y pégalo aquí.")
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
        raise RuntimeError("Chartmetric no está configurada: falta el refresh token "
                           "(se mete en Integraciones → Chartmetric).")
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
        if resp.status_code == 402:
            raise RuntimeError("Chartmetric: SIN CRÉDITOS de API. Recarga el plan para volver a actualizar.")
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


def get_artist_tracks(cmid: int | str, limit: int = 200) -> list:
    """Tracks del artista. Cada item trae cm_track, isrc, name, spotify/itunes/amazon track ids...
    Sirve para mapear las playlists (que solo traen cm_track) a nombre + ISRC."""
    data = _get(f"/api/artist/{cmid}/tracks", params={"limit": limit})
    return data.get("obj", data) if isinstance(data, dict) else data


def get_track(cm_track: int | str) -> dict:
    """Metadata de un track por su Chartmetric ID (cm_track): name, isrc, image_url/portada, album…
    Sirve de PUENTE fiable cuando una playlist (p. ej. de Amazon/Apple) trae el track sin nombre ni
    ISRC: con el cm_track se piden aquí sus datos y así se puede nombrar y casar la canción.
    Endpoint: GET /api/track/:id  → {obj: {...}}. Devuelve {} ante cualquier problema (no lanza)."""
    if not str(cm_track or "").strip():
        return {}
    try:
        data = _get(f"/api/track/{cm_track}")
    except RuntimeError:
        return {}
    obj = data.get("obj", data) if isinstance(data, dict) else data
    return obj if isinstance(obj, dict) else {}


def norm_isrc(value) -> str:
    """El ISRC tal y como lo espera la API: solo alfanumérico y en MAYÚSCULAS.

    ⚠️ Nosotros lo guardamos con guiones (ES-A2A-25-00001) porque así se lee mejor, pero Chartmetric
    busca por el código SEGUIDO: mandándoselo con guiones no encuentra nada."""
    return "".join(ch for ch in str(value or "") if ch.isalnum()).upper()


def norm_code(value) -> str:
    """UPC/EAN de un álbum: solo dígitos (igual que el ISRC, los separadores no viajan)."""
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def get_track_ids_from_isrc(isrc: str, raise_on_error: bool = False) -> dict:
    """Resuelve el cm_track (y otros ids) de una canción a partir de su ISRC.
    Endpoint: GET /api/track/isrc/{isrc}/get-ids  → {obj: {...}}.
    Devuelve {} ante cualquier problema (no lanza).

    ⚠️ Con `raise_on_error` SÍ lanza el motivo (sin créditos, 429, red caída…). Sin eso, «no hay
    datos» y «la API ha fallado» son la misma cosa, y en pantalla se acaba diciendo «revisa el ISRC»
    cuando el ISRC está perfecto."""
    code = norm_isrc(isrc)
    if not code:
        return {}
    try:
        data = _get(f"/api/track/isrc/{code}/get-ids")
    except RuntimeError:
        if raise_on_error:
            raise
        return {}
    obj = data.get("obj", data) if isinstance(data, dict) else data
    return obj if isinstance(obj, dict) else {}


def get_album(cm_album: int | str) -> dict:
    """Metadata de un ÁLBUM por su id de Chartmetric. Endpoint: GET /api/album/:id → {obj: {...}}.
    Devuelve {} ante cualquier problema (no lanza)."""
    if not str(cm_album or "").strip():
        return {}
    try:
        data = _get(f"/api/album/{cm_album}")
    except RuntimeError:
        return {}
    obj = data.get("obj", data) if isinstance(data, dict) else data
    if isinstance(obj, list):
        obj = obj[0] if obj else {}
    return obj if isinstance(obj, dict) else {}


def get_album_ids_from_upc(upc: str) -> dict:
    """Ids de un álbum a partir de su UPC/EAN (el equivalente del ISRC en un disco).
    Endpoint: GET /api/album/upc/{upc}/get-ids. Devuelve {} ante cualquier problema (no lanza)."""
    code = norm_code(upc)
    if not code:
        return {}
    try:
        data = _get(f"/api/album/upc/{code}/get-ids")
    except RuntimeError:
        return {}
    obj = data.get("obj", data) if isinstance(data, dict) else data
    if isinstance(obj, list):
        obj = obj[0] if obj else {}
    return obj if isinstance(obj, dict) else {}


def _search(query: str, kind: str, limit: int = 10) -> list:
    """Búsqueda genérica en Chartmetric (`/api/search`), tolerante con la forma de la respuesta:
    unas veces viene {obj: {tracks: [...]}} y otras directamente la lista."""
    q = (query or "").strip()
    if not q:
        return []
    try:
        data = _get("/api/search", {"q": q, "type": kind, "limit": limit})
    except RuntimeError:
        return []
    payload = data.get("obj", data) if isinstance(data, dict) else data
    if isinstance(payload, dict):
        for clave in (kind, kind.rstrip("s"), "results"):
            val = payload.get(clave)
            if isinstance(val, list):
                return val
        # Última red: la primera lista de dicts que traiga.
        for val in payload.values():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                return val
        return []
    return payload if isinstance(payload, list) else []


def search_tracks(query: str, limit: int = 10) -> list:
    """Busca CANCIONES por nombre. Cada item trae (según catálogo) id/cm_track, name, isrc, artists…"""
    return _search(query, "tracks", limit=limit)


def search_albums(query: str, limit: int = 10) -> list:
    """Busca ÁLBUMES por nombre."""
    return _search(query, "albums", limit=limit)


# ⚠️⚠️ LA RUTA DE LAS REPRODUCCIONES DE UN TRACK LLEVA UN «MODO» AL FINAL. La de verdad es
#   GET /api/track/{id}/{plataforma}/stats/{modo}
# y el modo es OBLIGATORIO (`highest-playcounts` o `most-history`). Sin él, Chartmetric contesta
# «Cannot GET /api/track/123/spotify/stats» —un 404 de Express, o sea que esa ruta NO EXISTE—, `_get`
# levantaba RuntimeError y la canción se quedaba VINCULADA PERO SIN REPRODUCCIONES (bug real, ago
# 2026). Confirmado en la referencia oficial:
#   https://apidocs.chartmetric.com/reference/tag/track/get/api/track/id/platform/stats/mode
# Una canción puede existir como VARIOS tracks en la misma plataforma (el single y el del álbum):
# `highest-playcounts` coge el que más se ha escuchado —que es el que representa a la canción— y
# `most-history` el de serie más larga. Se prueba en ese orden y se RECUERDA el que responde (mismo
# patrón que la URL base de Cabify y la ruta de adjuntar de Holded).
TRACK_STAT_MODES = ("highest-playcounts", "most-history")
TRACK_STAT_PATHS = tuple(
    "/api/track/{id}/{source}/stats/" + modo for modo in TRACK_STAT_MODES
) + (
    # Respaldo por si algún día vuelve la forma sin modo. NO se pone delante: hoy da 404.
    "/api/track/{id}/{source}/stats",
)
_TRACK_STAT_PATH_OK: str | None = None

# Los IDs de plataforma NO vienen en el metadato del track (comprobado en la referencia: `/api/track/
# {id}` devuelve nombre, ISRC, portada, artistas, álbumes y `cm_statistics`, y ningún id de Spotify,
# Apple, Amazon ni YouTube). Están en su PROPIO endpoint:
#   GET /api/track/{tipo}/{id}/get-ids   (tipo: chartmetric | isrc | spotify | itunes | …)
# que devuelve `spotify_ids`, `itunes_ids`, `amazon_ids`, `youtube_ids`, `deezer_ids`… cada uno una
# LISTA (o null). Por eso «Actualizar» decía «Chartmetric no ha devuelto ningún enlace de plataforma»
# por muy bien vinculada que estuviera la canción (bug real, ago 2026).
GET_IDS_PATHS = {
    "track": "/api/track/{tipo}/{id}/get-ids",
    "album": "/api/album/{tipo}/{id}/get-ids",
    "artist": "/api/artist/{tipo}/{id}/get-ids",
}


def get_platform_ids(kind: str, cm_id: int | str, *, tipo: str = "chartmetric",
                     raise_on_error: bool = False) -> dict:
    """Los IDs de una obra en las demás plataformas. Punto ÚNICO de `…/get-ids`.

    `kind`: track | album | artist. `tipo`: con qué id se pregunta (por defecto el de Chartmetric).
    Devuelve el objeto tal cual (`spotify_ids`, `itunes_ids`, …) o {} si no se puede."""
    plantilla = GET_IDS_PATHS.get((kind or "").strip().lower())
    if not plantilla or not str(cm_id or "").strip():
        return {}
    try:
        data = _get(plantilla.format(tipo=(tipo or "chartmetric"), id=cm_id))
    except RuntimeError:
        if raise_on_error:
            raise
        return {}
    obj = data.get("obj", data) if isinstance(data, dict) else data
    if isinstance(obj, list):
        obj = obj[0] if obj and isinstance(obj[0], dict) else {}
    return obj if isinstance(obj, dict) else {}


def get_track_platform_ids(cm_track: int | str, raise_on_error: bool = False) -> dict:
    """Los ids de plataforma de un TRACK por su id de Chartmetric."""
    return get_platform_ids("track", cm_track, raise_on_error=raise_on_error)


def get_album_platform_ids(cm_album: int | str, raise_on_error: bool = False) -> dict:
    """Los ids de plataforma de un ÁLBUM por su id de Chartmetric."""
    return get_platform_ids("album", cm_album, raise_on_error=raise_on_error)


def get_track_stat(cm_track: int | str, platform: str, params: dict | None = None,
                   raise_on_error: bool = False) -> dict:
    """Serie temporal de una métrica de un TRACK por plataforma (reproducciones/vistas).
    `platform` (ej.): spotify (streams), youtube (views). Ej. params: {"since": "2024-01-01"}.

    Best-effort: {} ante cualquier problema. Con `raise_on_error` se propaga el motivo real
    (sin créditos, 429, red…), que es lo que hay que enseñar cuando alguien pulsa «Actualizar»:
    si no, un fallo de la API es indistinguible de «esta canción no tiene datos»."""
    global _TRACK_STAT_PATH_OK
    if not str(cm_track or "").strip():
        return {}
    candidatas = ([_TRACK_STAT_PATH_OK] if _TRACK_STAT_PATH_OK else []) + \
                 [p for p in TRACK_STAT_PATHS if p != _TRACK_STAT_PATH_OK]
    ultimo_error = None
    for plantilla in candidatas:
        try:
            data = _get(plantilla.format(id=cm_track, source=platform), params=params)
        except RuntimeError as e:
            ultimo_error = e
            texto = str(e)
            # Un 404/400 solo dice que ESA ruta no es; sin créditos o rate limit sí es definitivo y
            # no tiene sentido seguir gastando llamadas probando las demás.
            if ("SIN CRÉDITOS" in texto) or ("429" in texto) or ("conectar" in texto):
                break
            continue
        _TRACK_STAT_PATH_OK = plantilla
        return data
    if raise_on_error and ultimo_error is not None:
        raise ultimo_error
    return {}


def search_artists(query: str, limit: int = 10) -> list:
    """Busca artistas por nombre. Devuelve lista de dicts {id (CMID), name, image_url,
    sp_monthly_listeners, cm_artist_score, verified...}. [] si no hay query o resultados."""
    if not (query or "").strip():
        return []
    data = _get("/api/search", {"q": query, "type": "artists", "limit": limit})
    payload = data.get("obj", data) if isinstance(data, dict) else data
    if isinstance(payload, dict):
        arts = payload.get("artists")
        return arts if isinstance(arts, list) else []
    return payload if isinstance(payload, list) else []


def diagnose_track(cm_track: int | str) -> list[dict]:
    """PRUEBA UNA A UNA las rutas de un track y devuelve QUÉ HA CONTESTADO cada una.

    Es el mismo patrón que el diagnóstico de Holded: cuando algo no llega, lo primero es saber si la
    ruta existe, si falta un permiso o si la cuenta no tiene créditos — y eso solo lo dice la propia
    API. Cada fila: {ruta, ok, detalle}. No lanza nunca.
    """
    if not str(cm_track or "").strip():
        return []
    intentos = [("metadatos del track", "/api/track/%s" % cm_track, None),
                ("ids de plataforma", GET_IDS_PATHS["track"].format(tipo="chartmetric", id=cm_track), None)]
    for plantilla in TRACK_STAT_PATHS:
        intentos.append(("reproducciones (spotify)",
                         plantilla.format(id=cm_track, source="spotify"), {"type": "streams"}))
    salida = []
    for para, ruta, params in intentos:
        fila = {"para": para, "ruta": ruta, "ok": False, "detalle": ""}
        try:
            data = _get(ruta, params=params)
        except RuntimeError as e:
            fila["detalle"] = str(e)[:300]
        else:
            obj = data.get("obj", data) if isinstance(data, dict) else data
            if isinstance(obj, dict):
                claves = [k for k in obj.keys()][:12]
                fila["detalle"] = "responde · claves: " + ", ".join(map(str, claves))
            elif isinstance(obj, list):
                fila["detalle"] = "responde · %d elemento%s" % (len(obj), "" if len(obj) == 1 else "s")
                if obj and isinstance(obj[0], dict):
                    fila["detalle"] += " · claves: " + ", ".join(map(str, list(obj[0].keys())[:8]))
            else:
                fila["detalle"] = "responde (sin contenido reconocible)"
            fila["ok"] = True
        salida.append(fila)
    return salida


def chartmetric_ping() -> tuple[bool, str]:
    """Prueba de conexión para la página de Integraciones. Devuelve (ok, mensaje). No lanza.

    No se queda en «he sacado un token»: hace además una LLAMADA REAL de solo lectura, que es lo
    que de verdad dice si la cuenta funciona (un token válido sin créditos saca token y luego falla
    en todo)."""
    if not chartmetric_configured():
        return (False, "No configurada: falta el refresh token.")
    try:
        _get_access_token(force=True)
    except RuntimeError as e:
        return (False, str(e))
    try:
        _get("/api/search", {"q": "test", "type": "artists", "limit": 1})
        return (True, "Conexión correcta: el token vale y la API responde.")
    except RuntimeError as e:
        texto = str(e)
        if "SIN CRÉDITOS" in texto or "402" in texto:
            return (False, "El token vale, pero la cuenta está SIN CRÉDITOS de API.")
        if "429" in texto:
            return (False, "El token vale, pero Chartmetric está limitando las peticiones (429). Reintenta en un rato.")
        return (False, "El token vale, pero la API no responde bien: " + texto)
