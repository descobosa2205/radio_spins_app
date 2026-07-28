# cabify_utils.py
#
# Cliente de la API de Cabify (Ride-Hailing / Business). Mismo patrón que pleo_utils.py: módulo
# aislado, sin BD y sin Flask, para que un fallo de la integración no toque el resto de la app.
#
# CÓMO SE AUTENTICA  (docs: cabify-api.readme.io/docs/get-your-access-token)
#   OAuth2 client_credentials contra `{base}/auth/api/authorization`:
#       POST grant_type=client_credentials & client_id=… & client_secret=…
#       → {"access_token": "...", "token_type": "Bearer", "expires_in": <segundos, ~30 días>}
#   Luego, en cada llamada:  Authorization: Bearer <access_token>
#   El token se cachea en memoria y se renueva solo un poco antes de caducar.
#
# BASE URL
#   Sandbox:    https://cabify-sandbox.com          (api en {base}/api/v4)
#   Producción: la entrega Cabify al conceder el acceso de producción y NO es pública, por eso es un
#   campo editable por cuenta (`CabifyAccount.base_url`) en vez de estar aquí a fuego.
#
# MULTI-EMPRESA
#   Una cuenta (client_id/secret) por EMPRESA DEL GRUPO: cada una factura por su lado y tiene sus
#   propios empleados. Por eso el cliente se instancia por empresa, como en Pleo.
#
# QUÉ TRAE Y QUÉ NO  (condiciona el diseño del sincronizador en app.py)
#   · `GET /api/v4/users?state=&page=&per=`  → empleados de la cuenta, con su EMAIL. Es lo que
#     permite emparejarlos con la gente de la app (el correo de empresa).
#   · `GET /api/v4/user/{user_id}/sales?from=&to=&currency=&page=&per=` → los gastos DE ESA PERSONA.
#     Se usa este y no `/api/v4/sales` (el global) porque el sale global NO trae quién lo pidió:
#     recorriendo usuario por usuario, la atribución es exacta.
#   · Cada `sale` trae: `code`, `invoice_date`, `currency`, `price_details{total, discount,
#     tax_rate, tax_type}` (importes en CÉNTIMOS, con impuestos) y `concept.type_object` con los
#     datos del viaje (descripción, start_at/end_at y paradas con dirección).
#   ⚠️ La API documentada NO expone un PDF de factura/recibo por viaje. Se importa el gasto con todo
#     su detalle fiscal (nº de venta, fecha, base, IVA y total), pero el justificante en PDF hay que
#     seguir sacándolo de la factura mensual de Cabify. Si Cabify habilita un endpoint de documento,
#     el único sitio a tocar es `sale_receipt_url()`.
from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation

import requests

# Timeout por defecto (segundos): conservador para no colgar peticiones web.
_TIMEOUT = 25
# Reintentos con espera creciente ante 429 (rate limit) y 5xx transitorios.
_RETRIES = 3
_BACKOFF = 1.7

SANDBOX_BASE_URL = "https://cabify-sandbox.com"
# La URL de PRODUCCIÓN no está publicada (Cabify la entrega al conceder el acceso). Estas son las
# candidatas que se prueban al pulsar «Probar conexión», en orden; la que responda se guarda sola.
BASE_URL_CANDIDATES = [
    "https://cabify.com",
    "https://api.cabify.com",
    "https://empresas.cabify.com",
    SANDBOX_BASE_URL,
]
# Monedas que admite el endpoint de ventas.
CURRENCIES = ["EUR", "CLP", "PEN", "MXN", "COP", "USD", "BRL", "ARS"]


class CabifyError(RuntimeError):
    """Fallo de la API de Cabify (credenciales, red o respuesta inesperada)."""


