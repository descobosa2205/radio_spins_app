#!/usr/bin/env python3
"""HOJA DE RUTA · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y la BD de PRUEBA:
  · el orden de las pestañas (Horarios la primera, la actividad la última, Repertorio cuando se canta)
  · la hoja compartida sin sesión: la cabecera arriba, sin los iconos de «general» y «solo lectura»
  · el portal: quien está en el personal ve SOLO lo que le afecta (y el número de habitación solo de
    la suya); quien lleva la marca «puede actualizarla» edita horarios y repertorio, no hoteles
  · los SMS al personal PROGRAMADOS (se guardan, los manda el cron único, se anulan)
  · la tarea «Configurar el repertorio» de producción
  · el «sí» del artista deja la actividad NOTIFICADA (y la etiqueta verde se pincha)
  · cada tipo de punto pregunta solo lo suyo: personas de contacto (varias, sugeridas y creadas como
    tercero del promotor), el sitio y su espacio, la reserva de una comida, la citación sin fin
  · las COMPAÑÍAS DE TRANSPORTE (Bases de datos): alta con sus tipos, búsqueda por tipo, su permiso, y el
    traslado que las elige guarda `company_id`
  · la COMIDA CON MENÚ: el menú y sus platos, quién tiene que elegir, el enlace personal y la página pública,
    la elección (agotados, tope), la siguiente comida, el aviso en la app, la tarea del portal, pedir que
    respondan (SMS · correo) y los PDF
  · los TRASLADOS: sitios con código y terminal, estado, pasajeros con localizador/confirmado/maletas, la
    furgoneta con paradas, a quién afecta (los pasajeros siempre), el artista como pasajero, las APIs de
    sitios y de ruta (sin salir a la red)

    /tmp/python/bin/python3 tools/check_hoja_ruta.py

Requiere el entorno de /tmp de CLAUDE.md. Es IDEMPOTENTE (borra lo que crea).
"""
import json
import os
import pathlib
import re
import sys
import tempfile
from datetime import timedelta

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-hoja-ruta")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import flask                                          # noqa: E402
import app as A                                       # noqa: E402
import geo_utils                                      # noqa: E402
from models import (Artist, Concert, ConcertArtistNotification, MediaContact,   # noqa: E402
                    MediaLocation, MediaOutlet, Promoter, PromoterContact, RoadmapScheduledMessage,
                    TransportCompany, RoadmapMenuToken, AppNotification,
                    ThirdPartyLink, User, UserProfile, Venue)

A.app.config["WTF_CSRF_ENABLED"] = False
OK = FALLOS = 0


