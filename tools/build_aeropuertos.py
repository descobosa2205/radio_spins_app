#!/usr/bin/env python3
"""EL CATÁLOGO DE AEROPUERTOS de la hoja de ruta (sep 2026).

Baja el catálogo público de OurAirports (dominio público) y deja en `static/data/aeropuertos.json`
solo lo que sirve para montar un vuelo: los aeropuertos CON CÓDIGO IATA que son grandes, medianos o
pequeños con vuelos regulares (los helipuertos, las pistas privadas y los cerrados sobran). Lo lee
`transport_places.search_airports` (el buscador «nombre + código» del asistente de un vuelo).

    /tmp/python/bin/python3 tools/build_aeropuertos.py

Se pasa una vez y se sube el JSON al repo: en producción no se descarga nada.
"""
import csv
import io
import json
import pathlib
import urllib.request

URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
SALIDA = pathlib.Path(__file__).resolve().parent.parent / "static" / "data" / "aeropuertos.json"
TAMANO = {"large_airport": 3, "medium_airport": 2, "small_airport": 1}


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "app33-backoffice/1.0 (aeropuertos)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        texto = resp.read().decode("utf-8")
    filas = []
    for row in csv.DictReader(io.StringIO(texto)):
        tipo = (row.get("type") or "").strip()
        iata = (row.get("iata_code") or "").strip().upper()
        if tipo not in TAMANO or not iata or len(iata) != 3:
            continue
        # Los pequeños solo si tienen vuelos regulares (Melilla, La Gomera…); los grandes y medianos, todos.
        if tipo == "small_airport" and (row.get("scheduled_service") or "").strip().lower() != "yes":
            continue
        try:
            lat, lng = float(row["latitude_deg"]), float(row["longitude_deg"])
        except Exception:
            continue
        filas.append({
            "iata": iata,
            "name": (row.get("name") or "").strip(),
            "city": (row.get("municipality") or "").strip(),
            "country": (row.get("iso_country") or "").strip().upper(),
            "lat": round(lat, 5), "lng": round(lng, 5),
            "size": TAMANO[tipo],
            # Otros nombres por los que se conoce (OurAirports los trae en `keywords`): «Barajas».
            "kw": (row.get("keywords") or "").strip()[:160],
        })
    filas.sort(key=lambda a: (-a["size"], a["country"], a["name"]))
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(filas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("%d aeropuertos → %s (%d KB)" % (len(filas), SALIDA, SALIDA.stat().st_size // 1024))


if __name__ == "__main__":
    main()