def money_from_cents(value) -> Decimal:
    """Los importes de Cabify vienen en CÉNTIMOS enteros."""
    if value in (None, ""):
        return Decimal("0")
    try:
        return (Decimal(str(value)) / Decimal("100")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


class CabifyClient:
    """Cliente de UNA cuenta de Cabify (una empresa del grupo)."""

    def __init__(self, client_id: str, client_secret: str, base_url: str | None = None):
        self.client_id = (client_id or "").strip()
        self.client_secret = (client_secret or "").strip()
        self.base_url = (base_url or SANDBOX_BASE_URL).strip().rstrip("/")
        self._token = None
        self._token_expires_at = 0.0

    # ------------------------------------------------------------------ auth
    def _fetch_token(self) -> str:
        if not self.client_id or not self.client_secret:
            raise CabifyError("Faltan el client_id o el client_secret de Cabify.")
        url = f"{self.base_url}/auth/api/authorization"
        try:
            r = requests.post(url, data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }, timeout=_TIMEOUT)
        except requests.RequestException as exc:
            raise CabifyError(f"No se pudo conectar con Cabify: {exc}") from exc
        if r.status_code >= 400:
            raise CabifyError(f"Cabify rechazó las credenciales ({r.status_code}): {r.text[:200]}")
        try:
            data = r.json() or {}
        except ValueError as exc:
            raise CabifyError("Respuesta de autenticación de Cabify ilegible.") from exc
        token = (data.get("access_token") or "").strip()
        if not token:
            raise CabifyError("Cabify no devolvió ningún access_token.")
        # Se renueva un poco antes de caducar (o en 1 h si no dice nada).
        try:
            expires_in = int(data.get("expires_in") or 3600)
        except (TypeError, ValueError):
            expires_in = 3600
        self._token = token
        self._token_expires_at = time.time() + max(expires_in - 300, 60)
        return token

    def _auth_header(self) -> dict:
        if not self._token or time.time() >= self._token_expires_at:
            self._fetch_token()
        return {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}

    # ------------------------------------------------------------------ HTTP
    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.base_url}/api/v4/{path.lstrip('/')}"
        last = None
        for intento in range(_RETRIES):
            try:
                r = requests.get(url, headers=self._auth_header(), params=params or {}, timeout=_TIMEOUT)
            except requests.RequestException as exc:
                last = CabifyError(f"Error de red hablando con Cabify: {exc}")
                time.sleep(_BACKOFF ** intento)
                continue
            if r.status_code == 401:
                # Token caducado o revocado: se pide uno nuevo y se reintenta una vez.
                self._token = None
                if intento + 1 < _RETRIES:
                    continue
                raise CabifyError("Cabify devolvió 401: revisa las credenciales.")
            if r.status_code == 429 or r.status_code >= 500:
                last = CabifyError(f"Cabify respondió {r.status_code}.")
                time.sleep(_BACKOFF ** intento)
                continue
            if r.status_code >= 400:
                raise CabifyError(f"Cabify respondió {r.status_code}: {r.text[:200]}")
            try:
                return r.json() or {}
            except ValueError as exc:
                raise CabifyError("Respuesta de Cabify ilegible.") from exc
        raise last or CabifyError("No se pudo hablar con Cabify.")

    def _paginated(self, path: str, params: dict | None = None, limit_pages: int = 200):
        """Recorre un endpoint paginado de Cabify ({data, page, pages, per, total})."""
        page = 1
        while page <= limit_pages:
            data = self._get(path, dict(params or {}, page=page, per=100))
            rows = data.get("data") or []
            for row in rows:
                yield row
            total_pages = int(data.get("pages") or 1)
            if page >= total_pages or not rows:
                return
            page += 1

    # ------------------------------------------------------------------ API
    def ping(self) -> dict:
        """Comprueba credenciales pidiendo la primera página de usuarios."""
        data = self._get("users", {"page": 1, "per": 1})
        return {"ok": True, "total_users": int(data.get("total") or 0)}

    def users(self, state: str = "active"):
        """Empleados de la cuenta. Su `email` es lo que empareja con la gente de la app."""
        return self._paginated("users", {"state": state})

    def user_by_email(self, email: str) -> dict:
        return self._get(f"users/email/{email}")

    def user_sales(self, user_id: str, date_from, date_to, currency: str = "EUR"):
        """Gastos (ventas) de UNA persona entre dos fechas. Las fechas van en YYYY-MM-DD."""
        return self._paginated(f"user/{user_id}/sales", {
            "from": date_from.isoformat() if hasattr(date_from, "isoformat") else str(date_from),
            "to": date_to.isoformat() if hasattr(date_to, "isoformat") else str(date_to),
            "currency": (currency or "EUR").upper(),
        })

    def client_sales(self, date_from, date_to, currency: str = "EUR"):
        """Todas las ventas de la cuenta (sin atribución de persona). Solo para cuadres."""
        return self._paginated("sales", {
            "from": date_from.isoformat() if hasattr(date_from, "isoformat") else str(date_from),
            "to": date_to.isoformat() if hasattr(date_to, "isoformat") else str(date_to),
            "currency": (currency or "EUR").upper(),
        })

    @staticmethod
    def sale_receipt_url(sale: dict) -> str:
        """URL del justificante de la venta, si algún día la API la expone.

        Hoy el esquema documentado NO trae ningún documento; se dejan probados los nombres de campo
        más plausibles para que, en cuanto Cabify lo publique, funcione sin tocar nada más.
        """
        for key in ("receipt_url", "invoice_url", "document_url", "pdf_url"):
            value = (sale.get(key) or "").strip() if isinstance(sale.get(key), str) else ""
            if value:
                return value
        return ""


