#!/usr/bin/env python3
"""UN CAMBIO EN UNA ACTIVIDAD SE VE Y SE ACEPTA · prueba de regresión (sep 2026).

Lo pidió Dani: «cuando se notifica que ha habido un cambio en una actividad, tiene que aparecer al
lado de la información correcta una etiqueta amarilla de Cambio · Antes: xxx —por ejemplo un cambio
de fecha—, para que el artista sepa fácilmente lo que hay, y los botones para que lo confirme; en el
caso de cambio la confirmación aparecerá en amarillo: Artista: pendiente de aceptar cambios. Y así
nos garantizamos que los artistas aprueben los cambios».

Con la app REAL y su propia BD (`radiocambios`, que se RECREA en cada pasada):

  1. el primer aviso guarda LO QUE DECÍA la actividad (fecha, hora, recinto, caché);
  2. al cambiar la fecha, el aviso de CAMBIOS pinta **Cambio · Antes: <la fecha vieja>** pegado al
     dato, y solo en lo que ha cambiado (lo que sigue igual NO se marca);
  3. lo mismo con el RECINTO y con el CACHÉ;
  4. el aviso de cambios **pide respuesta**: la página pública trae los botones y preguntan por los
     CAMBIOS, no por la actividad;
  5. mientras no conteste, la ficha enseña **«Artista: pendiente de aceptar cambios»** en amarillo
     —y se come el «Artista OK» verde, aunque lo hubiera confirmado antes—;
  6. cuando acepta, vuelve el «Artista OK» (con «Aceptó los cambios el …» en el tooltip);
  7. y si NO los acepta, se dice en rojo y queda su motivo.

    /tmp/python/bin/python3 tools/check_aviso_cambios.py

⚠️ Requiere el entorno de /tmp que describe CLAUDE.md. Es IDEMPOTENTE: recrea su base al empezar.
"""
import os, sys, tempfile, pathlib, datetime, re

os.chdir("/Users/carlos/Documents/radio_spins_app")
sys.path.insert(0, "/Users/carlos/Documents/radio_spins_app")
_BD = "radiocambios"
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
os.environ["DATABASE_URL"] = "postgresql://postgres@127.0.0.1:54329/%s?sslmode=disable" % _BD
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
# El correo no sale de aquí: lo que se prueba es lo que se compone y lo que queda apuntado.
A._send_optional_email = lambda *a, **k: (True, "")
OK, KO = [], []
HOY = datetime.date.today()
F1 = HOY + datetime.timedelta(days=60)
F2 = HOY + datetime.timedelta(days=75)


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  ok  " if cond else "  FALLA  ") + nombre + ((" → " + str(extra)[:260]) if (extra and not cond) else ""))


print("\n── 1. Semilla: una actividad con fecha, recinto y caché ───────────────")
s = models.SessionLocal()
try:
    u = models.User(email="cam@33producciones.es", password_hash="x", role=10)
    s.add(u); s.flush()
    s.add(models.UserProfile(user_id=u.id, nick="Cam"))
    emp = models.GroupCompany(name="33 Producciones")
    art = models.Artist(name="El Ñu", photo_url="")
    v1 = models.Venue(name="Sala Vieja", municipality="Madrid")
    v2 = models.Venue(name="Sala Nueva", municipality="Madrid")
    s.add_all([emp, art, v1, v2]); s.flush()
    c = models.Concert(artist_id=art.id, venue_id=v1.id, date=F1, status="CONFIRMADO",
                       activity_type="CONCIERTO", sale_type="EMPRESA", capacity=500,
                       group_company_id=emp.id, created_by_user_id=u.id, show_time="21:00")
    s.add(c); s.flush()
    s.add(models.ConcertCache(concert_id=c.id, kind="FIXED", amount=5000))
    UID, CID, V2 = str(u.id), str(c.id), str(v2.id)
    s.commit()
finally:
    s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = UID
    ses["role"] = 10


def avisar(kind, **extra):
    datos = {"kind": kind, "channel": "EMAIL", "note": "", "emails": "artista@ejemplo.com"}
    datos.update(extra)
    return cli.post("/conciertos/%s/avisar-artista" % CID, data=datos, follow_redirects=True)


def ultimo(kind=None):
    s = models.SessionLocal()
    try:
        q = s.query(models.ConcertArtistNotification).filter(
            models.ConcertArtistNotification.concert_id == A.to_uuid(CID))
        if kind:
            q = q.filter(models.ConcertArtistNotification.kind == kind)
        fila = q.order_by(models.ConcertArtistNotification.sent_at.desc()).first()
        if fila is None:
            return None
        return {"id": str(fila.id), "kind": fila.kind, "facts": dict(fila.facts or {}),
                "html": ((fila.snapshot or {}).get("html") or ""), "token": fila.public_token,
                "response": fila.response}
    finally:
        s.close()


