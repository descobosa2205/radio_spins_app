#!/usr/bin/env python3
"""EL MAPA DE LA RUTA de una gira / ciclo · prueba de regresión (sep 2026).

Lo pidió Dani: «que aparezca el listado de fechas como está ahora y debajo un mapa con las fechas
enumeradas, y enumera el listado, con una chincheta con el número».

Con la app REAL y su propia BD (`radiomapa`, que se RECREA en cada pasada):

  1. el listado de fechas sale NUMERADO (1, 2, 3…) en orden de fecha;
  2. debajo hay un MAPA con un punto por fecha y **el mismo número** que la fila;
  3. el `data-points` va escapado y se puede leer (la trampa de `|tojson` dentro de un atributo);
  4. una fecha cuyo recinto no se puede ubicar sale igual en el listado, y el mapa dice cuántas
     faltan (no se pierde ninguna);
  5. ⚠️ el mapa NO sale a geocodificar sin presupuesto de tiempo: la pantalla nunca espera por él;
  6. lo mismo en un CICLO (es la misma ficha);
  7. y la foto de la cabecera lleva la clase en el `<img>` (si va en un `<div>`, el `object-fit` no
     hace nada y la foto se queda pequeña dentro del marco: bug real con captura).

    /tmp/python/bin/python3 tools/check_mapa_fechas.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, html as _html, json, re

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radiomapa"
import psycopg2
_c = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname="postgres")
_c.autocommit = True
_cur = _c.cursor()
_cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (_BD,))
if not _cur.fetchone():
    _cur.execute("CREATE DATABASE %s ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0" % _BD)
    _c.close()
    _c2 = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname=_BD)
    _c2.autocommit = True
    _c2.cursor().execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    _c2.close()
else:
    _c.close()
os.environ["DATABASE_URL"] = "postgresql://postgres@127.0.0.1:54329/%s?sslmode=disable" % _BD
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "t")
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / n).write_text("x")

import models
models.Base.metadata.drop_all(models.engine)
models.Base.metadata.create_all(models.engine)
import app as A

A.app.config["WTF_CSRF_ENABLED"] = False
OK, KO = [], []
HOY = datetime.date.today()


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:240]) if (extra and not cond) else ""))


def puntos_del_html(html):
    """Lee el `data-points` del mapa tal y como lo recibe el navegador (desescapando el atributo)."""
    m = re.search(r'data-points="([^"]*)"', html)
    if not m:
        return None
    return json.loads(_html.unescape(m.group(1)))


print("\n── 1. Semilla: una gira con 4 fechas (3 ubicadas y 1 sin dirección) ──")
s = models.SessionLocal()
try:
    u = models.User(email="mapa@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Mapa"))
    emp = models.GroupCompany(name="33 Producciones")
    art = models.Artist(name="El Ñu", photo_url="https://x/foto.jpg")
    s.add_all([emp, art]); s.flush()
    # Recintos YA geocodificados (la prueba no sale a internet) y uno sin dirección.
    v1 = models.Venue(name="Movistar Arena", municipality="Madrid", lat=40.4239, lng=-3.6740)
    v2 = models.Venue(name="Martín Carpena", municipality="Málaga", lat=36.7075, lng=-4.4372)
    v3 = models.Venue(name="Bizkaia Arena", municipality="Bilbao", lat=43.2830, lng=-2.9500)
    v4 = models.Venue(name="Sala sin dirección", municipality="")
    s.add_all([v1, v2, v3, v4]); s.flush()
    tour = models.PurchasedTour(name="Gira del Ñu", artist_id=art.id, managing_company_id=emp.id,
                                status="ACTIVA")
    s.add(tour); s.flush()
    # ⚠️ A PROPÓSITO en desorden: el número lo pone el ORDEN DEL LISTADO (por fecha), no el alta.
    fechas = [(v3, HOY + datetime.timedelta(days=30), "RESERVADO"),
              (v1, HOY + datetime.timedelta(days=10), "CONFIRMADO"),
              (v4, HOY + datetime.timedelta(days=20), "RESERVADO"),
              (v2, HOY + datetime.timedelta(days=40), "RESERVADO")]
    for v, f, st in fechas:
        s.add(models.Concert(artist_id=art.id, venue_id=v.id, date=f, status=st, capacity=1000,
                             purchased_tour_id=tour.id, sale_type="EMPRESA",
                             activity_type="CONCIERTO", group_company_id=emp.id))
    cf = models.CycleFestival(name="Ciclo del Ñu", kind="CICLO", managing_company_id=emp.id)
    s.add(cf); s.flush()
    s.add(models.Concert(artist_id=art.id, venue_id=v1.id, date=HOY + datetime.timedelta(days=5),
                         status="CONFIRMADO", cycle_festival_id=cf.id, sale_type="EMPRESA",
                         capacity=1000, activity_type="CONCIERTO", group_company_id=emp.id))
    UID, TOUR, CICLO = str(u.id), str(tour.id), str(cf.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10
r = cli.get("/contratacion/giras/%s" % TOUR)
check("la ficha de la gira abre (200)", r.status_code == 200, r.status_code)
html = r.get_data(as_text=True)

print("\n── 2. El listado va NUMERADO y en orden de fecha ──────────────────────")
filas = re.findall(r'data-tour-row="(\d+)"[^>]*>\s*<span class="tour-num[^"]*">(\d+)</span>', html)
check("hay una fila por fecha", len(filas) == 4, filas)
check("numeradas 1, 2, 3, 4", [f[1] for f in filas] == ["1", "2", "3", "4"], filas)
check("el número de la fila y el del chip son el MISMO", all(a == b for a, b in filas), filas)
# El orden: la primera fecha es la más próxima (Movistar Arena, +10 días).
pos_madrid = html.find("Movistar Arena")
pos_bilbao = html.find("Bizkaia Arena")
check("la 1 es la fecha más próxima", 0 < pos_madrid < pos_bilbao, (pos_madrid, pos_bilbao))

print("\n── 3. El mapa: un punto por fecha ubicada, con su número ──────────────")
pts = puntos_del_html(html)
check("el mapa está y su `data-points` se puede leer", isinstance(pts, list), str(pts)[:120])
check("3 fechas ubicadas (la cuarta no tiene dirección)", len(pts or []) == 3, [p.get("venue_name") for p in (pts or [])])
nums = [p["n"] for p in (pts or [])]
check("los números del mapa son los del listado", nums == sorted(nums) and set(nums) <= {1, 2, 3, 4}, nums)
uno = next((p for p in (pts or []) if p["n"] == 1), {})
check("la chincheta 1 es la primera fecha", uno.get("venue_name") == "Movistar Arena", uno)
check("y lleva lo que hace falta para el globo",
      all(uno.get(k) for k in ("date_label", "municipality", "status_label", "url")), uno)
check("dice cuántas están ubicadas", "3 de 4 ubicadas" in html)
check("y avisa de la que falta", "sin ubicar" in html)
check("⚠️ el atributo NO se corta (va escapado)", 'data-points="[{&#34;' in html or 'data-points="[{&quot;' in html,
      html[html.find("data-points"):html.find("data-points") + 60])

print("\n── 4. Sin presupuesto de tiempo, el mapa NO sale a geocodificar ───────")
llamadas = []
_orig = A._venue_coords
A._venue_coords = lambda sdb, v: (llamadas.append(getattr(v, "name", "?")), _orig(sdb, v))[1]
s = models.SessionLocal()
try:
    conciertos = A._tour_concerts(s, A.to_uuid(TOUR))
    filas_py = [A._group_concert_row(c) for c in conciertos]
    with A.app.test_request_context("/"):
        salida = A._group_map_points(s, filas_py, conciertos, presupuesto=0)
    check("las ya ubicadas salen igual (no hace falta preguntar)", len(salida) == 3, len(salida))
    check("⚠️ no se pregunta por la que no tiene coordenadas",
          "Sala sin dirección" not in llamadas, llamadas)
    check("y el listado queda numerado de todos modos",
          [f.get("n") for f in filas_py] == [1, 2, 3, 4], [f.get("n") for f in filas_py])
finally:
    A._venue_coords = _orig
    s.close()

print("\n── 5. En un CICLO es la misma ficha, y también con su mapa ────────────")
r = cli.get("/contratacion/ciclos/%s" % CICLO)
check("la ficha del ciclo abre (200)", r.status_code == 200, r.status_code)
h2 = r.get_data(as_text=True)
p2 = puntos_del_html(h2)
check("con su punto en el mapa", len(p2 or []) == 1, p2)
check("y su fila numerada", 'class="tour-num' in h2)

print("\n── 6. La FOTO de la cabecera: la clase va en el <img> ─────────────────")
check("⚠️ no es un <div> envolviendo la imagen",
      '<div class="ficha-hero__media">' not in html, "sigue el div: el object-fit no haría nada")
check("la imagen lleva la clase", re.search(r'<img class="ficha-hero__media[^"]*"', html) is not None)

print("\n── 7. Vincular VARIAS fechas de una vez, desde el pop-up ─────────────")
s = models.SessionLocal()
try:
    art = s.query(models.Artist).filter(models.Artist.name == "El Ñu").first()
    v = s.query(models.Venue).filter(models.Venue.name == "Movistar Arena").first()
    sueltos = []
    for i in range(3):
        c = models.Concert(artist_id=art.id, venue_id=v.id, date=HOY + datetime.timedelta(days=60 + i),
                           status="RESERVADO", capacity=800, sale_type="EMPRESA",
                           activity_type="CONCIERTO")
        s.add(c); s.flush()
        sueltos.append(str(c.id))
    s.commit()
finally:
    s.close()
html = cli.get("/contratacion/giras/%s" % TOUR).get_data(as_text=True)
check("el pop-up de vincular está", 'id="linkDatesModal"' in html)
check("con una casilla por fecha", html.count('name="concert_ids"') >= 3, html.count('name="concert_ids"'))
check("y ya no hay un desplegable de una en una", 'name="concert_id"' not in html)
r = cli.post("/contratacion/giras/%s/vincular" % TOUR,
             data={"concert_ids": sueltos[:2]}, follow_redirects=True)
texto = r.get_data(as_text=True)
check("dice cuántas ha vinculado", "2 fechas vinculadas" in texto, texto[texto.find("alert"):][:160])
s = models.SessionLocal()
try:
    dentro = [str(c.id) for c in s.query(models.Concert)
              .filter(models.Concert.purchased_tour_id == A.to_uuid(TOUR)).all()]
    check("⚠️ las DOS quedan vinculadas", all(x in dentro for x in sueltos[:2]), dentro)
    check("y la tercera se queda fuera", sueltos[2] not in dentro, dentro)
finally:
    s.close()
r = cli.post("/contratacion/giras/%s/vincular" % TOUR, data={}, follow_redirects=True)
check("sin elegir ninguna, lo dice y no vincula nada",
      "no se ha elegido ninguna" in r.get_data(as_text=True).lower())

print("\n═══════════════════════════════════════════════════════════════════════")
print("  %d bien · %d mal" % (len(OK), len(KO)))
if KO:
    print("  Falla: " + " · ".join(KO))
sys.exit(1 if KO else 0)
