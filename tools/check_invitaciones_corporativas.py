#!/usr/bin/env python3
"""INVITACIONES CORPORATIVAS · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y una BD de PRUEBA:
  · el MÓDULO «Datos de la actividad» del editor: qué es, el artista con su foto, la fecha con su
    día de la semana, el recinto, la hora y el CARTEL a la izquierda de la viñeta (y sus iconos como
    PNG, que en un correo no carga ninguna fuente de iconos)
  · que la paleta del editor lo ofrece, y solo con actividades POR VENIR
  · MIS LISTAS: crear, añadir a alguien (un tercero que ya está o uno nuevo, que se crea) y que
    nadie entra dos veces
  · SUBIR UN FICHERO: que se REVISA antes de crear nada (quién ya está en la lista, a quién ya
    tenemos en Terceros para marcarlo y a quién hay que dar de alta uno a uno), que se puede
    corregir a qué campo va una columna sin volver a subirlo, y que reimportarlo no duplica a nadie
  · crear la invitación → el editor → enviar; y que SIN el correo de esa persona en Integraciones
    NO se manda (y se dice qué hacer)
  · que sale DESDE SU CORREO, con su nombre, no como correo automático y con los datos de la
    actividad dentro
  · que nadie recibe dos veces (ni al reenviar, ni estando en dos listas)
  · el PÍXEL de apertura (sin sesión) y cuántos la han abierto en el listado y en la ficha
  · que la función es DE CADA UNO: nadie ve, toca ni edita lo de nadie
  · que el botón de Inicio lo ve TODO EL MUNDO
  · que el listado ordena LAS MÁS PRÓXIMAS PRIMERO y las pasadas al final
  · y una prueba de humo de todas sus pantallas (una de ellas cazó un `url_for` con el nombre de
    parámetro equivocado, que tumbaba la pantalla entera)

    /tmp/python/bin/python3 tools/check_invitaciones_corporativas.py

Requiere el entorno de /tmp de CLAUDE.md. ⚠️ Usa su PROPIA base (`radiocorp`) y la RECREA en cada
pasada: una BD de prueba contaminada miente (lo que sembró la pasada anterior hace que un «se crea»
salga como «ya estaba»).
"""
import os, sys, tempfile, pathlib, io, datetime, json

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_DSN = os.environ.get("CORP_TEST_DSN", "postgresql://postgres@127.0.0.1:54329/radiocorp?sslmode=disable")
_BD = _DSN.rsplit("/", 1)[-1].split("?")[0]
try:
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
except Exception as _exc:
    print("no se pudo preparar la base de prueba:", _exc)
os.environ["DATABASE_URL"] = _DSN
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "t")
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / n).write_text("x")

import models, sqlalchemy as _sa
# ⚠️ LA BD DE PRUEBA CONTAMINADA MIENTE (los terceros que sembró la pasada anterior hacen que un
# «se crea» salga como «ya estaba»): se tira y se recrea el esquema entero en cada pasada.
models.Base.metadata.drop_all(models.engine)
models.Base.metadata.create_all(models.engine)
import app as A
import press_render

A.app.config["WTF_CSRF_ENABLED"] = False        # sin esto todo POST sale con un 302 a /home

OK, KO = [], []
def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:300]) if (extra and not cond) else ""))

# ─────────────────────────────────────────────────────────────────────────────
# 1) Semilla: un usuario con su cuenta de correo, un artista, un recinto y una actividad
# ─────────────────────────────────────────────────────────────────────────────
s = models.SessionLocal()
try:
    for t in ("corporate_invite_recipients", "corporate_invites", "corporate_guests", "corporate_guest_lists"):
        s.execute(models.text("DELETE FROM %s" % t))
    s.commit()

    u = s.query(models.User).filter(models.User.email == "dani@33producciones.es").first()
    if u is None:
        u = models.User(email="dani@33producciones.es", password_hash="x", role=10)
        s.add(u); s.flush()
    u.role = 10          # ⚠️ el rol lo manda la BD, no la sesión
    prof = s.query(models.UserProfile).filter(models.UserProfile.user_id == u.id).first()
    if prof is None:
        prof = models.UserProfile(user_id=u.id, nick="Dani", departments=["Contratación"])
        s.add(prof)
    art = s.query(models.Artist).filter(models.Artist.name == "Los Ñus").first()
    if art is None:
        art = models.Artist(name="Los Ñus", photo_url="https://x/artista.jpg")
        s.add(art); s.flush()
    ven = s.query(models.Venue).filter(models.Venue.name == "Sala Prueba").first()
    if ven is None:
        ven = models.Venue(name="Sala Prueba", municipality="Sevilla", province="Sevilla")
        s.add(ven); s.flush()
    futuro = datetime.date.today() + datetime.timedelta(days=45)
    c = s.query(models.Concert).filter(models.Concert.artist_id == art.id).first()
    if c is None:
        c = models.Concert(artist_id=art.id, venue_id=ven.id, date=futuro, sale_type="VENDIDO", capacity=500,
                           activity_type="CONCIERTO", show_time="21:30", status="CONFIRMADO")
        s.add(c); s.flush()
    else:
        c.date, c.show_time, c.venue_id = futuro, "21:30", ven.id
    s.commit()
    UID, CID, NICK = str(u.id), str(c.id), "Dani"
finally:
    s.close()

print("\n── 1. El MÓDULO «Datos de la actividad» ───────────────────────────────")
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        datos = A._press_activity_data(s, {"concert_id": CID})
        check("tipo de actividad", datos.get("kind_label") == "Concierto", datos.get("kind_label"))
        check("artista con su foto", datos.get("artist_name") == "Los Ñus" and datos.get("artist_photo"), datos)
        # ⚠️ LA FECHA DE ALGO QUE SALE DE CASA LLEVA SU DÍA DE LA SEMANA
        dias = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")
        check("la fecha lleva su día de la semana", (datos.get("date_label") or "").startswith(dias), datos.get("date_label"))
        check("el recinto", "Sala Prueba" in (datos.get("venue_label") or ""), datos.get("venue_label"))
        check("la hora de comienzo", datos.get("time_label") == "21:30 h", datos.get("time_label"))
        check("sin actividad queda PENDIENTE", A._press_activity_data(s, {}).get("pending") is True)
        check("un id que no existe queda PENDIENTE",
              A._press_activity_data(s, {"concert_id": "00000000-0000-0000-0000-000000000000"}).get("pending") is True)

        # El HTML del módulo: la viñeta con los datos y sus iconos
        b = {"type": "activity", "x": 0, "y": 0, "w": 520, "h": 170, "ref": {"concert_id": CID}}
        resuelto = A._press_resolve_blocks(s, s.query(models.PressRelease).first() or models.PressRelease(), {"blocks": [b]}, "tok")
        html = press_render.module_html(press_render.blocks_of(resuelto)[0])
        for dato in ("Concierto", "Los Ñus", "Sala Prueba", "21:30 h"):
            check("el correo enseña «%s»" % dato, dato in html)
        check("los iconos van como PNG (nada de <i class=fa> ni emojis en el correo)",
              "/icono/" in html and "<i class=" not in html, html[:200])
        for ico in ("calendar-day.png", "calendar-days.png", "location-dot.png", "clock.png"):
            check("lleva el icono %s" % ico, ico in html)
        check("un módulo PENDIENTE no se pinta fuera del editor",
              press_render.module_html({"type": "activity", "data": {"pending": True}}) == "")
        check("y en el EDITOR sí, como hueco que invita a completarlo",
              "Pincha para elegir" in press_render.module_html({"type": "activity", "data": {"pending": True}}, editing=True))
    finally:
        s.close()

print("\n── 1b. EL CARTEL a la izquierda de la viñeta ──────────────────────────")
s = models.SessionLocal()
try:
    req = models.ConcertArtworkRequest(concert_id=A.to_uuid(CID), public_token="tok-art-1")
    s.add(req); s.flush()
    s.add(models.ConcertArtworkAsset(artwork_request_id=req.id, format_label="Cartel A3",
                                     file_url="https://x/cartel.jpg", kind="IMAGE",
                                     category="POSTER", validation_status="APPROVED"))
    s.commit()
finally:
    s.close()
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        datos = A._press_activity_data(s, {"concert_id": CID})
        check("coge el cartel aprobado de la actividad", datos.get("poster_url") == "https://x/cartel.jpg", datos.get("poster_url"))
        b = {"type": "activity", "x": 0, "y": 0, "w": 520, "h": 170, "ref": {"concert_id": CID}}
        res = A._press_resolve_blocks(s, models.PressRelease(), {"blocks": [b]}, "tok")
        html2 = press_render.module_html(press_render.blocks_of(res)[0])
        check("el cartel se pinta EN LA VIÑETA", "https://x/cartel.jpg" in html2)
        # A la IZQUIERDA el cartel y a la DERECHA los datos: el cartel va antes en el HTML.
        check("el cartel va a la IZQUIERDA (antes que los datos)",
              html2.index("cartel.jpg") < html2.index("Los Ñus"))
        check("y los datos a la derecha, en una sola viñeta (una sola tarjeta)",
              html2.count("border-radius:14px") == 1, html2.count("border-radius:14px"))
    finally:
        s.close()

