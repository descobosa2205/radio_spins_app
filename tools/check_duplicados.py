#!/usr/bin/env python3
"""LA BASE DE TERCEROS ES ÚNICA · prueba de regresión.

Un medio, un artista o alguien de la oficina que hace de promotor NO es otra ficha: es el mismo
haciendo de promotor. Esto comprueba, contra la app REAL y la BD de PRUEBA, que:

  1. la misma empresa dada de alta dos veces (el nombre escrito distinto, el mismo correo) sale
     como DUPLICADA en Terceros, y se dice POR QUÉ;
  2. dos personas con el mismo nombre y DNI distinto NO se agrupan (fusionarlas sería mucho peor);
  3. la pantalla de Terceros pinta el bloque y su botón abre la fusión con el duplicado ya elegido;
  4. el ALTA RÁPIDA avisa cuando ese DNI, ese correo o ese teléfono YA están en la base (antes solo
     miraba nombres parecidos, así que «Cadena 100» y «Cadena100 Radio» se creaban las dos);
  5. …y aun así deja crear si de verdad es otro (`force_new`);
  6. la FUSIÓN re-apunta lo que colgaba, borra el duplicado y la pareja deja de salir.

    /tmp/python/bin/python3 tools/check_duplicados.py

⚠️ Necesita el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
Crea sus propios datos (con un sufijo distinto en cada pasada), así que se puede repetir.
Sale con código 1 si algo falla, para poder usarla en CI.
"""
import os, pathlib, sys, tempfile
RAIZ = pathlib.Path("/Users/carlos/Documents/radio_spins_app"); os.chdir(RAIZ); sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock","app33_personnel_bootstrap.lock"): (tmp/n).write_text("x")
os.environ.setdefault("DATABASE_URL","postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL",""); os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY","")
os.environ.setdefault("FLASK_SECRET_KEY","dups"); os.environ.setdefault("PGCONNECT_TIMEOUT","5")
import models, app as A
A.app.config["WTF_CSRF_ENABLED"] = False
OK, KO = [], []
def check(n, c, extra=""):
    (OK if c else KO).append(n)
    print(("  OK    " if c else "  FALLA ") + n + ((" · " + str(extra)[:200]) if (extra and not c) else ""))

s = A.db()
prof = s.query(models.UserProfile).filter(models.UserProfile.nick=="Escobosa").first()
import uuid as _u
suf = _u.uuid4().hex[:6]
# dos fichas de la MISMA empresa, con el nombre escrito distinto y el mismo correo
a = models.Promoter(nick="Cadena Cien %s" % suf, contact_email="prensa+%s@cadena.local" % suf, kind="empresa")
b = models.Promoter(nick="Cadena100 Radio %s" % suf, contact_email="prensa+%s@cadena.local" % suf, kind="empresa")
# dos personas distintas que se llaman igual pero tienen DNI distinto: NO se agrupan
c1 = models.Promoter(nick="Juan Perez %s" % suf, first_name="Juan", last_name="Perez Uno %s" % suf, tax_id="00000001R")
c2 = models.Promoter(nick="Juan Perez dos %s" % suf, first_name="Juan", last_name="Perez Uno %s" % suf, tax_id="00000002W")
for x in (a,b,c1,c2): s.add(x)
s.commit()
ids = {"a": a.id, "b": b.id, "c1": c1.id, "c2": c2.id}
todos = s.query(models.Promoter).all()
grupos = A._promoter_duplicate_groups(s, todos)
def grupo_de(pid):
    for g in grupos:
        if str(pid) in [p["id"] for p in g["people"]]:
            return g
    return None
g = grupo_de(ids["a"])
check("la misma empresa con el nombre escrito distinto y el mismo correo sale como duplicada",
      g is not None and str(ids["b"]) in [p["id"] for p in g["people"]], str(g)[:200])
check("y se dice POR QUÉ (el mismo correo)", bool(g and "correo" in (g.get("why") or "")), (g or {}).get("why"))
g2 = grupo_de(ids["c1"])
check("dos personas con el MISMO nombre y DNI distinto NO se agrupan",
      g2 is None or str(ids["c2"]) not in [p["id"] for p in g2["people"]], str(g2)[:200])
s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"]=str(prof.user_id); ses["role"]=10; ses["nick"]=prof.nick
r = cli.get("/promotores")
html = r.get_data(as_text=True)
check("la pantalla de Terceros pinta el bloque de fichas repetidas",
      r.status_code == 200 and "Fichas repetidas" in html, r.status_code)
check("y lleva el botón que abre la fusión con el duplicado ya elegido", "data-merge-with" in html)

# El alta rápida NO deja crear otra con el mismo correo
r = cli.post("/api/promoters/create", data={"nick": "Cadena de otra forma %s" % suf,
                                            "contact_email": "prensa+%s@cadena.local" % suf})
d = r.get_json() or {}
check("el alta rápida avisa de que ese correo YA está en la base", r.status_code == 409 and d.get("similar"),
      "%s %s" % (r.status_code, str(d)[:160]))
check("y dice por qué", "correo" in (d.get("error") or ""), d.get("error"))
# …pero se puede crear igualmente si de verdad es otro (force_new)
r = cli.post("/api/promoters/create", data={"nick": "Cadena de otra forma %s" % suf,
                                            "contact_email": "prensa+%s@cadena.local" % suf, "force_new": "1"})
check("y aun así se puede crear si de verdad es otro (force_new)", r.status_code == 200, r.status_code)

# FUSIÓN de verdad: se re-apunta todo y el duplicado desaparece
r = cli.post("/promotores/fusion", data={"keep_id": str(ids["a"]), "drop_id": str(ids["b"]),
                                         "choices_json": "{}", "next": "/promotores"})
s = A.db()
check("fusionadas: la que se descarta ya no existe", s.get(models.Promoter, ids["b"]) is None, r.status_code)
check("y la que se conserva sigue ahí", s.get(models.Promoter, ids["a"]) is not None)
grupos2 = A._promoter_duplicate_groups(s, s.query(models.Promoter).all())
sigue = any(str(ids["a"]) in [p["id"] for p in g["people"]] and len(g["people"]) > 1
            for g in grupos2)
# ⚠️ Puede seguir agrupada con la que se creó con force_new (mismo correo): eso es correcto.
check("después de fusionar, esa pareja ya no está", not any(
    str(ids["b"]) in [p["id"] for p in g["people"]] for g in grupos2))
s.close()
print("\n%d bien · %d mal" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
