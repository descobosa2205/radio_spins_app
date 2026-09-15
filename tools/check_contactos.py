#!/usr/bin/env python3
"""CONTACTOS DE UNA ACTIVIDAD · prueba de regresión.

Lo que ya se configuró para un promotor (o para el MEDIO que hace de promotor) sale YA PUESTO en
cada función, y se quita con su «x». Esto comprueba, contra la app REAL y la BD de PRUEBA, que:

  1. un promotor puede tener VARIAS personas en una función, y la API del asistente las devuelve
     todas (`api_promoter_default_contacts`);
  2. una actividad de ese promotor las enseña YA PUESTAS, marcadas como heredadas, sin haber
     escrito nada en la actividad;
  3. quitar a una heredada con la «x» funciona: se materializa la lista y esa persona NO vuelve;
  4. quitarlas TODAS deja la función vacía de verdad (el centinela `contacts_own`), que es lo que
     antes hacía que la «x» pareciera rota;
  5. lo puesto A MANO manda: no lo pisa lo del promotor;
  6. el ALTA guarda lo elegido en el asistente (`ac_pick_<ROL>[]`) y lo deja como lo de por defecto
     del promotor, para que la siguiente actividad ya salga con esa gente;
  7. «Otras personas de contacto» es la quinta función del módulo, pero NO se hereda ni se propaga
     (es el cajón de esa actividad);
  8. en una actividad GRATUITA no hay función de Ticketing.

    /tmp/python/bin/python3 tools/check_contactos.py

⚠️ Necesita el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
Crea sus propios datos, así que se puede repetir. Sale con código 1 si algo falla.
"""
import datetime
import json
import os
import pathlib
import sys
import tempfile
import uuid as _u

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / n).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-contactos")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import models                                        # noqa: E402
import app as A                                      # noqa: E402
from werkzeug.datastructures import MultiDict        # noqa: E402

A.app.config["WTF_CSRF_ENABLED"] = False
OK, KO = [], []


def check(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  OK    " if cond else "  FALLA ") + nombre
          + ((" · " + str(extra)[:220]) if (extra and not cond) else ""))


suf = _u.uuid4().hex[:6]
s = A.db()
prof = s.query(models.UserProfile).filter(models.UserProfile.nick == "Escobosa").first()
art = s.query(models.Artist).order_by(models.Artist.name).first()
ven = s.query(models.Venue).first()
co = s.query(models.GroupCompany).first()

promotor = models.Promoter(nick="Promotora contactos %s" % suf, kind="empresa",
                           contact_email="prom+%s@x.local" % suf, contact_phone="+34600100200")
s.add(promotor)
s.flush()
p1 = models.PromoterContact(promoter_id=promotor.id, title="Producción", first_name="Pepa",
                            last_name="Montaje", email="pepa+%s@x.local" % suf, phone="+34600100201")
p2 = models.PromoterContact(promoter_id=promotor.id, title="Taquilla", first_name="Luis",
                            last_name="Taquilla", email="luis+%s@x.local" % suf, phone="+34600100202")
s.add(p1); s.add(p2); s.flush()
A._promoter_default_contact_set_list(promotor, "PRODUCCION", [
    {"kind": "CONTACT", "contact_id": str(p1.id), "name": "Pepa Montaje"},
    {"kind": "CONTACT", "contact_id": str(p2.id), "name": "Luis Taquilla"}])
A._promoter_default_contact_set_list(promotor, "TICKETING", [
    {"kind": "CONTACT", "contact_id": str(p2.id), "name": "Luis Taquilla"}])
s.commit()
pro_id, p1_id, p2_id = promotor.id, str(p1.id), str(p2.id)
s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"] = str(prof.user_id); ses["role"] = 10; ses["nick"] = prof.nick

print("\n1 · Un promotor con VARIAS personas en una función")
d = cli.get("/api/terceros/contactos-defecto?promoter_id=%s" % pro_id).get_json() or {}
gente = (d.get("people") or {})
check("la API devuelve las DOS de Producción, con sus datos",
      len(gente.get("PRODUCCION") or []) == 2
      and {x["name"] for x in gente["PRODUCCION"]} == {"Pepa Montaje", "Luis Taquilla"}, str(gente)[:220])