def find_working_base_url(client_id: str, client_secret: str, preferred: str | None = None):
    """Busca contra qué host responden estas credenciales.

    La URL de producción no es pública, así que en vez de obligar a adivinarla se prueba la que haya
    configurada y, si no va, las candidatas conocidas. Devuelve (base_url, info) o lanza CabifyError
    con el último fallo si ninguna responde.
    """
    intentos = []
    orden = []
    if (preferred or "").strip():
        orden.append(preferred.strip().rstrip("/"))
    for cand in BASE_URL_CANDIDATES:
        if cand not in orden:
            orden.append(cand)
    ultimo = None
    for base in orden:
        cliente = CabifyClient(client_id, client_secret, base)
        try:
            info = cliente.ping()
            return base, info
        except CabifyError as exc:
            ultimo = exc
            intentos.append(f"{base}: {exc}")
    raise CabifyError("Ninguna URL respondió con estas credenciales.\n" + "\n".join(intentos)) from ultimo


def _place_labels(node) -> tuple:
    """De una parada de Cabify saca (corto, largo).

    El esquema real trae `pickup`/`dropoff` con `addr` (calle), `num`, `city` y `name` (el alias que
    la persona tenga guardado: «Casa», «Oficina»). El corto es para la tarjeta del gasto; el largo,
    con ciudad, para el justificante.
    """
    if not isinstance(node, dict):
        return "", ""
    calle = (node.get("addr") or node.get("address") or "").strip()
    num = str(node.get("num") or "").strip()
    ciudad = (node.get("city") or "").strip()
    alias = (node.get("name") or "").strip()
    corto = calle
    if corto and num:
        corto = f"{corto}, {num}"
    if not corto:
        corto = alias or ciudad
    largo = corto
    if ciudad and ciudad.lower() not in largo.lower():
        largo = f"{largo} ({ciudad})" if largo else ciudad
    return corto, largo


def parse_sale(sale: dict) -> dict:
    """Normaliza una venta de Cabify a lo que necesita «Mis gastos».

    `price_details.total` viene en céntimos y CON impuestos; con `tax_rate` se despeja la base.
    ⚠️ El origen y el destino están en `concept.type_object.pickup` / `.dropoff` (así viene en el
    esquema real de la API), no en una lista de paradas; se deja `stops` como respaldo por si en
    algún viaje con paradas intermedias apareciera.
    """
    price = sale.get("price_details") or {}
    gross = money_from_cents(price.get("total"))
    try:
        tax_rate = Decimal(str(price.get("tax_rate") or 0))
    except (InvalidOperation, ValueError, TypeError):
        tax_rate = Decimal("0")
    # El tipo puede venir como porcentaje (21) o como fracción (0.21): se normaliza a porcentaje.
    if Decimal("0") < tax_rate <= Decimal("1"):
        tax_rate = tax_rate * Decimal("100")
    if tax_rate > 0:
        net = (gross / (Decimal("1") + tax_rate / Decimal("100"))).quantize(Decimal("0.01"))
    else:
        net = gross
    concept = sale.get("concept") or {}
    obj = concept.get("type_object") or {}
    stops = obj.get("stops") or []
    subida = obj.get("pickup") or (stops[0] if stops else None)
    bajada = obj.get("dropoff") or (stops[-1] if len(stops) > 1 else None)
    origen, origen_full = _place_labels(subida)
    destino, destino_full = _place_labels(bajada)
    trayecto = " → ".join([x for x in (origen, destino) if x])
    # En «Mis gastos» solo interesan la fecha, el origen y el destino (la fecha va aparte). La
    # descripción larga de Cabify no se usa como concepto: alarga la tarjeta sin aportar.
    texto = trayecto or (obj.get("description") or "").strip() or "Viaje en Cabify"
    return {
        "code": (sale.get("code") or "").strip(),
        "currency": (sale.get("currency") or "EUR").upper(),
        "invoice_date": (sale.get("invoice_date") or "").strip(),
        "journey_id": (obj.get("id") or obj.get("journey_id") or "").strip(),
        "charge_code": (obj.get("charge_code") or "").strip(),
        "start_at": (obj.get("start_at") or "").strip(),
        "end_at": (obj.get("end_at") or "").strip(),
        "region": (obj.get("region") or "").strip(),
        "description": (obj.get("description") or "").strip(),
        "concept": texto[:200],
        "origin": origen,
        "destination": destino,
        "origin_full": origen_full,
        "destination_full": destino_full,
        "amount_gross": gross,
        "amount_net": net,
        "amount_tax": (gross - net),
        "tax_rate": tax_rate,
        "tax_type": (price.get("tax_type") or "").strip().upper(),
        "discount": money_from_cents(price.get("discount")),
        "receipt_url": CabifyClient.sale_receipt_url(sale),
    }
