"""Ficheros de REMESA para el banco (transferencias SEPA).

Motor PURO: no toca base de datos ni Flask, solo recibe datos y devuelve el XML. Así se puede
probar solo y no arrastra el resto de la app.

Formato: **SEPA XML ISO 20022 `pain.001.001.03`**, que es lo que en España se conoce como
**Cuaderno 34.14 (AEB)** y lo que admiten por su banca electrónica Banco Santander, CaixaBank y
Cajamar. Las diferencias entre ellos son de detalle (longitud de los identificadores, si aceptan el
BIC vacío, la codificación del fichero), y eso es lo que recoge `BANK_PROFILES`.

⚠️ Antes de usarlo en serio conviene mandar UNA remesa pequeña por cada banco: cada entidad valida
el fichero a su manera y es la única forma de saber que lo traga sin discutir.
"""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from xml.etree import ElementTree as ET

# Caracteres que admite el juego de caracteres SEPA (el resto se transforma o se cae).
_SEPA_OK = re.compile(r"[^A-Za-z0-9/\-?:().,'+ ]")

BANK_PROFILES = {
    # slug: (etiqueta, longitud máx. de identificadores, ¿pide BIC?, ¿nombre de fichero .xml?)
    "SANTANDER": {"label": "Banco Santander", "max_id": 35, "require_bic": False},
    "CAIXABANK": {"label": "CaixaBank", "max_id": 35, "require_bic": False},
    "CAJAMAR": {"label": "Cajamar", "max_id": 35, "require_bic": False},
    "SEPA_PAIN001": {"label": "SEPA (estándar)", "max_id": 35, "require_bic": False},
}
DEFAULT_PROFILE = "SEPA_PAIN001"


def bank_profile(slug: str | None) -> dict:
    key = (slug or "").strip().upper().replace(" ", "_")
    return BANK_PROFILES.get(key) or BANK_PROFILES[DEFAULT_PROFILE]


