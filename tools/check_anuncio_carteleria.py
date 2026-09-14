#!/usr/bin/env python3
"""PEDIRLE AL PROMOTOR LA FECHA DE ANUNCIO Y LOS CARTELES · prueba de regresión.

Comprueba, contra la app REAL y la BD de PRUEBA, la épica entera:

  1. el BOTÓN de la barra de la ficha y sus tres rótulos (las dos cosas · solo carteles · solo la
     fecha), y que desaparece cuando ya no hay nada que pedir;
  2. el CORREO al promotor (título, texto y sus DOS botones) y su vista previa, que es el mismo;
  3. la PÁGINA PÚBLICA de la fecha de anuncio: se abre sin identificarse, el calendario va de hoy
     al día de la actividad, ese día está marcado y lo que se confirma queda puesto (con su hora);
  4. la DOBLE APROBACIÓN de un cartel: primero diseño (`DESIGN_OK`) y después contratación
     (`APPROVED`), y quién puede dar cada uno;
  5. que en cuanto están los dos vistos buenos los carteles se le mandan SOLOS al artista;
  6. el RECORDATORIO del día del anuncio (SMS con los carteles y, si ya está a la venta, su enlace);
  7. y que los dos vistos buenos funcionan **con permisos de verdad** (un diseñador y alguien de
     contratación, sin ser dirección): que el GATE no les eche antes de llegar a la vista.

    /tmp/python/bin/python3 tools/check_anuncio_carteleria.py

Requiere el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
Crea sus propios datos (con un sufijo distinto en cada pasada), así que se puede repetir.
Sale con código 1 si algo falla, para poder usarla en CI.
"""
import datetime
import os
import pathlib
import sys
import tempfile
import uuid

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))

# ⚠️ Los CERROJOS, ANTES de importar: si no, el hilo del bootstrap ejecuta todos los `ensure_*`.
tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-anuncio")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import models                                        # noqa: E402
import app as A                                      # noqa: E402

A.app.config["WTF_CSRF_ENABLED"] = False   # ⚠️ sin esto, todo POST del test_client da un 302

OK, KO = [], []


def comprueba(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  OK    " if cond else "  FALLA  ") + nombre
          + ((" · " + str(extra)[:250]) if (extra and not cond) else ""))


