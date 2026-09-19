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
  6. la FUSIÓN re-apunta lo que colgaba, borra el duplicado y la pareja deja de salir;
  7. …incluidas las VINCULACIONES: las dos fichas vinculadas a la misma tercera se funden en
     una sola (antes reventaba la fusión entera con el UNIQUE de `third_party_links`).

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
# ⚠️ La pantalla ya NO pinta las parejas descartadas («eso ya está hecho y punto», sep 2026), pero
# el dato sigue apuntado con quién lo dijo: la decisión no se pierde y se puede deshacer.
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
check("y queda apuntada la unión, para poder deshacerla",
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

# ─── LAS VINCULACIONES AL FUSIONAR ────────────────────────────────────────────────────────────
# ⚠️⚠️ Dos fichas duplicadas suelen estar vinculadas a LA MISMA tercera —por eso son duplicadas—,
# y re-apuntarlas en bloque chocaba con el UNIQUE de `third_party_links`: la fusión ENTERA moría
# con «duplicate key value violates unique constraint "uq_third_party_links_direct"» (bug real,
# sep 2026, lo vio Dani). Aquí se comprueba de punta a punta que ya no, y que no se pierde nada.
s = A.db()
keep = models.Promoter(nick="Vinc Keep %s" % suf, contact_email="vinc+%s@x.local" % suf)
drop = models.Promoter(nick="Vinc Drop %s" % suf, contact_email="vinc+%s@x.local" % suf)
vx = models.Promoter(nick="Vinc X %s" % suf); vy = models.Promoter(nick="Vinc Y %s" % suf)
vz = models.Promoter(nick="Vinc Z %s" % suf); vw = models.Promoter(nick="Vinc W %s" % suf)
aj1 = models.Promoter(nick="Vinc Ajeno1 %s" % suf); aj2 = models.Promoter(nick="Vinc Ajeno2 %s" % suf)
for p_ in (keep, drop, vx, vy, vz, vw, aj1, aj2): s.add(p_)
s.commit()
vid = {k: v.id for k, v in dict(keep=keep, drop=drop, x=vx, y=vy, z=vz, w=vw, o1=aj1, o2=aj2).items()}
def _vinc(st, sid, tt, tid, rel=None, nota=None):
    s.add(models.ThirdPartyLink(source_type=st, source_id=sid, target_type=tt, target_id=tid,
                                relation_title=rel, note=nota, is_active=True))
_vinc("promoter", vid["x"], "promoter", vid["keep"])                                    # el choque
_vinc("promoter", vid["x"], "promoter", vid["drop"], rel="director de la radio", nota="apunte")
_vinc("promoter", vid["keep"], "promoter", vid["y"])                                    # el espejo
_vinc("promoter", vid["y"], "promoter", vid["drop"], rel="proveedor")
_vinc("promoter", vid["keep"], "promoter", vid["drop"], rel="son la misma")             # entre ellas
_vinc("promoter", vid["drop"], "promoter", vid["z"], rel="socio")                       # solo del que se va
_vinc("empresa", vid["drop"], "promoter", vid["w"], rel="su sociedad")                  # creada como «empresa»
_vinc("promoter", vid["o1"], "promoter", vid["o2"], rel="ajena")                        # de otros
s.commit(); s.close()

with cli.session_transaction() as ses: ses.pop("_flashes", None)
r = cli.post("/promotores/fusion", data={"keep_id": str(vid["keep"]), "drop_id": str(vid["drop"]),
                                         "choices_json": "{}", "next": "/promotores"})
with cli.session_transaction() as ses: fl = ses.get("_flashes", [])
s = A.db()
check("fusionar dos fichas vinculadas a la MISMA tercera no revienta (uq_third_party_links_direct)",
      not any(c == "danger" for c, _m in fl), str(fl)[:220])
check("y el duplicado desaparece", s.get(models.Promoter, vid["drop"]) is None)
filas = s.query(models.ThirdPartyLink).filter(A.or_(
    models.ThirdPartyLink.source_id == vid["keep"], models.ThirdPartyLink.target_id == vid["keep"])).all()
def _hacia(pid):
    return [f for f in filas if pid in (f.source_id, f.target_id)]
check("la vinculación repetida se queda en UNA", len(_hacia(vid["x"])) == 1, len(_hacia(vid["x"])))
check("y se le completan los huecos con lo que traía el duplicado (relación y nota)",
      bool(_hacia(vid["x"])) and _hacia(vid["x"])[0].relation_title == "director de la radio"
      and _hacia(vid["x"])[0].note == "apunte",
      [(f.relation_title, f.note) for f in _hacia(vid["x"])])
check("la vinculación ESPEJO (la misma al revés) tampoco se duplica", len(_hacia(vid["y"])) == 1, len(_hacia(vid["y"])))
check("lo que solo tenía el duplicado pasa al que se conserva", len(_hacia(vid["z"])) == 1, len(_hacia(vid["z"])))
check("y la vinculación creada como «empresa» NO se pierde (misma tabla)", len(_hacia(vid["w"])) == 1, len(_hacia(vid["w"])))
check("no queda ninguna vinculación apuntando a la ficha borrada", not s.query(models.ThirdPartyLink).filter(A.or_(
    models.ThirdPartyLink.source_id == vid["drop"], models.ThirdPartyLink.target_id == vid["drop"])).all())
check("ni ninguna de la ficha consigo misma", not [f for f in filas if f.source_id == f.target_id])
check("y las vinculaciones de otros ni se tocan", len(s.query(models.ThirdPartyLink).filter(
    models.ThirdPartyLink.source_id == vid["o1"]).all()) == 1)
s.close()

# ⚠️⚠️ Y LO QUE NO SE PINTA: los dos archivos de trabajo ya resuelto no salen en Terceros (sep
# 2026, lo pidió Dani: «fichas unidas y parejas descartadas no se tiene que mostrar»).
html_t = cli.get("/promotores").get_data(as_text=True)
check("Terceros NO enseña «Parejas descartadas»", "Parejas descartadas" not in html_t)
check("ni «Fichas unidas a su persona de la oficina»", "Fichas unidas a su persona" not in html_t)
check("pero sigue enseñando lo que SÍ hay que hacer (las fichas repetidas)", "Fichas repetidas" in html_t)

# ══════════════════════════════════════════════════════════════════════════════════════════════
# LOS DOCUMENTOS DE LAS DOS FICHAS NO SE PIERDEN (sep 2026, lo pidió Dani)
# ⚠️ `person_documents` es POLIMÓRFICO (owner_type/owner_id): no cuelga de ninguna clave ajena, así
# que `_merge_repoint_references` no lo veía y al fusionar todo lo que había subido la ficha que
# desaparecía se quedaba HUÉRFANO (el fichero seguía en Storage pero ya no era de nadie).
# ══════════════════════════════════════════════════════════════════════════════════════════════
print("\n── Los DOCUMENTOS al fusionar ─────────────────────────────────────────")
import datetime as _dt
s = A.db()
p1 = models.Promoter(nick="Docs Uno %s" % suf, first_name="Ana", last_name="Docs %s" % suf)
p2 = models.Promoter(nick="Docs Dos %s" % suf, first_name="Ana", last_name="Docs %s" % suf)
s.add(p1); s.add(p2); s.flush()
id1, id2 = p1.id, p2.id
# La que se CONSERVA: su DNI y una tarjeta de Renfe.
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id1, kind="DNI", doc_number="11111111H",
                            full_name="Ana Docs", front_url="https://x/dni-bueno.jpg"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id1, kind="LOYALTY", company="Renfe",
                            doc_number="RF-1"))
