#!/usr/bin/env python3
"""GENERACIÓN DE INVITACIONES · prueba de regresión (sep 2026).
Comprueba, contra la app REAL y la BD de PRUEBA:
  · el botón «Generar invitaciones» solo sale en lo que promueve una empresa del grupo
  · la pantalla de generación, el PDF de muestra (una página, «INVITACIÓN», QR) y la configuración
    (horas, extras del catálogo y nuevos, imagen, condiciones con plantilla: solo este evento /
    también la plantilla / plantilla nueva)
  · la landing pública de las condiciones (sin sesión) y su token
  · los permisos: los endpoints de dentro resuelven a «invitaciones.gestionar», los públicos a None
    /tmp/python/bin/python3 tools/check_invitaciones_generadas.py
Requiere el entorno de /tmp de CLAUDE.md. Es IDEMPOTENTE (borra lo que crea).
"""
import io
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
os.environ.setdefault("FLASK_SECRET_KEY", "check-invgen")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import app as A                                       # noqa: E402
import models                                         # noqa: E402
from models import (Artist, Concert, GroupCompany, InvitationConditionsTemplate,   # noqa: E402
                    InvitationExtraPreset, InvitationGenConfig, Promoter, User, UserProfile, Venue)

A.app.config["WTF_CSRF_ENABLED"] = False
models.ensure_invitation_gen_schema()
OK = FALLOS = 0


def check(nombre, cond, extra=""):
    global OK, FALLOS
    if cond:
        OK += 1; print("  ✓", nombre)
    else:
        FALLOS += 1; print("  ✗", nombre, extra)


A.upload_image = lambda fs, folder, **kw: "https://x.test/storage/invitaciones/entrada.png"
HOY = A.today_local()


def limpia(s):
    for c in s.query(Concert).filter(Concert.festival_name.in_(["InvGen Festival Prueba", "InvGen Tercero Prueba"])).all():
        s.query(InvitationGenConfig).filter(InvitationGenConfig.concert_id == c.id).delete()
        s.delete(c)
    for t in s.query(InvitationConditionsTemplate).filter(InvitationConditionsTemplate.name.like("InvGen %")).all():
        s.delete(t)
    for p in s.query(InvitationExtraPreset).filter(InvitationExtraPreset.name.like("InvGen %")).all():
        s.delete(p)
    s.flush()


def datos():
    s = A.db()
    try:
        limpia(s)
        art = s.query(Artist).filter(Artist.name == "Los InvGen").first()
        if art is None:
            art = Artist(name="Los InvGen", photo_url="/static/img/logo.png"); s.add(art); s.flush()
        ven = s.query(Venue).filter(Venue.name == "Teatro InvGen").first()
        if ven is None:
            ven = Venue(name="Teatro InvGen", address="Calle Larga 1", postal_code="11402", municipality="Jerez de la Frontera",
                        province="Cádiz", country="España")
            s.add(ven); s.flush()
        gc = s.query(GroupCompany).filter(GroupCompany.name == "InvGen Producciones").first()
        if gc is None:
            gc = GroupCompany(name="InvGen Producciones", logo_url="/static/img/logo_33_producciones.png"); s.add(gc); s.flush()
        prom = s.query(Promoter).filter(Promoter.nick == "Promotor InvGen").first()
        if prom is None:
            prom = Promoter(nick="Promotor InvGen", contact_email="p@invgen.test"); s.add(prom); s.flush()
        u = s.query(User).filter(User.email == "dir.invgen@prueba.local").first()
        if u is None:
            u = User(email="dir.invgen@prueba.local", password_hash="x", role=10); s.add(u); s.flush()
            s.add(UserProfile(user_id=u.id, nick="dirinvgen", departments=["Ticketing"])); s.flush()
        u.role = 10
        c = Concert(artist_id=art.id, festival_name="InvGen Festival Prueba", activity_type="CONCIERTO",
                    sale_type="VENDIDO", capacity=800, date=HOY + timedelta(days=30), status="CONFIRMADO",
                    venue_id=ven.id, group_company_id=gc.id, billing_company_id=gc.id, doors_time="19:30",
                    show_time="21:00", created_by_user_id=u.id, ticketing_payload={"entry_mode": "SALE"})
        s.add(c)
        c2 = Concert(artist_id=art.id, festival_name="InvGen Tercero Prueba", activity_type="CONCIERTO",
                     sale_type="VENDIDO", capacity=500, date=HOY + timedelta(days=31), status="CONFIRMADO",
                     venue_id=ven.id, promoter_id=prom.id, created_by_user_id=u.id)
        s.add(c2)
        s.commit()
        return {"cid": str(c.id), "cid2": str(c2.id), "uid": str(u.id)}
    finally:
        s.close()


def cliente(uid):
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["user_id"] = uid
    return c


