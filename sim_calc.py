"""Motor de cálculo de Simulaciones (Contratación).

Módulo **puro** (sin Flask ni SQLAlchemy ni sintaxis 3.10) para poder testearlo
de forma aislada con el venv local (Python 3.9). `app.py` extrae los datos de los
modelos ORM a un dict plano y llama a :func:`compute`.

Convenciones (confirmadas con el usuario):
- Todo el resultado se calcula en **neto sin IVA** (el IVA es neutro/recuperable).
- Entradas: precio configurado = sin IVA, INCLUYE SGAE. IVA entradas 10%, SGAE 7,65%
  del precio sin IVA. Neto de la entrada = precio · (1 − 0,0765).
- Complementos: importe IVA incluido al **10%**; no llevan SGAE.
- Rebate = 10% de la recaudación sin IVA (precio configurado) − 0,5 €/entrada vendida (mín. 0).
- Barras = 6 €/entrada vendida (solo si el recinto permite barras).
- Incentivos fiscales = 14% · (cachés netos + producción neta), sin IVA.
- Cachés/comisiones: si "incluye IVA" se le quita el 21% para obtener el neto.
- Retención (solo artista internacional): 24% sobre el caché neto, salvo cachés exentos.
  Si el caché "incluye retención" → va dentro (no suma coste). Si no → suma como coste.
- Subvenciones y patrocinios: importe sin IVA, suman directo (no escalan con la venta).
"""

IVA_TICKET = 0.10
SGAE_RATE = 0.0765
IVA_GENERAL = 0.21      # cachés / comisiones cuando "incluye IVA"
IVA_EXTRA = 0.10        # complementos (van con la entrada)
REBATE_PCT = 0.10
REBATE_PER_TICKET = 0.5
BARRAS_PER_TICKET = 6.0
INCENTIVE_PCT = 0.14
RETENTION_PCT = 0.24


def _f(v):
    """float seguro."""
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except Exception:
        return 0.0


def _net_of_iva(amount, includes_iva, rate=IVA_GENERAL):
    return amount / (1.0 + rate) if includes_iva else amount


def variable_amount(cfg, tickets_sold, taquilla_net, avg_price):
    """Importe de un componente variable (caché/comisión/producción) según la venta.

    cfg: dict con var_type ('PER_TICKET'|'PERCENT'), var_value,
         var_threshold_type ('TICKETS'|'AMOUNT'|None), var_threshold_value.
    tickets_sold: nº de entradas vendidas en este punto.
    taquilla_net: recaudación sin IVA (base para porcentajes) en este punto.
    avg_price: precio medio sin IVA por entrada (para convertir umbral en € a entradas).
    """
    # Condicionante (gastos del recinto): solo aplica si se venden MENOS de X entradas.
    cond_under = _f(cfg.get("cond_under_tickets"))
    if cond_under > 0 and tickets_sold >= cond_under:
        return 0.0

    vt = (cfg.get("var_type") or "").upper()
    value = _f(cfg.get("var_value"))
    tt = (cfg.get("var_threshold_type") or "").upper()
    tv = _f(cfg.get("var_threshold_value"))

    if vt == "PER_TICKET":
        if tt == "TICKETS":
            qty = max(tickets_sold - tv, 0.0)
        elif tt == "AMOUNT":
            tickets_at = (tv / avg_price) if avg_price > 0 else 0.0
            qty = max(tickets_sold - tickets_at, 0.0)
        else:
            qty = tickets_sold
        return value * qty

    if vt == "PERCENT":
        pct = value / 100.0
        if tt == "AMOUNT":
            base = max(taquilla_net - tv, 0.0)
            return pct * base
        if tt == "TICKETS":
            frac = (max(tickets_sold - tv, 0.0) / tickets_sold) if tickets_sold > 0 else 0.0
            return pct * taquilla_net * frac
        return pct * taquilla_net

    return 0.0


def ticketing_aggregates(categories):
    """Agrega el ticketing al 100% del aforo a la venta."""
    total_qty = total_inv = total_sellable = 0
    taquilla = sgae = iva = extras_net = 0.0
    zones = {"PISTA": {"qty": 0, "inv": 0, "sellable": 0},
             "GRADA": {"qty": 0, "inv": 0, "sellable": 0},
             "PALCO": {"qty": 0, "inv": 0, "sellable": 0}}
    for c in categories or []:
        zone = (c.get("zone") or "PISTA").upper()
        if zone not in zones:
            zone = "PISTA"
        q = max(int(_f(c.get("quantity"))), 0)
        inv = max(int(_f(c.get("invitations"))), 0)
        sellable = max(q - inv, 0)
        price = _f(c.get("price_net"))
        taquilla += price * sellable
        sgae += price * SGAE_RATE * sellable
        iva += price * IVA_TICKET * sellable
        extra_per = sum(_f(e.get("amount_gross")) for e in (c.get("extras") or []))
        extras_net += (extra_per / (1.0 + IVA_EXTRA)) * sellable
        total_qty += q
        total_inv += inv
        total_sellable += sellable
        zones[zone]["qty"] += q
        zones[zone]["inv"] += inv
        zones[zone]["sellable"] += sellable
    ticket_net = taquilla - sgae   # neto sin IVA y sin SGAE
    return {
        "qty": total_qty, "invitations": total_inv, "sellable": total_sellable,
        "taquilla_sin_iva": taquilla, "sgae": sgae, "iva": iva,
        "ticket_net": ticket_net, "ticket_gross": taquilla + iva,
        "extras_net": extras_net,
        "avg_price_sin_iva": (taquilla / total_sellable) if total_sellable else 0.0,
        "avg_price_gross": ((taquilla + iva) / total_sellable) if total_sellable else 0.0,
        "zones": zones,
    }