# La que DESAPARECE: otro DNI (choca), un pasaporte y un carnet que solo tiene ella, la MISMA
# tarjeta de Renfe (no se puede duplicar) y otra distinta.
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id2, kind="DNI", doc_number="22222222J",
                            full_name="Ana Docs", front_url="https://x/dni-otro.jpg"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id2, kind="PASSPORT", doc_number="PAS-9",
                            expiry_date=_dt.date(2030, 1, 1)))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id2, kind="LICENSE", doc_number="CAR-7"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id2, kind="LOYALTY", company="Renfe",
                            doc_number="RF-1"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=id2, kind="LOYALTY", company="Iberia",
                            doc_number="IB-2"))
# Y un papel de alta/PRL de la que desaparece: se mueve entero, sin preguntar.
s.add(models.PersonComplianceDoc(owner_type="PROMOTER", owner_id=id2, doc_type="PRL_FORMACION",
                                 file_url="https://x/prl.pdf"))
s.commit()

# 1) LA COMPARACIÓN dice lo que va a pasar ANTES de fusionar.
r = cli.get("/promotores/fusion/comparar?a=%s&b=%s" % (id1, id2))
js = r.get_json() or {}
docs = js.get("documents") or {}
check("la comparación dice qué pasa con los documentos", r.status_code == 200 and docs, r.status_code)
claves = sorted(c["key"] for c in docs.get("conflicts") or [])
check("el DNI, que lo tienen las DOS, sale para elegir", "DNI" in claves, claves)
check("y la MISMA tarjeta de Renfe también (no se duplica)",
      any(k.startswith("LOYALTY|RF1") for k in claves), claves)
