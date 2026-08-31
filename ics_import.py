"""LECTOR DE CALENDARIOS iCal (.ics) — motor PURO (ni Flask ni base de datos).

Sirve para VOLCAR a la app un calendario de fuera (los de iCloud que se venían usando con cada
artista) y quedárselo: lo que se importa pasa a ser un dato nuestro, así que si mañana se borra el
calendario de iCloud el histórico no se pierde.

Lo que sabe leer, en orden de importancia:
  · los VEVENT de un .ics (saltando lo que va dentro de un VALARM y las zonas VTIMEZONE);
  · eventos de **día completo** (`DTSTART;VALUE=DATE`) y **con hora** (`TZID=…` o UTC con `Z`);
  · **DTEND de día completo es EXCLUSIVA** en iCal: el último día real es el anterior — es el error
    clásico al leer un .ics y hace que todo dure un día de más;
  · **DURATION** cuando no viene DTEND;
  · **eventos repetidos** (`RRULE`) — un calendario de verdad tiene ensayos semanales y
    cumpleaños—, con `EXDATE` y con las ocurrencias que se hayan editado a mano
    (`RECURRENCE-ID`), que mandan sobre la serie;
  · `STATUS:CANCELLED`, que se descarta.

⚠️ La hora se toma **tal cual se ve en el calendario**: con `TZID` se respeta la hora escrita (que
   es la que la gente leía) y solo lo que viene en **UTC** (`Z`) se pasa a la hora de España. Un
   histórico se importa para volver a verlo igual, no para recalcularlo.
⚠️ La expansión de un repetido está **acotada** (`MAX_OCCURRENCES` y la fecha tope de la
   importación): sin tope, un «todos los lunes, para siempre» no termina nunca.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

try:                                             # zona horaria de España para lo que venga en UTC
    from zoneinfo import ZoneInfo
    _TZ_MADRID = ZoneInfo("Europe/Madrid")
except Exception:                                # pragma: no cover - sin tzdata se deja en UTC
    _TZ_MADRID = None

# Tope de ocurrencias de UNA serie repetida. Un calendario de artista no tiene series más largas;
# si alguna lo fuera, se importa lo que cabe y se dice.
MAX_OCCURRENCES = 500
# Tope de eventos de una importación (red de seguridad ante un .ics enorme).
MAX_EVENTS = 5000

_WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


# ---------------------------------------------------------------------------
# Lectura de las líneas
# ---------------------------------------------------------------------------

def unfold(text: str) -> list[str]:
    """Las líneas del .ics ya desdobladas.

    ⚠️ iCal parte las líneas largas a los 75 caracteres y continúa con un espacio o un tabulador al
    principio de la siguiente: sin deshacer eso, un título largo llega cortado."""
    limpio = re.sub(r"\r?\n[ \t]", "", (text or "").replace("\r\n", "\n").replace("\r", "\n"))
    return [ln for ln in limpio.split("\n") if ln.strip()]


def parse_line(line: str) -> tuple[str, dict, str]:
    """`DTSTART;TZID=Europe/Madrid:20240315T210000` → («DTSTART», {«TZID»: «Europe/Madrid»}, valor)."""
    cabeza, _, valor = line.partition(":")
    trozos = cabeza.split(";")
    nombre = trozos[0].strip().upper()
    params = {}
    for p in trozos[1:]:
        k, _, v = p.partition("=")
        params[k.strip().upper()] = v.strip().strip('"')
    return nombre, params, valor.strip()


def unescape(value: str) -> str:
    """El texto de un campo iCal, con sus escapes deshechos."""
    return (str(value or "")
            .replace("\\N", "\n").replace("\\n", "\n")
            .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\"))


# ---------------------------------------------------------------------------
# Fechas y horas
# ---------------------------------------------------------------------------

def parse_dt(value: str, params: dict | None = None):
    """Un DTSTART/DTEND/EXDATE → `(fecha, hora|None)`. `hora` es «HH:MM»; None = día completo."""
    v = (str(value or "").strip())
    if not v:
        return None, None
    params = params or {}
    es_dia = (params.get("VALUE", "").upper() == "DATE") or (len(v) == 8 and "T" not in v)
    try:
        if es_dia:
            return date(int(v[0:4]), int(v[4:6]), int(v[6:8])), None
        if len(v) < 15 or v[8] != "T":
            return None, None
        d = datetime(int(v[0:4]), int(v[4:6]), int(v[6:8]),
                     int(v[9:11]), int(v[11:13]), int(v[13:15]))
    except (ValueError, TypeError, IndexError):
        return None, None
    # ⚠️ Solo lo que viene en UTC se convierte: con TZID se respeta la hora escrita, que es la que
    # se leía en el calendario de origen.
    if v.endswith("Z") and _TZ_MADRID is not None:
        try:
            from datetime import timezone
            d = d.replace(tzinfo=timezone.utc).astimezone(_TZ_MADRID)
        except Exception:
            pass
    return d.date(), "%02d:%02d" % (d.hour, d.minute)


def parse_duration(value: str) -> timedelta | None:
    """`P1DT2H30M` → un `timedelta`. Se usa cuando el evento no trae DTEND."""
    m = re.match(r"^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$",
                 (value or "").strip().upper())
    if not m:
        return None
    signo = -1 if m.group(1) == "-" else 1
    sem, dias, hor, mins, seg = (int(x or 0) for x in m.groups()[1:])
    total = timedelta(weeks=sem, days=dias, hours=hor, minutes=mins, seconds=seg)
    return total * signo


# ---------------------------------------------------------------------------
# Eventos repetidos
# ---------------------------------------------------------------------------

def _add_months(d: date, n: int) -> date:
    """El mismo día N meses después (el 31 en un mes de 30 se queda en el último día)."""
    y, m = divmod((d.year * 12 + (d.month - 1)) + n, 12)
    m += 1
    dia = d.day
    while dia > 0:
        try:
            return date(y, m, dia)
        except ValueError:
            dia -= 1
    return d


def expand_rrule(start: date, rule: str, *, until_date: date | None = None,
                 max_occurrences: int = MAX_OCCURRENCES) -> tuple[list[date], bool]:
    """Los días en los que cae una serie repetida. Devuelve `(fechas, se_ha_cortado)`.

    Soporta FREQ DAILY/WEEKLY/MONTHLY/YEARLY con INTERVAL, COUNT, UNTIL y BYDAY (en semanales),
    que es lo que trae un calendario normal. Lo que no entienda se queda en el evento suelto."""
    partes = {}
    for trozo in (rule or "").split(";"):
        k, _, v = trozo.partition("=")
        if k.strip():
            partes[k.strip().upper()] = v.strip()
    freq = partes.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return [start], False
    try:
        intervalo = max(1, int(partes.get("INTERVAL", "1")))
    except ValueError:
        intervalo = 1
    try:
        cuenta = int(partes["COUNT"]) if "COUNT" in partes else None
    except ValueError:
        cuenta = None
    hasta, _h = parse_dt(partes.get("UNTIL", ""))
    tope = min([d for d in (hasta, until_date) if d is not None], default=None)

    dias_semana = []
    for x in (partes.get("BYDAY", "") or "").split(","):
        clave = re.sub(r"^[+-]?\d+", "", x.strip().upper())
        if clave in _WEEKDAYS:
            dias_semana.append(_WEEKDAYS[clave])

    salida, cortado = [], False
    if freq == "WEEKLY" and dias_semana:
        # Se recorre semana a semana y dentro de cada una, los días marcados.
        lunes = start - timedelta(days=start.weekday())
        n = 0
        while True:
            for wd in sorted(dias_semana):
                d = lunes + timedelta(days=wd)
                if d < start:
                    continue
                if tope is not None and d > tope:
                    return salida, cortado
                salida.append(d)
                if cuenta is not None and len(salida) >= cuenta:
                    return salida, cortado
                if len(salida) >= max_occurrences:
                    return salida, True
            n += 1
            lunes += timedelta(weeks=intervalo)
            if tope is None and cuenta is None and n * intervalo > 520:
                return salida, True          # «para siempre» sin tope: se corta y se dice
    paso = {"DAILY": lambda d, i: d + timedelta(days=i),
            "WEEKLY": lambda d, i: d + timedelta(weeks=i),
            "MONTHLY": lambda d, i: _add_months(d, i),
            "YEARLY": lambda d, i: _add_months(d, 12 * i)}[freq]
    d, vueltas = start, 0
    while True:
        if tope is not None and d > tope:
            break
        salida.append(d)
        if cuenta is not None and len(salida) >= cuenta:
            break
        if len(salida) >= max_occurrences:
            cortado = True
            break
        vueltas += 1
        if tope is None and cuenta is None and vueltas > max_occurrences:
            cortado = True
            break
        d = paso(d, intervalo)
    return salida, cortado


# ---------------------------------------------------------------------------
# El calendario entero
# ---------------------------------------------------------------------------

def _raw_events(lines: list[str]) -> list[dict]:
    """Los VEVENT en crudo (sin lo que va dentro de un VALARM, ni las VTIMEZONE)."""
    fuera = []
    dentro, saltando, actual = False, 0, None
    for ln in lines:
        nombre, params, valor = parse_line(ln)
        arriba = valor.strip().upper()
        if nombre == "BEGIN" and arriba == "VEVENT":
            dentro, actual = True, {"_lines": []}
            continue
        if nombre == "END" and arriba == "VEVENT":
            if actual is not None:
                fuera.append(actual)
            dentro, actual, saltando = False, None, 0
            continue
        if not dentro:
            continue
        # ⚠️ Dentro de un VEVENT puede haber un VALARM con su propio TRIGGER/DESCRIPTION: si no se
        # salta, la descripción del recordatorio se cuela como la del evento.
        if nombre == "BEGIN":
            saltando += 1
            continue
        if nombre == "END":
            saltando = max(0, saltando - 1)
            continue
        if saltando:
            continue
        actual["_lines"].append((nombre, params, valor))
    return fuera


def _event_from_lines(lineas) -> dict:
    ev = {"uid": "", "summary": "", "description": "", "location": "", "rrule": "",
          "exdates": [], "recurrence_id": None, "status": "", "start": None, "start_time": None,
          "end": None, "end_time": None, "duration": None}
    for nombre, params, valor in lineas:
        if nombre == "UID":
            ev["uid"] = valor
        elif nombre == "SUMMARY":
            ev["summary"] = unescape(valor)
        elif nombre == "DESCRIPTION":
            ev["description"] = unescape(valor)
        elif nombre == "LOCATION":
            ev["location"] = unescape(valor)
        elif nombre == "STATUS":
            ev["status"] = valor.strip().upper()
        elif nombre == "RRULE":
            ev["rrule"] = valor
        elif nombre == "DTSTART":
            ev["start"], ev["start_time"] = parse_dt(valor, params)
        elif nombre == "DTEND":
            ev["end"], ev["end_time"] = parse_dt(valor, params)
        elif nombre == "DURATION":
            ev["duration"] = parse_duration(valor)
        elif nombre == "RECURRENCE-ID":
            ev["recurrence_id"], _ = parse_dt(valor, params)
        elif nombre == "EXDATE":
            for trozo in valor.split(","):
                d, _t = parse_dt(trozo, params)
                if d:
                    ev["exdates"].append(d)
    return ev


def _span(ev: dict) -> tuple[date, date, str, str]:
    """El rango real del evento: `(desde, hasta_incluido, hora_inicio, hora_fin)`."""
    inicio, hora_i = ev["start"], ev["start_time"]
    fin, hora_f = ev["end"], ev["end_time"]
    if fin is None and ev.get("duration") is not None:
        base = datetime.combine(inicio, datetime.min.time())
        if hora_i:
            h, m = hora_i.split(":")
            base = base.replace(hour=int(h), minute=int(m))
        final = base + ev["duration"]
        fin = final.date()
        hora_f = ("%02d:%02d" % (final.hour, final.minute)) if hora_i else None
        if not hora_i and final.time() == datetime.min.time():
            fin = fin - timedelta(days=1)          # duración en días completos: DTEND es exclusiva
    if fin is None:
        fin = inicio
    elif hora_i is None and hora_f is None:
        # ⚠️ En un evento de DÍA COMPLETO, DTEND es EXCLUSIVA: el último día real es el anterior.
        fin = fin - timedelta(days=1)
    if fin < inicio:
        fin = inicio
    return inicio, fin, (hora_i or ""), (hora_f or "")


def parse_calendar(text: str, *, until_date: date | None = None,
                   max_occurrences: int = MAX_OCCURRENCES) -> dict:
    """Lee un .ics entero.

    `until_date` es **hasta cuándo se vuelca** (incluido): lo que empiece después no se devuelve, que
    es lo que evita duplicar con lo que ya está en la app. También acota los eventos repetidos.

    Devuelve `{"name", "events", "skipped_after", "truncated", "warnings"}`; cada evento trae
    `uid`, `key` (la clave con la que se deduplica, que en un repetido lleva su día), `summary`,
    `description`, `location`, `start`, `end` (incluida), `start_time`, `end_time` y `recurring`.
    """
    lineas = unfold(text)
    nombre_cal = ""
    for nombre, _p, valor in (parse_line(ln) for ln in lineas):
        if nombre in ("X-WR-CALNAME", "NAME") and not nombre_cal:
            nombre_cal = unescape(valor)
    crudos = [_event_from_lines(e["_lines"]) for e in _raw_events(lineas)]

    # Las ocurrencias EDITADAS a mano (RECURRENCE-ID) mandan sobre su serie: se apuntan para no
    # pintar además la de la regla ese día.
    editadas = {(e["uid"], e["recurrence_id"]) for e in crudos if e.get("recurrence_id")}

    eventos, saltados, cortado = [], 0, False
    avisos = []
    for ev in crudos:
        if not ev["start"]:
            continue
        if ev["status"] == "CANCELLED":
            continue
        inicio, fin, hora_i, hora_f = _span(ev)
        largo = (fin - inicio).days
        dias = [inicio]
        repetido = False
        if ev["rrule"] and not ev.get("recurrence_id"):
            dias, corte = expand_rrule(inicio, ev["rrule"], until_date=until_date,
                                       max_occurrences=max_occurrences)
            repetido = len(dias) > 1 or bool(ev["rrule"])
            cortado = cortado or corte
        fuera = set(ev["exdates"])
        # La identidad de una ocurrencia EDITADA es la de su hueco en la serie (`RECURRENCE-ID`),
        # no el día al que se haya movido: así al reimportar no se duplica.
        recid = ev.get("recurrence_id")
        for d in dias:
            # ⚠️ La lista de ocurrencias editadas excluye las que pinta la REGLA, nunca al propio
            # evento editado (si no, se excluiría a sí mismo y esa fecha se perdería).
            if d in fuera or (not recid and (ev["uid"], d) in editadas):
                continue
            if until_date is not None and d > until_date:
                saltados += 1
                continue
            eventos.append({
                "uid": ev["uid"],
                "key": ("%s@%s" % (ev["uid"], (recid or d).isoformat())
                        if (repetido or recid) else (ev["uid"] or "")),
                "summary": (ev["summary"] or "").strip(),
                "description": (ev["description"] or "").strip(),
                "location": (ev["location"] or "").strip(),
                "start": d,
                "end": d + timedelta(days=largo),
                "start_time": hora_i,
                "end_time": hora_f,
                "recurring": repetido,
            })
            if len(eventos) >= MAX_EVENTS:
                cortado = True
                break
        if len(eventos) >= MAX_EVENTS:
            avisos.append("El calendario trae más de %d eventos: se ha importado lo que cabe."
                          % MAX_EVENTS)
            break
    if cortado:
        avisos.append("Alguna serie repetida no tiene fin: se ha volcado hasta donde llega el tope.")
    eventos.sort(key=lambda x: (x["start"], x["summary"]))
    return {"name": nombre_cal, "events": eventos, "skipped_after": saltados,
            "truncated": cortado, "warnings": avisos}
