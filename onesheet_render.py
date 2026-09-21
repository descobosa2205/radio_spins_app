"""ONE SHEET · motor PURO (ni Flask ni base de datos).

Un One Sheet es el PORFOLIO público de un artista (o de un evento, de un ciclo/festival propio o de
una gira comprada): una CABECERA (la foto grande que se funde con el color del cuerpo, el nombre y
las etiquetas de lo que llevamos) y debajo una REJILLA de 12 columnas con MÓDULOS —la biografía,
las cifras de Spotify, los próximos conciertos, las fotos, las redes, las certificaciones, el último
lanzamiento, los videoclips, los países donde más se escucha, los premios, las notas de prensa, los
destacados y el contacto—, cada uno en su sitio (columna · fila · ancho · alto) y con sus opciones.

Lo que se guarda es el DISEÑO (JSON, `OneSheet.design`), y de él —y SOLO de él— salen la página
pública, el editor y las plantillas. Aquí vive lo que no necesita base de datos:

  · el CATÁLOGO de módulos (`MODULES`) y de métricas (`METRICS`), las tipografías, los iconos que se
    ofrecen para premios y destacados, las etiquetas de «lo que llevamos» (`SERVICES`);
  · el TEMA y sus colores (`theme_colors`): el color de fondo manda y el de las letras y los iconos
    salen solos (claro sobre oscuro, oscuro sobre claro) salvo que se fijen a mano —en el tema o en
    cada módulo por separado—;
  · la NORMALIZACIÓN del diseño (`normalize_design`): rangos, colisiones en la rejilla, HTML de los
    textos saneado con el MISMO saneador que las notas de prensa (`press_render.sanitize_html`);
  · las PLANTILLAS (`template_from_design` / `apply_template`): el formato viaja, el contenido no;
  · la IMPORTACIÓN del one-sheet antiguo (`import_legacy`), para no perder lo que ya estaba escrito.

⚠️ Los MÓDULOS DINÁMICOS (cifras, conciertos, certificaciones, último lanzamiento, países, prensa,
seguidores) no guardan datos: se calculan al pintar, así que se actualizan solos. Lo que sí se
guarda es lo que se ELIGE (qué fotos, qué vídeos, qué redes se enseñan, qué métricas).
"""

from __future__ import annotations

import copy
import re
import uuid

from press_render import sanitize_html

VERSION = 2
COLS = 12
MAX_ROWS = 400
MAX_BLOCKS = 60

# Los sujetos que pueden tener One Sheet.
SUBJECT_KINDS = ("ARTIST", "EVENT", "CYCLE", "TOUR")
SUBJECT_LABELS = {"ARTIST": "Artista", "EVENT": "Evento", "CYCLE": "Ciclo / festival", "TOUR": "Gira"}

# Palabras que NO pueden ser el slug de nadie: son rutas propias de /onesheet.
RESERVED_SLUGS = {"roster", "plantillas", "editor", "nuevo", "abrir", "og", "static", "api", "gestion"}

# LO QUE LLEVAMOS de cada artista: las etiquetas del Roster y de la cabecera.
SERVICES = [
    ("MANAGEMENT", "Management", "fa-user-tie"),
    ("CONTRATACION", "Contratación", "fa-handshake"),
    ("DISCOGRAFICA", "Discográfica", "fa-compact-disc"),
    ("EDITORIAL", "Editorial", "fa-pen-nib"),
]
SERVICE_KEYS = [k for k, _l, _i in SERVICES]
SERVICE_LABELS = {k: l for k, l, _i in SERVICES}
SERVICE_ICONS = {k: i for k, _l, i in SERVICES}