print("\n── 1c. EL CARTEL se ve SI ESTÁ SUBIDO, y el RECINTO abre el mapa ──────")
# ⚠️ Lo pidió Dani (sep 2026): «el cartel se tiene que ver si está subido» —un cartel pasa por DOS
# vistos buenos y entre medias el módulo se quedaba vacío aunque el cartel estuviera ahí— y «en el
# recinto se ve el nombre y debajo la dirección; si se pincha, te abre la ubicación en tu
# aplicación de mapas».
s = models.SessionLocal()
try:
    v = s.query(models.Venue).filter(models.Venue.name == "Sala Prueba").first()
    v.address, v.municipality, v.province = "Calle Betis, 31", "Sevilla", "Sevilla"
    pieza = (s.query(models.ConcertArtworkAsset)
             .join(models.ConcertArtworkRequest,
                   models.ConcertArtworkRequest.id == models.ConcertArtworkAsset.artwork_request_id)
             .filter(models.ConcertArtworkRequest.concert_id == A.to_uuid(CID)).first())
    s.commit()
    PIEZA = str(pieza.id)
finally:
    s.close()

def _cartel(estado, archivada=False):
    s = models.SessionLocal()
    try:
        a = s.get(models.ConcertArtworkAsset, A.to_uuid(PIEZA))
        a.validation_status, a.is_archived = estado, archivada
        s.commit()
        with A.app.test_request_context("/"):
            return A._press_activity_data(s, {"concert_id": CID}).get("poster_url") or ""
    finally:
        s.close()

check("el cartel APROBADO se ve", _cartel("APPROVED") == "https://x/cartel.jpg")
check("⚠️ y uno SUBIDO pero todavía sin aprobar, también",
      _cartel("PENDING") == "https://x/cartel.jpg", _cartel("PENDING"))
check("uno aprobado solo por diseño, también", _cartel("DESIGN_OK") == "https://x/cartel.jpg")
check("un cartel RECHAZADO no se ve nunca (está mal por definición)", _cartel("REJECTED") == "")
# ⚠️ ARCHIVADO NO ES BORRADO: al cambiar la fecha o el sitio la app archiva los carteles y pide
#    otros, y hasta que llega el nuevo **el que hay es ese** (si no, la actividad se quedaba sin
#    cartel durante días — era la causa de «al actualizar la hora se ha dejado de ver el cartel»).
check("y uno ARCHIVADO sigue valiendo mientras no haya otro",
      _cartel("PENDING", archivada=True) == "https://x/cartel.jpg",
      _cartel("PENDING", archivada=True))
_cartel("APPROVED")

with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        datos = A._press_activity_data(s, {"concert_id": CID})
        check("el recinto sale con su municipio", datos.get("venue_label") == "Sala Prueba · Sevilla",
              datos.get("venue_label"))
        check("y la DIRECCIÓN va aparte, para pintarla debajo",
              datos.get("venue_address") == "Calle Betis, 31", datos.get("venue_address"))
        check("con su enlace al mapa", "google.com/maps" in (datos.get("venue_map_url") or ""),
              datos.get("venue_map_url"))
        b = {"type": "activity", "x": 0, "y": 0, "w": 520, "h": 170, "ref": {"concert_id": CID}}
        html = press_render.module_html(press_render.blocks_of(
            A._press_resolve_blocks(s, models.PressRelease(), {"blocks": [b]}, "tok"))[0])
        check("el módulo pinta la dirección debajo del recinto",
              html.find("Sala Prueba") < html.find("Calle Betis, 31"), None)
        check("y todo el bloque del recinto es el enlace al mapa",
              'href="https://www.google.com/maps' in html, None)
        # Con coordenadas manda la coordenada (es exacta).
        v = s.query(models.Venue).filter(models.Venue.name == "Sala Prueba").first()
        v.lat, v.lng = 37.38, -5.99
        s.commit()
        check("si el recinto está geocodificado, el mapa va por coordenadas",
              "query=37.38,-5.99" in (A._press_activity_data(s, {"concert_id": CID}).get("venue_map_url") or ""),
              A._press_activity_data(s, {"concert_id": CID}).get("venue_map_url"))
        v.lat = v.lng = None
        v.address = v.municipality = None
        s.commit()
        check("sin dirección ni municipio NO se pinta enlace (uno que no lleva a ningún sitio es peor)",
              (A._press_activity_data(s, {"concert_id": CID}).get("venue_map_url") or "") == "")
        v.address, v.municipality = "Calle Betis, 31", "Sevilla"
        s.commit()
    finally:
        s.close()

print("\n── 2. La PALETA del editor lo ofrece ──────────────────────────────────")
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        pr = models.PressRelease(purpose="INVITE", status="DRAFT", subject_kind="ARTIST",
                                 artist_ids=[], about_kind="SUBJECT", design={"blocks": []},
                                 public_token="tok-assets")
        s.add(pr); s.flush()
        assets = A._press_assets(s, pr)
        check("la paleta trae el grupo «activities»", "activities" in assets)
        ids = [a["ref"]["concert_id"] for a in assets.get("activities") or []]
        check("y dentro está la actividad por venir", CID in ids, ids)
        # ⚠️ En la BARRA LATERAL solo se ofrece el módulo VACÍO (lo pidió Dani: «pon solo lo de una
        # actividad; lo arrastras y ahí sí seleccionas la actividad»). Las concretas siguen estando
        # en el servidor porque son las que ofrece el pop-up de elegir.
        js_ed = io.open("static/js/press_editor.js", encoding="utf-8").read()
        check("la paleta NO lista las actividades una a una (ni los singles ni los logos)",
              "['activities', 'audios', 'logos'].indexOf(g[0]) < 0" in js_ed)
        check("pero sí ofrece el módulo vacío", "activities: 'activity'" in js_ed)
        s.rollback()
    finally:
        s.close()

print("\n── 3. LA PANTALLA y MIS LISTAS ────────────────────────────────────────")
cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10

r = cli.get("/invitaciones-corporativas")
check("la pantalla abre (200)", r.status_code == 200, r.status_code)
cuerpo = r.get_data(as_text=True)
check("dice que no hay listas todavía", "Todavía no tienes ninguna lista" in cuerpo)

r = cli.post("/invitaciones-corporativas/listas/crear", data={"name": "Prensa"}, follow_redirects=True)
check("se crea una lista", r.status_code == 200 and "Prensa" in r.get_data(as_text=True), r.status_code)

s = models.SessionLocal()
try:
    lst = s.query(models.CorporateGuestList).filter(models.CorporateGuestList.name == "Prensa").first()
    LID = str(lst.id) if lst else ""
finally:
    s.close()
check("la lista es de ESA persona", bool(LID))

# Añadir a alguien NUEVO (se le crea su ficha de tercero)
r = cli.post("/invitaciones-corporativas/listas/%s/invitados" % LID,
             data={"name": "Ana Pérez", "email": "ana@medio.com", "phone": "600111222"})
js = r.get_json()
check("se añade a alguien nuevo", js and js.get("ok") and js.get("count") == 1, js)
s = models.SessionLocal()
try:
    ana = s.query(models.Promoter).filter(models.Promoter.contact_email == "ana@medio.com").first()
    check("y se le crea su ficha de TERCERO", ana is not None and ana.first_name == "Ana" and ana.last_name == "Pérez",
          (ana.first_name, ana.last_name) if ana else None)
    ANA_ID = str(ana.id) if ana else ""
finally:
    s.close()

# El mismo correo otra vez: ni se duplica el tercero ni entra dos veces en la lista
r = cli.post("/invitaciones-corporativas/listas/%s/invitados" % LID,
             data={"name": "Ana P.", "email": "ana@medio.com"})
js = r.get_json()
check("el mismo correo NO entra dos veces en la lista", js and not js.get("ok"), js)
s = models.SessionLocal()
try:
    n = s.query(models.Promoter).filter(models.Promoter.contact_email == "ana@medio.com").count()
    check("y NO se crea una segunda ficha de tercero", n == 1, n)
finally:
    s.close()

# Añadir un tercero QUE YA EXISTE (el de siempre: se busca y se elige)
s = models.SessionLocal()
try:
    otro = models.Promoter(nick="Bea Ruiz", contact_email="bea@empresa.com", contact_phone="655000111")
    s.add(otro); s.commit()
    BEA_ID = str(otro.id)
finally:
    s.close()
r = cli.post("/invitaciones-corporativas/listas/%s/invitados" % LID, data={"promoter_id": BEA_ID})
js = r.get_json()
check("se añade un tercero que ya estaba", js and js.get("ok") and js.get("count") == 2, js)
check("y se le coge el correo de SU ficha",
      any(g["email"] == "bea@empresa.com" for g in (js or {}).get("rows") or []), js)

