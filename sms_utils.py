# sms_utils.py
#
# Cliente de SMS. Mismo patrón que pleo_utils.py / holded_utils.py / cabify_utils.py: módulo
# aislado, SIN BD y SIN Flask, para que un fallo de la pasarela no toque el resto de la app.
#
# POR QUÉ SMS Y NO WHATSAPP
#   Un SMS se monta en un rato: se abre cuenta en una pasarela, se pega su clave y ya se manda texto
#   libre. WhatsApp exige verificar la empresa en Meta, un número dedicado y una PLANTILLA aprobada
#   por cada tipo de aviso. Lo que se pierde con el SMS: 160 caracteres (70 si lleva acentos), ni
#   imágenes ni PDF, y no se sabe si lo han leído. Por eso el patrón es SIEMPRE **frase corta +
#   enlace** a la página pública que ya tenemos de cada cosa.
#
# ⚠️ LOS ACENTOS PARTEN EL MENSAJE
#   Un SMS «normal» son 160 caracteres porque va en GSM-7. En cuanto aparece un carácter que no está
#   en ese alfabeto (á, í, ó, ú, ¿ no están; é, ñ, ü sí) el mensaje pasa a UCS-2 y se queda en **70**
#   caracteres por trozo, y cada trozo se COBRA. `segments()` lo calcula y `strip_accents()` deja el
#   texto en GSM-7 sin cambiar lo que dice.
#
# ⚠️ EL REMITENTE ALFANUMÉRICO NO ADMITE RESPUESTA
#   Con un remitente tipo «33PROD» el destinatario no puede contestar (en España es lo normal para
#   avisos). Si hace falta que respondan, la pasarela tiene que dar un número largo.
#
# PASARELAS SOPORTADAS (se elige una en Integraciones → SMS)
#   · LabsMobile (España, la más barata en volumen): Basic auth con el correo de la cuenta y el token
#     de API; POST JSON a /json/send. Responde SIEMPRE 200 con `code` en el cuerpo: «0» es OK y
#     cualquier otro valor es el error (mismo caso que Holded, ojo).
#   · Esendex (España): Basic auth y POST JSON a /v1.0/messagedispatcher con la referencia de cuenta.
#   · Twilio (internacional, más caro): Basic auth con Account SID y Auth Token; POST de formulario.
#
# NADA SE MANDA SIN CLAVE: sin credenciales el cliente no existe y la app se comporta como hasta
# ahora (igual que Holded o Pleo cuando están sin configurar).
from __future__ import annotations

import base64
import re
import unicodedata

import requests

TIMEOUT = 20

# ---------------------------------------------------------------------------------------------
# Pasarelas
# ---------------------------------------------------------------------------------------------
# (clave, nombre, qué es «usuario», qué es «clave», si necesita referencia de cuenta, ayuda)
PROVIDERS = [
    ("LABSMOBILE", "LabsMobile", "Correo de la cuenta", "Token de API", False,
     "labsmobile.com · España. En su panel: Configuración → API → Token. "
     "Suele ser la más barata por SMS en volumen."),
    ("ESENDEX", "Esendex", "Correo de la cuenta", "Contraseña", True,
     "esendex.es · España. Necesita además la «referencia de cuenta» (algo como EX0123456), "
     "que sale en su panel."),
    ("TWILIO", "Twilio", "Account SID", "Auth Token", False,
     "twilio.com · internacional. El remitente puede ser un número propio (+34…) o, si usas un "
     "Messaging Service, su SID (MG…) en la referencia de cuenta."),
]
PROVIDER_LABELS = {k: n for k, n, *_ in PROVIDERS}
PROVIDER_KEYS = {k for k, *_ in PROVIDERS}


class SmsError(RuntimeError):
    """Un fallo al mandar (o al comprobar la cuenta), con el texto que da la pasarela."""