# Las TIPOGRAFÍAS que se ofrecen: (clave, cómo se llama, la pila CSS, lo que se pide a Google Fonts).
# La de sistema no carga nada; las demás cargan SOLO la elegida en la página pública.
FONTS = [
    ("system", "Sistema", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", ""),
    ("poppins", "Poppins", "'Poppins', 'Segoe UI', Helvetica, Arial, sans-serif", "Poppins:wght@400;500;600;700;800"),
    ("nunito", "Nunito", "'Nunito', 'Segoe UI', Helvetica, Arial, sans-serif", "Nunito:wght@400;600;700;800;900"),
    ("montserrat", "Montserrat", "'Montserrat', 'Segoe UI', Helvetica, Arial, sans-serif", "Montserrat:wght@400;500;600;700;800"),
    ("inter", "Inter", "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif", "Inter:wght@400;500;600;700;800"),
    ("dmsans", "DM Sans", "'DM Sans', 'Segoe UI', Helvetica, Arial, sans-serif", "DM+Sans:wght@400;500;600;700"),
    ("raleway", "Raleway", "'Raleway', 'Segoe UI', Helvetica, Arial, sans-serif", "Raleway:wght@400;500;600;700;800"),
    ("oswald", "Oswald", "'Oswald', Impact, 'Arial Narrow', sans-serif", "Oswald:wght@400;500;600;700"),
    ("playfair", "Playfair Display", "'Playfair Display', Georgia, serif", "Playfair+Display:wght@400;600;700;800"),
    ("lora", "Lora", "'Lora', Georgia, serif", "Lora:wght@400;500;600;700"),
]
FONT_BY_KEY = {k: (label, css, gf) for k, label, css, gf in FONTS}
DEFAULT_FONT = "poppins"

# El CATÁLOGO DE MÓDULOS. `single`: solo puede haber uno · `dynamic`: sus datos se calculan al pintar
# · `kinds`: para qué sujetos vale (los de Chartmetric y la discográfica son solo de ARTISTA).
MODULES = {
    "bio": {"label": "Biografía", "icon": "fa-align-left", "w": 7, "single": False, "dynamic": False,
            "kinds": SUBJECT_KINDS, "hint": "El texto de presentación. Se escribe encima, con negrita, enlaces y tamaño."},
    "text": {"label": "Texto libre", "icon": "fa-font", "w": 6, "single": False, "dynamic": False,
             "kinds": SUBJECT_KINDS, "hint": "Un bloque de texto más, para lo que haga falta."},
    "highlights": {"label": "Destacados", "icon": "fa-star", "w": 5, "single": False, "dynamic": False,
                   "kinds": SUBJECT_KINDS, "hint": "Los puntos fuertes, uno por línea, cada uno con su icono."},
    "stats": {"label": "Cifras de Spotify", "icon": "fa-chart-simple", "w": 5, "single": False, "dynamic": True,
              "kinds": ("ARTIST",), "hint": "Seguidores y oyentes mensuales, con su tendencia. Se actualizan solas (Chartmetric)."},
    "followers": {"label": "Seguidores en redes", "icon": "fa-users", "w": 5, "single": False, "dynamic": True,
                  "kinds": ("ARTIST",), "hint": "Los seguidores en cada red y plataforma. Se eligen cuáles se ven; los números se actualizan solos."},
    "socials": {"label": "Redes y plataformas", "icon": "fa-share-nodes", "w": 6, "single": False, "dynamic": True,
                "kinds": SUBJECT_KINDS, "hint": "Los botones a las redes sociales y a las plataformas digitales. Se eligen cuáles."},
    "concerts": {"label": "Próximos conciertos", "icon": "fa-calendar-day", "w": 7, "single": False, "dynamic": True,
                 "kinds": SUBJECT_KINDS, "hint": "Solo las fechas confirmadas y ya anunciadas. Un sold out sale marcado."},
    "photos": {"label": "Fotos", "icon": "fa-images", "w": 12, "single": False, "dynamic": True,
               "kinds": SUBJECT_KINDS, "hint": "Un álbum entero (se actualiza solo) o fotos sueltas de varios álbumes."},
    "certifications": {"label": "Certificaciones", "icon": "fa-compact-disc", "w": 5, "single": False, "dynamic": True,
                       "kinds": ("ARTIST",), "hint": "Los discos de oro, platino y diamante con su canción. Salen solos."},
    "release": {"label": "Último lanzamiento", "icon": "fa-record-vinyl", "w": 5, "single": False, "dynamic": True,
                "kinds": ("ARTIST",), "hint": "La portada, el botón de escuchar y las plataformas. Cambia solo con cada lanzamiento."},
    "videos": {"label": "Videoclips", "icon": "fa-circle-play", "w": 7, "single": False, "dynamic": False,
               "kinds": SUBJECT_KINDS, "hint": "Uno o varios vídeos de YouTube. Se abren encima, sin salir de la página."},
    "countries": {"label": "Países donde más se escucha", "icon": "fa-earth-europe", "w": 6, "single": False, "dynamic": True,
                  "kinds": ("ARTIST",), "hint": "El ranking de países por oyentes en Spotify (Chartmetric). Se actualiza solo."},
    "awards": {"label": "Premios", "icon": "fa-trophy", "w": 6, "single": False, "dynamic": False,
               "kinds": SUBJECT_KINDS, "hint": "Cada premio con el icono de su forma y el año en que se consiguió."},
    "press": {"label": "Notas de prensa", "icon": "fa-newspaper", "w": 7, "single": False, "dynamic": True,
              "kinds": SUBJECT_KINDS, "hint": "Las últimas notas de prensa enviadas: la miniatura y el titular, y se abren enteras."},
    "documents": {"label": "Documentos", "icon": "fa-file-arrow-down", "w": 5, "single": False, "dynamic": False,
                  "kinds": SUBJECT_KINDS, "hint": "Archivos para descargar (el dossier, el rider, una ficha técnica…): el icono de cada archivo y su nombre, y se bajan al pincharlos."},
    "contact": {"label": "Contacto", "icon": "fa-envelope", "w": 5, "single": False, "dynamic": False,
                "kinds": SUBJECT_KINDS, "hint": "Quién lleva qué, con su correo y su teléfono."},
}
MODULE_TYPES = tuple(MODULES.keys())

# Los ICONOS que se ofrecen para un premio (la forma del premio) y para un destacado.
AWARD_ICONS = [
    ("trophy", "Trofeo"), ("award", "Premio"), ("medal", "Medalla"), ("star", "Estrella"),
    ("crown", "Corona"), ("gem", "Gema"), ("certificate", "Certificado"), ("ribbon", "Lazo"),
    ("compact-disc", "Disco"), ("record-vinyl", "Vinilo"), ("microphone", "Micrófono"),
    ("guitar", "Guitarra"), ("music", "Nota"), ("fire", "Fuego"), ("bolt", "Rayo"), ("heart", "Corazón"),
]
HIGHLIGHT_ICONS = AWARD_ICONS + [
    ("check", "Check"), ("chart-line", "Crecimiento"), ("users", "Público"), ("globe", "Internacional"),
    ("ticket", "Entradas"), ("tv", "Televisión"), ("bullhorn", "Prensa"), ("headphones", "Streaming"),
    ("calendar-day", "Fechas"), ("location-dot", "Lugar"), ("play", "Reproducciones"),
]
AWARD_ICON_KEYS = {k for k, _l in AWARD_ICONS}
HIGHLIGHT_ICON_KEYS = {k for k, _l in HIGHLIGHT_ICONS}

# LAS MÉTRICAS de Chartmetric que se pueden enseñar: (clave, fuente, campo, rótulo, icono, ¿marca?).
# La clave es lo que se guarda en el diseño; la fuente y el campo son los de `chartmetric_metric_point`.
METRICS = [
    ("spotify_followers", "spotify", "followers", "Seguidores en Spotify", "fa-brands fa-spotify", "Spotify"),
    ("spotify_listeners", "spotify", "listeners", "Oyentes mensuales en Spotify", "fa-brands fa-spotify", "Spotify"),
    ("instagram_followers", "instagram", "followers", "Seguidores en Instagram", "fa-brands fa-instagram", "Instagram"),
    ("tiktok_followers", "tiktok", "followers", "Seguidores en TikTok", "fa-brands fa-tiktok", "TikTok"),
    ("tiktok_likes", "tiktok", "likes", "Me gusta en TikTok", "fa-brands fa-tiktok", "TikTok"),
    ("youtube_subscribers", "youtube_channel", "subscribers", "Suscriptores en YouTube", "fa-brands fa-youtube", "YouTube"),
    ("youtube_views", "youtube_channel", "views", "Visualizaciones en YouTube", "fa-brands fa-youtube", "YouTube"),
    ("facebook_likes", "facebook", "likes", "Me gusta en Facebook", "fa-brands fa-facebook", "Facebook"),
    ("x_followers", "twitter", "followers", "Seguidores en X", "fa-brands fa-x-twitter", "X"),
    ("deezer_fans", "deezer", "fans", "Fans en Deezer", "fa-brands fa-deezer", "Deezer"),
    ("soundcloud_followers", "soundcloud", "followers", "Seguidores en SoundCloud", "fa-brands fa-soundcloud", "SoundCloud"),
    ("bandsintown_followers", "bandsintown", "followers", "Seguidores en Bandsintown", "fa-solid fa-ticket", "Bandsintown"),
]
METRIC_BY_KEY = {m[0]: {"key": m[0], "source": m[1], "field": m[2], "label": m[3], "icon": m[4], "brand": m[5]} for m in METRICS}
# Rótulos CORTOS para la cabecera (debajo del nombre): «Seguidores» · «Oyentes».
METRIC_SHORT = {
    "spotify_followers": "Seguidores", "spotify_listeners": "Oyentes mensuales",
    "instagram_followers": "Instagram", "tiktok_followers": "TikTok", "tiktok_likes": "Me gusta TikTok",
    "youtube_subscribers": "Suscriptores", "youtube_views": "Visualizaciones", "facebook_likes": "Facebook",
    "x_followers": "X", "deezer_fans": "Deezer", "soundcloud_followers": "SoundCloud",
    "bandsintown_followers": "Bandsintown",
}

# Estilos de las redes: cómo se pintan los botones del módulo «Redes y plataformas».
SOCIAL_STYLES = ("icons", "pills", "list")
PHOTO_LAYOUTS = ("grid", "masonry", "strip")
STAT_LAYOUTS = ("tiles", "row")
DOC_LAYOUTS = ("list", "grid")

# EL MÓDULO «DOCUMENTOS» (sep 2026, lo pidió Dani: «un módulo de un documento que se vea el icono del
# archivo y el nombre del archivo para poder descargarlo»). Qué se puede subir y con qué icono se ve
# cada tipo. ⚠️ Solo iconos que EXISTEN en la Font Awesome de la app (`grep -c "\.fa-file-pdf:" …`):
# uno que no exista sale vacío. `doc_icon` es el punto único: lo usan la página y el editor.
DOC_EXTS = {
    "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "pages",
    "xls", "xlsx", "csv", "numbers", "ppt", "pptx", "key",
    "zip", "rar", "7z",
    "jpg", "jpeg", "png", "webp", "gif", "svg", "heic", "tif", "tiff", "ai", "psd", "eps", "indd",
    "mp3", "wav", "m4a", "aac", "flac", "aiff", "ogg",
    "mp4", "mov", "m4v", "webm",
    "epub", "ics", "vcf", "json", "xml",
}
DOC_ICONS = {
    "pdf": "fa-file-pdf",
    "doc": "fa-file-word", "docx": "fa-file-word", "odt": "fa-file-word", "rtf": "fa-file-word", "pages": "fa-file-word",
    "xls": "fa-file-excel", "xlsx": "fa-file-excel", "numbers": "fa-file-excel", "csv": "fa-file-csv",
    "ppt": "fa-file-powerpoint", "pptx": "fa-file-powerpoint", "key": "fa-file-powerpoint",
    "zip": "fa-file-zipper", "rar": "fa-file-zipper", "7z": "fa-file-zipper",
    "jpg": "fa-file-image", "jpeg": "fa-file-image", "png": "fa-file-image", "webp": "fa-file-image", "gif": "fa-file-image",
    "svg": "fa-file-image", "heic": "fa-file-image", "tif": "fa-file-image", "tiff": "fa-file-image",
    "ai": "fa-file-image", "psd": "fa-file-image", "eps": "fa-file-image", "indd": "fa-file-image",
    "mp3": "fa-file-audio", "wav": "fa-file-audio", "m4a": "fa-file-audio", "aac": "fa-file-audio",
    "flac": "fa-file-audio", "aiff": "fa-file-audio", "ogg": "fa-file-audio",
    "mp4": "fa-file-video", "mov": "fa-file-video", "m4v": "fa-file-video", "webm": "fa-file-video",
    "txt": "fa-file-lines", "md": "fa-file-lines", "json": "fa-file-code", "xml": "fa-file-code",
    "epub": "fa-book", "ics": "fa-calendar-days", "vcf": "fa-address-card",
}
DOC_ICON_DEFAULT = "fa-file"


def doc_ext(name) -> str:
    """La extensión de un archivo, en minúsculas y sin el punto («Dossier.PDF» → «pdf»; también
    vale una URL con query, o la extensión suelta)."""
    texto = str(name or "").strip().lower().split("?")[0].split("#")[0]
    if "." in texto:
        texto = texto.rsplit(".", 1)[1]
    return re.sub(r"[^a-z0-9]", "", texto)[:12]


def doc_icon(ext) -> str:
    """El icono de Font Awesome (clase `fa-…`) con el que se ve un archivo de ese tipo."""
    return DOC_ICONS.get(doc_ext(ext), DOC_ICON_DEFAULT)


def fmt_size(num_bytes) -> str:
    """El tamaño de un archivo, legible y en español («2,5 MB»). Sin dato, cadena vacía."""
    try:
        n = float(num_bytes)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""
    if n < 1024:
        return "%d B" % int(n)
    if n < 1024 ** 2:
        return "%d KB" % round(n / 1024)
    unidad, valor = ("MB", n / 1024 ** 2) if n < 1024 ** 3 else ("GB", n / 1024 ** 3)
    texto = ("%.1f" % valor).replace(".", ",")
    if texto.endswith(",0"):
        texto = texto[:-2]
    return "%s %s" % (texto, unidad)

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 1) COLORES · el fondo manda y las letras salen solas
# ─────────────────────────────────────────────────────────────────────────────────────────────

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


