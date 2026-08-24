"""CÓMO SE ESCRIBE UNA DIRECCIÓN (motor puro, sin Flask ni BD).

En la app hay direcciones en muchos sitios: la fiscal de un tercero y de sus sociedades, el domicilio
de una persona, la de un recinto, la de un medio, la que llega por los enlaces públicos de alta y de
facturación… Todas se escriben IGUAL y se guardan IGUAL, y para eso está este módulo:

    Calle y número, CP Municipio, Provincia, País

· La **coma** separa las piezas (es como se escribe una dirección), y el **país solo se pone cuando
  NO es España**: dentro no aporta nada y fuera es justo lo que hace falta saber.
· Un municipio que se llama igual que su provincia (Madrid, Sevilla, Murcia…) no se repite.
· `parse()` hace el camino de vuelta: de un texto escrito de un tirón saca las piezas, para poder
  enseñarlas por separado donde toca (Holded exige el CP, el municipio y la provincia sueltos) sin
  obligar a nadie a rellenar cinco cuadros.

⚠️ La PROVINCIA de una dirección española sale del CÓDIGO POSTAL (`geo_utils.PROVINCE_BY_CP`), que es
   determinista: nunca de lo que devuelva un buscador, que da la comunidad autónoma o la comarca.
⚠️ Esto NO valida: una dirección que no se pueda repartir se queda entera en la calle. Antes texto
   raro que un municipio inventado.
"""

from __future__ import annotations

import re
import unicodedata

import geo_utils

# País por defecto: lo que no diga otra cosa es de aquí.
DEFAULT_COUNTRY = "España"

# Países que se reconocen al final de una dirección escrita a mano (con sus formas más habituales).
# No es un listado del mundo: es lo que de verdad aparece en las direcciones de la casa.
COUNTRY_ALIASES = {
    "espana": "España", "spain": "España", "es": "España",
    "portugal": "Portugal", "pt": "Portugal",
    "francia": "Francia", "france": "Francia", "fr": "Francia",
    "italia": "Italia", "italy": "Italia", "it": "Italia",
    "alemania": "Alemania", "germany": "Alemania", "deutschland": "Alemania", "de": "Alemania",
    "reino unido": "Reino Unido", "united kingdom": "Reino Unido", "uk": "Reino Unido",
    "inglaterra": "Reino Unido", "england": "Reino Unido",
    "irlanda": "Irlanda", "ireland": "Irlanda",
    "belgica": "Bélgica", "belgium": "Bélgica",
    "paises bajos": "Países Bajos", "holanda": "Países Bajos", "netherlands": "Países Bajos",
    "suiza": "Suiza", "switzerland": "Suiza",
    "austria": "Austria", "polonia": "Polonia", "poland": "Polonia",
    "suecia": "Suecia", "sweden": "Suecia", "noruega": "Noruega", "norway": "Noruega",
    "dinamarca": "Dinamarca", "denmark": "Dinamarca",
    "finlandia": "Finlandia", "finland": "Finlandia",
    "marruecos": "Marruecos", "morocco": "Marruecos",
    "andorra": "Andorra", "gibraltar": "Gibraltar",
    "estados unidos": "Estados Unidos", "usa": "Estados Unidos", "united states": "Estados Unidos",
    "mexico": "México", "argentina": "Argentina", "chile": "Chile", "colombia": "Colombia",
    "peru": "Perú", "uruguay": "Uruguay", "brasil": "Brasil", "brazil": "Brasil",
    "japon": "Japón", "japan": "Japón", "china": "China", "australia": "Australia",
    "canada": "Canadá", "suiza ch": "Suiza",
}

_CP_RE = re.compile(r"\b(\d{5})\b")
_CP4_RE = re.compile(r"\b(\d{4})\b")
# Fuera de España: 4-5 dígitos y la forma portuguesa «1200-195».
_CP_OTRO_RE = re.compile(r"\b(\d{4,5}(?:-\d{3})?)\b")
_SEPS = " ,.;-·|"


def _key(text) -> str:
    """Texto comparable: sin acentos, sin puntuación de sobra y en minúsculas."""
    plano = "".join(c for c in unicodedata.normalize("NFKD", str(text or ""))
                    if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^A-Za-z0-9]+", " ", plano).lower().split())


def is_spain(country) -> bool:
    """¿Es España? (con el país vacío se da por hecho que sí: es lo de casa)."""
    clave = _key(country)
    return (not clave) or clave in ("espana", "spain", "es")


def clean_country(value) -> str:
    """El país tal como se escribe («fr» → «Francia»). Lo que no se reconoce se respeta."""
    txt = " ".join(str(value or "").split())
    if not txt:
        return ""
    return COUNTRY_ALIASES.get(_key(txt), txt)


