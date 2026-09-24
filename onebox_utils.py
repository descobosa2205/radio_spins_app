# onebox_utils.py
#
# Cliente fino para la API de ONE BOX (ticketera). Mismo patrón que enterticket_utils.py:
# DESACTIVADO POR DEFECTO (sin credenciales no se llama nunca) y sin efectos sobre el resto de la
# web. La sincronización (qué se guarda y cómo) la hace app.py, sobre el MISMO espejo que
# Enterticket: aquí solo van las llamadas HTTP.
#
# Documentación pública: https://developer.oneboxtds.com (especificaciones OpenAPI en
# onebox-api-docs.s3-eu-west-1.amazonaws.com/<api>/master/v1/public/openapi.yml).
#
# Autenticación (OAuth2, POST <base>/oauth/token, form-urlencoded): su esquema admite
#   · client_credentials → client_id (por defecto «onebox-client») + client_secret = la API KEY;
#   · password           → username + password de un usuario de su plataforma.
# El token dura 12 h (`expires_in`). A diferencia de Enterticket, pedir otro NO invalida el
# anterior, pero se comparte igual en BD (fila 2 de enterticket_meta) para no pedir uno por worker.
#
# Endpoints usados (⚠️ sin probar contra la API real: la primera conexión confirma los nombres):
#   mgmt-api/v1/events                          catálogo de eventos (nombre, fechas, recinto)
#   mgmt-api/v1/events/:id/sessions             sesiones (cada una es una FECHA: una actividad)
#   mgmt-api/v1/events/:id/sessions/:s/capacity butacas y zonas no numeradas con su estado y su
#                                               tipo de precio → vendidas / libres / bloqueadas
#   mgmt-api/v1/events/:id/venue-templates/:t/prices   precio de cada tipo de precio
#   orders-mgmt-api/v1/order-items              cada entrada (comprador, importe, estado,
#                                               sector/fila/butaca). Incremental: last_modified.
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import requests

from config import settings

_TIMEOUT = 25
PAGE = 500          # el máximo que admite /order-items


class OneboxError(RuntimeError):
    """Error de la API de One Box (red, HTTP o respuesta rara)."""


class OneboxAuthError(OneboxError):
    """El token no es válido o ha caducado."""


def onebox_configured() -> bool:
    """True solo si hay credenciales (API key, o usuario y contraseña)."""
    return bool(settings.ONEBOX_API_KEY or (settings.ONEBOX_USER and settings.ONEBOX_PASSWORD))


def _base() -> str:
    return (settings.ONEBOX_API_BASE or "https://api.oneboxtds.com").rstrip("/")


