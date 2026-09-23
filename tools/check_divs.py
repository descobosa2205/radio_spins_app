#!/usr/bin/env python3
"""NINGUNA PANTALLA REVIENTA NI SIRVE UN HTML DESCUADRADO · comprobación automática.

Dos cosas en una pasada, porque las dos se ven pidiendo todas las pantallas:
  · que ninguna dé un **500** (para quien la abre, eso es la página de «cerrado por mantenimiento»);
  · y que el HTML que sirve **cuadre de `<div>`**.

UN `</div>` DE MÁS CIERRA EL CONTENEDOR ANTES DE TIEMPO.

El navegador no da ningún error: «arregla» el HTML a su manera y lo que viene debajo se queda
FUERA del contenedor. Ha pasado tres veces y cada una costó un rato encontrarla:
  · en el asistente de actividad, los pasos 8 a 11 quedaban fuera del cuerpo del modal;
  · en Inicio, «Ordenar mi inicio» solo veía los dos primeros módulos;
  · en la ficha de una actividad, todo lo que hay debajo de los cachés quedaba FUERA de
    `#concert-general-zone`, así que al guardar una sección por AJAX no se refrescaba.

⚠️ Contar `<div` y `</div>` en la PLANTILLA da falsos positivos: es legítimo abrir un div en una
rama `{% if %}` y cerrarlo en otra. Lo que hay que comprobar es el **HTML SERVIDO**, que es lo que
ve el navegador — y eso es lo que hace esto: pinta las pantallas con la app real (como dirección) y
avisa de la que no cuadra, diciendo **qué `</div>` sobra y en qué línea**.

    /tmp/python/bin/python3 tools/check_divs.py            # todas las pantallas
    /tmp/python/bin/python3 tools/check_divs.py /conciertos /ventas

⚠️ Solo hace GET y necesita la BD DE PRUEBA del entorno de /tmp que describe CLAUDE.md.
"""
import os
import pathlib
import re
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
os.chdir(RAIZ)

tmp = pathlib.Path(tempfile.gettempdir())
for _n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / _n).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "dev-local")

import app as A            # noqa: E402
import models as M         # noqa: E402

A.app.config["WTF_CSRF_ENABLED"] = False

TAG = re.compile(r"<div\b[^>]*?>|</div\s*>", re.S)
SALTAR = ("/logout", "/salir", "/static/", "/cron/", "/descargar", "/pdf", "/xlsx", "/export")
# ⚠️ Dentro de un <script> hay `</div>` que son TEXTO (`html += '</div>'`), y en un comentario
# también: contarlos daría un falso positivo. Se borran conservando los saltos de línea, para que
# el número de línea que se dice siga siendo el del HTML servido.
FUERA = re.compile(r"<script\b.*?</script\s*>|<style\b.*?</style\s*>|<!--.*?-->", re.S | re.I)


def _limpia(html):
    return FUERA.sub(lambda m: "\n" * m.group(0).count("\n"), html)


def desbalance(html):
    """(línea del `</div>` que sobra, o 0) y (líneas de los `<div>` sin cerrar)."""
    html = _limpia(html)
    pila = []
    sobra = 0
    for m in TAG.finditer(html):
        linea = html[:m.start()].count("\n") + 1
        if m.group(0).startswith("</"):
            if pila:
                pila.pop()
            elif not sobra:
                sobra = linea
        else:
            pila.append(linea)
    return sobra, [html[:0].count("\n") for _ in ()] or pila


# ⚠️⚠️ UN `<a>` DENTRO DE OTRO `<a>` ES HTML INVÁLIDO Y EL NAVEGADOR PARTE EL ÁRBOL: lo de dentro
# **se sale** del enlace exterior. No da ningún error, así que el síntoma es un control que deja de
# funcionar sin motivo aparente — pasó con el menú de ESTADO de una actividad, que en el listado
# (donde la fila entera es un `<a>`) quedaba FUERA del desplegable y no se abría («se pone a pensar
# y no hace nada»). La solución de la casa: dentro de una fila-enlace, los items van en `<button>`.
A_TAG = re.compile(r"<(/?)a\b[^>]*>", re.I)


def enlaces_anidados(html):
    """Las líneas de los `<a>` que están DENTRO de otro `<a>` (vacío si no hay ninguno)."""
    html = _limpia(html)
    dentro, malos = 0, []
    for m in A_TAG.finditer(html):
        if m.group(1):
            dentro = max(0, dentro - 1)
            continue
        if dentro > 0:
            malos.append(html[:m.start()].count("\n") + 1)
        dentro += 1
    return malos


def contexto(html, linea, antes=8, despues=2):
    ls = html.split("\n")
    return "\n".join("   %6d %s %s" % (n, ">>" if n == linea else "  ", ls[n - 1][:130])
                     for n in range(max(1, linea - antes), min(len(ls), linea + despues) + 1))


