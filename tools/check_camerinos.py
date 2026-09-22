#!/usr/bin/env python3
"""HOJA DE RUTA EN CAMERINOS · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y la BD de PRUEBA:
  · la pantalla pública `/camerinos` (y `/Camerinos`) SIN sesión: vacía cuando no hay nada elegido, y
    su sondeo `/camerinos/panel` con su versión
  · elegir desde producción qué hoja se muestra (general o técnica), que SOLO puede haber una en toda
    la casa (la segunda sustituye a la primera y el estado lo dice) y dejar de mostrarla
  · que la pantalla enseña los horarios de ESA hoja (un punto solo técnico no sale en la general), en su
    orden, con lo cancelado tachado, lo TBC sin hora y el sitio con su espacio («Sala · Camerino 2»)
  · que NO se filtra nada que no sea un horario: ni teléfonos, ni notas, ni localizadores, ni el número
    de habitación (la URL es pública y sin token)
  · que la versión del sondeo cambia cuando cambia la hoja de ruta (y solo entonces)
  · los permisos: sin sesión no se cambia nada; sin poder editar producción, tampoco
  · el botón «Camerinos» del panel de la hoja de ruta, con su estado pintado por el servidor, y que no
    asoma en la hoja compartida
  · los AVISOS a las pantallas: mandar (y los rápidos preguardados), que la pantalla lo recibe con su
    voz y su hora, que confirma que lo ha visto (visto en x de y), que el nuevo sustituye al anterior,
    retirar, caducar, la lista de rápidos limpia y los permisos; y que un identificador raro no se apunta

    /tmp/python/bin/python3 tools/check_camerinos.py

Requiere el entorno de /tmp de CLAUDE.md. Es IDEMPOTENTE (borra lo que crea y deja los camerinos como
estaban... vacíos: al empezar y al acabar no se muestra nada).
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
os.environ.setdefault("FLASK_SECRET_KEY", "check-camerinos")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import app as A                                       # noqa: E402
import models                                         # noqa: E402
from models import (Artist, CamerinosNotice, CamerinosScreen, Concert, ConcertArtistNotification,   # noqa: E402
                    GroupCompany, RepertoireTemplate, RepertoireTemplateItem, User, UserProfile, Venue)

# ⚠️ Las tablas nuevas de los avisos las crea `create_all` al arrancar la app de verdad; en la BD de
# PRUEBA (con el cerrojo puesto, el bootstrap no corre) se crean aquí, que es idempotente y tarda nada.
models.Base.metadata.create_all(models.engine)
models.ensure_camerinos_schema()      # y la columna `minutes`, que llegó después de la tabla

A.app.config["WTF_CSRF_ENABLED"] = False
OK = FALLOS = 0


def check(nombre, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1; print("  ✓", nombre)
    else:
        FALLOS += 1; print("  ✗", nombre, extra)


HOY = A.today_local()
DIA = HOY.isoformat()
NOMBRES = ["Camerinos Prueba", "Camerinos Prueba 2"]
TELEFONO = "+34611222333"          # de una persona de contacto: NO puede salir en la pantalla
LOCALIZADOR = "LOCALIZADORSECRETO"  # de un pasajero: tampoco
NOTA = "NOTASECRETACAMERINO"       # la nota de un punto: tampoco
HABITACION = "HAB777SECRETA"       # el número de habitación: tampoco
EMPRESA = "Grupo Camerinos Prueba"  # la empresa del grupo que promueve: SU logo va en la barra
LOGO_EMPRESA = "https://x/logo-camerinos-prueba.png"
PANTALLA = "pantallaprueba01"          # el identificador de una pantalla de prueba
AVISOS = ["Salida al escenario en 5 minutos (prueba)", "Segundo aviso (prueba)", "Caduca ya (prueba)",
          "Mientras se lee (prueba)", "Tope de minutos (prueba)", "Sin voz (prueba)"]


def limpia(s):
    for c in s.query(Concert).filter(Concert.festival_name.in_(NOMBRES)).all():
        s.query(ConcertArtistNotification).filter(ConcertArtistNotification.concert_id == c.id).delete()
        for t in s.query(RepertoireTemplate).filter(RepertoireTemplate.owner_type == "CONCERT", RepertoireTemplate.owner_id == c.id).all():
            s.delete(t)
        s.delete(c)
    s.commit()
    s.query(GroupCompany).filter(GroupCompany.name == EMPRESA).delete(synchronize_session=False)
    s.query(CamerinosNotice).filter(CamerinosNotice.text.in_(AVISOS)).delete(synchronize_session=False)
    s.query(CamerinosScreen).filter(CamerinosScreen.device_id == PANTALLA).delete(synchronize_session=False)
    s.commit()
    A._camerinos_store({})


def datos():
    s = A.db()
    try:
        limpia(s)
        art = s.query(Artist).filter(Artist.name == "Los Camerinos").first()
        if art is None:
            art = Artist(name="Los Camerinos"); s.add(art); s.flush()
        ven = s.query(Venue).filter(Venue.name == "Sala Camerinos").first()
        if ven is None:
            ven = Venue(name="Sala Camerinos", address="Calle Ancha 2", municipality="Jerez de la Frontera",
                        province="Cádiz", country="España")
            s.add(ven); s.flush()

        def usuario(email, nick, role):
            u = s.query(User).filter(User.email == email).first()
            if u is None:
                u = User(email=email, password_hash="x", role=role); s.add(u); s.flush()
                s.add(UserProfile(user_id=u.id, nick=nick, departments=["Producción"])); s.flush()
            u.role = role
            return u
        prod = usuario("dir.camerinos@prueba.local", "dircam", 10)
        gc = GroupCompany(name=EMPRESA, logo_url=LOGO_EMPRESA); s.add(gc); s.flush()
        nadie = usuario("nadie.camerinos@prueba.local", "nadiecam", 1)

        def punto(i, kind, titulo, hora, **extra):
            d = {"id": i, "kind": kind, "title": titulo, "day": DIA, "start_time": hora, "end_time": "",
                 "tbc": False, "confirmed": True, "cancelled": False, "location": "", "note": "",
                 "order": 0, "attachments": [], "contact": {}, "sheets": {"GENERAL": True, "TECNICA": True}}
            d.update(extra); return d
        c = Concert(artist_id=art.id, festival_name=NOMBRES[0], activity_type="CONCIERTO",
                    sale_type="VENDIDO", capacity=500, date=HOY, status="CONFIRMADO",
                    venue_id=ven.id, production_owner_user_id=prod.id, created_by_user_id=prod.id,
                    group_company_id=gc.id, ticketing_payload={"entry_mode": "SALE"})
        s.add(c); s.flush()
        c.roadmap_payload = {
            "version": 2,
            "personnel": [
                {"id": "p1", "kind": "MANUAL", "ref_id": "", "name": "Toni Técnico", "role": "Técnico de sonido",
                 "phone": TELEFONO, "email": "toni@prueba.local"},
            ],
            "hotels": [{"id": "h1", "name": "Hotel Camerinos", "for_all": True, "assignee_ids": [], "days": [DIA],
                        "rooms": [{"id": "r1", "occupant_ids": ["p1"], "room_number": HABITACION, "bed": "DUI"}]}],
            "agenda": [
                punto("a1", "ACTUACION", "Concierto", "21:00", end_time="22:30"),
                punto("a2", "PRUEBA_SONIDO", "Prueba de sonido técnica", "18:00", sheets={"GENERAL": False, "TECNICA": True},
                      audience={"mode": "ROLES", "roles": ["Técnico de sonido"], "ids": []}),
                punto("a3", "COMIDA", "Comida del equipo", "14:00", note=NOTA,
                      place={"mode": "VENUE", "space": "Camerino 2", "venue_id": "", "venue_name": ""},
                      contacts=[{"name": "Paco Catering", "phone": TELEFONO, "email": ""}],
                      contact={"name": "Paco Catering", "phone": TELEFONO, "email": ""}),
                punto("a4", "TRANSFER", "Transfer al recinto", "16:00",
                      transport={"mode": "TRANSFER", "company": "Ruta Bus Camerinos", "origin": "Hotel Camerinos",
                                 "destination": "Sala Camerinos", "passengers": [{"personnel_id": "p1", "locator": LOCALIZADOR}]}),
                punto("a5", "OTROS", "Firma de discos cancelada", "19:00", cancelled=True),
                punto("a6", "OTROS", "Rueda de prensa TBC", "", tbc=True),
                punto("a7", "APERTURA_PUERTAS", "Apertura de puertas", "20:00"),
                # Un punto que CANTA con su propio repertorio: en la pantalla se abre al tocarlo.
                punto("a9", "OTROS", "Acústico en la radio", "12:30", sings=True, songs=[{"song_id": "", "title": "Canción Prueba Radio"}]),
            ],
        }
        # EL SET LIST de la ficha (la actuación lo abre en la pantalla al tocarla).
        t = RepertoireTemplate(owner_type="CONCERT", owner_id=c.id, name=""); s.add(t); s.flush()
        for i, (kind, titulo, dur) in enumerate([("SONG", "Canción Set Uno", 200), ("BREAK", "Parón", 0), ("SONG", "Canción Set Dos", 185), ("THANKS", "Gracias a todos", 0)]):
            s.add(RepertoireTemplateItem(template_id=t.id, kind=kind, title=titulo, duration_seconds=(dur or None), sort_order=i))
        c2 = Concert(artist_id=art.id, festival_name=NOMBRES[1], activity_type="CONCIERTO",
                     sale_type="VENDIDO", capacity=300, date=HOY + timedelta(days=3), status="CONFIRMADO",
                     venue_id=ven.id, production_owner_user_id=prod.id, created_by_user_id=prod.id)
        s.add(c2); s.flush()
        c2.roadmap_payload = {"version": 2, "personnel": [], "hotels": [],
                              "agenda": [punto("b1", "ACTUACION", "Concierto 2", "22:00", day=(HOY + timedelta(days=3)).isoformat())]}
        s.commit()
        return {"cid": str(c.id), "cid2": str(c2.id), "prod": str(prod.id), "nadie": str(nadie.id)}
    finally:
        s.close()


def logo_barra(html):
    """El `src` del logo de la BARRA (no el del velo de arranque, que es el de la casa sobre blanco)."""
    m = re.search(r'<img id="camLogo" class="cam-bar__logo" src="([^"]*)"', html)
    return m.group(1) if m else ""


def cliente(uid=None):
    c = A.app.test_client()
    if uid:
        with c.session_transaction() as ses:
            ses["user_id"] = uid
    return c


def main():
    d = datos()
    cid, cid2 = d["cid"], d["cid2"]
    anon = cliente()
    prod = cliente(d["prod"])
    nadie = cliente(d["nadie"])
    url_set = f"/hoja-ruta/concert/{cid}/camerinos"
    url_set2 = f"/hoja-ruta/concert/{cid2}/camerinos"

    print("1 · La pantalla pública, vacía")
    r = anon.get("/camerinos")
    html = r.get_data(as_text=True)
    check("/camerinos responde sin sesión", r.status_code == 200, r.status_code)
    check("dice que no hay ninguna hoja de ruta", "No hay ninguna hoja de ruta en camerinos" in html)
    check("lleva la barra con «Horarios» y, sin actividad, el logo de la casa calado", "Horarios" in html and "logo_33_producciones.png" in logo_barra(html) and "cam-bar__logo" in html)
    check("la hora va sin segundos", "camSec" not in html and 'id="camClock"' in html)
    check("no se cachea", "no-store" in (r.headers.get("Cache-Control") or ""))
    r2 = anon.get("/Camerinos")
    check("/Camerinos (con mayúscula) también vale", r2.status_code == 200, r2.status_code)
    rp = anon.get("/camerinos/panel")
    j = rp.get_json() or {}
    check("el sondeo responde con su versión", rp.status_code == 200 and j.get("ok") and j.get("v"), rp.status_code)
    check("sin nada elegido, el sondeo dice inactivo", j.get("active") is False)
    v_vacio = j.get("v")

    print("2 · Elegir qué se muestra (producción)")
    r = prod.get(url_set)
    st = r.get_json() or {}
    check("el estado se lee", r.status_code == 200 and st.get("ok"), r.status_code)
    check("ofrece las dos hojas de la actividad", [k["key"] for k in st.get("kinds", [])] == ["GENERAL", "TECNICA"], st.get("kinds"))
    check("todavía no hay nada activo", st.get("active") is None)
    check("la tarjeta de esta actividad dice qué es y dónde",
          (st.get("this") or {}).get("title") == NOMBRES[0] and "Sala Camerinos" in ((st.get("this") or {}).get("venue") or ""),
          st.get("this"))
    r = prod.post(url_set, json={"action": "show", "kind": "GENERAL"})
    j = r.get_json() or {}
    check("mostrar la general", r.status_code == 200 and j.get("ok"), (r.status_code, j.get("error")))
    check("el estado dice que ESTA es la que se ve", (j.get("active") or {}).get("is_this") is True and (j.get("active") or {}).get("kind") == "GENERAL")
    check("el mensaje lo cuenta", "muestran ahora la hoja de ruta general" in (j.get("message") or ""), j.get("message"))
    sel = A._camerinos_setting()
    check("queda guardado en el ajuste global", sel.get("entity_id") == cid and sel.get("kind") == "GENERAL", sel)

    print("3 · La pantalla enseña los horarios de ESA hoja")
    r = anon.get("/camerinos")
    html = r.get_data(as_text=True)
    check("la pantalla responde", r.status_code == 200, r.status_code)
    check("la cabecera dice de quién es y dónde", NOMBRES[0] in html and "Sala Camerinos" in html)
    check("la barra lleva el logo de la EMPRESA DEL GRUPO que promueve (por el limpiador de fondos)",
          "logo-camerinos-prueba.png" in logo_barra(html) and "logo-limpio.png" in logo_barra(html), logo_barra(html))
    check("sale el concierto con su hora", "Concierto" in html and "21:00–22:30" in html)
    check("sale la comida en su espacio del recinto", "Sala Camerinos · Camerino 2" in html)
    check("sale la apertura de puertas", "Apertura de puertas" in html)
    check("el punto SOLO TÉCNICO no sale en la general", "Prueba de sonido técnica" not in html)
    check("lo cancelado va tachado", 'cancelled"' in html and "Firma de discos cancelada" in html and ">Cancelado<" in html)
    check("lo TBC va sin hora", "Rueda de prensa TBC" in html and '<span class="tbc">TBC</span>' in html)
    check("el traslado lleva su línea (compañía y trayecto)", "Ruta Bus Camerinos" in html and "Hotel Camerinos → Sala Camerinos" in html)
    orden = [html.find(x) for x in ("Comida del equipo", "Transfer al recinto", "Firma de discos cancelada", "Apertura de puertas", ">Concierto<", "Rueda de prensa TBC")]
    check("en orden de hora (y lo TBC al final)", all(a < b for a, b in zip(orden, orden[1:])) and orden[0] > 0, orden)
    check("cada punto lleva su momento para la línea de la hora", f'data-start="{DIA}T21:00"' in html and f'data-end="{DIA}T22:30"' in html)
    check("la actuación con set list se puede tocar y lleva su plantilla", 'data-setlist="act"' in html and '<template data-cam-setlist="act">' in html and "Set list · toca para verlo" in html)
    check("la plantilla trae las canciones, el parón y los agradecimientos", "Canción Set Uno" in html and "Canción Set Dos" in html and "rm-setlist__brk" in html and "Gracias a todos" in html and "2 temas" in html)
    check("un punto que canta abre su propio repertorio", 'data-setlist="item:a9"' in html and '<template data-cam-setlist="item:a9">' in html and "Canción Prueba Radio" in html)
    check("la pantalla lleva el pop-up del set list", 'id="camPop"' in html and "abrirSetlist" in html)
    check("NO sale ningún teléfono", TELEFONO not in html)
    check("NO sale la nota del punto", NOTA not in html)
    check("NO sale el localizador del pasajero", LOCALIZADOR not in html)
    check("NO sale el número de habitación", HABITACION not in html)
    check("NO sale el correo de nadie", "toni@prueba.local" not in html)
    m = re.search(r'id="camPanel" data-v="([0-9a-f]+)"', html)
    v_general = m.group(1) if m else ""
    check("la página lleva su versión", bool(v_general), html[:200])
    rp = anon.get("/camerinos/panel?v=" + v_general)
    j = rp.get_json() or {}
    check("con la misma versión el sondeo no manda el trozo", j.get("v") == v_general and j.get("changed") is False and j.get("html") == "", j.get("v"))
    check("la versión cambió respecto a la pantalla vacía", v_general != v_vacio)
    rp = anon.get("/camerinos/panel?v=otra")
    j = rp.get_json() or {}
    check("con otra versión el sondeo manda el trozo pintado", j.get("changed") is True and "Concierto" in (j.get("html") or "") and NOMBRES[0] in (j.get("sub") or ""))
    check("y dice qué logo toca", "logo-camerinos-prueba.png" in (j.get("logo") or "") and j.get("logo_name") == EMPRESA, j.get("logo"))

    print("4 · La técnica, y que la versión sigue a la hoja de ruta")
    r = prod.post(url_set, json={"action": "show", "kind": "TECNICA"})
    check("cambiar a la técnica", r.status_code == 200 and (r.get_json() or {}).get("ok"), r.status_code)
    html = anon.get("/camerinos").get_data(as_text=True)
    check("ahora sí sale el punto solo técnico, con su función", "Prueba de sonido técnica" in html and "Técnico de sonido" in html)
    check("y la barra dice que es la hoja técnica", "Hoja técnica" in html)
    m = re.search(r'id="camPanel" data-v="([0-9a-f]+)"', html)
    v_tecnica = m.group(1) if m else ""
    check("la versión cambia al cambiar de hoja", v_tecnica and v_tecnica != v_general)
    # Se toca la hoja de ruta (un punto nuevo) y la versión tiene que cambiar.
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        pay = dict(c.roadmap_payload)
        pay["agenda"] = list(pay["agenda"]) + [{"id": "a8", "kind": "CITACION", "title": "Citación NUEVA", "day": DIA, "start_time": "12:00",
                                               "end_time": "", "tbc": False, "confirmed": True, "cancelled": False, "location": "",
                                               "note": "", "order": 0, "attachments": [], "contact": {}, "sheets": {"GENERAL": True, "TECNICA": True}}]
        c.roadmap_payload = pay
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(c, "roadmap_payload")
        s.commit()
    finally:
        s.close()
    j = anon.get("/camerinos/panel?v=" + v_tecnica).get_json() or {}
    check("al cambiar la hoja de ruta, el sondeo trae la versión nueva con el punto nuevo",
          j.get("changed") is True and j.get("v") != v_tecnica and "Citación NUEVA" in (j.get("html") or ""))

    print("5 · Solo puede haber una: la segunda sustituye a la primera")
    st2 = prod.get(url_set2).get_json() or {}
    check("desde la otra actividad, el estado dice que se ve OTRA (y cuál)",
          (st2.get("active") or {}).get("is_this") is False and (st2.get("active") or {}).get("title") == NOMBRES[0], st2.get("active"))
    r = prod.post(url_set2, json={"action": "show", "kind": "GENERAL"})
    j = r.get_json() or {}
    check("mostrar la segunda", r.status_code == 200 and j.get("ok") and (j.get("active") or {}).get("is_this") is True)
    st1 = prod.get(url_set).get_json() or {}
    check("la primera ya no es la que se ve", (st1.get("active") or {}).get("is_this") is False and (st1.get("active") or {}).get("title") == NOMBRES[1])
    html = anon.get("/camerinos").get_data(as_text=True)
    check("la pantalla enseña la segunda", NOMBRES[1] in html and "Concierto 2" in html and "Comida del equipo" not in html)
    check("sin empresa del grupo, la barra vuelve al logo de la casa", "logo_33_producciones.png" in logo_barra(html))
    r = prod.post(url_set, json={"action": "stop"})
    check("quitar desde la que NO se ve no la quita (409)", r.status_code == 409, r.status_code)
    r = prod.post(url_set2, json={"action": "stop"})
    j = r.get_json() or {}
    check("dejar de mostrar desde la que se ve", r.status_code == 200 and j.get("ok") and j.get("active") is None, (r.status_code, j))
    check("y la pantalla vuelve a estar vacía", "No hay ninguna hoja de ruta en camerinos" in anon.get("/camerinos").get_data(as_text=True))
    r = prod.post(url_set, json={"action": "show", "kind": "INVENTADA"})
    check("una hoja que no existe se rechaza", r.status_code == 400, r.status_code)

    print("6 · Permisos")
    r = anon.post(url_set, json={"action": "show", "kind": "GENERAL"})
    check("sin sesión no se cambia nada", r.status_code in (302, 401, 403) and not A._camerinos_setting(), r.status_code)
    r = nadie.post(url_set, json={"action": "show", "kind": "GENERAL"})
    check("sin poder editar producción, tampoco (403)", r.status_code == 403 and not A._camerinos_setting(), r.status_code)
    r = nadie.get(url_set)
    check("ni se lee el estado", r.status_code == 403, r.status_code)

    print("7 · El botón del panel de la hoja de ruta")
    r = prod.get(f"/conciertos/{cid}?tab=produccion")
    html = r.get_data(as_text=True)
    check("la pestaña Producción abre", r.status_code == 200, r.status_code)
    check("lleva el botón «Camerinos» apagado", 'data-cam-open' in html and 'class="rm-cam"' in html and "camerinos.js" in html)
    prod.post(url_set, json={"action": "show", "kind": "GENERAL"})
    html = prod.get(f"/conciertos/{cid}?tab=produccion").get_data(as_text=True)
    check("con esta actividad en camerinos, el botón sale encendido", 'class="rm-cam is-on"' in html and "Se está mostrando en camerinos" in html)
    html = nadie.get(f"/conciertos/{cid}?tab=produccion").get_data(as_text=True)
    check("quien no puede editar producción no ve el botón", 'data-cam-open' not in html)
    # La hoja compartida (sin sesión) no lleva el botón ni el script.
    s = A.db()
    try:
        c = s.get(Concert, A.to_uuid(cid))
        token = A._ensure_roadmap_token(s, c, "GENERAL"); s.commit()
    finally:
        s.close()
    html = anon.get(f"/hoja-ruta/ver/{token}").get_data(as_text=True)
    check("la hoja compartida no lleva el botón", 'data-cam-open' not in html and "camerinos.js" not in html)

    print("9 · Avisos a las pantallas")
    rapidos_antes = A._get_app_setting(A.CAMERINOS_PRESETS_KEY, None)
    url_av = url_set + "/avisos"
    r = prod.get(url_av); av = r.get_json() or {}
    check("el estado de los avisos se lee", r.status_code == 200 and av.get("ok") and isinstance(av.get("presets"), list), r.status_code)
    check("nace con avisos rápidos de la casa", len(av.get("presets") or []) >= 3 and av.get("max_chars") == 240)
    r = anon.get("/camerinos/avisos?d=" + PANTALLA); j = r.get_json() or {}
    check("la pantalla sondea sin sesión", r.status_code == 200 and j.get("ok") and "no-store" in (r.headers.get("Cache-Control") or ""), r.status_code)
    av = prod.get(url_av).get_json() or {}
    check("la pantalla cuenta como conectada", any(p["device_id"] == PANTALLA and p["online"] for p in av["screens"]["list"]), av.get("screens"))
    r = prod.post(url_set + "/aviso", json={"text": "   ", "speak": True})
    check("un aviso vacío se rechaza", r.status_code == 400, r.status_code)
    r = prod.post(url_set + "/aviso", json={"text": "x" * 300})
    check("uno demasiado largo también", r.status_code == 400, r.status_code)
    r = prod.post(url_set + "/aviso", json={"text": AVISOS[0], "speak": True, "minutes": 10}); j = r.get_json() or {}
    check("mandar un aviso", r.status_code == 200 and j.get("ok") and (j.get("active") or {}).get("text") == AVISOS[0], (r.status_code, j.get("error")))
    check("el mensaje dice a cuántas pantallas conectadas", "pantalla" in (j.get("message") or ""), j.get("message"))
    check("con su hora y quién lo manda", (j.get("active") or {}).get("sent_at_label") and (j.get("active") or {}).get("sent_by") == "dircam", j.get("active"))
    check("con sus minutos en pantalla (10)", (j.get("active") or {}).get("minutes") == 10, (j.get("active") or {}).get("minutes"))
    voz_url = (j.get("active") or {}).get("audio_url") or ""
    check("el aviso que se lee lleva la URL de su voz", "/camerinos/aviso/" in voz_url and voz_url.endswith("/voz.mp3"), voz_url)
    rv = anon.get(voz_url)
    if rv.status_code == 200:
        check("la voz se sirve como MP3 (generada en el servidor)", (rv.headers.get("Content-Type") or "").startswith("audio/mpeg") and len(rv.data) > 1000, rv.headers.get("Content-Type"))
    else:
        check("sin red para generar la voz, el servidor responde 404 (la pantalla usa la del navegador)", rv.status_code == 404, rv.status_code)
        print("    (aviso: la voz no se pudo generar aquí; en producción hay red)")
    check("la voz de un aviso que no existe es 404", anon.get("/camerinos/aviso/00000000-0000-0000-0000-000000000000/voz.mp3").status_code == 404)
    aviso_id = (j.get("active") or {}).get("id") or ""
    j = anon.get("/camerinos/avisos?d=" + PANTALLA).get_json() or {}
    check("la pantalla lo recibe (texto y voz)", (j.get("notice") or {}).get("id") == aviso_id and j["notice"]["speak"] is True and j["notice"]["text"] == AVISOS[0])
    av = prod.get(url_av).get_json() or {}
    check("todavía no lo ha visto nadie", (av.get("active") or {}).get("seen") == 0, av.get("active"))
    anon.get("/camerinos/avisos?d=" + PANTALLA + "&n=" + aviso_id)
    av = prod.get(url_av).get_json() or {}
    check("al enseñarlo, la pantalla lo confirma (visto en 1)", (av.get("active") or {}).get("seen") == 1, av.get("active"))
    r = prod.post(url_set + "/aviso", json={"text": AVISOS[1], "speak": False, "minutes": 5, "save_preset": True}); j = r.get_json() or {}
    check("el segundo sustituye al primero", (j.get("active") or {}).get("text") == AVISOS[1] and j["active"]["speak"] is False)
    check("y se guarda como aviso rápido", AVISOS[1] in (j.get("presets") or []))
    check("el historial lleva los dos, el nuevo delante", [h["text"] for h in (j.get("history") or [])][:2] == [AVISOS[1], AVISOS[0]])
    j2 = anon.get("/camerinos/avisos?d=" + PANTALLA + "&n=" + aviso_id).get_json() or {}
    check("la pantalla recibe el nuevo aunque enseñe el viejo", (j2.get("notice") or {}).get("text") == AVISOS[1])
    r = prod.post(url_set + "/aviso", json={"text": AVISOS[3], "speak": True}); j = r.get_json() or {}
    a = j.get("active") or {}
    check("sin minutos, el aviso es «solo mientras se lee» (0) y el servidor lo da por vivo un rato corto",
          a.get("minutes") == 0 and a.get("expires_at") and (A.datetime.fromisoformat(a["expires_at"]) - A._now_madrid()).total_seconds() < 120, a)
    r = prod.post(url_set + "/aviso", json={"text": AVISOS[4], "speak": True, "minutes": 999}); j = r.get_json() or {}
    check("los minutos tienen tope (240)", (j.get("active") or {}).get("minutes") == 240, (j.get("active") or {}).get("minutes"))
    r = prod.post(url_set + "/aviso", json={"text": AVISOS[5], "speak": False, "minutes": 3}); j = r.get_json() or {}
    check("un aviso sin voz no lleva URL de voz", (j.get("active") or {}).get("audio_url") == "" and (j.get("active") or {}).get("minutes") == 3, j.get("active"))
    r = prod.post(url_set + "/avisos-rapidos", json={"presets": ["Uno", "Dos", "Uno", "   "]}); j = r.get_json() or {}
    check("la lista de avisos rápidos se guarda limpia", j.get("ok") and j.get("presets") == ["Uno", "Dos"], j.get("presets"))
    r = prod.post(url_set + "/aviso/retirar", json={}); j = r.get_json() or {}
    check("retirar el aviso", r.status_code == 200 and j.get("ok") and j.get("active") is None, (r.status_code, j.get("active")))
    check("la pantalla deja de recibirlo", (anon.get("/camerinos/avisos?d=" + PANTALLA).get_json() or {}).get("notice") is None)
    prod.post(url_set + "/aviso", json={"text": AVISOS[2], "minutes": 5})
    s = A.db()
    try:
        n = s.query(CamerinosNotice).filter(CamerinosNotice.text == AVISOS[2]).first()
        n.expires_at = A._now_madrid() - timedelta(minutes=1); s.commit()
    finally:
        s.close()
    check("un aviso caducado no se manda", (anon.get("/camerinos/avisos?d=" + PANTALLA).get_json() or {}).get("notice") is None)
    r = nadie.post(url_set + "/aviso", json={"text": "hola"})
    check("sin poder editar producción no se manda (403)", r.status_code == 403, r.status_code)
    r = anon.post(url_set + "/aviso", json={"text": "hola"})
    check("sin sesión tampoco", r.status_code in (302, 401, 403), r.status_code)
    r = anon.get("/camerinos/avisos?d=%3Cscript%3E")
    av = prod.get(url_av).get_json() or {}
    check("un identificador de pantalla raro no se apunta", r.status_code == 200 and not any("<" in p["device_id"] for p in av["screens"]["list"]))
    html = anon.get("/camerinos").get_data(as_text=True)
    check("la pantalla lleva la nota del aviso, la campana y la voz", 'id="camNote"' in html and "/camerinos/avisos" in html and "speechSynthesis" in html and "createOscillator" in html)
    check("y la tira para volver a pantalla completa", 'id="camFs"' in html)
    st = prod.get(url_set).get_json() or {}
    check("el estado del pop-up trae los avisos", isinstance(st.get("notices"), dict) and "presets" in st["notices"])
    # La lista de avisos rápidos vuelve a como estaba (la prueba no deja rastro).
    if rapidos_antes is None:
        s = A.db()
        try:
            s.query(models.AppSetting).filter(models.AppSetting.key == A.CAMERINOS_PRESETS_KEY).delete(synchronize_session=False); s.commit()
        finally:
            s.close()
    else:
        A._set_app_setting(A.CAMERINOS_PRESETS_KEY, rapidos_antes)
    check("la lista de avisos rápidos queda como estaba", A._get_app_setting(A.CAMERINOS_PRESETS_KEY, None) == rapidos_antes)

    print("8 · Limpieza")
    s = A.db()
    try:
        limpia(s)
    finally:
        s.close()
    check("los camerinos quedan vacíos y lo sembrado borrado", not A._camerinos_setting())
    # Si la actividad que se mostraba se borra, el estado se limpia solo al consultarlo.
    A._camerinos_store({"entity_type": "concert", "entity_id": cid, "kind": "GENERAL"})
    html = anon.get("/camerinos").get_data(as_text=True)
    check("con una actividad borrada la pantalla no revienta y se ve vacía", "No hay ninguna hoja de ruta en camerinos" in html)
    A._camerinos_store({})

    print(f"\n{OK} bien · {FALLOS} mal")
    return 1 if FALLOS else 0


if __name__ == "__main__":
    sys.exit(main())