print("\n── 4. SUBIR UN FICHERO · LA REVISIÓN (no se crea nada a ciegas) ───────")
# ⚠️⚠️ Las cabeceras con las que salían cosas RARAS: «Invitado» no se reconocía —así que el nombre
# se cogía de «Empresa» y la gente entraba con el nombre de SU EMPRESA— y «Dirección de correo» se
# leía como el DOMICILIO, con lo que la fila se quedaba sin correo y no se podía invitar a nadie.
csv = ("Invitado;Empresa;Cargo;Dirección de correo;Móvil\n"
       "Ana P.;Acme SL;Directora;ana@medio.com;600111222\n"          # ya está EN LA LISTA
       "Bea Ruiz;Otra SL;Jefa de prensa;bea@empresa.com;655000111\n"  # ya está EN LA LISTA
       "Carlos Gómez;Tercera SL;Redactor;carlos@nuevo.com;600333444\n"  # NO lo tenemos
       "Diego Sanz;Cuarta SL;Fotógrafo;;600555666\n")                 # ni lo tenemos ni trae correo
r = cli.post("/invitaciones-corporativas/listas/%s/importar" % LID,
             data={"file": (io.BytesIO(csv.encode("utf-8")), "invitados.csv")},
             content_type="multipart/form-data")
js = r.get_json() or {}
filas = js.get("rows") or []
check("el fichero se lee y devuelve la revisión", js.get("ok") and len(filas) == 4, js)
cols = {c["header"]: c["field"] for c in (js.get("columns") or [])}
check("«Invitado» se reconoce como el nombre (antes se quedaba sin campo)", cols.get("Invitado") == "nick", cols)
check("«Dirección de correo» es el CORREO, no el domicilio", cols.get("Dirección de correo") == "contact_email", cols)
check("el nombre que se propone es el de la PERSONA, no el de su empresa",
      bool(filas) and filas[2]["name"] == "Carlos Gómez", [f["name"] for f in filas])
check("lo que no es un dato de la ficha viaja como dato extra con el nombre de su columna",
      bool(filas) and {x["label"] for x in filas[2]["extra"]} >= {"Empresa", "Cargo"},
      filas and filas[2]["extra"])
check("quien ya está en la lista sale como YA AÑADIDO",
      [f["status"] for f in filas[:2]] == ["lista", "lista"], [f["status"] for f in filas])
check("quien no lo tenemos sale para darlo de alta",
      [f["status"] for f in filas[2:]] == ["nuevo", "nuevo"], [f["status"] for f in filas])
check("se dice cuántas filas se quedarían sin correo", (js.get("counts") or {}).get("sin_correo") == 1, js.get("counts"))
s = models.SessionLocal()
try:
    check("⚠️ SUBIR EL FICHERO NO CREA NINGUNA FICHA (antes las creaba todas de golpe)",
          s.query(models.Promoter).filter(models.Promoter.contact_email == "carlos@nuevo.com").first() is None)
    check("ni añade a nadie a la lista",
          s.query(models.CorporateGuest).filter(models.CorporateGuest.list_id == A.to_uuid(LID)).count() == 2)
finally:
    s.close()

# Un tercero que YA TENEMOS pero que no está en la lista: se enseña para MARCARLO.
s = models.SessionLocal()
try:
    # ⚠️ El nick a propósito DISTINTO del nombre del fichero: así la coincidencia es por el CORREO
    # (si el nick fuera igual casaría por ahí antes, y esto no probaría lo que dice).
    otro = models.Promoter(nick="Elena Mora (Radio Cinco)", contact_email="elena@otra.com")
    s.add(otro); s.commit(); ELENA_ID = str(otro.id)
finally:
    s.close()
csv2 = ("Invitado;Empresa;Dirección de correo\n"
        "Elena Mora;Quinta SL;elena@otra.com\n"
        "Nuria Paz;Sexta SL;nuria@nueva.com\n")
r = cli.post("/invitaciones-corporativas/listas/%s/importar" % LID,
             data={"file": (io.BytesIO(csv2.encode("utf-8")), "invitados2.csv")},
             content_type="multipart/form-data")
js2 = r.get_json() or {}
filas2 = js2.get("rows") or []
check("a quien YA TENEMOS en Terceros se le enseña para marcarlo",
      bool(filas2) and filas2[0]["status"] == "tercero" and filas2[0]["promoter"], filas2 and filas2[0])
check("y se dice POR QUÉ se le ha reconocido", "correo" in (filas2[0]["why"] or ""), filas2 and filas2[0].get("why"))
check("viene marcado, porque el correo es un dato seguro", filas2[0]["sure"] is True, filas2 and filas2[0])

# Añadir LOS MARCADOS (no crea fichas: son terceros que ya existen)
r = cli.post("/invitaciones-corporativas/listas/%s/importar/anadir" % LID,
             json={"items": [{"promoter_id": ELENA_ID, "name": "Elena Mora", "email": "elena@otra.com"}]})
js3 = r.get_json() or {}
check("se añaden los marcados", js3.get("ok") and js3.get("added") == 1, js3)
check("y la lista vuelve al día (3)", js3.get("count") == 3, js3.get("count"))
s = models.SessionLocal()
try:
    check("sin crear una segunda ficha de esa persona",
          s.query(models.Promoter).filter(models.Promoter.contact_email == "elena@otra.com").count() == 1)
finally:
    s.close()

# El ALTA, UNO A UNO: se crea la ficha con lo que se ha revisado y queda añadida a la lista
r = cli.post("/invitaciones-corporativas/listas/%s/importar/nuevo" % LID,
             json={"values": {"nick": "Carlos Gómez", "first_name": "Carlos", "last_name": "Gómez",
                              "contact_email": "carlos@nuevo.com", "contact_phone": "600333444"},
                   "extra": [{"label": "Empresa", "value": "Tercera SL"}, {"label": "Cargo", "value": "Redactor"}]})
js4 = r.get_json() or {}
check("el alta uno a uno crea su ficha y lo añade a la lista",
      js4.get("ok") and js4.get("created") and js4.get("added"), js4)
check("y la lista vuelve al día (4)", js4.get("count") == 4, js4.get("count"))
s = models.SessionLocal()
try:
    p = s.query(models.Promoter).filter(models.Promoter.contact_email == "carlos@nuevo.com").first()
    check("la ficha nace con su nombre y sus apellidos", p is not None and p.first_name == "Carlos" and p.last_name == "Gómez",
          p and (p.first_name, p.last_name))
    alt = s.query(models.PromoterAltValue).filter(models.PromoterAltValue.promoter_id == p.id).all() if p else []
    check("y con lo demás del fichero como dato extra, con el nombre de su columna",
          {a.label for a in alt} >= {"Empresa", "Cargo"}, [(a.label, a.value) for a in alt])
finally:
    s.close()

# CORREGIR UNA COLUMNA sin volver a subir el fichero
cols2 = js2.get("columns") or []
for c in cols2:
    if c["header"] == "Empresa":
        c["field"] = "hotel_notes"
r = cli.post("/invitaciones-corporativas/listas/%s/importar/revisar" % LID,
             json={"columns": cols2, "file_rows": js2.get("file_rows") or []})
js5 = r.get_json() or {}
check("se puede corregir a qué campo va una columna SIN volver a subir el fichero", js5.get("ok"), js5)
check("y la revisión se rehace con eso",
      bool(js5.get("rows")) and js5["rows"][0]["values"].get("hotel_notes") == "Quinta SL",
      js5.get("rows") and js5["rows"][0]["values"])
check("y quien se acaba de añadir ya sale como «ya está en la lista»",
      bool(js5.get("rows")) and js5["rows"][0]["status"] == "lista", js5.get("rows") and js5["rows"][0]["status"])

# Volver a subir el MISMO fichero: nadie se duplica y todos salen como ya añadidos
r = cli.post("/invitaciones-corporativas/listas/%s/importar" % LID,
             data={"file": (io.BytesIO(csv.encode("utf-8")), "invitados.csv")},
             content_type="multipart/form-data")
js6 = r.get_json() or {}
check("reimportar el mismo fichero no propone nada nuevo de quien ya está",
      [f["status"] for f in (js6.get("rows") or [])][:3] == ["lista", "lista", "lista"],
      [(f["name"], f["status"]) for f in (js6.get("rows") or [])])
s = models.SessionLocal()
try:
    total = s.query(models.CorporateGuest).filter(models.CorporateGuest.list_id == A.to_uuid(LID)).count()
    check("y la lista sigue teniendo 4 invitados", total == 4, total)
finally:
    s.close()

print("\n── 4b. LOS QUE NO TIENEN CORREO · se arreglan UNO A UNO ───────────────")
# ⚠️⚠️ «SIN CORREO» ES EL MISMO DATO QUE MIRA EL ENVÍO (bug real, sep 2026, lo vio Dani: «hay
# algunos que sí tienen email y siguen apareciendo como que no después de solucionarlo»). La
# pantalla miraba SOLO la fila de la lista y el envío mira primero la FICHA del tercero: quien tenía
# el correo en su ficha salía como «sin correo» para siempre, aunque la invitación sí le llegara.
s = models.SessionLocal()
try:
    conficha = models.Promoter(nick="Con ficha", contact_email="conficha@medio.com")
    sinnada = models.Promoter(nick="Sin nada")
    s.add(conficha); s.add(sinnada); s.commit()
    lst2 = models.CorporateGuestList(user_id=A.to_uuid(UID), name="Con huecos")
    s.add(lst2); s.commit()
    g1 = models.CorporateGuest(list_id=lst2.id, promoter_id=conficha.id, name="Con ficha", email=None)
    g2 = models.CorporateGuest(list_id=lst2.id, promoter_id=sinnada.id, name="Sin nada", email=None)
    s.add(g1); s.add(g2); s.commit()
    LID2, G1, G2 = str(lst2.id), str(g1.id), str(g2.id)