def hex_norm(value) -> str:
    """«#rrggbb» en minúsculas, o cadena vacía si no es un color."""
    s = str(value or "").strip()
    m = _HEX_RE.match(s)
    if not m:
        return ""
    h = m.group(1)
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return "#" + h.lower()


def hex_to_rgb(value) -> tuple[int, int, int]:
    h = hex_norm(value) or "#000000"
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def rgb_to_hex(r, g, b) -> str:
    clamp = lambda v: max(0, min(255, int(round(v))))
    return "#%02x%02x%02x" % (clamp(r), clamp(g), clamp(b))


def luminance(value) -> float:
    """Luminancia relativa (WCAG), de 0 (negro) a 1 (blanco)."""
    def _lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_to_rgb(value)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def is_dark(value) -> bool:
    return luminance(value) < 0.42


def mix(c1, c2, t: float) -> str:
    """Mezcla dos colores: t=0 → c1, t=1 → c2."""
    a, b = hex_to_rgb(c1), hex_to_rgb(c2)
    t = max(0.0, min(1.0, float(t)))
    return rgb_to_hex(*(a[i] + (b[i] - a[i]) * t for i in range(3)))


def rgba(value, alpha: float) -> str:
    r, g, b = hex_to_rgb(value)
    return "rgba(%d,%d,%d,%s)" % (r, g, b, ("%.3f" % max(0.0, min(1.0, float(alpha)))).rstrip("0").rstrip("."))