def main():
    d = datos()
    cid, cid2, uid = d["cid"], d["cid2"], d["uid"]
    cl = cliente(uid)

    print("1 · el botón y la pantalla")
    r = cl.get(f"/invitaciones/evento/{cid}")
    html = r.get_data(as_text=True)
    check("la pestaña del evento abre", r.status_code == 200, r.status_code)
    check("«Generar invitaciones» sale en la actividad del grupo", "Generar invitaciones" in html)
    r2 = cl.get(f"/invitaciones/evento/{cid2}")
    check("… y NO sale en la de un tercero", r2.status_code == 200 and "Generar invitaciones" not in r2.get_data(as_text=True))
    r3 = cl.get(f"/invitaciones/evento/{cid2}/generar")
    check("la pantalla de un tercero redirige (no se genera)", r3.status_code == 302 and "/invitaciones/evento/" in r3.headers.get("Location", ""))
    r = cl.get(f"/invitaciones/evento/{cid}/generar")
    html = r.get_data(as_text=True)
    check("la pantalla de generación abre", r.status_code == 200, r.status_code)
    check("dice que está sin configurar", "Sin configurar" in html)
    check("el recinto y la dirección salen", "Teatro InvGen" in html and "Calle Larga 1, 11402 Jerez de la Frontera, Cádiz" in html)
    check("las horas de la actividad se ofrecen por defecto", 'value="19:30"' in html and 'value="21:00"' in html)
    check("los tres extras de fábrica están en el catálogo", all(x in html for x in ("Meet &amp; Greet", "After Party", "Parking")))
    check("la plantilla de fábrica se ofrece", "Condiciones generales" in html)
    check("un solo doctype al principio", html.count("<!doctype") == 1 and html.lower().lstrip().startswith("<!doctype"))

    print("2 · el PDF de muestra")
    r = cl.get(f"/invitaciones/evento/{cid}/generar/muestra.pdf")
    pdf = r.get_data()
    check("responde un PDF", r.status_code == 200 and pdf[:4] == b"%PDF", r.status_code)
    from pypdf import PdfReader
    rd = PdfReader(io.BytesIO(pdf))
    txt = "\n".join((p.extract_text() or "") for p in rd.pages)
    check("una sola página", len(rd.pages) == 1, len(rd.pages))
    check("dice INVITACIÓN", "INVITACIÓN" in txt)
    check("lleva el título y el recinto", "Los InvGen" in txt and "Teatro InvGen" in txt)
    check("lleva las horas", "19:30" in txt and "21:00" in txt)
    check("lleva un QR (imagen)", "/Image" in str(rd.pages[0].get("/Resources", {}).get("/XObject", {})) or len(rd.pages[0].images) >= 1)
    check("sin condiciones todavía no promete ninguna", "CONDICIONES DE USO" not in txt)

    print("3 · configurar: horas, extras, imagen y condiciones (plantilla de fábrica modificada → solo este evento)")
    s = A.db()
    try:
        presets = {p.key: p for p in s.query(InvitationExtraPreset).all()}
        tpl = s.query(InvitationConditionsTemplate).filter(InvitationConditionsTemplate.is_builtin.is_(True)).first()
        tpl_id = str(tpl.id)
        tpl_n = len(tpl.clauses_json or [])
        mg_id = str(presets["MEET_GREET"].id)
    finally:
        s.close()
    form = {
        "doors_time": "20:00", "show_time": "21:30",
        "image_choice": "url:https://x.test/cartel.jpg",
        "extra_id[]": ["", ""], "extra_preset_id[]": [mg_id, ""],
        "extra_name[]": ["Meet & Greet", "InvGen Cena previa"], "extra_icon[]": ["fa-handshake", "fa-utensils"],
        "extra_instructions[]": ["A las 19:00 en la puerta de artistas", "Presenta la entrada en el restaurante"],
        "extra_new_catalog[]": ["0", "1"],
        "conditions_template_id": tpl_id, "template_scope": "ONLY",
        "cond_title[]": ["Invitación personal", "Un solo acceso"],
        "cond_body[]": ["Solo este evento la cambia.", "El QR se valida una vez."],
    }
    r = cl.post(f"/invitaciones/evento/{cid}/generar/configurar", data=form, follow_redirects=False)
    check("guarda y vuelve a la pantalla", r.status_code == 302 and "/generar" in r.headers.get("Location", ""), r.status_code)
    s = A.db()
    try:
        cfg = s.query(InvitationGenConfig).filter(InvitationGenConfig.concert_id == A.to_uuid(cid)).first()
        check("hay configuración", cfg is not None)
        check("horas guardadas", cfg.doors_time == "20:00" and cfg.show_time == "21:30")
        check("imagen elegida", cfg.image_url == "https://x.test/cartel.jpg")
        names = [x.name for x in cfg.extras]
        check("dos extras activos, en su orden", names == ["Meet & Greet", "InvGen Cena previa"], names)
        check("el nuevo entra en el catálogo con su icono", any(p.name == "InvGen Cena previa" and p.icon == "fa-utensils" for p in s.query(InvitationExtraPreset).all()))
        check("el extra nuevo cuelga de su preset", all(x.preset_id is not None for x in cfg.extras))
        check("dos cláusulas guardadas en el evento", len(cfg.conditions_json or []) == 2 and cfg.conditions_json[0]["title"] == "Invitación personal")
        tpl = s.get(InvitationConditionsTemplate, A.to_uuid(tpl_id))
        check("«solo este evento»: la plantilla de fábrica NO cambia", len(tpl.clauses_json or []) == tpl_n)
        check("la plantilla queda vinculada", str(cfg.conditions_template_id) == tpl_id)
        check("se creó el token de las condiciones", bool(cfg.conditions_token))
        check("queda configurada y con quién", cfg.configured_at is not None and cfg.configured_by_nick)
        token = cfg.conditions_token
        extra_ids = [str(x.id) for x in cfg.extras]
        extra_presets = [str(x.preset_id) for x in cfg.extras]
    finally:
        s.close()

    print("4 · la pantalla y el PDF con la configuración")
    r = cl.get(f"/invitaciones/evento/{cid}/generar")
    html = r.get_data(as_text=True)
    check("dice Configurados", "Configurados" in html)
    check("enseña los extras como chips", "InvGen Cena previa" in html)
    check("enseña la landing de condiciones", f"/invitaciones/condiciones/{token}" in html)
    r = cl.get(f"/invitaciones/evento/{cid}/generar/muestra.pdf")
    rd = PdfReader(io.BytesIO(r.get_data()))
    txt = "\n".join((p.extract_text() or "") for p in rd.pages)
    check("el PDF lleva las horas configuradas", "20:00" in txt and "21:30" in txt)
    check("el PDF lleva los extras con sus instrucciones", "Cena previa" in txt and "restaurante" in txt)
    check("el PDF resume las condiciones y enlaza a las completas", "CONDICIONES DE USO" in txt and f"/invitaciones/condiciones/{token}" in txt)
    check("sigue siendo una página", len(rd.pages) == 1)
    anots = rd.pages[0].get("/Annots") or []
    check("el enlace de las condiciones es clicable", len(anots) >= 1, len(anots))

    print("5 · la landing pública de las condiciones (sin sesión)")
    anon = A.app.test_client()
    r = anon.get(f"/invitaciones/condiciones/{token}")
    html = r.get_data(as_text=True)
    check("abre sin sesión", r.status_code == 200, r.status_code)
    check("título centrado «Condiciones de uso» y las dos cláusulas", "Condiciones de uso" in html and "Invitación personal" in html and "Un solo acceso" in html)
    check("lleva el logo y el evento", "logo_33_producciones" in html and "Los InvGen" in html)
    check("lleva las og:", 'property="og:title"' in html)
    r = anon.get("/invitaciones/condiciones/no-existe")
    check("un token que no existe da 404 con su página", r.status_code == 404 and "ya no está disponible" in r.get_data(as_text=True))

    print("6 · volver a guardar: cambiar la plantilla TAMBIÉN y crear una nueva")
    form2 = dict(form)
    form2.update({"extra_id[]": extra_ids, "extra_preset_id[]": extra_presets, "extra_new_catalog[]": ["0", "0"],
                  "image_choice": "keep", "template_scope": "UPDATE",
                  "cond_title[]": ["Invitación personal", "Un solo acceso", "Horarios"],
                  "cond_body[]": ["Cambia la plantilla.", "El QR se valida una vez.", "Puertas a la hora indicada."]})
    r = cl.post(f"/invitaciones/evento/{cid}/generar/configurar", data=form2)
    check("segundo guardado", r.status_code == 302)
    s = A.db()
    try:
        cfg = s.query(InvitationGenConfig).filter(InvitationGenConfig.concert_id == A.to_uuid(cid)).first()
        tpl = s.get(InvitationConditionsTemplate, A.to_uuid(tpl_id))
        check("«también la plantilla»: la de fábrica ahora tiene 3 cláusulas", len(tpl.clauses_json or []) == 3 and tpl.clauses_json[0]["body"] == "Cambia la plantilla.")
        check("los extras conservan su id (no se recrean)", [str(x.id) for x in cfg.extras] == extra_ids)
        check("«keep» conserva la imagen", cfg.image_url == "https://x.test/cartel.jpg")
        check("el token de condiciones no cambia", cfg.conditions_token == token)
        # Deshacer la plantilla de fábrica (la prueba es idempotente).
        tpl.clauses_json = [dict(c) for c in A.INVGEN_CONDITIONS_DEFAULT]
        s.commit()
    finally:
        s.close()
    form3 = dict(form2)
    form3.update({"template_scope": "ONLY", "save_template_name": "InvGen Plantilla Nueva", "image_choice": "remove",
                  "extra_id[]": [], "extra_preset_id[]": [], "extra_name[]": [], "extra_icon[]": [], "extra_instructions[]": [], "extra_new_catalog[]": []})
    r = cl.post(f"/invitaciones/evento/{cid}/generar/configurar", data=form3)
    check("tercer guardado", r.status_code == 302)
    s = A.db()
    try:
        cfg = s.query(InvitationGenConfig).filter(InvitationGenConfig.concert_id == A.to_uuid(cid)).first()
        nueva = s.query(InvitationConditionsTemplate).filter(InvitationConditionsTemplate.name == "InvGen Plantilla Nueva").first()
        check("se creó la plantilla nueva con las 3 cláusulas", nueva is not None and len(nueva.clauses_json or []) == 3)
        check("y queda vinculada a la actividad", nueva is not None and cfg.conditions_template_id == nueva.id)
        check("sin extras: se quitan todos", len(cfg.extras) == 0)
        check("«remove» quita la imagen", not cfg.image_url)
        nueva_id = str(nueva.id) if nueva else ""
    finally:
        s.close()
    r = cl.post(f"/invitaciones/evento/{cid}/generar/configurar", data=dict(form3, save_template_name="InvGen Plantilla Nueva"))
    check("un nombre de plantilla repetido se rechaza (302 con el aviso)", r.status_code == 302)
    r = cl.get(f"/invitaciones/evento/{cid}/generar")
    check("… y el aviso reabre el asistente", "invGenConfigModal" in r.get_data(as_text=True) and "Ya hay una plantilla" in r.get_data(as_text=True))
    r = cl.get(f"/invitaciones/generar/plantillas-condiciones/{nueva_id}.json")
    check("el JSON de la plantilla", r.status_code == 200 and r.get_json()["ok"] and len(r.get_json()["clauses"]) == 3)
    r = cl.post(f"/invitaciones/generar/plantillas-condiciones/{nueva_id}/eliminar")
    check("se elimina la plantilla nueva", r.status_code == 200 and r.get_json()["ok"])
    r = cl.post(f"/invitaciones/generar/plantillas-condiciones/{tpl_id}/eliminar")
    check("la de fábrica no se elimina", r.status_code == 400)
    s = A.db()
    try:
        cfg = s.query(InvitationGenConfig).filter(InvitationGenConfig.concert_id == A.to_uuid(cid)).first()
        check("la actividad conserva sus condiciones aunque la plantilla se borre", len(cfg.conditions_json or []) == 3 and cfg.conditions_template_id is None)
    finally:
        s.close()
    r = cl.post(f"/invitaciones/evento/{cid}/generar/configurar", data=dict(form3, **{"cond_title[]": [], "cond_body[]": [], "save_template_name": ""}))
    check("sin cláusulas se rechaza", r.status_code == 302)

    print("7 · permisos")
    with A.app.test_request_context(f"/invitaciones/evento/{cid}/generar"):
        check("la pantalla resuelve a invitaciones.gestionar", A._resolve_request_resource_key() == "invitaciones.gestionar", A._resolve_request_resource_key())
    with A.app.test_request_context(f"/invitaciones/evento/{cid}/generar/configurar", method="POST"):
        check("el guardado resuelve a invitaciones.gestionar", A._resolve_request_resource_key() == "invitaciones.gestionar")
    with A.app.test_request_context(f"/invitaciones/condiciones/{token}"):
        check("la landing pública resuelve a None", A._resolve_request_resource_key() is None)
    check("la landing está en las listas de públicos", "public_invitation_conditions" in A.PUBLIC_ENDPOINTS_EXTRA)
    lector = A.app.test_client()
    with lector.session_transaction() as ses:
        ses["user_id"] = uid
    # Quien NO gestiona invitaciones: un usuario sin rol de dirección ni permisos.
    s = A.db()
    try:
        u2 = s.query(User).filter(User.email == "nadie.invgen@prueba.local").first()
        if u2 is None:
            u2 = User(email="nadie.invgen@prueba.local", password_hash="x", role=1); s.add(u2); s.flush()
            s.add(UserProfile(user_id=u2.id, nick="nadieinvgen", departments=["Diseño"])); s.flush()
        u2.role = 1
        s.commit()
        u2id = str(u2.id)
    finally:
        s.close()
    cl2 = cliente(u2id)
    r = cl2.get(f"/invitaciones/evento/{cid}/generar")
    check("sin acceso a invitaciones no entra (403 o redirección de acceso)", r.status_code in (302, 403), r.status_code)

    print()
    print(f"OK: {OK} · FALLOS: {FALLOS}")
    return 0 if FALLOS == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
