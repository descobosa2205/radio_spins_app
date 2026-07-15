# enterticket_utils.py
#
# Cliente fino para la API de Enterticket (ticketera del grupo). Mismo patrón que
# chartmetric_utils.py: DESACTIVADO POR DEFECTO (sin ENTERTICKET_USER/PASSWORD no se llama nunca)
# y sin efectos sobre el resto de la web.
#
# Autenticación (documentada en https://api.enterticket.es/doc, protegida con las mismas
# credenciales): GET /auth?user=..&password=.. → {token, expire_date}. ⚠️ Los parámetros van en
# QUERY STRING (el POST con form-data devuelve 400) y SOLO puede haber UN token activo a la vez:
# pedir uno nuevo invalida el anterior. Por eso el token NO se cachea aquí (en memoria de un
# worker) sino en BD (tabla enterticket_meta, la gestiona app.py) para que todos los workers
# compartan el mismo; este módulo solo hace las llamadas HTTP.
#
# Endpoints usados (todos probados en vivo el 15-jul-2026 con el evento 52812):
#   /eventos            catálogo de eventos del cliente (nombre, fecha, recinto, urls, imágenes)
#   /eventos/:id        detalle con mostrar_ventas_y_accesos=1 → tipos de entrada con
#                       cantidad_disponible / cantidad_vendidas / precio / entrada_numerada
#   /eventos/:id/artistas  artistas del evento (para el matching con nuestros conciertos)
#   /ventas/:id         cada entrada vendida (comprador, importe, modo, invitación, sector/asiento,
#                       anulada/devuelta, updated_at). DEFAULT limite=5 → SIEMPRE paginar.
#                       Incremental: desde_id (id > X) y updated (updated_at > X, unix).
#   /bloqueos/:id       asientos bloqueados del evento.
from __future__ import annotations

import time

import requests

from config import settings

_TIMEOUT = 25


class EnterticketError(RuntimeError):
    """Error de la API de Enterticket (red, HTTP o {'error': true})."""


class EnterticketAuthError(EnterticketError):
    """El token no es válido / caducó (otro proceso pudo renovar el token único)."""


def enterticket_configured() -> bool:
    """True solo si hay credenciales. Si es False, la integración está desactivada."""
    return bool(settings.ENTERTICKET_USER and settings.ENTERTICKET_PASSWORD)


def _base() -> str:
    return (settings.ENTERTICKET_API_BASE or "https://api.enterticket.es").rstrip("/")


