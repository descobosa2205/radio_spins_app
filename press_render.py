"""NOTAS DE PRENSA: motor PURO de renderizado (ni Flask ni base de datos).

Una nota de prensa es un DISEÑO: una imagen de FONDO (con la cabecera y los logos) y BLOQUES
colocados encima —el titular, los textos y los módulos (audio, repertorio, videoclip, enlaces,
fotos, contacto)—, cada uno con su sitio y su tamaño en un lienzo de `WIDTH` (600) unidades de
ancho. De ese diseño, y SOLO de él, salen:

  · `render_web(design)`   → la página pública y la vista de dentro (posición absoluta, exacta);
  · `render_email(design)` → el CORREO (⚠️ ver abajo por qué no puede ser lo mismo);
  · `plain_text(design)`   → la versión en texto del correo;
  · `paragraphs_for_pdf`   → lo que necesita el PDF (ReportLab) de cada bloque de texto.

⚠️⚠️ EN UN CORREO NO SE PUEDE COLOCAR NADA CON `position:absolute`: Gmail lo quita (y Outlook ni lo
mira), así que los textos se caerían debajo de la imagen. Por eso el correo se compone en BANDAS
horizontales (`compute_bands`): una fila de tabla por cada franja del lienzo, con el trozo de fondo
que le toca (`background-position` negativo sobre la MISMA imagen) y dentro los bloques de esa
franja en columnas, con su hueco a la izquierda. Es lo que hace que el texto se vea ENCIMA del fondo
y siga siendo texto (seleccionable, copiable) en Gmail, Apple Mail y Outlook.com.

El HTML de los textos llega del editor y se SANEA aquí (`sanitize_html`): solo párrafos, negrita,
cursiva, subrayado, enlaces y `span` con color, tipografía, tamaño y alineación. Nada más.
"""

from __future__ import annotations

import html as _html
import re
from html.parser import HTMLParser

WIDTH = 600                         # el ancho del lienzo (y del correo)
DEFAULT_FONT = "Arial, Helvetica, sans-serif"
TEXT_COLOR = "#111827"
MUTED = "#6b7280"
BRAND_RED = "#E33D48"
BRAND_BLUE = "#007CA2"

# Las tipografías que se ofrecen: TODAS son «de sistema», porque un correo no carga fuentes web y lo
# que se ve en el editor tiene que ser lo que llega.
FONTS = [
    ("Arial, Helvetica, sans-serif", "Arial"),
    ("Helvetica, Arial, sans-serif", "Helvetica"),
    ("Georgia, 'Times New Roman', serif", "Georgia"),
    ("'Times New Roman', Times, serif", "Times New Roman"),
    ("Verdana, Geneva, sans-serif", "Verdana"),
    ("'Trebuchet MS', Helvetica, sans-serif", "Trebuchet"),
    ("Tahoma, Geneva, sans-serif", "Tahoma"),
    ("'Courier New', Courier, monospace", "Courier"),
    ("Palatino, 'Palatino Linotype', serif", "Palatino"),
    ("Impact, 'Arial Black', sans-serif", "Impact"),
]

TEXT_TYPES = ("title", "text")
MODULE_TYPES = ("audio", "album", "video", "links", "contact", "photos", "image", "files", "playlist", "artwork")

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 1) SANEAR el HTML que llega del editor
# ─────────────────────────────────────────────────────────────────────────────────────────────

_ALLOWED_TAGS = {"p", "div", "br", "b", "strong", "i", "em", "u", "s", "a", "span", "ul", "ol", "li"}
_STYLE_KEYS = {"color", "font-family", "font-size", "text-align", "text-decoration", "font-weight",
               "font-style", "line-height", "background-color"}
_COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{3,20})$")
_SIZE_RE = re.compile(r"^\d{1,3}(\.\d+)?(px|pt|em|rem|%)?$")
_FONT_RE = re.compile(r"^[\w\s,'\"-]{1,120}$")
_LINE_RE = re.compile(r"^\d(\.\d+)?$|^\d{1,3}(px|%)$")
_URL_OK = re.compile(r"^(https?://|mailto:|tel:)", re.I)


def _clean_style(value: str) -> str:
    """Solo las propiedades permitidas, con valores que sean lo que dicen ser."""
    out = []
    for decl in (value or "").split(";"):
        if ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        k, v = k.strip().lower(), v.strip().replace("!important", "").strip()
        if k not in _STYLE_KEYS or not v:
            continue
        ok = False
        if k in ("color", "background-color"):
            ok = bool(_COLOR_RE.match(v))
        elif k == "font-size":
            ok = bool(_SIZE_RE.match(v))
        elif k == "font-family":
            ok = bool(_FONT_RE.match(v))
        elif k == "text-align":
            ok = v in ("left", "right", "center", "justify")
        elif k == "text-decoration":
            ok = v in ("none", "underline", "line-through", "underline line-through")
        elif k == "font-weight":
            ok = v in ("bold", "normal", "600", "700", "800", "900", "400")
        elif k == "font-style":
            ok = v in ("italic", "normal")
        elif k == "line-height":
            ok = bool(_LINE_RE.match(v))
        if ok:
            out.append("%s:%s" % (k, v))
    return ";".join(out)


