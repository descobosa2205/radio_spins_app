#!/usr/bin/env python3
"""ONE SHEET · prueba de regresión (sep 2026), contra la app REAL y la BD DE PRUEBA.

Comprueba de punta a punta el One Sheet rehecho:
  · la pestaña «One Sheet» de la ficha crea la fila (slug = el nombre hecho slug, etiquetas deducidas)
    y el one-sheet ANTIGUO se importa (bio, premios, vídeos, fondo);
  · la PÁGINA PÚBLICA (/onesheet/<slug>) pinta lo dinámico bien: solo las fechas CONFIRMADAS y ya
    ANUNCIADAS de conciertos/eventos promocionales (ni habladas, ni sin anunciar, ni pasadas, ni una TV),
    el Sold Out marcado, las certificaciones con su disco, los países, la prensa enviada, las fotos
    de un álbum y las sueltas, las cifras de Chartmetric; y un módulo vacío NO se pinta;
  · los enlaces ANTIGUOS por token siguen abriéndose; un slug desconocido da 404;
  · el EDITOR: la página, los datos para elegir, guardar un diseño (normalizado, sin solapes, con el
    tema claro → letras oscuras), pintar un módulo, los ajustes (slug, etiquetas, Roster);
  · las PLANTILLAS: se guardan sin el contenido del artista y se cargan en otro conservando lo suyo;
  · el ROSTER público y su gestión (orden, visibilidad, etiquetas);
  · los permisos: los endpoints del editor resuelven a `artists.onesheet` y los públicos a None.

    /tmp/python/bin/python3 tools/check_onesheet.py
Requiere el entorno de /tmp de CLAUDE.md. Es IDEMPOTENTE: borra lo que crea al empezar y al acabar.
"""
import json
import os
import pathlib
import sys
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-onesheet")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import app as A                                        # noqa: E402
import onesheet_render                                 # noqa: E402
import models                                          # noqa: E402
from models import (AppEvent, Artist, ChartmetricArtist, ChartmetricMetricPoint, Concert, OneSheet,   # noqa: E402
                    OneSheetTemplate, Photo, PhotoAlbum, PhotoAlbumItem, PressRelease, Song, SongArtist,
                    SongCertification, TourOneSheet, User, UserProfile, Venue)

OK = FALLOS = 0
NOMBRE = "Prueba One Sheet"
NOMBRE2 = "Prueba One Sheet Dos"
EVENTO = "Evento One Sheet Prueba"
TOKEN_VIEJO = "legacytoken-onesheet-prueba"


