#!/usr/bin/env python3
"""DISEÑO DE COMUNICACIONES · prueba de regresión (sep 2026).

«Diseño de comunicaciones» es el MISMO editor para las tres cosas que salen de casa: una **nota de
prensa**, un envío **a compradores** y una **notificación corporativa**. Lo que se toque aquí las
toca a las tres, así que esto tiene que seguir en verde.

Comprueba, contra la app REAL y la BD de PRUEBA:
  · EL CARTEL DE REFERENCIA de una actividad (`_concert_reference_poster`, punto único de la
    entrada Y de la comunicación): el aprobado, el SUBIDO sin aprobar, el de la GIRA o el CICLO, el
    que llega en PDF (se le saca la primera página), y que NO valen nunca un RECHAZADO, un cartel
    de **SOLD OUT** ni un cartel en **vídeo**
  · La MINIATURA de un cartel en PDF: se guarda en `poster_url` y no se vuelve a generar; un PDF
    vectorial (sin imágenes dentro) no inventa ninguna
  · LA PALETA: la actividad, el single y el logo se arrastran VACÍOS y luego se elige (no se listan
    los concretos), y el hueco de un logo dice que lo que se elige es un LOGO
  · El `pick` del logo: se guarda con el diseño y sobrevive a recargar (si no, un logo a medias
    pediría una foto)
  · La SELECCIÓN MÚLTIPLE con ⌘/Ctrl: que esté cableada en el editor (marcar, mover, borrar, copiar)

    /tmp/python/bin/python3 tools/check_diseno_comunicaciones.py
Requiere el entorno de /tmp de CLAUDE.md. Es IDEMPOTENTE (borra lo que crea).
"""
import io
import os
import pathlib
import sys
import tempfile
import uuid
from datetime import date, timedelta

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-disenio")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import app as A                                        # noqa: E402
import press_render                                    # noqa: E402
from models import (Artist, Concert, ConcertArtworkAsset, ConcertArtworkRequest,   # noqa: E402
                    GroupCompany, PressRelease, PurchasedTour, User, UserProfile, Venue)

OK = FALLOS = 0


def check(texto, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1
        print("  ✓ " + texto)
    else:
        FALLOS += 1
        print("  ✗ " + texto + ((" — " + str(extra)) if extra != "" else ""))


# ── un PDF de cartel DE VERDAD (con su imagen dentro) y otro vectorial ───────────────────────
def _pdf(con_imagen=True):
    from PIL import Image
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas
    salida = io.BytesIO()
    c = rl_canvas.Canvas(salida, pagesize=(595, 842))
    if con_imagen:
        img = Image.new("RGB", (1200, 1700), (227, 61, 72))
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=85); buf.seek(0)
        c.drawImage(ImageReader(buf), 0, 0, width=595, height=842)
    else:
        c.setFont("Helvetica", 40); c.drawString(60, 700, "CARTEL")
    c.showPage(); c.save()
    return salida.getvalue()


PDF_CON_IMAGEN = _pdf(True)
PDF_VECTORIAL = _pdf(False)


class _Resp:
    def __init__(self, datos):
        self.datos = datos
    def read(self, n=None):
        return self.datos
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False


_BAJADA = {"bytes": PDF_CON_IMAGEN}
A.urlopen = lambda req, timeout=None: _Resp(_BAJADA["bytes"])
A._upload_bytes = lambda datos, clave, ct, upsert=False: "https://storage.prueba/%s" % clave