class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip = 0            # dentro de <script>/<style>
        self._open: list[str] = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("script", "style"):
            self._skip += 1
            return
        if self._skip:
            return
        a = dict(attrs)
        if tag == "font":          # lo que pega un Word viejo: se traduce a un span
            estilo = []
            if a.get("color") and _COLOR_RE.match(a["color"].strip()):
                estilo.append("color:%s" % a["color"].strip())
            if a.get("face") and _FONT_RE.match(a["face"].strip()):
                estilo.append("font-family:%s" % a["face"].strip())
            self.out.append("<span%s>" % ((' style="%s"' % ";".join(estilo)) if estilo else ""))
            self._open.append("span")
            return
        if tag not in _ALLOWED_TAGS:
            if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                # Un título pegado se queda como párrafo en negrita.
                self.out.append("<p><b>")
                self._open.append("p><b")
            return
        if tag == "br":
            self.out.append("<br>")
            return
        if tag == "strong":
            tag = "b"
        elif tag == "em":
            tag = "i"
        partes = ["<" + tag]
        if tag == "a":
            href = (a.get("href") or "").strip()
            if not _URL_OK.match(href):
                href = ""
            if href:
                partes.append(' href="%s"' % _html.escape(href, quote=True))
        estilo = _clean_style(a.get("style") or "")
        if estilo and tag in ("span", "p", "div", "a", "li"):
            partes.append(' style="%s"' % _html.escape(estilo, quote=True))
        partes.append(">")
        self.out.append("".join(partes))
        self._open.append(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag == "font":
            tag = "span"
        elif tag == "strong":
            tag = "b"
        elif tag == "em":
            tag = "i"
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            if "p><b" in self._open:
                # se cierra hasta el título abierto
                while self._open:
                    t = self._open.pop()
                    if t == "p><b":
                        self.out.append("</b></p>")
                        break
                    self.out.append("</%s>" % t)
            return
        if tag not in _ALLOWED_TAGS or tag == "br":
            return
        if tag in self._open:
            while self._open:
                t = self._open.pop()
                self.out.append("</b></p>" if t == "p><b" else "</%s>" % t)
                if t == tag:
                    break

    def handle_data(self, data):
        if self._skip:
            return
        self.out.append(_html.escape(data, quote=False))

    def result(self) -> str:
        while self._open:
            t = self._open.pop()
            self.out.append("</b></p>" if t == "p><b" else "</%s>" % t)
        return "".join(self.out)


def sanitize_html(value: str) -> str:
    """Lo que llega del editor, con SOLO lo permitido (y cerrado)."""
    value = (value or "").strip()
    if not value:
        return ""
    c = _Cleaner()
    try:
        c.feed(value)
        c.close()
        salida = c.result()
    except Exception:
        salida = _html.escape(re.sub(r"<[^>]+>", " ", value))
    salida = re.sub(r"\s+\n", "\n", salida).strip()
    # Sin ningún bloque, se envuelve en un párrafo para que el editor y el correo lo traten igual.
    if salida and not re.match(r"^\s*<(p|div|ul|ol)\b", salida, re.I):
        salida = "<p>%s</p>" % salida
    return salida


def plain_text_of_html(value: str) -> str:
    """El texto a secas (para el asunto, la miniatura y la versión de texto del correo)."""
    v = re.sub(r"<\s*(br|/p|/div|/li|/h[1-6])\s*/?>", "\n", value or "", flags=re.I)
    v = re.sub(r"<[^>]+>", "", v)
    v = _html.unescape(v)
    v = re.sub(r"[ \t\r\f\v]+", " ", v)
    v = re.sub(r"\n\s*\n+", "\n", v)
    return v.strip()


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 2) GEOMETRÍA del diseño
# ─────────────────────────────────────────────────────────────────────────────────────────────

def _num(v, default=0.0) -> float:
    try:
        return float(v)
    except Exception:
        return float(default)


def bg_height(design: dict) -> float:
    """El alto del fondo a `WIDTH` de ancho (la imagen se escala entera al ancho del lienzo)."""
    bg = (design or {}).get("bg") or {}
    w, h = _num(bg.get("w")), _num(bg.get("h"))
    if w <= 0 or h <= 0:
        return 0.0
    return WIDTH * h / w


def blocks_of(design: dict) -> list[dict]:
    """Los bloques con sus números saneados (lo que llega del navegador puede traer cualquier cosa)."""
    out = []
    for raw in (design or {}).get("blocks") or []:
        if not isinstance(raw, dict):
            continue
        tipo = str(raw.get("type") or "").strip().lower()
        if tipo not in TEXT_TYPES + MODULE_TYPES:
            continue
        b = dict(raw)
        b["type"] = tipo
        b["x"] = max(0.0, min(WIDTH - 20.0, _num(raw.get("x"))))
        b["y"] = max(0.0, _num(raw.get("y")))
        b["w"] = max(40.0, min(WIDTH - b["x"], _num(raw.get("w"), 300)))
        b["h"] = max(20.0, _num(raw.get("h"), 60))
        if tipo in TEXT_TYPES:
            b["html"] = sanitize_html(raw.get("html") or "")
            st = raw.get("style") if isinstance(raw.get("style"), dict) else {}
            b["style"] = {
                "size": max(8, min(96, int(_num(st.get("size"), 26 if tipo == "title" else 15)))),
                "font": (st.get("font") if isinstance(st.get("font"), str) and _FONT_RE.match(st.get("font") or "") else DEFAULT_FONT),
                "color": (st.get("color") if isinstance(st.get("color"), str) and _COLOR_RE.match(st.get("color") or "") else TEXT_COLOR),
                "align": (st.get("align") if st.get("align") in ("left", "center", "right", "justify") else "left"),
                "bold": bool(st.get("bold", tipo == "title")),
                "line": max(1.0, min(2.5, _num(st.get("line"), 1.25 if tipo == "title" else 1.45))),
            }
        else:
            b["opts"] = raw.get("opts") if isinstance(raw.get("opts"), dict) else {}
            b["ref"] = raw.get("ref") if isinstance(raw.get("ref"), dict) else {}
            b["data"] = raw.get("data") if isinstance(raw.get("data"), dict) else {}
        out.append(b)
    return out


def canvas_height(design: dict, blocks: list[dict] | None = None) -> float:
    """El alto del lienzo: el del fondo o, si algún bloque baja más, hasta ahí (con un margen)."""
    bl = blocks if blocks is not None else blocks_of(design)
    fondo = bg_height(design)
    abajo = max([b["y"] + b["h"] for b in bl] + [0.0])
    return max(fondo, abajo + (24.0 if abajo > fondo else 0.0), 120.0)