def check(texto, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1
        print("  ✓ " + texto)
    else:
        FALLOS += 1
        print("  ✗ " + texto + ((" — " + str(extra)[:300]) if extra != "" else ""))


# Sin Storage ni red: la subida devuelve una URL fija y la paleta de la cabecera no baja nada.
A.upload_image = lambda fs, folder, **kw: "https://storage.prueba/%s/imagen.png" % folder
A._download_remote_content = lambda url, timeout=30: (b"", None)
A.app.config["WTF_CSRF_ENABLED"] = False


def limpia():
    s = A.db()
    try:
        arts = s.query(Artist).filter(Artist.name.in_([NOMBRE, NOMBRE2])).all()
        ids = [a.id for a in arts]
        ev = s.query(AppEvent).filter(AppEvent.name == EVENTO).first()
        if ev is not None:
            s.query(OneSheet).filter(OneSheet.subject_kind == "EVENT", OneSheet.subject_id == ev.id).delete(synchronize_session=False)
            espejo = s.query(Artist).filter(Artist.event_id == ev.id).all()
            for e in espejo:
                s.query(Concert).filter(Concert.artist_id == e.id).delete(synchronize_session=False)
            s.flush()
            for e in espejo:
                s.delete(e)
            s.delete(ev)
        if ids:
            s.query(OneSheet).filter(OneSheet.subject_kind == "ARTIST", OneSheet.subject_id.in_(ids)).delete(synchronize_session=False)
            s.query(Concert).filter(Concert.artist_id.in_(ids)).delete(synchronize_session=False)
            s.query(ChartmetricMetricPoint).filter(ChartmetricMetricPoint.artist_id.in_(ids)).delete(synchronize_session=False)
            s.query(ChartmetricArtist).filter(ChartmetricArtist.artist_id.in_(ids)).delete(synchronize_session=False)
            for p in s.query(Photo).filter(Photo.artist_id.in_(ids)).all():
                s.query(PhotoAlbumItem).filter(PhotoAlbumItem.photo_id == p.id).delete(synchronize_session=False)
                s.delete(p)
            s.query(PhotoAlbum).filter(PhotoAlbum.artist_id.in_(ids)).delete(synchronize_session=False)
            for pr in s.query(PressRelease).filter(PressRelease.subject_kind == "ARTIST", PressRelease.subject_id.in_(ids)).all():
                s.delete(pr)
            for sid, in s.query(SongArtist.song_id).filter(SongArtist.artist_id.in_(ids)).all():
                song = s.get(Song, sid)
                if song is not None:
                    s.delete(song)
            s.flush()
            for a in arts:
                s.delete(a)
        gira = s.query(TourOneSheet).filter(TourOneSheet.slug == "gira-one-sheet").first()
        if gira is not None:
            s.query(OneSheet).filter(OneSheet.subject_kind == "TOUR", OneSheet.subject_id == gira.id).delete(synchronize_session=False)
            s.delete(gira)
        s.query(OneSheetTemplate).filter(OneSheetTemplate.name == "Plantilla prueba onesheet").delete(synchronize_session=False)
        s.query(Venue).filter(Venue.name == "Sala One Sheet").delete(synchronize_session=False)
        s.commit()
    except Exception as e:
        s.rollback()
        print("  (limpieza)", e)
    finally:
        s.close()


def datos():
    s = A.db()
    try:
        u = s.query(User).filter(User.email == "dir.onesheet@prueba.local").first()
        if u is None:
            u = User(email="dir.onesheet@prueba.local", password_hash="x", role=10)
            s.add(u)
            s.flush()
            s.add(UserProfile(user_id=u.id, nick="dironesheet", departments=["Dirección"]))
        u.role = 10
        art = Artist(name=NOMBRE, photo_url="https://fotos.prueba/artista.jpg",
                     social_links={"instagram": "https://instagram.com/prueba.onesheet"},
                     onesheet_public_token=TOKEN_VIEJO)
        s.add(art)
        # El segundo artista trae el one-sheet ANTIGUO escrito: tiene que importarse.
        art2 = Artist(name=NOMBRE2, photo_url="", onesheet_payload={
            "bio": "Hola caracola.\n\nSegundo párrafo.", "background_color": "#123456",
            "awards": [{"id": "a1", "name": "Premio Prueba", "year": "2020", "icon_url": ""}],
            "videos": [{"id": "v1", "url": "https://youtu.be/dQw4w9WgXcQ", "title": "Clip"}],
            "contacts": [{"id": "c1", "role": "Management", "name": "Fulano", "email": "f@x.es", "phone": ""}],
            "hero_image_url": "https://fotos.prueba/hero-viejo.jpg"})
        s.add(art2)
        ven = Venue(name="Sala One Sheet", municipality="Jerez de la Frontera", province="Cádiz", country="España")
        s.add(ven)
        s.flush()
        hoy = date.today()

        def concierto(**kw):
            base = dict(artist_id=art.id, activity_type="CONCIERTO", sale_type="VENDIDO", capacity=500,
                        venue_id=ven.id, status="CONFIRMADO", announcement_date=hoy - timedelta(days=1),
                        created_by_user_id=u.id)
            base.update(kw)
            c = Concert(**base)
            s.add(c)
            return c
        c1 = concierto(festival_name="Fecha Visible Uno", date=hoy + timedelta(days=20), show_time="21:30")
        c2 = concierto(festival_name="Fecha Sin Anunciar", date=hoy + timedelta(days=25), announcement_date=None)
        c3 = concierto(festival_name="Fecha Hablada", date=hoy + timedelta(days=26), status="HABLADO")
        c4 = concierto(festival_name="Fecha Agotada", date=hoy + timedelta(days=40), sold_out=True)
        c5 = concierto(festival_name="Programa Tele", date=hoy + timedelta(days=12), activity_type="TV")
        c6 = concierto(festival_name="Fecha Pasada", date=hoy - timedelta(days=5))
        c7 = concierto(festival_name="Fecha Anuncio Futuro", date=hoy + timedelta(days=50), announcement_date=hoy + timedelta(days=3))
        # Una fecha de GIRA COMPRADA: la gira (agrupada por su nombre) también tiene One Sheet.
        concierto(festival_name="Gira One Sheet", sale_type="GIRAS_COMPRADAS", date=hoy + timedelta(days=60))
        song = Song(title="Canción Cert", release_date=hoy - timedelta(days=100), isrc="ESONE2500001",
                    spotify_url="https://open.spotify.com/track/1abcdefghijklmnopqrstu", youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    cover_url="https://fotos.prueba/portada.jpg")
        s.add(song)
        s.flush()
        s.add(SongArtist(song_id=song.id, artist_id=art.id))
        s.add(SongCertification(song_id=song.id, certification_type="PLATINUM", country_code="ES", country_name="España"))
        s.add(SongCertification(song_id=song.id, certification_type="PLATINUM", country_code="ES", country_name="España"))
        link = ChartmetricArtist(artist_id=art.id, chartmetric_id="12345", status="LINKED",
                                 social_urls={"spotify": "https://open.spotify.com/artist/xyz", "youtube": "https://youtube.com/@prueba"},
                                 top_countries=[{"name": "España", "code2": "ES", "listeners": 500000},
                                                {"name": "México", "code2": "MX", "listeners": 200000},
                                                {"name": "Argentina", "code2": "AR", "listeners": 90000}])
        s.add(link)
        for d, v in ((hoy, 12000), (hoy - timedelta(days=31), 11000)):
            s.add(ChartmetricMetricPoint(artist_id=art.id, source="spotify", field="followers", date=d, value=v))
        for d, v in ((hoy, 340000), (hoy - timedelta(days=31), 300000)):
            s.add(ChartmetricMetricPoint(artist_id=art.id, source="spotify", field="listeners", date=d, value=v))
        s.add(ChartmetricMetricPoint(artist_id=art.id, source="youtube_channel", field="subscribers", date=hoy, value=88000))
        fotos = []
        for i in range(3):
            p = Photo(owner_type="ARTIST", owner_id=art.id, artist_id=art.id, kind="IMAGE", file_name="f%d.jpg" % i,
                      file_url="https://fotos.prueba/f%d.jpg" % i, title="Foto %d" % i)
            s.add(p)
            fotos.append(p)
        s.flush()
        album = PhotoAlbum(owner_type="ARTIST", owner_id=art.id, artist_id=art.id, name="Álbum Prueba", cover_photo_id=fotos[0].id)
        s.add(album)
        s.flush()
        s.add(PhotoAlbumItem(album_id=album.id, photo_id=fotos[0].id, sort_order=0))
        s.add(PhotoAlbumItem(album_id=album.id, photo_id=fotos[1].id, sort_order=1))
        nota = PressRelease(purpose="PRESS", status="SENT", subject_kind="ARTIST", subject_id=art.id, artist_ids=[str(art.id)],
                            about_kind="SUBJECT", title="Titular de la nota de prueba", public_token=uuid.uuid4().hex,
                            thumb_url="https://fotos.prueba/nota.jpg", sent_at=datetime.now(timezone.utc),
                            created_by_user_id=u.id, design={"width": 600, "bg": {}, "blocks": []})
        s.add(nota)
        ev = AppEvent(name=EVENTO, logo_url="https://fotos.prueba/evento.png", description="Un evento de prueba")
        s.add(ev)
        s.commit()
        return {"uid": str(u.id), "art": str(art.id), "art2": str(art2.id), "album": str(album.id), "foto2": str(fotos[2].id),
                "ev": str(ev.id), "c1": c1.festival_name, "ocultas": [c2.festival_name, c3.festival_name, c5.festival_name, c6.festival_name, c7.festival_name],
                "c4": c4.festival_name}
    finally:
        s.close()


def cliente(uid=None):
    c = A.app.test_client()
    if uid:
        with c.session_transaction() as ses:
            ses["user_id"] = uid
            ses["role"] = 10
            ses["nick"] = "dironesheet"
    return c


def main():
    limpia()
    d = datos()
    cli = cliente(d["uid"])
    pub = cliente()

    print("\n1) La pestaña de la ficha crea el one sheet")
    r = cli.get("/artistas/%s?tab=onesheet" % d["art"])
    html = r.get_data(as_text=True)
    check("la pestaña responde 200", r.status_code == 200, r.status_code)
    check("pinta la tarjeta del one sheet", "data-ost" in html)
    check("enseña la dirección pública con el nombre hecho slug", "/onesheet/prueba-one-sheet" in html)
    s = A.db()
    try:
        row = s.query(OneSheet).filter(OneSheet.subject_kind == "ARTIST", OneSheet.subject_id == A.to_uuid(d["art"])).first()
        check("existe la fila con slug «prueba-one-sheet»", row is not None and row.slug == "prueba-one-sheet", getattr(row, "slug", None))
        check("conserva el token antiguo del artista", row is not None and row.public_token == TOKEN_VIEJO)
        check("deduce lo que llevamos: contratación y discográfica", row is not None and set(row.services or []) >= {"CONTRATACION", "DISCOGRAFICA"}, getattr(row, "services", None))
        check("sale en el Roster por defecto", row is not None and row.roster_visible)
        design = onesheet_render.normalize_design(row.design, "ARTIST") if row else {}
        check("la cabecera lleva la foto del artista", design.get("hero", {}).get("image_url") == "https://fotos.prueba/artista.jpg")
        check("el diseño por defecto trae los 14 módulos", len(design.get("blocks") or []) == 14, len(design.get("blocks") or []))
        osid = str(row.id) if row else ""
    finally:
        s.close()

    print("\n2) La página pública pinta lo dinámico (y solo lo que toca)")
    r = pub.get("/onesheet/prueba-one-sheet")
    html = r.get_data(as_text=True)
    check("se abre sin identificarse", r.status_code == 200, r.status_code)
    check("un solo <!doctype (nada se pinta antes de la cabecera)", html.lower().count("<!doctype") == 1)
    check("los <style> cuadran", html.count("<style") == html.count("</style>"))
    check("lleva el nombre y la og:image de la cabecera", NOMBRE in html and 'property="og:image" content="https://fotos.prueba/artista.jpg"' in html)
    check("sale la fecha confirmada y anunciada", d["c1"] in html)
    check("la fecha agotada sale y con Sold Out", d["c4"] in html and "Sold Out" in html)
    for oculta in d["ocultas"]:
        check("NO sale «%s»" % oculta, oculta not in html)
    check("la certificación sale con su disco apilado (x2)", "Canción Cert" in html and "/certificacion/PLATINUM.png" in html and "n=2" in html)
    check("el ranking de países", "España" in html and "México" in html and "os-cty__bar" in html)
    check("la nota de prensa enviada, con su miniatura", "Titular de la nota de prueba" in html and "https://fotos.prueba/nota.jpg" in html)
    check("las cifras de Spotify en la cabecera (12.000 seguidores)", "12.000" in html and "340.000" in html)
    check("los seguidores de YouTube (88 mil)", "88 mil" in html)
    check("las redes: la manual (Instagram) y la de Chartmetric (Spotify)", "instagram.com/prueba.onesheet" in html and "open.spotify.com/artist/xyz" in html)
    check("el último lanzamiento con su portada y el botón de escuchar", "Canción Cert" in html and "https://fotos.prueba/portada.jpg" in html and "Escuchar" in html)
    check("las fotos NO salen todavía (nada elegido) y el módulo vacío no se pinta", "os-mod--photos" not in html and "https://fotos.prueba/f0.jpg" not in html)
    check("la biografía vacía no se pinta", "os-mod--bio" not in html)
    check("el pie lleva el enlace al Roster", "/onesheet\"" in html or "/onesheet'" in html or 'href="http://localhost/onesheet"' in html or "onesheet\">" in html)
    r = pub.get("/onesheet/%s" % TOKEN_VIEJO)
    check("el enlace ANTIGUO por token sigue abriéndose", r.status_code == 200, r.status_code)
    r = pub.get("/onesheet/no-existe-nadie-asi")
    check("un slug desconocido da 404", r.status_code == 404, r.status_code)
    r = pub.get("/onesheet/prueba-one-sheet/og.jpg")
    check("la og.jpg redirige a la foto de cabecera", r.status_code == 302 and "fotos.prueba/artista.jpg" in (r.headers.get("Location") or ""), r.status_code)

    print("\n3) El Roster público")
    r = pub.get("/onesheet")
    html = r.get_data(as_text=True)
    check("se abre sin identificarse", r.status_code == 200, r.status_code)
    check("lista al artista con su enlace y sus etiquetas", NOMBRE in html and "/onesheet/prueba-one-sheet" in html and "Contratación" in html)
    check("el título Roster y los logos del grupo", "Roster" in html and "osr__logos" in html)

    print("\n4) El editor")
    r = cli.get("/onesheet/editor/%s" % osid)
    html = r.get_data(as_text=True)
    check("la página del editor responde 200", r.status_code == 200, r.status_code)
    check("lleva el diseño y el catálogo para el JS", 'id="oseDesign"' in html and 'id="oseCatalog"' in html and "data-ose" in html)
    check("pinta las asas de los módulos", "data-ose-grip" in html)
    check("en el editor un módulo vacío SÍ se ve, como hueco", "ose-empty" in html and "os-mod--bio" in html)
    r = cli.get("/onesheet/editor/%s/datos" % osid)
    js = r.get_json() or {}
    check("los datos para elegir responden", r.status_code == 200 and js.get("ok"), r.status_code)
    grupos = js.get("photos") or []
    check("las fotos: el álbum y las sueltas", len(grupos) == 2 and any(g["name"] == "Álbum Prueba" and g["count"] == 2 for g in grupos), [(g.get("name"), g.get("count")) for g in grupos])
    check("las métricas con dato", {m["key"] for m in js.get("metrics") or []} >= {"spotify_followers", "spotify_listeners", "youtube_subscribers"})
    check("las certificaciones, la prensa, los lanzamientos y los vídeos conocidos", len(js.get("certifications") or []) == 1 and len(js.get("press") or []) == 1 and len(js.get("releases") or []) == 1 and len(js.get("videos") or []) == 1)
    check("las redes disponibles", {x["key"] for x in js.get("socials") or []} >= {"instagram", "spotify", "youtube"})
    check("la gente de la casa para el contacto (con el contacto de prensa delante)", (js.get("contacts") or [{}])[0].get("email") == A.PRESS_CONTACT_EMAIL)

    print("\n5) Guardar un diseño")
    s = A.db()
    try:
        row = s.get(OneSheet, A.to_uuid(osid))
        design = onesheet_render.normalize_design(row.design, "ARTIST")
    finally:
        s.close()
    bio = [b for b in design["blocks"] if b["type"] == "bio"][0]
    bio["opts"]["html"] = "<p>Hola <b>mundo</b> <script>alert(1)</script></p>"
    bio["x"], bio["w"], bio["y"] = 0, 12, 0
    fotos = [b for b in design["blocks"] if b["type"] == "photos"][0]
    fotos["opts"]["album_ids"] = [d["album"]]
    fotos["opts"]["photo_ids"] = [d["foto2"]]
    design["blocks"].append({"id": "hl1", "type": "highlights", "x": 0, "y": 0, "w": 5, "h": 1,
                             "opts": {"title": "Destacados", "items": [{"icon": "fire", "text": "Un punto fuerte de prueba"}, {"icon": "nada", "text": "Otro"}]}})
    design["blocks"].append({"id": "vd1", "type": "videos", "x": 0, "y": 0, "w": 7, "h": 1,
                             "opts": {"title": "Vídeos", "items": [{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Clip de prueba"}, {"url": "https://nada.com/x"}]}})
    design["blocks"].append({"id": "aw1", "type": "awards", "x": 6, "y": 0, "w": 6, "h": 1,
                             "opts": {"title": "Premios", "items": [{"icon": "trophy", "name": "Grammy Latino", "year": "2024"}]}})
    design["theme"]["bg"] = "#ffffff"
    design["theme"]["font"] = "montserrat"
    r = cli.post("/onesheet/editor/%s/guardar" % osid, json={"design": design})
    js = r.get_json() or {}
    check("guardar responde ok", r.status_code == 200 and js.get("ok"), (r.status_code, js.get("error")))
    nuevo = js.get("design") or {}
    bloques = nuevo.get("blocks") or []
    check("el HTML se sanea (fuera el <script>)", all("<script" not in (b.get("opts") or {}).get("html", "") for b in bloques) and any("<b>mundo</b>" in (b.get("opts") or {}).get("html", "") for b in bloques))
    check("un icono inventado cae al de por defecto", any(it.get("icon") == "star" for b in bloques if b["type"] == "highlights" for it in b["opts"]["items"]))
    check("un vídeo que no es de YouTube se descarta", [len(b["opts"]["items"]) for b in bloques if b["id"] == "vd1"] == [1])

    def solapan(a, b):
        return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])
    check("ningún módulo pisa a otro tras normalizar", not any(solapan(a, b) for i, a in enumerate(bloques) for b in bloques[i + 1:]))
    check("el tema claro da letras oscuras solas", onesheet_render.theme_colors(nuevo.get("theme"))["text"] == "#111827")
    r = pub.get("/onesheet/prueba-one-sheet")
    html = r.get_data(as_text=True)
    check("la página pública enseña la biografía guardada", "Hola <b>mundo</b>" in html)
    check("las fotos del álbum (2) más la suelta (1)", html.count("https://fotos.prueba/f0.jpg") >= 1 and "https://fotos.prueba/f1.jpg" in html and "https://fotos.prueba/f2.jpg" in html)
    check("el destacado, el vídeo (miniatura de YouTube) y el premio", "Un punto fuerte de prueba" in html and "i.ytimg.com/vi/dQw4w9WgXcQ" in html and "Grammy Latino" in html)
    check("la tipografía elegida se carga (y solo esa)", "family=Montserrat" in html and "Poppins" not in html)
    check("el color de fondo va en el tema", "--os-bg:#ffffff" in html and "--os-text:#111827" in html)

    print("\n6) Pintar un módulo suelto")
    conc = [b for b in bloques if b["type"] == "concerts"][0]
    conc["opts"]["limit"] = 1
    r = cli.post("/onesheet/editor/%s/modulo" % osid, json={"block": conc, "design": nuevo})
    js = r.get_json() or {}
    check("el módulo de conciertos se pinta con el tope", js.get("ok") and d["c1"] in (js.get("html") or "") and d["c4"] not in (js.get("html") or ""), js.get("error"))

    print("\n7) Los ajustes: dirección, etiquetas, Roster")
    r = cli.post("/onesheet/editor/%s/ajustes" % osid, json={"slug": "roster"})
    check("una palabra reservada como dirección se rechaza", r.status_code == 400, r.status_code)
    r = cli.post("/onesheet/editor/%s/ajustes" % osid, json={"slug": "Prueba OS Nueva", "services": ["MANAGEMENT", "EDITORIAL", "INVENTADA"], "roster_visible": False})
    js = r.get_json() or {}
    check("la dirección se normaliza y se guarda", js.get("ok") and js.get("slug") == "prueba-os-nueva", js)
    check("las etiquetas se filtran por el catálogo", js.get("services") == ["MANAGEMENT", "EDITORIAL"], js.get("services"))
    r = pub.get("/onesheet/prueba-os-nueva")
    check("la nueva dirección se abre", r.status_code == 200, r.status_code)
    check("la cabecera lleva las etiquetas nuevas", "Management" in r.get_data(as_text=True) and "Editorial" in r.get_data(as_text=True))
    r = pub.get("/onesheet")
    # ⚠️ Se mira el ENLACE, no el nombre: «Prueba One Sheet» está contenido en «Prueba One Sheet Dos».
    check("oculto del Roster, ya no sale", "/onesheet/prueba-os-nueva" not in r.get_data(as_text=True))
    cli.post("/onesheet/editor/%s/ajustes" % osid, json={"roster_visible": True})

    print("\n8) Las plantillas")
    r = cli.post("/onesheet/plantillas/nueva", json={"osid": osid, "name": "Plantilla prueba onesheet", "design": nuevo})
    js = r.get_json() or {}
    check("se guarda la plantilla", js.get("ok") and any(t["name"] == "Plantilla prueba onesheet" for t in js.get("templates") or []), js.get("error"))
    tid = (js.get("template") or {}).get("id")
    s = A.db()
    try:
        tpl = s.get(OneSheetTemplate, A.to_uuid(tid)) if tid else None
        tdes = tpl.design if tpl else {}
        check("la plantilla NO se lleva la biografía ni las fotos ni los vídeos del artista",
              tpl is not None and all(not (b.get("opts") or {}).get("html") for b in tdes.get("blocks") or [] if b["type"] in ("bio", "text"))
              and all(not (b.get("opts") or {}).get("items") for b in tdes.get("blocks") or [] if b["type"] == "videos")
              and all(not (b.get("opts") or {}).get("album_ids") for b in tdes.get("blocks") or [] if b["type"] == "photos"))
        check("pero sí el formato: mismos módulos y el fondo blanco", tpl is not None and len(tdes.get("blocks") or []) == len(bloques) and (tdes.get("theme") or {}).get("bg") == "#ffffff")
    finally:
        s.close()
    # El segundo artista (con el one-sheet antiguo importado) carga la plantilla: formato nuevo, su contenido.
    r = cli.get("/artistas/%s?tab=onesheet" % d["art2"])
    check("la pestaña del segundo artista", r.status_code == 200, r.status_code)
    s = A.db()
    try:
        row2 = s.query(OneSheet).filter(OneSheet.subject_kind == "ARTIST", OneSheet.subject_id == A.to_uuid(d["art2"])).first()
        d2 = onesheet_render.normalize_design(row2.design, "ARTIST")
        bio2 = [b for b in d2["blocks"] if b["type"] == "bio"][0]
        check("el one-sheet ANTIGUO se importa: la bio", "Hola caracola" in bio2["opts"]["html"] and "Segundo" in bio2["opts"]["html"])
        check("… los premios, los vídeos, los contactos, el fondo y la portada",
              any(it["name"] == "Premio Prueba" for b in d2["blocks"] if b["type"] == "awards" for it in b["opts"]["items"])
              and any(b["opts"]["items"] for b in d2["blocks"] if b["type"] == "videos")
              and any(it["name"] == "Fulano" for b in d2["blocks"] if b["type"] == "contact" for it in b["opts"]["items"])
              and d2["theme"]["bg"] == "#123456" and d2["hero"]["image_url"] == "https://fotos.prueba/hero-viejo.jpg")
        osid2 = str(row2.id)
    finally:
        s.close()
    r = cli.post("/onesheet/editor/%s/plantilla" % osid2, json={"template_id": tid})
    js = r.get_json() or {}
    check("la plantilla se carga en el segundo", js.get("ok"), js.get("error"))
    d3 = js.get("design") or {}
    bio3 = [b for b in d3.get("blocks") or [] if b["type"] == "bio"]
    check("se lleva el formato (fondo blanco, mismos módulos)", (d3.get("theme") or {}).get("bg") == "#ffffff" and len(d3.get("blocks") or []) == len(bloques))
    check("y conserva la biografía y la portada que ya tenía", bio3 and "Hola caracola" in bio3[0]["opts"]["html"] and d3["hero"]["image_url"] == "https://fotos.prueba/hero-viejo.jpg")
    r = cli.post("/onesheet/plantillas/%s/borrar" % tid, json={})
    check("la plantilla se borra", (r.get_json() or {}).get("ok") and not any(t["id"] == tid for t in (r.get_json() or {}).get("templates") or []))

    print("\n9) La gestión del Roster")
    r = cli.get("/onesheet/roster/gestion")
    html = r.get_data(as_text=True)
    check("la pantalla responde", r.status_code == 200 and "data-osrm" in html and NOMBRE in html, r.status_code)
    r = cli.post("/onesheet/roster/guardar", json={"items": [{"kind": "ARTIST", "id": d["art2"], "visible": True, "services": ["DISCOGRAFICA"]},
                                                              {"kind": "ARTIST", "id": d["art"], "visible": True, "services": ["MANAGEMENT"]}]})
    check("se guarda el orden y las etiquetas", (r.get_json() or {}).get("saved") == 2, r.get_json())
    r = pub.get("/onesheet")
    html = r.get_data(as_text=True)
    check("el Roster sigue ese orden (el segundo delante)", 0 < html.find("/onesheet/prueba-one-sheet-dos") < html.find("/onesheet/prueba-os-nueva"))

    print("\n10) Un EVENTO también tiene One Sheet")
    r = cli.get("/eventos/%s?tab=onesheet" % d["ev"])
    check("la pestaña del evento responde", r.status_code == 200 and "data-ost" in r.get_data(as_text=True), r.status_code)
    r = pub.get("/onesheet/evento-one-sheet-prueba")
    check("y su página pública se abre con el logo del evento", r.status_code == 200 and "https://fotos.prueba/evento.png" in r.get_data(as_text=True), r.status_code)

    print("\n10b) Una GIRA COMPRADA también")
    r = cli.get("/contratacion/giras-compradas/gira-one-sheet?tab=onesheet")
    check("la pestaña de la gira responde con la tarjeta", r.status_code == 200 and "data-ost" in r.get_data(as_text=True), r.status_code)
    r = pub.get("/onesheet/gira-one-sheet")
    check("y su página pública se abre con la fecha de la gira", r.status_code == 200 and "Gira One Sheet" in r.get_data(as_text=True), r.status_code)

    print("\n11) Permisos y listas de públicos")
    with A.app.test_request_context("/onesheet/editor/%s/guardar" % osid, method="POST"):
        A.request.url_rule = A.app.url_map.bind("localhost").match("/onesheet/editor/%s/guardar" % osid, method="POST", return_rule=True)[0]
        check("los endpoints del editor resuelven a artists.onesheet", A._resolve_request_resource_key() == "artists.onesheet", A._resolve_request_resource_key())
    for ep in ("onesheet_public_view", "onesheet_roster_public", "onesheet_public_og_image"):
        check("%s está en PUBLIC_ENDPOINTS_EXTRA" % ep, ep in A.PUBLIC_ENDPOINTS_EXTRA)
    check("el chartmetric: el plan de fuentes pide YouTube solo si hay enlace", ("youtube_channel", ["subscribers", "views"]) in A._chartmetric_stat_plan(type("L", (), {"social_urls": {"youtube": "x"}})()) and not any(s == "facebook" for s, _f in A._chartmetric_stat_plan(type("L", (), {"social_urls": {}})())))
    paises, ciudades = A._chartmetric_parse_where_people_listen({"obj": {"countries": {"Spain": [{"timestp": "2026-09-01", "listeners": 10, "code2": "ES"}, {"timestp": "2026-09-10", "listeners": 20, "code2": "ES"}], "Mexico": {"listeners": 5}}, "cities": [{"city": "Madrid", "listeners": 7, "code2": "ES"}]}})
    check("«where people listen» se lee en sus formas posibles", paises and paises[0]["name"] == "Spain" and paises[0]["listeners"] == 20 and paises[1]["listeners"] == 5 and ciudades and ciudades[0]["name"] == "Madrid", (paises, ciudades))

    limpia()
    print("\n%d comprobaciones · %d fallos" % (OK + FALLOS, FALLOS))
    return 0 if not FALLOS else 1


if __name__ == "__main__":
    sys.exit(main())