finally:
    s.close()
js = cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID2).get_json() or {}
filas = {f["id"]: f for f in (js.get("rows") or [])}
check("quien tiene el correo en su FICHA ya no sale como «sin correo»",
      (filas.get(G1) or {}).get("email") == "conficha@medio.com", filas.get(G1))
check("y quien no lo tiene en ninguna parte, sí", (filas.get(G2) or {}).get("email") == "", filas.get(G2))
check("la cuenta de la lista dice lo mismo que el envío (1 de 2)",
      js.get("with_email") == 1 and js.get("count") == 2, js)
s = models.SessionLocal()
try:
    with A.app.test_request_context("/"):
        prev = A._corp_recipients_preview(s, [LID2])
    check("y el envío cuenta a quien tiene el correo en su ficha",
          prev.get("total") == 1 and prev.get("sin_correo") == 1, prev)
finally:
    s.close()
# Arreglarlo desde la propia lista, sin salir de la pantalla
r = cli.post("/invitaciones-corporativas/invitados/%s/arreglar" % G2,
             data={"email": "arreglado@medio.com", "phone": "600111999"})
js2 = r.get_json() or {}
check("se le puede poner el correo que falta ahí mismo", js2.get("ok") and js2.get("with_email") == 2, js2)
check("y dice cuántos quedan, para seguir con el siguiente", js2.get("pending") == 0, js2)
s = models.SessionLocal()
try:
    p = s.query(models.Promoter).filter(models.Promoter.nick == "Sin nada").first()
    check("el correo se guarda TAMBIÉN en su ficha de tercero (la tenía vacía)",
          (p.contact_email or "") == "arreglado@medio.com", p and p.contact_email)
    check("y el teléfono, con su prefijo", (p.contact_phone or "").endswith("600111999"), p and p.contact_phone)
finally:
    s.close()
r = cli.post("/invitaciones-corporativas/invitados/%s/arreglar" % G1, data={"email": "esto no es"})
check("un correo mal escrito se rechaza y se dice por qué",
      r.status_code == 400 and "no parece" in ((r.get_json() or {}).get("error") or ""), r.get_json())
r = cli.post("/invitaciones-corporativas/invitados/%s/arreglar" % G1, data={"email": ""})
check("y sin correo no se guarda nada", r.status_code == 400, r.status_code)
# Un tercero que ya está en la lista no entra dos veces aunque su fila no tenga correo
s = models.SessionLocal()
try:
    lst2b = s.get(models.CorporateGuestList, A.to_uuid(LID2))
    p1 = s.query(models.Promoter).filter(models.Promoter.nick == "Con ficha").first()
    with A.app.test_request_context("/"):
        ok2, motivo = A._corp_guest_add(s, lst2b, promoter=p1, name="Con ficha", email="", phone="")
    s.rollback()
    check("y quien ya está en la lista no entra dos veces", (not ok2) and motivo == "ya estaba", (ok2, motivo))
finally:
    s.close()

print("\n── 4c. UN CORREO Y UN TELÉFONO, SIEMPRE EN SU CAMPO ──────────────────")
# ⚠️⚠️ Lo pidió Dani (sep 2026): «algunas importaciones han puesto el domicilio como correo; un
# email y un teléfono lo tiene que detectar siempre y ponerlo en su campo correcto… y aplícalo a
# todo lo existente». El rótulo de la columna se equivoca; el VALOR no.
import promoter_import as PI
csv3 = ("Invitado;Dirección;Teléfono\n"
        "Rosa Prat;rosa@medio.com;600777111\n"
        "Tomás Gil;Calle Luna 7 - tomas@medio.com;600777222\n"
        "Eva Soto;Calle Sol 5;600777333\n")
d3 = PI.parse_file(csv3.encode("utf-8"), "x.csv")
m3 = {str(c["index"]): (c["field"] or {"field": PI.TARGET_ALT, "label": c["header"]}) for c in d3["columns"]}
v3 = [f["values"] for f in PI.apply_mapping(d3["rows"], m3)]
check("un correo que viene en la columna del DOMICILIO acaba en el campo del correo",
      v3[0].get("contact_email") == "rosa@medio.com" and not v3[0].get("address"), v3[0])
check("un domicilio que lleva el correo detrás conserva la dirección y coge el correo",
      (v3[1].get("address") or "").startswith("Calle Luna") and v3[1].get("contact_email") == "tomas@medio.com", v3[1])
check("y un domicilio normal no se toca", v3[2].get("address") == "Calle Sol 5" and not v3[2].get("contact_email"), v3[2])

# LO QUE YA ESTABA GUARDADO: se arregla solo, y quien tenía el correo de domicilio deja de salir
# como «sin correo» en su lista.
s = models.SessionLocal()
try:
    malo = models.Promoter(nick="Correo de domicilio", address="dedomicilio@medio.com")
    s.add(malo); s.commit()
    lst3 = models.CorporateGuestList(user_id=A.to_uuid(UID), name="Con el correo mal")
    s.add(lst3); s.commit()
    g3 = models.CorporateGuest(list_id=lst3.id, promoter_id=malo.id, name="Correo de domicilio", email=None)
    s.add(g3); s.commit()
    LID3 = str(lst3.id)
finally:
    s.close()
js3 = cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID3).get_json() or {}
check("antes de arreglarlo sale como que le falta el correo", js3.get("with_email") == 0, js3)
s = models.SessionLocal()
try:
    with A.app.test_request_context("/"):
        hechos = A._repair_contact_fields(s)
    check("el arreglo de lo existente mueve el correo a su campo", hechos.get("promoter_email", 0) >= 1, hechos)
    p3 = s.query(models.Promoter).filter(models.Promoter.nick == "Correo de domicilio").first()
    check("y la ficha queda con su correo y sin ese domicilio",
          (p3.contact_email or "") == "dedomicilio@medio.com" and not (p3.address or ""), (p3.contact_email, p3.address))
    with A.app.test_request_context("/"):
        otra = A._repair_contact_fields(s)
    check("pasarlo otra vez no cambia nada (es idempotente)", not any(otra.values()), otra)
finally:
    s.close()
js4 = cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID3).get_json() or {}
check("y DESPUÉS ya no sale entre los que les falta correo: queda agregado y ya",
      js4.get("with_email") == 1 and (js4.get("rows") or [{}])[0].get("email") == "dedomicilio@medio.com", js4)

print("\n── 5. LA INVITACIÓN: crear, diseñar y enviar ──────────────────────────")
r = cli.post("/invitaciones-corporativas/nueva",
             data={"lists": [LID], "concert_id": CID, "subject": "Te invito a Los Ñus"})
check("crear la invitación lleva AL EDITOR", r.status_code == 302 and "/notas-de-prensa/" in (r.headers.get("Location") or ""),
      (r.status_code, r.headers.get("Location")))
s = models.SessionLocal()
try:
    inv = s.query(models.CorporateInvite).first()
    INV_ID = str(inv.id) if inv else ""
    PR_ID = str(inv.design_release_id) if inv else ""
    check("queda en BORRADOR y con su actividad", inv is not None and inv.status == "DRAFT" and str(inv.concert_id) == CID)
    check("se copia la fecha de la actividad (para ordenar)", inv is not None and inv.activity_date is not None)
    pr = s.get(models.PressRelease, inv.design_release_id)
    check("el diseño nace con purpose=INVITE", pr is not None and pr.purpose == "INVITE", pr.purpose if pr else None)
    bloques = press_render.blocks_of(pr.design or {})
    check("y con el módulo «Datos de la actividad» YA PUESTO",
          len(bloques) == 1 and bloques[0]["type"] == "activity" and bloques[0]["ref"]["concert_id"] == CID, bloques)
finally:
    s.close()

# El EDITOR abre para su dueño
r = cli.get("/notas-de-prensa/%s/editar" % PR_ID)
check("el editor abre (200)", r.status_code == 200, r.status_code)
ed = r.get_data(as_text=True)
check("y se ve que es una invitación corporativa", "Invitación corporativa" in ed)

# Un diseño de INVITE no se cuela en las notas de prensa
r = cli.get("/notas-de-prensa")
check("no sale en la lista de notas de prensa", r.status_code in (200, 302) and "Te invito a Los Ñus" not in r.get_data(as_text=True))

print("\n── 6. SIN CORREO CONFIGURADO NO SE MANDA ──────────────────────────────")
s = models.SessionLocal()
try:
    pr = s.get(models.PressRelease, A.to_uuid(PR_ID))
    pr.design = {"width": 600, "bg": {}, "blocks": []}          # se vacía a propósito
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(pr, "design"); s.commit()
finally:
    s.close()