def auth() -> tuple[str, str]:
    """Pide un token. Devuelve (token, caduca_en ISO UTC)."""
    if not onebox_configured():
        raise OneboxError("Integración con One Box no configurada (falta ONEBOX_API_KEY, "
                          "o ONEBOX_USER y ONEBOX_PASSWORD).")
    if settings.ONEBOX_API_KEY:
        data = {"grant_type": "client_credentials",
                "client_id": settings.ONEBOX_CLIENT_ID or "onebox-client",
                "client_secret": settings.ONEBOX_API_KEY}
    else:
        data = {"grant_type": "password",
                "client_id": settings.ONEBOX_CLIENT_ID or "onebox-client",
                "username": settings.ONEBOX_USER, "password": settings.ONEBOX_PASSWORD}
    try:
        resp = requests.post(_base() + "/oauth/token", data=data,
                             headers={"Accept": "application/json"}, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise OneboxError(f"No se pudo conectar con One Box: {e}") from e
    if resp.status_code >= 400:
        # Lo que diga One Box, tal cual: es lo que hace falta para saber qué falla.
        detalle = ""
        try:
            j = resp.json()
            detalle = str(j.get("error_description") or j.get("message") or j.get("error") or "")
        except ValueError:
            detalle = (resp.text or "")[:200]
        raise OneboxError(f"One Box rechazó las credenciales ({resp.status_code})"
                          + (f": {detalle}" if detalle else "."))
    j = resp.json()
    token = j.get("access_token")
    if not token:
        raise OneboxError("One Box no devolvió token.")
    try:
        segundos = int(j.get("expires_in") or 43200)
    except (TypeError, ValueError):
        segundos = 43200
    caduca = (datetime.now(timezone.utc) + timedelta(seconds=max(60, segundos - 120))).isoformat()
    return token, caduca


def api_get(path: str, token: str, params: dict | None = None, api: str = "mgmt"):
    """GET autenticado contra `mgmt-api/v1` o `orders-mgmt-api/v1`."""
    prefijo = "/orders-mgmt-api/v1" if api == "orders" else "/mgmt-api/v1"
    try:
        resp = requests.get(_base() + prefijo + path, params=params or {},
                            headers={"Accept": "application/json",
                                     "Authorization": f"Bearer {token}"},
                            timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise OneboxError(f"No se pudo conectar con One Box: {e}") from e
    if resp.status_code == 401:
        raise OneboxAuthError("Token de One Box caducado o inválido.")
    if resp.status_code == 403:
        raise OneboxError("One Box no deja ver esto con estas credenciales (403): pide que el "
                          "usuario tenga acceso a eventos y pedidos de la entidad.")
    if resp.status_code >= 400:
        raise OneboxError(f"Error HTTP {resp.status_code} de One Box en {path}.")
    try:
        return resp.json()
    except ValueError as e:
        raise OneboxError(f"Respuesta no válida de One Box ({resp.status_code}).") from e


def _data(payload) -> list:
    """Las listas de One Box vienen como {data: [...], metadata: {...}}."""
    if isinstance(payload, dict):
        d = payload.get("data")
        return d if isinstance(d, list) else []
    return payload if isinstance(payload, list) else []


def fetch_events(token: str, limit: int = 100, offset: int = 0) -> list:
    return _data(api_get("/events", token, {"limit": limit, "offset": offset,
                                            "include_archived": "false"}))


def fetch_sessions(token: str, event_id: int, limit: int = 100, offset: int = 0) -> list:
    return _data(api_get(f"/events/{int(event_id)}/sessions", token,
                         {"limit": limit, "offset": offset}))


def fetch_capacity(token: str, event_id: int, session_id: int) -> dict:
    data = api_get(f"/events/{int(event_id)}/sessions/{int(session_id)}/capacity", token)
    return data if isinstance(data, dict) else {}


def fetch_prices(token: str, event_id: int, template_id: int) -> list:
    data = api_get(f"/events/{int(event_id)}/venue-templates/{int(template_id)}/prices", token)
    return data if isinstance(data, list) else _data(data)


def fetch_order_items(token: str, session_id: int, limit: int = PAGE, offset: int = 0,
                      modified_since: str | None = None) -> list:
    """Las entradas de UNA sesión, en su estado ACTUAL (search_mode NET: una devuelta sale como
    REFUND). `modified_since` (ISO) = solo las de pedidos tocados desde entonces."""
    params = {"session_id": int(session_id), "type": "SEAT", "search_mode": "NET",
              "limit": limit, "offset": offset, "sort": "purchase_date:asc"}
    if modified_since:
        params["last_modified"] = "gte:" + modified_since
    return _data(api_get("/order-items", token, params, api="orders"))


def ping() -> tuple[bool, str, str | None, str | None]:
    """Prueba de conexión: token + el primer evento. Devuelve (ok, mensaje, token, caduca)."""
    if not onebox_configured():
        return False, "No configurada (falta ONEBOX_API_KEY, o ONEBOX_USER y ONEBOX_PASSWORD).", None, None
    t0 = time.time()
    try:
        token, caduca = auth()
        eventos = fetch_events(token, limit=1)
        ms = int((time.time() - t0) * 1000)
        modo = "API key" if settings.ONEBOX_API_KEY else "usuario y contraseña"
        return (True, f"Conexión correcta ({ms} ms) · entra con {modo} · "
                      f"{'ve eventos' if eventos else 'todavía no ve ningún evento'}.", token, caduca)
    except OneboxError as e:
        return False, str(e), None, None