def contrast_text(bg) -> str:
    """El color de letra que se lee sobre ese fondo: blanco sobre oscuro, casi negro sobre claro."""
    return "#ffffff" if is_dark(bg) else "#111827"


def theme_colors(theme: dict | None) -> dict:
    """TODOS los colores derivados del tema. El de fondo manda; los demás se calculan salvo que estén
    fijados a mano (`text`, `icon`, `accent`)."""
    t = theme or {}
    bg = hex_norm(t.get("bg")) or "#0f2a24"
    dark = is_dark(bg)
    text = hex_norm(t.get("text")) or contrast_text(bg)
    icon = hex_norm(t.get("icon")) or text
    accent = hex_norm(t.get("accent")) or icon
    title = hex_norm(t.get("title")) or text
    return {
        "bg": bg,
        "dark": dark,
        "text": text,
        "title": title,
        "icon": icon,
        "accent": accent,
        "on_accent": contrast_text(accent),
        "muted": rgba(text, 0.68),
        "faint": rgba(text, 0.45),
        "line": rgba(text, 0.16),
        "chip": rgba(text, 0.10),
        "chip_strong": rgba(text, 0.18),
        "card": rgba(text, 0.07),
        "soldout": "#e33d48",
    }


def bg_gradient_css(bg: str, stops: int = 6) -> str:
    """El degradado que funde la foto de cabecera con el color del cuerpo (varias paradas para que
    no se vea la banda)."""
    partes = []
    for i in range(stops + 1):
        f = i / float(stops)
        partes.append("%s %d%%" % (rgba(bg, f * f), round(f * 100)))
    return "linear-gradient(to bottom, %s)" % ", ".join(partes)


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 2) EL DISEÑO por defecto y su normalización
# ─────────────────────────────────────────────────────────────────────────────────────────────

def uid() -> str:
    return uuid.uuid4().hex[:8]


def default_theme() -> dict:
    return {
        "bg": "#0f2a24",
        "bg_image_url": "",
        "bg_image_opacity": 0.35,
        "bg_image_blur": 0,
        "text": "",
        "title": "",
        "icon": "",
        "accent": "",
        "font": DEFAULT_FONT,
        "radius": 16,
        "gap": 28,
        "max_width": 1200,
        "module_bg": "none",
    }


def default_hero() -> dict:
    return {
        "image_url": "",
        "focus": "50% 30%",
        "height": 68,           # % de la altura de la pantalla
        "fade": 55,             # % de la cabecera que se funde con el fondo
        "show_name": True,
        "name": "",             # vacío = el nombre del sujeto
        "name_size": 64,
        "name_color": "",
        "show_services": True,
        "metrics": ["spotify_followers", "spotify_listeners"],
        "align": "left",
        "darken": 0.15,
    }


def new_block(btype: str, x: int, y: int, w: int | None = None, h: int = 1, **opts) -> dict:
    meta = MODULES.get(btype) or {}
    return {"id": uid(), "type": btype, "x": int(x), "y": int(y),
            "w": int(w if w is not None else meta.get("w", 6)), "h": int(h), "opts": dict(opts), "style": {}}


def default_blocks(kind: str) -> list[dict]:
    """La composición inicial: para un ARTISTA todo lo que hay; para lo demás, lo que tiene sentido."""
    kind = (kind or "ARTIST").upper()
    if kind == "ARTIST":
        return [
            new_block("bio", 0, 0, 7, title="Biografía"),
            new_block("followers", 7, 0, 5, title="Seguidores"),
            new_block("concerts", 0, 1, 7, title="Próximos conciertos"),
            new_block("release", 7, 1, 5, title="Último lanzamiento"),
            new_block("photos", 0, 2, 12, title="Fotos", layout="grid", cols=4),
            new_block("videos", 0, 3, 7, title="Videoclips"),
            new_block("certifications", 7, 3, 5, title="Certificaciones"),
            new_block("countries", 0, 4, 6, title="Dónde se escucha"),
            new_block("stats", 6, 4, 6, title="Spotify"),
            new_block("press", 0, 5, 7, title="Notas de prensa"),
            new_block("highlights", 7, 5, 5, title="Destacados"),
            new_block("awards", 0, 6, 6, title="Premios"),
            new_block("socials", 6, 6, 6, title="Redes y plataformas", style_kind="pills"),
            new_block("contact", 0, 7, 12, title="Contacto"),
        ]
    return [
        new_block("bio", 0, 0, 7, title="Presentación"),
        new_block("highlights", 7, 0, 5, title="Destacados"),
        new_block("concerts", 0, 1, 7, title="Próximas fechas"),
        new_block("socials", 7, 1, 5, title="Redes", style_kind="pills"),
        new_block("photos", 0, 2, 12, title="Fotos", layout="grid", cols=4),
        new_block("videos", 0, 3, 7, title="Vídeos"),
        new_block("press", 7, 3, 5, title="Notas de prensa"),
        new_block("contact", 0, 4, 12, title="Contacto"),
    ]