def headline_of(design: dict) -> str:
    """El TITULAR: el texto del primer bloque «title» (y si no hay, del primer texto)."""
    bl = blocks_of(design)
    for tipo in ("title", "text"):
        for b in sorted([x for x in bl if x["type"] == tipo], key=lambda x: (x["y"], x["x"])):
            t = plain_text_of_html(b.get("html") or "").split("\n")[0].strip()
            if t:
                return t
    return ""


def summary_of(design: dict, max_len: int = 220) -> str:
    """El RESUMEN de la nota (para el módulo insertable en una web): los TEXTOS del diseño (no el
    titular), de arriba abajo, recortados a `max_len` en una palabra entera."""
    bl = blocks_of(design)
    titular = headline_of(design)
    trozos = []
    for b in sorted([x for x in bl if x["type"] in TEXT_TYPES], key=lambda x: (x["y"], x["x"])):
        t = " ".join(plain_text_of_html(b.get("html") or "").split())
        if not t or t == titular:
            continue
        if b["type"] == "title" and trozos == [] and t.startswith(titular):
            t = t[len(titular):].strip()
        if t:
            trozos.append(t)
    texto = " ".join(trozos).strip()
    if len(texto) <= max_len:
        return texto
    corte = texto[:max_len].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return (corte or texto[:max_len]) + "…"


def compute_bands(blocks: list[dict]) -> list[dict]:
    """Las FRANJAS horizontales del correo: cada una empieza donde empieza un bloque y llega hasta
    donde acaba el más bajo de los que se solapan con ella en vertical."""
    bandas: list[dict] = []
    for b in sorted(blocks, key=lambda x: (x["y"], x["x"])):
        if bandas and b["y"] < bandas[-1]["y1"]:
            bandas[-1]["blocks"].append(b)
            bandas[-1]["y1"] = max(bandas[-1]["y1"], b["y"] + b["h"])
        else:
            bandas.append({"y0": b["y"], "y1": b["y"] + b["h"], "blocks": [b]})
    return bandas


def _columns(blocks: list[dict]) -> list[dict]:
    """Los bloques de una franja, en COLUMNAS por su x. Los que se solapan en horizontal van
    apilados en la misma columna (raro: en el editor estarían uno encima de otro)."""
    cols: list[dict] = []
    for b in sorted(blocks, key=lambda x: (x["x"], x["y"])):
        if cols and b["x"] < cols[-1]["x1"]:
            cols[-1]["blocks"].append(b)
            cols[-1]["x1"] = max(cols[-1]["x1"], b["x"] + b["w"])
        else:
            cols.append({"x0": b["x"], "x1": b["x"] + b["w"], "blocks": [b]})
    return cols


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 3) CÓMO SE PINTA CADA BLOQUE (lo mismo en la web y en el correo)
# ─────────────────────────────────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return _html.escape(str(v if v is not None else ""), quote=True)


def text_block_html(b: dict, *, for_email: bool) -> str:
    st = b.get("style") or {}
    estilo = ("font-family:%s;font-size:%spx;line-height:%s;color:%s;text-align:%s;%s"
              "margin:0;padding:0;word-wrap:break-word;overflow-wrap:break-word;"
              % (st.get("font", DEFAULT_FONT), st.get("size", 15), st.get("line", 1.4),
                 st.get("color", TEXT_COLOR), st.get("align", "left"),
                 "font-weight:700;" if st.get("bold") else ""))
    inner = b.get("html") or ""
    # Los párrafos sin margen: el hueco lo decide quien coloca el bloque, no el navegador.
    inner = inner.replace("<p>", '<p style="margin:0 0 .35em 0;">').replace("<p ", '<p style="margin:0 0 .35em 0;" ')
    # Un enlace hereda el color del texto y va SUBRAYADO por defecto; si el autor le quitó el
    # subrayado, lo trae en su propio estilo y gana.
    inner = re.sub(r'<a (?![^>]*style=)', '<a style="color:inherit;text-decoration:underline;" ', inner)
    if not for_email:
        inner = re.sub(r'<a ', '<a target="_blank" rel="noopener" ', inner)
    return '<div class="pr-text" style="%s">%s</div>' % (estilo, inner)


def _chip(texto: str, icon_url: str = "", color: str = MUTED) -> str:
    ico = ('<img src="%s" width="12" height="12" alt="" style="vertical-align:-1px;margin-right:4px;border:0;">'
           % _e(icon_url)) if icon_url else ""
    return ('<span style="display:inline-block;font-size:12px;color:%s;background:#f3f4f6;'
            'border-radius:999px;padding:2px 9px;margin:2px 4px 2px 0;font-family:%s;">%s%s</span>'
            % (color, DEFAULT_FONT, ico, _e(texto)))


def _person(name: str, photo: str) -> str:
    """El artista con su FOTO redonda delante (como en la app)."""
    foto = ('<img src="%s" width="22" height="22" alt="" style="width:22px;height:22px;border-radius:50%%;'
            'object-fit:cover;vertical-align:middle;margin-right:6px;border:0;">' % _e(photo)) if photo else ""
    return ('<span style="font-size:13px;color:#374151;font-family:%s;vertical-align:middle;">%s%s</span>'
            % (DEFAULT_FONT, foto, _e(name or "")))


def _button(texto: str, url: str, *, filled: bool = True, icon_url: str = "", cls: str = "") -> str:
    if not url:
        return ""
    ico = ('<img src="%s" width="13" height="13" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">'
           % _e(icon_url)) if icon_url else ""
    if filled:
        estilo = "background:%s;color:#fff;border:1px solid %s;" % (BRAND_RED, BRAND_RED)
    else:
        estilo = "background:#fff;color:%s;border:1px solid %s;" % (BRAND_RED, BRAND_RED)
    return ('<a href="%s" target="_blank"%s style="display:inline-block;%stext-decoration:none;font-weight:700;'
            'font-size:13px;line-height:1;padding:9px 14px;border-radius:999px;font-family:%s;margin:4px 6px 0 0;">%s%s</a>'
            % (_e(url), (' class="%s"' % cls) if cls else "", estilo, DEFAULT_FONT, ico, _e(texto)))