def main() -> int:
    # El esquema de la BD de prueba, al día (los `ensure_*` de lo que toca esta épica).
    models.Base.metadata.create_all(models.engine)
    models.ensure_artist_notifications_schema()
    models.ensure_concert_artwork_schema()

    s = models.SessionLocal()
    suf = uuid.uuid4().hex[:6]
    hoy = datetime.date.today()
    fecha = hoy + datetime.timedelta(days=60)

    co = models.GroupCompany(name="33 P %s" % suf, logo_url="https://x/logo.png")
    art = models.Artist(name="Los Ñus %s" % suf, photo_url="https://x/foto.jpg")
    ven = models.Venue(name="Sala %s" % suf, municipality="Móstoles", province="Madrid")
    prom = models.Promoter(nick="Promotora %s" % suf, contact_email="promotor+%s@ejemplo.com" % suf)
    s.add_all([co, art, ven, prom])
    s.flush()
    # A quién se avisa del artista (correo y teléfono) en el canal de actividades.
    s.add(models.ArtistNotificationContact(
        artist_id=art.id, name="Manager", email="manager+%s@ejemplo.com" % suf,
        phone="+34600111222", channels=["ACTIVIDADES_CACHE", "ACTIVIDADES_SIN_CACHE"]))

    def usuario(correo, rol):
        u = s.query(models.User).filter(models.User.email == correo).first()
        if not u:
            u = models.User(email=correo, password_hash="x", role=rol)
            s.add(u)
            s.flush()
        u.role = rol
        return u

    yo = usuario("check_anuncio@33.es", 10)              # dirección: puede los dos vistos buenos
    gestor = usuario("check_anuncio_gestor@33.es", 5)    # quien gestiona la actividad

    def concierto(**kw):
        datos = dict(artist_id=art.id, venue_id=ven.id, promoter_id=prom.id, date=fecha,
                     activity_type="CONCIERTO", sale_type="VENDIDO", status="CONFIRMADO",
                     capacity=500, billing_company_id=co.id, show_time="21:00")
        datos.update(kw)
        c = models.Concert(**datos)
        s.add(c)
        s.flush()
        return c

    c = concierto(created_by_user_id=gestor.id)
    s.commit()
    cid = str(c.id)

    # Ni correos ni SMS de verdad: se apunta lo que se habría mandado.
    correos, smss = [], []
    A._send_optional_email = lambda to, subject, html, **kw: (correos.append((to, subject, html)) or (True, None))
    A._send_optional_sms = lambda ses, to, text, **kw: (smss.append((to, text)) or (True, None))
    A._sms_available = lambda: True

    cli = A.app.test_client()
    with cli.session_transaction() as ses:
        ses["user_id"] = str(yo.id)
        ses["role"] = 10

    # ── 1 · EL BOTÓN DE LA BARRA ───────────────────────────────────────────────────────────
    print("\n1 · El botón de la ficha")
    html = cli.get("/conciertos/%s?tab=general" % cid).get_data(as_text=True)
    comprueba("con todo por pedir, «Solicitar cartelería y fecha de anuncio»",
              "Solicitar cartelería y fecha de anuncio" in html)
    comprueba("y su pop-up está en la página", 'id="announceAskModal"' in html)

    # ── 2 · EL CORREO Y SU VISTA PREVIA ────────────────────────────────────────────────────
    print("\n2 · El correo (y su vista previa, que es el mismo)")
    d = cli.post("/conciertos/%s/anuncio/solicitar/previa" % cid,
                 data={"delivery_deadline": (hoy + datetime.timedelta(days=10)).isoformat()}).get_json() or {}
    previa = d.get("html") or ""
    comprueba("la previa se compone", bool(d.get("ok")), d.get("error"))
    comprueba("título: «Confirmación fecha de anuncio y Cartelería»",
              "Confirmación fecha de anuncio y Cartelería" in previa)
    comprueba("el texto es el de la casa",
              "Tenemos pendiente anunciar el concierto de Móstoles" in previa, previa[:300])
    comprueba("dice de quién es", ("de Los Ñus %s" % suf) in previa)
    comprueba("pide las dos cosas",
              "Por favor confirma la fecha de anuncio y compártenos el diseño de carteles." in previa)
    comprueba("lleva los DOS botones",
              "Subir carteles" in previa and "Confirmar fecha de anuncio" in previa)
    comprueba("el logo de la empresa va arriba a la derecha",
              "text-align:right" in previa and "logo.png" in previa)
    comprueba("la cabecera lleva los datos de la actividad", fecha.strftime("%d/%m/%Y") in previa)
    comprueba("el intro NO sale con etiquetas a la vista", "&lt;p&gt;" not in previa)

    correos.clear()
    cli.post("/conciertos/%s/anuncio/solicitar" % cid, data={
        "to_email": prom.contact_email,
        "delivery_deadline": (hoy + datetime.timedelta(days=10)).isoformat(),
    }, follow_redirects=True)
    s.expire_all()
    c = s.get(models.Concert, c.id)
    req = s.query(models.ConcertArtworkRequest).filter_by(concert_id=c.id).first()
    comprueba("el correo sale", len(correos) == 1, correos)
    comprueba("queda apuntado a quién, cuándo y QUÉ se pidió",
              bool(c.announce_ask_at) and c.announce_ask_kind == "BOTH"
              and c.announce_ask_recipients == [prom.contact_email],
              (c.announce_ask_at, c.announce_ask_kind, c.announce_ask_recipients))
    comprueba("la cartelería queda pedida al promotor",
              req is not None and req.handled_by == "PROMOTER" and req.status == "REQUESTED")
    cuerpo = correos[0][2] if correos else ""
    comprueba("el correo lleva el enlace de la fecha", "/anuncio/%s" % c.announce_ask_token in cuerpo)
    comprueba("y el de los carteles", "/carteleria/%s" % req.public_token in cuerpo)

    # ── 3 · LA PÁGINA PÚBLICA DE LA FECHA ──────────────────────────────────────────────────
    print("\n3 · La página del promotor")
    anon = A.app.test_client()
    pag = anon.get("/anuncio/%s" % c.announce_ask_token).get_data(as_text=True)
    comprueba("se abre SIN identificarse", "Confirmación fecha de anuncio" in pag)
    comprueba("con la cabecera de la actividad",
              "Móstoles" in pag and fecha.strftime("%d/%m/%Y") in pag)
    comprueba("hay calendario", pag.count("data-anc-day=") > 20, pag.count("data-anc-day="))
    comprueba("el día de la actividad está marcado", "is-event" in pag)
    comprueba("hoy se puede elegir", ('data-anc-day="%s"' % hoy.isoformat()) in pag)
    comprueba("ayer NO", ('data-anc-day="%s"' % (hoy - datetime.timedelta(days=1)).isoformat()) not in pag)
    comprueba("después de la actividad tampoco",
              ('data-anc-day="%s"' % (fecha + datetime.timedelta(days=1)).isoformat()) not in pag)
    comprueba("también ofrece subir los carteles", "/carteleria/%s" % req.public_token in pag)

    elegido = hoy + datetime.timedelta(days=7)
    anon.post("/anuncio/%s" % c.announce_ask_token,
              data={"announce_date": elegido.isoformat(), "with_time": "1", "announce_time": "12:30"},
              follow_redirects=True)
    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("la fecha queda configurada", c.announcement_date == elegido, c.announcement_date)
    comprueba("y la hora", (c.announcement_time or "") == "12:30", c.announcement_time)
    comprueba("queda apuntado que lo confirmó el promotor", bool(c.announce_confirmed_at))
    for mala, motivo in ((hoy - datetime.timedelta(days=3), "una fecha pasada"),
                         (fecha + datetime.timedelta(days=2), "una fecha posterior a la actividad")):
        anon.post("/anuncio/%s" % c.announce_ask_token,
                  data={"announce_date": mala.isoformat()}, follow_redirects=True)
        s.expire_all()
        c = s.get(models.Concert, c.id)
        comprueba("no deja poner %s" % motivo, c.announcement_date == elegido, c.announcement_date)

    # Con la fecha ya puesta, el botón pasa a pedir solo la cartelería.
    req.status = "PROMOTER"
    s.commit()
    html = cli.get("/conciertos/%s?tab=general" % cid).get_data(as_text=True)
    comprueba("con la fecha puesta, solo se piden los carteles",
              "Solicitar cartelería" in html and "Solicitar cartelería y fecha" not in html)

    # Con los carteles nuestros, solo se pide la fecha.
    c2 = concierto()
    s.add(models.ConcertArtworkRequest(concert_id=c2.id, public_token=uuid.uuid4().hex,
                                       handled_by="OURS", status="REQUESTED"))
    s.commit()
    html = cli.get("/conciertos/%s?tab=general" % c2.id).get_data(as_text=True)
    comprueba("con carteles nuestros, solo «Solicitar fecha de anuncio»",
              "Solicitar fecha de anuncio" in html and "Solicitar cartelería" not in html)
    c2.announcement_date = hoy + datetime.timedelta(days=3)
    s.commit()
    html = cli.get("/conciertos/%s?tab=general" % c2.id).get_data(as_text=True)
    comprueba("con todo puesto, no hay botón", "announceAskModal" not in html)

    # ── 4 · LA DOBLE APROBACIÓN ────────────────────────────────────────────────────────────
    print("\n4 · Los dos vistos buenos")
    c4 = concierto(created_by_user_id=gestor.id, announcement_date=hoy + datetime.timedelta(days=5))
    req4 = models.ConcertArtworkRequest(concert_id=c4.id, public_token=uuid.uuid4().hex,
                                        handled_by="PROMOTER", status="REVIEW")
    s.add(req4)
    s.flush()
    a1 = models.ConcertArtworkAsset(artwork_request_id=req4.id, format_label="Cartel A4",
                                    file_url="https://x/a4.jpg", kind="IMAGE", category="POSTER",
                                    validation_status="PENDING", width=1000, height=1000)
    s.add(a1)
    s.commit()
    d = cli.post("/conciertos/%s/carteleria/assets/%s/revisar" % (c4.id, a1.id),
                 data={"decision": "APPROVE"}).get_json() or {}
    s.expire_all()
    a1 = s.get(models.ConcertArtworkAsset, a1.id)
    req4 = s.get(models.ConcertArtworkRequest, req4.id)
    comprueba("el primer OK deja el cartel a medias (DESIGN_OK)",
              bool(d.get("ok")) and a1.validation_status == "DESIGN_OK", (d, a1.validation_status))
    comprueba("queda apuntado quién dio el primero", bool(a1.design_reviewed_at))
    comprueba("la solicitud NO se da por entregada", req4.status != "UPLOADED", req4.status)
    comprueba("todavía no se comparte con el artista", not req4.shared_with_artist_at)
    comprueba("se le reclama el segundo a quien gestiona la actividad",
              s.query(models.AppNotification)
              .filter(models.AppNotification.ref_type == "ARTWORK_APPROVAL",
                      models.AppNotification.ref_id == str(req4.id)).count() >= 1)

    correos.clear()
    cli.post("/conciertos/%s/carteleria/assets/%s/revisar" % (c4.id, a1.id),
             data={"decision": "APPROVE"})
    s.expire_all()
    a1 = s.get(models.ConcertArtworkAsset, a1.id)
    req4 = s.get(models.ConcertArtworkRequest, req4.id)
    c4 = s.get(models.Concert, c4.id)
    comprueba("con el segundo, APROBADO", a1.validation_status == "APPROVED", a1.validation_status)
    comprueba("la solicitud pasa a entregada", req4.status == "UPLOADED", req4.status)

    # ── 5 · SE COMPARTE SOLO CON EL ARTISTA ────────────────────────────────────────────────
    print("\n5 · Los carteles se le mandan solos al artista")
    comprueba("se marca como compartido", bool(req4.shared_with_artist_at))
    aviso = (s.query(models.ConcertArtistNotification)
             .filter(models.ConcertArtistNotification.concert_id == c4.id).first())
    comprueba("queda registrado el aviso", aviso is not None and aviso.kind == "CARTELERIA",
              getattr(aviso, "kind", None))
    comprueba("el correo sale al artista", any("manager+" in str(x[0]) for x in correos), correos)
    cuerpo5 = "".join(str(x[2]) for x in correos)
    comprueba("y dice cuándo se anuncia",
              (hoy + datetime.timedelta(days=5)).strftime("%d/%m/%Y") in cuerpo5)
    comprueba("compartir NO marca la actividad como anunciada",
              c4.announcement_date == hoy + datetime.timedelta(days=5), c4.announcement_date)
    correos.clear()
    a2 = models.ConcertArtworkAsset(artwork_request_id=req4.id, format_label="Story",
                                    file_url="https://x/st.jpg", kind="IMAGE", category="POSTER",
                                    validation_status="DESIGN_OK", width=1080, height=1920)
    s.add(a2)
    s.commit()
    cli.post("/conciertos/%s/carteleria/assets/%s/revisar" % (c4.id, a2.id), data={"decision": "APPROVE"})
    comprueba("no se le manda dos veces", not any("manager+" in str(x[0]) for x in correos), correos)

    print("\n6 · Quién puede dar cada visto bueno")
    guarda = (A.is_master, A.has_access_key)
    try:
        with A.app.test_request_context("/"):
            from flask import session as fs
            fs["user_id"] = str(yo.id)
            A.is_master = lambda: False
            A.has_access_key = lambda key, **kw: key == "diseno"
            comprueba("diseño da el PRIMERO", A._artwork_can_review_phase("PENDING", None))
            comprueba("y NO el segundo de una actividad que no gestiona",
                      not A._artwork_can_review_phase("DESIGN_OK", c4))
            A.has_access_key = lambda key, **kw: False
            comprueba("quien no es diseño no da el primero",
                      not A._artwork_can_review_phase("PENDING", None))
        # ⚠️ Contexto NUEVO: `_current_user_state()` se cachea en `g` durante la petición.
        with A.app.test_request_context("/"):
            from flask import session as fs2
            fs2["user_id"] = str(gestor.id)
            A.is_master = lambda: False
            A.has_access_key = lambda key, **kw: False
            comprueba("quien GESTIONA la actividad da el segundo",
                      A._artwork_can_review_phase("DESIGN_OK", c4))
    finally:
        A.is_master, A.has_access_key = guarda

    # ── 7 · EL RECORDATORIO DEL DÍA ────────────────────────────────────────────────────────
    print("\n7 · El recordatorio del día del anuncio")
    c4.announcement_date = hoy
    c4.announcement_time = "12:30"
    c4.announce_reminder_at = None
    s.commit()
    s.expire_all()
    c4 = s.get(models.Concert, c4.id)
    with A.app.test_request_context("/"):
        texto = A._announce_reminder_text(s, c4)
    comprueba("dice la hora y qué se publica",
              "Recuerda que hoy a las 12:30 se publica el concierto de Móstoles" in texto, texto)
    comprueba("lleva los carteles", "/carteles/" in texto, texto)
    comprueba("sin venta, no se inventa un enlace", "Venta de entradas" not in texto, texto)

    tick = models.Ticketer(name="Ticketera %s" % suf)
    s.add(tick)
    s.flush()
    s.add(models.ConcertTicketer(concert_id=c4.id, ticketer_id=tick.id,
                                 sale_url="https://entradas.example/%s" % suf, capacity_for_sale=100))
    c4.sale_start_date = hoy - datetime.timedelta(days=2)
    s.commit()
    s.expire_all()
    c4 = s.get(models.Concert, c4.id)
    with A.app.test_request_context("/"):
        texto = A._announce_reminder_text(s, c4)
    comprueba("con la venta abierta, lleva el enlace de venta",
              "Venta de entradas: https://entradas.example/%s" % suf in texto, texto)
    c4.sale_start_date = hoy + datetime.timedelta(days=3)
    s.commit()
    s.expire_all()
    c4 = s.get(models.Concert, c4.id)
    with A.app.test_request_context("/"):
        texto = A._announce_reminder_text(s, c4)
    comprueba("si la venta es MÁS TARDE, no se pone", "Venta de entradas" not in texto, texto)

    smss.clear()
    A._announce_reminder_sweep()
    s.expire_all()
    c4 = s.get(models.Concert, c4.id)
    comprueba("el barrido manda el SMS",
              any("+34600111222" in str(x[0]) for x in smss), smss)
    comprueba("y queda sellado para no repetirlo", bool(c4.announce_reminder_at))
    smss.clear()
    A._announce_reminder_sweep()
    comprueba("no se repite en la siguiente pasada",
              not any("+34600111222" in str(x[0]) for x in smss), smss)

    # ── 8 · CON PERMISOS DE VERDAD (sin ser dirección) ─────────────────────────────────────
    # ⚠️⚠️ Esto es lo que ya costó un 403 en esta área: la ruta `/conciertos/…` la resuelve el GATE
    # y puede echar a quien tiene que aprobar ANTES de llegar a la vista. Con la doble aprobación
    # pasan por aquí DOS perfiles distintos, así que se comprueba con sus permisos puestos.
    print("\n8 · Los dos vistos buenos con permisos reales")
    with A.app.app_context():
        if not s.query(models.UserAccessResource).first():
            A._bootstrap_access_and_personnel()      # el catálogo no lo siembra el hilo del esquema

    def con_permiso(correo, recurso):
        u = usuario(correo, 1)                       # ⚠️ rol 1: dirección puede siempre y no valdría
        if not s.query(models.UserProfile).filter(models.UserProfile.user_id == u.id).first():
            s.add(models.UserProfile(user_id=u.id, nick=correo.split("@")[0]))
        s.query(models.UserAccessGrant).filter(models.UserAccessGrant.user_id == u.id).delete()
        s.add(models.UserAccessGrant(user_id=u.id, resource_key=recurso, can_view_basic=True,
                                     can_view_econ=True, can_edit=True))
        s.flush()
        return u

    dis = con_permiso("check_anuncio_diseno@33.es", "diseno")
    con = con_permiso("check_anuncio_contra@33.es", "contratacion.conciertos")
    c8 = concierto(created_by_user_id=con.id)        # la gestiona contratación
    r8 = models.ConcertArtworkRequest(concert_id=c8.id, public_token=uuid.uuid4().hex,
                                      handled_by="PROMOTER", status="REVIEW")
    s.add(r8)
    s.flush()
    a8 = models.ConcertArtworkAsset(artwork_request_id=r8.id, format_label="Cartel",
                                    file_url="https://x/a.jpg", kind="IMAGE", category="POSTER",
                                    validation_status="PENDING")
    s.add(a8)
    s.commit()

    def revisa(u):
        otro = A.app.test_client()
        with otro.session_transaction() as ses:
            ses["user_id"] = str(u.id)
            ses["role"] = 1
        codigo = otro.post("/conciertos/%s/carteleria/assets/%s/revisar" % (c8.id, a8.id),
                           data={"decision": "APPROVE"}).status_code
        s.expire_all()
        return codigo, s.get(models.ConcertArtworkAsset, a8.id).validation_status

    comprueba("contratación NO puede dar el primero", revisa(con) == (403, "PENDING"), revisa(con))
    comprueba("diseño da el primero (y el gate le deja pasar)", revisa(dis) == (200, "DESIGN_OK"))
    comprueba("diseño NO puede dar el segundo", revisa(dis) == (403, "DESIGN_OK"))
    comprueba("contratación da el segundo (y el gate le deja pasar)", revisa(con) == (200, "APPROVED"))

    s.close()
    print("\n%d bien · %d mal" % (len(OK), len(KO)))
    if KO:
        print("FALLAN:")
        for x in KO:
            print(" · " + x)
        return 1
    print("OK · la fecha de anuncio y la cartelería se piden, se confirman y se aprueban como toca")
    return 0


if __name__ == "__main__":
    sys.exit(main())