def datos():
    s = A.db()
    try:
        art = s.query(Artist).filter(Artist.name == "Los Comunicación").first()
        if art is None:
            art = Artist(name="Los Comunicación", photo_url="/static/img/logo.png"); s.add(art); s.flush()
        ven = s.query(Venue).filter(Venue.name == "Sala Comunicación").first()
        if ven is None:
            ven = Venue(name="Sala Comunicación", address="Calle Larga 1", postal_code="11402",
                        municipality="Jerez de la Frontera", province="Cádiz", country="España")
            s.add(ven); s.flush()
        gc = s.query(GroupCompany).filter(GroupCompany.name == "Comunicación Producciones").first()
        if gc is None:
            gc = GroupCompany(name="Comunicación Producciones",
                              logo_url="/static/img/logo_33_producciones.png")
            s.add(gc); s.flush()
        gc.logo_url = gc.logo_url or "/static/img/logo_33_producciones.png"
        u = s.query(User).filter(User.email == "dir.comunicacion@prueba.local").first()
        if u is None:
            u = User(email="dir.comunicacion@prueba.local", password_hash="x", role=10); s.add(u); s.flush()
            s.add(UserProfile(user_id=u.id, nick="dircomu", departments=["Promoción"])); s.flush()
        u.role = 10
        hoy = date.today()
        c1 = Concert(artist_id=art.id, festival_name="Comunicación Prueba", activity_type="CONCIERTO",
                     sale_type="VENDIDO", capacity=800, date=hoy + timedelta(days=30), status="CONFIRMADO",
                     venue_id=ven.id, group_company_id=gc.id, billing_company_id=gc.id,
                     show_time="21:00", created_by_user_id=u.id)
        s.add(c1); s.flush()
        req = ConcertArtworkRequest(concert_id=c1.id, public_token=uuid.uuid4().hex)
        s.add(req); s.flush()
        gira = s.query(PurchasedTour).filter(PurchasedTour.name == "Gira Comunicación").first()
        if gira is None:
            gira = PurchasedTour(name="Gira Comunicación", artist_id=art.id); s.add(gira); s.flush()
        # ⚠️ IDEMPOTENTE: la cartelería de la GIRA no cuelga de la actividad, así que no se va al
        #    borrar los conciertos. Sin limpiarla, la segunda pasada ya encuentra un cartel de gira
        #    y «sin nada, la fecha de la gira no tiene cartel» fallaría sin que nada esté roto.
        (s.query(ConcertArtworkRequest)
         .filter(ConcertArtworkRequest.group_kind == "TOUR", ConcertArtworkRequest.group_id == gira.id)
         .delete(synchronize_session=False))
        s.flush()
        c2 = Concert(artist_id=art.id, festival_name="Comunicación Gira", activity_type="CONCIERTO",
                     sale_type="VENDIDO", capacity=500, date=hoy + timedelta(days=31), status="CONFIRMADO",
                     venue_id=ven.id, purchased_tour_id=gira.id, created_by_user_id=u.id)
        s.add(c2); s.flush()
        nota = PressRelease(purpose="PRESS", status="DRAFT", subject_kind="COMPANY", subject_id=gc.id,
                            about_kind="SUBJECT", created_by_user_id=u.id,
                            design={"width": press_render.WIDTH, "bg": {}, "blocks": []})
        s.add(nota)
        s.commit()
        return {"cid": str(c1.id), "cid2": str(c2.id), "rid": str(req.id), "gira": str(gira.id),
                "uid": str(u.id), "nota": str(nota.id), "gc": str(gc.id)}
    finally:
        s.close()


def cliente(uid):
    A.app.config["WTF_CSRF_ENABLED"] = False
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["user_id"] = uid
    return c


def limpia(d):
    s = A.db()
    try:
        (s.query(ConcertArtworkRequest)
         .filter(ConcertArtworkRequest.group_kind == "TOUR",
                 ConcertArtworkRequest.group_id == A.to_uuid(d["gira"]))
         .delete(synchronize_session=False))
        s.query(PressRelease).filter(PressRelease.id == A.to_uuid(d["nota"])).delete(synchronize_session=False)
        for cid in (d["cid"], d["cid2"]):
            c = s.get(Concert, A.to_uuid(cid))
            if c is not None:
                s.delete(c)
        s.commit()
    except Exception:
        s.rollback()
    finally:
        s.close()


