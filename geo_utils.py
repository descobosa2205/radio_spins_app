# geo_utils.py
#
# Motor PURO para autocompletar direcciones (sin BD y sin Flask, como el resto de los `*_utils.py`).
#
# POR QUÉ ESTE PROVEEDOR
#   · **Nominatim NO se puede usar para autocompletar**: su política de uso lo prohíbe expresamente
#     (genera una petición por tecla). El `/api/geocode` que ya existe en la app lo usa para UNA
#     consulta por ciudad, que sí está permitido; para escribir letra a letra, no.
#   · **Photon** (komoot, sobre datos de OpenStreetMap) está hecho justamente para eso, es gratis y no
#     pide clave. Si algún día hace falta más calidad, `search_addresses` está preparada para recibir
#     otro proveedor sin tocar nada más.
#
# ⚠️ LA PROVINCIA NO SE COGE DEL GEOCODIFICADOR
#   Photon devuelve `state` = COMUNIDAD AUTÓNOMA («Comunidad de Madrid», «Andalucía») y `county` unas
#   veces la provincia y otras la comarca («Sierra de Cádiz»). Ninguno de los dos vale. La provincia se
#   saca del CÓDIGO POSTAL (los dos primeros dígitos), que es determinista y no falla nunca. Verificado
#   contra la API real de Photon (ago 2026).
from __future__ import annotations

import json
import urllib.parse
import urllib.request

PHOTON_URL = "https://photon.komoot.io/api/"
_TIMEOUT = 8
# Encuadre de España (incluye Canarias): sesga los resultados sin excluir a un proveedor extranjero.
SPAIN_BBOX = "-18.5,27.4,4.6,44.0"
_UA = "app33-backoffice/1.0 (direcciones)"

# Provincia por los DOS PRIMEROS dígitos del código postal español (las 52, fijas).
# ⚠️ Esta tabla está ESPEJADA en `static/js/address_autocomplete.js` para rellenar la provincia sin
# esperar al servidor: si se toca una, se toca la otra.
PROVINCE_BY_CP = {
    "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería", "05": "Ávila",
    "06": "Badajoz", "07": "Baleares", "08": "Barcelona", "09": "Burgos", "10": "Cáceres",
    "11": "Cádiz", "12": "Castellón", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
    "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
    "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
    "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
    "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas",
    "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria",
    "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel",
    "45": "Toledo", "46": "Valencia", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora",
    "50": "Zaragoza", "51": "Ceuta", "52": "Melilla",
}


class GeoError(RuntimeError):
    """Error al buscar una dirección, con mensaje en claro."""


def normalize_postal_code(value: str | None) -> str:
    """Código postal español en limpio (5 dígitos). Devuelve '' si no lo parece."""
    digitos = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digitos) == 4:          # se escribe «8001» por «08001» más a menudo de lo que parece
        digitos = "0" + digitos
    return digitos if len(digitos) == 5 else ""


def province_for_postal_code(value: str | None) -> str:
    """Provincia que corresponde a un código postal español (o '' si no se puede saber)."""
    cp = normalize_postal_code(value)
    return PROVINCE_BY_CP.get(cp[:2], "") if cp else ""


def _street_of(props: dict) -> str:
    """Calle y número tal como se escriben en una dirección fiscal."""
    calle = (props.get("street") or props.get("name") or "").strip()
    numero = (props.get("housenumber") or "").strip()
    if calle and numero:
        return "%s, %s" % (calle, numero)
    return calle


def parse_feature(feature: dict) -> dict | None:
    """Una sugerencia de Photon → las piezas de nuestra dirección fiscal.

    La PROVINCIA se deduce del código postal (ver la nota de arriba); si el resultado no trae CP, se
    deja vacía antes que poner una comarca o una comunidad autónoma.
    """
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties") or {}
    calle = _street_of(props)
    municipio = (props.get("city") or props.get("district") or "").strip()
    cp = normalize_postal_code(props.get("postcode"))
    pais = (props.get("country") or "").strip()
    codigo_pais = (props.get("countrycode") or "").strip().upper()
    if codigo_pais == "ES":
        provincia = province_for_postal_code(cp)
    else:
        # Fuera de España no hay tabla: se usa lo que dé el proveedor, que para eso sirve.
        provincia = (props.get("state") or props.get("county") or "").strip()
    if not (calle or municipio):
        return None
    etiqueta = " · ".join([x for x in [calle, " ".join([y for y in [cp, municipio] if y]).strip(),
                                       provincia if provincia and provincia != municipio else "",
                                       pais if codigo_pais != "ES" else ""] if x])
    return {
        "label": etiqueta,
        "address": calle,
        "postal_code": cp,
        "city": municipio,
        "province": provincia,
        "country": pais or ("España" if codigo_pais == "ES" else ""),
        "country_code": codigo_pais,
    }


def search_addresses(query: str, *, limit: int = 6, timeout: int = _TIMEOUT) -> list[dict]:
    """Sugerencias de dirección para lo que se está escribiendo.

    Devuelve una lista de dicts ya con NUESTRAS piezas (calle, CP, municipio, provincia, país). Las
    españolas van primero: es lo que se factura el 99% de las veces.
    """
    q = " ".join((query or "").split())
    if len(q) < 4:
        return []
    params = {"q": q, "limit": max(1, min(int(limit or 6), 10)), "bbox": SPAIN_BBOX}
    url = PHOTON_URL + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            datos = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:            # el buscador es una AYUDA: si falla, se escribe a mano
        raise GeoError("No se ha podido buscar la dirección: %s" % exc) from exc
    filas = []
    vistas = set()
    for feature in (datos.get("features") or []):
        fila = parse_feature(feature)
        if not fila:
            continue
        clave = (fila["address"].casefold(), fila["postal_code"], fila["city"].casefold())
        if clave in vistas:
            continue
        vistas.add(clave)
        filas.append(fila)
    filas.sort(key=lambda f: 0 if f["country_code"] == "ES" else 1)
    return filas
