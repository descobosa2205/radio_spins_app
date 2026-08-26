# holded_utils.py
#
# Cliente de la API de Holded (CONTABILIDAD). Mismo patrón que pleo_utils.py / cabify_utils.py:
# módulo aislado, sin BD y sin Flask, para que un fallo de la integración no toque el resto.
#
# CÓMO SE AUTENTICA
#   Una API Key por cuenta de Holded, que se manda en la cabecera `key`. Se saca de
#   Holded → Configuración → Desarrolladores → API Key. NO hay OAuth ni token que caduque.
#       curl -H "key: <APIKEY>" https://api.holded.com/api/invoicing/v1/contacts
#
# UNA CUENTA POR EMPRESA DEL GRUPO
#   Cada empresa del grupo lleva su propia contabilidad en Holded, así que cada una tiene su API Key
#   y su cliente (ver `HoldedAccount` en models.py). Nada de una key global en el `.env`.
#
# ⚠️ HOLDED DEVUELVE LOS ERRORES CON UN 200
#   Muchas respuestas de error llegan con HTTP 200 y el cuerpo `{"status": 0, "info": "..."}`. Si solo
#   se mira el código HTTP, un documento que no se ha creado parece creado. `_check_payload` lo
#   convierte en un HoldedError con el texto que da Holded, que es lo que se le enseña al usuario.
#
# ⚠️ LO QUE SE COMPRUEBA DESPUÉS DE CREAR
#   El mapeo de impuestos (IVA y retención) es lo único que no se puede dar por bueno a ciegas: si
#   Holded ignorase un campo, el documento quedaría con otro total y nadie se enteraría. Por eso
#   `verify_document_total` relee el documento creado y compara el total con el nuestro: si no cuadra,
#   se avisa en vez de callar.
#
# ⚠️ RUTAS QUE SE DESCUBREN SOLAS
#   Para adjuntar el fichero al documento y para leer las formas de pago se prueban varias rutas
#   candidatas y se GUARDA la que responde (`endpoints`, en la cuenta). Mismo patrón que la URL base
#   de Cabify: así la integración se ajusta a la cuenta real sin tocar código.
from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import requests

_TIMEOUT = 30
_RETRIES = 3
_BACKOFF = 1.6

BASE_URL = "https://api.holded.com/api"
INVOICING = "/invoicing/v1"

# Tipos de documento de compra que usamos:
#   · FACTURA de un proveedor  → `purchase`      (Compras → Facturas de compra)
#   · TICKET / gasto sin factura → `dailyexpense` (Compras → Gastos)
# Son editables en la cuenta porque el nombre del tipo de «gasto» ha cambiado de nombre en Holded más
# de una vez; `probe_doc_type` comprueba con un GET si el tipo existe en esta cuenta.
DOC_TYPE_INVOICE = "purchase"
DOC_TYPE_TICKET = "dailyexpense"
TICKET_DOC_TYPE_CANDIDATES = ("dailyexpense", "purchase")

# Rutas candidatas para ADJUNTAR el documento (fichero) a una compra ya creada.
# (sufijo de la ruta, nombre del campo del formulario)
_ATTACH_CANDIDATES = (
    ("/attachment", "file"),
    ("/attach", "file"),
    ("/attachments", "file"),
    ("/file", "file"),
    ("/files", "file"),
    ("/attachment", "attachment"),
    ("/attach", "attachment"),
)
# Rutas candidatas del catálogo de formas de pago.
_PAYMENT_METHOD_PATHS = ("/paymentmethods", "/payment-methods", "/paymentsmethods", "/payments/methods")

_TWO = Decimal("0.01")


# Cabeceras con las que se puede mandar la clave, en orden de preferencia.
AUTH_HEADERS = ("key", "X-API-KEY", "Authorization")
# Los TOKENS nuevos de Holded («personal access token») empiezan por `pat_` y su propia pantalla dice
# que se mandan como `Authorization: Bearer <clave>`. Con uno de esos se empieza por ahí: si no, el
# primer intento sería un 401 seguro con la cabecera clásica.
BEARER_KEY_PREFIXES = ("pat_", "sk_", "pt_")


