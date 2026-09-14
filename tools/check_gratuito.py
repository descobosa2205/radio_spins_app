#!/usr/bin/env python3
"""LO GRATUITO NO TIENE SALIDA A LA VENTA · prueba de regresión.

En una actividad GRATUITA no hay entradas que vender, así que **no hay fecha de salida a la venta**:
ni se pregunta, ni se pinta, ni se comunica. Lo que se dice es que es gratuita, con su etiqueta y su
icono. Esto comprueba, contra la app REAL y la BD de PRUEBA, que eso se cumple de punta a punta:

  1. la CABECERA compartida (ficha, correos y formulario del promotor) dice «Entrada · Gratuita»;
  2. la FICHA no enseña «Salida a la venta» ni la etiqueta de venta, y su formulario no la pregunta;
  3. guardar «Datos» no deja un «por confirmar» fantasma, y pasar el acceso a gratuito LIMPIA la
     fecha, el TBC y la hora (y al volver a «venta de entradas» se puede poner otra vez);
  4. el AVISO AL ARTISTA (el módulo «El anuncio») dice que la entrada es gratuita en vez de una
     salida a la venta, y el SMS del día del anuncio no lleva enlace de venta;
  5. no reclama activar la venta ni comunicarla, ni siquiera si está mal apuntada (modo de entrada
     «venta» con el tipo GRATUITO: manda la etiqueta);
  6. al PROMOTOR no se le pregunta nada de ticketing en su ficha, y lo que ya tuviera guardado no se
     le devuelve a la actividad al revisarla;
  7. y una actividad que SÍ vende entradas sigue igual que siempre.

    /tmp/python/bin/python3 tools/check_gratuito.py

⚠️ Necesita el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
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
os.environ.setdefault("FLASK_SECRET_KEY", "check-gratuito")
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

    s = models.SessionLocal()
    suf = uuid.uuid4().hex[:6]
    hoy = datetime.date.today()
    fecha = hoy + datetime.timedelta(days=60)

    co = models.GroupCompany(name="33 G %s" % suf)
    art = models.Artist(name="Los Ñus G %s" % suf)
    ven = models.Venue(name="Sala G %s" % suf, municipality="Móstoles", province="Madrid")
    prom = models.Promoter(nick="Promotora G %s" % suf, contact_email="promotor+g%s@ejemplo.com" % suf)
    s.add_all([co, art, ven, prom])
    s.flush()

    yo = s.query(models.User).filter(models.User.email == "check_gratuito@33.es").first()
    if not yo:
        yo = models.User(email="check_gratuito@33.es", password_hash="x", role=10)
        s.add(yo)
        s.flush()
    yo.role = 10                       # ⚠️ el rol lo manda la BD, no la sesión

    def concierto(entry_mode, **kw):
        datos = dict(artist_id=art.id, venue_id=ven.id, promoter_id=prom.id, date=fecha,
                     activity_type="CONCIERTO", sale_type="VENDIDO", status="CONFIRMADO",
                     capacity=400, billing_company_id=co.id, group_company_id=co.id,
                     production_owner_user_id=yo.id,
                     ticketing_payload={"entry_mode": entry_mode, "ticket_types": []})
        datos.update(kw)
        c = models.Concert(**datos)
        s.add(c)
        s.flush()
        return c

    gratis = concierto("FREE", announcement_date=hoy + datetime.timedelta(days=3))
    vende = concierto("SALE", announcement_date=hoy + datetime.timedelta(days=3),
                      sale_start_date=hoy + datetime.timedelta(days=5), sale_start_time="12:00")
    # Mal apuntada a propósito: vende entradas Y está marcada como gratuita (lo de antes).
    raro = concierto("SALE", sale_type="GRATUITO")
    s.commit()
    gid, vid = str(gratis.id), str(vende.id)

    # ── 1 · LA CABECERA COMPARTIDA ─────────────────────────────────────────────────────────
    print("\n1 · La cabecera de la actividad (ficha, correos y formulario del promotor)")
    hg = A._contract_sheet_hero_rows(gratis)
    hv = A._contract_sheet_hero_rows(vende)
    comprueba("la gratuita dice «Entrada · Gratuita»",
              any(l == "Entrada" and v == A.CONCERT_FREE_ENTRY_LABEL for _i, l, v in hg), hg)
    comprueba("con el icono del regalo", any(i == "fa-gift" for i, _l, _v in hg), hg)
    comprueba("la que vende no lo dice", not any(l == "Entrada" for _i, l, _v in hv), hv)

    # ── 2 · LA FICHA ───────────────────────────────────────────────────────────────────────
    print("\n2 · La ficha de la actividad")
    cli = A.app.test_client()
    with cli.session_transaction() as ses:
        ses["user_id"] = str(yo.id)
        ses["role"] = 10

    hg = cli.get("/conciertos/%s?tab=general" % gid).get_data(as_text=True)
    hv = cli.get("/conciertos/%s?tab=general" % vid).get_data(as_text=True)
    comprueba("no enseña «Salida a la venta»", 'ficha-field__label">Salida a la venta' not in hg)
    comprueba("enseña la etiqueta «Gratuito»", "badge-gratuito" in hg)
    comprueba("no pinta la etiqueta de venta de la cabecera", "Venta: " not in hg)
    comprueba("el formulario de «Datos» no la pregunta", "data-sale-start-wrap" not in hg)
    # Lo único que queda es el panel de VENTA de «Entradas y venta», oculto hasta que se cambie
    # el acceso (y con sus campos deshabilitados: un campo oculto se envía igual).
    comprueba("solo queda el panel de venta, oculto", hg.count('name="sale_start_date"') == 1,
              hg.count('name="sale_start_date"'))
    comprueba("la que vende sí la enseña", 'ficha-field__label">Salida a la venta' in hv)
    comprueba("y la pregunta en «Datos»", "data-sale-start-wrap" in hv)
    comprueba("y pinta su etiqueta de venta", "Venta: " in hv)

    # ── 3 · GUARDAR NO INVENTA UNA VENTA ───────────────────────────────────────────────────
    print("\n3 · Guardar no inventa una salida a la venta")
    cli.post("/conciertos/%s/seccion/datos" % gid, data={
        "status": "CONFIRMADO", "activity_type": "CONCIERTO", "artist_id": str(art.id),
        "date": fecha.isoformat(), "venue_id": str(ven.id), "sale_type": "VENDIDO",
        "capacity": "400", "billing_company_id": str(co.id)})
    s.expire_all()
    comprueba("guardar «Datos» no deja un «por confirmar»",
              gratis.sale_start_date is None and not gratis.sale_start_tbc,
              "fecha=%s tbc=%s" % (gratis.sale_start_date, gratis.sale_start_tbc))
    cli.post("/conciertos/%s/salida-venta" % gid, data={"mode": "NOW"})
    s.expire_all()
    comprueba("el servidor rechaza sacarla a la venta", gratis.sale_start_date is None,
              gratis.sale_start_date)
    cli.post("/conciertos/%s/seccion/entradas" % vid,
             data={"entry_mode": "FREE", "free_capacity": "250"})
    s.expire_all()
    comprueba("pasar el acceso a gratuito limpia fecha, TBC y hora",
              vende.sale_start_date is None and not vende.sale_start_tbc
              and not (vende.sale_start_time or ""),
              "fecha=%s tbc=%s hora=%s" % (vende.sale_start_date, vende.sale_start_tbc,
                                           vende.sale_start_time))
    cli.post("/conciertos/%s/seccion/entradas" % vid, data={
        "entry_mode": "SALE", "sale_seller_kind": "US", "capacity": "500",
        "sale_start_date": (hoy + datetime.timedelta(days=5)).isoformat()})
    s.expire_all()
    comprueba("y al volver a «venta de entradas» se puede poner otra vez",
              vende.sale_start_date is not None, vende.sale_start_date)
    vende.sale_start_time = "12:00"
    s.commit()

    # ── 4 · EL AVISO AL ARTISTA ────────────────────────────────────────────────────────────
    print("\n4 · El aviso al artista y el SMS del día del anuncio")
    fg = [(f["label"], f["value"]) for f in A._activity_notice_announcement(gratis)["rows"]]
    fv = [(f["label"], f["value"]) for f in A._activity_notice_announcement(vende)["rows"]]
    comprueba("no anuncia ninguna salida a la venta",
              not any("venta" in l.lower() for l, _v in fg), fg)
    comprueba("dice que la entrada es gratuita", any(l == "Entrada" for l, _v in fg), fg)
    comprueba("sigue diciendo cuándo se anuncia", any(l == "Se anuncia" for l, _v in fg), fg)
    comprueba("la que vende sí dice la salida a la venta",
              any(l == "Salida a la venta" for l, _v in fv), fv)
    html_g = A._activity_notice_html(A._activity_notice_context(s, gratis, kind="ANUNCIO"))
    html_v = A._activity_notice_html(A._activity_notice_context(s, vende, kind="ANUNCIO"))
    comprueba("el correo de la gratuita no habla de salida a la venta",
              "Salida a la venta" not in html_g)
    comprueba("y dice «Gratuita»", A.CONCERT_FREE_ENTRY_LABEL in html_g)
    comprueba("el de la que vende sí lo dice", "Salida a la venta" in html_v)

    tk = s.query(models.Ticketer).filter(models.Ticketer.name == "Ticketera G %s" % suf).first()
    if not tk:
        tk = models.Ticketer(name="Ticketera G %s" % suf)
        s.add(tk)
        s.flush()
    s.add(models.ConcertTicketer(concert_id=gratis.id, ticketer_id=tk.id,
                                 sale_url="https://ticketera.example/%s" % suf))
    s.commit()
    s.expire_all()
    comprueba("el SMS del anuncio no lleva enlace de venta",
              A._announce_sale_url(gratis) == "", A._announce_sale_url(gratis))

    # ── 5 · NO RECLAMA TRABAJO DE VENTA ────────────────────────────────────────────────────
    print("\n5 · No reclama sacarla a la venta ni comunicarla")
    comprueba("la gratuita no lo reclama", A._concert_sale_state(s, gratis)["applies"] is False)
    comprueba("una mal apuntada (venta + tipo GRATUITO) tampoco",
              A._concert_sale_state(s, raro)["applies"] is False)
    comprueba("la que vende sí lo reclama", A._concert_sale_state(s, vende)["applies"] is True)

    # ── 6 · EL FORMULARIO DEL PROMOTOR ─────────────────────────────────────────────────────
    print("\n6 · Al promotor no se le pregunta nada de ticketing")
    for c in (gratis, vende):
        A._ensure_internal_contract_sheet(s, c)
    s.commit()
    pg = cli.get("/ficha-contratacion/%s" % gratis.contract_sheet.public_token).get_data(as_text=True)
    pv = cli.get("/ficha-contratacion/%s" % vende.contract_sheet.public_token).get_data(as_text=True)
    comprueba("se le dice que es gratuita", "Actividad gratuita" in pg)
    comprueba("el bloque de ticketing va oculto", 'id="cshTicketingBox" class="d-none"' in pg)
    comprueba("y su JS lo sabe (marque el tipo que marque)", "var FREE_ACTIVITY = true" in pg)
    comprueba("a la que vende sí se le pregunta",
              'name="promotion_sale_date"' in pv and "var FREE_ACTIVITY = false" in pv)
    # Y si su ficha ya traía una fecha (de antes), al revisarla no se le devuelve a la actividad.
    entrante = {"promotion_sale_date": (hoy + datetime.timedelta(days=10)).isoformat()}
    vende.sale_start_date = None
    s.commit()
    auto_g, _ = A._prepare_contract_sheet_merge(gratis, entrante)
    auto_v, _ = A._prepare_contract_sheet_merge(vende, entrante)
    comprueba("revisar su ficha no le devuelve la fecha de venta",
              not any(x["field"] == "sale_start_date" for x in auto_g), auto_g)
    comprueba("a la que vende sí se la propone",
              any(x["field"] == "sale_start_date" for x in auto_v), auto_v)

    # ── 7 · PRUEBA DE HUMO: TODAS LAS PESTAÑAS ─────────────────────────────────────────────
    print("\n7 · Las dos fichas enteras, pestaña a pestaña")
    for cid, quien in ((gid, "gratuita"), (vid, "con venta")):
        malas = [t for t in ("inicio", "general", "actividad", "produccion", "ticketing",
                             "invitaciones", "carteleria", "repertorio", "resultado", "fotos",
                             "documentos", "promocion")
                 if cli.get("/conciertos/%s?tab=%s" % (cid, t)).status_code != 200]
        comprueba("las 12 pestañas de la %s abren" % quien, not malas, malas)
    comprueba("el PDF de la ficha de la gratuita sale",
              cli.get("/conciertos/%s/ficha-contratacion/pdf" % gid).status_code == 200)

    s.close()
    print("\n%d bien · %d mal" % (len(OK), len(KO)))
    if KO:
        for k in KO:
            print("   ✗ " + k)
        print("FALLA · lo gratuito sigue enseñando algo de la salida a la venta")
        return 1
    print("OK · en lo gratuito no aparece nada de la salida a la venta")
    return 0


if __name__ == "__main__":
    sys.exit(main())