def _card_open(extra: str = "") -> str:
    return ('<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" '
            'style="border-collapse:separate;border:1px solid #e5e7eb;border-radius:14px;background:#ffffff;%s">'
            '<tr><td style="padding:12px 14px;">' % extra)


_CARD_CLOSE = "</td></tr></table>"


def is_pending(b: dict) -> bool:
    """Un módulo al que todavía le falta lo suyo (una imagen sin elegir, un módulo de adjuntos sin
    archivos, una playlist sin elegir): en el EDITOR se ve como un hueco que invita a completarlo y
    en el correo, en la página y en el PDF NO se pinta."""
    return bool((b.get("data") or {}).get("pending"))


def _pending_card(titulo: str, pista: str) -> str:
    return ('<div class="pr-pending" style="border:2px dashed #cbd5e1;border-radius:12px;padding:14px;text-align:center;'
            'font-family:%s;color:%s;background:rgba(255,255,255,.7);">'
            '<div style="font-size:14px;font-weight:800;color:%s;">%s</div><div style="font-size:12px;margin-top:3px;">%s</div></div>'
            % (DEFAULT_FONT, MUTED, TEXT_COLOR, _e(titulo), _e(pista)))


def module_html(b: dict, *, for_email: bool = False, editing: bool = False) -> str:
    """El HTML de un MÓDULO, con tablas y estilos en línea: es lo que va por correo y también lo que
    se ve en la web y en el editor (un solo renderizador para los tres). Con `editing`, un módulo al
    que le falta lo suyo se ve como un hueco para completarlo; fuera del editor no se pinta."""
    tipo = b.get("type")
    d = b.get("data") or {}
    opts = b.get("opts") or {}
    icons = d.get("icons") or {}
    if is_pending(b):
        if not editing:
            return ""
        return _pending_card(*{
            "image": ("Imagen", "Pincha para elegir la foto: de nuestras fotos, de los materiales del lanzamiento, o súbela"),
            "files": ("Archivos adjuntos", "Pincha para subir los archivos (o carpetas) que se van a poder descargar"),
            "playlist": ("Playlist", "Elige la playlist en el panel de la derecha"),
            "artwork": ("Cartelería", "Esta actividad todavía no tiene carteles aprobados"),
        }.get(tipo, ("Módulo", "Falta configurarlo")))
    if tipo == "image":
        # Una IMAGEN integrada en el cuerpo (no un adjunto): ocupa el ancho del bloque y, si lleva
        # enlace, al pincharla se va a él.
        url = d.get("url") or ""
        if not url:
            return ""
        radio = int(_num(opts.get("radius"), 0))
        img = ('<img src="%s" width="%d" alt="%s" style="width:100%%;max-width:100%%;height:auto;display:block;border:0;%s">'
               % (_e(url), round(_num(b.get("w"), 300)), _e(d.get("alt") or ""), ("border-radius:%dpx;" % radio) if radio > 0 else ""))
        if d.get("href"):
            return '<a href="%s" target="_blank" style="display:block;text-decoration:none;border:0;">%s</a>' % (_e(d["href"]), img)
        return img
    if tipo == "files":
        # ARCHIVOS ADJUNTOS: el icono de lo que hay (en el color elegido), el título y, debajo, las
        # etiquetas de lo que incluye («3 fotos», «1 vídeo»…). Al pinchar se ven y se descargan.
        color = d.get("color") or BRAND_RED
        etiquetas = "".join(_chip(c.get("label") or "", c.get("icon_url") or "", MUTED) for c in d.get("chips") or [])
        destino = d.get("gallery_url") or ""
        titulo = _e(d.get("title") or "Archivos adjuntos")
        icono = ('<td width="52" valign="top" style="padding-right:12px;"><a href="%s" target="_blank" style="text-decoration:none;">'
                 '<img src="%s" width="44" height="44" alt="" style="width:44px;height:44px;display:block;border:0;"></a></td>'
                 % (_e(destino), _e(d.get("icon_url") or ""))) if d.get("icon_url") else ""
        return (_card_open() +
                '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' + icono
                + '<td valign="top" style="font-family:%s;">' % DEFAULT_FONT
                + '<div style="font-size:16px;font-weight:800;line-height:1.2;"><a href="%s" target="_blank" style="color:%s;text-decoration:none;">%s</a></div>'
                % (_e(destino), color, titulo)
                + ('<div style="margin-top:6px;">%s</div>' % etiquetas if etiquetas else "")
                + '<div style="margin-top:8px;">%s</div>' % _button("Ver y descargar", destino, icon_url=icons.get("download_white"))
                + '</td></tr></table>' + _CARD_CLOSE)
    if tipo == "playlist":
        cover = d.get("cover_url") or ""
        n = int(_num(d.get("count"), 0))
        return (_card_open() +
                '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
                + ('<td width="86" valign="top" style="padding-right:12px;"><img src="%s" width="86" height="86" alt="" '
                   'style="width:86px;height:86px;border-radius:10px;object-fit:cover;display:block;border:0;"></td>' % _e(cover) if cover else "")
                + '<td valign="top" style="font-family:%s;">' % DEFAULT_FONT
                + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:%s;">Playlist</div>' % MUTED
                + '<div style="font-size:16px;font-weight:800;color:%s;line-height:1.2;">%s</div>' % (TEXT_COLOR, _e(d.get("title") or "Playlist"))
                + ('<div style="margin-top:6px;">%s</div>' % _chip("%d tema%s" % (n, "" if n == 1 else "s"), icons.get("list")) if n else "")
                + ('<div style="margin-top:6px;font-size:13px;color:%s;">%s</div>' % (MUTED, _e(d["note"])) if d.get("note") else "")
                + '<div style="margin-top:8px;">%s</div>' % _button("Escuchar la playlist", d.get("listen_url") or "", icon_url=icons.get("play"))
                + '</td></tr></table>' + _CARD_CLOSE)
    if tipo == "audio":
        cover = d.get("cover_url") or ""
        botones = _button("Escuchar", d.get("listen_url") or "", icon_url=icons.get("play"), cls="pr-listen")
        if opts.get("download") and d.get("download_url"):
            botones += _button("Descargar", d["download_url"], filled=False, icon_url=icons.get("download"))
        return (_card_open() +
                '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
                + ('<td width="86" valign="top" style="padding-right:12px;"><img src="%s" width="86" height="86" alt="" '
                   'style="width:86px;height:86px;border-radius:10px;object-fit:cover;display:block;border:0;"></td>' % _e(cover) if cover else "")
                + '<td valign="top" style="font-family:%s;">' % DEFAULT_FONT
                + '<div style="font-size:16px;font-weight:800;color:%s;line-height:1.2;">%s</div>' % (TEXT_COLOR, _e(d.get("title") or ""))
                + '<div style="margin-top:6px;">%s</div>' % _person(d.get("artist_name") or "", d.get("artist_photo") or "")
                + ('<div style="margin-top:6px;">%s</div>' % _chip(d["release_label"], icons.get("calendar")) if d.get("release_label") else "")
                + '<div style="margin-top:8px;">%s</div>' % botones
                + '</td></tr></table>' + _CARD_CLOSE)
    if tipo == "album":
        cover = d.get("cover_url") or ""
        filas = []
        for t in (d.get("tracks") or [])[:40]:
            fila = ('<tr><td style="padding:4px 0;border-top:1px solid #f1f3f5;font-family:%s;font-size:13px;color:%s;">'
                    '<span style="display:inline-block;width:22px;color:%s;">%s</span>%s</td>'
                    % (DEFAULT_FONT, TEXT_COLOR, MUTED, _e(t.get("n") or ""), _e(t.get("title") or "")))
            fila += '<td align="right" style="padding:4px 0;border-top:1px solid #f1f3f5;font-size:12px;color:%s;font-family:%s;white-space:nowrap;">' % (MUTED, DEFAULT_FONT)
            if t.get("listen_url"):
                fila += '<a href="%s" target="_blank" class="pr-listen" style="color:%s;text-decoration:none;font-weight:700;">▶ Escuchar</a>' % (_e(t["listen_url"]), BRAND_RED)
            if opts.get("download") and t.get("download_url"):
                fila += ' &nbsp;<a href="%s" style="color:%s;text-decoration:none;">⤓</a>' % (_e(t["download_url"]), BRAND_BLUE)
            fila += "</td></tr>"
            filas.append(fila)
        return (_card_open() +
                '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
                + ('<td width="86" valign="top" style="padding-right:12px;"><img src="%s" width="86" height="86" alt="" '
                   'style="width:86px;height:86px;border-radius:10px;object-fit:cover;display:block;border:0;"></td>' % _e(cover) if cover else "")
                + '<td valign="top" style="font-family:%s;">' % DEFAULT_FONT
                + '<div style="font-size:16px;font-weight:800;color:%s;line-height:1.2;">%s</div>' % (TEXT_COLOR, _e(d.get("title") or ""))
                + '<div style="margin-top:6px;">%s</div>' % _person(d.get("artist_name") or "", d.get("artist_photo") or "")
                + ('<div style="margin-top:6px;">%s%s</div>' % (_chip(d["release_label"], icons.get("calendar")) if d.get("release_label") else "",
                                                                _chip("%s temas" % len(d.get("tracks") or []), icons.get("list"))))
                + '</td></tr></table>'
                + ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin-top:10px;">%s</table>' % "".join(filas) if filas else "")
                + _CARD_CLOSE)
    if tipo == "video":
        poster = d.get("poster_url") or ""
        play = d.get("play_url") or ""
        botones = _button("Ver el videoclip", play, icon_url=icons.get("play"))
        if opts.get("download") and d.get("download_url"):
            botones += _button("Descargar", d["download_url"], filled=False, icon_url=icons.get("download"))
        return (_card_open() +
                ('<a href="%s" target="_blank" style="display:block;text-decoration:none;"><img src="%s" width="100%%" alt="" '
                 'style="width:100%%;border-radius:10px;display:block;border:0;"></a>' % (_e(play), _e(poster)) if poster else "")
                + '<div style="font-family:%s;font-size:15px;font-weight:800;color:%s;margin-top:%s;">%s</div>'
                % (DEFAULT_FONT, TEXT_COLOR, "10px" if poster else "0", _e(d.get("title") or "Videoclip"))
                + '<div style="margin-top:6px;">%s</div>' % botones + _CARD_CLOSE)
    if tipo == "links":
        align = opts.get("align") if opts.get("align") in ("left", "center", "right") else "center"
        iconos = []
        for it in d.get("items") or []:
            if not it.get("url"):
                continue
            iconos.append('<a href="%s" target="_blank" title="%s" style="display:inline-block;margin:0 7px;text-decoration:none;">'
                          '<img src="%s" width="34" height="34" alt="%s" style="width:34px;height:34px;border:0;display:block;"></a>'
                          % (_e(it["url"]), _e(it.get("label") or ""), _e(it.get("icon_url") or ""), _e(it.get("label") or "")))
        if not iconos:
            return ""
        return ('<div style="text-align:%s;font-size:0;line-height:0;">%s</div>' % (align, "".join(iconos)))
    if tipo == "contact":
        # SIEMPRE el contacto de PRENSA y QUIEN CREA la nota; además, los que se añadan (personal de la
        # casa). Cada uno con su función —«Contacto de prensa», «Contacto de Producción»…— y, debajo,
        # lo mismo: nombre · correo · teléfono. Los de antes (un solo contacto en `data`) se siguen leyendo.
        contactos = d.get("contacts") if isinstance(d.get("contacts"), list) else None
        if contactos is None:
            contactos = [d] if (d.get("name") or d.get("email")) else []
        tarjetas = []
        for i, ct in enumerate(contactos):
            filas = []
            if ct.get("email"):
                filas.append('<div style="margin-top:4px;"><img src="%s" width="13" height="13" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">'
                             '<a href="mailto:%s" style="color:%s;text-decoration:none;">%s</a></div>'
                             % (_e(icons.get("envelope") or ""), _e(ct["email"]), BRAND_BLUE, _e(ct["email"])))
            if ct.get("phone"):
                filas.append('<div style="margin-top:4px;"><img src="%s" width="13" height="13" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">'
                             '<a href="tel:%s" style="color:%s;text-decoration:none;">%s</a></div>'
                             % (_e(icons.get("phone") or ""), _e(re.sub(r"[^\d+]", "", ct["phone"])), BRAND_BLUE, _e(ct["phone"])))
            foto = ('<img src="%s" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:50%%;object-fit:cover;border:0;display:block;">'
                    % _e(ct["photo"])) if ct.get("photo") else ""
            tarjetas.append(
                '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;%s"><tr>'
                '%s<td valign="top" style="vertical-align:top;">'
                '<div style="font-family:%s;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:%s;">%s</div>'
                '<div style="font-family:%s;font-size:15px;font-weight:800;color:%s;margin-top:2px;">%s</div>'
                '<div style="font-family:%s;font-size:13px;">%s</div></td></tr></table>'
                % (("border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;" if i else ""),
                   ('<td width="50" valign="top" style="width:50px;vertical-align:top;padding-right:10px;">%s</td>' % foto) if foto else "",
                   DEFAULT_FONT, MUTED, _e(ct.get("role_label") or "Contacto de prensa"),
                   DEFAULT_FONT, TEXT_COLOR, _e(ct.get("name") or ""),
                   DEFAULT_FONT, "".join(filas)))
        return _card_open("background:#f8fafc;") + "".join(tarjetas) + _CARD_CLOSE
    if tipo == "artwork":
        # La CARTELERÍA de la actividad (o la general de su gira, ciclo o evento): los carteles en
        # rejilla y el botón a su página pública —la misma que se comparte con el artista—.
        fotos = (d.get("posters") or [])[:6]
        celdas = []
        for f in fotos:
            celdas.append('<td width="%d%%" style="padding:2px;"><a href="%s" target="_blank" style="display:block;">'
                          '<img src="%s" width="100%%" alt="" style="width:100%%;display:block;border-radius:6px;border:0;"></a></td>'
                          % (int(100 / max(1, min(3, len(fotos)))), _e(d.get("gallery_url") or f.get("url") or ""), _e(f.get("thumb") or f.get("url") or "")))
        rejilla = ""
        if celdas:
            rejilla = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' + "".join(celdas[:3]) + "</tr>"
            if len(celdas) > 3:
                rejilla += "<tr>" + "".join(celdas[3:6]) + "</tr>"
            rejilla += "</table>"
        botones = _button("Ver la cartelería", d.get("gallery_url") or "", icon_url=icons.get("images"))
        if opts.get("download") and d.get("download_url"):
            botones += _button("Descargar los carteles", d["download_url"], filled=False, icon_url=icons.get("download"))
        n = int(d.get("count") or 0)
        return (_card_open() +
                '<div style="font-family:%s;font-size:15px;font-weight:800;color:%s;">%s</div>'
                % (DEFAULT_FONT, TEXT_COLOR, _e(d.get("title") or "Cartelería"))
                + ('<div style="margin-top:2px;">%s</div>' % _chip("%d cartel%s" % (n, "" if n == 1 else "es"), icons.get("images")) if n else "")
                + ('<div style="margin-top:8px;">%s</div>' % rejilla if rejilla else "")
                + '<div style="margin-top:8px;">%s</div>' % botones + _CARD_CLOSE)
    if tipo == "photos":
        fotos = (d.get("photos") or [])[:6]
        celdas = []
        for f in fotos:
            celdas.append('<td width="%d%%" style="padding:2px;"><a href="%s" target="_blank" style="display:block;">'
                          '<img src="%s" width="100%%" alt="" style="width:100%%;display:block;border-radius:6px;border:0;aspect-ratio:1/1;object-fit:cover;"></a></td>'
                          % (int(100 / max(1, min(3, len(fotos)))), _e(d.get("gallery_url") or f.get("url") or ""), _e(f.get("thumb") or f.get("url") or "")))
        rejilla = ""
        if celdas:
            rejilla = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' + "".join(celdas[:3]) + "</tr>"
            if len(celdas) > 3:
                rejilla += "<tr>" + "".join(celdas[3:6]) + "</tr>"
            rejilla += "</table>"
        botones = _button("Ver las fotos", d.get("gallery_url") or "", icon_url=icons.get("images"))
        if opts.get("download") and d.get("download_url"):
            botones += _button("Descargar las fotos", d["download_url"], filled=False, icon_url=icons.get("download"))
        return (_card_open() +
                '<div style="font-family:%s;font-size:15px;font-weight:800;color:%s;">%s</div>'
                % (DEFAULT_FONT, TEXT_COLOR, _e(d.get("album_name") or "Fotos"))
                + ('<div style="margin-top:2px;">%s</div>' % _chip("%s fotos" % d["count"], icons.get("images")) if d.get("count") else "")
                + ('<div style="margin-top:8px;">%s</div>' % rejilla if rejilla else "")
                + '<div style="margin-top:8px;">%s</div>' % botones + _CARD_CLOSE)
    return ""