# ---------------------------------------------------------------------------------------------
# Teléfonos
# ---------------------------------------------------------------------------------------------
# Prefijo del país por defecto. Un número escrito SIN prefijo se guarda con él (la casa es española).
DEFAULT_COUNTRY_CODE = "34"


def normalize_phone(value, default_cc: str = DEFAULT_COUNTRY_CODE) -> str | None:
    """Deja un teléfono en formato internacional («+34600111222») o None si no es creíble.

    Es el punto ÚNICO de «cómo se escribe un teléfono» en toda la app: lo usan el SMS de hoy,
    WhatsApp el día que se añada y el normalizador que se aplica al GUARDAR cualquier ficha.

    ⚠️ Un número sin prefijo NO se puede mandar: se le pone el del país por defecto.
    ⚠️ Un número que llega con el prefijo pero SIN el «+» (lo que manda Enterticket: «34600…»)
       tampoco vale para una pasarela: aquí se le pone.
    """
    crudo = str(value or "").strip()
    # ⚠️ Un teléfono que ha pasado por Excel llega como número: «638123456.0». Sin quitar los
    # decimales, el «0» se pega al número y sale otro teléfono (mismo caso que ya arreglamos en
    # la importación de terceros).
    crudo = re.sub(r"[.,]0+$", "", crudo)
    txt = re.sub(r"[^\d+]", "", crudo)
    if not txt:
        return None
    # Un «+» que no esté al principio no es un prefijo (una extensión, dos números pegados…).
    if "+" in txt[1:]:
        txt = txt[:1] + txt[1:].replace("+", "")
    if txt.startswith("00"):
        txt = "+" + txt[2:]                                  # «00» es la forma antigua del «+»
    if not txt.startswith("+"):
        digits = txt
        cc = str(default_cc or DEFAULT_COUNTRY_CODE)
        # ⚠️ En España un número son 9 dígitos: móvil (6 o 7) o FIJO (8 o 9). Antes solo se
        # reconocían los móviles, así que un fijo «912345678» salía como «+912345678» — un
        # prefijo de otro país y un número que no existe.
        if len(digits) == 9 and digits[0] in "6789":
            txt = "+" + cc + digits
        elif digits.startswith(cc) and len(digits) == len(cc) + 9:
            txt = "+" + digits                               # ya traía el prefijo, sin el «+»
        else:
            txt = "+" + digits
    cuerpo = txt[1:]
    if not cuerpo.isdigit() or not (8 <= len(cuerpo) <= 15):    # E.164: 15 dígitos como máximo
        return None
    return "+" + cuerpo


def same_phone(a, b) -> bool:
    """¿Son el mismo número? (comparando ya normalizados)."""
    na, nb = normalize_phone(a), normalize_phone(b)
    return bool(na and nb and na == nb)


# ---------------------------------------------------------------------------------------------
# El texto: cuántos SMS son y cómo no gastar el doble
# ---------------------------------------------------------------------------------------------
# Alfabeto GSM-7 (básico + extensión). Lo que no esté aquí obliga a UCS-2 → 70 caracteres por trozo.
_GSM7 = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXT = set("^{}\\[~]|€")        # ocupan DOS caracteres cada uno


def is_gsm7(text: str) -> bool:
    return all((c in _GSM7 or c in _GSM7_EXT) for c in (text or ""))


def _gsm7_len(text: str) -> int:
    return sum(2 if c in _GSM7_EXT else 1 for c in (text or ""))


