#!/usr/bin/env python3
"""EL ANUNCIO DE SOLD OUT · prueba de regresión.

Comprueba, contra la app REAL y la BD de PRUEBA, el proceso entero:

  1. al marcarla AGOTADA se avisa en casa: a contratación, a quien la PRODUCE y a la persona del
     SELLO que lleva a ese artista;
  2. queda la TAREA de comunicárselo al artista, en la actividad y en Contratación, y está
     **BLOQUEADA mientras no haya cartel de Sold Out** (sin cartel no hay nada que publicar);
  3. el CORREO: título «Anuncio de Sold Out», la etiqueta SOLD OUT en la cabecera a la derecha, el
     texto de la casa (editable) y el botón «Descargar carteles de Sold Out» fuera y a la derecha,
     que lleva a la página de cartelería con los SUYOS (`?cat=SOLDOUT`);
  4. al mandarlo, el proceso se cierra y **a REDES le entra su tarea** de publicarlo, que marca
     hecha él mismo y ahí se acaba;
  5. y que solo se reclama lo de **esta semana en adelante** (`SOLDOUT_TASK_BACKFILL_DAYS`).

    /tmp/python/bin/python3 tools/check_soldout.py

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
os.environ.setdefault("FLASK_SECRET_KEY", "check-soldout")
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
    fecha = hoy + datetime.timedelta(days=40)

    co = models.GroupCompany(name="33 P %s" % suf, logo_url="https://x/logo.png")
    art = models.Artist(name="Los Ñus %s" % suf, photo_url="https://x/foto.jpg")
    ven = models.Venue(name="Sala %s" % suf, municipality="Móstoles", province="Madrid")
    prom = models.Promoter(nick="Promotora %s" % suf, contact_email="promotor+%s@ejemplo.com" % suf)
    s.add_all([co, art, ven, prom])
    s.flush()
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

    yo = usuario("check_soldout@33.es", 10)
    prod = usuario("check_soldout_prod@33.es", 5)      # quien la produce

    def concierto(**kw):
        datos = dict(artist_id=art.id, venue_id=ven.id, promoter_id=prom.id, date=fecha,
                     activity_type="CONCIERTO", sale_type="VENDIDO", status="CONFIRMADO",
                     capacity=500, billing_company_id=co.id, show_time="21:00",
                     created_by_user_id=yo.id, production_owner_user_id=prod.id)
        datos.update(kw)
        c = models.Concert(**datos)
        s.add(c)
        s.flush()
        return c

    c = concierto()
    s.commit()
    cid = str(c.id)

    correos, smss = [], []
    A._send_optional_email = lambda to, subject, html, **kw: (correos.append((to, subject, html)) or (True, None))
    A._send_optional_sms = lambda ses, to, text, **kw: (smss.append((to, text)) or (True, None))

    cli = A.app.test_client()
    with cli.session_transaction() as ses:
        ses["user_id"] = str(yo.id)
        ses["role"] = 10

    # ── 1 · SE MARCA AGOTADA: SE AVISA EN CASA ─────────────────────────────────────────────
    print("\n1 · Se agota: se avisa en casa")
    c.sold_out = True
    s.commit()
    with A.app.test_request_context():
        res = A._soldout_declare(s, c, by_nick="dani")
    comprueba("se declara el Sold Out", not res["ya_estaba"], res)
    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("queda sellado (es idempotente)", c.soldout_declared_at is not None)
    with A.app.test_request_context():
        otra = A._soldout_declare(s, c, by_nick="dani")
    comprueba("declararlo dos veces NO vuelve a avisar", otra["ya_estaba"])

    avisos = (s.query(models.AppNotification)
              .filter(models.AppNotification.ref_type == "SOLDOUT_DONE",
                      models.AppNotification.ref_id == cid).all())
    destinos = {str(a.user_id) for a in avisos}
    comprueba("se avisa a quien la PRODUCE", str(prod.id) in destinos, destinos)
    comprueba("y el aviso dice que ya se puede comunicar al artista",
              any("comunicar al artista" in (a.body or "") for a in avisos))
    with A.app.test_request_context():
        aquienes = A._soldout_house_user_ids(s, c)
    comprueba("el punto único de a quién se avisa los trae", str(prod.id) in aquienes, aquienes)

    # ── 2 · LA TAREA, BLOQUEADA SIN CARTEL ────────────────────────────────────────────────
    print("\n2 · La tarea de comunicárselo al artista")
    with A.app.test_request_context():
        est = A._soldout_notice_pending(s, c)
    comprueba("queda pendiente", est["pending"])
    comprueba("y BLOQUEADA porque no hay cartel de Sold Out", est["blocked"], est)
    comprueba("y se dice por qué", "cartel de Sold Out" in est["blocked_reason"], est["blocked_reason"])

    tablero = cli.get("/conciertos/%s?tab=inicio" % cid).get_data(as_text=True)
    comprueba("sale en el proceso de la actividad",
              "Sold Out · comunicárselo al artista" in tablero)
    comprueba("marcada como bloqueada", "Falta el cartel de Sold Out" in tablero)

    # Sin cartel, a Contratación NO se le reclama (no podría hacerla).
    with A.app.test_request_context():
        A.g.pop("_contracting_tasks_cache", None)
        datos_t = A._contracting_tasks_data()
    filas = [f for t in datos_t["tasks"].values() for f in t if str(f.get("id") or "") == cid]
    kinds = {k["kind"] for f in filas for k in (f.get("tasks") or [])}
    comprueba("sin cartel, a Contratación no se le reclama", "SOLDOUT_NOTICE" not in kinds, kinds)

    # Se sube el cartel de Sold Out.
    # ⚠️ La solicitud YA existe: al declarar el Sold Out se le piden a diseño los carteles urgentes
    # (`_soldout_artwork_urgent`), y `ConcertArtworkRequest` es UNA por actividad.
    req = s.query(models.ConcertArtworkRequest).filter_by(concert_id=c.id).first()
    comprueba("al agotarse, los carteles se le piden solos a diseño", req is not None)
    if req is None:
        req = models.ConcertArtworkRequest(concert_id=c.id, public_token=uuid.uuid4().hex,
                                           status="REQUESTED", handled_by="DESIGN")
        s.add(req)
        s.flush()
    s.add(models.ConcertArtworkAsset(
        artwork_request_id=req.id, format_label="Historia 9:16", file_url="https://x/so.jpg",
        category="SOLDOUT", validation_status="APPROVED"))
    s.commit()
    s.expire_all()
    c = s.get(models.Concert, c.id)
    with A.app.test_request_context():
        est = A._soldout_notice_pending(s, c)
    comprueba("con el cartel subido, la tarea se DESBLOQUEA", est["pending"] and not est["blocked"], est)

    with A.app.test_request_context():
        A.g.pop("_contracting_tasks_cache", None)
        datos_t = A._contracting_tasks_data()
    filas = [f for t in datos_t["tasks"].values() for f in t if str(f.get("id") or "") == cid]
    kinds = {k["kind"] for f in filas for k in (f.get("tasks") or [])}
    comprueba("y ahora SÍ se le reclama a Contratación", "SOLDOUT_NOTICE" in kinds, kinds)

    # ── 3 · EL CORREO ──────────────────────────────────────────────────────────────────────
    print("\n3 · El correo")
    pantalla = cli.get("/conciertos/%s/avisar-artista?kind=SOLDOUT" % cid).get_data(as_text=True)
    comprueba("la pantalla abre", "Avisar al artista" in pantalla, pantalla[:200])
    comprueba("el TEXTO sale escrito y editable",
              "ya puedes publicar el Sold Out" in pantalla and "data-an-note" in pantalla)
    comprueba("dice de qué actividad es",
              "el concierto de Móstoles está agotado" in pantalla, pantalla[:200])
    # ⚠️ Y la PRIMERA vista previa ya lo enseña: sin esto, el cuadro de la izquierda decía una cosa
    # y el correo de la derecha otra hasta que alguien tecleaba algo (bug real).
    comprueba("y la vista previa ya sale con ese texto",
              pantalla.count("ya puedes publicar el Sold Out") >= 2,
              pantalla.count("ya puedes publicar el Sold Out"))

    d = cli.post("/conciertos/%s/avisar-artista/vista-previa" % cid, json={
        "note": A._soldout_notice_note(c), "hidden": [], "kind": "SOLDOUT"}).get_json() or {}
    cuerpo = d.get("html") or ""
    comprueba("la previa se compone", bool(d.get("ok")), d.get("error"))
    comprueba("título «Anuncio de Sold Out»", "Anuncio de Sold Out" in cuerpo, cuerpo[:200])
    comprueba("la ETIQUETA SOLD OUT va en la cabecera", "SOLD OUT<" in cuerpo.replace("</span>", "<"),
              cuerpo[:200])
    comprueba("el texto va JUSTIFICADO", "text-align:justify" in cuerpo)
    comprueba("el botón dice «Descargar carteles de Sold Out»",
              "Descargar carteles de Sold Out" in cuerpo)
    comprueba("y lleva a los carteles de SOLD OUT", "cat=SOLDOUT" in cuerpo, cuerpo[:200])
    comprueba("el botón NO se repite dentro del módulo",
              cuerpo.count("Descargar la cartelería") == 0, cuerpo.count("Descargar la cartelería"))
    # ⚠️ Un aviso normal NO lleva ni etiqueta ni ese botón.
    d2 = cli.post("/conciertos/%s/avisar-artista/vista-previa" % cid, json={
        "note": "", "hidden": [], "kind": "CONFIRMACION"}).get_json() or {}
    comprueba("un aviso normal no lleva la etiqueta ni el botón",
              "SOLD OUT" not in (d2.get("html") or "")
              and "Descargar carteles de Sold Out" not in (d2.get("html") or ""))

    # ── 4 · AL MANDARLO: SE CIERRA Y LE ENTRA A REDES ──────────────────────────────────────
    print("\n4 · Se manda: se cierra el proceso y le entra a redes")
    # Alguien en «Redes sociales», para que la tarea tenga dueño.
    digital = usuario("check_soldout_redes@33.es", 5)
    perfil = s.query(models.UserProfile).filter_by(user_id=digital.id).first()
    if not perfil:
        perfil = models.UserProfile(user_id=digital.id, nick="redes_%s" % suf)
        s.add(perfil)
    # ⚠️ Es `departments` (una LISTA): el departamento se compara con `_profile_in_department`.
    perfil.departments = [A.DIGITAL_DEPARTMENT]
    s.commit()

    correos.clear()
    r = cli.post("/conciertos/%s/avisar-artista" % cid, json={
        "channel": "EMAIL", "kind": "SOLDOUT", "note": A._soldout_notice_note(c),
        "hidden": []}).get_json() or {}
    comprueba("se manda", bool(r.get("ok")) and r.get("sent"), r.get("error"))
    comprueba("y dice que era el Sold Out", bool(r.get("soldout")), r)
    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("el proceso queda CERRADO", c.soldout_notified_at is not None)
    with A.app.test_request_context():
        comprueba("y la tarea desaparece sola", not A._soldout_notice_pending(s, c)["pending"])

    comprueba("a REDES le entra su tarea", A._digital_task_pending(c, "soldout"),
              A._digital_task(c, "soldout"))
    comprueba("y se le manda EL MISMO correo que al artista",
              any("Anuncio de Sold Out" in (x[1] or "") for x in correos), [x[1] for x in correos])
    tarea_redes = (s.query(models.AppNotification)
                   .filter(models.AppNotification.user_id == digital.id).all())
    comprueba("con su aviso en la app",
              any("Sold Out" in (a.title or "") + (a.body or "") for a in tarea_redes),
              [a.title for a in tarea_redes])

    # Redes la marca hecha y ahí se acaba.
    cli_r = A.app.test_client()
    with cli_r.session_transaction() as ses:
        ses["user_id"] = str(digital.id)
        ses["role"] = 5
    cli_r.post("/conciertos/%s/digital/soldout/hecho" % cid, follow_redirects=True)
    s.expire_all()
    c = s.get(models.Concert, c.id)
    comprueba("redes la marca HECHA y la alerta se cierra",
              not A._digital_task_pending(c, "soldout"), A._digital_task(c, "soldout"))

    # ── 5 · SOLO LO DE ESTA SEMANA ─────────────────────────────────────────────────────────
    print("\n5 · Solo los Sold Out de esta semana en adelante")
    viejo = concierto()
    viejo.sold_out = True
    viejo.soldout_declared_at = A._now_madrid() - datetime.timedelta(days=30)
    s.commit()
    with A.app.test_request_context():
        comprueba("uno de hace un mes NO se reclama",
                  not A._soldout_notice_pending(s, viejo)["pending"])
    reciente = concierto()
    reciente.sold_out = True
    reciente.soldout_declared_at = A._now_madrid() - datetime.timedelta(days=3)
    s.commit()
    with A.app.test_request_context():
        comprueba("uno de hace tres días SÍ (lo pidió Dani: «los de esta semana»)",
                  A._soldout_notice_pending(s, reciente)["pending"])
    sin_sellar = concierto()
    sin_sellar.sold_out = True
    s.commit()
    with A.app.test_request_context():
        comprueba("uno sin fecha de declaración (de antes de esto) no se reclama",
                  not A._soldout_notice_pending(s, sin_sellar)["pending"])
    no_agotada = concierto()
    s.commit()
    with A.app.test_request_context():
        comprueba("y una que no está agotada, tampoco",
                  not A._soldout_notice_pending(s, no_agotada)["pending"])

    s.close()
    print("\n%d OK · %d fallan" % (len(OK), len(KO)))
    if KO:
        print("\nLo que falla:")
        for k in KO:
            print("  · " + k)
    return 1 if KO else 0


if __name__ == "__main__":
    sys.exit(main())
