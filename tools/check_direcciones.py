#!/usr/bin/env python3
"""AUTOCOMPLETAR UNA DIRECCIÓN · prueba de regresión (sep 2026).

Comprueba el buscador de direcciones de la casa (`geo_utils` + `/api/direcciones` +
`static/js/address_autocomplete.js`):

  1. que una dirección de ESPAÑA se sigue encontrando y con su provincia (la del código postal);
  2. ⚠️⚠️ que una dirección de FUERA (México, Portugal) **también se encuentra** — el `bbox` de
     Photon FILTRA, no sesga, y dándolo siempre no salía ni un resultado de fuera aunque la ficha
     dijera «México» (bug real, sep 2026, lo vio Dani creando un recinto);
  3. que diciendo el país solo salen direcciones DE ESE PAÍS (lo de otro sitio solo confunde);
  4. que el país llega al servidor desde el navegador y entra en la clave de la caché;
  5. que la tabla de provincias ESPAÑOLAS no se aplica a un código postal de fuera (un CP mexicano
     también tiene cinco dígitos y ponía «Badajoz» en Ciudad de México);
  6. y que las 52 provincias siguen ESPEJADAS entre `geo_utils.py` y el JS.

    /tmp/python/bin/python3 tools/check_direcciones.py

⚠️ SALE A LA RED (Photon, el mismo proveedor que usa la app). Si no responde, esas comprobaciones
se saltan diciéndolo: una caída del proveedor no es un fallo nuestro.
⚠️ Necesita el entorno de /tmp que describe CLAUDE.md para la parte del endpoint (la del motor y la
del espejo funcionan sin BD).
"""
import os
import pathlib
import re
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))

OK, KO, SALTADAS = [], [], []


def comprueba(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  OK    " if cond else "  FALLA ") + nombre + ((" · " + str(extra)[:220]) if (extra and not cond) else ""))


def salta(nombre, motivo):
    SALTADAS.append(nombre)
    print("  ~     " + nombre + " · no se ha podido probar (" + str(motivo)[:120] + ")")


import geo_utils as G  # noqa: E402

print("1 · EL PAÍS que escribe una persona → su código")
comprueba("«México» es MX", G.country_code("México") == "MX")
comprueba("«Mexico» (sin tilde) también", G.country_code("Mexico") == "MX")
comprueba("«España» es ES", G.country_code("España") == "ES")
comprueba("un país que no está en la tabla no revienta", G.country_code("Kiribati") == "")
comprueba("y vacío tampoco", G.country_code("") == "" and G.country_code(None) == "")

print("\n2 · LAS SUGERENCIAS (contra el proveedor de verdad)")
try:
    es = G.search_addresses("Calle Gran Via 1 Salamanca", country="España", limit=5)
except Exception as exc:                 # el proveedor es de fuera: si falla, no es cosa nuestra
    es = None
    salta("una dirección de España se encuentra", exc)
if es is not None:
    comprueba("una dirección de España se encuentra", bool(es), es)
    comprueba("y viene con su provincia (la del código postal)",
              any(f["province"] and f["country_code"] == "ES" for f in es), es[:2])

for consulta, pais, cc in (("Avenida Insurgentes Sur 300", "México", "MX"),
                           ("Rua Augusta 100", "Portugal", "PT")):
    try:
        filas = G.search_addresses(consulta, country=pais, limit=5)
    except Exception as exc:
        salta("una dirección de %s se encuentra" % pais, exc)
        continue
    comprueba("una dirección de %s se encuentra (antes NO salía ninguna)" % pais, bool(filas), filas)
    if filas:
        comprueba("y todas son de %s (lo de otro sitio solo confunde)" % pais,
                  all(f["country_code"] == cc for f in filas),
                  [(f["country_code"], f["label"][:40]) for f in filas])
        comprueba("con su país escrito, para que se vea de dónde es",
                  all((f["country"] or "").strip() for f in filas), filas[0])
        comprueba("y su provincia NO sale de la tabla española",
                  all(f["province"] not in ("Badajoz", "Álava") for f in filas),
                  [(f["postal_code"], f["province"]) for f in filas])

print("\n3 · EL ENDPOINT (el país viaja con la búsqueda)")
try:
    tmp = pathlib.Path(tempfile.gettempdir())
    for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
        (tmp / n).write_text("x")
    os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
    os.environ.setdefault("SUPABASE_URL", "")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
    os.environ.setdefault("FLASK_SECRET_KEY", "dir")
    os.environ.setdefault("PGCONNECT_TIMEOUT", "5")
    import app as A
    A.app.config["WTF_CSRF_ENABLED"] = False
    cli = A.app.test_client()
    r = cli.get("/api/direcciones?q=Avenida+Insurgentes+Sur+300&country=M%C3%A9xico")
    js = r.get_json() or {}
    filas = js.get("results") or []
    comprueba("el buscador devuelve la dirección de México", bool(filas), js)
    if filas:
        comprueba("con sus piezas ya separadas (calle, CP, municipio, provincia, país)",
                  all(filas[0].get(k) for k in ("address", "postal_code", "city", "province", "country")),
                  filas[0])
        comprueba("y la provincia es la de allí, no una de las 52 de aquí",
                  filas[0]["province"] not in G.PROVINCE_BY_CP.values(), filas[0].get("province"))
    # ⚠️ La CACHÉ guarda por consulta: con el país fuera de la clave, quien pidiera las de México se
    # llevaría las españolas que guardó el de antes.
    s = A.db()
    try:
        con_pais = A._address_search_cached(s, "Calle Mayor 10", country="México")
        sin_pais = A._address_search_cached(s, "Calle Mayor 10")
        comprueba("la caché no mezcla la misma calle de dos países",
                  (not con_pais) or (not sin_pais)
                  or con_pais[0].get("country_code") != sin_pais[0].get("country_code")
                  or con_pais[0].get("label") != sin_pais[0].get("label"),
                  [con_pais[:1], sin_pais[:1]])
    finally:
        s.close()
except Exception as exc:
    salta("el endpoint devuelve direcciones de fuera", exc)

print("\n4 · EL ESPEJO DEL NAVEGADOR (static/js/address_autocomplete.js)")
js_src = (RAIZ / "static/js/address_autocomplete.js").read_text(encoding="utf-8")
comprueba("el navegador manda el PAÍS al buscar", "'&country=' + encodeURIComponent(pais)" in js_src)
comprueba("y también al buscar el municipio por el código postal",
          js_src.count("&country=") >= 2, js_src.count("&country="))
comprueba("la provincia de una sugerencia de FUERA no sale de la tabla española",
          "function provinciaDeLaFila" in js_src
          and "if (cc && cc !== 'ES') return fila.province" in js_src)
comprueba("y con un país de fuera no se rellena la provincia al escribir el CP",
          "provinciaDeCp" in js_src and "paisCp" in js_src)

# Las 52 provincias, espejadas (la regla de la casa: si se toca una, se toca la otra).
js_tabla = dict(re.findall(r"'(\d{2})':\s*'([^']+)'", js_src))
comprueba("las 52 provincias siguen espejadas entre el servidor y el navegador",
          js_tabla == G.PROVINCE_BY_CP,
          [k for k in set(js_tabla) | set(G.PROVINCE_BY_CP)
           if js_tabla.get(k) != G.PROVINCE_BY_CP.get(k)])

print("\n%d OK · %d fallan%s" % (len(OK), len(KO),
                                 (" · %d sin probar" % len(SALTADAS)) if SALTADAS else ""))
if KO:
    print("\nLo que falla:")
    for k in KO:
        print("  · " + k)
sys.exit(1 if KO else 0)