check("y cada una trae lo que se guarda (`pick`)",
      all(x.get("pick", {}).get("contact_id") for x in gente.get("PRODUCCION") or []), str(gente)[:220])
check("`rows` (una por función) sigue existiendo para lo que lo lea así",
      (d.get("rows") or {}).get("PRODUCCION", {}).get("name") == "Pepa Montaje", str(d.get("rows"))[:160])

print("\n2 · Una actividad de ese promotor las enseña YA PUESTAS")
s = A.db()
c = models.Concert(artist_id=art.id, promoter_id=pro_id, venue_id=ven.id, sale_type="VENDIDO",
                   date=datetime.date.today() + datetime.timedelta(days=60), status="BORRADOR",
                   activity_type="CONCIERTO", billing_company_id=co.id, capacity=0)
s.add(c); s.commit()
cid = c.id
filas = {f["role"]: f for f in A._activity_contacts_context(s, c)}
check("Producción sale con las dos personas del promotor",
      [p["name"] for p in filas["PRODUCCION"]["people"]] == ["Pepa Montaje", "Luis Taquilla"],
      str(filas["PRODUCCION"]["people"])[:200])
check("y se dice que vienen del promotor (heredadas)", filas["PRODUCCION"]["inherited"] is True)
check("sin haber escrito NADA en la actividad", not A._activity_contact_list(c, "PRODUCCION"),
      str(A._activity_contact_list(c, "PRODUCCION"))[:160])
s.close()

print("\n3 · Quitar a una heredada con la «x»")
cli.post("/conciertos/%s/seccion/contactos" % cid,
         data={"cc_action": "remove", "cc_role": "PRODUCCION", "cc_key": p1_id})
s = A.db()
c = s.get(models.Concert, cid)
filas = {f["role"]: f for f in A._activity_contacts_context(s, c)}
check("Pepa se va y Luis se queda",
      [p["name"] for p in filas["PRODUCCION"]["people"]] == ["Luis Taquilla"],
      str(filas["PRODUCCION"]["people"])[:200])
check("y ya no es heredada: la manda la actividad", filas["PRODUCCION"]["inherited"] is False)
s.close()

print("\n4 · Quitarlas TODAS deja la función vacía de verdad")
cli.post("/conciertos/%s/seccion/contactos" % cid,
         data={"cc_action": "remove", "cc_role": "PRODUCCION", "cc_key": p2_id})
s = A.db()
c = s.get(models.Concert, cid)
filas = {f["role"]: f for f in A._activity_contacts_context(s, c)}
check("Producción se queda SIN NADIE (y no vuelve a heredar)", filas["PRODUCCION"]["people"] == [],
      str(filas["PRODUCCION"]["people"])[:200])
check("la función queda marcada como decidida", "PRODUCCION" in A._activity_contacts_decided(c))
check("Ticketing, que no se ha tocado, sigue heredando a Luis",
      [p["name"] for p in filas["TICKETING"]["people"]] == ["Luis Taquilla"],
      str(filas["TICKETING"]["people"])[:200])
s.close()

print("\n5 · Lo puesto A MANO manda")
cli.post("/conciertos/%s/seccion/contactos" % cid,
         data={"cc_action": "add", "cc_role": "TICKETING", "cc_contact_id": p1_id})
s = A.db()
c = s.get(models.Concert, cid)
filas = {f["role"]: f for f in A._activity_contacts_context(s, c)}
check("Ticketing pasa a ser lo que se ha puesto (Luis heredado + Pepa a mano)",
      sorted(p["name"] for p in filas["TICKETING"]["people"]) == ["Luis Taquilla", "Pepa Montaje"],
      str(filas["TICKETING"]["people"])[:200])
check("y deja de ser heredada", filas["TICKETING"]["inherited"] is False)
s.close()

