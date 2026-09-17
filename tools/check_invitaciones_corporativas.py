#!/usr/bin/env python3
"""INVITACIONES CORPORATIVAS · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y una BD de PRUEBA:
  · el MÓDULO «Datos de la actividad» del editor: qué es, el artista con su foto, la fecha con su
    día de la semana, el recinto, la hora y el CARTEL a la izquierda de la viñeta (y sus iconos como
    PNG, que en un correo no carga ninguna fuente de iconos)
  · que la paleta del editor lo ofrece, y solo con actividades POR VENIR
  · MIS LISTAS: crear, añadir a alguien (un tercero que ya está o uno nuevo, que se crea) y que
    nadie entra dos veces
  · SUBIR UN FICHERO: crea los terceros que no existan, engancha los que ya están (por su correo),
    descarta las filas sin correo diciendo cuántas, y reimportar el mismo fichero deja lo mismo
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

print("\n── 4. SUBIR UN FICHERO ────────────────────────────────────────────────")
csv = ("Nombre;Apellidos;Email;Teléfono\n"
       "Carlos;Gómez;carlos@nuevo.com;600333444\n"
       "Bea;Ruiz;bea@empresa.com;655000111\n"          # ya está: se engancha, no se duplica
       "Diego;Sanz;;600555666\n"                       # sin correo: no entra, y se dice
       "Elena;Mora;elena@otra.com;\n")
r = cli.post("/invitaciones-corporativas/listas/%s/importar" % LID,
             data={"file": (io.BytesIO(csv.encode("utf-8")), "invitados.csv")},
             content_type="multipart/form-data")
js = r.get_json()
check("el fichero se importa", js and js.get("ok"), js)
check("dice cuántos son nuevos, cuántos ya estaban y cuántos sin correo",
      js and "nuevo" in (js.get("message") or "") and "sin correo" in (js.get("message") or ""), js and js.get("message"))
s = models.SessionLocal()
try:
    check("se crea el TERCERO que no existía",
          s.query(models.Promoter).filter(models.Promoter.contact_email == "carlos@nuevo.com").first() is not None)
    check("el que ya existía NO se duplica",
          s.query(models.Promoter).filter(models.Promoter.contact_email == "bea@empresa.com").count() == 1)
    check("el que ya estaba en la lista tampoco entra dos veces",
          s.query(models.CorporateGuest).filter(models.CorporateGuest.list_id == A.to_uuid(LID),
                                                models.CorporateGuest.email == "bea@empresa.com").count() == 1)
    check("la fila SIN CORREO no se importa",
          s.query(models.Promoter).filter(models.Promoter.contact_phone == "600555666").first() is None)
    total = s.query(models.CorporateGuest).filter(models.CorporateGuest.list_id == A.to_uuid(LID)).count()
    check("la lista tiene 4 invitados (Ana, Bea, Carlos, Elena)", total == 4, total)
finally:
    s.close()

# Reimportar el MISMO fichero no infla nada
r = cli.post("/invitaciones-corporativas/listas/%s/importar" % LID,
             data={"file": (io.BytesIO(csv.encode("utf-8")), "invitados.csv")},
             content_type="multipart/form-data")
s = models.SessionLocal()
try:
    total = s.query(models.CorporateGuest).filter(models.CorporateGuest.list_id == A.to_uuid(LID)).count()
    check("reimportar el mismo fichero deja lo mismo", total == 4, total)
finally:
    s.close()

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

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
if KO:
    print("  FALLAN:")
    for k in KO:
        print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