def default_design(kind: str) -> dict:
    return {"version": VERSION, "theme": default_theme(), "hero": default_hero(),
            "blocks": default_blocks(kind), "hidden": []}


def _num(v, default=0.0, lo=None, hi=None) -> float:
    try:
        out = float(v)
    except (TypeError, ValueError):
        out = float(default)
    if out != out:   # NaN
        out = float(default)
    if lo is not None:
        out = max(lo, out)
    if hi is not None:
        out = min(hi, out)
    return out


def _int(v, default=0, lo=None, hi=None) -> int:
    return int(round(_num(v, default, lo, hi)))


def _str(v, max_len: int = 400) -> str:
    return str(v if v is not None else "").strip()[:max_len]


def _bool(v, default=False) -> bool:
    if v is None:
        return bool(default)
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "on", "si", "sí")


_URL_OK = re.compile(r"^(https?://|mailto:|tel:)", re.I)


def clean_url(value) -> str:
    u = _str(value, 2000)
    if not u:
        return ""
    if u.startswith("//"):
        u = "https:" + u
    if not _URL_OK.match(u):
        if re.match(r"^[\w.-]+\.[a-z]{2,}(/|$)", u, re.I):
            u = "https://" + u
        else:
            return ""
    return u


def clean_image_url(value) -> str:
    u = clean_url(value)
    return u if u.startswith(("http://", "https://", "/")) else ""


def normalize_theme(raw) -> dict:
    t = default_theme()
    src = raw if isinstance(raw, dict) else {}
    t["bg"] = hex_norm(src.get("bg")) or t["bg"]
    t["bg_image_url"] = clean_image_url(src.get("bg_image_url"))
    t["bg_image_opacity"] = round(_num(src.get("bg_image_opacity"), 0.35, 0.0, 1.0), 2)
    t["bg_image_blur"] = _int(src.get("bg_image_blur"), 0, 0, 40)
    for k in ("text", "title", "icon", "accent"):
        t[k] = hex_norm(src.get(k))
    t["font"] = src.get("font") if src.get("font") in FONT_BY_KEY else DEFAULT_FONT
    t["radius"] = _int(src.get("radius"), 16, 0, 40)
    t["gap"] = _int(src.get("gap"), 28, 8, 64)
    t["max_width"] = _int(src.get("max_width"), 1200, 720, 1800)
    t["module_bg"] = src.get("module_bg") if src.get("module_bg") in ("none", "soft", "strong") else "none"
    return t


_FOCUS_RE = re.compile(r"^\d{1,3}%\s+\d{1,3}%$")


def normalize_hero(raw) -> dict:
    h = default_hero()
    src = raw if isinstance(raw, dict) else {}
    h["image_url"] = clean_image_url(src.get("image_url"))
    foco = _str(src.get("focus"), 20)
    h["focus"] = foco if _FOCUS_RE.match(foco) else h["focus"]
    h["height"] = _int(src.get("height"), 68, 30, 100)
    h["fade"] = _int(src.get("fade"), 55, 0, 100)
    h["show_name"] = _bool(src.get("show_name"), True)
    h["name"] = _str(src.get("name"), 120)
    h["name_size"] = _int(src.get("name_size"), 64, 24, 160)
    h["name_color"] = hex_norm(src.get("name_color"))
    h["show_services"] = _bool(src.get("show_services"), True)
    mets = src.get("metrics")
    if isinstance(mets, list):
        h["metrics"] = [m for m in mets if m in METRIC_BY_KEY][:4]
    h["align"] = src.get("align") if src.get("align") in ("left", "center") else "left"
    h["darken"] = round(_num(src.get("darken"), 0.15, 0.0, 0.8), 2)
    return h


def normalize_style(raw) -> dict:
    """Los colores PROPIOS de un módulo (vacío = los del tema) y su fondo."""
    src = raw if isinstance(raw, dict) else {}
    out = {}
    for k in ("text", "title", "icon", "accent"):
        v = hex_norm(src.get(k))
        if v:
            out[k] = v
    if src.get("bg") in ("none", "soft", "strong", "theme"):
        out["bg"] = src["bg"]
    if src.get("scale") is not None:
        out["scale"] = round(_num(src.get("scale"), 1.0, 0.7, 1.6), 2)
    if src.get("align") in ("left", "center", "right"):
        out["align"] = src["align"]
    return out


def _clean_items(items, keys: dict, max_items: int = 40) -> list[dict]:
    """Una lista de dicts con las claves permitidas (`keys`: nombre → ('str'|'url'|'int'|'icon:set', tope))."""
    out = []
    for it in (items if isinstance(items, list) else [])[:max_items]:
        if not isinstance(it, dict):
            continue
        fila = {}
        for k, (tipo, tope) in keys.items():
            v = it.get(k)
            if tipo == "str":
                fila[k] = _str(v, tope)
            elif tipo == "url":
                fila[k] = clean_url(v)
            elif tipo == "img":
                fila[k] = clean_image_url(v)
            elif tipo == "int":
                fila[k] = _int(v, 0, 0, tope) if v not in (None, "") else ""
            elif tipo.startswith("icon:"):
                permitidos = AWARD_ICON_KEYS if tipo == "icon:award" else HIGHLIGHT_ICON_KEYS
                fila[k] = v if v in permitidos else (tope or "star")
        if any(str(v).strip() for v in fila.values()):
            fila["id"] = _str(it.get("id"), 24) or uid()
            out.append(fila)
    return out


