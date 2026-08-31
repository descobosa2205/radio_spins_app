#!/usr/bin/env python3
"""Prueba de regresión del lector de calendarios iCal (`ics_import.py`).

Cubre las trampas que de verdad aparecen en un calendario de iCloud: el DTEND de día completo
(que es EXCLUSIVA), las líneas partidas a los 75 caracteres, los VALARM dentro del evento, los
eventos repetidos con su EXDATE y sus ocurrencias editadas a mano, la hora en UTC y el corte por
fecha. Si se toca el motor, esto tiene que seguir en verde:

    python3 tools/check_ics_import.py
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ics_import as ics                                            # noqa: E402

ICS = "\r\n".join([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Apple Inc.//iOS 17.4//EN",
    "X-WR-CALNAME:Los Ñus",
    # 1) Día completo de UN día: DTEND es el día siguiente (exclusiva).
    "BEGIN:VEVENT",
    "UID:uno@icloud.com",
    "SUMMARY:Concierto Sala Apolo",
    "LOCATION:Barcelona",
    "DTSTART;VALUE=DATE:20240315",
    "DTEND;VALUE=DATE:20240316",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Recordatorio",
    "END:VALARM",
    "END:VEVENT",
    # 2) Día completo de TRES días.
    "BEGIN:VEVENT",
    "UID:dos@icloud.com",
    "SUMMARY:Gira norte",
    "DTSTART;VALUE=DATE:20240401",
    "DTEND;VALUE=DATE:20240404",
    "END:VEVENT",
    # 3) Con hora local (TZID): se respeta la hora escrita. Y el título va PARTIDO en dos líneas.
    "BEGIN:VEVENT",
    "UID:tres@icloud.com",
    "SUMMARY:Prueba de sonido y entrevista con la radio muni",
    " cipal",
    "DTSTART;TZID=Europe/Madrid:20240315T170000",
    "DTEND;TZID=Europe/Madrid:20240315T183000",
    "END:VEVENT",
    # 4) En UTC: se pasa a la hora de España (verano: +2).
    "BEGIN:VEVENT",
    "UID:cuatro@icloud.com",
    "SUMMARY:Videollamada",
    "DTSTART:20240610T080000Z",
    "DTEND:20240610T090000Z",
    "END:VEVENT",
    # 5) Repetido semanal con EXDATE y una ocurrencia editada a mano.
    "BEGIN:VEVENT",
    "UID:cinco@icloud.com",
    "SUMMARY:Ensayo",
    "DTSTART;TZID=Europe/Madrid:20240108T190000",
    "DTEND;TZID=Europe/Madrid:20240108T210000",
    "RRULE:FREQ=WEEKLY;COUNT=4",
    "EXDATE;TZID=Europe/Madrid:20240115T190000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:cinco@icloud.com",
    "RECURRENCE-ID;TZID=Europe/Madrid:20240122T190000",
    "SUMMARY:Ensayo (en el local nuevo)",
    "DTSTART;TZID=Europe/Madrid:20240122T200000",
    "DTEND;TZID=Europe/Madrid:20240122T220000",
    "END:VEVENT",
    # 6) Cancelado: no se importa.
    "BEGIN:VEVENT",
    "UID:seis@icloud.com",
    "SUMMARY:Bolo que se cayó",
    "STATUS:CANCELLED",
    "DTSTART;VALUE=DATE:20240520",
    "DTEND;VALUE=DATE:20240521",
    "END:VEVENT",
    # 7) Sin DTEND, con DURATION.
    "BEGIN:VEVENT",
    "UID:siete@icloud.com",
    "SUMMARY:Firma de discos",
    "DTSTART;TZID=Europe/Madrid:20240701T180000",
    "DURATION:PT2H",
    "END:VEVENT",
    # 8) Con escapes en el texto.
    "BEGIN:VEVENT",
    "UID:ocho@icloud.com",
    "SUMMARY:Cena con el promotor\\, Paco",
    "DESCRIPTION:Primera línea\\nSegunda línea",
    "DTSTART;VALUE=DATE:20240902",
    "DTEND;VALUE=DATE:20240903",
    "END:VEVENT",
    # 9) DESPUÉS del corte: no se vuelca.
    "BEGIN:VEVENT",
    "UID:nueve@icloud.com",
    "SUMMARY:Ya está en la app",
    "DTSTART;VALUE=DATE:20261001",
    "DTEND;VALUE=DATE:20261002",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
])

FALLOS = []


def comprueba(titulo, condicion, detalle=""):
    if condicion:
        print("  OK  · %s" % titulo)
    else:
        FALLOS.append(titulo)
        print("  MAL · %s%s" % (titulo, (" → " + detalle) if detalle else ""))


def por_uid(res, uid):
    return [e for e in res["events"] if e["uid"] == uid]


def main():
    res = ics.parse_calendar(ICS, until_date=date(2026, 8, 31))
    print("Calendario: %r · %d eventos" % (res["name"], len(res["events"])))

    comprueba("el nombre del calendario", res["name"] == "Los Ñus", res["name"])

    e = por_uid(res, "uno@icloud.com")[0]
    comprueba("un día completo dura UN día (DTEND es exclusiva)",
              e["start"] == date(2024, 3, 15) and e["end"] == date(2024, 3, 15),
              "%s → %s" % (e["start"], e["end"]))
    comprueba("el sitio se lee", e["location"] == "Barcelona", e["location"])
    comprueba("el VALARM no se cuela como descripción", e["description"] == "", e["description"])

    e = por_uid(res, "dos@icloud.com")[0]
    comprueba("un rango de tres días llega entero",
              e["start"] == date(2024, 4, 1) and e["end"] == date(2024, 4, 3),
              "%s → %s" % (e["start"], e["end"]))

    e = por_uid(res, "tres@icloud.com")[0]
    comprueba("el título partido a los 75 caracteres se recompone",
              e["summary"] == "Prueba de sonido y entrevista con la radio municipal", e["summary"])
    comprueba("con TZID se respeta la hora escrita",
              (e["start_time"], e["end_time"]) == ("17:00", "18:30"),
              "%s-%s" % (e["start_time"], e["end_time"]))

    e = por_uid(res, "cuatro@icloud.com")[0]
    comprueba("en UTC se pasa a la hora de España", e["start_time"] == "10:00", e["start_time"])

    serie = sorted(por_uid(res, "cinco@icloud.com"), key=lambda x: x["start"])
    dias = [x["start"].isoformat() for x in serie]
    comprueba("el repetido se expande sin el EXDATE y sin la ocurrencia editada",
              dias == ["2024-01-08", "2024-01-22", "2024-01-29"], str(dias))
    editada = [x for x in serie if x["start"] == date(2024, 1, 22)][0]
    comprueba("manda la ocurrencia editada a mano",
              editada["summary"] == "Ensayo (en el local nuevo)" and editada["start_time"] == "20:00",
              "%s %s" % (editada["summary"], editada["start_time"]))
    claves = {x["key"] for x in serie}
    comprueba("cada ocurrencia tiene su propia clave (no se pisan)", len(claves) == 3, str(claves))

    comprueba("un evento CANCELADO no se importa", not por_uid(res, "seis@icloud.com"))

    e = por_uid(res, "siete@icloud.com")[0]
    comprueba("sin DTEND se aplica la DURATION",
              e["start"] == date(2024, 7, 1) and e["end_time"] == "20:00", e["end_time"])

    e = por_uid(res, "ocho@icloud.com")[0]
    comprueba("los escapes del texto se deshacen",
              e["summary"] == "Cena con el promotor, Paco"
              and e["description"] == "Primera línea\nSegunda línea",
              repr(e["summary"]))

    comprueba("lo posterior al corte NO se vuelca", not por_uid(res, "nueve@icloud.com"))
    comprueba("y se dice cuántos se han saltado", res["skipped_after"] == 1,
              str(res["skipped_after"]))

    # Un repetido SIN FIN se corta y se avisa (si no, no termina nunca).
    infinito = "\r\n".join([
        "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x@x", "SUMMARY:Semanal",
        "DTSTART;VALUE=DATE:20200106", "DTEND;VALUE=DATE:20200107",
        "RRULE:FREQ=WEEKLY", "END:VEVENT", "END:VCALENDAR", ""])
    r2 = ics.parse_calendar(infinito, until_date=date(2026, 8, 31))
    comprueba("un repetido sin fin se acota a la fecha tope",
              r2["events"] and r2["events"][-1]["start"] <= date(2026, 8, 31),
              str(r2["events"][-1]["start"] if r2["events"] else "—"))

    # Sin fecha tope tampoco puede quedarse dando vueltas.
    r3 = ics.parse_calendar(infinito)
    comprueba("sin fecha tope, se corta y se avisa",
              r3["truncated"] and len(r3["events"]) <= ics.MAX_OCCURRENCES,
              "%d eventos" % len(r3["events"]))

    # Un .ics vacío o basura no revienta.
    comprueba("un texto que no es un calendario no revienta",
              ics.parse_calendar("hola")["events"] == [])

    print()
    if FALLOS:
        print("FALLAN %d comprobaciones: %s" % (len(FALLOS), "; ".join(FALLOS)))
        return 1
    print("TODO OK (%d comprobaciones)" % 17)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
