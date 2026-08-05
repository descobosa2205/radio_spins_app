"""Comprobación de la LECTURA de facturas (`invoice_read.py`).

Se ejecuta a mano o en CI:  python3 tools/check_invoice_read.py

Los casos son facturas REALES de tres proveedores distintos, con las tres formas de fastidiar la
lectura que nos hemos encontrado:

  A) Factura maquetada como TABLA: los rótulos van en un renglón y los valores en el de debajo, así
     que «1003» es el número de factura y «1001» el de cliente, y al extraer el texto plano salen
     desordenados. (Se reconstruye el PDF con las coordenadas de cada trozo.)
  B) Factura con RETENCIÓN: «Total» es base + IVA y lo que se paga es el «Total a pagar». Y los
     importes de cuatro cifras sin punto de miles (1140,97) se leían truncados a «114».
  C) Factura con los datos PEGADOS («Fecha: 28/7/2026N.º de factura: 8») y los rótulos con las
     letras separadas («TOT AL»).

⚠️ Si se toca `invoice_read.py`, esto tiene que seguir saliendo en verde.
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import invoice_read as ir  # noqa: E402


# --- A) Factura-tabla: se genera un PDF con la misma maqueta (rótulos arriba, valores debajo) -----
def pdf_tabla() -> bytes | None:
    try:
        from io import BytesIO
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import A4
    except Exception:
        return None
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 9)
    c.drawString(31, 700, "Factura")
    c.drawString(31, 660, "Número de NIF / CIF del cliente: B82165283")
    # Cabecera de la tabla de datos y, debajo, sus valores en las MISMAS columnas.
    for x, t in ((31, "Número de cliente"), (136, "Número de factura"), (244, "Página"),
                 (354, "Fecha de factura"), (459, "Vencimiento")):
        c.drawString(x, 630, t)
    for x, t in ((31, "1001"), (136, "1003"), (244, "1 / 1"),
                 (354, "28/7/2026"), (459, "27/8/2026")):
        c.drawString(x, 615, t)
    # Bloque de totales (rótulo a la izquierda, importe a la derecha).
    for i, (rot, imp) in enumerate((("Importe", "697,69 €"), ("IVA 21%", "146,52 €"),
                                    ("Importe total", "844,21 €"))):
        c.drawString(355, 560 - i * 15, rot)
        c.drawString(480, 560 - i * 15, imp)
    c.drawString(31, 500, "Liquidación de Royalties por distribución de canciones")
    c.showPage()
    c.save()
    return buf.getvalue()


# --- B) y C): el TEXTO tal como lo extrae pypdf de las facturas reales ---------------------------
TEXTO_B = """Daniel Ruiz Gómez
Factura n.°: 2026/23
Fecha: 28/07/2026
Para: PIES COMPAÑÍA DISCOGRÁFICA, SL
CIF: B82165283
Avenida de Castilla, 2
28830 San Fernando de Henares
Factura
Calle Carretera de Camposoto, 22D
11100
San Fernando (Cádiz)
danimusik@icloud.com
680996087
NIF: 48902938-Q
Descripción Cantidad Tarifa I.V.A Importe
ROYAL TIES
Periodo: S1 2026 (Ene-Jun) (01/01/2026 - 30/06/2026)
1 1140,97 € 21 % 1140,97 €
Información de pago
ES85 2100 7027 5702 0022 4414
Subtotal 1140,97 €
I.V.A 21 % 239,60 €
Total 1380,57 €
IRPF 15 % 171,15 €
PAGADA 0,00 €
Total a pagar1209,42 €

1 / 1"""

TEXTO_C = """FACTURA
Fecha: 28/7/2026N.º de factura: 8
Pol Gutiérrez Molina Facturar a:Pies Compañía Discográfica S.Lc/Bagés 117 Avda de Castilla 2Sant Quirze del Vallés, 08192 38830 San Fernando de Henares(+34) 727796156 B8216528.25369339V
DESCRIPCIÓN  IMPORTE
ROYALTIES 1 2026 6.123,39 €
SUBTOTAL  6.123,39 €
Método de pago: Transferencia bancaria a ES53 2100 1188 6401 0039 9890IVA 21% 1.285,91 €
IRPF 15% 918,51 €
TOT AL  6.490,79 €"""


def esperado(**kw):
    return kw


CASOS = [
    ("A · factura maquetada como tabla", None, pdf_tabla, esperado(
        invoice_number="1003", issue_date="2026-07-28", due_date="2026-08-27",
        amount_net="697.69", amount_vat="146.52", retention_amount=None, amount_gross="844.21")),
    ("B · con retención y total a pagar", TEXTO_B, None, esperado(
        invoice_number="2026/23", issue_date="2026-07-28",
        amount_net="1140.97", amount_vat="239.60", retention_amount="171.15",
        amount_gross="1209.42", vat_pct=21.0, retention_pct=15.0)),
    ("C · datos pegados y «TOT AL»", TEXTO_C, None, esperado(
        invoice_number="8", issue_date="2026-07-28",
        amount_net="6123.39", amount_vat="1285.91", retention_amount="918.51",
        amount_gross="6490.79")),
]


def iguales(mio, esp) -> bool:
    if esp is None:
        return mio in (None, "", 0)
    if mio is None:
        return False
    if isinstance(esp, float):
        try:
            return abs(float(mio) - esp) < 0.01
        except (TypeError, ValueError):
            return False
    try:
        return Decimal(str(mio)) == Decimal(str(esp))
    except Exception:
        return str(mio) == str(esp)


def main() -> int:
    fallos = 0
    for titulo, texto, hacer_pdf, esp in CASOS:
        data = hacer_pdf() if hacer_pdf else None
        if hacer_pdf and data is None:
            print("SALTADO %s (no hay reportlab para generar el PDF de prueba)" % titulo)
            continue
        got = ir.read_fields(text=(texto or ""), data=data)
        print("=== %s" % titulo)
        for campo, valor in esp.items():
            mio = got.get(campo)
            ok = iguales(mio, valor)
            print("   %s %-18s %r (esperado %r)" % ("OK  " if ok else "FALLA", campo, mio, valor))
            if not ok:
                fallos += 1
    print("\n%s" % ("TODO OK" if not fallos else "%d COMPROBACIONES FALLIDAS" % fallos))
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
