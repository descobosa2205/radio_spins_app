#!/usr/bin/env python3
"""PORTAL DE EXTERNOS · prueba de regresión.

Comprueba, contra la app REAL y la BD de PRUEBA, lo que un tercero puede y NO puede hacer en
`/externos`: cómo entra, qué ve cada tipo de acceso, que **no se cuela en el back office**, que lo
que se le pide DESAPARECE solo al contestarlo por otro lado, y la pantalla de dirección.

    /tmp/python/bin/python3 tools/check_externos.py

Requiere el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
Es IDEMPOTENTE: deja el estado como se lo encuentra y se puede pasar las veces que haga falta.
Sale con código 1 si algo falla, para poder usarla en CI.
"""
import os
import pathlib
import re
import sys
import tempfile
from datetime import timedelta

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
os.environ.setdefault("FLASK_SECRET_KEY", "check-externos")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import app as A                                      # noqa: E402
from models import (Artist, ArtistPerson, Concert, ConcertArtistNotification,   # noqa: E402
                    ConcertContractSheet, ExternalAccess, PersonDocRequest, Promoter,
                    Promotion, PromotionActivity, TicketSale, User, UserProfile, Venue)

A.app.config["WTF_CSRF_ENABLED"] = False   # ⚠️ sin esto, todo POST del test_client da un 302

OK = FALLOS = 0