r = cli.post("/invitaciones-corporativas/%s/enviar" % INV_ID)
js = r.get_json()
check("sin diseño avisa de que hay que diseñarlo", js and not js.get("ok") and "diseñar" in (js.get("error") or "").lower(), js)

# Se le pone contenido al diseño (como haría el editor)
s = models.SessionLocal()
try:
    pr = s.get(models.PressRelease, A.to_uuid(PR_ID))
    d = dict(pr.design or {})
    # Se repone el módulo de la actividad (el paso anterior vació el diseño a propósito) y se añade
    # el titular: es el diseño con el que se manda de verdad.
    d["blocks"] = [
        {"id": "act1", "type": "activity", "x": 40, "y": 40, "w": 520, "h": 170,
         "ref": {"concert_id": CID}, "opts": {}},
        {"id": "t1", "type": "title", "x": 40, "y": 240, "w": 520, "h": 60,
         "html": "<p>Te invito al concierto</p>", "style": {"size": 28, "bold": True}}]
    pr.design = d
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(pr, "design")
    s.commit()
finally:
    s.close()

r = cli.post("/invitaciones-corporativas/%s/enviar" % INV_ID)
js = r.get_json()
check("SIN cuenta de correo propia NO se manda", js and not js.get("ok") and js.get("needs_mail") is True, js)
check("y se dice qué hay que hacer (Integraciones → Correo)",
      js and "Integraciones" in (js.get("error") or ""), js and js.get("error"))
s = models.SessionLocal()
try:
    check("no se ha creado ningún destinatario", s.query(models.CorporateInviteRecipient).count() == 0)
finally:
    s.close()

print("\n── 7. CON su correo configurado, SE MANDA ─────────────────────────────")
s = models.SessionLocal()
try:
    acc = models.MailAccount(label="Dani", from_name="Dani · 33 Producciones",
                             from_email="dani@33producciones.es", smtp_host="smtp.test",
                             smtp_port=465, smtp_security="SSL", smtp_username="dani@33producciones.es",
                             smtp_password="x", is_active=True, user_id=A.to_uuid(UID))
    s.add(acc); s.commit()
finally:
    s.close()

ENVIADOS = []
def _fake_send(to, subject, html, *a, **kw):
    dest = to[0] if isinstance(to, (list, tuple)) else to
    cuerpo = html
    if kw.get("personalize"):
        res = kw["personalize"](dest)
        cuerpo = res[0]
    ENVIADOS.append({"to": dest, "subject": subject, "html": cuerpo,
                     "from_name": kw.get("from_name"), "from_email": kw.get("from_email"),
                     "auto": kw.get("auto_submitted")})
    return True, None
A._send_optional_email = _fake_send

r = cli.post("/invitaciones-corporativas/%s/enviar" % INV_ID)
js = r.get_json()
check("se manda", js and js.get("ok") and js.get("terminado"), js)
check("a los 4 con correo", js and js.get("total") == 4, js)
check("se mandaron 4 correos", len(ENVIADOS) == 4, len(ENVIADOS))
check("SALE DESDE SU CORREO", all(e["from_email"] == "dani@33producciones.es" for e in ENVIADOS),
      [e["from_email"] for e in ENVIADOS])
check("con su nombre", all("Dani" in (e["from_name"] or "") for e in ENVIADOS), [e["from_name"] for e in ENVIADOS])
check("no va como correo automático (se puede contestar)", all(e["auto"] is False for e in ENVIADOS))
check("el asunto es el que se puso", all(e["subject"] == "Te invito a Los Ñus" for e in ENVIADOS))
uno = ENVIADOS[0]["html"]
check("el correo lleva los datos de la actividad", "Los Ñus" in uno and "Sala Prueba" in uno and "21:30 h" in uno)
check("y el titular del diseño", "Te invito al concierto" in uno)
check("cada uno lleva SU píxel de apertura", "/ic/" in uno and "__CORP_TOKEN__" not in uno, uno[-400:])
tokens = set()
for e in ENVIADOS:
    import re as _re
    m = _re.search(r"/ic/([^/]+)/a\.gif", e["html"])
    if m:
        tokens.add(m.group(1))
check("y el token es DISTINTO para cada persona", len(tokens) == 4, len(tokens))

s = models.SessionLocal()
try:
    inv = s.get(models.CorporateInvite, A.to_uuid(INV_ID))
    check("la invitación queda ENVIADA", inv.status == "SENT" and inv.sent_ok == 4, (inv.status, inv.sent_ok))
    check("y se apunta desde qué correo salió", inv.from_email == "dani@33producciones.es", inv.from_email)
finally:
    s.close()

print("\n── 8. NADIE RECIBE DOS VECES ──────────────────────────────────────────")
antes = len(ENVIADOS)
r = cli.post("/invitaciones-corporativas/%s/enviar" % INV_ID)
js = r.get_json()
check("una invitación ya mandada no se vuelve a mandar", js and not js.get("ok"), js)
check("y no sale ni un correo más", len(ENVIADOS) == antes, len(ENVIADOS))

# Quien está en DOS listas recibe UNA
r = cli.post("/invitaciones-corporativas/listas/crear", data={"name": "VIP"}, follow_redirects=True)
s = models.SessionLocal()
try:
    lid2 = str(s.query(models.CorporateGuestList).filter(models.CorporateGuestList.name == "VIP").first().id)
finally:
    s.close()
cli.post("/invitaciones-corporativas/listas/%s/invitados" % lid2, data={"promoter_id": ANA_ID})
cli.post("/invitaciones-corporativas/listas/%s/invitados" % lid2, data={"name": "Fran", "email": "fran@x.com"})
ENVIADOS.clear()
r = cli.post("/invitaciones-corporativas/nueva", data={"lists": [LID, lid2], "concert_id": CID, "subject": "Dos listas"})
s = models.SessionLocal()
try:
    inv2 = s.query(models.CorporateInvite).filter(models.CorporateInvite.subject == "Dos listas").first()
    INV2 = str(inv2.id)
    pr2 = s.get(models.PressRelease, inv2.design_release_id)
    d = dict(pr2.design or {}); d["blocks"] = list(d.get("blocks") or []) + [
        {"id": "t2", "type": "title", "x": 40, "y": 240, "w": 520, "h": 60, "html": "<p>Hola</p>"}]
    pr2.design = d
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(pr2, "design"); s.commit()
finally:
    s.close()
r = cli.post("/invitaciones-corporativas/%s/enviar" % INV2)
js = r.get_json()
check("con dos listas, quien está en las dos recibe UNA sola (4 + Fran = 5)", js and js.get("total") == 5, js)
destinos = [e["to"] for e in ENVIADOS]
check("Ana sale una sola vez", destinos.count("ana@medio.com") == 1, destinos)

print("\n── 9. CUÁNTOS LA HAN ABIERTO ──────────────────────────────────────────")
s = models.SessionLocal()
try:
    r1 = (s.query(models.CorporateInviteRecipient)
          .filter(models.CorporateInviteRecipient.invite_id == A.to_uuid(INV_ID)).first())
    TOK = r1.token
finally:
    s.close()
anon = A.app.test_client()                       # el píxel lo carga el cliente de correo, SIN sesión
r = anon.get("/ic/%s/a.gif" % TOK)
check("el píxel responde sin sesión (200 y un GIF)", r.status_code == 200 and r.headers["Content-Type"] == "image/gif",
      (r.status_code, r.headers.get("Content-Type")))
anon.get("/ic/%s/a.gif" % TOK)                   # abrirla dos veces
s = models.SessionLocal()
try:
    r1 = s.query(models.CorporateInviteRecipient).filter(models.CorporateInviteRecipient.token == TOK).first()
    check("queda apuntado que la abrió", r1.opened_at is not None and r1.open_count == 2, (r1.opened_at, r1.open_count))
finally:
    s.close()
r = cli.get("/invitaciones-corporativas")
cuerpo = r.get_data(as_text=True)
check("el listado dice cuántos la han abierto", "la ha abierto" in cuerpo or "la han abierto" in cuerpo)
r = cli.get("/invitaciones-corporativas/%s" % INV_ID)
check("la ficha abre y dice quién la ha abierto",
      r.status_code == 200 and "Abierta" in r.get_data(as_text=True), r.status_code)

print("\n── 10. ES DE CADA UNO (nadie ve lo de nadie) ──────────────────────────")
s = models.SessionLocal()
try:
    otro_u = s.query(models.User).filter(models.User.email == "otro@33producciones.es").first()
    if otro_u is None:
        otro_u = models.User(email="otro@33producciones.es", password_hash="x", role=1)
        s.add(otro_u); s.flush()
    otro_u.role = 1
    if s.query(models.UserProfile).filter(models.UserProfile.user_id == otro_u.id).first() is None:
        s.add(models.UserProfile(user_id=otro_u.id, nick="Otro", departments=["Producción"]))
    s.commit()
    OTRO = str(otro_u.id)
finally:
    s.close()
cli2 = A.app.test_client()
with cli2.session_transaction() as ses:
    ses["user_id"] = OTRO
    ses["role"] = 1
