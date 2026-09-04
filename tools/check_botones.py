#!/usr/bin/env python3
"""BOTONES QUE NO HACEN NADA · comprobación automática.

Nos ha pasado varias veces: un cambio deja un botón que se ve pero al pincharlo no pasa nada, y
nadie se entera hasta que alguien lo usa. Esto lo busca solo, en las PLANTILLAS (no hace falta ni
base de datos ni navegador), y da un informe. Tres clases de fallo, que son las que hemos tenido:

  1) DESTINO MUERTO — `data-bs-target="#x"`, `data-edit-toggle="#x"`, `data-view`,
     `data-inline-target` o `href="#x"` que apuntan a un id que no existe en esa pantalla.
     (Así salió el botón de «configura la forma de pago», que apuntaba a un formulario que en un
     concierto VENDIDO ni siquiera se pintaba.)

  2) HANDLER QUE NO SOBREVIVE AL REPINTADO — un `document.querySelectorAll(...).addEventListener`
     que engancha elementos que viven DENTRO de una zona `data-inline-zone`. Esa zona se reemplaza
     por AJAX al guardar, y con listeners pegados a los nodos los botones nuevos quedan MUERTOS.
     (Así se murió «Subir factura» del plan de facturación.)

  3) FUNCIÓN QUE NO EXISTE — un `onclick="loQueSea(...)"` cuya función no está definida en ningún
     `.js` de `static/js` ni en un `<script>` de la propia plantilla (contando sus includes).
     (Así estuvo «Compartir LC» sin hacer nada.)

Uso:   python3 tools/check_botones.py            # todas las plantillas
       python3 tools/check_botones.py concert_detail.html song_detail.html
Sale con código 1 si encuentra algo, para poder usarlo en CI.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TPL = RAIZ / "templates"
JS = RAIZ / "static" / "js"

# Atributos cuyo valor «#algo» tiene que existir como id en la misma pantalla.
ATRIBUTOS_DESTINO = ("data-bs-target", "data-edit-toggle", "data-edit-focus", "data-edit-cancel",
                     "data-view", "data-inline-target", "data-art-photo-target")

# Lo que NO es un destino de verdad.
HREF_IGNORAR = {"", "#", "#!"}


def incluidos(texto: str, vistos: set[str] | None = None) -> str:
    """El texto de una plantilla CON sus includes pegados (un modal suele vivir en un parcial)."""
    vistos = vistos if vistos is not None else set()
    def _pega(m):
        nombre = m.group(1)
        if nombre in vistos:
            return ""
        vistos.add(nombre)
        f = TPL / nombre
        if not f.exists():
            return ""
        return incluidos(f.read_text(encoding="utf-8"), vistos)
    return re.sub(r"""\{%-?\s*include\s+['"]([^'"]+)['"]""", _pega, texto)


# Palabras de JS que no son una función (un `onclick="if (…)"` es una sentencia, no una llamada).
PALABRAS_JS = {"if", "for", "while", "return", "switch", "typeof", "new", "delete", "void",
               "confirm", "alert", "this", "event", "function", "try", "catch"}


def ids_de(texto: str) -> set[str]:
    """Los ids de la pantalla. ⚠️ Muchos los pone una expresión Jinja —`id="{{ x|default('y') }}"`,
    o una macro a la que se le pasa el id—, así que además de los literales se dan por existentes
    las cadenas entre comillas que haya en el fichero: si un destino no aparece NI ASÍ, no existe.
    Un poco laxo a propósito: una herramienta con falsos positivos no la usa nadie."""
    ids = set(re.findall(r'\bid="([^"{}]+)"', texto))
    if re.search(r'\bid="\{\{', texto) or "{% call" in texto or "{% macro" in texto:
        ids |= set(re.findall(r"""['"]([A-Za-z][\w:-]{2,60})['"]""", texto))
    return ids


def marca_de(selector: str) -> str:
    """De un selector, el trozo que se puede buscar en el HTML: `.x` → `class="…x`, `[data-x]` →
    `data-x`, `input[name="y"]` → `name="y"`. Si no se puede, cadena vacía (y no se reporta)."""
    sel = selector.strip()
    m = re.match(r"^\[([\w-]+)", sel)
    if m:
        return m.group(1)
    m = re.search(r"\[name=['\"]?([\w\[\]-]+)", sel)
    if m:
        return 'name="%s"' % m.group(1)
    m = re.match(r"^\.([\w-]+)$", sel)
    if m:
        return m.group(1)
    m = re.match(r"^#([\w-]+)$", sel)
    if m:
        return 'id="%s"' % m.group(1)
    return ""


def zonas_inline(texto: str) -> list[tuple[int, int]]:
    """El rango de cada zona `data-inline-zone` (de su `<div` a su `</div>`), contando divs. Lo que
    esté ahí dentro se REEMPLAZA por AJAX al guardar, así que un listener pegado a esos nodos muere."""
    rangos = []
    for m in re.finditer(r"data-inline-zone", texto):
        ini = texto.rfind("<div", 0, m.start())
        if ini < 0:
            continue
        prof, i = 0, ini
        while i < len(texto):
            if texto.startswith("<div", i):
                prof += 1
                i += 4
                continue
            if texto.startswith("</div>", i):
                prof -= 1
                i += 6
                if prof == 0:
                    rangos.append((ini, i))
                    break
                continue
            i += 1
        else:
            continue
    return rangos