def check(nombre, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1
        print("  ✓", nombre)
    else:
        FALLOS += 1
        print("  ✗", nombre, extra)


# El correo no sale: se captura para poder leer el número de verificación.
_CORREOS = {}
A._send_optional_email = lambda *a, **k: (_CORREOS.update({"html": a[2] if len(a) > 2 else ""}),
                                          (True, None))[1]


def entrar(contacto):
    """Entra en el portal como esa persona (correo → número → dentro).

    ⚠️ Se limpia el FRENO por IP (12 por minuto): la prueba entra una docena de veces desde
    127.0.0.1 y, si no, el freno la para a mitad — que es justo lo que tiene que hacer en la vida
    real. El freno se comprueba aparte, en su propio apartado."""
    A._EXT_RATE.clear()
    c = A.app.test_client()
    c.post("/externos/codigo", data={"contacto": contacto}, follow_redirects=True)
    m = re.search(r"color:#E33D48;\">(\d{6})<", _CORREOS.get("html", ""))
    if not m:
        return c, ""
    c.post("/externos/entrar", data={"code": m.group(1), "contacto": contacto, "canal": "EMAIL"})
    return c, c.get("/externos/inicio").data.decode()


def datos():
    """Deja preparado lo que hace falta (y solo eso): un artista con integrante, un promotor, una
    técnica en la hoja de ruta y tres actividades."""
    s = A.db()
    try:
        hoy = A.today_local()
        art = s.query(Artist).filter(Artist.name == "Los Externos").first()
        if art is None:
            art = Artist(name="Los Externos")
            s.add(art); s.flush()
        cant = s.query(Promoter).filter(Promoter.nick == "Luis Cantante").first()
        if cant is None:
            cant = Promoter(nick="Luis Cantante", first_name="Luis", last_name="Gil",
                            contact_email="luis@ejemplo.com", tax_id="12345678Z")
            s.add(cant); s.flush()
        if not s.query(ArtistPerson).filter(ArtistPerson.artist_id == art.id,
                                            ArtistPerson.promoter_id == cant.id).first():
            s.add(ArtistPerson(artist_id=art.id, promoter_id=cant.id,
                               first_name="Luis", last_name="Gil"))
        prom = s.query(Promoter).filter(Promoter.nick == "Promotora del Sur").first()
        if prom is None:
            prom = Promoter(nick="Promotora del Sur", contact_email="hola@promotora.com")
            s.add(prom); s.flush()
        tec = s.query(Promoter).filter(Promoter.nick == "Ana Técnica").first()
        if tec is None:
            tec = Promoter(nick="Ana Técnica", first_name="Ana", last_name="Ruiz",
                           contact_email="ana@tecnica.com", roles_manual=["TECH"])
            s.add(tec); s.flush()
        ven = s.query(Venue).first()

        def concierto(nombre, dias, estado, **kw):
            c = s.query(Concert).filter(Concert.festival_name == nombre).first()
            if c is None:
                c = Concert(artist_id=art.id, festival_name=nombre, activity_type="CONCIERTO",
                            sale_type="VENDIDO", capacity=kw.pop("capacity", 500),
                            date=hoy + timedelta(days=dias), status=estado,
                            venue_id=(ven.id if ven else None), **kw)
                s.add(c); s.flush()
            return c

        c1 = concierto("Festival de Prueba EXT", 20, "CONFIRMADO", capacity=1000,
                       promoter_id=prom.id, announcement_date=hoy - timedelta(days=2),
                       ticketing_payload={"entry_mode": "SALE"},
                       sales_request_token=A._uuid_token())
        concierto("Concierto pasado EXT", -30, "CONFIRMADO")
        concierto("Reserva EXT", 40, "RESERVADO")
        dia = (hoy + timedelta(days=20)).isoformat()

        def punto(i, kind, titulo, hora, gen, tec_):
            return {"id": i, "kind": kind, "title": titulo, "day": dia, "start_time": hora,
                    "end_time": "", "tbc": False, "confirmed": True, "cancelled": False,
                    "location": "", "note": "", "order": 0, "attachments": [], "contact": {},
                    "sheets": {"GENERAL": gen, "TECNICA": tec_}}

        # ⚠️ El payload de la hoja de ruta necesita `version: 2` y su lista se llama `agenda`: sin
        # eso, `_roadmap_load` lo descarta entero y el personal «no existe» para la app.
        from sqlalchemy.orm.attributes import flag_modified
        c1.roadmap_payload = {
            "version": 2,
            "personnel": [{"id": "p1", "kind": "PROMOTER", "ref_id": str(tec.id),
                           "name": "Ana Ruiz", "role": "Técnico de sonido"}],
            "hotels": [],
            "agenda": [punto("a1", "SHOW", "Concierto", "21:00", True, True),
                       punto("a2", "PRUEBA_SONIDO", "Prueba de sonido", "18:00", False, True),
                       punto("a3", "TRANSFER", "Transfer hotel → sala", "16:00", True, False)]}
        flag_modified(c1, "roadmap_payload")
        if not s.query(TicketSale).filter(TicketSale.concert_id == c1.id).first():
            s.add(TicketSale(concert_id=c1.id, day=hoy, sold_today=340))
        # Nadie bloqueado y todos los tipos abiertos (la prueba parte de un estado conocido).
        for fila in s.query(ExternalAccess).all():
            fila.blocked = False
        s.commit()
        A._set_app_setting(A.EXT_ACCESS_TYPES_SETTING, "")
        return (str(art.id), str(cant.id), str(prom.id), str(tec.id), str(c1.id))
    finally:
        s.close()


def main():
    art_id, cant_id, prom_id, tec_id, c1_id = datos()

    print("\n== 1 · QUIÉN ES CADA UNO (se calcula, no se marca) ==")
    s = A.db()
    with A.app.test_request_context("/externos"):
        check("el integrante de un artista es ARTISTA", "ARTIST" in A._ext_profiles(s, [cant_id]))
        check("quien promueve es PROMOTOR", "PROMOTER" in A._ext_profiles(s, [prom_id]))
        check("un técnico es solo TERCERO", A._ext_profiles(s, [tec_id]) == ["THIRD"])
        check("por correo se le encuentra (aunque escriba en mayúsculas)",
              [str(x.id) for x in A._ext_find_identity(s, email="LUIS@EJEMPLO.COM")] == [cant_id])
        check("un correo que no tenemos no encuentra a nadie",
              A._ext_find_identity(s, email="nadie@ejemplo.com") == [])
    s.close()

    print("\n== 2 · ENTRAR CON UN NÚMERO DE VERIFICACIÓN ==")
    c = A.app.test_client()
    r = c.get("/externos")
    check("la entrada se abre sin sesión", r.status_code == 200 and b"Entra en tu espacio" in r.data)
    c.post("/externos/codigo", data={"contacto": "luis@ejemplo.com"}, follow_redirects=True)
    m = re.search(r"color:#E33D48;\">(\d{6})<", _CORREOS.get("html", ""))
    check("le llega un número de 6 cifras", bool(m))
    r = c.post("/externos/entrar", data={"code": "000000", "contacto": "luis@ejemplo.com",
                                         "canal": "EMAIL"})
    check("con otro número no entra", "no es".encode() in r.data)
    r = c.post("/externos/entrar", data={"code": m.group(1), "contacto": "luis@ejemplo.com",
                                         "canal": "EMAIL"}, follow_redirects=True)
    check("con el suyo, entra", b"Tus actividades" in r.data)
    with A.app.test_request_context("/externos"):
        sms = A._ext_code_sms_text("123456")
    check("el SMS lleva el formato que el móvil reconoce (@dominio #codigo)",
          re.search(r"\n@[\w.\-]+ #123456$", sms) is not None, repr(sms))

    print("\n== 2b · EL FRENO DE PETICIONES ==")
    A._EXT_RATE.clear()
    c2 = A.app.test_client()
    for _ in range(A.EXT_RATE_LIMIT):
        c2.post("/externos/codigo", data={"contacto": "luis@ejemplo.com"})
    r = c2.post("/externos/codigo", data={"contacto": "luis@ejemplo.com"}, follow_redirects=True)
    check("pedir números sin parar se corta (cuesta dinero)", "Demasiados".encode() in r.data
          or "demasiad".encode() in r.data, r.data[-200:])
    A._EXT_RATE.clear()

    print("\n== 3 · LO QUE VE EL ARTISTA ==")
    c, html = entrar("luis@ejemplo.com")
    check("su actividad confirmada", "Festival de Prueba EXT" in html)
    check("y la que ya pasó", "Concierto pasado EXT" in html)
    check("NO la que está sin confirmar", "Reserva EXT" not in html)
    check("el estado y el anuncio", "Confirmado" in html and ("Anunciada" in html or "anuncia" in html))
    check("cuántas entradas van vendidas", "340" in html)
    check("su calendario, que pide SUS ventanas", "/externos/agenda.json" in html)
    check("y ni rastro del menú del back office",
          "Discográfica" not in html and "Administración" not in html)

    print("\n== 4 · NO SE ENTRA EN EL BACK OFFICE ==")
    for ruta in ("/home", "/artistas", "/discografica", "/personal", "/conciertos",
                 "/administracion", "/acceso-terceros"):
        rr = c.get(ruta)
        check("%s → fuera" % ruta, rr.status_code in (302, 401, 403), rr.status_code)

    print("\n== 5 · SOLO LO SUYO ==")
    s = A.db()
    reserva = s.query(Concert).filter(Concert.festival_name == "Reserva EXT").first()
    ajena = (s.query(Concert)
             .filter(Concert.festival_name.is_(None), Concert.status == "CONFIRMADO").first())
    s.close()
    check("una actividad suya sin confirmar no se abre",
          c.get("/externos/actividad/%s" % reserva.id).status_code == 404)
    if ajena is not None:
        check("la actividad de otro no se abre",
              c.get("/externos/actividad/%s" % ajena.id).status_code == 404)
    check("un id inventado no revienta (404, no 500)",
          c.get("/externos/actividad/no-es-un-uuid").status_code == 404)

    print("\n== 6 · EL PROMOTOR Y LA TÉCNICA VEN COSAS DISTINTAS ==")
    cp, hp = entrar("hola@promotora.com")
    check("el promotor ve la actividad que promueve", "Festival de Prueba EXT" in hp)
    check("con cómo va la venta", "entradas vendidas" in hp)
    ct, ht = entrar("ana@tecnica.com")
    check("la técnica ve donde se la ha incluido", "Festival de Prueba EXT" in ht)
    check("y NO ve las ventas", "entradas vendidas" not in ht)

    print("\n== 7 · LO QUE SE LE PIDE DESAPARECE AL CONTESTARLO POR OTRO LADO ==")
    s = A.db()
    c1 = s.get(Concert, A._safe_uuid(c1_id))
    av = (s.query(ConcertArtistNotification)
          .filter(ConcertArtistNotification.concert_id == c1.id).first())
    if av is None:
        av = ConcertArtistNotification(concert_id=c1.id, channel="EMAIL", kind="CONFIRMAR",
                                       recipients=[{"email": "luis@ejemplo.com"}],
                                       public_token=A._uuid_token(), snapshot={})
        s.add(av)
    av.kind, av.response, av.responded_at = "CONFIRMAR", None, None
    av.recipients = [{"email": "luis@ejemplo.com"}]
    s.commit()
    s.close()
    c, html = entrar("luis@ejemplo.com")
    check("se le pide confirmar la actividad", "Confirmar la actividad" in html)
    check("con el enlace de ese aviso", "/actividad/%s" % av.public_token in html)
    s = A.db()
    av2 = s.get(ConcertArtistNotification, av.id)
    av2.response, av2.responded_at = "OK", A._now_madrid()
    s.commit(); s.close()
    c, html = entrar("luis@ejemplo.com")
    check("al contestarlo por el correo, aquí desaparece", "Confirmar la actividad" not in html)

    s = A.db()
    sheet = (s.query(ConcertContractSheet)
             .filter(ConcertContractSheet.concert_id == A._safe_uuid(c1_id)).first())
    if sheet is None:
        sheet = ConcertContractSheet(concert_id=A._safe_uuid(c1_id),
                                     public_token=A._uuid_token(), status="REQUESTED")
        s.add(sheet)
    sheet.status = "REQUESTED"
    s.commit(); tok = sheet.public_token; s.close()
    cp, hp = entrar("hola@promotora.com")
    check("al promotor se le pide la ficha de contratación", "Ficha de contrataci" in hp)
    check("con su enlace", "/ficha-contratacion/%s" % tok in hp)
    s = A.db()
    s.query(ConcertContractSheet).filter(ConcertContractSheet.public_token == tok).first().status = "RECEIVED"
    s.commit(); s.close()
    cp, hp = entrar("hola@promotora.com")
    check("al mandarla, desaparece", "Ficha de contrataci" not in hp)

    s = A.db()
    req = (s.query(PersonDocRequest)
           .filter(PersonDocRequest.owner_id == A._safe_uuid(cant_id)).first())
    if req is None:
        req = PersonDocRequest(token=A._uuid_token(), owner_type="PROMOTER",
                               owner_id=A._safe_uuid(cant_id), kind="DNI", reason="EXPIRED")
    req.status = "ACTIVE"
    s.add(req); s.commit(); tok2 = req.token; s.close()
    c, html = entrar("luis@ejemplo.com")
    check("se le pide renovar su DNI", "Tu DNI" in html and "/documento/%s" % tok2 in html)
    s = A.db()
    s.query(PersonDocRequest).filter(PersonDocRequest.token == tok2).first().status = "DONE"
    s.commit(); s.close()
    c, html = entrar("luis@ejemplo.com")
    check("al subirlo, desaparece", "Tu DNI" not in html)

    print("\n== 8 · SU FICHA Y SUS DOCUMENTOS ==")
    r = c.get("/externos/ficha")
    check("abre su ficha", r.status_code == 200 and b"Tus documentos" in r.data)
    check("que guarda en SU endpoint", b"/externos/ficha/documentos/guardar" in r.data)
    r = c.post("/externos/ficha/documentos/guardar",
               data={"kind": "LOYALTY", "company": "Prueba EXT", "doc_number": "EXT-0001"})
    doc_id = ((r.get_json() or {}).get("document") or {}).get("id")
    check("sube un documento suyo", r.status_code == 200 and bool(doc_id), r.data[:120])
    s = A.db()
    otro = s.query(Promoter).filter(Promoter.nick == "Ana Técnica").first()
    from models import PersonDocument
    ajeno = PersonDocument(owner_type="PROMOTER", owner_id=otro.id, kind="LOYALTY",
                           company="De otro", doc_number="X")
    s.add(ajeno); s.commit(); ajeno_id = str(ajeno.id); s.close()
    check("NO puede borrar el de otra persona",
          c.post("/externos/ficha/documentos/%s/eliminar" % ajeno_id).status_code == 404)
    check("y sí el suyo",
          c.post("/externos/ficha/documentos/%s/eliminar" % doc_id).get_json().get("ok"))
    s = A.db()
    s.delete(s.get(PersonDocument, A._safe_uuid(ajeno_id))); s.commit(); s.close()

    print("\n== 9 · LA SESIÓN ==")
    with c.session_transaction() as ses:
        check("no lleva usuario de la casa", not ses.get("user_id") and not ses.get("role"))
        check("y dura 24 horas (cookie permanente)", ses.permanent)
        ses["ext_since"] = (A._now_madrid() - timedelta(hours=25)).isoformat()
    check("a las 25 horas hay que volver a identificarse",
          b"Entra en tu espacio" in c.get("/externos/inicio", follow_redirects=True).data)

    print("\n== 10 · DIRECCIÓN: «ACCESO TERCEROS» ==")
    s = A.db()
    jefe = (s.query(User).join(UserProfile, UserProfile.user_id == User.id)
            .filter(User.role == 10).first())
    uid = str(jefe.id) if jefe is not None else ""
    s.close()
    if not uid:
        print("  (sin usuario de dirección en la BD de prueba: se salta)")
    else:
        cd = A.app.test_client()
        with cd.session_transaction() as ses:
            ses["user_id"] = uid
            ses["role"] = 10
        r = cd.get("/acceso-terceros")
        check("dirección abre la pantalla", r.status_code == 200 and b"Acceso terceros" in r.data)
        check("con una pestaña por tipo de acceso",
              all(x.encode() in r.data for x in ("Artista", "Promotores", "Autores", "Terceros")))
        check("dice qué ve ese tipo", b"Su calendario" in r.data)
        r = cd.get("/acceso-terceros/%s/ver" % cant_id, follow_redirects=True)
        check("puede ver el portal de alguien", b"Tus actividades" in r.data)
        check("y se dice que lo está viendo", "Estás viendo el portal".encode() in r.data)
        check("viéndolo no puede guardar nada",
              cd.post("/externos/ficha/documentos/guardar", data={}).status_code == 403)
        cd.get("/externos/salir")
        cd.post("/acceso-terceros/%s/bloquear" % tec_id, data={"valor": "1"})
        c2 = A.app.test_client()
        r = c2.post("/externos/codigo", data={"contacto": "ana@tecnica.com"}, follow_redirects=True)
        check("a quien se le quita el acceso, no se le manda número",
              "desactivado".encode() in r.data)
        cd.post("/acceso-terceros/%s/bloquear" % tec_id, data={"valor": "0"})
        _c3, h3 = entrar("ana@tecnica.com")
        check("y al devolvérselo, vuelve a entrar", "Tus actividades" in h3)
        cd.post("/acceso-terceros/tipo", data={"tipo": "PROMOTER", "valor": "0"})
        _c4, h4 = entrar("hola@promotora.com")
        check("con un tipo de acceso cerrado deja de ver lo suyo",
              "Festival de Prueba EXT" not in h4)
        cd.post("/acceso-terceros/tipo", data={"tipo": "PROMOTER", "valor": "1"})
        _c5, h5 = entrar("hola@promotora.com")
        check("al reabrirlo, vuelve", "Festival de Prueba EXT" in h5)

    print("\n%s   %d ok · %d fallos" % ("TODO OK" if not FALLOS else "⚠️  HAY FALLOS", OK, FALLOS))
    return 1 if FALLOS else 0


if __name__ == "__main__":
    sys.exit(main())