r = cli2.get("/invitaciones-corporativas")
check("otra persona entra en SU pantalla (es de todos)", r.status_code == 200, r.status_code)
check("y no ve las invitaciones de Dani", "Te invito a Los Ñus" not in r.get_data(as_text=True))
r = cli2.get("/invitaciones-corporativas/listas/%s/invitados" % LID)
check("ni los invitados de una lista que no es suya", r.status_code == 404, r.status_code)
r = cli2.post("/invitaciones-corporativas/listas/%s/invitados" % LID, data={"email": "intruso@x.com"})
check("ni puede añadir a una lista ajena", r.status_code == 404, r.status_code)
r = cli2.get("/invitaciones-corporativas/%s" % INV_ID, follow_redirects=False)
check("ni abrir una invitación ajena", r.status_code == 302, r.status_code)
r = cli2.get("/notas-de-prensa/%s/editar" % PR_ID)
ed2 = r.get_data(as_text=True) if r.status_code == 200 else ""
check("ni EDITAR el diseño de una invitación ajena",
      r.status_code in (302, 403) or 'data-can-edit=""' in ed2, (r.status_code, ed2[:120]))

print("\n── 11. EL BOTÓN DE INICIO lo ve TODO EL MUNDO ─────────────────────────")
with A.app.test_request_context("/"):
    from flask import session as _fs
    _fs["user_id"] = OTRO
    _fs["role"] = 1
    acciones = A._build_home_quick_actions()
    claves = [a["key"] for a in acciones]
    check("alguien de Producción ve «Invitación corporativa»", "invitaciones_corp" in claves, claves)
with A.app.test_request_context("/"):
    from flask import session as _fs2
    _fs2["user_id"] = UID
    _fs2["role"] = 10
    claves = [a["key"] for a in A._build_home_quick_actions()]
    check("y dirección también", "invitaciones_corp" in claves, claves)

print("\n── 12. LAS MÁS PRÓXIMAS PRIMERO ───────────────────────────────────────")
s = models.SessionLocal()
try:
    art2 = models.Artist(name="Otros"); s.add(art2); s.flush()
    c_lejos = models.Concert(artist_id=art2.id, sale_type="VENDIDO", capacity=500,
                             date=datetime.date.today() + datetime.timedelta(days=200),
                             activity_type="FESTIVAL", status="CONFIRMADO")
    c_pasado = models.Concert(artist_id=art2.id, sale_type="VENDIDO", capacity=500,
                              date=datetime.date.today() - datetime.timedelta(days=30),
                              activity_type="CONCIERTO", status="CONFIRMADO")
    s.add_all([c_lejos, c_pasado]); s.flush()
    c_viejo = models.Concert(artist_id=art2.id, sale_type="VENDIDO", capacity=500,
                             date=datetime.date.today() - datetime.timedelta(days=90),
                             activity_type="CONCIERTO", status="CONFIRMADO")
    s.add(c_viejo); s.flush()
    for titulo, cc in (("Lejana", c_lejos), ("Pasada", c_pasado), ("Más vieja", c_viejo)):
        iv = models.CorporateInvite(user_id=A.to_uuid(UID), subject=titulo, concert_id=cc.id,
                                    activity_date=cc.date, status="SENT",
                                    sent_at=A._now_madrid(), total=1, sent_ok=1)
        s.add(iv)
    s.commit()
finally:
    s.close()
with A.app.test_request_context("/"):
    from flask import session as _fs3
    _fs3["user_id"] = UID
    _fs3["role"] = 10
    s = models.SessionLocal()
    try:
        filas = A._corp_invites_rows(s, A.to_uuid(UID))
        orden = [f["subject"] for f in filas]
        print("     orden:", orden)
        i_prox = orden.index("Te invito a Los Ñus")      # dentro de 45 días
        i_lejos = orden.index("Lejana")                  # dentro de 200
        i_pasada = orden.index("Pasada")                 # hace 30 días
        check("la más próxima va antes que la lejana", i_prox < i_lejos, orden)
        check("y las pasadas van al final", i_lejos < i_pasada, orden)
        # ⚠️ Dentro de las pasadas manda la MÁS RECIENTE, y el orden sale del instante en crudo
        # (ordenar por la etiqueta «dd/mm/aaaa» ordenaría por el día del mes).
        i_vieja = orden.index("Más vieja")
        check("entre las pasadas, la más reciente primero", i_pasada < i_vieja, orden)
    finally:
        s.close()

print("\n── 13. PRUEBA DE HUMO: todas las pantallas nuevas ─────────────────────")
for ruta in ["/invitaciones-corporativas",
             "/invitaciones-corporativas?tab=listas",
             "/invitaciones-corporativas/%s" % INV_ID,
             "/invitaciones-corporativas/%s/previsualizar" % INV_ID,
             "/invitaciones-corporativas/%s/estado" % INV_ID,
             "/notas-de-prensa/%s/editar" % PR_ID,
             "/notas-de-prensa/%s/recursos" % PR_ID]:
    r = cli.get(ruta)
    check("GET %s" % ruta, r.status_code == 200, r.status_code)
# La página pública de la invitación (el «ver en el navegador»)
s = models.SessionLocal()
try:
    pr = s.get(models.PressRelease, A.to_uuid(PR_ID))
    TOKPR = pr.public_token
finally:
    s.close()
r = anon.get("/nota-de-prensa/%s" % TOKPR)
check("la página pública abre sin sesión", r.status_code == 200, r.status_code)
check("y se presenta como «Invitación», no como nota de prensa",
      "Invitación" in r.get_data(as_text=True) and "Nota de prensa" not in r.get_data(as_text=True))

print("\n── 14. MI LISTA DE INVITADOS: el NICK, la VINCULACIÓN y las marcas ────")
# ⚠️ Lo pidió Dani: en la fila se lee **el nick** (no el nombre completo), por ORDEN ALFABÉTICO, y
# debajo, más pequeña y con su logo, la VINCULACIÓN. Y dos marcas: a quién no le llega y quién no
# abre lo que se le manda.
s = models.SessionLocal()
try:
    # Una lista propia con tres personas de nicks deliberadamente desordenados y con acento.
    lst = models.CorporateGuestList(user_id=A.to_uuid(UID), name="Orden")
    s.add(lst); s.flush()
    LID_ORD = str(lst.id)
    medio = models.Promoter(nick="Radio Ñ", logo_url="https://x/radio.jpg")
    s.add(medio); s.flush()
    nicks = [("Zoe", "zoe@x.com"), ("Álvaro", "alvaro@x.com"), ("Bruno", "bruno@x.com")]
    creados = {}
    for nick, correo in nicks:
        p = models.Promoter(nick=nick, first_name=nick, last_name="Pérez", contact_email=correo,
                            logo_url="https://x/%s.jpg" % nick.lower())
        s.add(p); s.flush()
        creados[nick] = p
        s.add(models.CorporateGuest(list_id=lst.id, promoter_id=p.id, name="%s Pérez" % nick, email=correo))
    # Álvaro está VINCULADO a la emisora, con su relación.
    s.add(models.ThirdPartyLink(source_type="promoter", source_id=creados["Álvaro"].id,
                                target_type="promoter", target_id=medio.id, relation_title="director"))
    s.commit()
finally:
    s.close()

r = cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD)
js = r.get_json() or {}
filas = js.get("rows") or []
check("la lista se lee (200)", r.status_code == 200 and js.get("ok"), r.status_code)
check("lo que se muestra es EL NICK", [f.get("nick") for f in filas] == ["Álvaro", "Bruno", "Zoe"],
      [f.get("nick") for f in filas])
check("y NO el nombre completo", all(f["nick"] != f["name"] for f in filas), [(f["nick"], f["name"]) for f in filas])
check("ORDEN ALFABÉTICO por nick, y el acento no lo altera",
      [f["sort_key"] for f in filas] == sorted(f["sort_key"] for f in filas), [f["sort_key"] for f in filas])
alv = [f for f in filas if f["nick"] == "Álvaro"][0]
check("la VINCULACIÓN va en la fila", (alv.get("link") or {}).get("label") == "Radio Ñ", alv.get("link"))
check("con su relación", (alv.get("link") or {}).get("relation") == "director", alv.get("link"))
check("y con su logo o su foto", bool((alv.get("link") or {}).get("logo_url")), alv.get("link"))
check("quien no tiene vinculación no la lleva", [f for f in filas if f["nick"] == "Zoe"][0].get("link") is None)
check("el nick lleva a su ficha", all(f.get("promoter_url") for f in filas))

