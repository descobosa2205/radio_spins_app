"""Comprobación de la LECTURA de liquidaciones de royalties (`royalty_statement_read.py`).

Se ejecuta a mano o en CI:  .venv/bin/python tools/check_royalty_statement_read.py

Los datos son INVENTADOS (nunca de un proveedor real) pero con las formas con las que llegan las
liquidaciones y con las que se fastidia la lectura:

  1) PDF maquetado como TABLA (ISRC · Título · Artista · Unidades · Importe) con importes españoles
     y una fila de TOTAL, que NO es una línea.
  2) CSV con la CABECERA DESPLAZADA (dos filas de título delante, una con «Periodo: S1 2026», que
     es justo la que se tomaría por cabecera si no se exigen dos columnas reconocidas), rótulos
     como «I.S.R.C.» y los decimales que mete Excel («1234.5»).
  3) CSV A LA INGLESA («1,234.56») con columnas «Net» y «Total»: gana «Net».
  4) Excel (.xlsx) con un UPC de 13 dígitos: el código es un código de barras, no un ISRC.
  5) PDF SIN NINGUNA ESTRUCTURA (un párrafo): cero líneas y un aviso, sin reventar.
  6) CSV SIN CABECERA reconocible: barrido por posición.
  7) Una línea identificada SOLO POR EL TÍTULO (sin código).
  8) El reconocimiento del PERIODO, variante a variante.

⚠️ Si se toca `royalty_statement_read.py`, esto tiene que seguir saliendo en verde.
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import royalty_statement_read as rsr  # noqa: E402


# ── 1) PDF maquetado como tabla ──────────────────────────────────────────────────────────────────
def pdf_tabla():
    """El PDF de prueba, dibujado con la misma maqueta que una liquidación de verdad."""
    try:
        from io import BytesIO

        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception:
        return None
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 9)
    c.drawString(40, 780, "Compañía Ejemplo de Fonogramas, S.L.")
    c.drawString(40, 766, "Liquidación de royalties · S1 2026 (enero-junio)")
    for x, t in ((40, "ISRC"), (150, "Título"), (310, "Artista"), (430, "Unidades"),
                 (500, "Importe")):
        c.drawString(x, 730, t)
    lineas = (
        ("ES-A2A-25-00001", "Nombre del tema uno", "Artista Uno", "1.234", "1.140,97"),
        ("ES-A2A-25-00002", "Nombre del tema dos", "Artista Dos", "812", "697,69"),
        ("ES-A2A-25-00003", "Nombre del tema tres", "Artista Uno", "2.045", "1.661,34"),
    )
    for i, (isrc, titulo, artista, unidades, importe) in enumerate(lineas):
        y = 710 - i * 16
        for x, t in ((40, isrc), (150, titulo), (310, artista), (430, unidades), (500, importe)):
            c.drawString(x, y, t)
    c.drawString(430, 650, "TOTAL")
    c.drawString(500, 650, "3.500,00")
    c.showPage()
    c.save()
    return buf.getvalue()


def caso_pdf_tabla():
    data = pdf_tabla()
    if data is None:
        return None
    got = rsr.read_statement(data, "liquidacion.pdf")
    filas = got["rows"]
    codigos = [r["code"] for r in filas]
    importes = [r["amount"] for r in filas]
    return [
        ("kind", got["kind"], "PDF"),
        ("nº de líneas", len(filas), 3),
        ("códigos en seco", codigos, ["ESA2A2500001", "ESA2A2500002", "ESA2A2500003"]),
        ("tipo de código", [r["code_kind"] for r in filas], ["ISRC"] * 3),
        ("importes", importes, [Decimal("1140.97"), Decimal("697.69"), Decimal("1661.34")]),
        ("títulos", [r["title"] for r in filas],
         ["Nombre del tema uno", "Nombre del tema dos", "Nombre del tema tres"]),
        ("artistas", [r["artist"] for r in filas], ["Artista Uno", "Artista Dos", "Artista Uno"]),
        ("total", got["total"], Decimal("3500.00")),
        ("el TOTAL no es una línea", Decimal("3500.00") in importes, False),
        ("periodo", got["period"], "2026-S1"),
    ]


# ── 2) CSV con la cabecera desplazada ────────────────────────────────────────────────────────────
CSV_DESPLAZADO = """Liquidación de royalties
Periodo: S1 2026;Compañía Ejemplo de Fonogramas, S.L.
I.S.R.C.;Título;Artista;Unidades;Importe neto
ES-A2A-25-00002;Tema Dos;Artista Dos;1234;1234.5
ES-A2A-25-00004;Tema Cuatro;Artista Dos;98;76,40
TOTAL;;;;1.310,90
"""


def caso_csv_desplazado():
    got = rsr.read_statement(CSV_DESPLAZADO.encode("utf-8"), "liquidacion.csv")
    filas = got["rows"]
    return [
        ("kind", got["kind"], "SHEET"),
        ("nº de líneas", len(filas), 2),
        ("código", [r["code"] for r in filas], ["ESA2A2500002", "ESA2A2500004"]),
        ("título", [r["title"] for r in filas], ["Tema Dos", "Tema Cuatro"]),
        ("artista", [r["artist"] for r in filas], ["Artista Dos", "Artista Dos"]),
        ("importe con decimal de Excel", filas[0]["amount"] if filas else None, Decimal("1234.5")),
        ("importe español", filas[1]["amount"] if len(filas) > 1 else None, Decimal("76.40")),
        ("total", got["total"], Decimal("1310.90")),
        ("periodo", got["period"], "2026-S1"),
        ("sin aviso de cabecera deducida",
         any("por posición" in w for w in got["warnings"]), False),
    ]


# ── 3) CSV a la inglesa, con «Net» y «Total» ─────────────────────────────────────────────────────
CSV_INGLES = """ISRC,Title,Artist,Streams,Net,Total
US-4RG-21-00007,Some Song,Some Artist,120450,"1,234.56","2,000.00"
US-4RG-21-00008,Another Song,Some Artist,4210,"56.10","90.00"
Total royalties,,,,"1,290.66","2,090.00"
"""


def caso_csv_ingles():
    got = rsr.read_statement(CSV_INGLES.encode("utf-8"), "statement.csv")
    filas = got["rows"]
    return [
        ("nº de líneas", len(filas), 2),
        ("código", [r["code"] for r in filas], ["US4RG2100007", "US4RG2100008"]),
        ("gana «Net», no «Total»", [r["amount"] for r in filas],
         [Decimal("1234.56"), Decimal("56.10")]),
        ("total (de la columna Net)", got["total"], Decimal("1290.66")),
        ("título", [r["title"] for r in filas], ["Some Song", "Another Song"]),
    ]


# ── 4) Excel con un UPC de 13 dígitos ────────────────────────────────────────────────────────────
def xlsx_upc():
    try:
        from io import BytesIO

        import openpyxl
    except Exception:
        return None
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Liquidación de royalties 2026-07", None, None])
    ws.append(["UPC", "Título del álbum", "Importe"])
    ws.append(["8412345678901", "Álbum de Ejemplo", 250.5])
    ws.append(["8412345678902", "Otro Álbum", 1140.97])
    ws.append(["Importe total", None, 1391.47])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def caso_xlsx_upc():
    data = xlsx_upc()
    if data is None:
        return None
    got = rsr.read_statement(data, "liquidacion.xlsx")
    filas = got["rows"]
    return [
        ("nº de líneas", len(filas), 2),
        ("tipo de código", [r["code_kind"] for r in filas], ["BARCODE", "BARCODE"]),
        ("código", [r["code"] for r in filas], ["8412345678901", "8412345678902"]),
        ("importes", [r["amount"] for r in filas], [Decimal("250.5"), Decimal("1140.97")]),
        ("título", [r["title"] for r in filas], ["Álbum de Ejemplo", "Otro Álbum"]),
        ("total", got["total"], Decimal("1391.47")),
        ("periodo (del título del fichero)", got["period"], "2026-S2"),
    ]


# ── 5) PDF sin ninguna estructura ────────────────────────────────────────────────────────────────
def pdf_parrafo():
    try:
        from io import BytesIO

        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception:
        return None
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 11)
    texto = ("Estimados señores: les remitimos el detalle de la liquidación correspondiente al "
             "periodo indicado. Quedamos a su disposición para cualquier aclaración que precisen "
             "sobre el contenido de la presente comunicación.")
    y = 760
    for trozo in [texto[i:i + 90] for i in range(0, len(texto), 90)]:
        c.drawString(50, y, trozo)
        y -= 16
    c.showPage()
    c.save()
    return buf.getvalue()


def caso_pdf_parrafo():
    data = pdf_parrafo()
    if data is None:
        return None
    got = rsr.read_statement(data, "carta.pdf")
    return [
        ("nº de líneas", len(got["rows"]), 0),
        ("hay avisos", bool(got["warnings"]), True),
        ("lo dice claro", any("ninguna línea" in w for w in got["warnings"]), True),
    ]


# ── 6) CSV sin cabecera reconocible: barrido por posición ────────────────────────────────────────
CSV_SIN_CABECERA = """ES-A2A-25-00005;Tema Cinco;120;45,10
ES-A2A-25-00006;Tema Seis;80;12,00
"""


def caso_csv_sin_cabecera():
    got = rsr.read_statement(CSV_SIN_CABECERA.encode("utf-8"), "detalle.csv")
    filas = got["rows"]
    return [
        ("nº de líneas", len(filas), 2),
        ("código", [r["code"] for r in filas], ["ESA2A2500005", "ESA2A2500006"]),
        ("importe (la última celda que lo parece)", [r["amount"] for r in filas],
         [Decimal("45.10"), Decimal("12.00")]),
        ("título (el texto más largo)", [r["title"] for r in filas], ["Tema Cinco", "Tema Seis"]),
        ("avisa de que las columnas se han deducido",
         any("por posición" in w for w in got["warnings"]), True),
    ]


# ── 7) Línea identificada solo por el título ─────────────────────────────────────────────────────
# ⚠️ El título lleva la palabra «ISRC» a propósito: con dos palabras de rótulo el renglón se tomaba
# por una cabecera y la línea desaparecía (bug real).
CSV_SIN_CODIGO = """Título;Importe
Tema sin ISRC;45,10
"""


def caso_sin_codigo():
    got = rsr.read_statement(CSV_SIN_CODIGO.encode("utf-8"), "liquidacion.csv")
    filas = got["rows"]
    return [
        ("nº de líneas", len(filas), 1),
        ("sin código", [r["code"] for r in filas], [""]),
        ("título", [r["title"] for r in filas], ["Tema sin ISRC"]),
        ("importe", [r["amount"] for r in filas], [Decimal("45.10")]),
        ("avisa de que no tiene código",
         any("sin código" in w for w in got["warnings"]), True),
    ]


# ── 8) Periodo ───────────────────────────────────────────────────────────────────────────────────
PERIODOS = (
    ("S1 2026", "2026-S1"),
    ("S2/2026", "2026-S2"),
    ("2026-S1", "2026-S1"),
    ("1er semestre 2026", "2026-S1"),
    ("primer semestre de 2026", "2026-S1"),
    ("Segundo semestre de 2026", "2026-S2"),
    ("2026 H1", "2026-S1"),
    ("H2 2026", "2026-S2"),
    ("enero-junio 2026", "2026-S1"),
    ("julio-diciembre 2026", "2026-S2"),
    ("Periodo: 2026-01", "2026-S1"),
    ("T3 2026", "2026-S2"),
    ("Liquidación de royalties", ""),
    ("", ""),
)


def caso_periodos():
    return [("parse_period(%r)" % texto, rsr.parse_period(texto), esperado)
            for texto, esperado in PERIODOS]


# ── Comparación e informe ────────────────────────────────────────────────────────────────────────
def iguales(mio, esperado) -> bool:
    """Compara sin sorpresas: los importes como `Decimal` (nunca float) y las listas elemento a
    elemento."""
    if isinstance(esperado, list):
        if not isinstance(mio, list) or len(mio) != len(esperado):
            return False
        return all(iguales(a, b) for a, b in zip(mio, esperado))
    if isinstance(esperado, bool):
        return bool(mio) is esperado
    if esperado is None:
        return mio in (None, "")
    if isinstance(esperado, Decimal):
        if mio is None:
            return False
        try:
            return Decimal(str(mio)) == esperado
        except Exception:
            return False
    return mio == esperado


CASOS = (
    ("1 · PDF maquetado como tabla", caso_pdf_tabla, "no hay reportlab para generar el PDF"),
    ("2 · CSV con la cabecera desplazada", caso_csv_desplazado, ""),
    ("3 · CSV a la inglesa (Net gana a Total)", caso_csv_ingles, ""),
    ("4 · Excel con UPC de 13 dígitos", caso_xlsx_upc, "no hay openpyxl"),
    ("5 · PDF sin estructura (un párrafo)", caso_pdf_parrafo, "no hay reportlab"),
    ("6 · CSV sin cabecera (por posición)", caso_csv_sin_cabecera, ""),
    ("7 · Línea identificada solo por el título", caso_sin_codigo, ""),
    ("8 · Reconocimiento del periodo", caso_periodos, ""),
)


def main() -> int:
    fallos = 0
    for titulo, funcion, motivo_salto in CASOS:
        try:
            comprobaciones = funcion()
        except Exception as exc:                       # una prueba que revienta ES un fallo
            print("=== %s" % titulo)
            print("   FALLA  ha reventado: %s: %s" % (exc.__class__.__name__, exc))
            fallos += 1
            continue
        if comprobaciones is None:
            print("SALTADO %s (%s)" % (titulo, motivo_salto or "falta una dependencia"))
            continue
        print("=== %s" % titulo)
        for etiqueta, mio, esperado in comprobaciones:
            ok = iguales(mio, esperado)
            print("   %s %-42s %r%s"
                  % ("OK  " if ok else "FALLA", etiqueta, mio,
                     "" if ok else " (esperado %r)" % (esperado,)))
            if not ok:
                fallos += 1
    print("\n%s" % ("TODO OK" if not fallos else "%d COMPROBACIONES FALLIDAS" % fallos))
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
