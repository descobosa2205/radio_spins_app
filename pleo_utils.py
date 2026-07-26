# pleo_utils.py
#
# Cliente de la API de Pleo (gastos). Mismo patrón que supabase_utils.py / enterticket_utils.py:
# módulo aislado, sin acceso a BD y sin Flask, para que un fallo de la integración no toque el resto.
#
# CÓMO SE AUTENTICA
#   Pleo usa una "Standalone API Key" (formato `pls_…`) con **HTTP Basic**: la key como usuario y la
#   contraseña VACÍA. No hay intercambio de token.
#       curl -u "pls_xxx:" -H "Accept: application/json;charset=UTF-8" https://external.pleo.io/v2/employees
#   Se genera en app.pleo.io → Settings → API Keys (rol admin o bookkeeper), eligiendo caducidad,
#   nivel de acceso a entidades y PERMISOS (scopes). Los que necesita esta integración:
#       · accounting-entries:read   (gastos + recibos)
#       · users:read                (empleados, para saber de quién es cada gasto)
#       · lectura de companies y tax-codes (descubrir empresas y calcular la base sin IVA)
#   ⚠️ Pleo advierte que las Standalone API Keys están RESTRINGIDAS y no se ofrecen a todos los
#   clientes: hay que pedirle a Pleo que las habilite para la cuenta.
#
# MULTI-EMPRESA
#   Pleo distingue ORGANIZACIÓN (contenedor) y EMPRESA (`company_id`, la entidad legal que tiene los
#   gastos). Aunque una sola key dé acceso a varias entidades, **cada llamada de contabilidad va con
#   su `company_id`**. Por eso el cliente se instancia por empresa del grupo (ver `PleoClient`).
#
# LO QUE NO HAY (y condiciona el diseño del sincronizador en app.py)
#   · No hay webhooks de gastos (solo export.job-created y vendor.created) → hay que sondear.
#   · No se puede filtrar ni ordenar por `updatedAt` → ventana móvil por `performedAt` + repesca
#     individual de los gastos que siguen incompletos (p. ej. sin justificante).
#   · Las URLs de descarga de los recibos son firmadas y CADUCAN A LAS 24 h → hay que descargar el
#     fichero en el momento y guardarlo en nuestro Storage; nunca almacenar la URL.
from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation

import requests

from config import settings

# Timeout por defecto de las llamadas (segundos). Conservador para no colgar peticiones web.
_TIMEOUT = 25
# Reintentos con espera creciente ante 429 (rate limit) y 5xx transitorios.
_RETRIES = 3
_BACKOFF = 1.6

# Familias de apunte que SÍ son un gasto de una persona (lo que va a «Mis gastos»).
# Se dejan fuera movimientos de cuenta (WALLET, BALANCE_AMENDMENT, CASHBACK, OVERDRAFT…) y las
# facturas de proveedor que paga la empresa (BILL_INVOICE*), que no son el gasto de un empleado.
PERSONAL_FAMILIES = [
    "CARD_PURCHASE",      # compra con la tarjeta Pleo
    "OUT_OF_POCKET",      # lo adelanta la persona de su bolsillo
    "REIMBURSEMENT",      # reembolso
    "MILEAGE",            # kilometraje
    "PER_DIEM",           # dietas
]
# Subfamilias de movimiento interno que hay que descartar aunque cuelguen de una familia válida.
SKIP_SUBFAMILIES = {"LOAD", "UNLOAD", "WITHDRAWAL", "FEE", "INTEREST"}
# Estados que consideramos gasto real (los borrados/anulados se detectan aparte).
LIVE_STATUSES = ["PENDING", "COMPLETED", "COMPLETED_EXTERNALLY"]
DEAD_STATUSES = {"CANCELLED", "REJECTED", "ERROR"}

# Extensiones que Pleo acepta como justificante, para nombrar bien el fichero al guardarlo.
_MIME_EXT = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/gif": "gif",
    "application/xml": "xml",
    "text/xml": "xml",
    "text/plain": "txt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}


class PleoError(RuntimeError):
    """Error de la integración con Pleo, con mensaje en claro para mostrar al usuario."""


def ext_for_mime(mime: str, fallback: str = "pdf") -> str:
    return _MIME_EXT.get((mime or "").split(";")[0].strip().lower(), fallback)


def _base(base: str | None = None) -> str:
    return (base or settings.PLEO_API_BASE or "https://external.pleo.io").rstrip("/")


def money_to_decimal(money: dict | None) -> Decimal:
    """Convierte un objeto Money de Pleo (`{currency, minors}`) a Decimal en unidades.

    Pleo da los importes en MINORS (céntimos). Las divisas de 0 decimales (JPY, KRW…) y de 3
    (BHD, KWD, TND…) se escalan según su exponente para no partir el importe.
    """
    if not isinstance(money, dict):
        return Decimal("0")
    try:
        minors = Decimal(str(money.get("minors") or 0))
    except (InvalidOperation, ValueError):
        return Decimal("0")
    cur = (money.get("currency") or "EUR").upper()
    if cur in {"JPY", "KRW", "VND", "CLP", "ISK", "PYG", "UGX", "RWF", "VUV", "XAF", "XOF", "XPF"}:
        exp = 0
    elif cur in {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}:
        exp = 3
    else:
        exp = 2
    return minors / (Decimal(10) ** exp)