def block_html(b: dict, *, for_email: bool = False) -> str:
    if b.get("type") in TEXT_TYPES:
        return text_block_html(b, for_email=for_email)
    return module_html(b, for_email=for_email)


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 4) LA WEB: posición absoluta sobre el fondo (exacta). Se escala al ancho que haya con JS.
# ─────────────────────────────────────────────────────────────────────────────────────────────

def render_web(design: dict) -> str:
    bl = blocks_of(design)
    alto = canvas_height(design, bl)
    bg = (design or {}).get("bg") or {}
    fondo = ('background:#fff url(%s) no-repeat 0 0;background-size:%dpx auto;' % (_e(bg.get("url")), WIDTH)) if bg.get("url") else "background:#fff;"
    partes = ['<div class="pr-canvas" data-pr-canvas style="position:relative;width:%dpx;height:%dpx;%soverflow:hidden;">'
              % (WIDTH, round(alto), fondo)]
    for b in bl:
        if is_pending(b):
            continue
        alto_css = ("height:%dpx;" % round(b["h"])) if b["type"] in TEXT_TYPES else ""
        partes.append('<div class="pr-block pr-block--%s" style="position:absolute;left:%dpx;top:%dpx;width:%dpx;%s">%s</div>'
                      % (b["type"], round(b["x"]), round(b["y"]), round(b["w"]), alto_css, block_html(b, for_email=False)))
    partes.append("</div>")
    return "".join(partes)


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 5) EL CORREO: bandas de tabla con el trozo de fondo que le toca a cada una
# ─────────────────────────────────────────────────────────────────────────────────────────────