def check(nombre, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1; print("  ✓", nombre)
    else:
        FALLOS += 1; print("  ✗", nombre, extra)


# Nada sale de verdad: ni correos, ni SMS, ni geocodificación.
ENVIADOS = {"email": [], "sms": []}
A._send_optional_email = lambda to, *a, **k: (ENVIADOS["email"].append(to), (True, None))[1]
A._send_optional_sms = lambda s, to, text, **k: (ENVIADOS["sms"].append((to, text)), (True, None))[1]
A._sms_available = lambda: True
geo_utils.geocode_address = lambda *a, **k: {"lat": 36.68, "lng": -6.13, "label": "Jerez"}

HOY = A.today_local()
DIA = (HOY + timedelta(days=20)).isoformat()


def limpia(s):
    for c in s.query(Concert).filter(Concert.festival_name.in_(["Ruta Festival Prueba", "Ruta Evento Promo"])).all():
        s.query(ConcertArtistNotification).filter(ConcertArtistNotification.concert_id == c.id).delete()
        s.query(RoadmapScheduledMessage).filter(RoadmapScheduledMessage.entity_id == c.id).delete()
        s.delete(c)
    # El medio de la entrevista de prueba (con sus direcciones, sus personas y sus vinculaciones).
    for med in s.query(MediaOutlet).filter(MediaOutlet.name == "Radio Ruta").all():
        s.query(MediaLocation).filter(MediaLocation.media_id == med.id).delete()
        s.query(MediaContact).filter(MediaContact.media_id == med.id).delete()
        s.query(ThirdPartyLink).filter(ThirdPartyLink.target_type == "media",
                                       ThirdPartyLink.target_id == med.id).delete()
        s.delete(med)
    for pr in s.query(Promoter).filter(Promoter.contact_email == "nuria@radioruta.com").all():
        s.delete(pr)
    # Lo del apartado 10: la persona de contacto del promotor, el técnico vinculado al recinto y la
    # persona creada desde el asistente (tercero + persona de contacto del promotor).
    for pr in s.query(Promoter).filter(Promoter.contact_email == "nuevo@ruta-lote1.local").all():
        s.query(PromoterContact).filter(PromoterContact.link_promoter_id == pr.id).delete(synchronize_session=False)
        s.delete(pr)
    s.query(PromoterContact).filter(PromoterContact.email == "paco@ruta-lote1.local").delete(synchronize_session=False)
    for pr in s.query(Promoter).filter(Promoter.nick == "Tecnico Sala Ruta").all():
        s.query(ThirdPartyLink).filter(ThirdPartyLink.source_id == pr.id).delete(synchronize_session=False)
        s.delete(pr)
    # Los enlaces del menú del apartado 13.
    for c in s.query(Concert).filter(Concert.festival_name.in_(["Ruta Festival Prueba", "Ruta Evento Promo"])).all():
        s.query(RoadmapMenuToken).filter(RoadmapMenuToken.entity_id == c.id).delete(synchronize_session=False)
    # Las compañías de transporte del apartado 11.
    s.query(TransportCompany).filter(TransportCompany.name.in_(["Aerolínea Ruta", "Tren Ruta"])).delete(synchronize_session=False)
    s.flush()


def datos():
    s = A.db()
    try:
        limpia(s)
        art = s.query(Artist).filter(Artist.name == "Los Ruta").first()
        if art is None:
            art = Artist(name="Los Ruta"); s.add(art); s.flush()
        ven = s.query(Venue).filter(Venue.name == "Sala Ruta").first()
        if ven is None:
            ven = Venue(name="Sala Ruta", address="Calle Larga 1", municipality="Jerez de la Frontera",
                        province="Cádiz", country="España")
            s.add(ven); s.flush()
        ven.access_notes = "Por el muelle de carga, preguntar por Paco."
        ven.lat = ven.lng = None; ven.geocoded_at = None

        def tercero(nick, **kw):
            p = s.query(Promoter).filter(Promoter.nick == nick).first()
            if p is None:
                p = Promoter(nick=nick, **kw); s.add(p); s.flush()
            for k, v in kw.items():
                setattr(p, k, v)
            return p
        prom = tercero("Promotora Ruta", contact_email="hola@promotoraruta.com", contact_phone="+34600111222")
        ana = tercero("Ana Ruta", first_name="Ana", last_name="Ruiz", contact_email="ana@ruta.com", contact_phone="+34600000001")
        bea = tercero("Bea Ruta", first_name="Bea", last_name="Gil", contact_email="bea@ruta.com", contact_phone="+34600000002")
        u = s.query(User).filter(User.email == "dir.ruta@prueba.local").first()
        if u is None:
            u = User(email="dir.ruta@prueba.local", password_hash="x", role=10); s.add(u); s.flush()
            s.add(UserProfile(user_id=u.id, nick="dirruta", departments=["Producción"])); s.flush()
        u.role = 10
        c = Concert(artist_id=art.id, festival_name="Ruta Festival Prueba", activity_type="CONCIERTO",
                    sale_type="VENDIDO", capacity=800, date=HOY + timedelta(days=20), status="CONFIRMADO",
                    venue_id=ven.id, promoter_id=prom.id, production_owner_user_id=u.id,
                    created_by_user_id=u.id, ticketing_payload={"entry_mode": "SALE"})
        s.add(c); s.flush()

        def punto(i, kind, titulo, hora, **extra):
            d = {"id": i, "kind": kind, "title": titulo, "day": DIA, "start_time": hora, "end_time": "",
                 "tbc": False, "confirmed": True, "cancelled": False, "location": "", "note": "",
                 "order": 0, "attachments": [], "contact": {}, "sheets": {"GENERAL": True, "TECNICA": True}}
            d.update(extra); return d
        c.roadmap_payload = {
            "version": 2,
            "personnel": [
                {"id": "p1", "kind": "PROMOTER", "ref_id": str(ana.id), "name": "Ana Ruiz", "role": "Técnico de sonido",
                 "phone": "+34600000001", "email": "ana@ruta.com", "can_edit": True},
                {"id": "p2", "kind": "PROMOTER", "ref_id": str(bea.id), "name": "Bea Gil", "role": "Músico",
                 "phone": "+34600000002", "email": "bea@ruta.com"},
                {"id": "p3", "kind": "MANUAL", "ref_id": "", "name": "Carlos Manual", "role": "Conductor",
                 "phone": "", "email": ""},
            ],
            "hotels": [{"id": "h1", "name": "Hotel Ruta", "for_all": True, "assignee_ids": [], "days": [DIA],
                        "rooms": [{"id": "r1", "occupant_ids": ["p1"], "room_number": "101", "bed": "TWIN"},
                                  {"id": "r2", "occupant_ids": ["p2"], "room_number": "202", "bed": "TWIN"}]}],
            "agenda": [
                punto("a1", "SHOW", "Concierto", "21:00", sings=True, songs=[]),
                punto("a2", "PRUEBA_SONIDO", "Prueba de sonido", "18:00",
                      audience={"mode": "ROLES", "roles": ["Técnico de sonido"], "ids": []}),
                punto("a3", "OTROS", "Ensayo de coros", "17:00",
                      audience={"mode": "PEOPLE", "roles": [], "ids": ["p2"]}),
                punto("a4", "BUS", "Bus al recinto", "16:00",
                      transport={"mode": "BUS", "company": "Ruta Bus", "passengers": [{"personnel_id": "p1"}]}),
                punto("a5", "OTROS", "Catering", "20:00", access_note="Entrada por el muelle"),
            ],
        }
        c2 = Concert(artist_id=art.id, festival_name="Ruta Evento Promo", activity_type="EVENTO_PROMOCIONAL",
                     sale_type="GRATUITO", capacity=0, date=HOY + timedelta(days=25), status="CONFIRMADO",
                     venue_id=ven.id, production_owner_user_id=u.id, created_by_user_id=u.id)
        s.add(c2)
        s.commit()
        return {"cid": str(c.id), "cid2": str(c2.id), "uid": str(u.id), "ana": str(ana.id), "bea": str(bea.id),
                "vid": str(ven.id)}
    finally:
        s.close()


def cliente_casa(uid):
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["user_id"] = uid
    return c


def cliente_ext(pid, preview=False):
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["ext_ids"] = [pid]
        ses["ext_since"] = A._now_madrid().isoformat()
        ses["ext_name"] = "Externo Prueba"
        if preview:
            ses["ext_preview"] = True
    return c


def roadmap_data(html):
    m = re.search(r'<script type="application/json" id="roadmapData">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def main():
    d = datos()
    cid, uid = d["cid"], d["uid"]
    base = "/hoja-ruta/concert/%s" % cid

    print("\n1 · El contexto y las pestañas")
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        with A.app.test_request_context():
            ctx = A._roadmap_context(s, "concert", c)
        check("el recinto llega con su nombre, su acceso y su mapa",
              (ctx.get("venue") or {}).get("name") == "Sala Ruta" and ctx["venue"]["access_notes"]
              and ctx["venue"]["lat"] and ctx["venue"]["maps_query"], str(ctx.get("venue"))[:200])
        check("un concierto enseña Repertorio", ctx.get("show_repertoire") is True)
        check("el set list llega (todavía sin canciones)", ctx.get("setlist") is not None and not ctx["setlist"]["exists"])
        check("el promotor va en la actividad", (ctx["activity"].get("promoter") or {}).get("name") == "Promotora Ruta",
              str(ctx["activity"].get("promoter")))
        check("los puntos llevan a quién afectan", ctx["payload"]["agenda"][1]["audience"]["mode"] == "ROLES")
        s.commit()   # las coordenadas del recinto
        check("las coordenadas quedan guardadas en el recinto", s.get(Venue, A.to_uuid(d["vid"])).lat is not None)
    finally:
        s.close()
    casa = cliente_casa(uid)
    r = casa.get("/conciertos/%s?tab=produccion" % cid)
    html = r.data.decode()
    tabs = re.findall(r'data-rm-tab="([a-z]+)"', html)
    check("ficha: Horarios la primera, Repertorio y la actividad la ÚLTIMA",
          tabs == ["agenda", "logistica", "hoteles", "personal", "repertorio", "actividad"], str(tabs))
    check("ficha: dentro NO va la cabecera arriba", 'id="rmHeader"' not in html)

    print("\n2 · La hoja compartida (sin sesión)")
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        token = A._ensure_roadmap_token(s, c); s.commit()
    finally:
        s.close()
    anon = A.app.test_client()
    r = anon.get("/hoja-ruta/ver/%s" % token)
    html = r.data.decode()
    check("se abre sin sesión", r.status_code == 200, str(r.status_code))
    check("la cabecera de la actividad va arriba del todo", 'id="rmHeader"' in html)
    visible = re.sub(r"<script.*?</script>", "", html, flags=re.S)   # el payload JSON no se ve
    check("fuera los iconos de «general» y «solo lectura»", "Solo lectura" not in visible and "general" not in visible.lower())
    rd = roadmap_data(html)
    check("el payload dice header_on_top y readonly", rd and rd.get("header_on_top") is True and rd.get("readonly") is True)
    tabs = re.findall(r'data-rm-tab="([a-z]+)"', html)
    check("compartida: Horarios la primera y la actividad la última", tabs[0] == "agenda" and tabs[-1] == "actividad", str(tabs))
    r = anon.get(base + "/personal/datos")
    check("un anónimo NO entra en los endpoints de la hoja de ruta (302, sin NameError)", r.status_code in (301, 302), str(r.status_code))

    print("\n3 · El portal: quien está en el personal ve solo lo suyo")
    ext = cliente_ext(d["bea"])
    r = ext.get("/externos/actividad/%s" % cid)
    html = r.data.decode()
    check("Bea abre su actividad", r.status_code == 200, str(r.status_code))
    rd = roadmap_data(html) or {}
    ids = [it["id"] for it in (rd.get("payload") or {}).get("agenda", [])]
    check("ve lo de todos, lo de sus funciones y lo suyo", sorted(ids) == ["a1", "a3", "a5"], str(ids))
    rooms = {r_["id"]: r_ for h in rd["payload"]["hotels"] for r_ in h["rooms"]}
    check("el número de habitación solo de la suya",
          rooms["r2"].get("room_number") == "202" and "room_number" not in rooms["r1"], str(rooms))
    check("no puede actualizarla", "Puedes actualizarla" not in html and not rd.get("ext_editor"))
    r = ext.post(base + "/item", json={"kind": "OTROS", "title": "Intento", "day": DIA})
    check("y un POST suyo se rebota", r.status_code in (302, 403) or not (r.is_json and r.get_json().get("ok")), str(r.status_code))

    print("\n4 · El portal: quien lleva la marca la ACTUALIZA")
    ed = cliente_ext(d["ana"])
    r = ed.get("/externos/actividad/%s" % cid)
    html = r.data.decode()
    rd = roadmap_data(html) or {}
    check("Ana ve la marca y la hoja ENTERA", "Puedes actualizarla" in html and rd.get("ext_editor") is True
          and rd.get("readonly") is False and len(rd["payload"]["agenda"]) == 5)
    r = ed.post(base + "/item", json={"kind": "OTROS", "title": "Añadido por Ana", "day": DIA, "start_time": "12:00",
                                       "audience": {"mode": "ALL"}, "sings": True})
    j = r.get_json() if r.is_json else {}
    check("añade un punto a los horarios", r.status_code == 200 and j.get("ok") and len(j["payload"]["agenda"]) == 6, str(r.status_code))
    check("y queda apuntado que lo cambió un externo", (j.get("payload") or {}).get("updated_by") == "Externo Prueba", str(j.get("payload", {}).get("updated_by")))
    r = ed.post(base + "/hotel", json={"name": "Hotel colado"})
    check("pero NO toca los hoteles", r.status_code in (301, 302, 403), str(r.status_code))
    r = ed.post(base + "/enlace", json={"action": "ensure", "kind": "GENERAL"})
    check("ni comparte enlaces", r.status_code in (301, 302, 403), str(r.status_code))
    r = ed.get(base + "/personal/pdf")
    check("baja el listado del personal", r.status_code == 200 and r.data[:4] == b"%PDF", str(r.status_code))
    r = ed.get(base + "/rooming/h1/pdf?dni=1")
    check("y el rooming con DNI", r.status_code == 200 and r.data[:4] == b"%PDF", str(r.status_code))
    prev = cliente_ext(d["ana"], preview=True)
    r = prev.post(base + "/item", json={"kind": "OTROS", "title": "Desde la previsualización", "day": DIA})
    check("previsualizando (dirección) no se edita nada", r.status_code in (301, 302, 403), str(r.status_code))

    print("\n5 · Los SMS al personal: ahora o PROGRAMADOS")
    manana = (A._now_madrid() + timedelta(days=1)).replace(hour=8, minute=30, second=0, microsecond=0)
    r = ed.post(base + "/personal/mensaje/enviar", json={"channel": "SMS", "ids": ["p1", "p2"], "body": "El bus sale a las 8:30",
                                                          "send_at": manana.strftime("%Y-%m-%dT%H:%M")})
    j = r.get_json() if r.is_json else {}
    check("un externo con la marca lo deja programado", r.status_code == 200 and j.get("ok") and j.get("scheduled") is True
          and len(j.get("scheduled_rows") or []) == 1, str(j)[:200])
    check("nada ha salido todavía", not ENVIADOS["sms"])
    s = A.db()
    try:
        fila = s.query(RoadmapScheduledMessage).filter(RoadmapScheduledMessage.entity_id == A.to_uuid(cid)).first()
        check("la fila queda PENDIENTE y dice quién la dejó", fila is not None and fila.status == "PENDIENTE"
              and fila.created_by_nick == "Externo Prueba" and sorted(fila.person_ids) == ["p1", "p2"])
        fila.send_at = A._now_madrid() - timedelta(minutes=1)
        s.commit()
        mid = str(fila.id)
    finally:
        s.close()
    res = A._roadmap_scheduled_messages_sweep()
    check("el cron único lo manda cuando toca", res.get("enviados") == 1 and res.get("errores") == 0, str(res))
    check("UN SMS por persona, con el texto", len(ENVIADOS["sms"]) == 2 and all("8:30" in t for _, t in ENVIADOS["sms"]), str(ENVIADOS["sms"]))
    s = A.db()
    try:
        fila = s.get(RoadmapScheduledMessage, A.to_uuid(mid))
        check("la fila pasa a ENVIADO con su resultado", fila.status == "ENVIADO" and (fila.result or {}).get("sent") == 2, str(fila.result))
    finally:
        s.close()
    res = A._roadmap_scheduled_messages_sweep()
    check("no se manda dos veces", res.get("enviados") == 0 and len(ENVIADOS["sms"]) == 2)
    r = casa.post(base + "/personal/mensaje/enviar", json={"channel": "EMAIL", "ids": ["p1", "p2"], "body": "Prueba de correo",
                                                            "send_at": manana.strftime("%Y-%m-%dT%H:%M")})
    j = r.get_json() if r.is_json else {}
    check("desde la casa también se programa", j.get("ok") and j.get("scheduled"), str(j)[:160])
    mid2 = (j.get("scheduled_rows") or [{}])[0].get("id")
    r = casa.post(base + "/personal/mensaje/anular", json={"id": mid2})
    j = r.get_json() if r.is_json else {}
    check("y se anula", j.get("ok") and not j.get("scheduled_rows"), str(j)[:160])
    r = casa.post(base + "/personal/mensaje/enviar", json={"channel": "SMS", "ids": ["p1"], "body": "Ahora mismo"})
    j = r.get_json() if r.is_json else {}
    check("mandar AHORA sigue mandando en el momento", j.get("ok") and j.get("sent") == 1 and len(ENVIADOS["sms"]) == 3, str(j)[:160])
    r = casa.get(base + "/personal/mensaje")
    j = r.get_json() if r.is_json else {}
    check("el pop-up recibe la lista de programados (sin los anulados ni los mandados)", j.get("ok") and j.get("scheduled") == [], str(j.get("scheduled")))
    check("el cron único conoce la tarea", any(t.get("key") == "mensajes_personal" and t.get("fn") in dir(A) for t in A.CRON_TASKS))

    print("\n6 · La tarea «Configurar el repertorio»")
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        pend = A._roadmap_repertoire_pending(A._roadmap_load(c))
        check("los puntos que cantan sin canciones reclaman (el de siempre y el que añadió Ana)",
              len(pend) == 2 and "a1" in [p["id"] for p in pend], str([p["id"] for p in pend]))
        with A.app.test_request_context():
            flask.session["user_id"] = uid
            board = A._concert_task_board(s, c)
            check("sale en el tablero de la ficha (área producción)", "Configurar el repertorio" in json.dumps(board, default=str))
            mios = A._home_roadmap_repertoire_pending()
        check("y en Inicio a quien lleva la producción", any(m["id"] == cid for m in mios), str([m.get("title") for m in mios]))
    finally:
        s.close()
    r = casa.post(base + "/item/repertorio", json={"id": "a1", "songs": [{"song_id": "", "title": "Tema uno"}, {"title": "Tema dos"}]})
    j = r.get_json() if r.is_json else {}
    check("se ponen las canciones de un punto", j.get("ok") and len([x for x in j["payload"]["agenda"] if x["id"] == "a1"][0]["songs"]) == 2, str(j)[:160])
    r = casa.get(base + "/repertorio/pdf?item=a1")
    check("y su PDF sale", r.status_code == 200 and r.data[:4] == b"%PDF", str(r.status_code))
    r = anon.get("/hoja-ruta/ver/%s/repertorio.pdf?item=a1" % token)
    check("también desde la hoja compartida", r.status_code == 200 and r.data[:4] == b"%PDF", str(r.status_code))
    r = anon.get("/hoja-ruta/ver/%s/repertorio.pdf?item=noexiste" % token)
    check("un punto que no es de esa hoja da 404", r.status_code == 404, str(r.status_code))

    print("\n7 · El «sí» del artista ES la comunicación")
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        with A.app.test_request_context():
            check("antes: sin notificar", not A._concert_notice_state(s, c)["notified"])
            aviso = ConcertArtistNotification(concert_id=c.id, channel="EMAIL", kind="CONFIRMAR",
                                              recipients=[{"name": "Luis Ruta", "email": "luis@ruta.com"}],
                                              snapshot={}, public_token=A._uuid_token())
            s.add(aviso); s.flush()
            A._artist_confirmation_apply(s, aviso, c, "OK")
            s.commit()
            st = A._concert_notice_state(s, c)
        check("después: notificada, con el tipo CONFIRMACION y a quién", st["notified"] and st["kind"] == "CONFIRMACION"
              and "Luis Ruta" in st["to_label"], str(st)[:200])
        check("la compuerta de CONFIRMADO se abre (None = se puede)", A._concert_notice_gate(s, c, "CONFIRMADO") is None)
    finally:
        s.close()
    r = casa.get("/conciertos/%s?tab=general" % cid)
    html = r.data.decode()
    check("la etiqueta verde es un enlace para volver a notificar",
          re.search(r'<a class="badge text-bg-success[^>]*href="[^"]*avisar-artista', html) is not None
          and "pincha para volver a notificarle" in html)
    check("y el botón amarillo de «Notificar» ya no sale destacado", 'btn-outline-warning btn-sm" href="/conciertos/%s/avisar-artista"' % cid not in html)
    A._artist_confirmed_notified_backfill_once()
    check("el arreglo puntual corre sin reventar", True)

    print("\n8 · Quién va con el artista: solo el círculo")
    r = casa.get("/conciertos/%s?tab=inicio" % d["cid2"])
    html = r.data.decode()
    check("la ficha del evento promocional pinta el acompañante con el círculo", 'class="escort-av"' in html and "ficha-hero__media\" style=\"flex:0 0 auto" not in html, str(r.status_code))

    print("\n9 · Añadir un punto: el asistente por pasos (el mismo para todos)")
    # El contexto que necesita el asistente: cómo se hace una entrevista, cómo se canta y quién es
    # el artista (la etiqueta rápida del phoner y una tarjeta más en «a quién afecta»).
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        with A.app.test_request_context():
            ctx = A._roadmap_context(s, "concert", c)
        check("las modalidades son presencial · phoner · zoom",
              [x["key"] for x in ctx["interview_modalities"]] == ["PRESENCIAL", "PHONER", "ZOOM"],
              str(ctx.get("interview_modalities")))
        check("los formatos son los de promoción (no hay dos catálogos)",
              [x["key"] for x in ctx["formations"]] == [k for k, _l, _i in A.PROMO_FORMATIONS])
        check("el artista llega con su foto", [a["name"] for a in ctx["artists"]] == ["Los Ruta"], str(ctx.get("artists")))
        check("y los tipos de medio, para crear uno al vuelo", "Radio" in (ctx.get("media_types") or []))
    finally:
        s.close()

    # LA FICHA DE UN MEDIO en una llamada: qué es, sus direcciones y sus personas con su cara.
    s = A.db()
    try:
        med = MediaOutlet(name="Radio Ruta", media_type="Radio", logo_url="/static/img/logo.png")
        s.add(med); s.commit()
        mid = str(med.id)
    finally:
        s.close()
    r = casa.get("/api/media/%s/ficha" % mid)
    ficha = r.get_json() or {}
    check("la ficha del medio dice QUÉ es y con qué icono",
          ficha.get("media_type") == "Radio" and ficha.get("icon") == "fa-radio", str(ficha)[:150])
    check("todavía no tiene direcciones ni personas", ficha.get("locations") == [] and ficha.get("contacts") == [])

    r = casa.post("/api/media/%s/ubicaciones" % mid, json={"address": "Gran Vía 32, Madrid"})
    loc = r.get_json() or {}
    check("se le guarda una dirección", loc.get("ok") and loc.get("id"), str(loc)[:150])
    r2 = casa.post("/api/media/%s/ubicaciones" % mid, json={"address": "Gran Vía 32, Madrid"})
    check("y la MISMA no se duplica", (r2.get_json() or {}).get("id") == loc.get("id"))

    r = casa.post("/api/media/%s/contacts/create" % mid,
                  json={"name": "Nuria Prensa", "role": "Redactora", "email": "nuria@radioruta.com",
                        "phone": "600999888"})
    per = r.get_json() or {}
    check("una persona del medio se crea con su cargo", per.get("ok") and per.get("name") == "Nuria Prensa", str(per)[:150])
    s = A.db()
    try:
        pr = s.query(Promoter).filter(Promoter.contact_email == "nuria@radioruta.com").first()
        check("⚠️ y ES UN TERCERO: se le crea su ficha", pr is not None)
        vinc = s.query(ThirdPartyLink).filter(ThirdPartyLink.target_type == "media",
                                              ThirdPartyLink.target_id == A.to_uuid(mid)).first()
        check("que queda VINCULADA al medio con su cargo", vinc is not None and vinc.relation_title == "Redactora",
              str(getattr(vinc, "relation_title", None)))
        mc = s.query(MediaContact).filter(MediaContact.media_id == A.to_uuid(mid)).first()
        check("y el contacto apunta a esa ficha", mc is not None and str(mc.promoter_id) == str(pr.id))
    finally:
        s.close()
    ficha = (casa.get("/api/media/%s/ficha" % mid).get_json() or {})
    check("la ficha ya trae su dirección y su persona",
          len(ficha.get("locations") or []) == 1 and len(ficha.get("contacts") or []) == 1, str(ficha)[:200])

    # UNA ENTREVISTA con todo lo que se pregunta ahora.
    art_id = None
    s = A.db()
    try:
        art_id = str(s.query(Artist).filter(Artist.name == "Los Ruta").first().id)
    finally:
        s.close()
    punto = {"kind": "ENTREVISTA", "day": DIA, "start_time": "10:30", "end_time": "11:00", "title": "",
             "confirmed": True, "sings": True, "note": "Llegar 10 minutos antes",
             "audience": {"mode": "PEOPLE", "roles": [], "ids": ["artist:%s" % art_id]},
             "contact": {"name": "Nuria Prensa", "phone": "600999888", "photo": "/x.png", "role": "Redactora"},
             "interview": {"media_id": mid, "media_name": "Radio Ruta", "type": "Radio", "program": "La Ventana",
                           "modality": "PHONER", "live": True, "sings": True, "formation": "DIRECTO",
                           "call_to": {"kind": "ARTIST", "id": art_id, "name": "Los Ruta"},
                           "zoom_url": "", "songs": []}}
    r = casa.post(base + "/item", json=punto)
    resp = r.get_json() or {}
    it = [x for x in ((resp.get("payload") or {}).get("agenda") or []) if x.get("kind") == "ENTREVISTA"]
    it = it[0] if it else {}
    iv = it.get("interview") or {}
    check("se guarda cómo se hace (phoner) y a quién llaman",
          iv.get("modality") == "PHONER" and (iv.get("call_to") or {}).get("kind") == "ARTIST", str(iv)[:200])
    check("y si es en directo, con qué formato y de qué programa",
          iv.get("live") is True and iv.get("formation") == "DIRECTO" and iv.get("program") == "La Ventana")
    check("el tipo del medio y su icono van con el punto",
          iv.get("type") == "Radio" and iv.get("media_icon") == "fa-radio", str(iv.get("media_icon")))
    check("el contacto guarda su cara y su cargo",
          (it.get("contact") or {}).get("photo") == "/x.png" and (it.get("contact") or {}).get("role") == "Redactora")
    check("EL ARTISTA puede ser el destinatario del punto",
          (it.get("audience") or {}).get("ids") == ["artist:%s" % art_id], str(it.get("audience")))

    # Y ese punto le afecta al ARTISTA (a él y a sus integrantes), no a cualquiera del personal.
    info_art = {"person_ids": [], "roles": set(), "artist_keys": {"artist:%s" % art_id}}
    info_otro = {"person_ids": ["p2"], "roles": set(), "artist_keys": set()}
    check("al artista le afecta", A._roadmap_item_affects(it, info_art) is True)
    check("y a quien no es él, no", A._roadmap_item_affects(it, info_otro) is False)

    punto2 = dict(punto)
    punto2["id"] = it.get("id")
    punto2["interview"] = dict(punto["interview"], modality="ZOOM", zoom_url="https://zoom.us/j/1", call_to={})
    r = casa.post(base + "/item", json=punto2)
    it2 = [x for x in ((r.get_json() or {}).get("payload") or {}).get("agenda", []) if x.get("id") == it.get("id")]
    iv2 = (it2[0].get("interview") if it2 else {}) or {}
    check("pasarla a Zoom guarda su enlace (el botón de entrar sale de aquí)",
          iv2.get("modality") == "ZOOM" and iv2.get("zoom_url") == "https://zoom.us/j/1", str(iv2)[:160])
    check("una entrevista no espera respuesta: su enlace no se inventa", iv2.get("zoom_tbc") is False)

    # ⚠️ Lo del medio lo hace PRODUCCIÓN, que no tiene por qué llevar la sección de medios.
    s = A.db()
    try:
        prod = s.query(User).filter(User.email == "prod.ruta@prueba.local").first()
        if prod is None:
            prod = User(email="prod.ruta@prueba.local", password_hash="x", role=1); s.add(prod); s.flush()
            s.add(UserProfile(user_id=prod.id, nick="prodruta", departments=["Producción"]))
        prod.role = 1
        # Con su sección concedida, que es lo que tiene quien monta una producción de verdad.
        import models as M
        s.query(M.UserAccessGrant).filter(M.UserAccessGrant.user_id == prod.id).delete()
        s.add(M.UserAccessGrant(user_id=prod.id, resource_key="produccion", can_view_basic=True,
                                can_view_econ=True, can_edit=True))
        s.commit()
        pid_prod = str(prod.id)
    finally:
        s.close()
    cli = cliente_casa(pid_prod)
    check("producción puede leer la ficha del medio", cli.get("/api/media/%s/ficha" % mid).status_code == 200)
    check("y guardar una dirección nueva",
          cli.post("/api/media/%s/ubicaciones" % mid, json={"address": "Otra calle 5"}).status_code == 200)

    print("\n10 · Cada tipo pregunta solo lo suyo: contactos (varios), el sitio y su espacio, la reserva, sin fin")
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        prom = s.get(Promoter, c.promoter_id)
        # Una persona de contacto del promotor y un tercero vinculado al recinto: lo que se SUGIERE.
        s.add(PromoterContact(promoter_id=prom.id, title="Jefe de producción", first_name="Paco", last_name="Prod",
                              email="paco@ruta-lote1.local", phone="600000010"))
        teo = s.query(Promoter).filter(Promoter.nick == "Tecnico Sala Ruta").first()
        if teo is None:
            teo = Promoter(nick="Tecnico Sala Ruta", first_name="Teo", last_name="Sala", contact_phone="600000012")
            s.add(teo); s.flush()
        s.add(ThirdPartyLink(source_type="promoter", source_id=teo.id, target_type="venue", target_id=c.venue_id,
                             relation_title="Técnico de la sala", is_active=True))
        c.contracting_payload = {"meet_greet": {"enabled": True, "quantity": "12", "moment": "antes"}}
        s.commit()
        with A.app.test_request_context():
            ctx = A._roadmap_context(s, "concert", c)
        rules = ctx.get("kind_rules") or {}
        check("las reglas llegan al asistente (no_sing · at_venue · place · no_contact · no_end)",
              "ACTUACION" in rules.get("no_sing", []) and "VUELO" in rules.get("no_sing", [])
              and "PRUEBA_SONIDO" in rules.get("at_venue", []) and "MG" in rules.get("place", [])
              and "ACTUACION" in rules.get("no_contact", []) and "CITACION" in rules.get("no_end", []), str(rules)[:200])
        check("el M&G nace con las personas que dice la ficha", ctx.get("meet_greet_count") == "12", str(ctx.get("meet_greet_count")))
        nombres = [x["name"] for x in (ctx.get("contact_suggestions") or [])]
        check("se sugieren el promotor, su persona de contacto y la del recinto",
              "Promotora Ruta" in nombres and "Paco Prod" in nombres and "Teo Sala" in nombres, str(nombres))
        paco = ([x for x in ctx.get("contact_suggestions") or [] if x["name"] == "Paco Prod"] or [{}])[0]
        check("con su cargo y de dónde viene", paco.get("role") == "Jefe de producción" and (paco.get("source") or "").startswith("Promotor"), str(paco))
        check("y los contactos del recinto salen también en su viñeta (la clave es `linked`, no `other`)",
              any(x["name"] == "Teo Sala" for x in (ctx.get("venue") or {}).get("contacts", [])), str((ctx.get("venue") or {}).get("contacts")))
    finally:
        s.close()

    # Un M&G en el recinto (en un espacio), con su número y DOS personas de contacto.
    r = casa.post(base + "/item", json={
        "kind": "MG", "day": DIA, "start_time": "19:00", "end_time": "19:30", "confirmed": True,
        "sings": True, "songs": [{"song_id": "x", "title": "no"}], "location": "no debería quedar",
        "place": {"mode": "VENUE", "space": "Camerino 2"}, "mg_count": "10",
        "contacts": [{"name": "Paco Prod", "phone": "600000010", "role": "Jefe de producción"},
                     {"name": "Teo Sala", "phone": "600000012"}, {"name": "Paco Prod"}]})
    pay = (r.get_json() or {}).get("payload") or {}
    mg = ([x for x in pay.get("agenda", []) if x.get("kind") == "MG"] or [{}])[0]
    check("un M&G: en el recinto, en el Camerino 2, sin dirección y con su número",
          (mg.get("place") or {}).get("mode") == "VENUE" and (mg.get("place") or {}).get("space") == "Camerino 2"
          and mg.get("location") == "" and mg.get("mg_count") == "10", str(mg.get("place")) + " " + str(mg.get("location")))
    check("en un M&G no se canta aunque el cliente lo mande (y no reclama repertorio)",
          mg.get("sings") is False and mg.get("songs") == []
          and not any(x.get("kind") == "MG" for x in A._roadmap_repertoire_pending(pay)))
    check("dos personas de contacto (la repetida no entra) y la primera espejada en `contact`",
          len(mg.get("contacts") or []) == 2 and (mg.get("contact") or {}).get("name") == "Paco Prod", str(mg.get("contacts")))
    # Editar SIN mandar contactos ni sitio (un navegador con el JS viejo) los CONSERVA.
    r = casa.post(base + "/item", json={"id": mg.get("id"), "kind": "MG", "day": DIA, "start_time": "19:15", "title": "M&G"})
    pay = (r.get_json() or {}).get("payload") or {}
    mg2 = ([x for x in pay.get("agenda", []) if x.get("id") == mg.get("id")] or [{}])[0]
    check("editar sin mandarlos conserva las personas, el espacio y el número",
          len(mg2.get("contacts") or []) == 2 and (mg2.get("place") or {}).get("space") == "Camerino 2" and mg2.get("mg_count") == "10")
    # Una comida en un restaurante con reserva, y una citación a UNA hora.
    r = casa.post(base + "/item", json={"kind": "COMIDA", "day": DIA, "start_time": "14:00", "end_time": "15:30",
                                        "place": {"mode": "OTHER", "space": "Sala privada"}, "location": "Casa Pepe, Calle Mayor 3",
                                        "meal": {"reservation": "1", "diners": "14"}})
    pay = (r.get_json() or {}).get("payload") or {}
    co = ([x for x in pay.get("agenda", []) if x.get("kind") == "COMIDA"] or [{}])[0]
    check("una comida en un restaurante, en la sala privada, con reserva para 14",
          (co.get("place") or {}).get("mode") == "OTHER" and co.get("location") == "Casa Pepe, Calle Mayor 3"
          and (co.get("meal") or {}).get("reservation") is True and (co.get("meal") or {}).get("diners") == 14, str(co.get("meal")))
    # ⚠️ «No hace falta reserva» es un estado propio: NO es lo mismo que «no hay reserva» (eso es
    # trabajo pendiente). Y al pasar la comida al RECINTO, la reserva se limpia sola.
    r = casa.post(base + "/item", json={"id": co.get("id"), "kind": "COMIDA", "day": DIA, "start_time": "14:00",
                                        "place": {"mode": "OTHER", "space": "Sala privada"}, "location": "Casa Pepe, Calle Mayor 3",
                                        "meal": {"reservation": "NOT_NEEDED"}})
    co2 = ([x for x in ((r.get_json() or {}).get("payload") or {}).get("agenda", []) if x.get("id") == co.get("id")] or [{}])[0]
    check("en un restaurante se puede decir que NO HACE FALTA reserva",
          (co2.get("meal") or {}).get("reservation") == "NOT_NEEDED"
          and (co2.get("meal") or {}).get("diners") is None, str(co2.get("meal")))
    r = casa.post(base + "/item", json={"id": co.get("id"), "kind": "COMIDA", "day": DIA, "start_time": "14:00",
                                        "place": {"mode": "VENUE", "space": "Comedor"},
                                        "meal": {"reservation": "1", "diners": "14"}})
    co3 = ([x for x in ((r.get_json() or {}).get("payload") or {}).get("agenda", []) if x.get("id") == co.get("id")] or [{}])[0]
    check("al pasarla al recinto, la reserva se deja de guardar",
          (co3.get("meal") or {}).get("reservation") is None and (co3.get("meal") or {}).get("diners") is None, str(co3.get("meal")))
    r = casa.post(base + "/item", json={"kind": "CITACION", "day": DIA, "start_time": "17:00", "end_time": "18:00"})
    ci = ([x for x in ((r.get_json() or {}).get("payload") or {}).get("agenda", []) if x.get("kind") == "CITACION"] or [{}])[0]
    check("una citación es a una hora: no guarda fin", ci.get("start_time") == "17:00" and ci.get("end_time") == "", str(ci.get("end_time")))
    # Una persona de contacto NUEVA: tercero + persona de contacto del promotor, y sale sugerida.
    r = casa.post(base + "/contacto/tercero", json={"name": "Nuevo Contacto Ruta", "phone": "600000099",
                                                     "email": "nuevo@ruta-lote1.local", "role": "Prensa local"})
    nc = r.get_json() or {}
    check("una persona nueva vuelve lista para marcarla", r.status_code == 200 and nc.get("ok") and nc.get("promoter_id"), str(nc)[:160])
    s = A.db()
    try:
        pr = s.query(Promoter).filter(Promoter.contact_email == "nuevo@ruta-lote1.local").first()
        pc = (s.query(PromoterContact).filter(PromoterContact.link_promoter_id == pr.id).first() if pr else None)
        c = s.get(Concert, A.to_uuid(cid))
        check("⚠️ ES un tercero y queda como persona de contacto del promotor, con su cargo",
              pr is not None and pc is not None and str(pc.promoter_id) == str(c.promoter_id) and pc.title == "Prensa local",
              str(getattr(pc, "title", None)))
        casa.post(base + "/contacto/tercero", json={"name": "Nuevo Contacto Ruta", "email": "nuevo@ruta-lote1.local"})
        check("volver a crearla por su correo no duplica la ficha",
              s.query(Promoter).filter(Promoter.contact_email == "nuevo@ruta-lote1.local").count() == 1)
        with A.app.test_request_context():
            ctx = A._roadmap_context(s, "concert", c)
        check("y la próxima vez sale SUGERIDA", any(x["name"] == "Nuevo Contacto Ruta" for x in ctx.get("contact_suggestions") or []))
    finally:
        s.close()

    print("\n13 · La comida con menú: el menú, quién elige, el enlace personal, pedir que respondan, los PDF")
    # Alguien de la CASA en el personal (para el aviso en la app).
    s = A.db()
    try:
        casa_u = s.query(User).filter(User.email == "prod.ruta@prueba.local").first()
        uid_prod = str(casa_u.id) if casa_u else ""
    finally:
        s.close()
    rp = casa.post(base + "/personal", json={"kind": "USER", "ref_id": uid_prod, "name": "Prod Ruta", "role": "Producción"}).get_json() if uid_prod else {}
    pid_prod = rp.get("person_id") or ""
    # Una comida SIN menú todavía. ⚠️ Es EN EL RECINTO, así que NO lleva reserva aunque se mande.
    r = casa.post(base + "/item", json={"kind": "COMIDA", "day": DIA, "start_time": "14:00", "title": "Comida del equipo",
                                        "place": {"mode": "VENUE", "space": "Comedor"}, "meal": {"reservation": "1", "diners": "12"},
                                        "audience": {"mode": "PEOPLE", "roles": [], "ids": ["p1", "p2", pid_prod]}}).get_json() or {}
    co = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("kind") == "COMIDA" and x.get("title") == "Comida del equipo"] or [{}])[0]
    iid = co.get("id") or ""
    check("la comida se crea sin menú (la pestaña Comidas no se pinta)", iid and co["meal"]["menu"] is None and not A._roadmap_show_meals(r.get("payload") or {}))
    check("comiendo EN EL RECINTO no se guarda reserva (no hay nada que reservar)",
          co["meal"]["reservation"] is None and co["meal"]["diners"] is None, str(co.get("meal")))
    # EL MENÚ: dos secciones que se eligen (una con dos platos) y una fija.
    menu = {"kind": "MENU", "title": "Menú del catering", "sections": [
        {"id": "s_ent", "name": "Entrante", "mode": "CHOOSE", "choose_n": 1, "dishes": [
            {"id": "d_ens", "title": "Ensalada", "desc": "Con tomate", "tags": ["VEGANO", "SIN_GLUTEN", "inventada"]},
            {"id": "d_sopa", "title": "Sopa", "sold_out": True}]},
        {"id": "s_pri", "name": "Plato principal", "mode": "CHOOSE", "choose_n": 2, "dishes": [
            {"id": "d_pollo", "title": "Pollo"}, {"id": "d_pesc", "title": "Pescado"}, {"id": "d_tofu", "title": "Tofu", "tags": ["VEGANO"]}]},
        {"id": "s_cafe", "name": "Café", "mode": "FIXED", "dishes": [{"id": "d_cafe", "title": "Café e infusiones"}]},
        {"name": "", "dishes": []}]}
    r = casa.post(base + "/comida/%s/menu" % iid, json={"menu": menu}).get_json() or {}
    co = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("id") == iid] or [{}])[0]
    mn = (co.get("meal") or {}).get("menu") or {}
    check("el menú se guarda: 3 secciones (la sin nombre no), las etiquetas válidas y el agotado",
          len(mn.get("sections") or []) == 3 and mn["sections"][0]["dishes"][0]["tags"] == ["VEGANO", "SIN_GLUTEN"]
          and mn["sections"][0]["dishes"][1]["sold_out"] is True, str(mn)[:200])
    check("ahora sí se pinta la pestaña Comidas", A._roadmap_show_meals(r.get("payload") or {}))
    check("a la persona de la casa se le avisa en la app", r.get("notified") == 1, str(r.get("notified")))
    s = A.db()
    try:
        av = s.query(AppNotification).filter(AppNotification.ref_type == "ROADMAP_MENU", AppNotification.ref_id == "%s:%s" % (iid, pid_prod)).first()
        check("el aviso es del tipo MENU y lleva a su enlace personal", av is not None and av.kind == "MENU" and "/menu/" in (av.url or ""), str(getattr(av, "url", None)))
        tokens = {tk.personnel_id: tk.token for tk in s.query(RoadmapMenuToken).filter(RoadmapMenuToken.entity_id == A.to_uuid(cid)).all()}
    finally:
        s.close()
    # El asistente vuelve a guardar la comida SIN mandar el menú: el menú se conserva.
    r = casa.post(base + "/item", json={"id": iid, "kind": "COMIDA", "day": DIA, "start_time": "14:30", "title": "Comida del equipo",
                                        "meal": {"reservation": "1", "diners": "14"}}).get_json() or {}
    co = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("id") == iid] or [{}])[0]
    check("guardar la comida desde el asistente conserva el menú (y en el recinto sigue sin reserva)",
          len(((co.get("meal") or {}).get("menu") or {}).get("sections") or []) == 3
          and co["meal"]["reservation"] is None, str(co.get("meal"))[:160])
    # QUIÉN tiene que elegir: p1, p2 y la persona de la casa; nadie ha respondido.
    est = casa.get(base + "/comida/%s/estado" % iid).get_json() or {}
    check("el estado dice quién tiene que elegir (3) y que nadie ha respondido",
          est.get("total") == 3 and est.get("answered") == 0 and est.get("word") == "comida" and est.get("place") == "Sala Ruta · Comedor", str(est)[:200])
    # PEDIR QUE RESPONDAN: la vista previa dice a quién llega (p3 no tiene teléfono; p1 y p2 sí).
    prev = casa.post(base + "/comida/%s/pedir/vista-previa" % iid, json={"channel": "SMS"}).get_json() or {}
    check("la vista previa del SMS: el texto dice qué comida, de qué día y de quién, y a quién le llega",
          prev.get("ok") and "elige tu menú para la comida del" in (prev.get("text") or "") and "Los Ruta · Ruta Festival Prueba" in (prev.get("text") or "")
          and prev.get("reachable") == 2 and any(d["why"] == "sin teléfono" for d in prev.get("recipients") or []), str(prev)[:260])
    prevm = casa.post(base + "/comida/%s/pedir/vista-previa" % iid, json={"channel": "EMAIL"}).get_json() or {}
    check("y la del correo trae su HTML con el botón", prevm.get("ok") and "Elegir mi menú" in (prevm.get("html") or ""))
    ENVIADOS["sms"].clear()
    r = casa.post(base + "/comida/%s/pedir" % iid, json={"channel": "SMS"}).get_json() or {}
    check("se pide por SMS a los dos que tienen teléfono, cada uno con SU enlace",
          r.get("ok") and r.get("sent") == 2 and len(ENVIADOS["sms"]) == 2 and len({to for to, _t in ENVIADOS["sms"]}) == 2
          and all("elige tu menú" in txt for _to, txt in ENVIADOS["sms"]), str(ENVIADOS["sms"])[:200])
    s = A.db()
    try:
        tokens = {tk.personnel_id: tk.token for tk in s.query(RoadmapMenuToken).filter(RoadmapMenuToken.entity_id == A.to_uuid(cid)).all()}
    finally:
        s.close()
    check("hay un enlace por persona (p1, p2 y la de la casa)", set(tokens.keys()) >= {"p1", "p2", pid_prod}, str(tokens.keys()))
    # LA PÁGINA PÚBLICA (sin sesión) y la elección.
    anon = A.app.test_client()
    pag = anon.get("/menu/%s" % tokens["p1"])
    html_pag = pag.get_data(as_text=True)
    check("la página del menú se abre sin sesión y enseña la comida y sus platos",
          pag.status_code == 200 and "Ensalada" in html_pag and "AGOTADO" in html_pag and "Comida del equipo" in html_pag and html_pag.count("<!doctype") == 1)
    check("un enlace inventado da 404", anon.get("/menu/nadaquever").status_code == 404)
    r = anon.post("/menu/%s/guardar" % tokens["p1"], json={"item_id": iid, "choices": {"s_ent": ["d_sopa"], "s_pri": ["d_pollo"]}}).get_json() or {}
    check("un plato AGOTADO no se puede elegir (falta el entrante)", r.get("ok") is False and "Entrante" in (r.get("error") or ""), str(r))
    r = anon.post("/menu/%s/guardar" % tokens["p1"], json={"item_id": iid, "choices": {"s_ent": ["d_ens"], "s_pri": ["d_pollo", "d_pesc", "d_tofu"]}}).get_json() or {}
    check("se guarda su elección (y no más platos de los que toca en el principal: 2)", r.get("ok") and r.get("pending") == 0 and r.get("next") is None, str(r))
    est = casa.get(base + "/comida/%s/estado" % iid).get_json() or {}
    p1 = ([p for p in est.get("people") or [] if p["id"] == "p1"] or [{}])[0]
    check("el estado lo refleja: p1 ha respondido con dos principales", est.get("answered") == 1 and p1.get("answered") and len(p1.get("choices", {}).get("s_pri") or []) == 2, str(p1)[:200])
    # La OFICINA elige por la persona de la casa; su aviso se da por resuelto.
    r = casa.post(base + "/comida/%s/respuesta" % iid, json={"personnel_id": pid_prod, "choices": {"s_ent": ["d_ens"], "s_pri": ["d_tofu"]}}).get_json() or {}
    s = A.db()
    try:
        av = s.query(AppNotification).filter(AppNotification.ref_type == "ROADMAP_MENU", AppNotification.ref_id == "%s:%s" % (iid, pid_prod)).first()
        check("la oficina elige por alguien y su aviso desaparece solo", r.get("ok") and av is not None and av.read_at is not None)
    finally:
        s.close()
    # UNA SEGUNDA COMIDA con menú para p1: al guardar la primera le ofrece la siguiente.
    r2 = casa.post(base + "/item", json={"kind": "COMIDA", "day": DIA, "start_time": "21:30", "title": "Cena",
                                         "audience": {"mode": "PEOPLE", "roles": [], "ids": ["p1"]},
                                         "meal": {"menu": {"kind": "BOCADILLOS", "sections": [{"id": "s_boc", "name": "Bocadillos", "mode": "CHOOSE", "choose_n": 1,
                                                                                               "dishes": [{"id": "d_jam", "title": "Jamón"}, {"id": "d_veg", "title": "Vegetal"}]}]}}}).get_json() or {}
    cena = ([x for x in (r2.get("payload") or {}).get("agenda", []) if x.get("title") == "Cena"] or [{}])[0]
    check("una cena con bocadillos para p1 (la palabra sale de la hora)", cena and A._roadmap_meal_word(cena.get("start_time")) == "cena")
    r = anon.post("/menu/%s/guardar" % tokens["p1"], json={"item_id": iid, "choices": {"s_ent": ["d_ens"], "s_pri": ["d_pollo"]}}).get_json() or {}
    check("al volver a guardar la comida le ofrece la CENA (la siguiente pendiente)", r.get("ok") and r.get("next") == cena.get("id") and r.get("next_label") == "Cena", str(r))
    pag2 = anon.get("/menu/%s" % tokens["p2"]).get_data(as_text=True)
    check("a p2 (que no va a la cena) solo le sale la comida", "Cena" not in pag2 and "Comida del equipo" in pag2)
    # LOS PDF, por persona y por platos.
    pdf1 = casa.get(base + "/comida/%s/pdf?por=persona" % iid)
    pdf2 = casa.get(base + "/comida/%s/pdf?por=plato" % iid)
    check("los dos PDF salen", pdf1.status_code == 200 and pdf1.data[:4] == b"%PDF" and pdf2.status_code == 200 and pdf2.data[:4] == b"%PDF", str(pdf1.status_code) + str(pdf2.status_code))
    # EL PORTAL: Ana (p1) es un tercero con la cena pendiente → la tarea «Elegir el menú».
    ext = cliente_ext(d["ana"])
    home = ext.get("/externos/inicio").get_data(as_text=True)
    check("en el portal le sale la tarea «Elegir el menú» de la cena", "Elegir el menú" in home and "/menu/" in home)
    # Editar el menú quitando un plato elegido limpia esa respuesta.
    menu2 = dict(menu); menu2["sections"] = [dict(menu["sections"][0]), dict(menu["sections"][1], dishes=[{"id": "d_pesc", "title": "Pescado"}]), menu["sections"][2]]
    r = casa.post(base + "/comida/%s/menu" % iid, json={"menu": menu2, "notify": False}).get_json() or {}
    co = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("id") == iid] or [{}])[0]
    check("quitar un plato del menú limpia las respuestas que lo tenían (p1 se queda sin principal)",
          "s_pri" not in ((co.get("meal") or {}).get("responses") or {}).get("p1", {}).get("choices", {}) and "s_ent" in co["meal"]["responses"]["p1"]["choices"])

    print("\n12 · Los traslados: sitios, estado, pasajeros con maletas, la furgoneta, a quién afecta")
    # Nada sale a la red: los sitios y la ruta se responden desde aquí.
    import transport_places as TP
    _osm, _ruta = TP.search_osm_places, TP.route_estimate
    TP.search_osm_places = lambda q, kind, **k: [{"kind": kind, "code": "", "label": "Estación de " + q.title(), "sub": "Jerez, España", "lat": 36.7, "lng": -6.1}]
    TP.route_estimate = lambda pts, **k: {"distance_km": 12.3, "duration_min": 25}
    geo_utils.geocode_address = lambda *a, **k: {"lat": 36.68, "lng": -6.13, "label": "Jerez"}
    aer = casa.get("/api/lugares-transporte?kind=AIRPORT&q=xry").get_json() or []
    check("los aeropuertos salen del catálogo, con su código", aer and aer[0]["code"] == "XRY" and "Jerez" in aer[0]["label"], str(aer)[:120])
    est = casa.get("/api/lugares-transporte?kind=STATION&q=jerez").get_json() or []
    check("las estaciones, por OpenStreetMap (filtrando por su etiqueta)", est and est[0]["kind"] == "STATION", str(est)[:120])
    ruta = casa.post("/api/ruta-estimacion", json={"points": [{"lat": 40.49, "lng": -3.57}, {"address": "Estación de Atocha"}]}).get_json()
    check("la ruta se calcula geocodificando lo que no tiene coordenadas", ruta.get("ok") and ruta["distance_km"] == 12.3 and ruta["duration_label"] == "25 min" and len(ruta["points"]) == 2, str(ruta)[:160])
    check("con un solo punto lo dice, sin reventar", casa.post("/api/ruta-estimacion", json={"points": [{"lat": 1, "lng": 1}]}).get_json().get("ok") is False)
    TP.search_osm_places, TP.route_estimate = _osm, _ruta
    # El propio ARTISTA puede ir en un traslado: sale en el buscador y entra en el personal.
    gente = casa.get("/api/hoja-ruta/personas?q=Los%20Ruta").get_json() or []
    art_row = ([x for x in gente if x["kind"] == "ARTIST" and x["label"] == "Los Ruta"] or [None])[0]
    check("el buscador de personas devuelve al ARTISTA", art_row is not None, str(gente)[:160])
    rp = casa.post(base + "/personal", json={"kind": "ARTIST", "ref_id": art_row["id"], "name": "Los Ruta"}).get_json() if art_row else {}
    pid_art = rp.get("person_id") or ""
    check("y entra en el personal como ARTIST", bool(pid_art))
    # Un VUELO con todo lo suyo.
    r = casa.post(base + "/item", json={"kind": "VUELO", "day": DIA, "start_time": "08:00", "end_time": "09:30",
        "transport": {"company": "Aerolínea Ruta", "number": "IB123", "status": "RESERVADO",
                      "origin_place": {"label": "Madrid–Barajas", "code": "mad", "terminal": "T4", "lat": 40.49, "lng": -3.57, "kind": "AIRPORT"},
                      "destination_place": {"label": "Jerez Airport", "code": "XRY", "kind": "AIRPORT", "lat": 36.74, "lng": -6.06},
                      "passengers": [{"personnel_id": "p1", "locator": "ABC123", "confirmed": True, "bags_hand": 1, "bags_checked": 2},
                                     {"personnel_id": pid_art, "bags_hand": 12}]}})
    resp = r.get_json() or {}
    vu = ([x for x in (resp.get("payload") or {}).get("agenda", []) if x.get("kind") == "VUELO" and (x.get("transport") or {}).get("number") == "IB123"] or [{}])[0]
    tv = vu.get("transport") or {}
    check("guardar devuelve el id del punto (para adjuntar nada más crearlo)", resp.get("item_id") == vu.get("id"))
    check("el vuelo se lee «Madrid–Barajas (MAD) · T4 → Jerez Airport (XRY)»", tv.get("origin") == "Madrid–Barajas (MAD) · T4" and tv.get("destination") == "Jerez Airport (XRY)", str(tv.get("origin")) + " | " + str(tv.get("destination")))
    check("RESERVADO cuenta como confirmado (solo PROVISIONAL se ve rayado)", vu.get("confirmed") is True and tv.get("status") == "RESERVADO")
    check("los pasajeros: localizador, confirmado y maletas (tope 9)", (tv.get("passengers") or [{}])[0].get("confirmed") is True and tv["passengers"][0]["bags_checked"] == 2 and tv["passengers"][1]["bags_hand"] == 9)
    check("por defecto lo ven SUS PASAJEROS", (vu.get("audience") or {}).get("mode") == "PASSENGERS")
    yo = lambda ids: {"person_ids": ids, "roles": set(), "artist_keys": set()}
    check("le afecta a quien va (p1 y el artista) y no a quien no (p2)", A._roadmap_item_affects(vu, yo(["p1"])) and A._roadmap_item_affects(vu, yo([pid_art])) and not A._roadmap_item_affects(vu, yo(["p2"])))
    check("con «a todos» le afecta también a p2", A._roadmap_item_affects(dict(vu, audience={"mode": "EVERYONE", "roles": [], "ids": []}), yo(["p2"])))
    check("el ALL de antes con pasajeros sigue siendo «solo los pasajeros»", not A._roadmap_item_affects(dict(vu, audience={"mode": "ALL", "roles": [], "ids": []}), yo(["p2"])))
    info = A._roadmap_ext_person_info(resp.get("payload") or {}, ["00000000-0000-0000-0000-000000000000"], [art_row["id"]] if art_row else [])
    check("un integrante del artista tiene la fila ARTIST como suya en el portal", pid_art in info["person_ids"])
    # Un transfer de un JS viejo (los sitios como texto) y PROVISIONAL.
    r = casa.post(base + "/item", json={"kind": "TRANSFER", "day": DIA, "start_time": "10:00", "transport": {"status": "PROVISIONAL", "origin": "Hotel Ruta", "destination": "Sala Ruta", "passengers": [{"personnel_id": "p2"}], "provider": {"kind": "PROMOTER", "driver_name": "Paco", "plate": "1234 abc"}}}).get_json() or {}
    trf = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("kind") == "TRANSFER" and (x.get("transport") or {}).get("origin") == "Hotel Ruta"] or [{}])[0]
    check("PROVISIONAL → no confirmado; el origen como texto entra como sitio; quién lo presta con matrícula en mayúsculas",
          trf.get("confirmed") is False and (trf.get("transport") or {}).get("origin_place", {}).get("label") == "Hotel Ruta"
          and trf["transport"]["provider"]["kind"] == "PROMOTER" and trf["transport"]["provider"]["plate"] == "1234 ABC", str(trf.get("transport", {}).get("provider")))
    # La FURGONETA alquilada, con paradas y en cuál sube cada uno.
    r = casa.post(base + "/item", json={"kind": "FURGONETA", "day": DIA, "start_time": "12:00", "transport": {
        "origin_place": {"label": "Hotel Ruta", "kind": "HOTEL"}, "destination_place": {"label": "Sala Ruta", "kind": "VENUE"},
        "stops": [{"id": "s1", "label": "Gasolinera", "time": "12:30"}, {"label": ""}], "distance_km": "12,5",
        "van": {"rental": True, "pickup_place": {"label": "Europcar Jerez"}, "pickup_at": "2026-10-25T09:00", "locator": "RENT1", "driver": {"kind": "MANUAL", "name": "Pepe"}, "seats": 9, "cargo": "1", "plate": "5678 def"},
        "passengers": [{"personnel_id": "p1", "boarding_stop": "s1"}]}}).get_json() or {}
    fv = ([x for x in (r.get("payload") or {}).get("agenda", []) if x.get("kind") == "FURGONETA"] or [{}])[0].get("transport") or {}
    check("la furgoneta: alquiler con su recogida, conductor, plazas, carga, matrícula y los km con coma",
          fv.get("van", {}).get("rental") is True and fv["van"]["pickup_place"]["label"] == "Europcar Jerez" and fv["van"]["driver"]["name"] == "Pepe"
          and fv["van"]["seats"] == 9 and fv["van"]["cargo"] is True and fv["van"]["plate"] == "5678 DEF" and fv.get("distance_km") == 12.5, str(fv.get("van"))[:200])
    check("las paradas (la vacía no entra), con su hora, y en cuál sube", len(fv.get("stops") or []) == 1 and fv["stops"][0]["time"] == "12:30" and fv["passengers"][0]["boarding_stop"] == "s1")
    check("las APIs del traslado las tiene también el editor externo",
          {"api_search_transport_companies", "api_transport_places", "api_route_estimate"} <= A.EXT_ROADMAP_EDITOR_ENDPOINTS)

    print("\n11 · Las compañías de transporte: la base, sus tipos y el traslado que las elige")
    A.upload_image = lambda fs, folder, **kw: "https://x/logo.png"
    r = casa.post("/api/transport-companies/create", data={"name": "Aerolínea Ruta", "kinds": ["VUELO", "TRANSFER"]})
    cia = r.get_json() or {}
    check("una compañía nueva desde el asistente, con sus dos tipos", r.status_code == 200 and cia.get("ok") and set(cia.get("kinds") or []) == {"TRANSFER", "VUELO"}, str(cia)[:160])
    r = casa.post("/api/transport-companies/create", json={"name": "Aerolínea Ruta", "kinds": ["VUELO"]})
    check("el mismo nombre no se repite", r.status_code == 400 and "Ya hay" in ((r.get_json() or {}).get("error") or ""), str(r.get_json()))
    r = casa.post("/api/transport-companies/create", json={"name": "Sin tipo", "kinds": []})
    check("sin ningún tipo no se guarda", r.status_code == 400)
    r = casa.post("/api/transport-companies/create", json={"name": "Tren Ruta", "kinds": ["TREN", "inventado"]})
    check("un tipo que no existe se descarta", (r.get_json() or {}).get("kinds") == ["TREN"], str(r.get_json()))
    vuelo = casa.get("/api/search/transport-companies?kind=VUELO&q=ruta").get_json() or []
    tren = casa.get("/api/search/transport-companies?kind=TREN&q=RUTA").get_json() or []
    check("la búsqueda filtra por TIPO (y sin acentos)", [x["name"] for x in vuelo] == ["Aerolínea Ruta"] and [x["name"] for x in tren] == ["Tren Ruta"], str(vuelo) + str(tren))
    r = casa.post("/companias-transporte", data={"name": "Tren Ruta", "kinds": ["TREN"]}, follow_redirects=True)
    check("la pantalla de Bases de datos se pinta (con el aviso del nombre repetido)", r.status_code == 200 and "Ya hay una compañía" in r.get_data(as_text=True))
    check("el permiso: las rutas resuelven a databases.transport_companies (los dos resolutores)",
          A._coarse_endpoint_resource("transport_company_update", "/companias-transporte/x/update") == "databases.transport_companies"
          and A._coarse_endpoint_resource("transport_companies_view", "/companias-transporte") == "databases.transport_companies")
    check("y está en el catálogo, bajo Bases de datos",
          any(x["key"] == "databases.transport_companies" and x["parent_key"] == "databases" for x in A.CURATED_ACCESS_RESOURCES))
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        with A.app.test_request_context():
            ctx = A._roadmap_context(s, "concert", c)
        check("la hoja de ruta trae las compañías con sus tipos y su logo",
              any(x["name"] == "Aerolínea Ruta" and x["logo_url"] == "" and "VUELO" in x["kinds"] for x in ctx.get("transport_companies") or []))
    finally:
        s.close()
    r = casa.post(base + "/item", json={"kind": "VUELO", "day": DIA, "start_time": "08:00", "end_time": "09:30", "confirmed": True,
                                        "transport": {"company_id": cia.get("id"), "company": "Aerolínea Ruta", "number": "IB123",
                                                      "origin": "MAD", "destination": "XRY", "passengers": []}})
    pay = (r.get_json() or {}).get("payload") or {}
    vu = ([x for x in pay.get("agenda", []) if x.get("kind") == "VUELO" and (x.get("transport") or {}).get("company_id") == cia.get("id")] or [{}])[0]
    check("el vuelo guarda la compañía de la base (`company_id`) y su nombre",
          (vu.get("transport") or {}).get("company_id") == cia.get("id") and (vu.get("transport") or {}).get("company") == "Aerolínea Ruta", str(vu.get("transport"))[:160])
    r = casa.post(base + "/item", json={"kind": "VUELO", "day": DIA, "start_time": "08:00", "transport": {"company_id": "no-es-uuid", "company": "X"}})
    vu2 = [x for x in ((r.get_json() or {}).get("payload") or {}).get("agenda", []) if x.get("kind") == "VUELO" and (x.get("transport") or {}).get("company") == "X"]
    check("un `company_id` que no es un UUID se descarta sin reventar", vu2 and vu2[0]["transport"]["company_id"] == "")

    s = A.db()
    try:
        limpia(s); s.commit()
    finally:
        s.close()
    print("\n%d bien · %d mal" % (OK, FALLOS))
    sys.exit(1 if FALLOS else 0)


if __name__ == "__main__":
    main()