print("\n6 · El ALTA guarda lo elegido en el asistente")
otro = A.db()
pro2 = models.Promoter(nick="Promotora alta %s" % suf, kind="empresa")
otro.add(pro2); otro.flush()
p3 = models.PromoterContact(promoter_id=pro2.id, title="Producción", first_name="Nuria",
                            last_name="Nueva", email="nuria+%s@x.local" % suf)
otro.add(p3); otro.commit()
pro2_id, p3_id = pro2.id, str(p3.id)
otro.close()
datos = MultiDict([
    ("wizard_mode", "direct"), ("subject_kind", "ARTIST"), ("artist_id", str(art.id)),
    ("activity_type", "CONCIERTO"), ("sale_type", "VENDIDO"),
    ("date", (datetime.date.today() + datetime.timedelta(days=70)).strftime("%Y-%m-%d")),
    ("venue_id", str(ven.id)), ("billing_company_id", str(co.id)), ("status", "BORRADOR"),
    ("promoter_id", str(pro2_id)), ("ac_picks_present", "1"),
    ("ac_pick_PRODUCCION[]", json.dumps({"kind": "CONTACT", "contact_id": p3_id, "name": "Nuria Nueva"})),
    ("ac_pick_OTROS[]", json.dumps({"kind": "EMAIL", "name": "El del ayuntamiento",
                                    "email": "ayto+%s@x.local" % suf})),
])
r = cli.post("/conciertos/wizard/create", data=datos, follow_redirects=False)
loc = r.headers.get("Location", "")
check("la actividad se crea", "/conciertos/" in loc, loc)
nuevo_id = loc.split("/conciertos/")[-1].split("?")[0] if "/conciertos/" in loc else ""
s = A.db()
c2 = s.get(models.Concert, A.to_uuid(nuevo_id)) if nuevo_id else None
check("con la persona elegida en Producción",
      [x.get("contact_id") for x in A._activity_contact_list(c2, "PRODUCCION")] == [p3_id],
      str(A._activity_contact_list(c2, "PRODUCCION"))[:200])
check("y con la suelta de «Otras personas»",
      (A._activity_contact_list(c2, "OTROS") or [{}])[0].get("name") == "El del ayuntamiento",
      str(A._activity_contact_list(c2, "OTROS"))[:200])
pro2 = s.get(models.Promoter, pro2_id)
check("queda como la de por defecto del promotor (la próxima ya sale con ella)",
      [x.get("contact_id") for x in A._promoter_default_contact_list(pro2, "PRODUCCION")] == [p3_id],
      str(A._promoter_default_contact_list(pro2, "PRODUCCION"))[:200])

print("\n7 · «Otras personas» es de ESA actividad")
check("no pasa a ser del promotor", not A._promoter_default_contact_list(pro2, "OTROS"),
      str(A._promoter_default_contact_list(pro2, "OTROS"))[:160])
c3 = models.Concert(artist_id=art.id, promoter_id=pro2_id, venue_id=ven.id, sale_type="VENDIDO",
                    date=datetime.date.today() + datetime.timedelta(days=80), status="BORRADOR",
                    activity_type="CONCIERTO", capacity=0)
s.add(c3); s.commit()
filas = {f["role"]: f for f in A._activity_contacts_context(s, c3)}
check("otra actividad suya hereda Producción pero NO «Otras personas»",
      [p["name"] for p in filas["PRODUCCION"]["people"]] == ["Nuria Nueva"]
      and filas["OTROS"]["people"] == [], str(filas["OTROS"]["people"])[:160])

check("«Otras personas» tampoco PROPONE nada del promotor",
      not (filas["OTROS"].get("suggested") or {}).get("name"), str(filas["OTROS"].get("suggested"))[:160])

print("\n8 · En lo gratuito no hay Ticketing")
c3.sale_type = "GRATUITO"
s.commit()
roles = [f["role"] for f in A._activity_contacts_context(s, c3)]
check("la función de Ticketing no se pinta", "TICKETING" not in roles, str(roles))
s.close()

print("\n%d bien · %d mal" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