def looks_like_bearer_key(value: str | None) -> bool:
    """¿Es uno de los tokens nuevos (los que Holded pide mandar con `Authorization: Bearer`)?"""
    clave = clean_api_key(value)
    return any(clave.startswith(p) for p in BEARER_KEY_PREFIXES)


def auth_headers_for(value: str | None) -> tuple:
    """El orden en el que se prueban las cabeceras para ESA clave."""
    if looks_like_bearer_key(value):
        return ("Authorization", "key", "X-API-KEY")
    return AUTH_HEADERS
# Textos con los que Holded dice «esa clave no vale» (llegan con 200, 400 o 401, según el caso).
_AUTH_ERROR_HINTS = ("invalid key", "invalid api key", "unauthorized", "not authorized",
                     "invalid token", "api key")


def clean_api_key(value: str | None) -> str:
    """Limpia la clave TAL COMO se pega desde Holded.

    Al copiarla se arrastran cosas que la invalidan sin que se vea: espacios y saltos de línea,
    comillas, espacios de ancho cero, o el propio nombre de la cabecera («key: abc…», «Bearer abc…»).
    Esto es lo primero que hay que descartar cuando Holded contesta «Invalid key».
    """
    texto = str(value or "")
    for basura in ("\u200b", "\u200c", "\u200d", "\ufeff", "\xa0"):
        texto = texto.replace(basura, "")
    texto = texto.strip().strip('"\'').strip()
    for prefijo in ("key:", "key =", "key=", "x-api-key:", "authorization:", "bearer "):
        if texto.lower().startswith(prefijo):
            texto = texto[len(prefijo):].strip()
    return texto.strip().strip('"\'').strip()


class HoldedError(RuntimeError):
    """Error de la integración con Holded, con un mensaje en claro para mostrar al usuario."""


def _body_message(resp) -> str:
    """El motivo que da Holded en el cuerpo (`info`), o el texto tal cual si no viene en JSON."""
    try:
        datos = resp.json()
    except Exception:
        return (getattr(resp, "text", "") or "")[:200]
    if isinstance(datos, dict):
        for clave in ("info", "message", "error", "description"):
            if datos.get(clave):
                return str(datos[clave])[:200]
        # Respuestas como `{"status": 401}` no dicen nada: mejor no pegar el JSON crudo.
        if set(datos.keys()) <= {"status", "code"}:
            return "la clave no vale"
    return (getattr(resp, "text", "") or "")[:200]


def _looks_like_auth_error(texto: str | None) -> bool:
    bajo = (texto or "").lower()
    return any(h in bajo for h in _AUTH_ERROR_HINTS)


# Lo que un token de Holded tiene que poder hacer para contabilizar desde aquí.
TOKEN_SCOPES_HINT = ("Contactos (ver y crear), Facturas de compra / Gastos (ver y crear) y, si se "
                     "sube el PDF, Adjuntos")


def _auth_error_message(resp, *, path: str = "") -> str:
    """Qué decirle a quien acaba de pegar la clave. Distingue los DOS casos, que no se arreglan igual:

    · **401** → la credencial no vale (mal pegada, de otra empresa, o el plan sin API).
    · **403** → la credencial ES válida pero **al token le faltan permisos** para eso. Los tokens
      nuevos de Holded «solo tienen acceso a los permisos seleccionados», así que este es el caso más
      habitual con ellos y decir «la clave no vale» sería mentira.
    """
    motivo = _body_message(resp)
    if resp.status_code == 403:
        return (
            "Holded acepta la credencial pero NO deja hacer esto (403: %s).\n"
            "Es cosa de los PERMISOS del token: al crearlo en Holded se eligen uno a uno. Hacen "
            "falta %s%s.\n"
            "Vuelve a Holded → Configuración → Desarrolladores, edita el token (o crea otro) y marca "
            "esos permisos."
            % (motivo, TOKEN_SCOPES_HINT, (" · ruta: %s" % path) if path else "")
        )
    return (
        "Holded no acepta la credencial (%s: %s).\n"
        "Si Holded te dijo «usa Authorization: Bearer <clave>», es un TOKEN nuevo: pégalo tal cual "
        "y deja la cabecera en «Automática» (se prueba Bearer sola). Si es la API Key clásica, está "
        "en Holded → tu usuario → Configuración → Desarrolladores → API Key (no el «código de "
        "integración» de una app del marketplace ni el secreto de un webhook). En los dos casos tiene "
        "que ser de ESTA empresa y su plan debe incluir acceso a la API.\n"
        "⚠️ Las claves secretas de Holded **solo se ven una vez**: si no la guardaste, crea otra."
        % (resp.status_code, motivo)
    )