def segments(text: str) -> int:
    """Cuántos SMS se van a cobrar por este texto."""
    text = text or ""
    if not text:
        return 0
    if is_gsm7(text):
        n = _gsm7_len(text)
        return 1 if n <= 160 else -(-n // 153)          # concatenado: 153 por trozo
    n = len(text)
    return 1 if n <= 70 else -(-n // 67)                # UCS-2: 70 / 67 por trozo


def strip_accents(text: str) -> str:
    """Quita tildes y demás para que el texto quepa en GSM-7 (160 en vez de 70) sin cambiar lo que
    dice. Lo que sí existe en GSM-7 (é, ñ, ü, ç…) se conserva."""
    salida = []
    for c in (text or ""):
        if c in _GSM7 or c in _GSM7_EXT:
            salida.append(c)
            continue
        base = "".join(x for x in unicodedata.normalize("NFD", c)
                       if unicodedata.category(x) != "Mn")
        salida.append(base if base and all(b in _GSM7 for b in base) else c)
    return "".join(salida)


def clean_text(text: str, *, avoid_accents: bool = True, max_segments: int = 0) -> str:
    """El texto tal como se va a mandar: sin saltos raros y, si se pide, sin acentos.

    `max_segments` recorta (con «…») para no gastar más trozos de los que se quieran pagar."""
    txt = re.sub(r"[ \t]+", " ", (text or "").replace("\r\n", "\n").replace("\r", "\n")).strip()
    if avoid_accents:
        txt = strip_accents(txt)
    if max_segments and max_segments > 0:
        limite = (160 if is_gsm7(txt) else 70) if max_segments == 1 else \
                 (153 if is_gsm7(txt) else 67) * max_segments
        if len(txt) > limite:
            txt = txt[:max(1, limite - 1)].rstrip() + "…"
            if avoid_accents:
                txt = txt.replace("…", "...")
                if len(txt) > limite:
                    txt = txt[:limite]
    return txt


def clean_api_key(value: str) -> str:
    """Quita lo invisible que se pega junto con una clave (espacios, comillas, «token:» delante).

    Mismo problema real que con Holded y Chartmetric: la clave se copia con basura alrededor y la
    pasarela contesta «credencial no válida»."""
    txt = (value or "").strip().strip('"').strip("'").strip()
    for prefijo in ("token:", "apikey:", "api-key:", "api key:", "authorization:", "bearer ",
                    "basic ", "password:", "auth token:", "authtoken:"):
        if txt.lower().startswith(prefijo):
            txt = txt[len(prefijo):].strip()
    return txt.strip().strip('"').strip("'").strip()


def sender_is_valid(sender: str) -> tuple[bool, str]:
    """¿Vale este remitente? Un número largo (+34…) o un alfanumérico de hasta 11 caracteres."""
    txt = (sender or "").strip()
    if not txt:
        return False, "Pon el remitente que quieres que se vea (por ejemplo «33PROD»)."
    if txt.startswith("+"):
        return (True, "") if normalize_phone(txt) else (False, "Ese número de remitente no es válido.")
    if len(txt) > 11:
        return False, "Un remitente de texto admite 11 caracteres como máximo (%d puestos)." % len(txt)
    if not re.fullmatch(r"[A-Za-z0-9 .\-]+", txt):
        return False, "El remitente solo admite letras, números, espacios, puntos y guiones."
    return True, ""


# ---------------------------------------------------------------------------------------------
# El cliente
# ---------------------------------------------------------------------------------------------
class SmsClient:
    """Manda SMS por la pasarela configurada. Un fallo se cuenta como `SmsError` con su motivo."""

    def __init__(self, provider: str, user: str, token: str, sender: str = "",
                 account_ref: str = "", *, timeout: int = TIMEOUT):
        self.provider = (provider or "").strip().upper()
        self.user = clean_api_key(user)
        self.token = clean_api_key(token)
        self.sender = (sender or "").strip()
        self.account_ref = clean_api_key(account_ref)
        self.timeout = timeout
        if self.provider not in PROVIDER_KEYS:
            raise SmsError("Pasarela de SMS desconocida: %s" % provider)

    # -- utilidades ---------------------------------------------------------------------------
    def _basic(self) -> str:
        return "Basic " + base64.b64encode(
            ("%s:%s" % (self.user, self.token)).encode("utf-8")).decode("ascii")

    def _post(self, url: str, *, json=None, data=None, headers=None):
        cab = {"Authorization": self._basic(), "Accept": "application/json"}
        cab.update(headers or {})
        try:
            return requests.post(url, json=json, data=data, headers=cab, timeout=self.timeout)
        except requests.RequestException as exc:
            raise SmsError("No se pudo hablar con la pasarela de SMS: %s" % exc) from exc

    # -- envío --------------------------------------------------------------------------------
    def send(self, to: str, text: str, *, sender: str = "") -> str:
        """Manda UN SMS y devuelve la referencia que dé la pasarela (o '' si no da ninguna).

        `sender` pisa el remitente de la cuenta para ESTE mensaje: un envío a los compradores de un
        concierto tiene que salir con el nombre de la empresa que lo promueve."""
        numero = normalize_phone(to)
        if not numero:
            raise SmsError("El teléfono «%s» no es válido (hace falta el prefijo, +34…)." % to)
        cuerpo = (text or "").strip()
        if not cuerpo:
            raise SmsError("No hay nada que mandar.")
        remitente = (sender or "").strip() or self.sender
        if self.provider == "LABSMOBILE":
            return self._send_labsmobile(numero, cuerpo, remitente)
        if self.provider == "ESENDEX":
            return self._send_esendex(numero, cuerpo, remitente)
        return self._send_twilio(numero, cuerpo, remitente)

    def _send_labsmobile(self, numero: str, texto: str, remitente: str = "") -> str:
        payload = {"message": texto, "recipient": [{"msisdn": numero.lstrip("+")}]}
        remitente = (remitente or self.sender or "").strip()
        if remitente:
            payload["tpoa"] = remitente
        r = self._post("https://api.labsmobile.com/json/send", json=payload,
                       headers={"Content-Type": "application/json", "Cache-Control": "no-cache"})
        # ⚠️ LabsMobile contesta SIEMPRE 200 y pone el resultado en el cuerpo: `code` «0» es OK.
        try:
            datos = r.json()
        except ValueError:
            datos = {}
        codigo = str(datos.get("code", "")).strip()
        # ⚠️ COMPROBADO CONTRA LA API REAL: con una credencial mala, /json/send contesta **HTTP 200**
        # con `{"code":"401","message":"Unauthorized"}`. Mirando solo el código HTTP, un SMS que no
        # ha salido parecería enviado (el mismo caso que Holded).
        if r.status_code in (401, 403) or codigo in ("401", "403"):
            raise SmsError("LabsMobile no acepta la credencial: revisa el correo de la cuenta y el "
                           "token de API (Configuración → API → Token, no la contraseña del panel).")
        if codigo and codigo != "0":
            raise SmsError("LabsMobile: %s (código %s)" % (datos.get("message") or "error", codigo))
        if r.status_code >= 400:
            raise SmsError("LabsMobile: HTTP %s %s" % (r.status_code, (r.text or "")[:180]))
        return str(datos.get("subid") or "")

    def _send_esendex(self, numero: str, texto: str, remitente: str = "") -> str:
        if not self.account_ref:
            raise SmsError("Esendex necesita la referencia de cuenta (algo como EX0123456).")
        payload = {"accountreference": self.account_ref,
                   "messages": [{"to": numero.lstrip("+"), "body": texto}]}
        remitente = (remitente or self.sender or "").strip()
        if remitente:
            payload["from"] = remitente
        r = self._post("https://api.esendex.com/v1.0/messagedispatcher", json=payload,
                       headers={"Content-Type": "application/json"})
        if r.status_code in (401, 403):
            raise SmsError("Esendex no acepta la credencial (HTTP %s)." % r.status_code)
        if r.status_code >= 400:
            raise SmsError("Esendex: HTTP %s %s" % (r.status_code, (r.text or "")[:180]))
        try:
            cab = ((r.json() or {}).get("batch") or {}).get("messageheaders") or []
            return str((cab[0] or {}).get("id") or "") if cab else ""
        except Exception:
            return ""

    def _send_twilio(self, numero: str, texto: str, remitente: str = "") -> str:
        if not self.user.startswith("AC"):
            raise SmsError("El Account SID de Twilio empieza por «AC»; revisa lo que has pegado.")
        datos = {"To": numero, "Body": texto}
        remitente = (remitente or self.sender or "").strip()
        if self.account_ref.startswith("MG"):
            datos["MessagingServiceSid"] = self.account_ref
        elif remitente:
            datos["From"] = remitente
        else:
            raise SmsError("Twilio necesita un remitente: un número propio (+34…) o el SID del "
                           "Messaging Service (MG…).")
        r = self._post("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json" % self.user,
                       data=datos, headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            cuerpo = r.json()
        except ValueError:
            cuerpo = {}
        if r.status_code >= 400:
            raise SmsError("Twilio: %s%s" % ((cuerpo.get("message") or "HTTP %s" % r.status_code),
                                             (" (código %s)" % cuerpo["code"]) if cuerpo.get("code") else ""))
        return str(cuerpo.get("sid") or "")

    # -- comprobación -------------------------------------------------------------------------
    def check(self) -> str:
        """Comprueba la cuenta SIN mandar nada. Devuelve una frase con lo que se sabe (el saldo, si
        la pasarela lo dice). Levanta `SmsError` con el motivo si la credencial no vale."""
        if self.provider == "LABSMOBILE":
            try:
                r = requests.get("https://api.labsmobile.com/json/balance",
                                 headers={"Authorization": self._basic(), "Accept": "application/json"},
                                 timeout=self.timeout)
            except requests.RequestException as exc:
                raise SmsError("No se pudo hablar con LabsMobile: %s" % exc) from exc
            if r.status_code in (401, 403):
                raise SmsError("LabsMobile no acepta la credencial: revisa el correo de la cuenta y "
                               "el token de API (no la contraseña del panel).")
            try:
                datos = r.json()
            except ValueError:
                datos = {}
            codigo = str(datos.get("code", "")).strip()
            if codigo and codigo != "0":
                raise SmsError("LabsMobile: %s (código %s)" % (datos.get("message") or "error", codigo))
            saldo = datos.get("credits", datos.get("balance"))
            return ("Conectada. Saldo: %s" % saldo) if saldo is not None else "Conectada."
        if self.provider == "ESENDEX":
            if not self.account_ref:
                raise SmsError("Esendex necesita la referencia de cuenta (algo como EX0123456).")
            try:
                r = requests.get("https://api.esendex.com/v1.0/accounts",
                                 headers={"Authorization": self._basic(), "Accept": "application/json"},
                                 timeout=self.timeout)
            except requests.RequestException as exc:
                raise SmsError("No se pudo hablar con Esendex: %s" % exc) from exc
            if r.status_code in (401, 403):
                raise SmsError("Esendex no acepta la credencial (HTTP %s)." % r.status_code)
            if r.status_code >= 400:
                raise SmsError("Esendex: HTTP %s %s" % (r.status_code, (r.text or "")[:160]))
            return "Conectada."
        # Twilio: leer la propia cuenta es la forma barata de validar SID + token.
        if not self.user.startswith("AC"):
            raise SmsError("El Account SID de Twilio empieza por «AC»; revisa lo que has pegado.")
        try:
            r = requests.get("https://api.twilio.com/2010-04-01/Accounts/%s.json" % self.user,
                             headers={"Authorization": self._basic(), "Accept": "application/json"},
                             timeout=self.timeout)
        except requests.RequestException as exc:
            raise SmsError("No se pudo hablar con Twilio: %s" % exc) from exc
        if r.status_code in (401, 403):
            raise SmsError("Twilio no acepta la credencial: revisa el Account SID y el Auth Token.")
        if r.status_code >= 400:
            raise SmsError("Twilio: HTTP %s %s" % (r.status_code, (r.text or "")[:160]))
        try:
            nombre = (r.json() or {}).get("friendly_name") or ""
        except ValueError:
            nombre = ""
        return ("Conectada (%s)." % nombre) if nombre else "Conectada."