def auth() -> tuple[str, str]:
    """Pide un token nuevo. Devuelve (token, expire_date). ⚠️ Invalida el token anterior."""
    if not enterticket_configured():
        raise EnterticketError("Integración con Enterticket no configurada (faltan ENTERTICKET_USER/ENTERTICKET_PASSWORD).")
    try:
        resp = requests.get(
            _base() + "/auth",
            params={"user": settings.ENTERTICKET_USER, "password": settings.ENTERTICKET_PASSWORD},
            headers={"Accept": "application/json"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as e:
        raise EnterticketError(f"No se pudo conectar con Enterticket: {e}") from e
    if resp.status_code >= 400:
        raise EnterticketError(f"Enterticket rechazó las credenciales ({resp.status_code}).")
    data = resp.json()
    token = data.get("token")
    if not token:
        raise EnterticketError("Enterticket no devolvió token.")
    return token, (data.get("expire_date") or "")


def api_get(path: str, token: str, params: dict | None = None):
    """GET autenticado. Lanza EnterticketAuthError si el token ya no vale (401/403 de token)."""
    q = dict(params or {})
    q["token"] = token
    try:
        resp = requests.get(_base() + path, params=q, headers={"Accept": "application/json"}, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise EnterticketError(f"No se pudo conectar con Enterticket: {e}") from e
    if resp.status_code == 401:
        raise EnterticketAuthError("Token de Enterticket caducado o inválido.")
    try:
        data = resp.json()
    except ValueError as e:
        raise EnterticketError(f"Respuesta no válida de Enterticket ({resp.status_code}).") from e
    if isinstance(data, dict) and data.get("error"):
        desc = str(data.get("descripcion") or data.get("message") or data.get("error") or "")
        low = desc.lower()
        if resp.status_code == 403 and ("token" in low or "autenticaci" in low or "permisos" in low):
            raise EnterticketAuthError(desc or "Error de autenticación en Enterticket.")
        raise EnterticketError(desc or f"Error de Enterticket ({resp.status_code}).")
    if resp.status_code >= 400:
        raise EnterticketError(f"Error HTTP {resp.status_code} de Enterticket.")
    return data


def fetch_me(token: str) -> dict:
    return api_get("/me", token)


def fetch_events(token: str, limite: int = 100, offset: int = 0, desde: int | None = None,
                 light: bool = True) -> list:
    """Lista de eventos del cliente. `light=True` omite entradas/sesiones/complementos (catálogo)."""
    params = {"limite": limite, "offset": offset}
    if desde:
        params["desde"] = int(desde)
    if light:
        params.update({"omitir_entradas": 1, "omitir_sesiones": 1, "omitir_complementos": 1})
    data = api_get("/eventos", token, params)
    return data if isinstance(data, list) else []


def fetch_event(token: str, event_id: int) -> dict | None:
    """Detalle de un evento CON ventas por tipo (cantidad_disponible/cantidad_vendidas)."""
    data = api_get(f"/eventos/{int(event_id)}", token, {"mostrar_ventas_y_accesos": 1})
    if isinstance(data, list):
        return data[0] if data else None
    return data or None


def fetch_event_artists(token: str, event_id: int) -> list:
    data = api_get(f"/eventos/{int(event_id)}/artistas", token)
    return data if isinstance(data, list) else []


def fetch_sales(token: str, event_id: int, limite: int = 500, offset: int = 0,
                desde_id: int | None = None, updated: int | None = None) -> list:
    """Entradas vendidas (paginadas). `desde_id` = solo id > X; `updated` = updated_at > X (unix).
    ⚠️ mostrar_cambios_de_codigos=0: con el DEFAULT (1) la API repite la MISMA entrada una vez por
    cada código regenerado (las repeticiones con anulada=1) y el upsert por id podría marcar como
    anulada una entrada válida renominada."""
    params: dict = {"limite": limite, "offset": offset, "mostrar_devueltas": 1,
                    "mostrar_cambios_de_codigos": 0}
    if desde_id:
        params["desde_id"] = int(desde_id)
    if updated:
        params["updated"] = int(updated)
    data = api_get(f"/ventas/{int(event_id)}", token, params)
    if isinstance(data, dict):
        return data.get("entradas") or []
    return data if isinstance(data, list) else []


def fetch_bloqueos(token: str, event_id: int, limite: int = 500) -> list:
    data = api_get(f"/bloqueos/{int(event_id)}", token, {"limite": limite})
    return data if isinstance(data, list) else []


def ping() -> tuple[bool, str, str | None, str | None]:
    """Prueba de conexión: autentica y pide /me. ⚠️ Renueva el token único (guardarlo después).
    Devuelve (ok, mensaje, token, expire_date) para que app.py persista el token nuevo."""
    if not enterticket_configured():
        return False, "No configurada (faltan ENTERTICKET_USER/ENTERTICKET_PASSWORD).", None, None
    t0 = time.time()
    try:
        token, expire = auth()
        me = fetch_me(token)
        ms = int((time.time() - t0) * 1000)
        who = me.get("nombre_usuario") or me.get("nombre") or "?"
        return True, f"Conexión correcta ({ms} ms) · usuario {who} · token válido hasta {expire}.", token, expire
    except EnterticketError as e:
        return False, str(e), None, None
