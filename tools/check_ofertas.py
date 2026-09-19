#!/usr/bin/env python3
"""SIMULAR SOBRE UNA ACTIVIDAD, Y LAS OFERTAS · prueba de regresión (sep 2026).

Comprueba, contra la app REAL y la BD de PRUEBA:

  1. el MOTOR con ofertas: un **pack** (2x1), un **descuento** en % y otro en € por entrada, con su
     alcance (todo lo que quede o un número de entradas), y que **el punto de empate sube**;
  2. que una oferta puede **no afectar a los gastos de gestión** (la ticketera sigue cobrando por
     el precio de antes) y que **lo ya vendido no se toca**: la oferta solo alcanza al aforo libre;
  3. el botón **«Simular sobre esta actividad»**: crea la simulación con el ticketing (con el precio
     ya SIN IVA), los cachés, el presupuesto, los socios (con su base y sus pérdidas) y **lo vendido**;
  4. y que las ofertas **se guardan** y **se recortan al aforo real** cuando se pide de más.

    /tmp/python/bin/python3 tools/check_ofertas.py

Requiere el entorno de /tmp que describe CLAUDE.md. Crea sus propios datos en cada pasada.
"""
import os, pathlib, sys, tempfile, uuid as _u, datetime as dt, json
RAIZ = pathlib.Path("/Users/carlos/Documents/radio_spins_app"); os.chdir(RAIZ); sys.path.insert(0, str(RAIZ))
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock","app33_personnel_bootstrap.lock"): (tmp/n).write_text("x")
os.environ.setdefault("DATABASE_URL","postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL",""); os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY","")
os.environ.setdefault("FLASK_SECRET_KEY","of"); os.environ.setdefault("PGCONNECT_TIMEOUT","5")
import models
models.Base.metadata.create_all(models.engine); models.ensure_simulations_schema(); models.ensure_enterticket_schema()
import app as A, sim_calc
A.app.config["WTF_CSRF_ENABLED"] = False
OK, KO = [], []
def check(n, c, extra=""):
    (OK if c else KO).append(n); print(("  OK    " if c else "  FALLA ") + n + ((" · " + str(extra)[:300]) if (extra and not c) else ""))
suf = _u.uuid4().hex[:6]

print("1 · EL MOTOR CON OFERTAS")
base = {"categories": [{"zone": "PISTA", "quantity": 1000, "invitations": 0, "price_net": 20.0, "extras": []}],
        "caches": [{"mode": "FIXED", "amount": 6000}], "ticket_fees": {"per_ticket": 0.61, "pct": 0.42}}
sin = sim_calc.compute(dict(base))
check("sin ofertas, los números son los de siempre", round(sin["at_100"]["ingresos"]["ticketing"], 2) == 18480.0,
      sin["at_100"]["ingresos"]["ticketing"])
pack = sim_calc.compute(dict(base, offers=[{"kind": "PACK", "pack_buy": 2, "pack_pay": 1, "qty": 200}]))
check("un 2x1 en 200 entradas baja el ingreso justo la mitad de esas 200",
      round(sin["at_100"]["ingresos"]["ticketing"] - pack["at_100"]["ingresos"]["ticketing"], 2) == round(200 * 10 * (1 - 0.076), 2),
      (sin["at_100"]["ingresos"]["ticketing"], pack["at_100"]["ingresos"]["ticketing"]))
desc = sim_calc.compute(dict(base, offers=[{"kind": "DISCOUNT", "discount_pct": 50, "qty": 100}]))
check("un 50% en 100 entradas, lo mismo",
      round(sin["at_100"]["ingresos"]["ticketing"] - desc["at_100"]["ingresos"]["ticketing"], 2) == round(100 * 10 * (1 - 0.076), 2))
euros = sim_calc.compute(dict(base, offers=[{"kind": "DISCOUNT", "discount_amount": 5, "scope_all": True}]))
check("un descuento en € para todas se aplica a todo el aforo",
      round(euros["at_100"]["ingresos"]["ticketing"], 2) == round(1000 * 15 * (1 - 0.076), 2),
      euros["at_100"]["ingresos"]["ticketing"])