r = avisar("CONFIRMAR")
a1 = ultimo()
check("el primer aviso se manda", a1 is not None and a1["kind"] == "CONFIRMAR", r.status_code)
check("⚠️ y guarda lo que decía la actividad", bool(a1 and a1["facts"]), (a1 or {}).get("facts"))
# ⚠️ La fecha que sale de casa va en LARGO y con su día de la semana («Sábado 21 de Noviembre de
# 2026», la regla de la casa), no en 21/11/2026: es lo primero que mira quien lo recibe.
F1_LARGA = A.format_date_long_es(F1)
check("con su fecha (en el formato que sale de casa)",
      any(F1_LARGA in v for v in (a1 or {})["facts"].values()), (a1 or {}).get("facts"))

print("\n── 2. Se cambia la FECHA: el aviso lo dice con «Antes: …» ─────────────")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    c.date = F2
    s.commit()
finally:
    s.close()
avisar("CAMBIOS")
a2 = ultimo("CAMBIOS")
html = (a2 or {})["html"]
check("el aviso de cambios se manda", a2 is not None)
check("⚠️ lleva la etiqueta del cambio", "CAMBIO · Antes:" in html, html[:200])
check("⚠️ y dice la fecha que había antes",
      (F1_LARGA in html.split("CAMBIO · Antes:")[1][:120]) if "CAMBIO · Antes:" in html else False,
      (html.split("CAMBIO · Antes:")[1][:120] if "CAMBIO · Antes:" in html else ""))
check("la etiqueta va en AMARILLO", "#fff8d6" in html and "#e0b400" in html)
check("y solo se marca LO QUE HA CAMBIADO", html.count("CAMBIO · Antes:") == 1, html.count("CAMBIO · Antes:"))

print("\n── 3. El RECINTO y el CACHÉ también ───────────────────────────────────")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    c.venue_id = A.to_uuid(V2)
    for ch in (c.caches or []):
        ch.amount = 7000
    s.commit()
finally:
    s.close()
avisar("CAMBIOS")
html3 = (ultimo("CAMBIOS") or {})["html"]
check("el recinto viejo sale como «antes»", "Sala Vieja" in html3, html3.count("Sala Vieja"))
check("y el caché viejo también", "5.000" in html3, [x for x in re.findall(r"Antes: [^<]{0,24}", html3)])
check("son DOS cambios (recinto y caché), no más", html3.count("CAMBIO · Antes:") == 2,
      re.findall(r"CAMBIO · Antes: [^<]{0,30}", html3))

print("\n── 4. El aviso de cambios PIDE RESPUESTA ──────────────────────────────")
tok = (ultimo("CAMBIOS") or {})["token"]
pub = cli.get("/actividad/%s" % tok).get_data(as_text=True)
check("la página pública abre", "an-ask" in pub or "Aceptas los cambios" in pub)
check("⚠️ pregunta por los CAMBIOS", "¿Aceptas los cambios?" in pub, pub[pub.find("an-ask__title"):][:120])
check("con su botón de aceptar", "Acepto los cambios" in pub)
check("y el de no aceptarlos", "No los acepto" in pub)

print("\n── 5. Mientras no conteste: «pendiente de aceptar cambios» ────────────")
ficha = cli.get("/conciertos/%s?tab=general" % CID).get_data(as_text=True)
check("⚠️ la ficha lo dice en amarillo", "Artista: pendiente de aceptar cambios" in ficha)
check("y NO sale el «Artista OK» verde", "Artista OK" not in ficha)
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    with A.app.test_request_context("/"):
        estado = A._concert_artist_ok(A._artist_confirmation_state(s, c),
                                      A._concert_peticion_phases(s, c),
                                      A._artist_changes_state(s, c))
    check("el punto único lo dice", estado["pending_changes"] and not estado["ok"], estado)
finally:
    s.close()

print("\n── 6. Cuando ACEPTA, vuelve el «Artista OK» ───────────────────────────")
cli.post("/actividad/%s/responder" % tok, data={"answer": "OK"}, follow_redirects=True)
ficha2 = cli.get("/conciertos/%s?tab=general" % CID).get_data(as_text=True)
check("ya no está pendiente", "pendiente de aceptar cambios" not in ficha2)
check("⚠️ y sale «Artista OK»", "Artista OK" in ficha2)
check("con el detalle en el tooltip", "Aceptó los cambios" in ficha2, ficha2[ficha2.find("Artista OK") - 260:ficha2.find("Artista OK")])

print("\n── 7. Si NO los acepta, se dice (y queda el motivo) ───────────────────")
s = models.SessionLocal()
try:
    c = s.get(models.Concert, A.to_uuid(CID))
    c.date = F1
    s.commit()
finally:
    s.close()
avisar("CAMBIOS")
tok2 = (ultimo("CAMBIOS") or {})["token"]
cli.post("/actividad/%s/responder" % tok2, data={"answer": "NO", "note": "Ese día tengo otra fecha"},
         follow_redirects=True)
ficha3 = cli.get("/conciertos/%s?tab=general" % CID).get_data(as_text=True)
check("⚠️ la ficha dice que NO los acepta", "El artista no acepta los cambios" in ficha3)
check("con su motivo", "Ese día tengo otra fecha" in ficha3)
check("y tampoco sale el «Artista OK»", "Artista OK" not in ficha3)

print("\n═══════════════════════════════════════════════════════════════════════")
print("  %d bien · %d mal" % (len(OK), len(KO)))
if KO:
    print("  Falla: " + " · ".join(KO))
sys.exit(1 if KO else 0)
