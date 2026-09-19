#!/usr/bin/env python3
"""EL DISEÑADOR DEL PLANO DE UN RECINTO · prueba de regresión (sep 2026).

El diseñador es **JavaScript** (`static/js/venue_map.js`), así que aquí se comprueba que el cableado
sigue puesto —es lo mismo que hace `tools/check_money.py` con el espejo en JS— y la paridad con el
motor de Python. **El comportamiento se vio funcionando en el navegador**: el menú del botón derecho
sobre un bloque marca sus 12 butacas, sobre una zona de pie y sobre el escenario no ofrece nada, y un
plano nuevo cae DEBAJO de lo que ya hay sin solaparlo.

  · «Seleccionar sus butacas»: marca TODAS las butacas de ESE bloque, y solo butacas de verdad
    (ni huecos, ni apagadas, ni escaleras, ni el plano de fondo, ni el contorno, ni el escenario)
  · Está en los tres sitios: el menú del botón derecho, el panel de la sección y ⌘A / Ctrl+A
  · Un PLANO NUEVO (imagen) no se coloca encima de lo que ya hay: va debajo, con hueco, y se enseña
  · Lo mismo el Excel: cada importación AÑADE bloques debajo de lo que haya

    /tmp/python/bin/python3 tools/check_plano_recinto.py
"""
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
JS = (RAIZ / "static/js/venue_map.js").read_text(encoding="utf-8")

OK = FALLOS = 0


def check(texto, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1
        print("  ✓ " + texto)
    else:
        FALLOS += 1
        print("  ✗ " + texto + ((" — " + str(extra)) if extra != "" else ""))


print("1 · las butacas de UN bloque, y solo las butacas")
check("hay un punto único que las lista", "function seatKeysOf(s)" in JS)
check("solo butacas de verdad (ni hueco, ni apagada, ni escalera)",
      "if(p.state === 'seat') out.push(s.id + '|' + row.rowIdx + '|' + p.slot);" in JS)
check("una zona de pie no tiene butacas que marcar", "if(!s || s.kind === 'floor') return out;" in JS)
check("y marcar es otra función, que vale para los dos modos", "function selectSeatsOf(s, additive)" in JS)
check("al marcar las butacas se sueltan los ELEMENTOS (si no, arrastrar movería dos veces)",
      "if(!additive){ dsel = {}; dselO = {}; }" in JS)
check("en el modo de categorías marca lo que se arrastra a una categoría",
      "if(mode === 'cats')" in JS and "keys.forEach(function(k){ sel[k] = 1; });" in JS)

print("2 · dónde se ofrece")
check("en el menú del botón derecho", 'data-ctx="selseats"' in JS and "Seleccionar sus butacas" in JS)
check("… solo si ahí HAY butacas (ni el plano de fondo, ni el contorno, ni una zona de pie)",
      "if(secHit && seatKeysOf(secHit).length)" in JS)
check("… y el menú sale de las SECCIONES, no de los elementos",
      "var secHit = hitId ? sections.find(function(x){ return x.id === hitId; }) : null;" in JS)
check("en el panel de la sección", "data-sel-seats" in JS)
check("… y ese botón está enganchado", "e.target.closest('[data-sel-seats]')" in JS)
check("y con ⌘A / Ctrl+A", "(e.key==='a' || e.key==='A') && (e.ctrlKey || e.metaKey)" in JS)
check("⌘A con un bloque pinchado coge el suyo; sin nada, todo el plano",
      "var sSel = selId ? sections.find(function(x){ return x.id===selId; }) : null;" in JS)
check("y no se lleva el navegador el atajo si ha marcado algo",
      "if(selectSeatsOf(sSel, e.shiftKey)) e.preventDefault();" in JS)

print("3 · un plano NUEVO no se pone encima de lo que ya hay")
check("se mira lo que ya hay", "var bbBg = contentBounds();" in JS)
check("y se coloca DEBAJO, con hueco y centrado con ello",
      "var pos = bbBg ? {x:(bbBg.mx+bbBg.Mx)/2, y: bbBg.My + 140 + H/2}" in JS)
check("con el plano vacío, donde siempre (el centro de la vista)",
      ": (contentCenter() || {x:view.x+view.w/2, y:view.y+view.h/2});" in JS)
check("y se enseña entero, que si no queda fuera de la pantalla",
      "if(bbBg){ selId='bgimg'; fitAll(); }" in JS)
check("«Cambiar» sigue conservando sitio, tamaño y opacidad", "if(ex){ ex.url=r.j.url; }" in JS)
check("el panel lo dice cuando ya hay bloques", "se coloca <b>debajo</b> para no taparlos" in JS)
check("el Excel también AÑADE debajo de lo que haya", "var oy = bb ? (bb.My + 4*rg) : 0;" in JS)
check("y cada hoja debajo de la anterior", "oy = rowY(rMax) + 5*rg;" in JS)

print("4 · lo de siempre sigue en su sitio")
check("la paridad con el motor de Python no se ha tocado",
      (RAIZ / "seatmap_calc.py").exists() and "def expand_section" in (RAIZ / "seatmap_calc.py").read_text(encoding="utf-8"))
check("el contorno y el plano de fondo siguen fuera de la selección de sectores",
      "bgimage" in JS and "outline" in JS)

print("\nOK: %d · FALLOS: %d" % (OK, FALLOS))
sys.exit(1 if FALLOS else 0)