def pantallas(session_db):
    """Las pantallas de la app: las que no llevan parámetros y las fichas con un id de verdad."""
    fichas = {
        "cid": M.Concert, "song_id": M.Song, "album_id": M.Album, "pid": M.Promoter,
        "aid": M.Artist, "artist_id": M.Artist, "vid": M.Venue, "bag_id": M.WorkflowBag,
        # Comunicaciones corporativas (la ficha de una comunicación y los contactos de una lista).
        "invite_id": M.CorporateInvite, "list_id": M.CorporateGuestList,
    }
    primeros = {}
    for arg, modelo in fichas.items():
        try:
            fila = session_db.query(modelo).first()
            if fila is not None:
                primeros[arg] = str(fila.id)
        except Exception:
            continue
    urls = []
    for rule in A.app.url_map.iter_rules():
        ep = rule.endpoint or ""
        if "GET" not in (rule.methods or set()):
            continue
        if ep.startswith("public_") or ep in ("static", "landing", "admin_login", "admin_logout"):
            continue
        if any(x in rule.rule for x in SALTAR):
            continue
        args = set(rule.arguments or ())
        if not args:
            urls.append(rule.rule)
            continue
        if args <= set(primeros):
            try:
                urls.append(A.app.url_map.bind("localhost").build(ep, {a: primeros[a] for a in args}))
            except Exception:
                continue
    return sorted(set(urls))


def main():
    filtro = [a.strip() for a in sys.argv[1:]]
    s = M.SessionLocal()
    u = s.query(M.User).filter(M.User.email == "permisos@test.es").first()
    if u is None:
        u = M.User(email="permisos@test.es", password_hash="x", role=10)
        s.add(u); s.flush()
        s.add(M.UserProfile(user_id=u.id, nick="Prueba"))
    u.role = 10
    s.commit()
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["user_id"] = str(u.id); ses["role"] = 10; ses["nick"] = "Prueba"

    urls = pantallas(s)
    if filtro:
        urls = [x for x in urls if any(f in x for f in filtro)]
    malas = 0
    vistas = 0
    revientan = []
    # ⚠️⚠️ HAY QUE ENTRAR EN CADA PESTAÑA: una ficha abre por su primera pestaña, y los dos `</div>`
    # de más que ha habido estaban en OTRAS (los cachés de «Datos» y el de «Producción»). Se siguen
    # los enlaces `?tab=`/`?section=` que la propia pantalla pinta, que es la lista de verdad.
    vistos = set(urls)
    for url in list(urls):
        try:
            r = c.get(url, follow_redirects=True)
        except Exception:
            continue
        if r.status_code != 200 or "html" not in (r.mimetype or ""):
            continue
        for href in re.findall(r'href="([^"]+)"', r.get_data(as_text=True)):
            if not href.startswith("/") or ("tab=" not in href and "section=" not in href):
                continue
            if any(x in href for x in SALTAR) or href in vistos:
                continue
            vistos.add(href)
            urls.append(href)
    for url in urls:
        try:
            r = c.get(url, follow_redirects=True)
        except Exception:
            continue
        if r.status_code >= 500 and "/healthz" not in url:
            # ⚠️ `/healthz` da 503 en local a propósito (la marca de esquema): no es un fallo.
            revientan.append((url, r.status_code))
        if r.status_code != 200 or "html" not in (r.mimetype or ""):
            continue
        html = r.get_data(as_text=True)
        vistas += 1
        sobra, abiertos = desbalance(html)
        anidados = enlaces_anidados(html)
        if anidados:
            malas += 1
            print("\n❌ %s" % url)
            print("   hay %d <a> DENTRO de otro <a> (líneas %s): el navegador los saca fuera y lo "
                  "que haya ahí deja de funcionar. Dentro de una fila-enlace, usa <button>."
                  % (len(anidados), ", ".join(str(x) for x in anidados[:6])))
            print(contexto(html, anidados[0]))
        if sobra or abiertos:
            if not anidados:
                malas += 1
                print("\n❌ %s" % url)
            if sobra:
                print("   sobra un </div> (el contenedor ya estaba cerrado) en la línea %d:" % sobra)
                print(contexto(html, sobra))
            if abiertos:
                print("   se quedan %d <div> sin cerrar (líneas %s)"
                      % (len(abiertos), ", ".join(str(x) for x in abiertos[:6])))
    print("\npantallas revisadas: %d" % vistas)
    if revientan:
        print("⚠️  PANTALLAS QUE REVIENTAN (500): %d" % len(revientan))
        for url, st in revientan[:20]:
            print("   %s  %s" % (st, url))
    if malas or revientan:
        print("⚠️  PANTALLAS CON EL HTML DESCUADRADO: %d" % malas)
        return 1
    print("OK · ninguna pantalla revienta y todas cuadran de <div>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