def _bg_css(design: dict, y0: float) -> str:
    bg = (design or {}).get("bg") or {}
    if not bg.get("url") or y0 >= bg_height(design):
        return "background-color:#ffffff;"
    return ('background-color:#ffffff;background-image:url(%s);background-repeat:no-repeat;'
            'background-position:0 -%dpx;background-size:%dpx auto;' % (_e(bg.get("url")), round(y0), WIDTH))


def render_email(design: dict) -> str:
    """El cuerpo del correo (la composición en bandas). Sin `<html>`: quien lo manda lo envuelve."""
    bl = [b for b in blocks_of(design) if not is_pending(b)]
    fondo_h = bg_height(design)
    bandas = compute_bands(bl)
    filas = []
    cursor = 0.0

    def fila_fondo(y0, y1):
        h = max(0, round(y1 - y0))
        if h <= 0:
            return ""
        return ('<tr><td height="%d" style="height:%dpx;line-height:%dpx;font-size:0;%s">&nbsp;</td></tr>'
                % (h, h, h, _bg_css(design, y0)))

    for banda in bandas:
        if banda["y0"] > cursor:
            filas.append(fila_fondo(cursor, banda["y0"]))
        cols = _columns(banda["blocks"])
        celdas = []
        x_cursor = 0.0
        for col in cols:
            hueco = round(col["x0"] - x_cursor)
            if hueco > 0:
                celdas.append('<td width="%d" style="width:%dpx;font-size:0;line-height:0;">&nbsp;</td>' % (hueco, hueco))
            ancho = round(col["x1"] - col["x0"])
            dentro = []
            for b in sorted(col["blocks"], key=lambda z: z["y"]):
                margen = round(b["y"] - banda["y0"])
                dentro.append('<div style="padding-top:%dpx;">%s</div>' % (max(0, margen), block_html(b, for_email=True)))
            celdas.append('<td width="%d" valign="top" style="width:%dpx;vertical-align:top;">%s</td>' % (ancho, ancho, "".join(dentro)))
            x_cursor = col["x1"]
        resto = round(WIDTH - x_cursor)
        if resto > 0:
            celdas.append('<td width="%d" style="width:%dpx;font-size:0;line-height:0;">&nbsp;</td>' % (resto, resto))
        alto = round(banda["y1"] - banda["y0"])
        filas.append('<tr><td height="%d" valign="top" style="height:%dpx;vertical-align:top;%s">'
                     '<table role="presentation" width="%d" cellpadding="0" cellspacing="0" border="0" style="width:%dpx;table-layout:fixed;">'
                     '<tr>%s</tr></table></td></tr>' % (alto, alto, _bg_css(design, banda["y0"]), WIDTH, WIDTH, "".join(celdas)))
        cursor = max(cursor, banda["y1"])
    if cursor < fondo_h:
        filas.append(fila_fondo(cursor, fondo_h))
    return ('<table role="presentation" width="%d" cellpadding="0" cellspacing="0" border="0" align="center" '
            'style="width:%dpx;max-width:100%%;margin:0 auto;border-collapse:collapse;background:#ffffff;">%s</table>'
            % (WIDTH, WIDTH, "".join(filas)))


