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
grupos = A._promoter_duplicate_pairs(s, todos, limite=5000)
def pareja_de(x, y):
    for g in grupos:
        if {g["a"]["id"], g["b"]["id"]} == {str(x), str(y)}:
            return g
    return None
g = pareja_de(ids["a"], ids["b"])
check("la misma empresa con el nombre escrito distinto y el mismo correo sale como duplicada",
      g is not None, str(grupos)[:220])
check("y se dice POR QUÉ (el mismo correo)", bool(g and "correo" in (g.get("why") or "")), (g or {}).get("why"))
check("se propone DE DOS EN DOS (una pareja, no un grupo)",
      all(set(x) >= {"a", "b"} and "people" not in x for x in grupos), str(grupos[:1])[:200])
check("dos personas con el MISMO nombre y DNI distinto NO se emparejan",
      pareja_de(ids["c1"], ids["c2"]) is None)

# ⚠️⚠️ UNA PERSONA NO ES LA EMPRESA A LA QUE ESTÁ VINCULADA (lo pidió Dani): ni por el CIF de su
# sociedad ni por compartir el correo o el teléfono. Y puede estar vinculada a VARIAS sociedades.
s = A.db()
persona = models.Promoter(nick="Dueño %s" % suf, first_name="Ana", last_name="Dueña %s" % suf,
                          contact_email="info+%s@sociedad.local" % suf, contact_phone="+346%s" % suf[:2].translate(str.maketrans("abcdef", "123456")).ljust(8, "7"))
s.add(persona); s.flush()
soc1 = models.Promoter(nick="Sociedad Una %s" % suf, kind="empresa", tax_id="B%s01" % suf[:5].upper(),
                       contact_email="info+%s@sociedad.local" % suf, contact_phone="+34600123123")
soc2 = models.Promoter(nick="Sociedad Dos %s" % suf, kind="empresa", tax_id="B%s02" % suf[:5].upper())
s.add(soc1); s.add(soc2); s.flush()
# Las DOS sociedades cuelgan de la persona (es lo normal: una persona factura por varias).
s.add(models.PromoterCompany(promoter_id=persona.id, legal_name="Sociedad Una SL", tax_id=soc1.tax_id))
s.add(models.PromoterCompany(promoter_id=persona.id, legal_name="Sociedad Dos SL", tax_id=soc2.tax_id))
s.commit()
pid_persona, pid_soc1, pid_soc2 = str(persona.id), str(soc1.id), str(soc2.id)
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
def hay(x, y):
    return any({g["a"]["id"], g["b"]["id"]} == {x, y} for g in grupos)
check("una PERSONA y la EMPRESA a la que está vinculada NO se proponen como la misma",
      not hay(pid_persona, pid_soc1), str([g["why"] for g in grupos if pid_persona in (g["a"]["id"], g["b"]["id"])])[:200])
check("ni por el CIF de su sociedad", not hay(pid_persona, pid_soc2))
# ⚠️ Lo que no puede pasar es que se empareje con una EMPRESA (con otra persona que comparta algo,
# sí: eso es un duplicado de verdad y hay que mirarlo).
check("y estar vinculada a VARIAS sociedades no la empareja con ninguna empresa",
      not any(pid_persona in (g["a"]["id"], g["b"]["id"]) and (g["a"]["company"] or g["b"]["company"])
              for g in grupos),
      str([(g["a"]["name"], g["b"]["name"]) for g in grupos if pid_persona in (g["a"]["id"], g["b"]["id"])])[:200])
s.close()
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
grupos2 = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
# ⚠️ La que se conservó puede seguir emparejada con la que se creó con force_new (mismo correo):
# eso es correcto; lo que no puede quedar es la que se ha borrado.
check("después de fusionar, la ficha borrada ya no aparece en ninguna pareja", not any(
    str(ids["b"]) in (g["a"]["id"], g["b"]["id"]) for g in grupos2))
s.close()
# ─── «NO SON LA MISMA»: la salida para dos personas distintas que comparten algo ───────────────
s = A.db()
d1 = models.Promoter(nick="Oficina Uno %s" % suf, contact_email="oficina+%s@x.local" % suf)
d2 = models.Promoter(nick="Oficina Dos %s" % suf, contact_email="oficina+%s@x.local" % suf)
s.add(d1); s.add(d2); s.commit()
id1, id2 = str(d1.id), str(d2.id)
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
def juntos(x, y, gs):
    return any({g["a"]["id"], g["b"]["id"]} == {x, y} for g in gs)
check("dos fichas con el mismo correo salen como posible duplicado", juntos(id1, id2, grupos))
s.close()

r = cli.post("/promotores/duplicados/descartar",
             data={"ids[]": [id1, id2], "next": "/promotores"}, follow_redirects=False)
s = A.db()
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("al decir «no son la misma», esa pareja deja de proponerse", not juntos(id1, id2, grupos), r.status_code)
check("y queda apuntado quién lo dijo, para poder deshacerlo",
      any(d["a"]["id"] in (id1, id2) and d["b"]["id"] in (id1, id2) for d in A._promoter_dismissed_rows(s)))

# ⚠️ Se descarta LA PAREJA, no la ficha: una TERCERA con el mismo correo sí se propone.
d3 = models.Promoter(nick="Oficina Tres %s" % suf, contact_email="oficina+%s@x.local" % suf)
s.add(d3); s.commit()
id3 = str(d3.id)
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("una TERCERA ficha que coincide sí se propone (con las dos descartadas aparte)",
      juntos(id1, id3, grupos) or juntos(id2, id3, grupos), str(grupos)[:200])
s.close()

r = cli.post("/promotores/duplicados/restaurar", data={"a": id1, "b": id2, "next": "/promotores"})
s = A.db()
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("y se puede DESHACER: vuelve a salir", juntos(id1, id2, grupos), r.status_code)
s.close()