check("el punto de empate SUBE con la oferta", pack["break_even_tickets"] > sin["break_even_tickets"],
      (sin["break_even_tickets"], pack["break_even_tickets"]))

print("\n  · los gastos de gestión y lo ya vendido")
con_fees = sim_calc.compute(dict(base, offers=[{"kind": "DISCOUNT", "discount_pct": 50, "scope_all": True, "affects_fees": True}]))
sin_fees = sim_calc.compute(dict(base, offers=[{"kind": "DISCOUNT", "discount_pct": 50, "scope_all": True, "affects_fees": False}]))
check("si la oferta NO afecta a los gastos de gestión, la ticketera cobra por el precio de antes",
      sin_fees["at_100"]["gastos_gestion"] > con_fees["at_100"]["gastos_gestion"],
      (sin_fees["at_100"]["gastos_gestion"], con_fees["at_100"]["gastos_gestion"]))
vendido = sim_calc.compute(dict(base, sold_now=300, offers=[{"kind": "DISCOUNT", "discount_pct": 50, "scope_all": True}]))
tr = sim_calc.ticket_tranches(base["categories"], [{"kind": "DISCOUNT", "discount_pct": 50, "scope_all": True}], 300)
check("con 300 ya vendidas, la oferta solo alcanza a las 700 que quedan",
      [(t["qty"], round(t["price_net"], 2)) for t in tr] == [(300, 20.0), (700, 10.0)], tr)
check("y las 300 primeras se siguen ingresando a su precio",
      round(vendido["series_fine"][30]["ingresos"] - sin["series_fine"][30]["ingresos"], 2) == 0,
      (vendido["series_fine"][30]["ingresos"], sin["series_fine"][30]["ingresos"]))

print("\n2 · SIMULAR SOBRE UNA ACTIVIDAD")
s = A.db()
prof = s.query(models.UserProfile).first()
art = models.Artist(name="Art Sim %s" % suf); ven = models.Venue(name="Sala Sim %s" % suf)
emp = models.GroupCompany(name="Empresa Sim %s" % suf)
s.add(art); s.add(ven); s.add(emp); s.commit()
c = models.Concert(artist_id=art.id, venue_id=ven.id, date=dt.date.today()+dt.timedelta(days=50),
                   status="CONFIRMADO", activity_type="CONCIERTO", sale_type="EMPRESA",
                   capacity=800, created_by_user_id=prof.user_id, group_company_id=emp.id)
s.add(c); s.commit()
s.add(models.ConcertTicketType(concert_id=c.id, name="General", qty_for_sale=800, price=22))
s.add(models.ConcertCache(concert_id=c.id, kind="FIXED", amount=5000))
p1 = models.Promoter(nick="Socio Sim %s" % suf); s.add(p1); s.commit()
s.add(models.ConcertPromoterShare(concert_id=c.id, promoter_id=p1.id, pct=30, pct_base="PROFIT", bears_losses=False))
s.add(models.ConcertBudgetItem(concert_id=c.id, category="PRODUCCION", concept="Sonido", amount_net=1200))
s.commit()
# Venta real: 200 entradas
ev = models.EnterticketEvent(name="ET Sim %s" % suf, et_event_id=abs(hash(suf)) % 10**7, concert_id=c.id)
s.add(ev); s.commit()
for i in range(200):
    s.add(models.EnterticketSale(event_id=ev.id, et_sale_id=(ev.et_event_id*1000+i), price=22, total=22, is_invitation=False))
s.commit(); CID = str(c.id); UID = str(prof.user_id); s.close()

cli = A.app.test_client()
with cli.session_transaction() as ses:
    ses["user_id"]=UID; ses["role"]=10; ses["nick"]="Escobosa"
