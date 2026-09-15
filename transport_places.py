# transport_places.py
#
# Motor PURO (sin BD y sin Flask, como el resto de los `*_utils.py`) para LOS SITIOS DE UN TRASLADO
# de la hoja de ruta y la ESTIMACIÓN de su ruta (sep 2026, lo pidió Dani):
#
#   · AEROPUERTOS con su código IATA: del catálogo público de OurAirports guardado en
#     `static/data/aeropuertos.json` (lo genera `tools/build_aeropuertos.py`; en producción no se
#     descarga nada). Se busca por código, por ciudad y por nombre, sin acentos ni mayúsculas.
#   · ESTACIONES de tren, PUERTOS (estaciones marítimas) y ESTACIONES DE AUTOBUSES: Photon (komoot,
#     sobre OpenStreetMap; el mismo proveedor que el autocompletado de direcciones) filtrando por la
#     ETIQUETA OSM (`osm_tag=railway:station`…), que es lo que hace que «Atocha» devuelva la estación
#     y no la calle. ⚠️ Photon no habla español (`lang=es` da error): se pide en `en`, pero los nombres
#     salen tal cual están en OSM (en su idioma).
#   · LA RUTA (kilómetros y duración en coche) con el router público de OSRM sobre OpenStreetMap,
#     gratis y sin clave. Es una AYUDA: si no responde, se escribe la duración a mano.
from __future__ import annotations

import json
import pathlib
import unicodedata
import urllib.parse
import urllib.request

PHOTON_URL = "https://photon.komoot.io/api/"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving/"
_UA = "app33-backoffice/1.0 (hoja de ruta)"
_TIMEOUT = 8
AIRPORTS_JSON = pathlib.Path(__file__).resolve().parent / "static" / "data" / "aeropuertos.json"

# Qué etiqueta de OSM es cada tipo de sitio. Un puerto puede estar como estación marítima
# (`amenity=ferry_terminal`) o como puerto (`harbour`): se piden las dos.
OSM_TAGS = {
    "STATION": ["railway:station"],
    "PORT": ["amenity:ferry_terminal", "harbour"],
    "BUS": ["amenity:bus_station"],
}
# Sesgo hacia España (Madrid) para que «Sevilla» devuelva la estación de autobuses de Sevilla y no la
# de Bogotá: es un sesgo, no un filtro (un vuelo o un tren pueden ser fuera).
_BIAS = {"lat": 40.4168, "lon": -3.7038}

# Los países que salen en un catálogo de aeropuertos, en español (OurAirports trae el código ISO).
# Lo que no esté aquí sale con su código, que también se entiende.
PAISES = {
    "ES": "España", "PT": "Portugal", "FR": "Francia", "IT": "Italia", "DE": "Alemania", "GB": "Reino Unido",
    "IE": "Irlanda", "NL": "Países Bajos", "BE": "Bélgica", "CH": "Suiza", "AT": "Austria", "DK": "Dinamarca",
    "SE": "Suecia", "NO": "Noruega", "FI": "Finlandia", "PL": "Polonia", "CZ": "Chequia", "HU": "Hungría",
    "GR": "Grecia", "TR": "Turquía", "MA": "Marruecos", "US": "Estados Unidos", "MX": "México", "AR": "Argentina",
    "CL": "Chile", "CO": "Colombia", "PE": "Perú", "BR": "Brasil", "UY": "Uruguay", "EC": "Ecuador",
    "VE": "Venezuela", "CU": "Cuba", "DO": "Rep. Dominicana", "PR": "Puerto Rico", "CA": "Canadá",
    "JP": "Japón", "CN": "China", "AE": "Emiratos Árabes", "QA": "Catar", "IL": "Israel", "EG": "Egipto",
    "AU": "Australia", "RO": "Rumanía", "BG": "Bulgaria", "HR": "Croacia", "RS": "Serbia", "IS": "Islandia",
    "LU": "Luxemburgo", "MT": "Malta", "CY": "Chipre", "AD": "Andorra", "GI": "Gibraltar",
}


# Photon devuelve el país en inglés (`lang=en`): los habituales, en español.
PAISES_EN = {"Spain": "España", "France": "Francia", "Portugal": "Portugal", "Italy": "Italia", "Germany": "Alemania",
             "United Kingdom": "Reino Unido", "Netherlands": "Países Bajos", "Belgium": "Bélgica", "Switzerland": "Suiza",
             "Austria": "Austria", "Morocco": "Marruecos", "United States": "Estados Unidos", "Mexico": "México",
             "Argentina": "Argentina", "Colombia": "Colombia", "Chile": "Chile", "Peru": "Perú", "Brazil": "Brasil",
             "Andorra": "Andorra", "Ireland": "Irlanda", "Greece": "Grecia", "Poland": "Polonia", "Denmark": "Dinamarca",
             "Sweden": "Suecia", "Norway": "Noruega", "Finland": "Finlandia", "Czechia": "Chequia", "Hungary": "Hungría",
             "Turkey": "Turquía", "Croatia": "Croacia", "Romania": "Rumanía", "Bulgaria": "Bulgaria"}


def norm(value) -> str:
    texto = unicodedata.normalize("NFD", str(value or "").strip().lower())
    return "".join(ch for ch in texto if unicodedata.category(ch) != "Mn")