def revisa(fichero: Path, js_global: str, ids_del_proyecto: set[str]) -> list[str]:
    crudo = fichero.read_text(encoding="utf-8")
    texto = incluidos(crudo)
    ids = ids_de(texto)
    fallos: list[str] = []

    # ---- 1) destinos muertos -------------------------------------------------------------
    def _destino(attr: str, destino: str) -> None:
        if destino in ids:
            return
        # ⚠️ Si el id existe en OTRA plantilla es un AVISO, no un fallo: el modal puede pintarse ahí
        # con un `{% if %}` que aquí no se puede evaluar. Lo que NO existe en ninguna parte es un
        # botón muerto seguro.
        if destino in ids_del_proyecto:
            fallos.append(f"AVISO · {attr}=\"#{destino}\" no está en esta pantalla "
                          f"(sí en otra: comprueba que se incluye aquí)")
        else:
            fallos.append(f"destino muerto · {attr}=\"#{destino}\"")

    for attr in ATRIBUTOS_DESTINO:
        for m in re.finditer(attr + r'="#([^"{}]+)"', texto):
            _destino(attr, m.group(1))
    for m in re.finditer(r'href="#([^"{}]+)"', texto):
        if m.group(1) not in HREF_IGNORAR:
            _destino("href", m.group(1))

    # ---- 2) handlers que no sobreviven a un repintado -------------------------------------
    for zona_ini, zona_fin in zonas_inline(texto):
        dentro = texto[zona_ini:zona_fin]
        for m in re.finditer(
                r"document\.querySelectorAll\(\s*['\"]([^'\"]+)['\"]\s*\)[\s\S]{0,240}?addEventListener",
                texto):
            sel = m.group(1)
            marca = marca_de(sel)
            if not marca or marca not in dentro:
                continue
            fallos.append(
                f"handler que muere al repintar · querySelectorAll('{sel}') engancha algo que está "
                f"DENTRO de una zona `data-inline-zone` (esa zona se reemplaza por AJAX: usa "
                f"delegación en `document`)")

    # ---- 3) funciones de onclick que no existen -------------------------------------------
    propio = "\n".join(re.findall(r"<script[^>]*>([\s\S]*?)</script>", texto))
    disponible = js_global + "\n" + propio
    for m in re.finditer(r'on(?:click|change|submit)="\s*([A-Za-z_$][\w$]*)\s*\(', texto):
        fn = m.group(1)
        if fn in PALABRAS_JS:
            continue
        if re.search(r"\b(function\s+%s\b|%s\s*=\s*function|%s\s*:\s*function|window\.%s\s*=)"
                     % (fn, fn, fn, fn), disponible):
            continue
        fallos.append(f"función inexistente · on…=\"{fn}(…)\"")

    return sorted(set(fallos))


# ══════════════════════════════════════════════════════════════════════════════════════════════════
#  RUTAS DUPLICADAS — dos `@app.post("/lo/mismo")` y gana LA PRIMERA registrada
#
#  ⚠️⚠️ Es un fallo que no da NINGÚN error: la app arranca, la ruta responde… y ejecuta el endpoint
#  equivocado. Pasó de verdad (sep 2026): un `/marketing/<id>/archivar` nuevo no se ejecutaba nunca
#  porque esa regla ya existía, así que la comprobación de «archívala solo si está cerrada» no se
#  aplicaba y la campaña se archivaba sin justificar el gasto.
#  ⚠️ Varias rutas para el MISMO endpoint (alias, como `/marketing/…` y `/promocion/…` apilados
#  sobre la misma función) son legítimas y no cuentan.
# ══════════════════════════════════════════════════════════════════════════════════════════════════

RUTA_RE = re.compile(r"""^@app\.(?:route|get|post|put|delete)\(\s*['"]([^'"]+)['"]([^)]*)\)""", re.M)
DEF_RE = re.compile(r"^def\s+([A-Za-z_][A-Za-z0-9_]*)", re.M)