r = cli.post("/conciertos/%s/simular" % CID)
check("el botón crea la simulación y lleva a ella", r.status_code == 302 and "/simulaciones/" in (r.headers.get("Location") or ""), r.headers.get("Location"))
SID = (r.headers.get("Location") or "").rstrip("/").split("/")[-1]
s = A.db()
sim = s.get(models.Simulation, A.to_uuid(SID))
act = (sim.activities or [None])[0]
check("la simulación se queda con la actividad de origen y lo VENDIDO",
      act is not None and str(act.source_concert_id) == CID and act.sold_now == 200,
      act and (act.source_concert_id, act.sold_now))
check("y se copia el ticketing con el precio SIN IVA",
      len(act.ticket_categories) == 1 and abs(float(act.ticket_categories[0].price_net) - 20.0) < 0.01,
      [(c2.name, float(c2.price_net), c2.quantity) for c2 in act.ticket_categories])
check("los cachés", len(act.caches or []) == 1, act.caches)
check("el presupuesto, como gastos de producción", len(act.production_items or []) == 1, act.production_items)
check("y los socios, con su base y sus pérdidas",
      len(sim.partners or []) == 1 and (sim.partners[0].pct_base == "PROFIT") and sim.partners[0].no_loss is True,
      [(float(p.pct), p.pct_base, p.no_loss) for p in (sim.partners or [])])
AID = str(act.id)
s.close()

print("\n3 · LAS OFERTAS SE GUARDAN (y no pasan del aforo)")
r = cli.post("/contratacion/simulaciones/%s/ticketing" % SID, data={
    "activity_id": AID,
    "ticketing_json": json.dumps([{"zone": "PISTA", "name": "General", "price": 20, "qty": 800, "inv": 0}]),
    "offers_json": json.dumps([
        {"kind": "PACK", "buy": 2, "pay": 1, "qty": 200, "fees": False, "cat": 0},
        {"kind": "DISCOUNT", "pct": 50, "qty": 5000, "fees": True, "cat": None},   # ⚠️ más de lo que queda
    ])})
s = A.db()
act = s.get(models.SimulationActivity, A.to_uuid(AID))
ofs = sorted(act.offers or [], key=lambda x: x.sort_order or 0)
check("se guardan las dos ofertas", len(ofs) == 2, ofs)
if len(ofs) == 2:
    check("el pack, con su 2x1 y sus 200 entradas", ofs[0].kind == "PACK" and ofs[0].pack_buy == 2 and ofs[0].scope_qty == 200,
          (ofs[0].kind, ofs[0].pack_buy, ofs[0].pack_pay, ofs[0].scope_qty))
    # 800 de aforo − 200 vendidas = 600 libres; el pack ocupa 200 → quedan 400
    check("⚠️ y la que pedía más aforo del que hay se recorta al máximo REAL",
          ofs[1].scope_qty == 400, ofs[1].scope_qty)
    check("y se respeta si la oferta afecta a los gastos de gestión",
          ofs[0].affects_fees is False and ofs[1].affects_fees is True)
s.close()
# Y el cálculo de la simulación lo tiene en cuenta
s = A.db()
sim = (s.query(models.Simulation).filter(models.Simulation.id == A.to_uuid(SID)).first())
act = (sim.activities or [None])[0]
with A.app.test_request_context("/"):
    data = A._sim_build_calc_data(sim, act)
calc = sim_calc.compute(data)
check("el motor de la simulación recibe las ofertas", len(data.get("offers") or []) == 2, data.get("offers"))
check("y lo ya vendido", data.get("sold_now") == 200, data.get("sold_now"))
tramos = sim_calc.ticket_tranches(data["categories"], data["offers"], data["sold_now"])
check("los tramos son: lo vendido, el pack, el descuento y el resto",
      [(t["qty"], round(t["price_net"], 2)) for t in tramos] == [(200, 20.0), (200, 10.0), (400, 10.0)],
      [(t["qty"], round(t["price_net"], 2), t["label"]) for t in tramos])
s.close()
print("\n%d OK, %d FALLAN" % (len(OK), len(KO)))
sys.exit(1 if KO else 0)