def _prepare(data):
    """Pre-calcula partes fijas y normaliza componentes de coste."""
    agg = ticketing_aggregates(data.get("categories"))
    sellable = agg["sellable"]

    caches = []
    for c in data.get("caches") or []:
        mode = (c.get("mode") or "FIXED").upper()
        item = {
            "mode": mode,
            "includes_iva": bool(c.get("includes_iva")),
            "includes_retention": bool(c.get("includes_retention")),
            "retention_exempt": bool(c.get("retention_exempt")),
            # Nacionalidad por caché (festival: según el artista del caché); si no, la global.
            "is_intl": bool(c["is_international"]) if ("is_international" in c) else bool(data.get("is_international")),
            "cfg": c,
        }
        if mode == "VARIABLE":
            item["fixed_net"] = None
        else:
            item["fixed_net"] = _net_of_iva(_f(c.get("amount")), item["includes_iva"])
        caches.append(item)

    commissions = []
    for c in data.get("commissions") or []:
        mode = (c.get("mode") or "FIXED").upper()
        item = {
            "mode": mode,
            "includes_iva": bool(c.get("includes_iva")),
            "exempt_amount": _f(c.get("exempt_amount")),
            "cfg": c,
        }
        item["fixed_net"] = None if mode == "VARIABLE" else _net_of_iva(_f(c.get("amount")), item["includes_iva"])
        commissions.append(item)

    production = []
    for p in data.get("production") or []:
        is_var = bool(p.get("is_variable"))
        item = {"is_variable": is_var, "cfg": p, "category": (p.get("category") or "OTROS")}
        # El importe tecleado puede llevar el IVA dentro (rueda de configuración del gasto):
        # para el resultado (todo en neto sin IVA) se le quita el IVA salvo si está exento.
        iva_rate = 0.0 if p.get("iva_exempt") else (_f(p.get("iva_pct", 21)) / 100.0)
        includes_iva = bool(p.get("includes_iva")) and iva_rate > 0
        item["iva_divisor"] = (1.0 + iva_rate) if includes_iva else 1.0
        # Cantidad: el importe es unitario y el total = importe · cantidad (categorías con cantidad).
        qty = _f(p.get("quantity"))
        if qty <= 0:
            qty = 1.0
        item["fixed_net"] = None if is_var else (_f(p.get("amount_net")) * qty / item["iva_divisor"])
        production.append(item)

    return {
        "agg": agg,
        "sellable": sellable,
        "is_international": bool(data.get("is_international")),
        "allows_bars": bool(data.get("allows_bars")),
        "subventions": sum(_f(x) for x in (data.get("subventions") or [])),
        "sponsorships": sum(_f(x) for x in (data.get("sponsorships") or [])),
        "caches": caches,
        "commissions": commissions,
        "production": production,
        # Ingresos omitidos / no aplican (clave -> 'OMIT'|'NA'): se calculan pero no suman.
        "income_overrides": dict(data.get("income_overrides") or {}),
    }


