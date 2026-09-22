#!/usr/bin/env python3
"""MODIFICAR LOS CARTELES DE UNA ACTIVIDAD · prueba de regresión (sep 2026).

Lo que pidió Dani, con la app REAL y su propia BD de prueba (`radiocartel`, que se RECREA en cada
pasada):

  1. **LOS NUESTROS** — desde la cartelería de la actividad se puede **solicitar una modificación**
     con una nota y **archivos** (un logo, una referencia): los carteles de antes se **archivan**,
     el encargo vuelve a **diseño** y queda pendiente volver a compartirlos;
  2. los carteles nuevos siguen su proceso de siempre (los dos vistos buenos) y, con los dos,
     **NO se mandan solos**: a quien gestiona la actividad le queda la **tarea de compartirlos con
     el artista y con el promotor**;
  3. al marcarlos como compartidos, esa tarea **se cierra sola**;
  4. **LOS DEL PROMOTOR** — se pueden **reemplazar**: al subir los nuevos se archivan los de antes
     y queda pendiente **avisar al artista**.

    /tmp/python/bin/python3 tools/check_carteleria_modificacion.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, io as _io

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_DSN = "postgresql://postgres@127.0.0.1:54329/radiocartel?sslmode=disable"
_BD = "radiocartel"
import psycopg2
_c = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname="postgres")
_c.autocommit = True
_cur = _c.cursor()
_cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (_BD,))
if not _cur.fetchone():
    _cur.execute("CREATE DATABASE %s ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0" % _BD)
    _c.close()
    _c2 = psycopg2.connect(host="127.0.0.1", port=54329, user="postgres", dbname=_BD)
    _c2.autocommit = True
    _c2.cursor().execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    _c2.close()
else:
    _c.close()
os.environ["DATABASE_URL"] = _DSN
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "t")
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / n).write_text("x")

import models
models.Base.metadata.drop_all(models.engine)
models.Base.metadata.create_all(models.engine)
import app as A

A.app.config["WTF_CSRF_ENABLED"] = False
# ⚠️ Sin Storage: se devuelve una URL de mentira (lo que se prueba es el proceso, no la subida).
A.upload_image = lambda fs, folder, **kw: "https://x/%s" % (getattr(fs, "filename", "f") or "f")
A._upload_artwork_file = lambda fs: ("https://x/%s" % (getattr(fs, "filename", "f") or "f"),
                                     "image/png", "IMAGE")
# Los correos no salen: se escriben (es el patrón del arrancador local).
A._send_optional_email = lambda *a, **k: (True, None)
HOY = datetime.date.today()
OK, KO = [], []


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:220]) if (extra and not cond) else ""))


def png():
    return (_io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "cartel.png")


print("\n── 1. Semilla: actividad con promotor y sus carteles ──────────────────")
s = models.SessionLocal()
try:
    u = models.User(email="cartel@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Cartel", departments=["Contratación"]))
    emp = models.GroupCompany(name="33 Producciones")
    art = models.Artist(name="Los Ñus")
    ven = models.Venue(name="Sala Prueba", municipality="Sevilla", province="Sevilla")
    promo = models.Promoter(nick="Promotora Prueba", contact_email="promotor@ejemplo.com")
    s.add_all([emp, art, ven, promo]); s.flush()
    c = models.Concert(artist_id=art.id, venue_id=ven.id, promoter_id=promo.id,
                       date=HOY + datetime.timedelta(days=40), sale_type="VENDIDO",
                       capacity=500, activity_type="CONCIERTO", status="CONFIRMADO",
                       billing_company_id=emp.id)
    s.add(c); s.flush()
    req = models.ConcertArtworkRequest(concert_id=c.id, public_token="tok-cartel-1",
                                       handled_by="OURS", status="UPLOADED",
                                       requested_at=A._now_madrid(),
                                       shared_with_artist_at=A._now_madrid(),
                                       shared_with_promoter_at=A._now_madrid())
    s.add(req); s.flush()
    a1 = models.ConcertArtworkAsset(artwork_request_id=req.id, format_label="Cartel A4",
                                    file_url="https://x/a4.png", kind="IMAGE", category="POSTER",
                                    validation_status="APPROVED")
    s.add(a1)
    s.commit()
    UID, CID, RID, AID = str(u.id), str(c.id), str(req.id), str(art.id)
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10


def req_row():
    s = models.SessionLocal()
    try:
        return s.get(models.ConcertArtworkRequest, A.to_uuid(RID))
    finally:
        s.close()


def assets(archivados=None):
    s = models.SessionLocal()
    try:
        filas = (s.query(models.ConcertArtworkAsset)
                 .filter(models.ConcertArtworkAsset.artwork_request_id == A.to_uuid(RID)).all())
        if archivados is None:
            return filas
        return [a for a in filas if bool(a.is_archived) == archivados]
    finally:
        s.close()


print("\n── 2. LOS NUESTROS: se pide la modificación con sus archivos ──────────")
r = cli.post("/conciertos/%s/carteleria/modificar" % CID, data={
    "notes": "Cambiad el logo de la ticketera por el nuevo",
    "files": png(),
}, content_type="multipart/form-data", follow_redirects=True)
check("la petición se acepta (200)", r.status_code == 200, r.status_code)
row = req_row()
check("los carteles de antes quedan ARCHIVADOS", len(assets(archivados=True)) == 1,
      [(a.format_label, a.is_archived) for a in assets()])
check("el encargo vuelve a estar SOLICITADO", (row.status or "") == "REQUESTED", row.status)
check("queda apuntado qué se pidió", (row.change_notes or "").startswith("Cambiad el logo"), row.change_notes)
check("y quién lo pidió", (row.change_requested_by_nick or "") == "Cartel", row.change_requested_by_nick)
check("se guarda el archivo que se mandó", len(A.db().query(models.ConcertArtworkReference)
                                               .filter_by(artwork_request_id=A.to_uuid(RID)).all()) == 1)
check("⚠️ lo compartido se limpia (los carteles ya no son esos)",
      row.shared_with_artist_at is None and row.shared_with_promoter_at is None)
check("y queda pendiente volver a compartirlos", row.reshare_pending is True)
html = cli.get("/conciertos/%s?tab=carteleria" % CID).get_data(as_text=True)
check("la ficha lo dice", "Los carteles han cambiado" in html)
check("y enseña el archivo que se mandó", "Archivos para la modificación" in html)

print("\n── 3. Los carteles nuevos NO se mandan solos: se reclama compartirlos ──")
s = models.SessionLocal()
try:
    req = s.get(models.ConcertArtworkRequest, A.to_uuid(RID))
    nuevo = models.ConcertArtworkAsset(artwork_request_id=req.id, format_label="Cartel A4 v2",
                                       file_url="https://x/a4v2.png", kind="IMAGE",
                                       category="POSTER", validation_status="APPROVED")
    s.add(nuevo); s.commit()
    NUEVO = str(nuevo.id)
finally:
    s.close()
with A.app.test_request_context("/"):
    s = models.SessionLocal()
    try:
        c = s.get(models.Concert, A.to_uuid(CID))
        req = s.get(models.ConcertArtworkRequest, A.to_uuid(RID))
        A._artwork_review_after(s, c, req)
        s.commit()
        avisos = (s.query(models.AppNotification)
                  .filter(models.AppNotification.ref_type == "ARTWORK_SHARE").all())
        check("a quien gestiona la actividad le queda la tarea de compartirlos", len(avisos) >= 1,
              [(n.kind, n.title) for n in avisos])
        check("y dice que es con el artista y con el promotor",
              any("promotor" in (n.body or "") for n in avisos), [n.body for n in avisos])
        req = s.get(models.ConcertArtworkRequest, A.to_uuid(RID))
        check("⚠️ NO se han mandado solos al artista", req.shared_with_artist_at is None)
    finally:
        s.close()

print("\n── 4. Al compartirlos, la tarea se cierra sola ────────────────────────")
cli.post("/conciertos/%s/carteleria/compartido" % CID, data={"who": "artist", "ajax": "1"})
row = req_row()
check("queda marcado como compartido con el artista", row.shared_with_artist_at is not None)
check("y deja de estar pendiente", row.reshare_pending is False, row.reshare_pending)
s = models.SessionLocal()
try:
    vivos = [n for n in s.query(models.AppNotification)
             .filter(models.AppNotification.ref_type == "ARTWORK_SHARE").all()
             if not getattr(n, "read_at", None)]
    check("la tarea ya no está pendiente", not vivos, [(n.title, n.read_at) for n in vivos])
finally:
    s.close()

print("\n── 5. LOS DEL PROMOTOR: se REEMPLAZAN y hay que avisar al artista ─────")
s = models.SessionLocal()
try:
    req = s.get(models.ConcertArtworkRequest, A.to_uuid(RID))
    req.handled_by = "PROMOTER"
    req.status = "UPLOADED"
    req.reshare_pending = False
    req.shared_with_artist_at = A._now_madrid()
    s.commit()
finally:
    s.close()
vigentes_antes = len(assets(archivados=False))
r = cli.post("/conciertos/%s/carteleria/subir" % CID, data={
    "category": "POSTER", "replace": "1", "files": png(), "labels": "cartel nuevo.png",
}, content_type="multipart/form-data")
check("la subida va bien", r.status_code == 200 and (r.get_json() or {}).get("ok"), r.get_json())
row = req_row()
check("los de antes se ARCHIVAN", len(assets(archivados=False)) == 1,
      [(a.format_label, a.is_archived) for a in assets()])
check("⚠️ y hay que volver a avisar al artista", row.reshare_pending is True
      and row.shared_with_artist_at is None,
      (row.reshare_pending, row.shared_with_artist_at))

print("\n── 6. Sin carteles todavía, no se ofrece modificar ────────────────────")
html = cli.get("/conciertos/%s?tab=carteleria" % CID).get_data(as_text=True)
check("con los carteles del promotor se ofrece REEMPLAZAR", "Reemplazar carteles" in html)
# ⚠️ Lo que NO tiene que salir es el BOTÓN (el modal se pinta igual, oculto: abrirlo es lo que
# no se ofrece). Se mira el botón que lo abre, no el texto del modal.
check("y NO el botón de pedirle la modificación a diseño",
      'data-bs-target="#artworkChangeModal"' not in html)

print("\n════════════════════════════════════════════════════════════")
print("  %d comprobaciones OK · %d FALLAN" % (len(OK), len(KO)))
for k in KO:
    print("   ·", k)
print("════════════════════════════════════════════════════════════")
sys.exit(1 if KO else 0)