def plain_text(design: dict) -> str:
    """La versión en TEXTO del correo: lo que dice cada bloque, de arriba abajo."""
    trozos = []
    for b in sorted(blocks_of(design), key=lambda x: (x["y"], x["x"])):
        if b["type"] in TEXT_TYPES:
            t = plain_text_of_html(b.get("html") or "")
            if t:
                trozos.append(t)
            continue
        d = b.get("data") or {}
        if b["type"] == "audio":
            trozos.append("%s — %s%s" % (d.get("title") or "Audio", d.get("artist_name") or "",
                                        (" · " + d["listen_url"]) if d.get("listen_url") else ""))
        elif b["type"] == "album":
            trozos.append("%s — %s" % (d.get("title") or "Álbum", d.get("artist_name") or ""))
            for t in d.get("tracks") or []:
                trozos.append("  %s. %s" % (t.get("n") or "", t.get("title") or ""))
        elif b["type"] == "video":
            trozos.append("%s%s" % (d.get("title") or "Videoclip", (" · " + d["play_url"]) if d.get("play_url") else ""))
        elif b["type"] == "links":
            trozos.append("\n".join("%s: %s" % (it.get("label") or "", it.get("url") or "") for it in d.get("items") or [] if it.get("url")))
        elif b["type"] == "contact":
            contactos = d.get("contacts") if isinstance(d.get("contacts"), list) else ([d] if d.get("name") else [])
            trozos.append("\n".join("%s: %s · %s · %s" % (ct.get("role_label") or "Contacto de prensa", ct.get("name") or "",
                                                            ct.get("email") or "", ct.get("phone") or "") for ct in contactos))
        elif b["type"] == "artwork":
            if not d.get("pending"):
                trozos.append("%s%s" % (d.get("title") or "Cartelería", (" · " + d["gallery_url"]) if d.get("gallery_url") else ""))
        elif b["type"] == "photos":
            trozos.append("%s%s" % (d.get("album_name") or "Fotos", (" · " + d["gallery_url"]) if d.get("gallery_url") else ""))
        elif b["type"] == "image":
            if d.get("href"):
                trozos.append("Imagen · %s" % d["href"])
        elif b["type"] == "files":
            if not d.get("pending"):
                trozos.append("%s · %s%s" % (d.get("title") or "Archivos adjuntos",
                                             ", ".join(c.get("label") or "" for c in d.get("chips") or []),
                                             (" · " + d["gallery_url"]) if d.get("gallery_url") else ""))
        elif b["type"] == "playlist":
            if not d.get("pending"):
                trozos.append("Playlist · %s%s" % (d.get("title") or "", (" · " + d["listen_url"]) if d.get("listen_url") else ""))
    return "\n\n".join([t for t in trozos if t])