def evaluate(prep, tickets_sold):
    """Evalúa ingresos/gastos/resultado para un nº de entradas vendidas."""
    agg = prep["agg"]
    sellable = prep["sellable"]
    f = (tickets_sold / sellable) if sellable else 0.0
    avg = agg["avg_price_sin_iva"]

    taquilla = agg["taquilla_sin_iva"] * f
    ticket_net = agg["ticket_net"] * f
    extras_net = agg["extras_net"] * f

    # --- Cachés ---
    cache_net_total = 0.0
    retention_added = 0.0
    retention_total = 0.0
    for c in prep["caches"]:
        if c["mode"] == "VARIABLE":
            net = variable_amount(c["cfg"], tickets_sold, taquilla, avg)
            if c["includes_iva"]:
                net = net / (1.0 + IVA_GENERAL)
        else:
            net = c["fixed_net"]
        cache_net_total += net
        if c["is_intl"] and not c["retention_exempt"]:
            ret = RETENTION_PCT * net
            retention_total += ret
            if not c["includes_retention"]:
                retention_added += ret

    # --- Comisiones ---
    com_net_total = 0.0
    for c in prep["commissions"]:
        if c["mode"] == "VARIABLE":
            base_taquilla = max(taquilla - c["exempt_amount"], 0.0)
            net = variable_amount(c["cfg"], tickets_sold, base_taquilla, avg)
            if c["includes_iva"]:
                net = net / (1.0 + IVA_GENERAL)
        else:
            net = c["fixed_net"]
        com_net_total += net

    # --- Producción ---
    prod_net_total = 0.0
    prod_by_cat = {}
    for p in prep["production"]:
        if p["is_variable"]:
            net = variable_amount(p["cfg"], tickets_sold, taquilla, avg) / p["iva_divisor"]
        else:
            net = p["fixed_net"]
        prod_net_total += net
        prod_by_cat[p["category"]] = prod_by_cat.get(p["category"], 0.0) + net

    # --- Ingresos ---
    rebate = max(REBATE_PCT * taquilla - REBATE_PER_TICKET * tickets_sold, 0.0)
    barras = (BARRAS_PER_TICKET * tickets_sold) if prep["allows_bars"] else 0.0
    incentivos = INCENTIVE_PCT * (cache_net_total + prod_net_total)
    subv = prep["subventions"]
    patro = prep["sponsorships"]
    ingresos = {
        "ticketing": ticket_net, "complementos": extras_net, "rebate": rebate,
        "subvenciones": subv, "patrocinios": patro, "barras": barras,
        "incentivos": incentivos,
    }
    overrides = prep.get("income_overrides") or {}
    ingresos_total = sum(v for k, v in ingresos.items() if (overrides.get(k) or "").upper() not in ("OMIT", "NA"))
    ingresos["total"] = ingresos_total

    gastos_total = cache_net_total + retention_added + com_net_total + prod_net_total
    resultado = ingresos_total - gastos_total

    return {
        "tickets": tickets_sold,
        "ingresos": ingresos,
        "gastos": {
            "caches": cache_net_total, "retenciones": retention_added,
            "retenciones_total": retention_total, "comisiones": com_net_total,
            "produccion": prod_net_total, "produccion_por_categoria": prod_by_cat,
            "total": gastos_total,
        },
        "resultado": resultado,
    }


def break_even(prep):
    """Nº de entradas (a la venta) para empatar (resultado ≥ 0). None si no se alcanza."""
    sellable = prep["sellable"]
    if sellable <= 0:
        return None
    # Si ya empata a 0 entradas (p. ej. subvenciones grandes).
    if evaluate(prep, 0)["resultado"] >= 0:
        return 0
    for n in range(1, sellable + 1):
        if evaluate(prep, n)["resultado"] >= 0:
            return n
    return None


def series(prep, steps=10):
    """Serie de resultado por % de aforo a la venta (10%..100%)."""
    sellable = prep["sellable"]
    out = []
    for i in range(1, steps + 1):
        pct = i * (100 // steps) if steps == 10 else round(i * 100.0 / steps)
        n = int(round(sellable * pct / 100.0))
        ev = evaluate(prep, n)
        out.append({
            "pct": pct, "tickets": n,
            "ingresos": ev["ingresos"]["total"],
            "gastos": ev["gastos"]["total"],
            "resultado": ev["resultado"],
        })
    return out


def series_fine(prep):
    """Serie fina 0..100% (paso 1%) para los sliders de socios (beneficio/riesgo)."""
    sellable = prep["sellable"]
    out = []
    for pct in range(0, 101):
        n = int(round(sellable * pct / 100.0))
        ev = evaluate(prep, n)
        out.append({
            "pct": pct, "tickets": n,
            "ingresos": round(ev["ingresos"]["total"], 2),
            "gastos": round(ev["gastos"]["total"], 2),
            "resultado": round(ev["resultado"], 2),
        })
    return out


def compute(data):
    """Cálculo completo de una actividad. Devuelve cifras al 100%, serie y punto de empate."""
    prep = _prepare(data)
    agg = prep["agg"]
    at_100 = evaluate(prep, prep["sellable"])
    be = break_even(prep)
    ser = series(prep, 10)
    fine = series_fine(prep)
    max_abs = max((abs(r["resultado"]) for r in ser), default=0.0)
    return {
        "ticketing": {
            "qty": agg["qty"], "invitations": agg["invitations"], "sellable": agg["sellable"],
            "taquilla_sin_iva": agg["taquilla_sin_iva"], "sgae": agg["sgae"], "iva": agg["iva"],
            "ticket_net": agg["ticket_net"], "ticket_gross": agg["ticket_gross"],
            "extras_net": agg["extras_net"],
            "avg_price_sin_iva": agg["avg_price_sin_iva"], "avg_price_gross": agg["avg_price_gross"],
            "zones": agg["zones"],
        },
        "at_100": at_100,
        "break_even_tickets": be,
        "break_even_pct": (round(be * 100.0 / agg["sellable"], 1) if (be is not None and agg["sellable"]) else None),
        "series": ser,
        "series_fine": fine,
        "series_max_abs": max_abs,
        "avg_price_sin_iva": agg["avg_price_sin_iva"],
        "avg_price_gross": agg["avg_price_gross"],
    }
