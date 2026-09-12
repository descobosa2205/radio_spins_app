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
from models import (Artist, Concert, ConcertArtistNotification, Promoter,   # noqa: E402
                    RoadmapScheduledMessage, User, UserProfile, Venue)

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

    s = A.db()
    try:
        limpia(s); s.commit()
    finally:
        s.close()
    print("\n%d bien · %d mal" % (OK, FALLOS))
    sys.exit(1 if FALLOS else 0)


if __name__ == "__main__":
    main()
