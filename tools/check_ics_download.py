#!/usr/bin/env python3
"""Comprueba la DESCARGA REAL de un calendario iCal (`_ical_fetch` + `ics_import`).

⚠️⚠️ Esta prueba existe por un bug real: `requests` **no es un nombre global en `app.py`** (ahí
`requests` es una VARIABLE LOCAL en varias funciones de invitaciones), así que usarlo sin importarlo
dentro era un `NameError` en tiempo de ejecución → 500 → la pantalla de mantenimiento. Y no se vio
antes porque las pruebas sustituían la descarga por un texto: **el único camino que no se probaba
era justo el que fallaba**.

Sale a INTERNET (calendario público de festivos de España). Si no hay red, avisa y no falla.

    python3 tools/check_ics_download.py
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# La app necesita estas variables para importarse; con una BD falsa vale (no se toca).
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/db")
os.environ.setdefault("PGCONNECT_TIMEOUT", "2")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "t")

URL = ("https://calendar.google.com/calendar/ical/"
       "es.spain%23holiday%40group.v.calendar.google.com/public/basic.ics")


def main():
    import app as A
    import ics_import

    with A.app.test_request_context("/"):
        # webcal:// es un https:// disfrazado: iCloud los da siempre así.
        assert A._ical_normalize_url("webcal://x.icloud.com/a.ics") == "https://x.icloud.com/a.ics"
        # Lo descarga el SERVIDOR: nada de la red interna.
        assert not A._ical_url_is_safe("http://127.0.0.1/x.ics")
        assert not A._ical_url_is_safe("https://10.0.0.5/x.ics")
        assert A._ical_url_is_safe("https://p01-calendars.icloud.com/published/2/x")
        print("  OK  · webcal:// y la puerta de las URL")

        texto, error = A._ical_fetch(URL)
        if not texto and ("No se pudo abrir" in (error or "") or "Se cortó" in (error or "")):
            print("  --  · sin red: no se ha podido comprobar la descarga (%s)" % error)
            return 0
        if error:
            print("  MAL · la descarga devolvió: %s" % error)
            return 1
        print("  OK  · descarga real (%d bytes)" % len(texto))

        datos = ics_import.parse_calendar(texto, until_date=date(2023, 12, 31))
        if not datos["events"]:
            print("  MAL · el calendario no trajo ningún evento")
            return 1
        print("  OK  · %d eventos leídos (%s) y %d fuera del tope"
              % (len(datos["events"]), datos["name"], datos["skipped_after"]))
        if [e for e in datos["events"] if e["start"] > date(2023, 12, 31)]:
            print("  MAL · se ha colado un evento posterior a la fecha tope")
            return 1
        print("  OK  · la fecha tope se respeta")

        # Un enlace que responde pero NO es un calendario: aviso, nunca una excepción.
        _t, err = A._ical_fetch("https://www.google.com/")
        if not err:
            print("  MAL · una página que no es un calendario debería avisar")
            return 1
        print("  OK  · lo que no es un calendario se avisa")

    print()
    print("TODO OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