def duration_label(minutes) -> str:
    """«1 h 20 min» · «45 min»: como se escribe en una hoja de ruta."""
    try:
        m = int(round(float(minutes)))
    except Exception:
        return ""
    if m <= 0:
        return ""
    h, r = divmod(m, 60)
    if not h:
        return "%d min" % r
    return ("%d h" % h) if not r else ("%d h %02d min" % (h, r))


class _Cache:
    airports: list[dict] | None = None


def airports() -> list[dict]:
    """El catálogo, cargado UNA vez por proceso (con la clave de búsqueda ya normalizada)."""
    if _Cache.airports is not None:
        return _Cache.airports
    filas = []
    try:
        for a in json.loads(AIRPORTS_JSON.read_text(encoding="utf-8")):
            a = dict(a)
            a["_iata"] = norm(a.get("iata"))
            a["_city"] = norm(a.get("city"))
            a["_kw"] = norm(" ".join([a.get("name") or "", a.get("city") or "", a.get("kw") or ""]))
            filas.append(a)
    except Exception:
        filas = []
    _Cache.airports = filas
    return filas


def _airport_row(a: dict) -> dict:
    pais = PAISES.get(a.get("country") or "", a.get("country") or "")
    return {"kind": "AIRPORT", "code": a.get("iata") or "", "label": a.get("name") or "",
            "sub": ", ".join([x for x in [a.get("city") or "", pais] if x]),
            "lat": a.get("lat"), "lng": a.get("lng")}


def search_airports(query: str, limit: int = 8) -> list[dict]:
    """Aeropuertos que casan con lo escrito: primero el CÓDIGO exacto («MAD»), luego el código que
    empieza así, la ciudad y el nombre (o su otro nombre: «Barajas»). Los grandes delante."""
    k = norm(query)
    if len(k) < 2:
        return []
    puntuados = []
    for a in airports():
        if a["_iata"] and a["_iata"] == k:
            score = 0
        elif a["_iata"] and a["_iata"].startswith(k):
            score = 1
        elif a["_city"].startswith(k):
            score = 2
        elif k in a["_kw"]:
            score = 3
        else:
            continue
        puntuados.append((score, -int(a.get("size") or 0), a.get("name") or "", a))
    puntuados.sort(key=lambda t: (t[0], t[1], t[2]))
    return [_airport_row(a) for _s, _z, _n, a in puntuados[:limit]]


def _photon_rows(features, kind: str) -> list[dict]:
    out, vistos = [], set()
    for f in (features or []):
        props = f.get("properties") or {}
        nombre = (props.get("name") or "").strip()
        if not nombre:
            continue
        coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
        try:
            lng, lat = float(coords[0]), float(coords[1])
        except Exception:
            lat = lng = None
        ciudad = (props.get("city") or props.get("county") or props.get("state") or "").strip()
        pais = (props.get("country") or "").strip()
        pais = PAISES_EN.get(pais, pais)
        clave = (norm(nombre), norm(ciudad))
        if clave in vistos:
            continue
        vistos.add(clave)
        out.append({"kind": kind, "code": "", "label": nombre,
                    "sub": ", ".join([x for x in [ciudad, pais] if x]), "lat": lat, "lng": lng})
    return out


def search_osm_places(query: str, kind: str, limit: int = 8, timeout: int = _TIMEOUT) -> list[dict]:
    """Estaciones de tren, puertos o estaciones de autobuses que casan con lo escrito (OpenStreetMap
    vía Photon, filtrando por la etiqueta del tipo). Vacío si el proveedor no responde: es una ayuda."""
    q = " ".join((query or "").split())
    tags = OSM_TAGS.get((kind or "").upper())
    if len(q) < 2 or not tags:
        return []
    params = [("q", q), ("limit", str(max(limit * 2, 10))), ("lang", "en"),
              ("lat", str(_BIAS["lat"])), ("lon", str(_BIAS["lon"])), ("location_bias_scale", "0.4"), ("zoom", "6")]
    params += [("osm_tag", t) for t in tags]
    url = PHOTON_URL + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            datos = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
    filas = _photon_rows(datos.get("features"), (kind or "").upper())
    # España delante (el sesgo de Photon es solo eso, un sesgo): un traslado es casi siempre aquí.
    filas.sort(key=lambda r: 0 if r["sub"].endswith("España") else 1)
    return filas[:limit]


def route_estimate(points, timeout: int = _TIMEOUT) -> dict | None:
    """Kilómetros y minutos EN COCHE entre dos o más puntos `(lat, lng)`, con el router público de
    OSRM. `{"distance_km", "duration_min"}` o None si no se puede (y entonces se escribe a mano)."""
    coords = []
    for p in (points or []):
        try:
            lat, lng = float(p[0]), float(p[1])
        except Exception:
            return None
        coords.append("%.6f,%.6f" % (lng, lat))
    if len(coords) < 2:
        return None
    url = OSRM_URL + ";".join(coords) + "?overview=false"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            datos = json.loads(resp.read().decode("utf-8"))
        ruta = (datos.get("routes") or [])[0]
        return {"distance_km": round(float(ruta.get("distance") or 0) / 1000.0, 1),
                "duration_min": int(round(float(ruta.get("duration") or 0) / 60.0))}
    except Exception:
        return None
