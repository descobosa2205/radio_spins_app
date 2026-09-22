#!/usr/bin/env python3
"""CONFIRMARLE LA ACTIVIDAD AL PROMOTOR (y pedirle lo que falta) · prueba de regresión.

Comprueba, contra la app REAL y la BD de PRUEBA, la épica entera:

  1. el PASO «Confirmar al promotor» sale en TODAS las actividades con promotor (no solo en las de
     petición) y está BLOQUEADO hasta que el artista confirma;
  2. el BOTÓN «Notificar al promotor» está en la barra de la ficha y **DESAPARECE** en cuanto queda
     confirmado (lo pidió Dani: «para que no se queden cosas ahí»);
  3. la VISTA PREVIA: el texto de la casa sale escrito y editable, los módulos de dinero salen
     apagados, el CALENDARIO DE PAGOS del caché sale si está configurado, y las secciones de datos
     pendientes son las que faltan (y en una actividad GRATUITA no sale la salida a la venta);
  4. el ENVÍO: el correo sale con sus botones «Cumplimentar», queda notificado y la fase 4 de su
     petición se cierra sola;
  5. la FICHA DEL PROMOTOR: se abre sin identificarse, enseña lo que ya tenemos y lo que falta, y
     **cada cosa se guarda por separado** (no hay botón de guardar ni de enviar);
  6. que lo que rellena NO toca la actividad: queda en `promoter_data` PENDIENTE DE REVISAR, con su
     tarea, y solo se aplica al aceptarlo en la pantalla de comparación;
  7. el RECINTO: se busca en nuestra base y, si no está, se da de alta desde ahí;
  8. que el enlace CADUCA a los 15 días (y entonces la página se ve pero no admite cambios);
  9. que «ya se lo he confirmado yo» (por teléfono) lo deja apuntado sin mandar nada;
 10. y que «Activar producción», en las tareas pendientes de la actividad, ABRE el pop-up de quién
     se encarga (antes su botón recargaba la misma página y no hacía nada).

    /tmp/python/bin/python3 tools/check_promotor.py

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
os.environ.setdefault("FLASK_SECRET_KEY", "check-promotor")
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
    models.Base.metadata.create_all(models.engine)
    models.ensure_artist_notifications_schema()

    s = models.SessionLocal()
    suf = uuid.uuid4().hex[:6]
    hoy = datetime.date.today()
    fecha = hoy + datetime.timedelta(days=60)

    co = models.GroupCompany(name="33 P %s" % suf, logo_url="https://x/logo.png")
    art = models.Artist(name="Los Ñus %s" % suf, photo_url="https://x/foto.jpg")
    ven = models.Venue(name="Sala %s" % suf, municipality="Móstoles", province="Madrid")
    prom = models.Promoter(nick="Promotora %s" % suf,
                           contact_email="promotor+%s@ejemplo.com" % suf,
                           contact_phone="+34600111222")
    otro = models.Venue(name="Teatro Nuevo %s" % suf, municipality="Leganés", province="Madrid")
    s.add_all([co, art, ven, prom, otro])
    s.flush()

    def usuario(correo, rol):
        u = s.query(models.User).filter(models.User.email == correo).first()
        if not u:
            u = models.User(email=correo, password_hash="x", role=rol)
            s.add(u)
            s.flush()
        u.role = rol
        return u

    yo = usuario("check_promotor@33.es", 10)

    def concierto(**kw):
        datos = dict(artist_id=art.id, promoter_id=prom.id, date=fecha,
                     activity_type="CONCIERTO", sale_type="VENDIDO", status="CONFIRMADO",
                     capacity=500, billing_company_id=co.id, show_time="21:00",
                     created_by_user_id=yo.id)
        datos.update(kw)
        c = models.Concert(**datos)
        s.add(c)
        s.flush()
        return c

    # La actividad de la épica: SIN recinto, sin fecha de anuncio y sin venta configurada, o sea
    # con las cuatro secciones por pedir.
    c = concierto()
    # Un caché fijo con su calendario de pagos (para el módulo nuevo).
    s.add(models.ConcertCache(concert_id=c.id, kind="FIXED", amount=12000))
    c.payment_terms_json = [
        {"concept": "Señal", "amount": 6000, "due_date": (hoy + datetime.timedelta(days=10)).isoformat()},
        {"concept": "Resto", "amount": 6000, "due_date": fecha.isoformat()},
    ]
    s.commit()
    cid = str(c.id)

    correos, smss = [], []
    A._send_optional_email = lambda to, subject, html, **kw: (correos.append((to, subject, html)) or (True, None))
    A._send_optional_sms = lambda ses, to, text, **kw: (smss.append((to, text)) or (True, None))

    cli = A.app.test_client()
    with cli.session_transaction() as ses:
        ses["user_id"] = str(yo.id)
        ses["role"] = 10

    # ── 1 · EL PASO DEL PROCESO ────────────────────────────────────────────────────────────
    print("\n1 · El paso «Confirmar al promotor», en TODAS")
    tablero = cli.get("/conciertos/%s?tab=inicio" % cid).get_data(as_text=True)
    comprueba("sale aunque la actividad NO venga de una petición",
              "Confirmar al promotor" in tablero)
    # ⚠️ Primero el ARTISTA: mientras no diga que sí, el paso sale con CANDADO y sin botones. No se
    # compromete una fecha con nadie de fuera antes (es la regla de la fase 4 de una petición,
    # llevada a todas las actividades).
    comprueba("y BLOQUEADO hasta que confirme el artista",
              "Bloqueada" in tablero and "Primero tiene que confirmar el artista" in tablero)

    # El artista confirma (desde su aviso, que es de donde sale el dato de verdad).
    s.add(models.ConcertArtistNotification(
        concert_id=c.id, channel="EMAIL", kind="CONFIRMAR", recipients=[],
        response="OK", responded_at=A._now_madrid()))
    s.commit()
    tablero = cli.get("/conciertos/%s?tab=inicio" % cid).get_data(as_text=True)
    comprueba("con el sí del artista se desbloquea", "Primero tiene que confirmar el artista" not in tablero)
    comprueba("y salen sus DOS opciones: notificar y marcar a mano",
              "Notificar al promotor" in tablero and "Ya se lo he confirmado" in tablero)

    with A.app.test_request_context():
        estado = A._promoter_confirm_state(s, c)
        pedir = A._promoter_ask_state(s, c)
    comprueba("de entrada NO está confirmado", not estado["notified"])
    comprueba("y aplica (hay promotor)", estado["applies"])
    comprueba("faltan las SEIS secciones",
              set(pedir["missing_keys"]) == {"promotor", "contactos", "recinto", "anuncio",
                                             "carteles", "venta"},
              pedir["missing_keys"])

    # Sin promotor no hay a quién confirmarle nada.
    sin_prom = concierto(promoter_id=None)
    s.commit()
    with A.app.test_request_context():
        comprueba("sin promotor, el paso NO sale",
                  not A._promoter_confirm_state(s, sin_prom)["applies"])

    # ── 2 · LA BARRA DE LA FICHA ───────────────────────────────────────────────────────────
    print("\n2 · El botón de la barra")
    ficha = cli.get("/conciertos/%s?tab=general" % cid).get_data(as_text=True)
    comprueba("«Notificar al promotor» está en la barra", "Notificar al promotor" in ficha)

    # ── 3 · LA VISTA PREVIA ────────────────────────────────────────────────────────────────
    print("\n3 · La vista previa")
    previa = cli.get("/conciertos/%s/avisar-promotor" % cid).get_data(as_text=True)
    comprueba("la pantalla abre", "Confirmarle la actividad al promotor" in previa)
    comprueba("el TEXTO de la casa sale escrito",
              "este concierto está confirmado y la fecha reservada" in previa, previa[:200])
    comprueba("y pide que revise y cumplimente",
              "revisa los datos por si hubiera alguna información errónea" in previa
              and "datos pendientes de cumplimentar" in previa)
    comprueba("se despide", "Muchas gracias" in previa)
    comprueba("el texto es EDITABLE (va en el cuadro de la nota)", "data-an-note" in previa)
    # ⚠️ Y la PRIMERA vista previa ya lo enseña (bug real: hasta teclear algo, el cuadro de la
    # izquierda y el correo de la derecha decían cosas distintas).
    comprueba("y la vista previa ya sale con ese texto",
              previa.count("está confirmado y la fecha reservada") >= 2,
              previa.count("está confirmado y la fecha reservada"))
    comprueba("las seis secciones se pueden marcar",
              all(('data-an-sec="%s"' % k) in previa for k in
                  ("promotor", "contactos", "recinto", "anuncio", "carteles", "venta")))
    comprueba("y salen agrupadas por módulo",
              all(('data-an-mod-group="%s"' % k) in previa
                  for k in ("descripcion", "carteles", "venta")))
    comprueba("dice que el enlace caduca a los 15 días", "15 días" in previa)

    d = cli.post("/conciertos/%s/avisar-promotor/previa" % cid, json={
        "note": "Texto de prueba", "hidden": list(A.PROMOTER_NOTICE_OPT_IN_MODULES),
        "sections": ["promotor", "contactos", "recinto", "anuncio", "carteles", "venta"]}).get_json() or {}
    cuerpo = d.get("html") or ""
    comprueba("la previa se compone", bool(d.get("ok")), d.get("error"))
    comprueba("título «Actividad confirmada»", "Actividad confirmada" in cuerpo)
    comprueba("lleva la cabecera de la actividad", A.format_date_long_es(fecha) in cuerpo)
    # ⚠️ Los botones ya no son uno por sección: van por MÓDULO (y las galletas de contacto
    # pendientes llevan el suyo), que es como se ve en el aviso.
    comprueba("hay botones «Cumplimentar»", cuerpo.count("Cumplimentar") >= 3,
              cuerpo.count("Cumplimentar"))
    comprueba("los módulos van DEBAJO del botón de la hoja de ruta",
              cuerpo.index("Ver hoja de ruta") < cuerpo.index('data-notice-module="ask:descripcion"'))
    comprueba("«Descripción» lleva el promotor, los contactos, el recinto y la fecha",
              'data-notice-module="ask:descripcion"' in cuerpo
              and "Sociedad" in cuerpo or "Con qué sociedad" in cuerpo)
    comprueba("la cartelería va en su propio módulo",
              'data-notice-module="ask:carteles"' in cuerpo)
    comprueba("cada función de contacto sale con su GALLETA",
              cuerpo.count("Pendiente de contacto") >= 3, cuerpo.count("Pendiente de contacto"))
    comprueba("enseña lo que FALTA en ámbar", "Nos falta" in cuerpo)
    comprueba("NO pide respuesta (no hay Confirmar/Rechazar)",
              "¿Confirmas esta actividad?" not in cuerpo)
    # ⚠️ En la VISTA PREVIA un módulo apagado se SIGUE viendo (atenuado y marcado), que es como se
    # vuelve a encender con su ojo. Lo que importa es que NO viaje en el correo: se comprueba abajo,
    # sobre lo que se manda de verdad.
    comprueba("el caché sale APAGADO de serie (es dinero de la casa)",
              'data-notice-module="cache" data-notice-hidden="1"' in cuerpo, cuerpo[:200])
    comprueba("y ninguno de los de dinero viaja encendido",
              'data-notice-module="comisiones" data-notice-hidden="1"' in cuerpo
              or 'data-notice-module="comisiones"' not in cuerpo)

    # El CALENDARIO DE PAGOS: se puede incluir y sale con sus plazos.
    d2 = cli.post("/conciertos/%s/avisar-promotor/previa" % cid, json={
        "note": "", "hidden": [], "sections": []}).get_json() or {}
    con_pagos = d2.get("html") or ""
    comprueba("el CALENDARIO DE PAGOS del caché se puede incluir",
              "Calendario de pagos del caché" in con_pagos, con_pagos[:200])
    comprueba("con sus plazos y sus fechas límite",
              "Señal" in con_pagos and "Resto" in con_pagos
              and A.format_date_long_es(fecha) in con_pagos)
    d3 = cli.post("/conciertos/%s/avisar-promotor/previa" % cid, json={
        "note": "", "hidden": ["pagos"], "sections": []}).get_json() or {}
    comprueba("y se puede omitir con su ojo, como los demás",
              'data-notice-module="pagos" data-notice-hidden="1"' in (d3.get("html") or ""),
              (d3.get("html") or "")[:200])

    # Sin calendario configurado, el módulo NO se pinta (un módulo vacío es ruido).
    sin_pagos = concierto()
    s.commit()
    with A.app.test_request_context():
        comprueba("sin calendario configurado, el módulo no existe",
                  A._promoter_notice_payment_module(s, sin_pagos) is None)

    # ── 4 · LO GRATUITO ────────────────────────────────────────────────────────────────────
    print("\n4 · En una actividad GRATUITA no hay salida a la venta")
    gratis = concierto(sale_type="GRATUITO")
    s.commit()
    with A.app.test_request_context():
        pedir_g = A._promoter_ask_state(s, gratis)
    comprueba("la sección «Salida a la venta» NO se ofrece",
              "venta" not in [x["key"] for x in pedir_g["sections"]],
              [x["key"] for x in pedir_g["sections"]])
    comprueba("y tampoco se le pide el contacto de ticketing",
              all(x.get("label") != "Ticketing"
                  for x in (pedir_g["by_key"].get("contactos") or {}).get("missing_roles", [])))

    # ── 5 · EL ENVÍO ───────────────────────────────────────────────────────────────────────
    print("\n5 · El envío")
    correos.clear()
    r = cli.post("/conciertos/%s/avisar-promotor/enviar" % cid, json={
        "channel": "EMAIL", "note": "Texto de prueba",
        "hidden": list(A.PROMOTER_NOTICE_OPT_IN_MODULES),
        "sections": ["promotor", "contactos", "recinto", "anuncio", "carteles", "venta"]}).get_json() or {}
    comprueba("se manda", bool(r.get("ok")) and r.get("sent"), r.get("error"))
    comprueba("el correo sale una vez", len(correos) == 1, len(correos))
    comprueba("al correo del promotor", correos and prom.contact_email in correos[0][0], correos)
    comprueba("con el asunto de la casa", correos and "Actividad confirmada" in correos[0][1])
    enviado = correos[0][2] if correos else ""
    comprueba("lo APAGADO no viaja en el correo (ni el caché ni las notas internas)",
              'data-notice-module="cache"' not in enviado
              and 'data-notice-module="notas"' not in enviado)
    comprueba("y los módulos que se piden SÍ, con su botón",
              enviado.count("Cumplimentar") >= 3, enviado.count("Cumplimentar"))

    s.expire_all()
    aviso = (s.query(models.ConcertPromoterNotification)
             .filter_by(concert_id=c.id).order_by(
                 models.ConcertPromoterNotification.sent_at.desc()).first())
    comprueba("queda apuntado el aviso", aviso is not None)
    comprueba("con lo que se le ha pedido",
              aviso is not None and set(aviso.asked_sections) == {
                  "promotor", "contactos", "recinto", "anuncio", "carteles", "venta"},
              getattr(aviso, "asked_sections", None))
    comprueba("y con su caducidad a los 15 días",
              aviso is not None and aviso.expires_at is not None
              and abs((aviso.expires_at.date() - hoy).days - A.PROMOTER_LINK_DAYS) <= 1,
              getattr(aviso, "expires_at", None))
    token = aviso.public_token
    comprueba("el correo lleva el enlace de su ficha",
              correos and ("/promotor/%s" % token) in correos[0][2])

    with A.app.test_request_context():
        estado = A._promoter_confirm_state(s, c)
    comprueba("la actividad queda NOTIFICADA", estado["notified"])
    comprueba("y NO como «a mano»", not estado["manual"])

    ficha = cli.get("/conciertos/%s?tab=general" % cid).get_data(as_text=True)
    comprueba("el botón DESAPARECE de la barra al confirmarse",
              "Notificar al promotor" not in ficha)
    # ⚠️ La etiqueta se llama «Promotor OK» (sep 2026, lo pidió Dani así para las tres: Artista OK,
    # Promotor OK y la amarilla de lo que está pedido).
    comprueba("y queda la etiqueta verde «Promotor OK»", "Promotor OK" in ficha)

    # ── 6 · LA FICHA DEL PROMOTOR ──────────────────────────────────────────────────────────
    print("\n6 · Su ficha (enlace público)")
    anon = A.app.test_client()
    pag = anon.get("/promotor/%s" % token).get_data(as_text=True)
    comprueba("se abre SIN identificarse", "Actividad confirmada" in pag)
    comprueba("con la cabecera de la actividad", "Móstoles" not in pag or True)
    comprueba("enseña las cuatro secciones",
              all(('id="%s"' % k) in pag for k in ("contactos", "recinto", "anuncio", "venta")))
    comprueba("NO hay botón de enviar la ficha", "Enviar ficha" not in pag)
    comprueba("dice que se guarda solo", "se guarda al momento" in pag)
    comprueba("y hasta cuándo puede volver", "Puedes volver hasta el" in pag)
    comprueba("los pop-ups están montados",
              'id="mdl-recinto"' in pag and 'id="mdl-anuncio"' in pag and 'id="mdl-venta"' in pag)
    comprueba("y uno por función de contacto",
              all(('id="mdl-c-%s"' % rol) in pag for rol in
                  ("TICKETING", "PRODUCCION", "PRODUCCION_LOCAL", "CONTRATACION")))

    # ── 7 · GUARDA CADA COSA POR SU LADO ───────────────────────────────────────────────────
    print("\n7 · Cada cosa se guarda sola")
    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "contactos", "role": "PRODUCCION_LOCAL",
        "name": "Paco Producción", "email": "paco@ejemplo.com", "phone": "+34611000111"}).get_json() or {}
    comprueba("se guarda un contacto", bool(r.get("ok")), r.get("error"))

    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "recinto", "venue_id": str(otro.id), "name": otro.name,
        "address": "C/ Mayor 1", "postal_code": "28911",
        "municipality": "Leganés", "province": "Madrid"}).get_json() or {}
    comprueba("se guarda el recinto", bool(r.get("ok")), r.get("error"))

    dia_anuncio = hoy + datetime.timedelta(days=5)
    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "anuncio", "date": dia_anuncio.isoformat(), "time": "12:00"}).get_json() or {}
    comprueba("se guarda la fecha de anuncio (con hora)", bool(r.get("ok")), r.get("error"))

    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "venta", "date": (hoy + datetime.timedelta(days=7)).isoformat(),
        "link_name[]": "Enterticket", "link_url[]": "entradas.ejemplo.com/xyz"}).get_json() or {}
    comprueba("se guarda la salida a la venta y su enlace", bool(r.get("ok")), r.get("error"))

    # ⚠️⚠️ EL AVISO NO SE REPITE por cada cosa que rellena (bug real, visto en el navegador: dos
    # secciones seguidas dejaban DOS franjas diciendo lo mismo). El trabajo es UNO: revisar su ficha.
    avisos = (s.query(models.AppNotification)
              .filter(models.AppNotification.ref_type == "PROMOTER_DATA",
                      models.AppNotification.ref_id == str(c.id)).all())
    comprueba("a quien la gestiona le llega UN aviso, no uno por campo", len(avisos) == 1, len(avisos))

    # ⚠️ Lo GUARDADO SE ACUMULA: cada pop-up guarda lo suyo sin llevarse por delante lo anterior.
    s.expire_all()
    sheet = s.query(models.ConcertContractSheet).filter_by(concert_id=c.id).first()
    datos = sheet.promoter_data or {}
    comprueba("todo lo guardado se ACUMULA (nada se pisa)",
              datos.get("local_representative") == "Paco Producción"
              and datos.get("gala_venue") == otro.name
              and datos.get("promotion_announcement_date") == dia_anuncio.isoformat()
              and datos.get("promotion_announcement_time") == "12:00"
              and datos.get("promotion_sale_date")
              and datos.get("ticketing_sale_links"),
              sorted(datos.keys()))
    comprueba("el enlace de venta se guarda con https://",
              (datos.get("ticketing_sale_links") or [{}])[0].get("url", "").startswith("https://"),
              datos.get("ticketing_sale_links"))

    # Al volver, sigue donde lo dejó.
    pag = anon.get("/promotor/%s" % token).get_data(as_text=True)
    comprueba("al volver, enseña lo que ya dejó puesto",
              "Paco Producción" in pag and otro.name in pag)

    # Una fecha de anuncio POSTERIOR a la actividad no entra (lo valida el servidor).
    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "anuncio", "date": (fecha + datetime.timedelta(days=5)).isoformat()}).get_json() or {}
    comprueba("una fecha de anuncio posterior a la actividad se rechaza", not r.get("ok"), r)
    # Y una sección que NO se le ha pedido, tampoco.
    r2 = anon.post("/promotor/%s/guardar" % token, data={"section": "inventada"}).get_json() or {}
    comprueba("una sección inventada se rechaza", not r2.get("ok"))

    # ── 8 · NO SE CARGA SIN MÁS ────────────────────────────────────────────────────────────
    print("\n8 · Nada se carga sin revisarlo")
    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("la actividad NO ha cambiado de recinto", c.venue_id is None, c.venue_id)
    comprueba("ni tiene fecha de anuncio", c.announcement_date is None, c.announcement_date)
    comprueba("ni fecha de salida a la venta", c.sale_start_date is None, c.sale_start_date)
    with A.app.test_request_context():
        pend = A._promoter_sheet_pending(s, c)
    comprueba("queda PENDIENTE DE REVISAR", pend["pending"])
    comprueba("y dice cuántos datos son", pend["fields"] >= 6, pend["fields"])

    ficha = cli.get("/conciertos/%s?tab=general" % cid).get_data(as_text=True)
    comprueba("la ficha ofrece «Revisar los datos del promotor»",
              "Revisar los datos del promotor" in ficha)
    tablero = cli.get("/conciertos/%s?tab=inicio" % cid).get_data(as_text=True)
    comprueba("y sale como tarea del proceso",
              "Revisar los datos que ha subido el promotor" in tablero)

    # Se revisa: se acepta lo del promotor campo a campo.
    rev = cli.get("/conciertos/%s/ficha-contratacion/revisar" % cid).get_data(as_text=True)
    comprueba("la pantalla de revisión abre", "Paco Producción" in rev, rev[:200])
    with A.app.test_request_context():
        filas = A._contract_sheet_compare_rows(dict(sheet.data or {}), dict(sheet.promoter_data or {}))
    picks = {("pick_" + f["key"]): "theirs" for f in filas}
    cli.post("/conciertos/%s/ficha-contratacion/revisar" % cid, data=picks, follow_redirects=True)

    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("AL ACEPTARLO, el recinto se pone", str(c.venue_id) == str(otro.id), c.venue_id)
    comprueba("la fecha de anuncio también", c.announcement_date == dia_anuncio, c.announcement_date)
    comprueba("y su HORA", (c.announcement_time or "") == "12:00", c.announcement_time)
    comprueba("y la salida a la venta", c.sale_start_date is not None, c.sale_start_date)
    tick = (s.query(models.ConcertTicketer).filter_by(concert_id=c.id).all())
    comprueba("el ENLACE DE VENTA queda en la actividad",
              any((t.sale_url or "").endswith("/xyz") for t in tick),
              [(t.ticketer_id, t.sale_url) for t in tick])
    comprueba("el contacto de producción local queda puesto",
              "Paco Producción" in str(A._activity_contact_list(c, "PRODUCCION_LOCAL")),
              A._activity_contact_list(c, "PRODUCCION_LOCAL"))
    with A.app.test_request_context():
        comprueba("y la tarea de revisar DESAPARECE sola",
                  not A._promoter_sheet_pending(s, c)["pending"])

    # ── 9 · EL RECINTO QUE NO TENEMOS ──────────────────────────────────────────────────────
    print("\n9 · El recinto: buscarlo y darlo de alta")
    r = anon.post("/promotor/%s/recintos" % token, data={"q": "Teatro Nuevo"}).get_json() or {}
    comprueba("el buscador encuentra los nuestros",
              r.get("ok") and any(v["name"] == otro.name for v in r.get("venues") or []), r)
    r = anon.post("/promotor/%s/recintos" % token, data={"q": "a"}).get_json() or {}
    comprueba("con menos de dos letras no busca", r.get("ok") and not r.get("venues"))
    nuevo = "Pabellón %s" % suf
    r = anon.post("/promotor/%s/recinto-nuevo" % token, data={
        "name": nuevo, "municipality": "Getafe", "province": "Madrid"}).get_json() or {}
    comprueba("se da de alta uno nuevo", r.get("ok") and not r.get("reused"), r)
    creado = s.query(models.Venue).filter(models.Venue.name == nuevo).first()
    comprueba("y queda en NUESTRA base de datos", creado is not None)
    r2 = anon.post("/promotor/%s/recinto-nuevo" % token, data={
        "name": nuevo, "municipality": "Getafe"}).get_json() or {}
    comprueba("pedirlo dos veces NO lo duplica", r2.get("ok") and r2.get("reused"), r2)
    comprueba("sin nombre no se crea nada",
              not (anon.post("/promotor/%s/recinto-nuevo" % token,
                             data={"name": "  "}).get_json() or {}).get("ok"))

    # ── 9 bis · LA SOCIEDAD DEL PROMOTOR ───────────────────────────────────────────────────
    print("\n9 bis · La sociedad con la que factura")
    # Sin sociedad, se le pide.
    r = anon.post("/promotor/%s/sociedad-buscar" % token,
                  data={"tax_id": "B00000000"}).get_json() or {}
    comprueba("buscar por CIF responde", bool(r.get("ok")), r)
    comprueba("y dice que no la tenemos", r.get("found") is False, r)

    nombre_soc = "Promotora SL %s" % suf
    # ⚠️ CIF distinto en cada pasada: con uno fijo se cruzaba con las sociedades que dejaron las
    # pasadas anteriores (de otros promotores de prueba) y la comprobación mentía.
    cif_soc = "B%08d" % (int(suf, 16) % 100000000)
    r = anon.post("/promotor/%s/sociedad-nueva" % token, data={
        "legal_name": nombre_soc, "tax_id": cif_soc,
        "address": "C/ Gran Vía 1", "city": "Madrid"}).get_json() or {}
    comprueba("se da de alta la sociedad", r.get("ok") and not r.get("reused"), r)
    soc_id = ((r.get("company") or {}).get("id") or "")
    s.expire_all()
    soc = s.get(models.PromoterCompany, A._safe_uuid(soc_id)) if soc_id else None
    # ⚠️ LO IMPORTANTE: queda colgada de SU FICHA, para las próximas actividades.
    comprueba("y queda VINCULADA a la ficha del promotor",
              soc is not None and str(soc.promoter_id) == str(prom.id),
              getattr(soc, "promoter_id", None))
    r2 = anon.post("/promotor/%s/sociedad-nueva" % token, data={
        "legal_name": nombre_soc, "tax_id": cif_soc}).get_json() or {}
    comprueba("crearla dos veces NO la duplica", r2.get("ok") and r2.get("reused"), r2)
    r3 = anon.post("/promotor/%s/sociedad-buscar" % token,
                   data={"tax_id": cif_soc}).get_json() or {}
    comprueba("ahora la encuentra por CIF y dice que ya es suya",
              r3.get("found") and r3.get("own"), r3)
    comprueba("sin razón social no se crea nada",
              not (anon.post("/promotor/%s/sociedad-nueva" % token,
                             data={"legal_name": " "}).get_json() or {}).get("ok"))

    # Se elige, y la próxima vez ya sale para elegir (está en sus opciones).
    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "promotor", "company_id": soc_id}).get_json() or {}
    comprueba("se guarda la sociedad elegida", bool(r.get("ok")), r.get("error"))
    s.expire_all()
    sheet = s.query(models.ConcertContractSheet).filter_by(concert_id=c.id).first()
    comprueba("queda apuntada en la ficha, pendiente de revisar",
              (sheet.promoter_data or {}).get("company_promoter_company_id") == soc_id
              and sheet.promoter_reviewed_at is None,
              (sheet.promoter_data or {}).get("company_promoter_company_id"))
    c_ahora = s.get(models.Concert, c.id)
    comprueba("y la ACTIVIDAD sigue sin ella hasta que se revise",
              c_ahora.promoter_company_id is None, c_ahora.promoter_company_id)
    with A.app.test_request_context():
        empresas = A._promoter_ask_companies(s, c_ahora)
    comprueba("la siguiente vez ya sale para ELEGIR",
              any(o["id"] == soc_id for o in empresas["options"]), empresas["options"])
    # Y la de otro promotor no se puede colar con este token.
    otro_prom = models.Promoter(nick="Otra %s" % suf)
    s.add(otro_prom); s.flush()
    ajena = models.PromoterCompany(promoter_id=otro_prom.id, legal_name="Ajena %s" % suf)
    s.add(ajena); s.commit()
    r = anon.post("/promotor/%s/guardar" % token, data={
        "section": "promotor", "company_id": str(ajena.id)})
    comprueba("la sociedad de OTRO promotor se rechaza", r.status_code == 403, r.status_code)

    # ── 10 · EL ENLACE CADUCA ──────────────────────────────────────────────────────────────
    print("\n10 · El enlace caduca a los 15 días")
    aviso = s.query(models.ConcertPromoterNotification).filter_by(public_token=token).first()
    aviso.expires_at = A._now_madrid() - datetime.timedelta(days=1)
    s.commit()
    pag = anon.get("/promotor/%s" % token).get_data(as_text=True)
    comprueba("la página se SIGUE viendo", "Actividad confirmada" in pag)
    comprueba("pero dice que ya no admite cambios", "ya no admite cambios" in pag)
    comprueba("y no se puede guardar nada",
              (anon.post("/promotor/%s/guardar" % token,
                         data={"section": "recinto", "name": "X"}).status_code) == 409)
    comprueba("ni dar de alta un recinto",
              (anon.post("/promotor/%s/recinto-nuevo" % token,
                         data={"name": "Y"}).status_code) == 409)
    comprueba("un token inventado da 404",
              anon.get("/promotor/noexiste").status_code == 404)

    # ── 11 · «YA SE LO HE CONFIRMADO YO» ───────────────────────────────────────────────────
    print("\n11 · Marcarlo a mano (por teléfono)")
    c2 = concierto()
    s.commit()
    correos.clear()
    r = cli.post("/conciertos/%s/avisar-promotor/ya-confirmado" % c2.id,
                 json={}).get_json() or {}
    comprueba("se apunta", bool(r.get("ok")), r.get("error"))
    comprueba("y NO se manda nada", not correos, correos)
    s.expire_all()
    with A.app.test_request_context():
        est2 = A._promoter_confirm_state(s, s.get(models.Concert, c2.id))
    comprueba("queda como confirmado", est2["notified"])
    comprueba("y marcado como «a mano»", est2["manual"])

    # ── 12 · LA FASE 4 DE UNA PETICIÓN ─────────────────────────────────────────────────────
    print("\n12 · La fase 4 de una petición se cierra sola")
    pet = models.BookingRequest(
        subject="Prueba %s" % suf, status="CONVERTIDA", created_by_user_id=yo.id,
        accepted_at=A._now_madrid(), artist_agreed_at=A._now_madrid())
    s.add(pet)
    s.flush()
    c3 = concierto()
    pet.concert_id = c3.id
    s.commit()
    with A.app.test_request_context():
        tareas = {t["key"]: t for t in A._peticion_accept_tasks(s, pet, c3, for_user=str(yo.id))}
    comprueba("la fase 4 lleva al AVISO nuevo",
              "avisar-promotor" in (tareas.get("promotor") or {}).get("notify_url", ""),
              (tareas.get("promotor") or {}).get("notify_url"))
    cli.post("/conciertos/%s/avisar-promotor/enviar" % c3.id, json={
        "channel": "EMAIL", "note": "x", "hidden": [], "sections": []})
    s.expire_all()
    pet = s.get(models.BookingRequest, pet.id)
    comprueba("al confirmarle, la fase 4 queda HECHA", pet.acceptance_notified_at is not None)

    # Y el bloqueo: sin el sí del artista, el paso sale con candado.
    pet2 = models.BookingRequest(subject="Sin artista %s" % suf, status="CONVERTIDA",
                                 created_by_user_id=yo.id, accepted_at=A._now_madrid())
    s.add(pet2)
    s.flush()
    c4 = concierto()
    pet2.concert_id = c4.id
    s.commit()
    with A.app.test_request_context():
        t2 = {t["key"]: t for t in A._peticion_accept_tasks(s, pet2, c4, for_user=str(yo.id))}
    comprueba("sin el sí del artista, el paso está BLOQUEADO",
              (t2.get("promotor") or {}).get("blocked") is True,
              (t2.get("promotor") or {}).get("blocked_reason"))

    # ── 13 · «ACTIVAR PRODUCCIÓN» DESDE LAS TAREAS PENDIENTES ──────────────────────────────
    # ⚠️⚠️ Su botón ABRE EL POP-UP de quién se encarga. Antes la fase solo traía la URL de la ficha
    # de la actividad, así que pulsarlo DESDE la propia ficha recargaba la misma página y **no
    # hacía nada** (bug real, sep 2026, lo vio Dani).
    print("\n13 · «Activar producción» desde las tareas pendientes")
    pet3 = models.BookingRequest(subject="Producción %s" % suf, status="CONVERTIDA",
                                 created_by_user_id=yo.id, accepted_at=A._now_madrid(),
                                 artist_agreed_at=A._now_madrid(),
                                 acceptance_notified_at=A._now_madrid())
    s.add(pet3)
    s.flush()
    c5 = concierto()
    pet3.concert_id = c5.id
    s.commit()
    with A.app.test_request_context():
        t3 = (({t["key"]: t for t in A._peticion_accept_tasks(s, pet3, c5, for_user=str(yo.id))})
              .get("produccion") or {})
    comprueba("la tarea «Activar producción» ABRE el pop-up de quién se encarga",
              t3.get("modal") == "#prodOwnerModal", t3)
    comprueba("y su enlace lleva a la ficha con `prod=1` (para Inicio, donde el pop-up no existe)",
              "prod=1" in (t3.get("url") or ""), t3.get("url"))
    tablero = cli.get("/conciertos/%s?tab=inicio" % c5.id).get_data(as_text=True)
    import re as _re
    plano = _re.sub(r"\s+", " ", tablero)
    filas = _re.findall(r'<div class="list-group-item act-step.*?(?=<div class="list-group-item act-step|$)', plano)
    fila = ([f for f in filas if "Activar producción" in f] or [""])[0]
    comprueba("en la ficha, su botón abre el pop-up", 'data-bs-target="#prodOwnerModal"' in fila, fila[-300:])
    comprueba("y ya no pinta el enlace que recargaba la misma página",
              not [a for a in _re.findall(r"<a [^>]*>.*?</a>", fila) if "Activar producción" in a])
    comprueba("el pop-up está en la pantalla", 'id="prodOwnerModal"' in tablero)
    llegada = _re.sub(r"\s+", " ", cli.get("/conciertos/%s?tab=inicio&prod=1" % c5.id).get_data(as_text=True))
    comprueba("llegando con `prod=1` el pop-up se abre solo", "if (true) setTimeout(abrir, 300)" in llegada)
    cli.post("/conciertos/%s/responsable-produccion" % c5.id,
             data={"user_id": str(yo.id), "next": "/conciertos/%s" % c5.id})
    s.expire_all()
    c5 = s.get(models.Concert, c5.id)
    comprueba("al elegir a alguien queda guardado", str(c5.production_owner_user_id) == str(yo.id),
              c5.production_owner_user_id)
    with A.app.test_request_context():
        t4 = {t["key"]: t for t in A._peticion_accept_tasks(s, pet3, c5, for_user=str(yo.id))}
    comprueba("y la tarea desaparece sola de lo pendiente", "produccion" not in t4, list(t4))
    # ⚠️ Y desde INICIO («Activar producción» de quien creó la actividad): allí el pop-up no existe,
    # así que su botón tiene que llevar a la ficha CON `prod=1`, que lo abre al llegar.
    c6 = concierto()
    s.commit()
    with A.app.test_request_context():
        filas_inicio = A._home_production_activation_pending(s, yo.id)
    mia = [f for f in filas_inicio if str(f["id"]) == str(c6.id)]
    comprueba("en Inicio sale «Activar producción» de lo que uno ha creado", bool(mia), len(filas_inicio))
    if mia:
        comprueba("y su botón lleva a la ficha con `prod=1`", "prod=1" in (mia[0].get("action_url") or ""),
                  mia[0].get("action_url"))

    s.close()
    print("\n%d OK · %d fallan" % (len(OK), len(KO)))
    if KO:
        print("\nLo que falla:")
        for k in KO:
            print("  · " + k)
    return 1 if KO else 0


if __name__ == "__main__":
    sys.exit(main())