def normalize_opts(btype: str, raw) -> dict:
    """Las OPCIONES de un módulo, saneadas según su tipo. Lo que no se conoce, fuera."""
    src = raw if isinstance(raw, dict) else {}
    o = {"title": _str(src.get("title"), 80), "show_title": _bool(src.get("show_title"), True)}
    if btype in ("bio", "text"):
        o["html"] = sanitize_html(str(src.get("html") or ""))[:40000]
        o["size"] = _int(src.get("size"), 15, 10, 40)
        o["columns"] = _int(src.get("columns"), 1, 1, 3)
        o["more"] = _bool(src.get("more"), btype == "bio")     # «Leer más» cuando es largo
    elif btype == "highlights":
        o["items"] = _clean_items(src.get("items"), {"icon": ("icon:highlight", "star"), "text": ("str", 240)})
        o["layout"] = src.get("layout") if src.get("layout") in ("list", "chips", "grid") else "list"
    elif btype == "stats":
        mets = src.get("metrics")
        o["metrics"] = [m for m in mets if m in METRIC_BY_KEY] if isinstance(mets, list) else ["spotify_followers", "spotify_listeners"]
        o["trend"] = _bool(src.get("trend"), True)
        o["sparkline"] = _bool(src.get("sparkline"), True)
        o["layout"] = src.get("layout") if src.get("layout") in STAT_LAYOUTS else "tiles"
    elif btype == "followers":
        mets = src.get("metrics")
        o["metrics"] = [m for m in mets if m in METRIC_BY_KEY] if isinstance(mets, list) else None
        o["layout"] = src.get("layout") if src.get("layout") in ("list", "tiles") else "list"
        o["trend"] = _bool(src.get("trend"), False)
    elif btype == "socials":
        keys = src.get("keys")
        o["keys"] = [_str(k, 40) for k in keys if _str(k, 40)] if isinstance(keys, list) else None
        o["style_kind"] = src.get("style_kind") if src.get("style_kind") in SOCIAL_STYLES else "pills"
        o["labels"] = _bool(src.get("labels"), True)
        extra = src.get("extra")
        o["extra"] = _clean_items(extra, {"label": ("str", 60), "url": ("url", 0)}, 12)
    elif btype == "concerts":
        o["limit"] = _int(src.get("limit"), 8, 1, 40)
        o["show_venue"] = _bool(src.get("show_venue"), True)
        o["show_past"] = False
        o["compact"] = _bool(src.get("compact"), False)
        o["cta"] = _str(src.get("cta"), 60)
        o["cta_url"] = clean_url(src.get("cta_url"))
    elif btype == "photos":
        o["album_ids"] = [_str(x, 40) for x in (src.get("album_ids") or []) if _str(x, 40)][:20] if isinstance(src.get("album_ids"), list) else []
        o["photo_ids"] = [_str(x, 40) for x in (src.get("photo_ids") or []) if _str(x, 40)][:200] if isinstance(src.get("photo_ids"), list) else []
        o["layout"] = src.get("layout") if src.get("layout") in PHOTO_LAYOUTS else "grid"
        o["cols"] = _int(src.get("cols"), 4, 2, 6)
        o["limit"] = _int(src.get("limit"), 12, 1, 60)
        o["ratio"] = src.get("ratio") if src.get("ratio") in ("square", "landscape", "portrait", "free") else "square"
    elif btype == "certifications":
        o["hidden"] = [_str(x, 60) for x in (src.get("hidden") or [])][:60] if isinstance(src.get("hidden"), list) else []
        o["limit"] = _int(src.get("limit"), 12, 1, 60)
        o["show_country"] = _bool(src.get("show_country"), False)
    elif btype == "release":
        o["pick_kind"] = src.get("pick_kind") if src.get("pick_kind") in ("SONG", "ALBUM") else ""
        o["pick_id"] = _str(src.get("pick_id"), 40)
        o["embed"] = _bool(src.get("embed"), False)
        o["show_date"] = _bool(src.get("show_date"), True)
        o["show_platforms"] = _bool(src.get("show_platforms"), True)
    elif btype == "videos":
        o["items"] = _clean_items(src.get("items"), {"url": ("url", 0), "title": ("str", 120)}, 12)
        o["items"] = [it for it in o["items"] if youtube_id(it.get("url"))]
        o["cols"] = _int(src.get("cols"), 2, 1, 3)
    elif btype == "countries":
        o["limit"] = _int(src.get("limit"), 6, 3, 15)
        o["show_values"] = _bool(src.get("show_values"), True)
    elif btype == "awards":
        o["items"] = _clean_items(src.get("items"), {"icon": ("icon:award", "trophy"), "name": ("str", 160),
                                                     "year": ("str", 12), "by": ("str", 120)})
        o["layout"] = src.get("layout") if src.get("layout") in ("list", "grid") else "list"
    elif btype == "press":
        o["limit"] = _int(src.get("limit"), 4, 1, 12)
        o["hidden"] = [_str(x, 40) for x in (src.get("hidden") or [])][:60] if isinstance(src.get("hidden"), list) else []
        o["layout"] = src.get("layout") if src.get("layout") in ("list", "cards") else "cards"
    elif btype == "documents":
        # Cada archivo: su URL en Storage (lo sube el editor), el nombre del archivo, cómo se llama en
        # la página (vacío = el del archivo), su tamaño y su extensión (se deduce si no viene).
        items = _clean_items(src.get("items"), {"url": ("url", 0), "name": ("str", 120), "file_name": ("str", 200),
                                                "size": ("int", 10 ** 11), "ext": ("str", 12)}, 30)
        o["items"] = []
        for it in items:
            if not it.get("url"):
                continue           # sin archivo no hay nada que descargar
            it["ext"] = doc_ext(it.get("ext") or it.get("file_name") or it.get("url"))
            o["items"].append(it)
        o["layout"] = src.get("layout") if src.get("layout") in DOC_LAYOUTS else "list"
        o["show_size"] = _bool(src.get("show_size"), True)
    elif btype == "contact":
        o["items"] = _clean_items(src.get("items"), {"role": ("str", 80), "name": ("str", 120), "email": ("str", 160),
                                                     "phone": ("str", 60), "photo_url": ("img", 0)}, 12)
        o["layout"] = src.get("layout") if src.get("layout") in ("cards", "list") else "cards"
        o["show_logos"] = _bool(src.get("show_logos"), True)
    return o