def sepa_text(value, *, limit: int = 140) -> str:
    """Texto apto para el fichero: sin acentos ni caracteres raros y recortado."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    # «Peña» -> «Pena»: los bancos rechazan lo que no esté en el juego SEPA.
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    raw = _SEPA_OK.sub(" ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:limit]


def normalize_iban(value) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def iban_is_valid(value) -> bool:
    """Validación real (mod 97), no solo la pinta."""
    iban = normalize_iban(value)
    if len(iban) < 15 or len(iban) > 34 or not iban[:2].isalpha():
        return False
    movido = iban[4:] + iban[:4]
    total = ""
    for ch in movido:
        total += str(ord(ch) - 55) if ch.isalpha() else ch
    try:
        return int(total) % 97 == 1
    except ValueError:
        return False


def bic_is_valid(value) -> bool:
    bic = re.sub(r"\s+", "", str(value or "")).upper()
    return bool(re.fullmatch(r"[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?", bic))


def money(value) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def check_payment(payment: dict, *, require_bic: bool = False) -> list[str]:
    """Qué le falta a un pago para poder ir en la remesa. Lista vacía = está listo."""
    faltan = []
    if not sepa_text(payment.get("name"), limit=70):
        faltan.append("name")
    if not iban_is_valid(payment.get("iban")):
        faltan.append("iban")
    if require_bic and not bic_is_valid(payment.get("bic")):
        faltan.append("bic")
    if money(payment.get("amount")) <= 0:
        faltan.append("amount")
    return faltan


def _el(parent, tag, text=None):
    node = ET.SubElement(parent, tag)
    if text is not None:
        node.text = str(text)
    return node


def build_credit_transfer_xml(
    *,
    debtor_name: str,
    debtor_iban: str,
    debtor_bic: str | None,
    debtor_tax_id: str | None,
    payments: list[dict],
    message_id: str,
    execution_date: str,
    created_at: str,
    bank_slug: str | None = None,
) -> bytes:
    """Devuelve el XML `pain.001.001.03` de una remesa de transferencias.

    `payments`: [{name, iban, bic, amount, concept, end_to_end}]. `execution_date` y `created_at` en
    ISO (aaaa-mm-dd y aaaa-mm-ddThh:mm:ss). Las fechas y el identificador se pasan de fuera a
    propósito: así el motor es determinista y se puede probar."""
    perfil = bank_profile(bank_slug)
    max_id = int(perfil.get("max_id") or 35)
    validos = [p for p in payments if not check_payment(p, require_bic=bool(perfil.get("require_bic")))]
    if not validos:
        raise ValueError("No hay ningún pago con los datos completos para generar la remesa.")

    total = sum((money(p.get("amount")) for p in validos), Decimal("0.00"))
    ns = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
    ET.register_namespace("", ns)
    root = ET.Element(f"{{{ns}}}Document")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    cstmr = _el(root, "CstmrCdtTrfInitn")

    # --- Cabecera ---
    hdr = _el(cstmr, "GrpHdr")
    _el(hdr, "MsgId", sepa_text(message_id, limit=max_id))
    _el(hdr, "CreDtTm", created_at)
    _el(hdr, "NbOfTxs", str(len(validos)))
    _el(hdr, "CtrlSum", f"{total:.2f}")
    initg = _el(hdr, "InitgPty")
    _el(initg, "Nm", sepa_text(debtor_name, limit=70))
    if debtor_tax_id:
        othr = _el(_el(_el(initg, "Id"), "OrgId"), "Othr")
        _el(othr, "Id", sepa_text(debtor_tax_id, limit=max_id))

    # --- Bloque de pago (uno solo: misma cuenta y misma fecha) ---
    pmt = _el(cstmr, "PmtInf")
    _el(pmt, "PmtInfId", sepa_text(message_id, limit=max_id))
    _el(pmt, "PmtMtd", "TRF")
    _el(pmt, "BtchBookg", "true")
    _el(pmt, "NbOfTxs", str(len(validos)))
    _el(pmt, "CtrlSum", f"{total:.2f}")
    tp = _el(pmt, "PmtTpInf")
    _el(_el(tp, "SvcLvl"), "Cd", "SEPA")
    _el(pmt, "ReqdExctnDt", execution_date)
    dbtr = _el(pmt, "Dbtr")
    _el(dbtr, "Nm", sepa_text(debtor_name, limit=70))
    if debtor_tax_id:
        othr = _el(_el(_el(dbtr, "Id"), "OrgId"), "Othr")
        _el(othr, "Id", sepa_text(debtor_tax_id, limit=max_id))
    _el(_el(_el(pmt, "DbtrAcct"), "Id"), "IBAN", normalize_iban(debtor_iban))
    dbtr_agt = _el(pmt, "DbtrAgt")
    fin = _el(dbtr_agt, "FinInstnId")
    if bic_is_valid(debtor_bic):
        _el(fin, "BIC", re.sub(r"\s+", "", str(debtor_bic).upper()))
    else:
        # Sin BIC, SEPA admite «no facilitado» (los tres bancos lo aceptan con IBAN español).
        _el(_el(fin, "Othr"), "Id", "NOTPROVIDED")
    _el(pmt, "ChrgBr", "SLEV")

    # --- Un apunte por pago ---
    for idx, pago in enumerate(validos, start=1):
        tx = _el(pmt, "CdtTrfTxInf")
        pid = _el(tx, "PmtId")
        _el(pid, "EndToEndId", sepa_text(pago.get("end_to_end") or f"{message_id}-{idx}", limit=max_id) or "NOTPROVIDED")
        amt = _el(tx, "Amt")
        inst = _el(amt, "InstdAmt", f"{money(pago.get('amount')):.2f}")
        inst.set("Ccy", "EUR")
        if bic_is_valid(pago.get("bic")):
            _el(_el(_el(tx, "CdtrAgt"), "FinInstnId"), "BIC", re.sub(r"\s+", "", str(pago["bic"]).upper()))
        cdtr = _el(tx, "Cdtr")
        _el(cdtr, "Nm", sepa_text(pago.get("name"), limit=70))
        _el(_el(_el(tx, "CdtrAcct"), "Id"), "IBAN", normalize_iban(pago.get("iban")))
        concepto = sepa_text(pago.get("concept"), limit=140)
        if concepto:
            _el(_el(tx, "RmtInf"), "Ustrd", concepto)

    xml = ET.tostring(root, encoding="UTF-8", xml_declaration=True)
    return xml


def batch_totals(payments: list[dict], *, bank_slug: str | None = None) -> dict:
    """Resumen para enseñarlo antes de exportar: cuántos van, cuántos les falta algo y el total."""
    perfil = bank_profile(bank_slug)
    listos, incompletos = [], []
    for pago in payments:
        faltan = check_payment(pago, require_bic=bool(perfil.get("require_bic")))
        (incompletos if faltan else listos).append({**pago, "missing": faltan})
    total = sum((money(p.get("amount")) for p in listos), Decimal("0.00"))
    return {"ready": listos, "incomplete": incompletos, "total": total, "profile": perfil}