def clean_postal_code(value) -> str:
    """El código postal español a 5 dígitos («8001» → «08001»); lo que no lo sea, tal cual."""
    return geo_utils.normalize_postal_code(value) or " ".join(str(value or "").split())


def province_for_postal_code(value) -> str:
    return geo_utils.province_for_postal_code(value)


def _split_country(texto: str) -> tuple[str, str]:
    """Separa el PAÍS del final de una dirección: («… , Francia») → («…», «Francia»)."""
    resto = texto.strip(_SEPS)
    if not resto:
        return "", ""
    # Se prueban las 3 últimas «palabras» por si el país lleva varias («Reino Unido»).
    trozos = [x.strip() for x in resto.split(",") if x.strip()]
    if len(trozos) >= 2:
        pais = COUNTRY_ALIASES.get(_key(trozos[-1]))
        if pais:
            return ", ".join(trozos[:-1]), pais
    palabras = resto.split()
    for n in (3, 2, 1):
        if len(palabras) > n:
            pais = COUNTRY_ALIASES.get(_key(" ".join(palabras[-n:])))
            if pais:
                return " ".join(palabras[:-n]).strip(_SEPS), pais
    return resto, ""


def parse(texto) -> dict:
    """De una dirección escrita de un tirón a sus piezas.

    {"address", "postal_code", "city", "province", "country"} — lo que no se pueda repartir se queda
    ENTERO en `address`: nunca se inventa un municipio."""
    vacio = {"address": "", "postal_code": "", "city": "", "province": "", "country": ""}
    bruto = " ".join(str(texto or "").split())
    if not bruto:
        return dict(vacio)
    bruto, pais = _split_country(bruto)
    espanola = is_spain(pais)
    m = _CP_RE.search(bruto)
    if not m:
        # ⚠️ Un CP español se escribe a veces sin el cero de delante («8001» por «08001») y FUERA de
        # España tienen otra forma (4 dígitos en Portugal, «1200-195»…). Sin esta segunda pasada la
        # ciudad se quedaba metida dentro de la calle.
        m = (_CP4_RE if espanola else _CP_OTRO_RE).search(bruto)
    if not m:
        return {**vacio, "address": bruto, "country": pais}
    calle = bruto[:m.start()].strip(_SEPS)
    resto = bruto[m.end():].strip(_SEPS)
    # ⚠️ El relleno a 5 dígitos es SOLO de España: el 1200 de Lisboa no es el 01200 de nadie.
    cp = clean_postal_code(m.group(1)) if espanola else m.group(1)
    provincia = ""
    if resto:
        entre = re.search(r"\(([^)]+)\)\s*$", resto)
        if entre:
            provincia = entre.group(1).strip()
            resto = resto[:entre.start()].strip(_SEPS)
        elif "," in resto:
            partes = [x.strip() for x in resto.split(",") if x.strip()]
            if len(partes) >= 2:
                provincia = partes[-1]
                resto = ", ".join(partes[:-1])
    # La provincia de una dirección española la manda el CP, que no falla.
    if is_spain(pais):
        de_cp = province_for_postal_code(cp)
        if de_cp:
            provincia = de_cp
    return {"address": calle, "postal_code": cp, "city": resto,
            "province": provincia, "country": pais}


def format_parts(parts: dict | None) -> str:
    """Las piezas, en la forma canónica: «Calle, CP Municipio, Provincia, País».

    El país solo si NO es España, y el municipio no se repite con su provincia."""
    p = parts or {}
    calle = " ".join(str(p.get("address") or "").split())
    pais_crudo = clean_country(p.get("country"))
    cp = (clean_postal_code(p.get("postal_code")) if is_spain(pais_crudo)
          else " ".join(str(p.get("postal_code") or "").split()))
    ciudad = " ".join(str(p.get("city") or "").split())
    provincia = " ".join(str(p.get("province") or "").split())
    pais = pais_crudo
    medio = " ".join([x for x in [cp, ciudad] if x])
    trozos = [x for x in [calle, medio] if x]
    if provincia and _key(provincia) != _key(ciudad):
        trozos.append(provincia)
    if pais and not is_spain(pais):
        trozos.append(pais)
    return ", ".join(trozos)


def normalize(texto) -> str:
    """Una dirección escrita de cualquier manera, en la forma de la casa."""
    return format_parts(parse(texto)) or " ".join(str(texto or "").split())


def place_label(city="", province="", country="") -> str:
    """«Municipio, Provincia» (y el país solo si no es España). Sin la calle."""
    return format_parts({"city": city, "province": province, "country": country})
