"""Motor PURO del mapa de butacas del recinto (espejo de static/js/venue_map.js).

Expande el `layout_json` paramétrico de un VenueSeatMap (secciones arc/grid/box/floor con
escaleras integradas, huecos y apagadas) y sus `assignments_json` (rangos butaca→categoría por
fila) a CONTEOS: aforo por sección, butacas por categoría y zona, y la plantilla de ticketing
que se ofrece a las simulaciones (mismo formato que `_venue_ticketing_payload`).

Sin dependencias de Flask/BD (como sim_calc.py): testeable en local con el venv.

Convenciones (deben coincidir 1:1 con el JS):
- arc  : butacas por fila = max(2, floor(radio_fila · amplitud_rad / paso)); radio_fila = r0 + f·rowGap.
- grid/box: filas × columnas.
- Escalera integrada {at, w}: corta los slots cuya distancia física al eje < w·pitch/2 + pitch/2.
- mods por fila (índice 1-based): gaps (no existe la butaca) y off (existe, no se ofrece).
  Ninguna de las dos suma aforo; los cortes de escalera tampoco.
- assignments: {sec: {"<fila>": [[desde, hasta, catId], ...], "__floor": catId}} con slots 1-based;
  solo cuentan las claves que caen en butacas VÁLIDAS (estado seat) — igual que el prune del JS.
- Zona (para simulaciones): floor→PISTA, box→PALCO, arc→GRADA, grid→PISTA si su nombre contiene
  «pista» (pista sentada), si no GRADA. El mapa no guarda zona explícita; esta derivación es la
  misma que asume la UI.
"""

import math
import unicodedata

RAD = math.pi / 180.0


