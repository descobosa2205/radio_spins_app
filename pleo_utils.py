# pleo_utils.py
#
# Cliente fino para la API de Pleo (gastos). Mismo patrón que supabase_utils.py.
#
# DESACTIVADO POR DEFECTO: si no hay PLEO_API_KEY configurada, `pleo_configured()` devuelve False y
# ninguna función llama a Pleo. Así la integración no puede afectar al resto de la web.
#
# Acceso (lo gestiona Dani con Pleo): la API NO es self-serve. Para uso interno de una sola empresa
# hay que pedir a Pleo que habilite una "Standalone API Key" (auth HTTP Basic: la key como usuario y
# contraseña vacía). La API de gastos nueva ("Accounting Entries") salía a mediados de 2026: conviene
# confirmar que ya está disponible para vuestra cuenta.
#
# ⚠️ Endpoints/campos marcados con "CONFIRMAR" deben validarse contra la API real cuando haya
# credenciales (la doc estaba en migración). Nada de esto se ejecuta hasta que se configure la key.
from __future__ import annotations

import requests

from config import settings

# Timeout por defecto de las llamadas (segundos). Conservador para no colgar peticiones web.
_TIMEOUT = 20


def pleo_configured() -> bool:
    """True solo si hay credencial de Pleo. Si es False, la integración está desactivada."""
    return bool(settings.PLEO_API_KEY)


def _base() -> str:
    return (settings.PLEO_API_BASE or "https://external.pleo.io").rstrip("/")


def _auth():
    # Standalone API Key = HTTP Basic con la key como usuario y password vacío.
    return (settings.PLEO_API_KEY or "", "")


def _request(method: str, path: str, *, params: dict | None = None, json: dict | None = None) -> dict:
    """Llamada genérica a la API de Pleo. Lanza RuntimeError con mensaje claro si algo falla."""
    if not pleo_configured():
        raise RuntimeError("Integración con Pleo no configurada (falta PLEO_API_KEY).")
    url = _base() + path
    try:
        resp = requests.request(
            method,
            url,
            params=params,
            json=json,
            auth=_auth(),
            headers={"Accept": "application/json"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as e:
        raise RuntimeError(f"No se pudo conectar con Pleo: {e}") from e
    if resp.status_code == 401:
        raise RuntimeError("Pleo rechazó la credencial (401). Revisa PLEO_API_KEY.")
    if resp.status_code >= 400:
        raise RuntimeError(f"Pleo devolvió un error {resp.status_code}: {resp.text[:300]}")
    try:
        return resp.json()
    except ValueError:
        return {}


def search_accounting_entries(
    *,
    company_id: str | None = None,
    organization_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    after: str | None = None,
) -> dict:
    """Busca gastos/transacciones (accounting entries).

    Hay que indicar `company_id` u `organization_id`. Fechas en ISO (YYYY-MM-DD).
    Devuelve el JSON de Pleo (lista + cursores de paginación).

    CONFIRMAR contra la API real: ruta exacta y nombres de los filtros de fecha.
    """
    body: dict = {"limit": max(1, min(int(limit or 100), 100))}
    if company_id:
        body["company_id"] = company_id
    if organization_id:
        body["organization_id"] = organization_id
    if date_from:
        body["bookkeepingDateStart"] = date_from
    if date_to:
        body["bookkeepingDateEnd"] = date_to
    if after:
        body["after"] = after
    return _request("POST", "/v1/accounting-entries:search", json=body)


def get_accounting_entry(entry_id: str) -> dict:
    """Devuelve un gasto concreto por su ID."""
    return _request("GET", f"/v1/accounting-entries/{entry_id}")


def get_receipts(entry_id: str) -> dict:
    """Lista los recibos/justificantes de un gasto.

    Nota: las URLs de descarga del fichero son prefirmadas y caducan en ~24 h: hay que descargar y
    guardar el archivo en el momento (p. ej. en vuestro Supabase Storage), no almacenar la URL.
    CONFIRMAR contra la API real.
    """
    return _request("GET", f"/v1/accounting-entries/{entry_id}/receipts")


def pleo_ping() -> tuple[bool, str]:
    """Prueba de conexión para la página de Integraciones.

    Devuelve (ok, mensaje). No lanza: captura cualquier problema y lo informa.
    Como la API de Pleo necesita un company/organization id para casi todo, aquí solo comprobamos que
    la credencial está puesta y que el host responde a la autenticación (sin asumir un endpoint
    concreto). CONFIRMAR el endpoint de salud/identidad cuando haya credenciales.
    """
    if not pleo_configured():
        return (False, "No configurada (falta PLEO_API_KEY).")
    try:
        # Petición mínima: si la key es válida el host no devuelve 401. Un 404 también indica que la
        # autenticación pasó (endpoint distinto), así que lo tratamos como "conecta".
        resp = requests.get(
            _base() + "/v1/companies",
            auth=_auth(),
            headers={"Accept": "application/json"},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 401:
            return (False, "Credencial rechazada por Pleo (401).")
        return (True, f"Conexión correcta (HTTP {resp.status_code}).")
    except requests.RequestException as e:
        return (False, f"No se pudo conectar con Pleo: {e}")