r = cli.post("/promotores/duplicados/descartar", data={"ids[]": [id1], "next": "/promotores"})
check("con una sola ficha no se descarta nada (hacen falta dos)", r.status_code in (302, 303))

# ─── DESCARTAR VARIAS A LA VEZ ────────────────────────────────────────────────────────────────
s = A.db()
lote = []
for i in range(3):
    x = models.Promoter(nick="Lote A%d %s" % (i, suf), contact_email="lote%d+%s@x.local" % (i, suf))
    y = models.Promoter(nick="Lote B%d %s" % (i, suf), contact_email="lote%d+%s@x.local" % (i, suf))
    s.add(x); s.add(y); s.flush()
    lote.append((str(x.id), str(y.id)))
s.commit()
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("las tres parejas nuevas se proponen", all(juntos(a_, b_, grupos) for a_, b_ in lote))
s.close()
r = cli.post("/promotores/duplicados/descartar",
             data={"pares[]": ["%s|%s" % (a_, b_) for a_, b_ in lote], "next": "/promotores"})
s = A.db()
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("se pueden descartar VARIAS de una vez (las marcadas)",
      not any(juntos(a_, b_, grupos) for a_, b_ in lote), r.status_code)
s.close()
# ⚠️ El botón de UNA fila manda `solo`: descarta esa y NADA más, aunque viajen casillas marcadas.
s = A.db()
u1 = models.Promoter(nick="Solo A %s" % suf, contact_email="solo+%s@x.local" % suf)
u2 = models.Promoter(nick="Solo B %s" % suf, contact_email="solo+%s@x.local" % suf)
v1 = models.Promoter(nick="Otra A %s" % suf, contact_email="otra+%s@x.local" % suf)
v2 = models.Promoter(nick="Otra B %s" % suf, contact_email="otra+%s@x.local" % suf)
for x in (u1, u2, v1, v2): s.add(x)
s.commit()
p_solo, p_otra = (str(u1.id), str(u2.id)), (str(v1.id), str(v2.id))
s.close()
cli.post("/promotores/duplicados/descartar",
         data={"solo": "%s|%s" % p_solo, "pares[]": ["%s|%s" % p_otra], "next": "/promotores"})
s = A.db()
grupos = A._promoter_duplicate_pairs(s, s.query(models.Promoter).all(), limite=5000)
check("el botón de una fila descarta SOLO esa, aunque haya casillas marcadas",
      not juntos(*p_solo, grupos) and juntos(*p_otra, grupos))
s.close()

# ─── LAS DE LA OFICINA: «ES LA MISMA PERSONA» ─────────────────────────────────────────────────
s = A.db()
import datetime as _dt
u = models.User(email="ofi+%s@33.local" % suf, password_hash="x", role=1)
s.add(u); s.flush()
perfil = models.UserProfile(user_id=u.id, nick="Ofi %s" % suf, first_name="Marcos",
                            last_name="Oficina %s" % suf, dni="00000009X")
s.add(perfil)
tercero = models.Promoter(nick="Marcos Oficina %s" % suf, first_name="Marcos",
                          last_name="Oficina %s" % suf, contact_phone="+34611%s" % suf[:6].translate(str.maketrans("abcdef","123456")))
s.add(tercero); s.commit()
uid, pid = str(u.id), str(tercero.id)
ofi = A._promoter_office_duplicates(s, s.query(models.Promoter).all())
check("una ficha de tercero que es alguien de la oficina se detecta",
      any(x["promoter"]["id"] == pid and x["user"]["id"] == uid for x in ofi), str(ofi)[:200])
s.close()
r = cli.post("/promotores/duplicados/oficina",
             data={"promoter_id": pid, "user_id": uid, "next": "/promotores"})
s = A.db()
t2 = s.get(models.Promoter, A.to_uuid(pid))
check("«Es la misma persona» las une", str(getattr(t2, "user_id", "")) == uid, r.status_code)
check("y completa los huecos sin pisar nada (el DNI del personal pasa a la ficha)",
      (t2.tax_id or "") == "00000009X", t2.tax_id)
ofi = A._promoter_office_duplicates(s, s.query(models.Promoter).all())
check("ya no se propone", not any(x["promoter"]["id"] == pid for x in ofi))
check("y sale entre las YA UNIDAS, para poder deshacerlo",
      any(x["promoter"]["id"] == pid for x in A._promoter_office_linked(s, s.query(models.Promoter).all())))
s.close()
r = cli.post("/promotores/duplicados/oficina/deshacer", data={"promoter_id": pid, "next": "/promotores"})
s = A.db()
check("se puede DESHACER", not getattr(s.get(models.Promoter, A.to_uuid(pid)), "user_id", None), r.status_code)
s.close()
# ⚠️ Con DNI distinto NO se unen: eso es que no son la misma persona.
s = A.db()
otro = models.Promoter(nick="Marcos Otro %s" % suf, first_name="Marcos",
                       last_name="Oficina %s" % suf, tax_id="00000010B")
s.add(otro); s.commit(); pid2 = str(otro.id); s.close()
with cli.session_transaction() as ses: ses.pop("_flashes", None)
cli.post("/promotores/duplicados/oficina", data={"promoter_id": pid2, "user_id": uid, "next": "/promotores"})
with cli.session_transaction() as ses: fl = ses.get("_flashes", [])
s = A.db()
check("con DNI distinto NO se unen, y se dice por qué",
      not getattr(s.get(models.Promoter, A.to_uuid(pid2)), "user_id", None)
      and any("DNI distinto" in str(m) for _c, m in fl), str(fl)[:160])
s.close()

print("\n%d bien · %d mal" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