def rutas_duplicadas(fuente: str) -> list[str]:
    """Reglas de ruta repetidas en funciones DISTINTAS."""
    lineas = fuente.split("\n")
    porRuta: dict[tuple, list[str]] = {}
    i = 0
    while i < len(lineas):
        m = RUTA_RE.match(lineas[i])
        if not m:
            i += 1
            continue
        # Todos los decoradores seguidos (varias rutas sobre la misma función son alias legítimos).
        reglas, j = [], i
        while j < len(lineas):
            mm = RUTA_RE.match(lineas[j])
            if mm:
                metodos = mm.group(2)
                verbo = ("post" if ".post(" in lineas[j] else
                         "get" if ".get(" in lineas[j] else
                         "put" if ".put(" in lineas[j] else
                         "delete" if ".delete(" in lineas[j] else "route")
                reglas.append((mm.group(1), verbo))
                j += 1
                continue
            if lineas[j].startswith("@") or not lineas[j].strip():
                j += 1
                continue
            break
        # La función a la que pertenecen
        fn = ""
        while j < len(lineas):
            d = DEF_RE.match(lineas[j])
            if d:
                fn = d.group(1)
                break
            if lineas[j].strip() and not lineas[j].startswith("@"):
                break
            j += 1
        for r in reglas:
            porRuta.setdefault(r, [])
            if fn and fn not in porRuta[r]:
                porRuta[r].append(fn)
        i = j + 1
    fallos = []
    for (regla, verbo), fns in sorted(porRuta.items()):
        if len(fns) > 1:
            fallos.append("ruta duplicada %s %s → gana «%s», el resto es código muerto (%s)"
                          % (verbo.upper(), regla, fns[0], ", ".join(fns[1:])))
    return fallos


# ══════════════════════════════════════════════════════════════════════════════════════════════════
#  UNA RUTA PEGADA A LA FUNCIÓN EQUIVOCADA
#
#  ⚠️⚠️ Si entre `@app.post(...)` y su `def` se cuela otra función, **la ruta apunta a esa otra** y
#  la de verdad se queda sin registrar. No da ningún error al arrancar: la pantalla responde 500 al
#  usarla, o peor, hace otra cosa. Pasó de verdad (sep 2026) al insertar dos ayudantes justo encima
#  de `def fotos_upload`.
#  Se detecta cuando el decorador declara `endpoint="X"` y la función siguiente NO se llama X, o
#  cuando la función es privada (empieza por «_»), que nunca es una vista.
# ══════════════════════════════════════════════════════════════════════════════════════════════════

EP_RE = re.compile(r"""endpoint\s*=\s*['"]([^'"]+)['"]""")


def rutas_mal_pegadas(fuente: str) -> list[str]:
    lineas = fuente.split("\n")
    fallos = []
    for i, l in enumerate(lineas):
        if not RUTA_RE.match(l):
            continue
        if i and RUTA_RE.match(lineas[i - 1]):
            continue                       # alias apilados: solo se mira el primero del bloque
        # El endpoint declarado en cualquiera de los decoradores del bloque.
        ep, j = "", i
        while j < len(lineas) and (RUTA_RE.match(lineas[j]) or lineas[j].startswith("@")
                                   or not lineas[j].strip()):
            m = EP_RE.search(lineas[j])
            if m and not ep:
                ep = m.group(1)
            j += 1
        d = DEF_RE.match(lineas[j]) if j < len(lineas) else None
        if not d:
            fallos.append("la ruta de la línea %d no tiene ninguna función debajo" % (i + 1))
            continue
        fn = d.group(1)
        # ⚠️ Que el endpoint se llame DISTINTO que la función es legítimo y deliberado (para eso
        # está `endpoint=`), así que eso NO se avisa. Lo que nunca es correcto es que la ruta caiga
        # en una función PRIVADA: ahí se ha colado algo entre el decorador y su vista.
        if fn.startswith("_"):
            fallos.append("la ruta de la línea %d apunta a «%s», que es una función privada: "
                          "se ha colado algo entre el decorador y su vista" % (i + 1, fn))
    return fallos


def main() -> int:
    js_global = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in sorted(JS.glob("*.js")))
    # Los ids de TODO el proyecto: sirven para distinguir «no existe» de «no está en esta pantalla».
    ids_proyecto: set[str] = set()
    for f in TPL.glob("*.html"):
        ids_proyecto |= ids_de(f.read_text(encoding="utf-8"))
    # ⚠️ Los PARCIALES (`_x.html`) no se revisan sueltos: su modal suele vivir en la página que los
    # incluye. Se revisan al pegarlos en ella.
    objetivo = sys.argv[1:] or [p.name for p in sorted(TPL.glob("*.html")) if not p.name.startswith("_")]
    total = graves = 0
    for nombre in objetivo:
        f = TPL / nombre
        if not f.exists():
            print(f"  (no existe {nombre})")
            continue
        fallos = revisa(f, js_global, ids_proyecto)
        if fallos:
            total += len(fallos)
            graves += sum(1 for x in fallos if not x.startswith("AVISO"))
            print(f"\n{nombre}")
            for x in fallos:
                print(f"   · {x}")
    # RUTAS DUPLICADAS de app.py: no dan ningún error y ejecutan el endpoint equivocado.
    app_py = RAIZ / "app.py"
    fuente_py = app_py.read_text(encoding="utf-8") if app_py.exists() else ""
    dup = (rutas_duplicadas(fuente_py) + rutas_mal_pegadas(fuente_py)) if fuente_py else []
    if dup:
        print("\napp.py")
        for x in dup:
            print(f"   · {x}")
        graves += len(dup)
        total += len(dup)
    print(f"\nfallos: {graves}   ·   avisos: {max(total - graves, 0)}")
    return 1 if graves else 0


if __name__ == "__main__":
    raise SystemExit(main())
