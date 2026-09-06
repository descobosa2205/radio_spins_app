#!/usr/bin/env python3
"""Prueba de regresión del motor de NOTAS DE PRENSA (`press_render.py`): el saneado, las bandas
del correo, la web y el texto. Si se toca el motor, tiene que seguir en verde.
Uso: python3 tools/check_press_render.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import press_render as pr

fallos = 0
def ok(txt, cond):
    global fallos
    print(("  OK  " if cond else "  ✗✗  ") + txt)
    if not cond:
        fallos += 1

# ── 1) Saneado ────────────────────────────────────────────────────────────────────────────────
limpio = pr.sanitize_html('<p style="text-align:center;color:red;position:absolute">Hola <b>mundo</b>'
                          '<script>alert(1)</script><a href="javascript:x()">mal</a>'
                          '<a href="https://33producciones.es" onclick="x()">bien</a>'
                          '<font color="#ff0000" face="Georgia">viejo</font></p>')
ok("quita el script", "alert" not in limpio)
ok("quita el javascript: del enlace", "javascript" not in limpio)
ok("quita el onclick", "onclick" not in limpio)
ok("conserva el enlace bueno", 'href="https://33producciones.es"' in limpio)
ok("filtra el position:absolute pero deja el color y la alineación",
   "position" not in limpio and "text-align:center" in limpio and "color:red" in limpio)
ok("<font> se traduce a span con estilo", '<span style="color:#ff0000;font-family:Georgia">viejo</span>' in limpio)
ok("un texto pelado se envuelve en <p>", pr.sanitize_html("hola").startswith("<p>"))
ok("texto plano", pr.plain_text_of_html("<p>Uno<br>Dos</p><p>Tres</p>") == "Uno\nDos\nTres")

# ── 2) Geometría ──────────────────────────────────────────────────────────────────────────────
design = {
    "width": 600,
    "bg": {"url": "https://x/fondo.jpg", "w": 1200, "h": 1800},        # 600×900 en el lienzo
    "blocks": [
        {"id": "t", "type": "title", "x": 40, "y": 300, "w": 520, "h": 70,
         "html": "<p><b>El titular</b> de la nota</p>", "style": {"size": 28, "align": "center"}},
        {"id": "x", "type": "text", "x": 40, "y": 400, "w": 250, "h": 200, "html": "<p>Columna izquierda</p>"},
        {"id": "y", "type": "text", "x": 320, "y": 420, "w": 240, "h": 100, "html": "<p>Columna derecha</p>"},
        {"id": "c", "type": "contact", "x": 40, "y": 950, "w": 520, "h": 90,
         "data": {"name": "Nuria Chillón", "email": "promocion@33producciones.es", "phone": "+34 915001883"}},
        {"id": "malo", "type": "iframe", "x": 0, "y": 0, "w": 10, "h": 10},
    ],
}
bl = pr.blocks_of(design)
ok("descarta un tipo de bloque desconocido", [b["id"] for b in bl] == ["t", "x", "y", "c"])
ok("el fondo mide 900 a 600 de ancho", pr.bg_height(design) == 900)
ok("el lienzo baja hasta el módulo de abajo (+ margen)", pr.canvas_height(design, bl) == 950 + 90 + 24)
ok("el titular es el texto del bloque «title»", pr.headline_of(design) == "El titular de la nota")
bandas = pr.compute_bands(bl)
ok("tres bandas: titular · las dos columnas (se solapan en vertical) · contacto",
   len(bandas) == 3 and [len(b["blocks"]) for b in bandas] == [1, 2, 1])
ok("la banda de las columnas va de 400 a 600", bandas[1]["y0"] == 400 and bandas[1]["y1"] == 600)

# ── 3) El correo ──────────────────────────────────────────────────────────────────────────────
mail = pr.render_email(design)
ok("es una tabla de 600", mail.startswith('<table role="presentation" width="600"'))
ok("el fondo se recorta por franjas (background-position negativo)", "background-position:0 -300px" in mail and "background-position:0 -400px" in mail)
ok("hay una fila de solo fondo antes del titular (0 → 300)", 'height="300"' in mail)
ok("las dos columnas van con su hueco a la izquierda", 'width="40"' in mail and 'width="30"' in mail)
ok("el texto sigue siendo texto", "Columna izquierda" in mail and "Columna derecha" in mail)
ok("el módulo de contacto lleva el mailto", 'href="mailto:promocion@33producciones.es"' in mail)
# Con imagen: 0→300 · la banda del titular · el hueco 370→400 · la de las columnas · el hueco 600→950
# (que enseña el fondo hasta 900 y blanco después: `no-repeat`). La banda del contacto (950) ya no
# lleva imagen: empieza más abajo que el fondo.
ok("las franjas llevan el fondo y la de debajo del fondo, no", mail.count("background-image") == 5)
ok("la banda que empieza más abajo que el fondo va en blanco", 'height:90px;vertical-align:top;background-color:#ffffff;">' in mail)
ok("nada de position:absolute en el correo", "position:absolute" not in mail)

# ── 4) La web ─────────────────────────────────────────────────────────────────────────────────
web = pr.render_web(design)
ok("la web coloca cada bloque en su sitio", 'left:40px;top:300px;width:520px' in web and 'left:320px;top:420px' in web)
ok("el lienzo lleva el fondo a 600 de ancho", "background-size:600px auto" in web)
ok("los enlaces de la web abren en otra pestaña",
   'target="_blank"' in pr.render_web({"bg": {}, "blocks": [{"type": "text", "x": 0, "y": 0, "w": 100, "h": 20,
                                                             "html": '<p><a href="https://a.b">x</a></p>'}]}))

# ── 5) Texto y PDF ────────────────────────────────────────────────────────────────────────────
txt = pr.plain_text(design)
ok("la versión de texto lleva los textos y el contacto", "El titular de la nota" in txt and "Nuria Chillón" in txt)
paras = pr.paragraphs_for_pdf({"type": "text", "html": '<p style="text-align:justify">Hola <b>ne</b> <a href="https://x">link</a></p><p>Otro</p>',
                               "style": {"size": 15}})
ok("dos párrafos para el PDF, el primero justificado y con el enlace subrayado",
   len(paras) == 2 and paras[0]["align"] == "justify" and "<a href=\"https://x\"" in paras[0]["markup"] and "<u>" in paras[0]["markup"])
ok("la tipografía se mapea a las del PDF", pr.rl_font_for("Georgia, serif", True) == "Times-Bold" and pr.rl_font_for("Arial") == "Helvetica")

print("\nFALLOS: %s" % fallos)
sys.exit(1 if fallos else 0)