# LAS MARCAS: se siembran envíos ya hechos (es lo que mira `_corp_mail_health`).
s = models.SessionLocal()
try:
    ahora = A._now_madrid()
    # ⚠️ «Los últimos correos» son los de DISTINTAS invitaciones (en una misma no se recibe dos
    # veces: lo impide el UNIQUE), que es exactamente como pasa en la vida real.
    invs = []
    for i in range(2):
        iv = models.CorporateInvite(user_id=A.to_uuid(UID), subject="Marcas %d" % i, status="SENT",
                                    lists_json=[LID_ORD])
        s.add(iv); s.flush()
        invs.append(iv)
        # Zoe: DOS correos entregados y ninguno abierto → sobre tachado
        s.add(models.CorporateInviteRecipient(invite_id=iv.id, email="zoe@x.com", token="tk-z%d" % i,
                                              status="ENVIADO", sent_at=ahora))
    # Álvaro: UNO solo sin abrir → todavía no se marca (son «los últimos», en plural)
    s.add(models.CorporateInviteRecipient(invite_id=invs[0].id, email="alvaro@x.com", token="tk-a0",
                                          status="ENVIADO", sent_at=ahora))
    # Bruno: el último REBOTÓ porque la dirección no existe → triángulo
    s.add(models.CorporateInviteRecipient(invite_id=invs[0].id, email="bruno@x.com", token="tk-b1",
                                          status="ERROR", error="550 5.1.1 No such user here", sent_at=ahora))
    s.commit()
finally:
    s.close()
filas = (cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD).get_json() or {}).get("rows") or []
por_nick = {f["nick"]: f for f in filas}
check("a quien REBOTÓ el correo se le marca", por_nick["Bruno"]["mail_status"] == "error", por_nick["Bruno"])
check("y se distingue «ese correo NO EXISTE» de un fallo pasajero", por_nick["Bruno"]["mail_hard"] is True)
check("un fallo pasajero NO se marca como inexistente",
      A._corp_error_is_bounce("451 timeout, try again later") is False)
check("quien no abre los últimos correos se marca", por_nick["Zoe"]["mail_status"] == "unopened", por_nick["Zoe"])
check("con UN solo correo sin abrir todavía NO se marca (son «los últimos», en plural)",
      por_nick["Álvaro"]["mail_status"] == "", por_nick["Álvaro"])
js = cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD).get_json() or {}
check("la cabecera de la lista dice cuántos no le llegan", js.get("bounced") == 1, js.get("bounced"))
check("y cuántos no abren", js.get("quiet") == 1, js.get("quiet"))
# ⚠️ El mismo dato en la pantalla entera (la galleta sale del MISMO sitio que la marca de la fila).
html = cli.get("/invitaciones-corporativas?tab=listas").get_data(as_text=True)
check("la pantalla pinta la galleta de «no le llega»", "no le llega" in html)
check("y la de «sin abrir»", "sin abrir" in html)
# Se puede AGREGAR y QUITAR gente.
r = cli.post("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD, data={"name": "Nuevo", "email": "nuevo@x.com"})
check("se puede AÑADIR a alguien", (r.get_json() or {}).get("ok") is True, r.get_json())
filas = (cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD).get_json() or {}).get("rows") or []
gid = [f["id"] for f in filas if f["email"] == "nuevo@x.com"][0]
r = cli.post("/invitaciones-corporativas/invitados/%s/quitar" % gid)
check("y QUITARLO", (r.get_json() or {}).get("ok") is True, r.get_json())
filas = (cli.get("/invitaciones-corporativas/listas/%s/invitados" % LID_ORD).get_json() or {}).get("rows") or []
check("se ha quitado de verdad", "nuevo@x.com" not in [f["email"] for f in filas])

print("\n── 15. LA PANTALLA PREVIA AL ENVÍO (la MISMA de toda la app) ──────────")
# ⚠️ Lo pidió Dani: «hemos dicho que esta función siempre es igual en todos los sitios». Se comprueba
# que es LITERALMENTE la misma plantilla y el mismo motor que la de una nota de prensa.
# ⚠️ SIN DISEÑO no hay nada que enviar ni que previsualizar: se lleva al editor. Hace falta una
# invitación SIN actividad, porque con actividad el módulo de sus datos nace YA PUESTO.
cli.post("/invitaciones-corporativas/nueva", data={"lists": [LID_ORD], "subject": "Sin diseño"})
s = models.SessionLocal()
try:
    inv0 = s.query(models.CorporateInvite).filter(models.CorporateInvite.subject == "Sin diseño").first()
    INV0 = str(inv0.id)
finally:
    s.close()
r = cli.get("/invitaciones-corporativas/%s/enviar" % INV0)
check("sin diseño, «Enviar» lleva al editor", r.status_code == 302 and "/editar" in r.headers.get("Location", ""),
      r.headers.get("Location"))

r = cli.post("/invitaciones-corporativas/nueva", data={"lists": [LID_ORD], "concert_id": CID, "subject": "Con pantalla"})
check("crear lleva al editor", r.status_code == 302 and "/editar" in r.headers.get("Location", ""), r.headers.get("Location"))
s = models.SessionLocal()
try:
    inv2 = s.query(models.CorporateInvite).filter(models.CorporateInvite.subject == "Con pantalla").first()
    INV2, PR2 = str(inv2.id), str(inv2.design_release_id)
    check("con actividad, el diseño nace con su módulo puesto", bool((inv2.design_release.design or {}).get("blocks")))
    pr2 = s.get(models.PressRelease, A.to_uuid(PR2))
    pr2.design = {"width": 600, "bg": {}, "blocks": [
        {"id": "t1", "type": "title", "x": 20, "y": 20, "w": 520, "h": 60, "html": "<p>Te invito</p>"}]}
    s.commit()
finally:
    s.close()
r = cli.get("/invitaciones-corporativas/%s/enviar" % INV2)
html = r.get_data(as_text=True)
check("la pantalla previa al envío abre (200)", r.status_code == 200, r.status_code)
check("lleva LA VISTA PREVIA del correo", 'class="pr-send__frame"' in html and "/previsualizar" in html)
check("y la opción de EMAIL DE PRUEBA", 'id="prConfirmModal"' in html and "mándame la prueba" in html)
check("usa el MISMO motor que las notas de prensa", "js/press_send.js" in html)
check("dice de quién sale (su propio correo)", "dani@33producciones.es" in html)
check("enseña a quién se le va a mandar, por listas", 'data-pr-recip' in html and "Orden" in html)
check("con el NICK de cada uno", ">Álvaro<" in html and ">Zoe<" in html, None)
check("y con sus marcas de correo", "ci-guest__mark" in html)
check("se puede añadir a alguien más antes de mandar", "data-pr-search" in html and "data-pr-manual" in html)
check("un envío NO se programa (eso es de las notas de prensa)", 'name="when"' not in html)
# El correo de PRUEBA sale, y NO cuenta como que alguien la ha abierto.
ENVIADOS.clear()
r = cli.post("/invitaciones-corporativas/%s/prueba" % INV2, json={"email": "dani@33producciones.es"})
js = r.get_json() or {}
check("el email de PRUEBA se manda", js.get("ok") is True, js)
check("al correo de quien la está preparando", js.get("email") == "dani@33producciones.es", js)
check("y se marca como prueba en el asunto", ENVIADOS and ENVIADOS[0]["subject"].startswith("[PRUEBA]"),
      ENVIADOS and ENVIADOS[0]["subject"])
s = models.SessionLocal()
try:
    check("la prueba NO crea ningún destinatario", s.query(models.CorporateInviteRecipient)
          .filter(models.CorporateInviteRecipient.invite_id == A.to_uuid(INV2)).count() == 0)
finally:
    s.close()
# Enviar SOLO a los marcados: se quita a uno y se añade a alguien de fuera.
ENVIADOS.clear()
r = cli.post("/invitaciones-corporativas/%s/enviar" % INV2, json={"recipients": [
    {"email": "alvaro@x.com", "name": "Álvaro Pérez", "group_label": "Orden"},
    {"email": "invitado@fuera.com", "name": "De fuera", "group_label": "Añadidos"}]})
js = r.get_json() or {}
check("se manda a los MARCADOS", js.get("ok") is True and js.get("total") == 2, js)
destinos = sorted(e["to"] for e in ENVIADOS)
check("al que se quitó NO le llega", "zoe@x.com" not in destinos, destinos)
check("y al añadido a mano SÍ", "invitado@fuera.com" in destinos, destinos)
check("al terminar lleva a la ficha de la invitación", "/invitaciones-corporativas/%s" % INV2 in (js.get("url") or ""),
      js.get("url"))

print("\n── 16. LA FICHA DE UNA ENVIADA: abierta · reenviada · no le llegó ─────")
s = models.SessionLocal()
try:
    filas = (s.query(models.CorporateInviteRecipient)
             .filter(models.CorporateInviteRecipient.invite_id == A.to_uuid(INV2)).all())
    TOK_ALV = [f.token for f in filas if f.email == "alvaro@x.com"][0]
finally:
    s.close()
# La abre ELLA (un navegador) …
anon.get("/ic/%s/a.gif" % TOK_ALV, headers={"User-Agent": "Mail/1.0 iPhone"})
s = models.SessionLocal()
try:
    r1 = s.query(models.CorporateInviteRecipient).filter(models.CorporateInviteRecipient.token == TOK_ALV).first()
    check("queda apuntado que la ABRIÓ", r1.opened_at is not None)
    check("y todavía no consta como reenviada", r1.forwarded_at is None)
finally:
    s.close()