check("un pasaporte que solo tiene una NO se pregunta", "PASSPORT" not in claves, claves)
tipos_ok = sorted(k["kind"] for k in docs.get("kept") or [])
check("se dice que el pasaporte, el carnet y la otra tarjeta se MANTIENEN",
      tipos_ok == ["LICENSE", "LOYALTY", "PASSPORT"], tipos_ok)
check("y que el papel de PRL se mueve también", docs.get("other") == 1, docs.get("other"))
check("cada opción se puede reconocer (su número y su imagen)",
      all((c["a"]["sub"] and c["b"]["sub"]) for c in docs.get("conflicts") or []),
      docs.get("conflicts"))

# 2) LA FUSIÓN: del DNI se elige el de la que DESAPARECE; del resto, lo que hay por defecto.
r = cli.post("/promotores/fusion", data={"keep_id": str(id1), "drop_id": str(id2),
                                         "choices_json": "{}",
                                         "docs_json": '{"DNI": "drop"}', "next": "/promotores"})
s = A.db()
check("la ficha duplicada desaparece", s.get(models.Promoter, id2) is None, r.status_code)
quedan = (s.query(models.PersonDocument)
          .filter(models.PersonDocument.owner_type == "PROMOTER",
                  models.PersonDocument.owner_id == id1).all())
porkind = {}
for d in quedan:
    porkind.setdefault(d.kind, []).append(d)
check("NADA se queda huérfano: no queda ni un documento de la ficha borrada",
      not s.query(models.PersonDocument).filter(models.PersonDocument.owner_id == id2).all())
check("el PASAPORTE que solo tenía la borrada se mantiene", len(porkind.get("PASSPORT") or []) == 1, sorted(porkind))
check("y el CARNET también", len(porkind.get("LICENSE") or []) == 1, sorted(porkind))
check("el DNI NO se duplica: queda UNO", len(porkind.get("DNI") or []) == 1, len(porkind.get("DNI") or []))
check("y es EL QUE SE ELIGIÓ (el de la ficha que desaparecía)",
      (porkind.get("DNI") or [None])[0] is not None and porkind["DNI"][0].doc_number == "22222222J",
      (porkind.get("DNI") or [None])[0] and porkind["DNI"][0].doc_number)
renfes = [d for d in (porkind.get("LOYALTY") or []) if (d.doc_number or "") == "RF-1"]
check("la MISMA tarjeta de Renfe tampoco se duplica", len(renfes) == 1, len(renfes))
check("pero la otra tarjeta sí se mantiene", len(porkind.get("LOYALTY") or []) == 2,
      [(d.company, d.doc_number) for d in (porkind.get("LOYALTY") or [])])
check("el papel de PRL pasa a la ficha que se conserva",
      len(s.query(models.PersonComplianceDoc).filter(
          models.PersonComplianceDoc.owner_type == "PROMOTER",
          models.PersonComplianceDoc.owner_id == id1).all()) == 1)
s.close()

# 3) LA FUSIÓN AUTOMÁTICA (el integrante de un artista que ya era tercero) tampoco los pierde:
#    ahí no hay a quién preguntar, así que se queda el del que sobrevive y lo demás pasa entero.
print("\n── Y en la fusión AUTOMÁTICA ──────────────────────────────────────────")
s = A.db()
q1 = models.Promoter(nick="Auto Uno %s" % suf)
q2 = models.Promoter(nick="Auto Dos %s" % suf)
s.add(q1); s.add(q2); s.flush()
qa, qb = q1.id, q2.id
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=qa, kind="DNI", doc_number="33333333P"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=qb, kind="DNI", doc_number="44444444D"))
s.add(models.PersonDocument(owner_type="PROMOTER", owner_id=qb, kind="PASSPORT", doc_number="PAS-AUTO"))
s.commit()
with A.app.test_request_context("/"):
    ok_auto = A._promoter_merge_into(s, s.get(models.Promoter, qa), s.get(models.Promoter, qb))
    s.commit()
check("la fusión automática funciona", ok_auto is True)
finales = (s.query(models.PersonDocument)
           .filter(models.PersonDocument.owner_type == "PROMOTER",
                   models.PersonDocument.owner_id == qa).all())