def _overlaps(a: dict, b: dict) -> bool:
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"]
                or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def resolve_layout(blocks: list[dict]) -> list[dict]:
    """La REJILLA sin solapes ni filas vacías: en orden de lectura, el que pisa a otro baja hasta un
    hueco libre y después todos suben lo que puedan (como una estantería que se compacta). Es el
    mismo algoritmo que el del editor, para que lo que se guarda sea lo que se ve."""
    orden = sorted(blocks, key=lambda b: (b["y"], b["x"]))
    colocados: list[dict] = []
    for b in orden:
        while any(_overlaps(b, o) for o in colocados):
            b["y"] += 1
            if b["y"] > MAX_ROWS:
                break
        colocados.append(b)
    # Compactar hacia arriba, en orden de lectura.
    colocados.sort(key=lambda b: (b["y"], b["x"]))
    for b in colocados:
        while b["y"] > 0:
            prueba = dict(b, y=b["y"] - 1)
            if any(o is not b and _overlaps(prueba, o) for o in colocados):
                break
            b["y"] -= 1
    colocados.sort(key=lambda b: (b["y"], b["x"]))
    return colocados


def normalize_blocks(raw, kind: str) -> list[dict]:
    kind = (kind or "ARTIST").upper()
    out = []
    vistos = set()
    for b in (raw if isinstance(raw, list) else [])[:MAX_BLOCKS]:
        if not isinstance(b, dict):
            continue
        btype = str(b.get("type") or "").strip().lower()
        meta = MODULES.get(btype)
        if not meta or kind not in meta["kinds"]:
            continue
        w = _int(b.get("w"), meta["w"], 1, COLS)
        x = _int(b.get("x"), 0, 0, COLS - 1)
        if x + w > COLS:
            x = COLS - w
        bid = _str(b.get("id"), 24) or uid()
        if bid in vistos:
            bid = uid()
        vistos.add(bid)
        out.append({
            "id": bid, "type": btype, "x": x, "y": _int(b.get("y"), 0, 0, MAX_ROWS),
            "w": w, "h": _int(b.get("h"), 1, 1, 6),
            "opts": normalize_opts(btype, b.get("opts")),
            "style": normalize_style(b.get("style")),
        })
    return resolve_layout(out)


def normalize_design(raw, kind: str) -> dict:
    """El diseño tal como se GUARDA y se PINTA: completo, saneado y sin solapes."""
    src = raw if isinstance(raw, dict) else {}
    if not src:
        return default_design(kind)
    design = {
        "version": VERSION,
        "theme": normalize_theme(src.get("theme")),
        "hero": normalize_hero(src.get("hero")),
        "blocks": normalize_blocks(src.get("blocks"), kind),
        "hidden": [],
    }
    return design


def blocks_in_reading_order(design: dict) -> list[dict]:
    return sorted(design.get("blocks") or [], key=lambda b: (b.get("y", 0), b.get("x", 0)))


def block_by_id(design: dict, bid: str) -> dict | None:
    for b in design.get("blocks") or []:
        if b.get("id") == bid:
            return b
    return None


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 3) PLANTILLAS · viaja el FORMATO, no el contenido
# ─────────────────────────────────────────────────────────────────────────────────────────────

# Lo que es de ESTE artista y no debe irse con la plantilla, por tipo de módulo.
_CONTENT_KEYS = {
    "bio": ("html",), "text": ("html",), "highlights": ("items",), "photos": ("album_ids", "photo_ids"),
    "release": ("pick_kind", "pick_id"), "videos": ("items",), "awards": ("items",),
    "contact": ("items",), "socials": ("keys", "extra"), "certifications": ("hidden",), "press": ("hidden",),
    "documents": ("items",),
}


def template_from_design(design: dict) -> dict:
    """La plantilla: el tema, la cabecera (sin su foto ni su nombre) y los módulos con su sitio y sus
    opciones, pero SIN el contenido propio del artista."""
    d = copy.deepcopy(design or {})
    hero = d.get("hero") or {}
    hero["image_url"] = ""
    hero["name"] = ""
    d["hero"] = hero
    for b in d.get("blocks") or []:
        opts = b.get("opts") or {}
        for k in _CONTENT_KEYS.get(b.get("type"), ()):
            if k in opts:
                opts[k] = [] if isinstance(opts[k], list) else ("" if isinstance(opts[k], str) else None)
        if b.get("type") == "socials":
            opts["keys"] = None       # = todas las que tenga el artista
        if b.get("type") == "followers":
            opts.pop("metrics", None)
        b["opts"] = opts
    return d


def apply_template(tpl_design: dict, current: dict, kind: str) -> dict:
    """Carga una plantilla ENCIMA del diseño actual: se lleva el tema, la cabecera (conservando la
    foto que ya había) y la composición; lo que ya estaba escrito en un módulo del mismo tipo se
    RESPETA (la biografía, los vídeos, los premios…): lo que se copia es el formato."""
    tpl = normalize_design(tpl_design, kind)
    cur = normalize_design(current, kind)
    nuevo = copy.deepcopy(tpl)
    # La foto de cabecera y el nombre son de este artista.
    nuevo["hero"]["image_url"] = cur["hero"].get("image_url") or ""
    nuevo["hero"]["name"] = cur["hero"].get("name") or ""
    # El contenido de los módulos del mismo tipo se conserva (el primero que haya de cada tipo).
    previos: dict[str, list[dict]] = {}
    for b in blocks_in_reading_order(cur):
        previos.setdefault(b["type"], []).append(b)
    for b in blocks_in_reading_order(nuevo):
        fuente = (previos.get(b["type"]) or [None])
        src = fuente.pop(0) if fuente and fuente[0] is not None else None
        if not src:
            continue
        for k in _CONTENT_KEYS.get(b["type"], ()):
            if k in (src.get("opts") or {}):
                b["opts"][k] = copy.deepcopy(src["opts"][k])
        if b["type"] == "followers" and (src.get("opts") or {}).get("metrics") is not None:
            b["opts"]["metrics"] = list(src["opts"]["metrics"])
    return normalize_design(nuevo, kind)


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 4) IMPORTAR el one-sheet ANTIGUO (para no perder lo escrito)
# ─────────────────────────────────────────────────────────────────────────────────────────────

