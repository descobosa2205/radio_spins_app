#!/usr/bin/env python3
"""EL RESULTADO DE UNA ACTIVIDAD · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y la BD de PRUEBA, la barra con la que se simula el resultado:

  1. que llega al **100% del AFORO a la venta** y no al 100% de lo vendido hasta ahora —con la
     venta sincronizada de Enterticket, el adaptador metía como cantidad las entradas VENDIDAS y
     no se podía simular ni un escenario por encima (bug real, sep 2026, lo vio Dani);
  2. que se sabe **dónde estamos ahora** (entradas, % y recaudación real) y que la barra **nace
     ahí** y lo deja marcado;
  3. que el **punto de empate** sale en % del aforo y cuadra con la serie de la propia barra;
  4. y que la pestaña Resultado lo enseña todo (incluida la galleta «Vendido ahora»).

    /tmp/python/bin/python3 tools/check_resultado.py

Requiere el entorno de /tmp que describe CLAUDE.md. Crea sus propios datos en cada pasada.
"""
import os, pathlib, sys, tempfile, uuid as _u, datetime as dt, json, re
RAIZ = pathlib.Path("/Users/carlos/Documents/radio_spins_app"); os.chdir(RAIZ); sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock","app33_personnel_bootstrap.lock"): (tmp/n).write_text("x")
os.environ.setdefault("DATABASE_URL","postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL",""); os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY","")
os.environ.setdefault("FLASK_SECRET_KEY","barra"); os.environ.setdefault("PGCONNECT_TIMEOUT","5")
import models, app as A
A.app.config["WTF_CSRF_ENABLED"] = False
OK, KO = [], []
def check(n, c, extra=""):
    (OK if c else KO).append(n); print(("  OK    " if c else "  FALLA ") + n + ((" · " + str(extra)[:300]) if (extra and not c) else ""))
suf = _u.uuid4().hex[:6]
s = A.db()
prof = s.query(models.UserProfile).first()
if prof is None:
    u = models.User(email="dani@33producciones.es", password_hash="x", role=10); s.add(u); s.flush()
    prof = models.UserProfile(user_id=u.id, nick="Escobosa", departments=["Contratación"]); s.add(prof); s.commit()
UID = prof.user_id
art = models.Artist(name="Artista Barra %s" % suf); ven = models.Venue(name="Sala Barra %s" % suf)
s.add(art); s.add(ven); s.commit()
c = models.Concert(artist_id=art.id, venue_id=ven.id, date=dt.date.today()+dt.timedelta(days=30),
                   status="CONFIRMADO", activity_type="CONCIERTO", sale_type="EMPRESA",
                   capacity=1000, created_by_user_id=UID)
s.add(c); s.commit()
# Aforo A LA VENTA: 1.000 entradas a 22 € (con IVA)
s.add(models.ConcertTicketType(concert_id=c.id, name="General", qty_for_sale=1000, price=22))
# Un gasto para que haya punto de empate
s.add(models.ConcertCache(concert_id=c.id, kind="FIXED", amount=6000))
s.commit()
# VENTA REAL sincronizada de Enterticket: 250 entradas
import random as _r
ev = models.EnterticketEvent(concert_id=c.id, name="Barra %s" % suf, et_event_id=_r.randint(10**6, 10**7))
s.add(ev); s.commit()
for i in range(250):
    s.add(models.EnterticketSale(event_id=ev.id, et_sale_id=(ev.et_event_id * 1000 + i),
                                 price=22, total=22, is_invitation=False))
s.commit()
CID = str(c.id)
s.close()

s = A.db()
c2 = s.get(models.Concert, A.to_uuid(CID))
with A.app.test_request_context("/"):
    ctx = A._concert_result_context(s, c2)
calc, mod = ctx["calc"], ctx["module"]["activities"][0]
print("   sellable:", calc["ticketing"]["sellable"], "· vendido:", mod["sold"], "· sold_pct:", mod["sold_pct"])
check("la barra llega al 100% del AFORO a la venta (antes solo a lo vendido)",
      calc["ticketing"]["sellable"] == 1000, calc["ticketing"]["sellable"])
check("y se sabe dónde estamos ahora (250 de 1.000 = 25%)",
      mod["sold"] == 250 and mod["sold_pct"] == 25, (mod["sold"], mod["sold_pct"]))
check("la recaudación de ahora es la real (250 × 22 €)", round(mod["sold_revenue"]) == 5500, mod["sold_revenue"])
check("la serie llega hasta el aforo", mod["series"][100]["tickets"] == 1000, mod["series"][100]["tickets"])
check("el punto de empate se calcula sobre el aforo, no sobre lo vendido",
      mod["break_even_pct"] is not None and 0 < mod["break_even_pct"] <= 100, mod["break_even_pct"])
be_tickets = mod["break_even_tickets"]
primero_ok = next((r for r in mod["series"] if r["resultado"] >= 0), None)
check("y el empate es el primer punto de la serie que deja de perder (coherente con la barra)",
      be_tickets and primero_ok and be_tickets == primero_ok["tickets"], (be_tickets, primero_ok and primero_ok["tickets"]))
check("con estos números el empate está POR ENCIMA de lo vendido: se ve lo que falta",
      be_tickets and be_tickets > mod["sold"], (be_tickets, mod["sold"]))
s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"]=str(UID); ses["role"]=10; ses["nick"]="Escobosa"
html = cli.get("/conciertos/%s?tab=resultado" % CID).get_data(as_text=True)
check("la pestaña Resultado abre", "Punto de empate" in html, html[:200])
check("y dice lo VENDIDO AHORA, además del @100%", "Vendido ahora" in html)
datos = re.search(r'<script type="application/json" id="concertResultData">(.*?)</script>', html, re.S)
pay = json.loads(datos.group(1)) if datos else {}
act = (pay.get("activities") or [{}])[0]
check("el módulo de la barra lleva el punto de ahora", act.get("sold_pct") == 25, act.get("sold_pct"))
js = (RAIZ / "static/js/sim_partners.js").read_text(encoding="utf-8")
check("la barra NACE en ese punto (no al 100%)", "render(soldPct === null ? 100 : soldPct)" in js)
check("y lo deja marcado en la barra", "simp-now__label" in js and "Ahora · " in js)
css = (RAIZ / "static/css/styles.css").read_text(encoding="utf-8")
check("la marca de ahora tiene su estilo y no pisa la del empate",
      ".simp-now {" in css and "bottom:0" in css.split(".simp-now {")[1][:120])
print("\n%d OK, %d FALLAN" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