# … la vuelve a abrir en el MISMO sitio: eso no es un reenvío.
anon.get("/ic/%s/a.gif" % TOK_ALV, headers={"User-Agent": "Mail/1.0 iPhone"})
s = models.SessionLocal()
try:
    r1 = s.query(models.CorporateInviteRecipient).filter(models.CorporateInviteRecipient.token == TOK_ALV).first()
    check("abrirla otra vez en el mismo sitio NO es reenviarla", r1.forwarded_at is None and r1.open_count == 2,
          (r1.forward_count, r1.open_count))
finally:
    s.close()
# … y ahora se abre desde OTRO sitio: el correo está en manos de alguien más.
anon.get("/ic/%s/a.gif" % TOK_ALV, headers={"User-Agent": "Outlook/16 Windows"})
s = models.SessionLocal()
try:
    r1 = s.query(models.CorporateInviteRecipient).filter(models.CorporateInviteRecipient.token == TOK_ALV).first()
    check("abrirla desde OTRO sitio es REENVIARLA", r1.forwarded_at is not None and r1.forward_count == 1,
          (r1.forwarded_at, r1.forward_count))
    # Y uno al que no le llegó (dirección inexistente).
    malo = [f for f in s.query(models.CorporateInviteRecipient)
            .filter(models.CorporateInviteRecipient.invite_id == A.to_uuid(INV2)).all()
            if f.email == "invitado@fuera.com"][0]
    malo.status, malo.error = "ERROR", "550 5.1.1 Recipient address rejected: User unknown"
    s.commit()
finally:
    s.close()
r = cli.get("/invitaciones-corporativas/%s" % INV2)
html = r.get_data(as_text=True)
check("la ficha abre (200)", r.status_code == 200, r.status_code)
check("enseña el LISTADO de a quién se le mandó", "A quién se le mandó" in html)
check("con el icono de ABIERTA", "fa-envelope-open" in html)
check("con el icono de REENVIADA", "fa-share-from-square" in html and "La ha reenviado" in html)
check("y con el triángulo de «ese correo no existe»",
      "fa-triangle-exclamation" in html and "Ese correo no existe" in html)
check("cada uno con su NICK", ">Álvaro<" in html)
check("y con su vinculación", "Radio Ñ" in html)
check("hay leyenda de qué es cada icono", "reenviada" in html and "no le llega" in html or "no existe" in html)
# La tarjeta del listado lleva a la ficha, y NO es un `<a>` (dentro ya hay enlaces y un formulario).
html = cli.get("/invitaciones-corporativas").get_data(as_text=True)
check("una invitación ENVIADA se pincha entera", 'data-ci-open="/invitaciones-corporativas/%s"' % INV2 in html)
check("y un BORRADOR no (todavía no hay nada que ver)",
      'data-ci-open="/invitaciones-corporativas/%s"' % INV0 not in html and ('data-ci-invite="%s"' % INV0) in html)
check("el listado dice cuántas se han reenviado", "reenviado" in html)

print("\n── 17. EL MÓDULO DE VÍDEO DE YOUTUBE ──────────────────────────────────")
# ⚠️ Lo pidió Dani: se arrastra, se pincha para poner la URL, sale la miniatura con el play rojo y
# se reproduce en un pop-up. Se mueve, se cambia de tamaño y se pueden poner todos los que hagan falta.
VID = "dQw4w9WgXcQ"
for texto in ("https://www.youtube.com/watch?v=" + VID,
              "https://youtu.be/" + VID,
              "https://youtu.be/%s?t=42" % VID,
              "https://www.youtube.com/embed/" + VID,
              "https://www.youtube.com/shorts/" + VID,
              "https://www.youtube.com/live/" + VID,
              "https://m.youtube.com/watch?app=desktop&v=" + VID,
              VID):
    check("se entiende «%s»" % texto[:44], A.youtube_video_id(texto) == VID, A.youtube_video_id(texto))
for malo in ("", "https://vimeo.com/12345", "https://www.youtube.com/watch?v=corto", "pásame el enlace"):
    check("y NO se traga «%s»" % (malo or "(vacío)"), A.youtube_video_id(malo) == "")

with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        pr = models.PressRelease(purpose="INVITE", status="DRAFT", subject_kind="ARTIST", artist_ids=[],
                                 about_kind="SUBJECT", design={"blocks": []}, public_token="tok-yt")
        b = {"type": "youtube", "x": 0, "y": 0, "w": 520, "h": 292, "ref": {"url": "https://youtu.be/" + VID}}
        res = A._press_resolve_blocks(s, pr, {"blocks": [b]}, "tok-yt")
        bl = press_render.blocks_of(res)[0]
        d = bl.get("data") or {}
        check("el módulo resuelve el vídeo", d.get("video_id") == VID, d.get("video_id"))
        check("la miniatura es NUESTRA, no una URL de YouTube",
              "/video/%s/portada.png" % VID in (d.get("thumb_url") or "") and "ytimg" not in (d.get("thumb_url") or ""),
              d.get("thumb_url"))
        check("y el pop-up también es nuestro", "/video/%s" % VID in (d.get("popup_url") or ""), d.get("popup_url"))
        html = press_render.module_html(bl, for_email=True)
        check("en el correo se ve LA MINIATURA", "/portada.png" in html and "<img" in html)
        check("y se pincha para ver el vídeo", 'href="' in html and "/video/%s" % VID in html)
        # ⚠️ El módulo es SOLO el enlace con su imagen: ni título, ni botón, ni tarjeta alrededor
        # (lo pidió Dani así). El `alt` sí va: es lo que lee quien no ve la imagen.
        import re as _re
        check("SIN título ni nada más (lo pidió Dani así)",
              _re.fullmatch(r'<a [^>]*><img [^>]*></a>', html) is not None, html[:220])
        check("y sin tarjeta ni texto alrededor",
              "<div" not in html and "<table" not in html and "YouTube" not in html, html[:220])
        # Sin URL: hueco en el editor, nada fuera de él.
        vacio = {"type": "youtube", "x": 0, "y": 0, "w": 520, "h": 292, "ref": {}}
        bv = press_render.blocks_of(A._press_resolve_blocks(s, pr, {"blocks": [vacio]}, "tok-yt"))[0]
        check("sin URL queda PENDIENTE", press_render.is_pending(bv) is True)
        check("y no se pinta en el correo", press_render.module_html(bv, for_email=True) == "")
        check("pero en el editor invita a completarlo",
              "Pincha para pegar la URL" in press_render.module_html(bv, editing=True))
        # VARIOS vídeos en el mismo correo, cada uno el suyo.
        dos = A._press_resolve_blocks(s, pr, {"blocks": [
            {"type": "youtube", "x": 0, "y": 0, "w": 520, "h": 292, "ref": {"url": "https://youtu.be/" + VID}},
            {"type": "youtube", "x": 0, "y": 320, "w": 260, "h": 146, "ref": {"url": "https://youtu.be/aaaaaaaaaaa"}}]}, "tok-yt")
        bls = press_render.blocks_of(dos)
        check("se pueden poner TODOS los que hagan falta", len(bls) == 2 and
              bls[0]["data"]["video_id"] != bls[1]["data"]["video_id"],
              [x["data"]["video_id"] for x in bls])
        check("y cada uno con su tamaño", bls[0]["w"] == 520 and bls[1]["w"] == 260)
        check("la versión en TEXTO del correo lleva el enlace del vídeo",
              "youtube.com/watch?v=%s" % VID in press_render.plain_text(dos))
    finally:
        s.close()

# Las dos páginas públicas: se abren SIN sesión (un correo se abre fuera de la app).
r = anon.get("/video/%s" % VID)
html = r.get_data(as_text=True)
check("el POP-UP del vídeo abre sin sesión", r.status_code == 200, r.status_code)
check("y reproduce directamente", "autoplay=1" in html)
check("sin sugerencias al acabar", "rel=0" in html)
check("y sin llevarle las cookies de Google a quien lo ve", "youtube-nocookie.com" in html)
check("un identificador inventado no abre nada", anon.get("/video/no-es-un-video").status_code == 404)
check("la miniatura tampoco", anon.get("/video/no-es-un-video/portada.png").status_code == 404)
# ⚠️ Sin internet la miniatura NO puede dejar el correo con un hueco roto: se va al sitio de siempre.
_orig = A._youtube_thumb_png
A._youtube_thumb_png = lambda v: b""
r = anon.get("/video/%s/portada.png" % VID)
check("si YouTube no contesta, la miniatura no deja un hueco roto", r.status_code in (302, 200), r.status_code)
A._youtube_thumb_png = _orig
# Y la paleta del editor lo ofrece SIEMPRE (no sale de los materiales de nadie).
html = cli.get("/notas-de-prensa/%s/editar" % PR_ID).get_data(as_text=True)
check("el editor trae el pop-up de la URL", 'id="prYoutubeModal"' in html)
js_edit = io.open("static/js/press_editor.js", encoding="utf-8").read()
check("y la paleta ofrece el vídeo siempre", 'data-pr-pal="youtube"' in js_edit)
check("se mueve y se cambia de tamaño como los demás (16:9)", "b.type === 'youtube') return 9 / 16" in js_edit)

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
if KO:
    print("  FALLAN:")
    for k in KO:
        print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