def _f(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def _i(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return int(default)


def _fold(text):
    s = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()


def section_zone(sec: dict) -> str:
    kind = (sec.get("kind") or "").lower()
    if kind == "floor":
        return "PISTA"
    if kind == "box":
        return "PALCO"
    if kind in ("grid", "points") and "pista" in _fold(sec.get("name")):
        return "PISTA"
    return "GRADA"


def _row_states(sec: dict, row_idx: int) -> list:
    """Estados de los slots (1-based → lista 0-based) de la fila `row_idx` (1-based):
    'seat' | 'gap' | 'off' | 'stair'. Réplica de secRows() del JS."""
    kind = (sec.get("kind") or "").lower()
    pitch = _f(sec.get("pitch"), 26) or 26
    stairs = sec.get("stairs") or []
    mods = (sec.get("mods") or {}).get(str(row_idx)) or {}
    gaps = set(_i(x) for x in (mods.get("gaps") or []))
    off = set(_i(x) for x in (mods.get("off") or []))

    if kind == "arc":
        r0 = _f(sec.get("r0"), 900)
        row_gap = _f(sec.get("rowGap"), 30)
        span = _f(sec.get("span"), 24)
        radius = r0 + (row_idx - 1) * row_gap
        count = max(2, int(math.floor((radius * span * RAD) / pitch))) if span > 0 else 2
        states = []
        for i in range(count):
            frac = (i + 0.5) / count
            in_stair = any(
                abs(frac - _f(b.get("at"), 0.5)) * span * RAD * radius < (_f(b.get("w"), 1.2) * pitch) / 2 + pitch * 0.5
                for b in stairs if isinstance(b, dict)
            )
            slot = i + 1
            states.append("stair" if in_stair else ("gap" if slot in gaps else ("off" if slot in off else "seat")))
        return states

    if kind in ("grid", "box"):
        cols = max(1, _i(sec.get("cols"), 1))
        width = cols * pitch
        states = []
        for i in range(cols):
            lx = (i - (cols - 1) / 2.0) * pitch
            in_stair = any(
                abs(lx - (_f(b.get("at"), 0.5) - 0.5) * width) < (_f(b.get("w"), 1.2) * pitch) / 2 + pitch * 0.5
                for b in stairs if isinstance(b, dict)
            )
            slot = i + 1
            states.append("stair" if in_stair else ("gap" if slot in gaps else ("off" if slot in off else "seat")))
        return states

    if kind == "points":
        # Asientos detectados de un plano: los slots (1-based, contiguos por fila) salen de sec['seats'].
        rm = {}
        for st in (sec.get("seats") or []):
            if not isinstance(st, dict):
                continue
            rm.setdefault(_i(st.get("row"), 1), []).append(_i(st.get("slot"), 1))
        states = []
        for slot in sorted(rm.get(row_idx) or []):
            states.append("gap" if slot in gaps else ("off" if slot in off else "seat"))
        return states

    return []


def expand_section(sec: dict) -> dict:
    """Butacas válidas de una sección: {'rows': {fila: set(slots seat)}, 'count': N, 'zone': Z}."""
    kind = (sec.get("kind") or "").lower()
    zone = section_zone(sec)
    if kind == "floor":
        return {"rows": {}, "count": 0, "zone": zone, "cap": max(_i(sec.get("cap")), 0)}
    rows = {}
    total = 0
    for r in range(1, max(1, _i(sec.get("rows"), 1)) + 1):
        valid = set()
        for i, state in enumerate(_row_states(sec, r)):
            if state == "seat":
                valid.add(i + 1)
        rows[str(r)] = valid
        total += len(valid)
    return {"rows": rows, "count": total, "zone": zone, "cap": 0}


def category_counts(layout: dict, assignments: dict) -> dict:
    """Conteos del mapa: por categoría (id → {'name','kind','color','total', zonas}) y totales.

    Devuelve {'cats': {catId: {...}}, 'unassigned': {zona: n}, 'seated': n, 'standing': n,
    'floors': [{'name','cap','cat'}]}. Las claves de asignación que ya no caen en butaca válida
    se IGNORAN (mismo criterio que el prune del editor)."""
    layout = layout if isinstance(layout, dict) else {}
    assignments = assignments if isinstance(assignments, dict) else {}
    sections = [s for s in (layout.get("sections") or []) if isinstance(s, dict)]
    cats_meta = {c.get("id"): c for c in (layout.get("categories") or []) if isinstance(c, dict) and c.get("id")}

    cats = {}
    for cid, c in cats_meta.items():
        cats[cid] = {"name": c.get("name") or cid, "kind": (c.get("kind") or "otros").lower(),
                     "color": c.get("color") or "", "total": 0, "zones": {}}

    def add_cat(cid, zone, n):
        if n <= 0:
            return
        row = cats.setdefault(cid, {"name": str(cid), "kind": "otros", "color": "", "total": 0, "zones": {}})
        row["total"] += n
        row["zones"][zone] = row["zones"].get(zone, 0) + n

    unassigned = {}
    seated = 0
    standing = 0
    floors = []
    for sec in sections:
        sid = str(sec.get("id") or "")
        info = expand_section(sec)
        if (sec.get("kind") or "").lower() == "floor":
            cap = info["cap"]
            standing += cap
            fcat = (assignments.get(sid) or {}).get("__floor") if isinstance(assignments.get(sid), dict) else None
            floors.append({"name": sec.get("name") or "Zona de pie", "cap": cap, "cat": fcat})
            if fcat:
                add_cat(fcat, "PISTA", cap)
            else:
                unassigned["PISTA"] = unassigned.get("PISTA", 0) + cap
            continue
        seated += info["count"]
        assigned_here = 0
        sec_assign = assignments.get(sid) if isinstance(assignments.get(sid), dict) else {}
        for row_key, ranges in (sec_assign or {}).items():
            if row_key == "__floor" or not isinstance(ranges, list):
                continue
            valid = info["rows"].get(str(row_key)) or set()
            for rg in ranges:
                if not (isinstance(rg, list) and len(rg) >= 3):
                    continue
                lo, hi, cid = _i(rg[0]), _i(rg[1]), rg[2]
                n = sum(1 for slot in range(lo, hi + 1) if slot in valid)
                add_cat(cid, info["zone"], n)
                assigned_here += n
        rest = info["count"] - assigned_here
        if rest > 0:
            unassigned[info["zone"]] = unassigned.get(info["zone"], 0) + rest
    return {"cats": cats, "unassigned": unassigned, "seated": seated, "standing": standing, "floors": floors}


def _alpha_label(n: int) -> str:
    """1→A, 26→Z, 27→AA… (mismo esquema que el JS)."""
    s = ""
    while n > 0:
        n -= 1
        s = chr(65 + (n % 26)) + s
        n //= 26
    return s


def _norm_label(text) -> str:
    """Normaliza para casar textos de PDF con el mapa: minúsculas, sin acentos y solo
    alfanumérico colapsado (« Grada-Baja  201 » ≡ «grada baja 201»)."""
    folded = _fold(text)
    out = []
    prev_space = True
    for ch in folded:
        if ch.isalnum():
            out.append(ch)
            prev_space = False
        elif not prev_space:
            out.append(" ")
            prev_space = True
    return "".join(out).strip()


def _row_numbering(sec: dict, row_idx: int, states: list) -> dict:
    """Número IMPRESO → slot físico de una fila (réplica de la numeración del JS: inicio, modo
    consecutivos/impares/pares, sentido, y política de hueco «salta»/«renumera»; las apagadas
    conservan su número; los cortes de escalera no consumen; los OVERRIDES por butaca —números
    puestos a mano con la herramienta №— sustituyen al calculado)."""
    num = sec.get("num") or {}
    try:
        start = int(num.get("start"))
    except (TypeError, ValueError):
        start = 1
    # Modo explícito (seq/odd/even); compat con mapas antiguos que solo guardaban step 1/2.
    mode = num.get("mode") or ("even" if (_i(num.get("step"), 1) == 2 and start % 2 == 0)
                               else ("odd" if _i(num.get("step"), 1) == 2 else "seq"))
    step = 1
    if mode == "odd":
        step = 2
        if start % 2 == 0:
            start += 1
    elif mode == "even":
        step = 2
        if start % 2 != 0:
            start += 1
    order = range(len(states) - 1, -1, -1) if (num.get("dir") == "rtl") else range(len(states))
    gap_policy = (sec.get("gapPolicy") or "skip")
    counter = start
    out = {}
    slot_number = {}
    for i in order:
        state = states[i]
        if state == "stair":
            continue
        if state == "gap":
            if gap_policy == "skip":
                counter += step
            continue
        slot_number[i + 1] = str(counter)
        counter += step
    overrides = sec.get("numOverrides") or {}
    for slot, number in slot_number.items():
        ov = overrides.get("%s|%s" % (row_idx, slot))
        if ov is not None and str(ov).strip() != "":
            number = str(ov).strip()
        out[_norm_label(number) if not str(number).isdigit() else str(int(number))] = slot
    return out


def seat_lookup(layout: dict) -> dict:
    """Índice para casar textos de entradas (PDF) con el mapa del recinto:
    {nombre_o_alias_normalizado: {"sec": id, "rows": {etiqueta_norm: rowIdx},
    "numbers": {rowIdx: {numero_impreso: slot}}}}. Las filas se indexan por su etiqueta
    (número o letra) y también por su índice, por si el PDF y el mapa difieren de esquema."""
    lookup = {}
    for sec in (layout.get("sections") or []) if isinstance(layout, dict) else []:
        if not isinstance(sec, dict) or (sec.get("kind") or "").lower() == "floor":
            continue
        sid = str(sec.get("id") or "")
        n_rows = max(1, _i(sec.get("rows"), 1))
        rows_map = {}
        numbers = {}
        alpha = (sec.get("rowScheme") == "alpha")
        # «Primera fila» configurable (3 → 3,4,5… / C,D,E…). El 0 es VÁLIDO (fila 0), no ausencia:
        # paridad con rowLabelOf del JS (solo None/no numérico caen al 1).
        row_start = _i(sec.get("rowStart"), 1) if sec.get("rowStart") is not None else 1
        for r in range(1, n_rows + 1):
            n_lbl = row_start - 1 + r
            label = _alpha_label(n_lbl) if alpha else str(n_lbl)
            rows_map[_norm_label(label)] = r
            rows_map.setdefault(_norm_label(str(r)), r)
            numbers[r] = _row_numbering(sec, r, _row_states(sec, r))
        entry = {"sec": sid, "rows": rows_map, "numbers": numbers}
        names = [sec.get("name") or ""] + [a for a in str(sec.get("aliases") or "").split(",")]
        for nm in names:
            key = _norm_label(nm)
            if key:
                lookup.setdefault(key, entry)
    return lookup


def match_ticket(lookup: dict, sector, row_label, seat_number):
    """Casa (sector, fila, asiento) de una entrada con el mapa → "sec|rowIdx|slot" o None."""
    entry = lookup.get(_norm_label(sector))
    if not entry:
        return None
    row_idx = entry["rows"].get(_norm_label(row_label))
    if not row_idx:
        return None
    seat_txt = _norm_label(seat_number)
    if seat_txt.isdigit():
        seat_txt = str(int(seat_txt))   # «07» ≡ «7»
    slot = (entry["numbers"].get(row_idx) or {}).get(seat_txt)
    if not slot:
        return None
    return "%s|%s|%s" % (entry["sec"], row_idx, slot)


ZONE_ORDER = {"PISTA": 0, "GRADA": 1, "PALCO": 2}


def ticketing_template(layout: dict, assignments: dict) -> list:
    """Plantilla de ticketing para SIMULACIONES desde el reparto del mapa (mismo formato que
    `_venue_ticketing_payload`: [{zone, name, qty, inv, extras: []}], sin precios).

    Reglas: categorías de VENTA (kind venta/otros) → aforo vendible; INVITACIONES y RESERVA →
    qty=inv (retenidas, no a la venta); BLOQUEO técnico → fuera del aforo; butacas sin categoría
    → línea «Sin categoría» por zona; zonas de pie sin categoría → línea propia con su aforo."""
    data = category_counts(layout, assignments)
    rows = []
    for cid, c in data["cats"].items():
        kind = c["kind"]
        if kind == "bloqueo":
            continue
        retained = kind in ("invitaciones", "reserva")
        for zone, n in c["zones"].items():
            rows.append({"zone": zone, "name": c["name"], "qty": n, "inv": (n if retained else 0), "extras": []})
    for zone, n in data["unassigned"].items():
        # Las zonas de pie sin categoría ya salen con su nombre propio (abajo); esto es lo sentado.
        floor_uncat = sum(f["cap"] for f in data["floors"] if not f.get("cat")) if zone == "PISTA" else 0
        seated_rest = n - floor_uncat
        if seated_rest > 0:
            rows.append({"zone": zone, "name": "Sin categoría", "qty": seated_rest, "inv": 0, "extras": []})
    for f in data["floors"]:
        if not f.get("cat") and f["cap"] > 0:
            rows.append({"zone": "PISTA", "name": f["name"], "qty": f["cap"], "inv": 0, "extras": []})
    rows.sort(key=lambda r: (ZONE_ORDER.get(r["zone"], 9), -r["qty"], r["name"]))
    return rows