def main():
    d = datos()
    s = A.db()
    try:
        cid, cid2 = d["cid"], d["cid2"]
        req_id = A.to_uuid(d["rid"])
        c1 = s.get(Concert, A.to_uuid(cid))

        print("1 · el CARTEL del módulo de una actividad")
        datos_act = A._press_activity_data(s, {"concert_id": cid})
        check("sin cartel, el módulo no se inventa ninguno", not datos_act.get("poster_url"), datos_act.get("poster_url"))
        check("pero sí trae los demás datos", bool(datos_act.get("date_label")) and bool(datos_act.get("venue_label")))
        check("y la dirección del recinto, para pintarla debajo", bool(datos_act.get("venue_address")))
        check("y el enlace del mapa", (datos_act.get("venue_map_url") or "").startswith("http"))

        a1 = ConcertArtworkAsset(artwork_request_id=req_id, format_label="Vertical",
                                 file_url="https://storage.prueba/cartel.jpg", kind="IMAGE",
                                 category="POSTER", validation_status="PENDING", is_primary=True)
        s.add(a1); s.commit(); s.expire_all()
        datos_act = A._press_activity_data(s, {"concert_id": cid})
        check("un cartel SUBIDO y sin aprobar YA se ve (lo pidió Dani)",
              (datos_act.get("poster_url") or "").endswith("cartel.jpg"), datos_act.get("poster_url"))

        a1.validation_status = "REJECTED"; s.commit(); s.expire_all()
        check("uno RECHAZADO no vale nunca",
              not A._press_activity_data(s, {"concert_id": cid}).get("poster_url"))
        a1.validation_status = "APPROVED"; s.commit(); s.expire_all()
        check("aprobado, vuelve a verse",
              (A._press_activity_data(s, {"concert_id": cid}).get("poster_url") or "").endswith("cartel.jpg"))
        # ⚠️ ARCHIVADO NO ES BORRADO: al cambiar la fecha o el sitio la app los archiva y pide
        #    otros, y hasta que llega el nuevo el que hay es ese (apartado «3 bis 2»).
        a1.is_archived = True; s.commit(); s.expire_all()
        check("archivado, sigue valiendo mientras no haya otro",
              (A._press_activity_data(s, {"concert_id": cid}).get("poster_url") or "").endswith("cartel.jpg"))

        print("2 · un cartel que llega en PDF (lo que manda la imprenta)")
        a2 = ConcertArtworkAsset(artwork_request_id=req_id, format_label="Cartel A3",
                                 file_url="https://storage.prueba/cartel.pdf", kind="PDF",
                                 original_name="cartel.pdf", mime_type="application/pdf",
                                 category="POSTER", validation_status="PENDING")
        s.add(a2); s.commit(); s.expire_all()
        check("un PDF sin miniatura todavía no es una imagen", A._artwork_image_src(a2) == "")
        datos_act = A._press_activity_data(s, {"concert_id": cid})
        check("el módulo le saca la PRIMERA PÁGINA", (datos_act.get("poster_url") or "").endswith(".jpg"),
              datos_act.get("poster_url"))
        s.refresh(a2)
        guardada = (a2.poster_url or "")
        check("y la guarda, para no volver a generarla", guardada.endswith(".jpg"), guardada)
        check("desde entonces, ESA es la imagen de la pieza", A._artwork_image_src(a2) == guardada)
        A.urlopen = lambda req, timeout=None: (_ for _ in ()).throw(AssertionError("no se vuelve a bajar"))
        check("y no se vuelve a bajar el PDF",
              (A._press_activity_data(s, {"concert_id": cid}).get("poster_url") or "").endswith(".jpg"))
        A.urlopen = lambda req, timeout=None: _Resp(_BAJADA["bytes"])

        _BAJADA["bytes"] = PDF_VECTORIAL
        check("un PDF VECTORIAL (sin imágenes dentro) no inventa ninguna miniatura",
              A._artwork_pdf_preview_bytes("https://storage.prueba/vect.pdf") is None)
        _BAJADA["bytes"] = PDF_CON_IMAGEN
        check("y uno con su imagen sí la da", bool(A._artwork_pdf_preview_bytes("https://storage.prueba/x.pdf")))

        print("3 · el cartel de la GIRA vale para su fecha")
        check("sin nada, la fecha de la gira no tiene cartel",
              not A._press_activity_data(s, {"concert_id": cid2}).get("poster_url"))
        rg = A._artwork_group_request(s, "TOUR", A.to_uuid(d["gira"]), create=True)
        s.add(ConcertArtworkAsset(artwork_request_id=rg.id, format_label="Cartel de gira",
                                  file_url="https://storage.prueba/gira.jpg", kind="IMAGE",
                                  category="POSTER", validation_status="PENDING"))
        s.commit(); s.expire_all()
        check("el cartel de la gira SIN aprobar también se ve",
              (A._press_activity_data(s, {"concert_id": cid2}).get("poster_url") or "").endswith("gira.jpg"))

        print("3 bis · los carteles de SOLD OUT NUNCA son el cartel de la actividad")
        # Lo dijo Dani: «aunque se suban carteles de Sold Out, el cartel principal sigue siendo el
        # de referencia; los Sold Out son solo para comunicar el sold out». Viven en la MISMA
        # solicitud, con category='SOLDOUT'.
        a1.is_archived = False
        a1.validation_status = "APPROVED"
        a1.is_primary = True
        a2.is_archived = True                      # fuera el PDF, para no mezclar
        s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("con solo el cartel, la entrada y la comunicación enseñan el MISMO",
              A._concert_reference_poster(cc, s)
              == (A._press_activity_data(s, {"concert_id": cid}).get("poster_url") or "")
              == A._concert_poster_url(cc) != "", A._concert_reference_poster(cc, s))
        for nombre, w, h in (("story.jpg", 1080, 1920), ("cuadrado.jpg", 1080, 1080)):
            s.add(ConcertArtworkAsset(artwork_request_id=req_id, format_label=nombre,
                                      file_url="https://storage.prueba/" + nombre, kind="IMAGE",
                                      category="SOLDOUT", validation_status="APPROVED", width=w, height=h))
        s.commit(); s.expire_all()
        A._artwork_pick_primary_by_squareness(s.get(ConcertArtworkRequest, req_id), "SOLDOUT")
        s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("el cartel sigue siendo el PRINCIPAL", A._concert_poster_url(cc).endswith("cartel.jpg"),
              A._concert_poster_url(cc))
        check("… en la comunicación",
              (A._press_activity_data(s, {"concert_id": cid}).get("poster_url") or "").endswith("cartel.jpg"))
        check("… y en la entrada",
              (A._invgen_image_options(s, cc)[0]["url"] or "").endswith("cartel.jpg"),
              A._invgen_image_options(s, cc)[:1])
        # Aunque el cartel normal se archive por una actualización de datos, los de Sold Out NO
        # ocupan su sitio: sigue mandando el cartel (archivado) hasta que llegue el nuevo.
        a1.is_archived = True; s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("con el cartel archivado, los de Sold Out siguen sin ocupar su sitio",
              A._concert_poster_url(cc).endswith("cartel.jpg"), A._concert_poster_url(cc))
        check("ni la entrada ofrece uno de Sold Out",
              [o["url"] for o in A._invgen_image_options(s, cc) if o["key"] == "poster"] ==
              [A._concert_poster_url(cc)],
              A._invgen_image_options(s, cc))
        a1.is_archived = False; s.commit(); s.expire_all()

        print("3 bis 2 · el cartel ARCHIVADO al cambiar los datos vale hasta que llega el nuevo")
        # ⚠️ Es la causa de «al actualizar la hora de una actividad se ha dejado de ver el cartel»:
        #    `_artwork_request_refresh` los archiva y pide otros, y hasta que llega el nuevo el que
        #    hay es ese.
        a1.is_archived = False; a1.validation_status = "APPROVED"; a1.is_primary = True
        s.commit(); s.expire_all()
        A._archive_current_artwork_assets(s.get(ConcertArtworkRequest, req_id))
        s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("el archivado sigue valiendo", A._concert_poster_url(cc).endswith("cartel.jpg"),
              A._concert_poster_url(cc))
        check("y el editor no avisa de que falte",
              not A._press_activity_data(s, {"concert_id": cid}).get("poster_hint"))
        nuevo_cartel = ConcertArtworkAsset(artwork_request_id=req_id, format_label="Cartel v2",
                                           file_url="https://storage.prueba/nuevo.jpg", kind="IMAGE",
                                           category="POSTER", validation_status="PENDING")
        s.add(nuevo_cartel); s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("en cuanto llega el NUEVO, gana él (aunque el viejo fuera el principal y aprobado)",
              A._concert_poster_url(cc).endswith("nuevo.jpg"), A._concert_poster_url(cc))
        s.delete(nuevo_cartel); s.commit(); s.expire_all()

        print("3 quater · cuando NO hay cartel, el editor dice por qué")
        for a in list(s.get(ConcertArtworkRequest, req_id).assets):
            if A._artwork_asset_category(a) == "POSTER":
                s.delete(a)
        s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        d_sin = A._press_activity_data(s, {"concert_id": cid})
        check("no hay cartel", not d_sin.get("poster_url"))
        check("y se dice que lo que hay son de Sold Out", "Sold Out" in (d_sin.get("poster_hint") or ""),
              d_sin.get("poster_hint"))
        check("el aviso se pinta EN EL EDITOR",
              "Sold Out" in press_render.module_html({"type": "activity", "w": 520, "h": 170,
                                                      "data": dict(d_sin, icons={})}, editing=True))
        check("y NUNCA en el correo",
              "Sold Out" not in press_render.module_html({"type": "activity", "w": 520, "h": 170,
                                                          "data": dict(d_sin, icons={})}, for_email=True))

        print("3 ter · un cartel en VÍDEO tampoco es el cartel")
        s.add(ConcertArtworkAsset(artwork_request_id=req_id, format_label="Anuncio",
                                  file_url="https://storage.prueba/anuncio.mp4", kind="VIDEO",
                                  category="POSTER", validation_status="APPROVED",
                                  poster_url="https://storage.prueba/anuncio.jpg"))
        s.commit(); s.expire_all()
        cc = s.get(Concert, A.to_uuid(cid))
        check("un vídeo no ocupa el sitio del cartel, ni con su miniatura",
              A._concert_poster_url(cc) == "", A._concert_poster_url(cc))
        check("y se dice que lo que hay no se puede usar",
              "no es una imagen" in (A._press_activity_data(s, {"concert_id": cid}).get("poster_hint") or ""),
              A._press_activity_data(s, {"concert_id": cid}).get("poster_hint"))
    finally:
        s.close()

    print("4 · la PALETA: lo que se arrastra vacío")
    js = (RAIZ / "static/js/press_editor.js").read_text(encoding="utf-8")
    check("la actividad, el single y el logo NO listan lo concreto",
          "if (!gen) {" in js and "['activities', 'audios', 'logos'].indexOf(g[0]) < 0" not in js)
    check("el logo nace como una IMAGEN con su `pick`", "VACIO_TIPO = { logo: 'image' }" in js)
    check("y tiene su selector", "logo:     { grupo: 'logos'" in js)
    check("lo que se elige sale de `clavePick`, no del tipo", "function clavePick(b)" in js)
    check("una referencia puesta cuenta también la URL (el logo)",
          "r.concert_id || r.url" in js)

    print("5 · el HUECO de un logo dice que se elige un LOGO")
    hueco = press_render.module_html({"type": "image", "pick": "logo", "w": 180, "h": 90,
                                      "data": {"pending": True}}, editing=True)
    check("el hueco es el del logo", "Logo" in hueco and "logo del grupo" in hueco, hueco[:120])
    hueco_foto = press_render.module_html({"type": "image", "w": 180, "h": 90,
                                           "data": {"pending": True}}, editing=True)
    check("y el de una imagen normal sigue hablando de la FOTO", "foto" in hueco_foto)
    check("fuera del editor, un módulo a medias no se pinta",
          press_render.module_html({"type": "image", "pick": "logo", "w": 180, "h": 90,
                                    "data": {"pending": True}}) == "")

    print("6 · el `pick` se guarda con el diseño")
    cl = cliente(d["uid"])
    r = cl.post("/notas-de-prensa/%s/modulo" % d["nota"],
                json={"id": "b1", "type": "image", "pick": "logo", "ref": {}, "opts": {}, "w": 180})
    check("el editor pinta el hueco del logo", r.status_code == 200 and "logo del grupo" in r.get_json()["html"],
          r.status_code)
    r = cl.post("/notas-de-prensa/%s/guardar" % d["nota"], json={"design": {"width": 600, "bg": {}, "blocks": [
        {"id": "b1", "type": "image", "pick": "logo", "x": 20, "y": 20, "w": 180, "h": 90, "ref": {}, "opts": {}},
        {"id": "b2", "type": "image", "pick": "inventado", "x": 20, "y": 140, "w": 180, "h": 90, "ref": {}, "opts": {}},
    ]}})
    check("el guardado responde bien", r.status_code == 200 and r.get_json().get("ok"), r.status_code)
    s2 = A.db()
    try:
        nota = s2.get(PressRelease, A.to_uuid(d["nota"]))
        bloques = {b["id"]: b for b in (nota.design or {}).get("blocks") or []}
        check("el logo conserva su `pick` al recargar", bloques.get("b1", {}).get("pick") == "logo",
              bloques.get("b1"))
        check("y un `pick` inventado no se guarda", not bloques.get("b2", {}).get("pick"),
              bloques.get("b2"))
    finally:
        s2.close()

    print("7 · seleccionar VARIOS con ⌘ (Mac) o Ctrl (Windows)")
    check("el clic mira la tecla", "ev.metaKey || ev.ctrlKey" in js)
    check("hay una lista de seleccionados", "function seleccionados()" in js)
    check("con ⌘ se suma y, si ya estaba, se quita", "else if (estaSel(id))" in js)
    check("arrastrando uno se mueven todos", "drag.otros" in js)
    check("y pinchar sin ⌘ uno que ya estaba NO deshace la selección",
          "if (!(!aditiva && yaEstaba)) selecciona(id, aditiva);" in js)
    check("borrar se lleva todos los marcados", "borra(seleccionados())" in js)
    check("las flechas los mueven todos", "ids.forEach(function (id) {" in js)
    check("⌘C · ⌘V copian y pegan varios", "function copiaVarios(ids)" in js and "function pegaVarios(lista)" in js)
    check("el panel dice cuántos hay", "seleccionados'" in js and "data-pr-unsel" in js)
    check("al coger un bloque se suelta el texto que se estuviera escribiendo (antes de lo de ⌘)",
          js.index("act.closest('.pr-blk__text')) act.blur();") < js.index("if (aditiva) { ev.preventDefault(); return; }"))

    limpia(d)
    print("\nOK: %d · FALLOS: %d" % (OK, FALLOS))
    return 1 if FALLOS else 0


if __name__ == "__main__":
    sys.exit(main())