# ─────────────────────────────────────────────────────────────────────────────────────────────
# 6) PARA EL PDF: los párrafos de un bloque de texto en el marcado de ReportLab
# ─────────────────────────────────────────────────────────────────────────────────────────────

_RL_FONTS = (("georgia", "Times-Roman"), ("times", "Times-Roman"), ("palatino", "Times-Roman"),
             ("courier", "Courier"))


def rl_font_for(family: str, bold: bool = False) -> str:
    fam = (family or "").lower()
    base = "Helvetica"
    for clave, nombre in _RL_FONTS:
        if clave in fam:
            base = nombre
            break
    if bold:
        return {"Helvetica": "Helvetica-Bold", "Times-Roman": "Times-Bold", "Courier": "Courier-Bold"}[base]
    return base


class _RLConverter(HTMLParser):
    """Del HTML saneado al marcado que entiende `Paragraph`: `<b> <i> <u> <a> <font> <br/>`."""

    def __init__(self, base_color: str, base_size: int):
        super().__init__(convert_charrefs=True)
        self.paras: list[dict] = []
        self.cur: list[str] = []
        self.align = "left"
        self.base_color = base_color
        self.base_size = base_size
        self._stack: list[str] = []

    def _flush(self):
        texto = "".join(self.cur).strip()
        if texto:
            self.paras.append({"markup": texto, "align": self.align})
        self.cur = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        st = a.get("style") or ""
        if tag in ("p", "div", "li"):
            self._flush()
            m = re.search(r"text-align:\s*(left|right|center|justify)", st)
            self.align = m.group(1) if m else "left"
            if tag == "li":
                self.cur.append("• ")
            return
        if tag == "br":
            self.cur.append("<br/>")
            return
        if tag in ("b", "i", "u"):
            self.cur.append("<%s>" % tag)
            self._stack.append(tag)
            return
        if tag == "a":
            href = a.get("href") or ""
            self.cur.append('<a href="%s" color="%s"><u>' % (_e(href), BRAND_BLUE))
            self._stack.append("a")
            return
        if tag == "span":
            attrsf = []
            m = re.search(r"color:\s*(#[0-9a-fA-F]{3,8})", st)
            if m:
                attrsf.append('color="%s"' % m.group(1))
            m = re.search(r"font-size:\s*(\d+)", st)
            if m:
                attrsf.append('size="%s"' % m.group(1))
            m = re.search(r"font-family:\s*([^;]+)", st)
            if m:
                attrsf.append('face="%s"' % rl_font_for(m.group(1)))
            self.cur.append("<font %s>" % " ".join(attrsf) if attrsf else "<font>")
            self._stack.append("font")
            return

    def handle_endtag(self, tag):
        if tag in ("p", "div", "li"):
            self._flush()
            return
        if tag in ("b", "i", "u") and tag in self._stack:
            while self._stack:
                t = self._stack.pop()
                self.cur.append("</a>" if t == "a" else "</%s>" % t)
                if t == "a":
                    self.cur.insert(len(self.cur) - 1, "</u>")
                if t == tag:
                    break
            return
        if tag == "a" and "a" in self._stack:
            while self._stack:
                t = self._stack.pop()
                self.cur.append("</u></a>" if t == "a" else "</%s>" % t)
                if t == "a":
                    break
            return
        if tag == "span" and "font" in self._stack:
            while self._stack:
                t = self._stack.pop()
                self.cur.append("</u></a>" if t == "a" else "</%s>" % t)
                if t == "font":
                    break

    def handle_data(self, data):
        self.cur.append(_html.escape(data, quote=False))

    def result(self):
        while self._stack:
            t = self._stack.pop()
            self.cur.append("</u></a>" if t == "a" else "</%s>" % t)
        self._flush()
        return self.paras


def paragraphs_for_pdf(block: dict) -> list[dict]:
    """Los párrafos de un bloque de texto, cada uno con su marcado de ReportLab y su alineación."""
    st = block.get("style") or {}
    conv = _RLConverter(st.get("color", TEXT_COLOR), int(st.get("size", 15)))
    try:
        conv.feed(block.get("html") or "")
        conv.close()
        return conv.result()
    except Exception:
        return [{"markup": _html.escape(plain_text_of_html(block.get("html") or "")), "align": st.get("align", "left")}]