class PleoClient:
    """Cliente de Pleo para UNA credencial (normalmente, una empresa del grupo)."""

    def __init__(self, api_key: str, *, base: str | None = None, timeout: int = _TIMEOUT):
        self.api_key = (api_key or "").strip()
        self.base = _base(base)
        self.timeout = timeout
        self._session = requests.Session()

    # ------------------------------------------------------------------ HTTP

    def _request(self, method: str, path: str, *, params: dict | None = None,
                 json: dict | None = None) -> dict:
        """Llamada genérica. Lanza PleoError con mensaje claro; reintenta 429/5xx con espera."""
        if not self.api_key:
            raise PleoError("Falta la credencial de Pleo de esta empresa.")
        url = self.base + path
        last = ""
        for attempt in range(_RETRIES):
            try:
                resp = self._session.request(
                    method, url,
                    params=params, json=json,
                    auth=(self.api_key, ""),
                    headers={"Accept": "application/json;charset=UTF-8"},
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                last = f"No se pudo conectar con Pleo: {e}"
                if attempt + 1 < _RETRIES:
                    time.sleep(_BACKOFF ** attempt)
                    continue
                raise PleoError(last) from e
            if resp.status_code == 401:
                raise PleoError("Pleo rechazó la credencial (401). Revisa la API Key de esta empresa.")
            if resp.status_code == 403:
                raise PleoError(
                    "Pleo dice que la credencial no tiene permiso (403). Comprueba que la API Key "
                    "lleva los scopes accounting-entries:read y users:read y acceso a esta empresa."
                )
            if resp.status_code == 404:
                raise PleoError("Pleo no encuentra el recurso (404). Revisa el ID de empresa.")
            if resp.status_code == 429 or resp.status_code >= 500:
                last = f"Pleo devolvió {resp.status_code}"
                if attempt + 1 < _RETRIES:
                    wait = resp.headers.get("Retry-After")
                    try:
                        time.sleep(min(float(wait), 30) if wait else _BACKOFF ** attempt)
                    except (TypeError, ValueError):
                        time.sleep(_BACKOFF ** attempt)
                    continue
                raise PleoError(f"{last}: {resp.text[:200]}")
            if resp.status_code >= 400:
                raise PleoError(f"Pleo devolvió un error {resp.status_code}: {resp.text[:300]}")
            try:
                return resp.json() or {}
            except ValueError:
                return {}
        raise PleoError(last or "Pleo no respondió.")

    def _paginate(self, method: str, path: str, *, params: dict | None = None,
                  json: dict | None = None, limit: int = 100, max_pages: int = 200):
        """Recorre una respuesta paginada por CURSOR de Pleo y va cediendo cada elemento.

        Pleo devuelve `{data: [...], pagination: {hasNextPage, endCursor}}`; la página siguiente se
        pide con `after=<endCursor>`. `max_pages` es un tope de seguridad contra bucles.
        """
        params = dict(params or {})
        params["limit"] = max(1, min(int(limit or 100), 100))
        after = None
        for _ in range(max_pages):
            if after:
                params["after"] = after
            payload = self._request(method, path, params=params, json=json)
            rows = payload.get("data")
            if isinstance(rows, dict):        # algunos endpoints devuelven un único objeto
                rows = [rows]
            for row in (rows or []):
                yield row
            page = payload.get("pagination") or {}
            if not page.get("hasNextPage"):
                return
            nxt = page.get("endCursor")
            if not nxt or nxt == after:
                return                        # defensa: cursor que no avanza
            after = nxt

    # -------------------------------------------------------------- Empresas

    def companies(self, organization_id: str | None = None) -> list[dict]:
        """Empresas visibles con esta credencial (para descubrir los `company_id` del grupo)."""
        params = {}
        if organization_id:
            params["organization_id"] = organization_id
        return list(self._paginate("GET", "/v1/companies", params=params, limit=100))

    # ------------------------------------------------------------- Empleados

    def employees(self, company_id: str) -> list[dict]:
        """Empleados de una empresa: `id`, `email`, `firstName`, `lastName`, `code`."""
        return list(self._paginate("GET", "/v2/employees", params={"companyId": company_id}, limit=100))

    # ------------------------------------------------------------- Tax codes

    def tax_codes(self, company_id: str) -> list[dict]:
        """Códigos de impuesto de la empresa: `id`, `code`, `name`, `rate` (0.21), `type`."""
        return list(self._paginate(
            "POST", "/v0/tax-codes:search",
            params={"company_id": company_id}, json={"archived": False}, limit=100,
        ))

    # ------------------------------------------------------------- Etiquetas

    def tags_catalog(self, company_id: str) -> list[dict]:
        """Catálogo de etiquetas (centros de coste) de la empresa, con su grupo.

        Los apuntes solo traen los IDs (`tagGroupId`/`tagId`); esto es lo que permite mostrarlas
        con su nombre legible en «Mis gastos». Devuelve filas con `id`, `name`, `code` y
        `group {id, name, code}`.
        """
        return list(self._paginate(
            "POST", "/v0/aggregations/tags",
            params={"company_id": company_id}, json={"includeArchived": True}, limit=100,
        ))

    # ---------------------------------------------------------------- Gastos

    def search_entries(self, company_id: str, *, performed_from: str | None = None,
                       performed_to: str | None = None, families: list[str] | None = None,
                       statuses: list[str] | None = None, employee_ids: list[str] | None = None,
                       include_deleted: bool = True):
        """Busca apuntes contables (gastos) de una empresa. Va cediendo uno a uno, ya paginado.

        Ojo con la forma de la llamada (es fácil equivocarse): `company_id` va en la QUERY STRING y
        los filtros en el BODY, e `includeDeleted` es OBLIGATORIO en el body.
        Fechas en ISO-8601 (`2026-07-01` o con hora).
        """
        params = {
            "company_id": company_id,
            "sorting_keys": "performedAt",
            "sorting_order": "DESC",
        }
        body: dict = {"includeDeleted": bool(include_deleted)}
        if performed_from:
            body["performedAtStart"] = performed_from
        if performed_to:
            body["performedAtEnd"] = performed_to
        body["families"] = list(families or PERSONAL_FAMILIES)
        if statuses:
            body["status"] = list(statuses)
        if employee_ids:
            body["employeeIds"] = list(employee_ids)[:100]
        return self._paginate("POST", "/v1/accounting-entries:search",
                              params=params, json=body, limit=100)

    def entry(self, entry_id: str) -> dict:
        """Un gasto concreto por su ID (para la repesca de los que siguen incompletos)."""
        payload = self._request("GET", f"/v1/accounting-entries/{entry_id}")
        data = payload.get("data")
        return data if isinstance(data, dict) else (payload or {})

    def receipts(self, entry_id: str, *, file_type: str = "ORIGINAL") -> list[dict]:
        """Justificantes de un gasto: `id`, `mimeType`, `sizeInBytes`, `source` y `url` (24 h)."""
        return list(self._paginate(
            "GET", f"/v1/accounting-entries/{entry_id}/receipts",
            params={"file_type": file_type}, limit=100,
        ))

    def download(self, url: str) -> tuple[bytes, str]:
        """Descarga un justificante por su URL firmada. Devuelve (bytes, content_type).

        Se hace SIN la credencial de Pleo (la URL ya va firmada) y con un tope de tamaño acorde al
        límite de Pleo (30 MB por fichero).
        """
        try:
            resp = requests.get(url, timeout=60, stream=True)
        except requests.RequestException as e:
            raise PleoError(f"No se pudo descargar el justificante: {e}") from e
        if resp.status_code >= 400:
            raise PleoError(f"No se pudo descargar el justificante (HTTP {resp.status_code}).")
        chunks, total, cap = [], 0, 30 * 1024 * 1024
        for chunk in resp.iter_content(65536):
            if not chunk:
                continue
            total += len(chunk)
            if total > cap:
                raise PleoError("El justificante pesa más de 30 MB.")
            chunks.append(chunk)
        return (b"".join(chunks), (resp.headers.get("Content-Type") or "").split(";")[0].strip())

    # ------------------------------------------------------------------ Ping

    def ping(self, company_id: str | None = None) -> tuple[bool, str]:
        """Prueba de conexión para Integraciones. Devuelve (ok, mensaje). No lanza."""
        if not self.api_key:
            return (False, "Sin credencial.")
        try:
            if company_id:
                # Prueba REAL de lo que vamos a usar: leer los empleados de esa empresa.
                first = next(self._paginate("GET", "/v2/employees",
                                           params={"companyId": company_id}, limit=1), None)
                if first is None:
                    return (True, "Conexión correcta, pero Pleo no devuelve empleados en esta empresa. "
                                  "Revisa el ID de empresa y el scope users:read.")
                return (True, "Conexión correcta: Pleo responde y devuelve empleados de esta empresa.")
            comps = self.companies()
            names = ", ".join([(c.get("name") or "?") for c in comps[:5]])
            return (True, f"Conexión correcta. Empresas visibles: {len(comps)}{(' · ' + names) if names else ''}.")
        except PleoError as e:
            return (False, str(e))
        except Exception as e:                                   # noqa: BLE001 - nunca romper la página
            return (False, f"Error inesperado hablando con Pleo: {e}")