check("el DNI sigue siendo UNO (el del que sobrevive)",
      len([d for d in finales if d.kind == "DNI"]) == 1 and
      [d for d in finales if d.kind == "DNI"][0].doc_number == "33333333P",
      [(d.kind, d.doc_number) for d in finales])
check("y el pasaporte que solo tenía el otro NO se pierde",
      len([d for d in finales if d.kind == "PASSPORT"]) == 1, [(d.kind, d.doc_number) for d in finales])
check("no queda nada huérfano",
      not s.query(models.PersonDocument).filter(models.PersonDocument.owner_id == qb).all())
s.close()

# ══════════════════════════════════════════════════════════════════════════════════════════════
# EL CÓDIGO IPI SOLO SE LE PIDE A UN AUTOR (sep 2026, lo pidió Dani: «para no saturar de campos
# las fichas de terceros de forma innecesaria»)
# ══════════════════════════════════════════════════════════════════════════════════════════════
print("\n── El código IPI, solo en la ficha de un autor ────────────────────────")
s = A.db()
n1 = models.Promoter(nick="Sin IPI %s" % suf)                      # un tercero cualquiera
n2 = models.Promoter(nick="Autor marcado %s" % suf, roles_manual=["AUTHOR"])
n3 = models.Promoter(nick="Con IPI %s" % suf, ipi="00123456789")   # ya lo tiene guardado
n4 = models.Promoter(nick="Arreglista %s" % suf)                   # firma una obra como ARREGLISTA
s.add(n1); s.add(n2); s.add(n3); s.add(n4); s.flush()
cancion = models.Song(title="Obra de prueba %s" % suf, release_date=_dt.date(2026, 1, 1))
s.add(cancion); s.flush()
s.add(models.SongEditorialShare(song_id=cancion.id, promoter_id=n4.id, role="ARRANGER", pct=100))
s.commit()
with A.app.test_request_context("/"):
    check("un tercero normal NO es autor", A._promoter_is_author(s, n1) is False)
    check("uno marcado como «Autores / compositores» SÍ", A._promoter_is_author(s, n2) is True)
    check("uno que YA tiene un IPI guardado también (un dato no se esconde nunca)",
          A._promoter_is_author(s, n3) is True)
    check("y un ARREGLISTA que firma una obra, también", A._promoter_is_author(s, n4) is True)
ids_ipi = {k: str(v.id) for k, v in (("n1", n1), ("n2", n2), ("n3", n3), ("n4", n4))}
s.close()
html = cli.get("/promotores/%s" % ids_ipi["n1"]).get_data(as_text=True)
check("en la ficha de un tercero normal el campo IPI NI SE PINTA",
      'data-ipi-box' in html and 'd-none" data-ipi-box' in html.replace("col-12 col-md-6 ", ""), None)
check("y va DESHABILITADO (un campo oculto se envía igual y habría borrado el IPI)",
      'name="ipi"' in html and "disabled" in html.split('name="ipi"')[1][:120], None)
for clave, quien in (("n2", "uno marcado como autor"), ("n3", "uno que ya tiene IPI"), ("n4", "un arreglista")):
    html = cli.get("/promotores/%s" % ids_ipi[clave]).get_data(as_text=True)
    trozo = html.split("data-ipi-box")[0][-90:] if "data-ipi-box" in html else ""
    check("en la ficha de %s SÍ se pide el IPI" % quien, "d-none" not in trozo, trozo[-60:])

# ⚠️ LA TRAMPA DE SIEMPRE: un campo oculto SE ENVÍA IGUAL. Si el formulario de un tercero sin IPI
# mandara `ipi=""`, el centinela `if "ipi" in request.form` lo daría por borrado a propósito. Se
# comprueba que guardar SIN mandar el campo deja el IPI como estaba.
s = A.db()
n3b = s.get(models.Promoter, A.to_uuid(ids_ipi["n3"]))
nick_n3 = n3b.nick
s.close()
cli.post("/promotores/%s/update" % ids_ipi["n3"], data={"nick": nick_n3}, follow_redirects=True)
s = A.db()
check("guardar la ficha SIN mandar el campo NO borra el IPI que había",
      (s.get(models.Promoter, A.to_uuid(ids_ipi["n3"])).ipi or "") == "00123456789",
      s.get(models.Promoter, A.to_uuid(ids_ipi["n3"])).ipi)
s.close()

print("\n%d bien · %d mal" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