def norm_tax_id(value: str | None) -> str:
    """CIF/DNI/NIE en seco y en mayúsculas: es la clave con la que se busca el contacto en Holded."""
    return "".join(ch for ch in (value or "").upper() if ch.isalnum())


def money(value) -> Decimal:
    """Importe a Decimal con dos decimales (nunca float: es dinero)."""
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value)).quantize(_TWO, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def pct(value) -> Decimal:
    """Porcentaje a Decimal (dos decimales). Un 21 y un 21,00 son lo mismo."""
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value).replace(",", ".")).quantize(_TWO, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def to_timestamp(value) -> int:
    """Fecha (date/datetime) al formato que pide Holded: segundos desde epoch."""
    if value is None:
        return 0
    try:
        import datetime as _dt
        if isinstance(value, _dt.datetime):
            return int(value.timestamp())
        if isinstance(value, _dt.date):
            return int(_dt.datetime(value.year, value.month, value.day, 12, 0, 0).timestamp())
        return int(value)
    except Exception:
        return 0


def build_purchase_payload(
    *,
    concept: str,
    total: Decimal | str | float,
    net: Decimal | str | float | None = None,
    vat_pct: Decimal | str | float | None = None,
    retention_pct: Decimal | str | float | None = None,
    contact_id: str | None = None,
    contact_name: str | None = None,
    doc_number: str | None = None,
    issue_date=None,
    tags: list[str] | None = None,
    notes: str | None = None,
    payment_method_id: str | None = None,
    currency: str = "EUR",
) -> dict:
    """Cuerpo de la compra que se manda a Holded (función PURA: se puede probar sin red).

    · La línea del documento va SIN impuestos (`subtotal` = base) y los impuestos van en la propia
      línea como PORCENTAJES (`tax` = IVA, `retention` = retención). Es como Holded calcula el total.
    · Si no se sabe la base, se despeja del total con el % de IVA (y la retención, que RESTA del
      total). Nunca se manda un total «a pelo»: Holded lo recalcula desde la línea y quedaría otro.
    · Un ticket no lleva ni nº de documento ni fecha de emisión ni impuestos: eso lo decide quien
      llama (no pasando esos campos), no esta función.
    """
    total_d = money(total)
    iva = pct(vat_pct)
    ret = pct(retention_pct)
    base = money(net) if net not in (None, "") else Decimal("0")
    if base <= 0:
        # total = base + base*iva/100 - base*ret/100  →  base = total / (1 + (iva-ret)/100)
        factor = Decimal("1") + (iva - ret) / Decimal("100")
        base = money(total_d / factor) if factor > 0 else total_d
    payload: dict = {
        "currency": (currency or "EUR").upper(),
        "items": [{
            "name": (concept or "Gasto")[:250],
            "units": 1,
            "subtotal": float(base),
            "tax": float(iva),
        }],
    }
    if ret > 0:
        payload["items"][0]["retention"] = float(ret)
    if contact_id:
        payload["contactId"] = contact_id
    if contact_name:
        payload["contactName"] = (contact_name or "")[:150]
    if doc_number:
        payload["docNumber"] = (doc_number or "")[:60]
    ts = to_timestamp(issue_date)
    if ts:
        payload["date"] = ts
    if tags:
        payload["tags"] = [t for t in tags if t]
    if notes:
        payload["notes"] = (notes or "")[:1000]
    if payment_method_id:
        payload["paymentMethodId"] = payment_method_id
    return payload


def build_contact_payload(
    *,
    name: str,
    tax_id: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    postal_code: str | None = None,
    city: str | None = None,
    province: str | None = None,
    country: str | None = "España",
    is_person: bool = False,
) -> dict:
    """Cuerpo del contacto (PROVEEDOR) que se crea en Holded.

    ⚠️ La DIRECCIÓN FISCAL de Holded va en piezas (`billAddress`: address, postalCode, city,
    province, country). Un cuadro de texto con todo junto no le sirve: por eso en la app la
    dirección fiscal se pide separada.
    """
    payload: dict = {
        "name": (name or "Proveedor")[:150],
        "type": "supplier",
        "isperson": bool(is_person),
    }
    cif = (tax_id or "").strip().upper()
    if cif:
        payload["code"] = cif
        payload["vatnumber"] = cif
    if email:
        payload["email"] = (email or "").strip()
    if phone:
        payload["phone"] = (phone or "").strip()
    bill = {}
    if address:
        bill["address"] = (address or "").strip()[:200]
    if postal_code:
        bill["postalCode"] = (postal_code or "").strip()[:20]
    if city:
        bill["city"] = (city or "").strip()[:100]
    if province:
        bill["province"] = (province or "").strip()[:100]
    if country:
        bill["country"] = (country or "").strip()[:100]
    if bill:
        payload["billAddress"] = bill
    return payload


class HoldedClient:
    """Cliente de Holded para UNA cuenta (una empresa del grupo).

    `endpoints` es el diccionario de rutas ya descubiertas (se guarda en la cuenta). Si el cliente
    descubre una nueva pone `endpoints_changed = True` para que quien llama la guarde.
    """

    def __init__(self, api_key: str, *, base: str | None = None, timeout: int = _TIMEOUT,
                 endpoints: dict | None = None, auth_header: str | None = None):
        self.api_key = clean_api_key(api_key)
        self.base = (base or BASE_URL).rstrip("/")
        self.timeout = timeout
        self.endpoints = dict(endpoints or {})
        self.endpoints_changed = False
        self._session = requests.Session()
        # Contactos ya buscados en ESTA tanda: subir 50 gastos del mismo proveedor no puede volver a
        # recorrer el listado de contactos 50 veces.
        self._contact_cache: dict[str, dict | None] = {}
        # Cabecera con la que se manda la clave. La documentada es `key`, pero hay cuentas que solo
        # responden con `X-API-KEY`, así que si la primera da «Invalid key» se prueba la otra y se
        # GUARDA la que funcione (mismo patrón que las rutas de adjuntar).
        # Cabecera con la que se manda la clave. Si viene FIJADA (la que Holded haya indicado), se usa
        # esa y no se prueban las demás; con AUTO se prueban las tres y se recuerda la que funcione.
        fijada = (auth_header or "").strip()
        self.auth_header_fixed = fijada if fijada in AUTH_HEADERS else ""
        # ⚠️ Con un token `pat_…` se empieza por Bearer (es lo que pide su pantalla); con la API Key
        # clásica, por `key`. Y si ya se sabe cuál funcionó, esa.
        self.auth_header = (self.auth_header_fixed
                            or (self.endpoints or {}).get("auth_header")
                            or auth_headers_for(self.api_key)[0])
        self._auth_tried: set[str] = set()

    # ------------------------------------------------------------------ HTTP

    @staticmethod
    def _check_payload(payload):
        """Convierte en error los `{"status": 0, "info": ...}` que Holded manda con un HTTP 200."""
        if isinstance(payload, dict):
            estado = payload.get("status")
            if estado in (0, "0", False):
                texto = (payload.get("info") or payload.get("message") or payload.get("error")
                         or "Holded ha rechazado la petición.")
                raise HoldedError(str(texto)[:400])
        return payload

    def _auth_headers(self) -> dict:
        cabecera = self.auth_header or self._auth_order[0]
        valor = ("Bearer " + self.api_key) if cabecera == "Authorization" else self.api_key
        return {cabecera: valor, "Accept": "application/json"}

    @property
    def _auth_order(self) -> tuple:
        """El orden de cabeceras para esta clave (un token `pat_…` empieza por Bearer)."""
        return auth_headers_for(self.api_key)

    def _switch_auth_header(self) -> bool:
        """Pasa a la siguiente cabecera candidata. Devuelve False si ya se han probado todas.

        ⚠️ Se prueban TODAS **también cuando la cabecera está fijada a mano**: si alguien la fija mal,
        antes la integración se quedaba muerta con un «la clave no vale» que no era verdad (bug real).
        Lo que hace la fijada es ir PRIMERO; si no vale y otra sí, se usa esa y se recuerda.
        """
        self._auth_tried.add(self.auth_header)
        for candidata in self._auth_order:
            if candidata not in self._auth_tried:
                self.auth_header = candidata
                return True
        return False

    def _remember_auth_header(self) -> None:
        """Guarda la cabecera que ha funcionado, para no volver a probar.

        ⚠️ También cuando había una FIJADA a mano y no era la buena: lo que manda es la que de verdad
        entra (la fijada solo dice cuál se prueba primero)."""
        if (self.endpoints or {}).get("auth_header") != self.auth_header:
            self.endpoints["auth_header"] = self.auth_header
            self.endpoints_changed = True

    def _request(self, method: str, path: str, *, params: dict | None = None,
                 json_body: dict | None = None, files=None, data: dict | None = None,
                 raw: bool = False, check: bool = True):
        if not self.api_key:
            raise HoldedError("Falta la API Key de Holded de esta empresa.")
        url = self.base + path
        last = ""
        for attempt in range(_RETRIES):
            try:
                resp = self._session.request(
                    method, url,
                    params=params, json=json_body, files=files, data=data,
                    headers=self._auth_headers(),
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                last = f"No se pudo conectar con Holded: {e}"
                if attempt + 1 < _RETRIES:
                    time.sleep(_BACKOFF ** attempt)
                    continue
                raise HoldedError(last) from e
            if resp.status_code == 403:
                # ⚠️ 403 = la credencial SÍ vale y le faltan PERMISOS: la cabecera es la buena (se
                # recuerda) y probar otra solo confundiría el diagnóstico.
                self._remember_auth_header()
                raise HoldedError(_auth_error_message(resp, path=path))
            if resp.status_code == 401 or (
                    resp.status_code == 400 and _looks_like_auth_error(resp.text)):
                # ¿Es cosa de la CABECERA? Se prueba la siguiente candidata antes de rendirse.
                if self._switch_auth_header():
                    continue
                raise HoldedError(_auth_error_message(resp, path=path))
            if resp.status_code == 404:
                raise HoldedError("Holded no encuentra la ruta o el documento (404): %s" % path)
            if resp.status_code == 429 or resp.status_code >= 500:
                last = f"Holded ha devuelto {resp.status_code}"
                if attempt + 1 < _RETRIES:
                    espera = resp.headers.get("Retry-After")
                    try:
                        time.sleep(min(float(espera), 30) if espera else _BACKOFF ** attempt)
                    except (TypeError, ValueError):
                        time.sleep(_BACKOFF ** attempt)
                    continue
                raise HoldedError(f"{last}: {resp.text[:200]}")
            if resp.status_code >= 400:
                # El cuerpo suele traer el motivo en claro (`info`): eso es lo que hay que enseñar,
                # no el JSON crudo.
                raise HoldedError("Holded dice: %s (error %s)" % (_body_message(resp), resp.status_code))
            if raw:
                self._remember_auth_header()
                return resp
            try:
                payload = resp.json()
            except ValueError:
                self._remember_auth_header()
                return {}
            # ⚠️ Holded contesta «Invalid key» también con un 200 y `{"status": 0}`: aquí también hay
            # que probar la otra cabecera antes de dar la clave por mala.
            if (isinstance(payload, dict) and payload.get("status") in (0, "0", False)
                    and _looks_like_auth_error(str(payload.get("info") or payload.get("message") or ""))):
                if self._switch_auth_header():
                    continue
                raise HoldedError(_auth_error_message(resp, path=path))
            self._remember_auth_header()
            return self._check_payload(payload) if check else payload
        raise HoldedError(last or "Holded no ha respondido.")

    # -------------------------------------------------------------- Conexión

    def test(self) -> dict:
        """Comprueba la credencial. Devuelve un resumen para enseñar en Integraciones."""
        contactos = self._request("GET", INVOICING + "/contacts", params={"page": 1})
        if isinstance(contactos, dict):
            contactos = contactos.get("data") or []
        return {"ok": True, "contacts": len(contactos or [])}

    def probe_doc_type(self, doc_type: str) -> bool:
        """¿Existe este tipo de documento en la cuenta? Se pregunta con un GET (no crea nada)."""
        try:
            self._request("GET", f"{INVOICING}/documents/{doc_type}", params={"page": 1})
            return True
        except HoldedError:
            return False

    def detect_ticket_doc_type(self) -> str:
        """Tipo de documento para los TICKETS (gastos): el primero que la cuenta acepte."""
        for candidato in TICKET_DOC_TYPE_CANDIDATES:
            if self.probe_doc_type(candidato):
                return candidato
        return DOC_TYPE_TICKET

    # -------------------------------------------------------------- Contactos

    def find_contact(self, tax_id: str | None, *, name: str | None = None,
                     max_pages: int = 30) -> dict | None:
        """Busca un contacto por CIF/DNI/NIE (y, si no hay, por nombre exacto).

        Primero se intenta el filtro del servidor y, si no filtra de verdad, se recorre el listado
        comparando en seco: es la única forma de no crear un proveedor duplicado por un guion o un
        espacio de más.
        """
        cif = norm_tax_id(tax_id)
        objetivo_nombre = (name or "").strip().casefold()
        clave = "cif:" + cif if cif else "nombre:" + objetivo_nombre
        if clave in self._contact_cache:
            return self._contact_cache[clave]
        encontrado = self._find_contact_uncached(cif, objetivo_nombre, max_pages)
        self._contact_cache[clave] = encontrado
        return encontrado

    def _find_contact_uncached(self, cif: str, objetivo_nombre: str, max_pages: int) -> dict | None:
        if cif:
            try:
                filtrados = self._request("GET", INVOICING + "/contacts", params={"vatnumber": cif})
                if isinstance(filtrados, dict):
                    filtrados = filtrados.get("data") or []
                for c in (filtrados or []):
                    if self._contact_matches(c, cif, ""):
                        return c
            except HoldedError:
                pass
        pagina = 1
        vistas = set()
        while pagina <= max_pages:
            filas = self._request("GET", INVOICING + "/contacts", params={"page": pagina})
            if isinstance(filas, dict):
                filas = filas.get("data") or []
            if not filas:
                return None
            for c in filas:
                if cif and self._contact_matches(c, cif, ""):
                    return c
                if not cif and objetivo_nombre and self._contact_matches(c, "", objetivo_nombre):
                    return c
            # Defensa: si la página no avanza (misma respuesta), se corta. Sin esto, una cuenta que
            # devuelve siempre la misma página se recorrería 30 veces por gasto.
            firma = tuple(sorted(str(c.get("id") or "") for c in filas))
            if firma in vistas:
                return None
            vistas.add(firma)
            pagina += 1
        return None

    @staticmethod
    def _contact_matches(contact: dict, cif: str, nombre: str) -> bool:
        if cif:
            for clave in ("vatnumber", "code", "cif", "nif", "vatNumber"):
                if norm_tax_id(contact.get(clave)) == cif:
                    return True
            return False
        if nombre:
            for clave in ("name", "tradeName"):
                if (contact.get(clave) or "").strip().casefold() == nombre:
                    return True
        return False

    def create_contact(self, payload: dict) -> str:
        """Crea el contacto y devuelve su id en Holded."""
        respuesta = self._request("POST", INVOICING + "/contacts", json_body=payload)
        cid = ""
        if isinstance(respuesta, dict):
            cid = str(respuesta.get("id") or respuesta.get("contactId") or "").strip()
        if not cid:
            raise HoldedError("Holded no ha devuelto el id del contacto creado.")
        return cid

    # ------------------------------------------------------------- Documentos

    def create_document(self, doc_type: str, payload: dict) -> dict:
        """Crea la compra/ticket. Devuelve `{id, number}`."""
        respuesta = self._request("POST", f"{INVOICING}/documents/{doc_type}", json_body=payload)
        doc_id = ""
        numero = ""
        if isinstance(respuesta, dict):
            doc_id = str(respuesta.get("id") or respuesta.get("documentId") or "").strip()
            numero = str(respuesta.get("invoiceNum") or respuesta.get("docNumber") or "").strip()
        if not doc_id:
            raise HoldedError("Holded no ha devuelto el id del documento creado.")
        return {"id": doc_id, "number": numero}

    def get_document(self, doc_type: str, doc_id: str) -> dict:
        payload = self._request("GET", f"{INVOICING}/documents/{doc_type}/{doc_id}")
        if isinstance(payload, list):
            return payload[0] if payload else {}
        return payload if isinstance(payload, dict) else {}

    def verify_document_total(self, doc_type: str, doc_id: str, expected_total) -> tuple[bool, Decimal]:
        """Relee el documento y compara su total con el nuestro (tolerancia de 2 céntimos).

        Es la red de seguridad del mapeo de impuestos: si Holded ha calculado otro total, se avisa.
        """
        doc = self.get_document(doc_type, doc_id)
        total = Decimal("0")
        for clave in ("total", "totalAmount", "amount", "grandTotal"):
            if doc.get(clave) not in (None, ""):
                total = money(doc.get(clave))
                break
        esperado = money(expected_total)
        return (abs(total - esperado) <= Decimal("0.02"), total)

    def document_is_accounted(self, doc_type: str, doc_id: str) -> tuple[bool, dict]:
        """¿Holded ya tiene el documento CONTABILIZADO (asiento hecho / aprobado)?

        Holded no expone un único campo para esto, así que se aceptan las señales que sí manda:
        `accounted`/`isAccounted` (o el estado numérico de documento ya aprobado). Si no dice nada,
        se responde False y NO se toca la etiqueta: preferimos no saberlo a inventarlo.
        """
        doc = self.get_document(doc_type, doc_id)
        for clave in ("accounted", "isAccounted", "accountingStatus", "accounted_at"):
            valor = doc.get(clave)
            if isinstance(valor, bool) and valor:
                return True, doc
            if isinstance(valor, (int, float)) and valor and clave != "accountingStatus":
                return True, doc
            if isinstance(valor, str) and valor.strip().lower() in {"1", "true", "accounted", "contabilizado"}:
                return True, doc
        return False, doc

    # ------------------------------------------------------------- Adjuntos

    def attach_file(self, doc_type: str, doc_id: str, *, filename: str, content: bytes,
                    mime: str | None = None) -> str:
        """Sube el fichero (factura o ticket) al documento de Holded.

        Prueba las rutas candidatas y GUARDA la que funciona (`endpoints['attach']`) para no volver a
        buscarla. Si ninguna vale, lanza HoldedError con el último error de Holded: el documento se
        queda creado y quien lo suba verá que el adjunto no ha entrado y por qué.
        """
        if not content:
            raise HoldedError("No hay fichero que adjuntar.")
        nombre = (filename or "documento.pdf").split("/")[-1][:120]
        tipo = (mime or "application/octet-stream").split(";")[0].strip() or "application/octet-stream"
        guardada = (self.endpoints or {}).get("attach") or ""
        candidatas = list(_ATTACH_CANDIDATES)
        if guardada:
            sufijo, campo = (guardada.split("|", 1) + ["file"])[:2]
            candidatas = [(sufijo, campo)] + [c for c in candidatas if c != (sufijo, campo)]
        ultimo = ""
        for sufijo, campo in candidatas:
            ruta = f"{INVOICING}/documents/{doc_type}/{doc_id}{sufijo}"
            try:
                self._request("POST", ruta, files={campo: (nombre, content, tipo)})
            except HoldedError as e:
                ultimo = str(e)
                continue
            clave = f"{sufijo}|{campo}"
            if guardada != clave:
                self.endpoints["attach"] = clave
                self.endpoints_changed = True
            return clave
        raise HoldedError("No se ha podido adjuntar el documento en Holded. %s" % ultimo)

    # --------------------------------------------------------- Formas de pago

    def payment_methods(self) -> list[dict]:
        """Catálogo de formas de pago de la cuenta (para casar «cómo se ha pagado»)."""
        guardada = (self.endpoints or {}).get("payment_methods") or ""
        rutas = ([guardada] if guardada else []) + [p for p in _PAYMENT_METHOD_PATHS if p != guardada]
        for ruta in rutas:
            try:
                payload = self._request("GET", INVOICING + ruta)
            except HoldedError:
                continue
            filas = payload.get("data") if isinstance(payload, dict) else payload
            if isinstance(filas, list):
                if guardada != ruta:
                    self.endpoints["payment_methods"] = ruta
                    self.endpoints_changed = True
                return [f for f in filas if isinstance(f, dict)]
        return []