def _p(texto: str) -> str:
    """Un texto plano → párrafos HTML."""
    partes = [t.strip() for t in re.split(r"\n\s*\n|\r\n\s*\r\n", str(texto or "")) if t.strip()]
    if not partes:
        return ""
    return "".join("<p>%s</p>" % _esc(t).replace("\n", "<br>") for t in partes)


def _esc(t) -> str:
    return (str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def import_legacy(payload: dict | None, kind: str) -> dict:
    """Del `onesheet_payload` antiguo (bio, premios, vídeos, contactos, fondo, colores, portada) sale
    un diseño nuevo con lo que ya había escrito. Lo dinámico se recalcula solo."""
    p = payload if isinstance(payload, dict) else {}
    design = default_design(kind)
    bg = hex_norm(p.get("background_color"))
    if bg and bg not in ("#ffffff", "#fff"):
        design["theme"]["bg"] = bg
    txt = hex_norm(p.get("text_color"))
    if txt and txt not in ("#111111", "#111827", "#000000"):
        design["theme"]["text"] = txt
    hero = p.get("hero_image_url") or ""
    if hero:
        design["hero"]["image_url"] = clean_image_url(hero)
    foco = _str(p.get("hero_focus"), 20)
    if _FOCUS_RE.match(foco):
        design["hero"]["focus"] = foco
    for b in design["blocks"]:
        t = b["type"]
        if t == "bio" and p.get("bio"):
            b["opts"]["html"] = sanitize_html(_p(p.get("bio")))
        elif t == "awards" and isinstance(p.get("awards"), list):
            b["opts"]["items"] = _clean_items([{"icon": "trophy", "name": a.get("name"), "year": a.get("year")}
                                               for a in p["awards"] if isinstance(a, dict)],
                                              {"icon": ("icon:award", "trophy"), "name": ("str", 160), "year": ("str", 12), "by": ("str", 120)})
        elif t == "videos" and isinstance(p.get("videos"), list):
            b["opts"]["items"] = [it for it in _clean_items([{"url": v.get("url"), "title": v.get("title")} for v in p["videos"] if isinstance(v, dict)],
                                                            {"url": ("url", 0), "title": ("str", 120)}, 12) if youtube_id(it.get("url"))]
        elif t == "contact" and isinstance(p.get("contacts"), list):
            b["opts"]["items"] = _clean_items([{"role": c.get("role"), "name": c.get("name"), "email": c.get("email"), "phone": c.get("phone")}
                                               for c in p["contacts"] if isinstance(c, dict)],
                                              {"role": ("str", 80), "name": ("str", 120), "email": ("str", 160), "phone": ("str", 60), "photo_url": ("img", 0)}, 12)
        elif t == "highlights" and isinstance(p.get("featured_stats"), list):
            b["opts"]["items"] = _clean_items([{"icon": "star", "text": " ".join(x for x in [s.get("value"), s.get("label")] if x)}
                                               for s in p["featured_stats"] if isinstance(s, dict)],
                                              {"icon": ("icon:highlight", "star"), "text": ("str", 240)})
    return normalize_design(design, kind)


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 5) Utilidades: YouTube, Spotify, números
# ─────────────────────────────────────────────────────────────────────────────────────────────

_YT_RE = re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/|v/))([A-Za-z0-9_-]{11})")


def youtube_id(url) -> str:
    m = _YT_RE.search(str(url or ""))
    return m.group(1) if m else ""


def youtube_thumb(url) -> str:
    vid = youtube_id(url)
    return ("https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid) if vid else ""


def youtube_embed(url) -> str:
    vid = youtube_id(url)
    return ("https://www.youtube-nocookie.com/embed/%s?autoplay=1&rel=0" % vid) if vid else ""


_SP_RE = re.compile(r"open\.spotify\.com/(?:intl-[a-z]{2}/)?(track|album|artist|playlist)/([A-Za-z0-9]+)")


def spotify_embed(url) -> str:
    m = _SP_RE.search(str(url or ""))
    if not m:
        return ""
    return "https://open.spotify.com/embed/%s/%s?utm_source=generator&theme=0" % (m.group(1), m.group(2))


def fmt_int(n) -> str:
    """12159481 → «12.159.481» (el punto de los miles de aquí)."""
    try:
        v = int(round(float(n)))
    except (TypeError, ValueError):
        return ""
    return "{:,}".format(v).replace(",", ".")


def fmt_compact(n) -> str:
    """12159481 → «12,2 M» · 586000 → «586 mil» · 940 → «940»."""
    try:
        v = float(n)
    except (TypeError, ValueError):
        return ""
    a = abs(v)
    if a >= 1e9:
        return ("%.1f" % (v / 1e9)).replace(".", ",").replace(",0", "") + " mil M"
    if a >= 1e6:
        return ("%.1f" % (v / 1e6)).replace(".", ",").replace(",0", "") + " M"
    if a >= 1e4:
        return fmt_int(round(v / 1e3)) + " mil"
    return fmt_int(v)


def slug_ok(slug: str) -> bool:
    s = (slug or "").strip().lower()
    return bool(re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", s)) and s not in RESERVED_SLUGS and len(s) <= 80
