from datetime import date, timedelta, datetime
from uuid import UUID
import uuid as _uuid
import json
import csv
import unicodedata
from pathlib import Path
from io import BytesIO
from functools import wraps
from zoneinfo import ZoneInfo
from sqlalchemy.orm import selectinload, joinedload
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    abort,
    jsonify,
    session,
    send_from_directory,
    send_file,
)
from sqlalchemy import func, text, or_

from werkzeug.security import check_password_hash, generate_password_hash
import calendar as _cal
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
from decimal import Decimal, InvalidOperation

# PDF (informe de ventas)
try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.graphics.shapes import Drawing, PolyLine, Line

    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False

from config import settings
from models import (
    init_db,
    ensure_artist_feature_schema,
    ensure_discografica_schema,
    ensure_isrc_and_song_detail_schema,
    ensure_song_royalties_schema,
    SessionLocal,
    User,
    Artist,
    ArtistPerson,
    ArtistContract,
    ArtistContractCommitment,
    Song,
    ISRCConfig,
    ArtistISRCSetting,
    SongInterpreter,
    SongISRCCode,
    SongStatus,
    SongArtist,
    RadioStation,
    Week,
    Play,
    SongWeekInfo,
    Promoter,
    SongRoyaltyBeneficiary,
    Venue,
    Concert,
    TicketSale,
    GroupCompany,
    ConcertPromoterShare,
    ConcertCompanyShare,
    ConcertZoneAgent,
    ConcertCache,
    ConcertContract,
    ConcertNote,
    ConcertEquipment,
    ConcertEquipmentDocument,
    ConcertEquipmentNote,
    # Ventas v2 (ticketeras)
    Ticketer,
    ConcertSalesConfig,
    ConcertTicketType,
    ConcertTicketer,
    TicketSaleDetail,
)
from supabase_utils import upload_png, upload_pdf, upload_image
app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

# Asegurar esquema mínimo en producción (Render/gunicorn no ejecuta __main__)
ensure_artist_feature_schema()
ensure_discografica_schema()
ensure_isrc_and_song_detail_schema()
ensure_isrc_and_song_detail_schema()
ensure_song_royalties_schema()

SALES_SECTION_ORDER = ["EMPRESA", "PARTICIPADOS", "CADIZ", "VENDIDO"]
SALES_SECTION_TITLE = {
    "EMPRESA": "Conciertos — Empresa",
    "PARTICIPADOS": "Conciertos — Participados",
    "CADIZ": "Cádiz Music Stadium",
    "VENDIDO": "Conciertos — Vendidos",
}

# Tipos de concierto disponibles en la app.
# NOTA: "GRATUITO" NO debe aparecer en actualización/reporte de ventas.
CONCERT_SALE_TYPES_ALL = ["EMPRESA", "GRATUITO", "PARTICIPADOS", "CADIZ", "VENDIDO"]
CONCERT_SALE_TYPES_ALL_SET = set(CONCERT_SALE_TYPES_ALL)

# Secciones SOLO para la pantalla de Conciertos (incluye gratuitos).
CONCERTS_SECTION_ORDER = ["EMPRESA", "GRATUITO", "PARTICIPADOS", "CADIZ", "VENDIDO"]
CONCERTS_SECTION_TITLE = {
    "EMPRESA": "Conciertos — Empresa",
    "GRATUITO": "Conciertos — Gratuitos",
    "PARTICIPADOS": "Conciertos — Participados",
    "CADIZ": "Cádiz Music Stadium",
    "VENDIDO": "Conciertos — Vendidos",
}

# Conceptos por defecto para compromisos de contratos a nivel artista.
# Se muestran como sugerencias al añadir filas (no como catálogo editable).
ARTIST_CONTRACT_DEFAULT_CONCEPTS = [
    "Discográfico",
    "Distribución",
    "Editorial",
    "Booking",
    "Management",
    "Catálogo",
    "Conciertos vendidos",
    "Conciertos propios",
]
TZ_MADRID = ZoneInfo("Europe/Madrid")


def today_local() -> date:
    """Fecha de hoy en Madrid."""
    return datetime.now(TZ_MADRID).date()

def get_day(param: str = "d") -> date:
    """
    Lee ?d=YYYY-MM-DD de la query y devuelve date.
    Si no llega / es inválido, devuelve 'hoy' Madrid.
    """
    raw = request.args.get(param)
    if raw:
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            pass
    return today_local()
# ---------- helpers ----------
def db():
    return SessionLocal()

def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())

def ensure_week(session, week_start: date):
    session.execute(
        text("insert into weeks (week_start) values (:w) on conflict (week_start) do nothing"),
        {"w": week_start}
    )
    session.flush()

def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def parse_timecode_to_seconds(value: str | None) -> int | None:
    """Convierte un timecode tipo "mm:ss" o "ss" a segundos.

    Acepta también "hh:mm:ss".
    """
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if ":" not in raw:
            n = int(raw)
            return n if n >= 0 else None
        parts = [p.strip() for p in raw.split(":")]
        if len(parts) == 2:
            mm = int(parts[0] or 0)
            ss = int(parts[1] or 0)
            if mm < 0 or ss < 0:
                return None
            return mm * 60 + ss
        if len(parts) == 3:
            hh = int(parts[0] or 0)
            mm = int(parts[1] or 0)
            ss = int(parts[2] or 0)
            if hh < 0 or mm < 0 or ss < 0:
                return None
            return hh * 3600 + mm * 60 + ss
    except Exception:
        return None
    return None

def to_uuid(val):
    if val is None or val == "":
        return None
    if isinstance(val, UUID):
        return val
    return _uuid.UUID(str(val))


def safe_next_or(default_url: str) -> str:
    """Devuelve el parámetro next (form/args) si parece seguro (ruta relativa),
    si no, devuelve default_url.

    Evita open-redirects (no permitimos http(s):// ni //).
    """
    nxt = (request.form.get("next") or request.args.get("next") or "").strip()
    if nxt.startswith("/") and ("://" not in nxt) and (not nxt.startswith("//")):
        return nxt
    return default_url

def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            nxt = request.full_path if request.query_string else request.path
            return redirect(url_for("admin_login", next=nxt))
        return view(*args, **kwargs)
    return wrapper


# ---------- Requerir login en toda la app (sin "vista general") ----------
# Antes existían rutas públicas para consulta. Ahora el acceso es por roles,
# así que forzamos inicio de sesión en cualquier pantalla salvo landing/login.
@app.before_request
def require_login():
    # Endpoints estáticos (CSS/JS/IMG)
    if request.endpoint == "static":
        return

    # Si ya hay sesión, OK
    if session.get("user_id"):
        return

    # Rutas públicas permitidas
    allowed = {"landing", "admin_login"}
    if request.endpoint in allowed:
        return

    # Evitar errores raros en endpoints desconocidos
    if not request.endpoint:
        return

    nxt = request.full_path if request.query_string else request.path
    return redirect(url_for("admin_login", next=nxt))

# ---------- Roles / permisos ----------
# role: 1,2,3,4,10 (10 = master)
ROLE_LABELS = {
    1: "Acceso lectura (sin economía / sin edición)",
    2: "Radios (edición tocadas)",
    3: "Ventas (edición + economía)",
    4: "Lectura total (incluye economía, sin edición)",
    5: "Conciertos + Catálogos (ventas sin economía, radio lectura)",
    6: "Conciertos + Catálogos (ventas con economía, radio lectura)",
    10: "Master",
}

ROLE_WELCOME = {
    1: "Bienvenido. Estás en modo lectura (sin datos económicos) y sin permisos de edición.",
    2: "Bienvenido. Puedes editar tocadas de radio. Ventas en modo lectura (sin datos económicos).",
    3: "Bienvenido. Puedes editar ventas y ver la parte económica. Radios en modo lectura.",
    4: "Bienvenido. Puedes ver toda la información (incluida la económica) en modo lectura.",
    5: "Bienvenido. Puedes editar conciertos y bases de datos (artistas/recintos/proveedores). Ventas sin economía. Radios en modo lectura.",
    6: "Bienvenido. Puedes editar conciertos y bases de datos (artistas/recintos/proveedores). Ventas en modo lectura con economía. Radios en modo lectura.",
    10: "Bienvenido. Acceso master: puedes ver y modificar toda la información.",
}


# --- users.txt (fuente de usuarios) ---
USERS_TXT_PATH = Path(__file__).resolve().parent / "users.txt"


def load_users_from_txt():
    """Carga usuarios desde users.txt.

    Formato esperado por linea:
      email, password, role

    - Soporta espacios tras comas.
    - Soporta UTF-8 con BOM.
    - Ignora lineas vacias y comentarios (#).
    """
    users = {}
    try:
        if not USERS_TXT_PATH.exists():
            return users
        with USERS_TXT_PATH.open('r', encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, skipinitialspace=True)
            for row in reader:
                if not row:
                    continue
                first = (row[0] or '').strip()
                if not first or first.startswith('#'):
                    continue
                if len(row) < 2:
                    continue
                email = first.lower()
                pwd = (row[1] or '').strip()
                role = 10
                if len(row) >= 3:
                    raw_role = (row[2] or '').strip()
                    if raw_role:
                        try:
                            role = int(raw_role)
                        except Exception:
                            role = 10
                users[email] = {'password': pwd, 'role': role}
    except Exception:
        # Si hay cualquier problema leyendo el fichero, fallamos "cerrado" (sin permitir login por TXT).
        return {}
    return users

def current_role() -> int:
    try:
        return int(session.get("role") or 10)
    except Exception:
        return 10

def can_view_economics() -> bool:
    return current_role() in (3, 4, 6, 10)

def can_edit_radio() -> bool:
    return current_role() in (2, 10)

def can_edit_concerts() -> bool:
    # Roles que pueden dar de alta / editar conciertos
    return current_role() in (5, 6, 10)

def can_edit_catalogs() -> bool:
    # Roles que pueden modificar catálogos/bases de datos (artistas, recintos, empresas, etc.)
    return current_role() in (5, 6, 10)


def can_edit_artists_stations() -> bool:
    """Permiso específico: artistas + emisoras.

    Petición del cliente: los usuarios de rango 2 deben poder añadir/editar
    artistas y emisoras, sin ampliar permisos al resto de catálogos.
    """
    return current_role() in (2, 5, 6, 10)

def can_edit_sales() -> bool:
    return current_role() in (3, 10)

def is_master() -> bool:
    return current_role() == 10

def forbid(message: str = "No tienes permisos para realizar esta acción."):
    flash(message, "danger")
    return abort(403)

@app.before_request
def enforce_role_permissions():
    # Si no hay sesión, nada que hacer
    if not session.get("user_id"):
        return

    # Si no está el role en sesión (usuarios antiguos), lo cargamos 1 vez desde BD
    if session.get("role") is None:
        session_db = db()
        try:
            u = session_db.query(User).get(to_uuid(session.get("user_id")))
            if u:
                session["role"] = int(getattr(u, "role", 10) or 10)
        finally:
            session_db.close()

    # Bloqueo centralizado de acciones de escritura
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        path = request.path or ""

        # Radios: tocadas
        if path.startswith("/tocadas"):
            if not can_edit_radio():
                return forbid("Tu usuario no tiene permisos para modificar tocadas de radio.")
            return

        # Ventas: actualización
        if path.startswith("/ventas"):
            # Ojo: /ventas es también reporte. Solo bloqueamos escrituras (ya estamos en POST/PUT/PATCH/DELETE)
            if not can_edit_sales():
                return forbid("Tu usuario no tiene permisos para modificar ventas.")
            return

        # Conciertos (alta/edición/borrado/notas/zonas/etc.)
        if path.startswith("/conciertos"):
            if not (is_master() or can_edit_concerts()):
                return forbid("Tu usuario no tiene permisos para modificar conciertos.")
            return

        # Catálogos / Bases de datos (CRUD)
        # - Artistas + Emisoras: también permitido a rol 2 (radio edición)
        if path.startswith(("/artistas", "/emisoras")):
            if not (is_master() or can_edit_artists_stations()):
                return forbid("Tu usuario no tiene permisos para modificar artistas/emisoras.")
            return

        # - Resto de catálogos
        if path.startswith(("/canciones", "/promotores", "/recintos", "/ticketeras", "/empresas")):
            if not (is_master() or can_edit_catalogs()):
                return forbid("Tu usuario no tiene permisos para modificar bases de datos en esta sección.")
            return

        # Discográfica (ficha de canción, ISRC, etc.)
        if path.startswith("/discografica"):
            if not (is_master() or can_edit_catalogs()):
                return forbid("Tu usuario no tiene permisos para modificar datos en Discográfica.")
            return

        # Endpoints /api usados por modales (crear tercero/recinto/ticketera/artista, etc.)
        # NOTA: los GET no entran aquí (solo bloqueamos escrituras).
        if path.startswith("/api/"):
            if path.startswith("/api/artists"):
                if not (is_master() or can_edit_artists_stations() or can_edit_catalogs()):
                    return forbid("Tu usuario no tiene permisos para modificar artistas.")
                return

            if path.startswith(("/api/venues", "/api/promoters", "/api/ticketers", "/api/companies")):
                if not (is_master() or can_edit_catalogs() or can_edit_concerts()):
                    return forbid("Tu usuario no tiene permisos para modificar bases de datos en esta sección.")
                return

        # Cualquier otra escritura: solo master
        if not is_master():
            return forbid("Tu usuario no tiene permisos para modificar datos en esta sección.")


def week_tabs(base: date):
    prev_w = base - timedelta(days=7)
    next_w = base + timedelta(days=7)
    return prev_w, base, next_w

def week_label_range(week_start: date) -> str:
    end = week_start + timedelta(days=6)
    return f"{week_start.strftime('%d/%m/%Y')} - {end.strftime('%d/%m/%Y')}"

def week_with_latest_data(session, station_id: UUID | None = None):
    q = session.query(Play.week_start)
    if station_id:
        q = q.filter(Play.station_id == station_id)
    row = q.order_by(Play.week_start.desc()).first()
    if row: return row[0]
    return monday_of(date.today())

def date_or_today(param_name="d"):
    qs = request.args.get(param_name)
    if qs:
        return datetime.strptime(qs, "%Y-%m-%d").date()
    return date.today()

def format_spanish_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")

# --- Zona horaria Madrid ---

@app.template_filter("k")
def format_thousands(n):
    """
    Formatea enteros con punto de miles (1.234.567).
    Si n viene None/'' → '0'.
    """
    try:
        return f"{int(n):,}".replace(",", ".")
    except Exception:
        return "0"


@app.template_filter("eur")
def format_eur(n):
    """Formatea importes en EUR con separador español."""
    try:
        v = float(n or 0)
        return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00 €"
    
def _parse_share_pairs(ids_list, pct_list):
    """
    (['id1','id2'], ['10','40']) -> [('id1',10), ('id2',40)] sin duplicados, último gana.
    """
    dedup = {}
    for sid, pct in zip(ids_list or [], pct_list or []):
        sid = (sid or "").strip()
        if not sid:
            continue
        try:
            v = int(pct)
        except Exception:
            v = 0
        v = max(0, min(100, v))
        dedup[sid] = v
    return list(dedup.items())

def _parse_share_pairs(ids_list, pct_list):
    """Normaliza y DEDUPLICA: el último gana; % en [0..100]."""
    dedup = {}
    for sid, pct in zip(ids_list or [], pct_list or []):
        sid = (sid or "").strip()
        if not sid:
            continue
        try:
            v = int(pct)
        except Exception:
            v = 0
        v = max(0, min(100, v))
        dedup[sid] = v
    return list(dedup.items())

def _replace_concert_shares(session, concert_id, promoter_pairs, company_pairs):
    """Reemplaza participaciones evitando UNIQUE (DELETE -> FLUSH -> INSERT)."""
    session.query(ConcertPromoterShare).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.query(ConcertCompanyShare).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.flush()
    for pid, pct in promoter_pairs:
        session.add(ConcertPromoterShare(concert_id=concert_id, promoter_id=to_uuid(pid), pct=pct))
    for gid, pct in company_pairs:
        session.add(ConcertCompanyShare(concert_id=concert_id, company_id=to_uuid(gid), pct=pct))

def _parse_optional_positive_int(value):
    """
    Devuelve un int > 0 o None si vacío/0/no-numérico.
    """
    try:
        n = int((value or "").strip())
        return n if n > 0 else None
    except Exception:
        return None
    
# ---------- context ----------
@app.context_processor
def inject_globals():
    def has_endpoint(name: str) -> bool:
        # permite: {% if has_endpoint('mi_vista') %} ...
        return name in app.view_functions
    return dict(
        BRAND_PRIMARY=settings.BRAND_PRIMARY,
        BRAND_ACCENT=settings.BRAND_ACCENT,
        IS_ADMIN=bool(session.get("user_id")),
        has_endpoint=has_endpoint,
        ROLE=current_role(),
        ROLE_LABEL=ROLE_LABELS.get(current_role(), str(current_role())),
        CAN_VIEW_ECON=can_view_economics(),
        CAN_EDIT_RADIO=can_edit_radio(),
        CAN_EDIT_SALES=can_edit_sales(),
        CAN_EDIT_CONCERTS=can_edit_concerts(),
        CAN_EDIT_CATALOGS=can_edit_catalogs(),
        CAN_EDIT_ARTISTS_STATIONS=can_edit_artists_stations(),
        IS_MASTER=is_master()
    )

# ---------- landing ----------
@app.route("/")
def landing():
    # Si ya hay sesión iniciada, enviamos al panel directamente.
    if session.get("user_id"):
        return redirect(url_for("home"))
    return render_template("landing.html")

# ---------- auth ----------
@app.route("/admin", methods=["GET", "POST"])
def admin_login():

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        password = (request.form.get("password") or "").strip()
        nxt = request.form.get("next") or url_for("home")

        txt_users = load_users_from_txt()

        session_db = db()
        try:
            user = session_db.query(User).filter(func.lower(User.email) == email).first()

            # 1) Intentar login contra BD
            if user and check_password_hash(user.password_hash, password):
                # Si el usuario existe en users.txt, sincronizamos el rol (para que editar el TXT sea suficiente)
                rec = txt_users.get(email)
                if rec and rec.get('role') is not None:
                    try:
                        role_txt = int(rec.get('role') or 10)
                    except Exception:
                        role_txt = int(getattr(user, 'role', 10) or 10)
                    if int(getattr(user, 'role', 10) or 10) != role_txt:
                        user.role = role_txt
                        session_db.commit()

                session["user_id"] = str(user.id)
                session["role"] = int(getattr(user, "role", 10) or 10)
                flash(ROLE_WELCOME.get(session["role"], "Bienvenido."), "success")
                return redirect(nxt)

            # 2) Fallback users.txt (si existe y password coincide)
            rec = txt_users.get(email)
            if rec and rec.get('password') == password:
                role = int(rec.get('role') or 10)

                if not user:
                    user = User(
                        email=email,
                        password_hash=generate_password_hash(password),
                        role=role,
                    )
                    session_db.add(user)
                else:
                    # Si el usuario ya existe en BD pero en users.txt tiene otra password/role,
                    # sincronizamos BD con el TXT (source of truth).
                    user.password_hash = generate_password_hash(password)
                    user.role = role

                session_db.commit()

                session["user_id"] = str(user.id)
                session["role"] = role
                flash(ROLE_WELCOME.get(role, "Bienvenido."), "success")
                return redirect(nxt)

            flash("Usuario o contraseña incorrectos.", "danger")
        finally:
            session_db.close()
    next_param = request.args.get("next") or ""
    return render_template("login.html", next_url=next_param)

@app.get("/logout")
def admin_logout():
    session.pop("user_id", None)
    session.pop("role", None)
    flash("Sesión cerrada.", "success")
    return redirect(url_for("landing"))

# ------ Home Page --------

@app.get("/home", endpoint="home")
def home():
    # Si ya tienes un control de sesión/rol, puedes leer:
    # role = session.get("role")  # 'admin' | 'viewer'
    return render_template("home.html")

# ---------- ARTISTAS ----------
@app.route("/artistas", methods=["GET", "POST"])
@admin_required
def artists_view():
    session_db = db()

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        photo = request.files.get("photo")
        try:
            photo_url = upload_png(photo, "artists") if photo else None
            artist = Artist(name=name, photo_url=photo_url)  # id lo genera la BD
            session_db.add(artist)
            session_db.commit()
            flash("Artista creado.", "success")
        except Exception as e:
            session_db.rollback()
            flash(f"Error creando artista: {e}", "danger")
        finally:
            session_db.close()
        return redirect(url_for("artists_view"))
    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()
    session_db.close()
    return render_template("artists.html", artists=artists)


@app.get("/artistas/<artist_id>", endpoint="artist_detail_view")
@admin_required
def artist_detail_view(artist_id):
    """Ficha de artista (tabs: datos/contratos/conciertos/discográfica...)."""
    session_db = db()
    try:
        artist = session_db.get(Artist, to_uuid(artist_id))
        if not artist:
            flash("Artista no encontrado.", "warning")
            return redirect(url_for("artists_view"))

        tab = (request.args.get("tab") or "datos").strip().lower()
        allowed_tabs = {
            "datos",
            "contratos",
            "conciertos",
            "discografica",
            "agenda",
            "promocion",
            "liquidaciones",
        }
        if tab not in allowed_tabs:
            tab = "datos"

        disc_tab = (request.args.get("disc") or "repertorio").strip().lower()
        if disc_tab not in {"repertorio"}:
            disc_tab = "repertorio"

        # Datos: personas asociadas
        people = (
            session_db.query(ArtistPerson)
            .filter(ArtistPerson.artist_id == artist.id)
            .order_by(ArtistPerson.created_at.asc())
            .all()
        )

        # Contratos (nivel artista)
        contracts = (
            session_db.query(ArtistContract)
            .options(selectinload(ArtistContract.commitments))
            .filter(ArtistContract.artist_id == artist.id)
            .order_by(ArtistContract.created_at.desc())
            .all()
        )

        # Discográfica: repertorio (canciones asociadas)
        songs = (
            session_db.query(Song)
            .join(SongArtist, SongArtist.song_id == Song.id)
            .filter(SongArtist.artist_id == artist.id)
            .order_by(Song.release_date.desc(), Song.title.asc())
            .all()
        )

        # Conciertos del artista (solo lectura) + filtros
        f_statuses_raw = request.args.getlist("status") or []
        f_when_raw = request.args.getlist("when") or []

        f_statuses = [(x or "").strip().upper() for x in f_statuses_raw if (x or "").strip()]
        allowed_statuses = {"HABLADO", "RESERVADO", "CONFIRMADO"}
        f_statuses = [x for x in f_statuses if x in allowed_statuses]

        f_when = {(x or "").strip().upper() for x in f_when_raw if (x or "").strip()}
        allowed_when = {"PAST", "FUTURE"}
        f_when = {x for x in f_when if x in allowed_when}
        # Por defecto, mostrar FUTUROS (igual que la pantalla de conciertos)
        if not f_when:
            f_when = {"FUTURE"}

        q = (
            session_db.query(Concert)
            .options(joinedload(Concert.venue))
            .filter(Concert.artist_id == artist.id)
        )

        if f_statuses:
            q = q.filter(Concert.status.in_(f_statuses))

        today = today_local()
        want_past = "PAST" in f_when
        want_future = "FUTURE" in f_when
        if want_past and not want_future:
            q = q.filter(Concert.date < today)
        elif want_future and not want_past:
            q = q.filter(Concert.date >= today)

        concerts = q.order_by(Concert.date.asc()).all()

        concerts_sections = {k: [] for k in CONCERTS_SECTION_ORDER}
        for c in concerts:
            concerts_sections.setdefault(c.sale_type or "EMPRESA", []).append(c)
        for k in concerts_sections:
            concerts_sections[k].sort(key=lambda x: (x.date or date.max))

        return render_template(
            "artist_detail.html",
            artist=artist,
            tab=tab,
            disc_tab=disc_tab,
            people=people,
            contracts=contracts,
            songs=songs,
            default_concepts=ARTIST_CONTRACT_DEFAULT_CONCEPTS,
            concerts_sections=concerts_sections,
            concerts_order=CONCERTS_SECTION_ORDER,
            concerts_titles=CONCERTS_SECTION_TITLE,
            concerts_total=len(concerts),
            f_statuses=f_statuses,
            f_when=sorted(list(f_when)),
        )
    finally:
        session_db.close()

@app.post("/artistas/<artist_id>/update")
@admin_required
def artist_update(artist_id):
    session_db = db()
    a = session_db.get(Artist, to_uuid(artist_id))
    if not a:
        flash("Artista no encontrado.", "warning")
        session_db.close()
        return redirect(safe_next_or(url_for("artists_view")))
    a.name = request.form.get("name", a.name).strip()
    photo = request.files.get("photo")
    try:
        if photo and photo.filename:
            a.photo_url = upload_png(photo, "artists")
        session_db.commit()
        flash("Artista actualizado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(safe_next_or(url_for("artists_view")))

@app.post("/artistas/<artist_id>/delete")
@admin_required
def artist_delete(artist_id):
    session_db = db()
    try:
        a = session_db.get(Artist, to_uuid(artist_id))
        if a:
            session_db.delete(a)
            session_db.commit()
            flash("Artista eliminado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(safe_next_or(url_for("artists_view")))


# ---------- ARTISTAS: PERSONAS (miembros) ----------

@app.post("/artistas/<artist_id>/person/add", endpoint="artist_person_add")
@admin_required
def artist_person_add(artist_id):
    session_db = db()
    try:
        a = session_db.get(Artist, to_uuid(artist_id))
        if not a:
            flash("Artista no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        first_name = (request.form.get("first_name") or "").strip()
        last_name = (request.form.get("last_name") or "").strip()
        if not first_name:
            flash("El nombre es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=a.id, tab="datos")))

        p = ArtistPerson(artist_id=a.id, first_name=first_name, last_name=last_name or "")
        session_db.add(p)
        session_db.commit()
        flash("Persona añadida.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=a.id, tab="datos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo persona: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/person/<person_id>/update", endpoint="artist_person_update")
@admin_required
def artist_person_update(person_id):
    session_db = db()
    try:
        p = session_db.get(ArtistPerson, to_uuid(person_id))
        if not p:
            flash("Persona no encontrada.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        first_name = (request.form.get("first_name") or "").strip()
        last_name = (request.form.get("last_name") or "").strip()
        if not first_name:
            flash("El nombre es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=p.artist_id, tab="datos")))

        p.first_name = first_name
        p.last_name = last_name or ""
        session_db.commit()
        flash("Persona actualizada.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=p.artist_id, tab="datos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando persona: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/person/<person_id>/delete", endpoint="artist_person_delete")
@admin_required
def artist_person_delete(person_id):
    session_db = db()
    try:
        p = session_db.get(ArtistPerson, to_uuid(person_id))
        if not p:
            flash("Persona no encontrada.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        artist_id = p.artist_id
        session_db.delete(p)
        session_db.commit()
        flash("Persona eliminada.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=artist_id, tab="datos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando persona: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


# ---------- ARTISTAS: CONTRATOS ----------

def _parse_pct(v) -> float:
    try:
        s = (v or "").strip().replace(",", ".")
        n = float(s) if s else 0.0
    except Exception:
        n = 0.0
    return max(0.0, min(100.0, n))


def _norm_contract_base(v: str) -> str:
    v = (v or "").strip().upper()
    return v if v in ("GROSS", "NET", "PROFIT") else "GROSS"


def _norm_profit_scope(v: str) -> str:
    v = (v or "").strip().upper()
    return v if v in ("CONCEPT_ONLY", "CONCEPT_PLUS_GENERAL") else "CONCEPT_ONLY"


def _norm_text_key(v: str) -> str:
    """Normaliza textos para comparaciones (minúsculas + sin acentos)."""
    v = (v or "").strip().lower()
    if not v:
        return ""
    v = unicodedata.normalize("NFD", v)
    v = "".join(ch for ch in v if unicodedata.category(ch) != "Mn")
    v = " ".join(v.split())
    return v


def _pick_artist_commitment(session_db, artist_id: UUID, concept_variants: list[str]):
    """Devuelve el compromiso de contrato más reciente para un concepto.

    - concept_variants: lista de strings (ya normalizados con _norm_text_key)

    Estrategia de selección:
    1) Filtramos compromisos del artista cuyo concepto normalizado coincide con alguna variante.
    2) Elegimos el más reciente según:
       signed_date DESC (NULLS LAST) -> created_at DESC -> commitment.created_at DESC
    """

    rows = (
        session_db.query(ArtistContractCommitment, ArtistContract)
        .join(ArtistContract, ArtistContractCommitment.contract_id == ArtistContract.id)
        .filter(ArtistContract.artist_id == artist_id)
        .all()
    )

    candidates = []
    vset = {(_norm_text_key(x) or "") for x in (concept_variants or []) if (x or "").strip()}
    for m, c in rows:
        if not m or not c:
            continue
        if _norm_text_key(getattr(m, "concept", "")) in vset:
            candidates.append((m, c))

    if not candidates:
        return None, None

    def key(item):
        m, c = item
        sd = getattr(c, "signed_date", None)
        ca = getattr(c, "created_at", None)
        ma = getattr(m, "created_at", None)
        # signed_date puede ser None: lo mandamos al final.
        sd_sort = sd or date.min
        return (sd_sort, ca or datetime.min, ma or datetime.min)

    candidates.sort(key=key, reverse=True)
    return candidates[0]


@app.post("/artistas/<artist_id>/contracts/create", endpoint="artist_contract_create")
@admin_required
def artist_contract_create(artist_id):
    session_db = db()
    try:
        a = session_db.get(Artist, to_uuid(artist_id))
        if not a:
            flash("Artista no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        name = (request.form.get("name") or "").strip()
        signed_raw = (request.form.get("signed_date") or "").strip()
        signed_date = None
        if signed_raw:
            try:
                signed_date = parse_date(signed_raw)
            except Exception:
                signed_date = None

        if not name:
            flash("El nombre del contrato es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=a.id, tab="contratos")))

        c = ArtistContract(artist_id=a.id, name=name, signed_date=signed_date)
        session_db.add(c)
        session_db.commit()
        flash("Contrato creado.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=a.id, tab="contratos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error creando contrato: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/contracts/<contract_id>/update", endpoint="artist_contract_update")
@admin_required
def artist_contract_update(contract_id):
    session_db = db()
    try:
        c = session_db.get(ArtistContract, to_uuid(contract_id))
        if not c:
            flash("Contrato no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        name = (request.form.get("name") or "").strip()
        signed_raw = (request.form.get("signed_date") or "").strip()
        signed_date = None
        if signed_raw:
            try:
                signed_date = parse_date(signed_raw)
            except Exception:
                signed_date = None

        if not name:
            flash("El nombre del contrato es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=c.artist_id, tab="contratos")))

        c.name = name
        c.signed_date = signed_date
        session_db.commit()
        flash("Contrato actualizado.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=c.artist_id, tab="contratos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando contrato: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/contracts/<contract_id>/delete", endpoint="artist_contract_delete")
@admin_required
def artist_contract_delete(contract_id):
    session_db = db()
    try:
        c = session_db.get(ArtistContract, to_uuid(contract_id))
        if not c:
            flash("Contrato no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        aid = c.artist_id
        session_db.delete(c)
        session_db.commit()
        flash("Contrato eliminado.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=aid, tab="contratos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando contrato: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


# ---------- ARTISTAS: COMPROMISOS (líneas de contrato) ----------

@app.post("/artistas/contracts/<contract_id>/commitments/add", endpoint="artist_commitment_add")
@admin_required
def artist_commitment_add(contract_id):
    session_db = db()
    try:
        c = session_db.get(ArtistContract, to_uuid(contract_id))
        if not c:
            flash("Contrato no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        concept = (request.form.get("concept") or "").strip()
        if not concept:
            flash("El concepto es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=c.artist_id, tab="contratos")))

        base = _norm_contract_base(request.form.get("base"))
        profit_scope = _norm_profit_scope(request.form.get("profit_scope")) if base == "PROFIT" else None

        m = ArtistContractCommitment(
            contract_id=c.id,
            concept=concept,
            pct_artist=_parse_pct(request.form.get("pct_artist")),
            pct_office=_parse_pct(request.form.get("pct_office")),
            base=base,
            profit_scope=profit_scope,
        )
        session_db.add(m)
        session_db.commit()
        flash("Compromiso añadido.", "success")
        return redirect(safe_next_or(url_for("artist_detail_view", artist_id=c.artist_id, tab="contratos")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo compromiso: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/commitments/<commitment_id>/update", endpoint="artist_commitment_update")
@admin_required
def artist_commitment_update(commitment_id):
    session_db = db()
    try:
        m = session_db.get(ArtistContractCommitment, to_uuid(commitment_id))
        if not m:
            flash("Compromiso no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        # necesitamos el contrato para redirigir
        c = session_db.get(ArtistContract, m.contract_id)
        artist_id = c.artist_id if c else None

        concept = (request.form.get("concept") or "").strip()
        if not concept:
            flash("El concepto es obligatorio.", "warning")
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=artist_id, tab="contratos")))

        base = _norm_contract_base(request.form.get("base"))
        profit_scope = _norm_profit_scope(request.form.get("profit_scope")) if base == "PROFIT" else None

        m.concept = concept
        m.pct_artist = _parse_pct(request.form.get("pct_artist"))
        m.pct_office = _parse_pct(request.form.get("pct_office"))
        m.base = base
        m.profit_scope = profit_scope

        session_db.commit()
        flash("Compromiso actualizado.", "success")
        if artist_id:
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=artist_id, tab="contratos")))
        return redirect(safe_next_or(url_for("artists_view")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando compromiso: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()


@app.post("/artistas/commitments/<commitment_id>/delete", endpoint="artist_commitment_delete")
@admin_required
def artist_commitment_delete(commitment_id):
    session_db = db()
    try:
        m = session_db.get(ArtistContractCommitment, to_uuid(commitment_id))
        if not m:
            flash("Compromiso no encontrado.", "warning")
            return redirect(safe_next_or(url_for("artists_view")))

        c = session_db.get(ArtistContract, m.contract_id)
        artist_id = c.artist_id if c else None

        session_db.delete(m)
        session_db.commit()
        flash("Compromiso eliminado.", "success")
        if artist_id:
            return redirect(safe_next_or(url_for("artist_detail_view", artist_id=artist_id, tab="contratos")))
        return redirect(safe_next_or(url_for("artists_view")))
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando compromiso: {e}", "danger")
        return redirect(safe_next_or(url_for("artists_view")))
    finally:
        session_db.close()

# ---------- EMISORAS ----------
@app.route("/emisoras", methods=["GET", "POST"])
@admin_required
def stations_view():
    session_db = db()

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        logo = request.files.get("logo")
        try:
            logo_url = upload_png(logo, "stations") if logo else None
            st = RadioStation(name=name, logo_url=logo_url)
            session_db.add(st)
            session_db.commit()
            flash("Emisora creada.", "success")
        except Exception as e:
            session_db.rollback()
            flash(f"Error creando emisora: {e}", "danger")
        finally:
            session_db.close()
        return redirect(url_for("stations_view"))
    stations = session_db.query(RadioStation).order_by(RadioStation.name.asc()).all()
    session_db.close()
    return render_template("stations.html", stations=stations)

@app.post("/emisoras/<station_id>/update")
@admin_required
def station_update(station_id):
    session_db = db()
    st = session_db.get(RadioStation, to_uuid(station_id))
    if not st:
        flash("Emisora no encontrada.", "warning")
        session_db.close()
        return redirect(url_for("stations_view"))
    st.name = request.form.get("name", st.name).strip()
    logo = request.files.get("logo")
    try:
        if logo and logo.filename:
            st.logo_url = upload_png(logo, "stations")
        session_db.commit()
        flash("Emisora actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("stations_view"))

@app.post("/emisoras/<station_id>/delete")
@admin_required
def station_delete(station_id):
    session_db = db()
    try:
        st = session_db.get(RadioStation, to_uuid(station_id))
        if st:
            session_db.delete(st)
            session_db.commit()
            flash("Emisora eliminada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("stations_view"))

# ---------- DISCOGRÁFICA ----------


@app.get("/discografica")
@admin_required
def discografica_view():
    """Pestaña principal Discográfica.

    Agrupa (por ahora):
    - Canciones (Repertorio)
    - Royalties (próximamente)
    - Editorial (próximamente)
    - Ingresos (próximamente)
    """

    section = (request.args.get("section") or "canciones").lower().strip()
    if section not in ("canciones", "royalties", "editorial", "ingresos", "isrc"):
        section = "canciones"

    # subpestañas ISRC
    isrc_tab = (request.args.get("isrc_tab") or "repertorio").lower().strip()
    if isrc_tab not in ("repertorio", "configurador"):
        isrc_tab = "repertorio"

    session_db = db()
    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()

    artist_blocks = []
    song_audio_isrc_map = {}
    isrc_artist_blocks = []
    isrc_years = []
    isrc_config = None
    isrc_artist_settings = {}
    isrc_contract_artists = []
    isrc_filter_artists = []

    if section == "canciones":
        for a in artists:
            songs = (
                session_db.query(Song)
                .join(SongArtist, Song.id == SongArtist.song_id)
                .filter(SongArtist.artist_id == a.id)
                .order_by(Song.release_date.desc())
                .all()
            )
            for s in songs:
                _ = s.artists
            artist_blocks.append((a, songs))

        # Prefetch ISRC AUDIO principal por canción (song_isrc_codes),
        # para mostrarlo en el repertorio.
        all_song_ids = [s.id for _, ss in artist_blocks for s in (ss or [])]
        if all_song_ids:
            rows = (
                session_db.query(SongISRCCode.song_id, SongISRCCode.code)
                .filter(SongISRCCode.song_id.in_(all_song_ids))
                .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                .filter(SongISRCCode.is_primary == True)  # noqa: E712
                .all()
            )
            for sid, code in rows:
                if sid and code:
                    song_audio_isrc_map[sid] = code

    if section == "isrc":
        # filtros
        f_artist_id = to_uuid((request.args.get("artist_id") or "").strip())
        f_year = None
        try:
            f_year = int((request.args.get("year") or "").strip())
        except Exception:
            f_year = None

        # Solo mostramos repertorio ISRC de canciones que tengan ISRC
        # y cumplan: master_ownership_pct > 1% o es distribución.
        ownership_cond = (
            (func.coalesce(Song.master_ownership_pct, 0) > 1)
            | (func.coalesce(Song.is_distribution, False) == True)  # noqa: E712
        )

        # años disponibles (release_date) SOLO de canciones con ISRC y filtro de propiedad
        years_rows = (
            session_db.query(func.extract("year", Song.release_date).label("y"))
            .join(SongISRCCode, SongISRCCode.song_id == Song.id)
            .filter(ownership_cond)
            .distinct()
            .order_by(func.extract("year", Song.release_date).desc())
            .all()
        )
        isrc_years = [int(r.y) for r in years_rows if r and r.y]

        # Artistas con canciones con ISRC (y filtro de propiedad)
        arows = (
            session_db.query(SongArtist.artist_id)
            .join(Song, Song.id == SongArtist.song_id)
            .join(SongISRCCode, SongISRCCode.song_id == Song.id)
            .filter(ownership_cond)
            .distinct()
            .all()
        )
        a_set = {r.artist_id for r in arows if r and r.artist_id}
        isrc_filter_artists = [a for a in artists if a.id in a_set]

        if isrc_tab == "repertorio":
            # Repertorio ISRC agrupado por artista.
            # - Solo canciones con ISRC
            # - Solo si master_ownership_pct > 1% o es distribución
            # - Ordenado por código ISRC (más actual -> más antiguo)

            artists_iter = [a for a in isrc_filter_artists if (not f_artist_id) or a.id == f_artist_id]

            # subquery: máximo código por canción (para ordenar por ISRC)
            max_code_sq = (
                session_db.query(
                    SongISRCCode.song_id.label("song_id"),
                    func.max(SongISRCCode.code).label("max_code"),
                )
                .group_by(SongISRCCode.song_id)
                .subquery()
            )

            songs_by_artist: dict = {}
            all_song_ids: list = []
            for a in artists_iter:
                q = (
                    session_db.query(Song)
                    .join(SongArtist, Song.id == SongArtist.song_id)
                    .join(max_code_sq, max_code_sq.c.song_id == Song.id)
                    .filter(SongArtist.artist_id == a.id)
                    .filter(ownership_cond)
                )
                if f_year:
                    q = q.filter(func.extract("year", Song.release_date) == f_year)

                songs = q.order_by(max_code_sq.c.max_code.desc()).all()
                songs_by_artist[a.id] = songs
                all_song_ids.extend([s.id for s in songs])

            # Prefetch TODOS los ISRCs (incl. subproductos), ordenados por código desc
            codes_by_song = {}
            if all_song_ids:
                rows = (
                    session_db.query(SongISRCCode)
                    .filter(SongISRCCode.song_id.in_(all_song_ids))
                    .order_by(SongISRCCode.code.desc())
                    .all()
                )
                for r in rows:
                    codes_by_song.setdefault(r.song_id, []).append(r)

            for a in artists_iter:
                songs = songs_by_artist.get(a.id) or []
                enriched = []
                for s in songs:
                    codes = codes_by_song.get(s.id) or []

                    def _split(kind: str):
                        kind = (kind or "").upper()
                        prim = None
                        subs = []
                        for c in codes:
                            if (c.kind or "").upper() != kind:
                                continue
                            if c.is_primary and prim is None:
                                prim = c
                            elif not c.is_primary:
                                subs.append(c)
                        return prim, subs

                    audio_p, audio_subs = _split("AUDIO")
                    video_p, video_subs = _split("VIDEO")

                    # key de orden (max code ya viene por query, pero lo guardamos)
                    max_code = codes[0].code if codes else None
                    enriched.append(
                        {
                            "song": s,
                            "audio_primary": audio_p.code if audio_p else None,
                            "video_primary": video_p.code if video_p else None,
                            "audio_subs": [(c.code, c.subproduct_name) for c in audio_subs],
                            "video_subs": [(c.code, c.subproduct_name) for c in video_subs],
                            "max_code": max_code,
                        }
                    )

                isrc_artist_blocks.append((a, enriched))

        else:
            # Configurador
            isrc_config = session_db.get(ISRCConfig, 1)
            if not isrc_config:
                isrc_config = ISRCConfig(id=1)
                session_db.add(isrc_config)
                session_db.commit()

            # Ajustes por artista
            settings_rows = session_db.query(ArtistISRCSetting).all()
            isrc_artist_settings = {r.artist_id: r for r in settings_rows}

            # Artistas con contrato discográfico / catálogo / distribución.
            concepts = [
                "discográfico",
                "discografico",
                "catálogo",
                "catalogo",
                "distribución",
                "distribucion",
            ]
            # artist ids
            aid_rows = (
                session_db.query(ArtistContract.artist_id)
                .join(ArtistContractCommitment, ArtistContractCommitment.contract_id == ArtistContract.id)
                .filter(func.lower(ArtistContractCommitment.concept).in_([c.lower() for c in concepts]))
                .distinct()
                .all()
            )
            aid_set = {r.artist_id for r in aid_rows if r and r.artist_id}
            isrc_contract_artists = [a for a in artists if a.id in aid_set]

    session_db.close()
    return render_template(
        "discografica.html",
        section=section,
        artists=artists,
        artist_blocks=artist_blocks,
        song_audio_isrc_map=song_audio_isrc_map,
        # ISRC
        isrc_tab=isrc_tab,
        isrc_artist_blocks=isrc_artist_blocks,
        isrc_filter_artists=isrc_filter_artists,
        isrc_years=isrc_years,
        isrc_config=isrc_config,
        isrc_artist_settings=isrc_artist_settings,
        isrc_contract_artists=isrc_contract_artists,
        selected_artist_id=str(f_artist_id) if section == "isrc" and 'f_artist_id' in locals() and f_artist_id else "",
        selected_year=str(f_year) if section == "isrc" and 'f_year' in locals() and f_year else "",
    )


@app.post("/discografica/isrc/config/update")
@admin_required
def discografica_isrc_config_update():
    """Guardar configuración global de ISRC (país + matrices audio/video)."""

    if not can_edit_catalogs():
        return forbid("No tienes permisos para editar la configuración ISRC.")

    country_code = (request.form.get("country_code") or "ES").strip().upper()[:2] or "ES"
    audio_matrix = (request.form.get("audio_matrix") or "").strip()
    video_matrix = (request.form.get("video_matrix") or "").strip()

    # Normalizar: solo dígitos y padding
    def norm_digits(v: str, length: int) -> str:
        v = "".join([c for c in (v or "") if c.isdigit()])
        if not v:
            return "0" * length
        return v.zfill(length)[-length:]

    audio_matrix = norm_digits(audio_matrix, 3)
    video_matrix = norm_digits(video_matrix, 3)

    session_db = db()
    try:
        cfg = session_db.get(ISRCConfig, 1)
        if not cfg:
            cfg = ISRCConfig(id=1)
            session_db.add(cfg)
        cfg.country_code = country_code
        cfg.audio_matrix = audio_matrix
        cfg.video_matrix = video_matrix
        cfg.updated_at = datetime.now(tz=ZoneInfo("Europe/Madrid"))
        session_db.commit()
        flash("Configuración ISRC guardada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando configuración ISRC: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_view", section="isrc", isrc_tab="configurador"))


@app.post("/discografica/isrc/artist/<artist_id>/set")
@admin_required
def discografica_isrc_artist_set(artist_id):
    """Guardar número matriz ISRC del artista (2 dígitos)."""

    if not can_edit_catalogs():
        return forbid("No tienes permisos para editar ISRC por artista.")

    matrix = (request.form.get("artist_matrix") or "").strip()
    matrix = "".join([c for c in matrix if c.isdigit()]).zfill(2)[-2:] if matrix else None

    session_db = db()
    try:
        aid = to_uuid(artist_id)
        artist = session_db.get(Artist, aid)
        if not artist:
            flash("Artista no encontrado.", "warning")
            return redirect(url_for("discografica_view", section="isrc", isrc_tab="configurador"))

        rec = session_db.get(ArtistISRCSetting, aid)
        if not rec:
            rec = ArtistISRCSetting(artist_id=aid)
            session_db.add(rec)
        rec.artist_matrix = matrix
        rec.updated_at = datetime.now(tz=ZoneInfo("Europe/Madrid"))
        session_db.commit()
        flash(f"ISRC del artista guardado: {artist.name}", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando ISRC del artista: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_view", section="isrc", isrc_tab="configurador"))


@app.post("/discografica/canciones/create")
@admin_required
def discografica_song_create():
    if not can_edit_catalogs():
        return forbid("No tienes permisos para añadir canciones.")

    title = (request.form.get("title") or "").strip()
    collaborator = (request.form.get("collaborator") or "").strip() or None
    release_date_raw = (request.form.get("release_date") or "").strip()
    artist_id = to_uuid((request.form.get("artist_id") or "").strip())
    is_catalog = bool(request.form.get("is_catalog"))

    ownership_type = (request.form.get("ownership_type") or "own").strip().lower()
    is_distribution = ownership_type == "distribution"
    master_pct_raw = (request.form.get("master_ownership_pct") or "").strip()

    master_pct = None
    if is_distribution:
        master_pct = Decimal("0")
    else:
        try:
            master_pct = Decimal(master_pct_raw) if master_pct_raw else Decimal("100")
        except (InvalidOperation, ValueError):
            master_pct = Decimal("100")
        # acotar
        if master_pct < 0:
            master_pct = Decimal("0")
        if master_pct > 100:
            master_pct = Decimal("100")

    if not title:
        flash("El nombre de la canción es obligatorio.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))
    if not release_date_raw:
        flash("La fecha de publicación es obligatoria.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))
    if not artist_id:
        flash("Debes seleccionar un artista.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))

    session_db = db()
    try:
        release_date = parse_date(release_date_raw)
        s = Song(
            title=title,
            collaborator=collaborator,
            release_date=release_date,
            is_catalog=is_catalog,
            is_distribution=is_distribution,
            master_ownership_pct=master_pct,
        )
        session_db.add(s)
        session_db.flush()  # para obtener s.id
        session_db.add(SongArtist(song_id=s.id, artist_id=artist_id))

        # Estado por defecto
        session_db.add(SongStatus(song_id=s.id, cover_done=False))

        # Intérpretes por defecto: artista principal (main) + colaboradores (no main)
        primary_artist = session_db.get(Artist, artist_id)
        if primary_artist:
            session_db.add(SongInterpreter(song_id=s.id, name=primary_artist.name, is_main=True))
        if collaborator:
            for part in [p.strip() for p in collaborator.split(",") if p.strip()]:
                session_db.add(SongInterpreter(song_id=s.id, name=part, is_main=False))

        session_db.commit()
        flash("Canción creada.", "success")
        return redirect(url_for("discografica_song_detail", song_id=str(s.id)))
    except Exception as e:
        session_db.rollback()
        flash(f"Error creando canción: {e}", "danger")
        return redirect(url_for("discografica_view", section="canciones"))
    finally:
        session_db.close()


@app.get("/discografica/canciones/<song_id>")
@admin_required
def discografica_song_detail(song_id):
    tab = (request.args.get("tab") or "informacion").lower().strip()
    allowed_tabs = {
        "informacion",
        "editorial",
        "materiales",
        "royalties",
        "ingresos",
        "gastos",
        "promocion",
        "radio",
    }
    if tab not in allowed_tabs:
        tab = "informacion"

    edit = bool((request.args.get("edit") or "").strip())
    if edit and not can_edit_catalogs():
        edit = False

    session_db = db()
    s = session_db.get(Song, to_uuid(song_id))
    if not s:
        session_db.close()
        flash("Canción no encontrada.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))

    # Cargar relación
    _ = s.artists
    primary_artist = s.artists[0] if s.artists else None

    # Asegurar estado
    st = session_db.get(SongStatus, s.id)
    if not st:
        st = SongStatus(song_id=s.id)
        # portada (auto)
        st.cover_done = bool(s.cover_url)
        if st.cover_done:
            st.cover_updated_at = datetime.now(tz=ZoneInfo("Europe/Madrid"))
        session_db.add(st)
        session_db.commit()

    # Intérpretes
    interpreters = (
        session_db.query(SongInterpreter)
        .filter(SongInterpreter.song_id == s.id)
        .order_by(SongInterpreter.created_at.asc())
        .all()
    )

    # ISRCs
    isrc_codes = (
        session_db.query(SongISRCCode)
        .filter(SongISRCCode.song_id == s.id)
        .order_by(SongISRCCode.created_at.asc())
        .all()
    )

    # Días restantes
    days_remaining = None
    if s.release_date and s.release_date > today_local():
        try:
            days_remaining = (s.release_date - today_local()).days
        except Exception:
            days_remaining = None

    # defaults de UI
    current_year = today_local().year
    default_copyright = f"© ℗ {current_year} PIES compañía discográfica SL"

    # =====================
    # TAB: ROYALTIES
    # =====================
    royalties_artist = None
    royalty_other_beneficiaries = []

    if tab == "royalties":
        # Beneficiario artista (auto según contratos)
        if primary_artist:
            if bool(getattr(s, "is_catalog", False)):
                concept_label = "Catálogo"
                concept_variants = ["catálogo", "catalogo"]
            else:
                if bool(getattr(s, "is_distribution", False)):
                    concept_label = "Distribución"
                    concept_variants = ["distribución", "distribucion"]
                else:
                    concept_label = "Discográfico"
                    concept_variants = ["discográfico", "discografico", "discográfica", "discografica"]

            m, c = _pick_artist_commitment(session_db, primary_artist.id, concept_variants)
            if m:
                base = _norm_contract_base(getattr(m, "base", None))
                royalties_artist = {
                    "artist_name": (primary_artist.name or "").strip(),
                    "artist_photo": primary_artist.photo_url,
                    "pct": float(getattr(m, "pct_artist", 0) or 0),
                    "base": base,
                    "profit_scope": _norm_profit_scope(getattr(m, "profit_scope", None)) if base == "PROFIT" else None,
                    "concept": concept_label,
                    "contract_name": getattr(c, "name", None) if c else None,
                    "found": True,
                }
            else:
                royalties_artist = {
                    "artist_name": (primary_artist.name or "").strip(),
                    "artist_photo": primary_artist.photo_url,
                    "pct": 0.0,
                    "base": "GROSS",
                    "profit_scope": None,
                    "concept": concept_label,
                    "contract_name": None,
                    "found": False,
                }

        # Otros beneficiarios (manuales)
        royalty_other_beneficiaries = (
            session_db.query(SongRoyaltyBeneficiary)
            .options(joinedload(SongRoyaltyBeneficiary.promoter))
            .filter(SongRoyaltyBeneficiary.song_id == s.id)
            .order_by(SongRoyaltyBeneficiary.created_at.asc())
            .all()
        )

    session_db.close()
    return render_template(
        "song_detail.html",
        song=s,
        primary_artist=primary_artist,
        tab=tab,
        edit=edit,
        status=st,
        interpreters=interpreters,
        isrc_codes=isrc_codes,
        days_remaining=days_remaining,
        default_copyright=default_copyright,
        royalties_artist=royalties_artist,
        royalty_other_beneficiaries=royalty_other_beneficiaries,
    )


@app.post("/discografica/canciones/<song_id>/status/toggle")
@admin_required
def discografica_song_status_toggle(song_id):
    """Toggle de iconos de estado (excepto portada, que es automática)."""

    if not can_edit_catalogs():
        return forbid("No tienes permisos para actualizar estados.")

    key = (request.form.get("key") or "").strip().lower()
    allowed = {
        "materials": ("materials_done", "materials_updated_at"),
        "production_contract": ("production_contract_done", "production_contract_updated_at"),
        "collaboration_contract": ("collaboration_contract_done", "collaboration_contract_updated_at"),
        "agedi": ("agedi_done", "agedi_updated_at"),
        "sgae": ("sgae_done", "sgae_updated_at"),
        "ritmonet": ("ritmonet_done", "ritmonet_updated_at"),
        "distributed": ("distributed_done", "distributed_updated_at"),
    }

    nxt = safe_next_or(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))
    if key not in allowed:
        flash("Estado no válido.", "warning")
        return redirect(nxt)

    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        st = session_db.get(SongStatus, sid)
        if not st:
            st = SongStatus(song_id=sid)
            st.cover_done = bool(getattr(s, "cover_url", None))
            if st.cover_done:
                st.cover_updated_at = datetime.now(TZ_MADRID)
            session_db.add(st)

        done_attr, ts_attr = allowed[key]
        current = bool(getattr(st, done_attr) or False)
        setattr(st, done_attr, not current)
        setattr(st, ts_attr, datetime.now(TZ_MADRID))
        st.updated_at = datetime.now(TZ_MADRID)
        session_db.add(st)
        session_db.commit()
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando estado: {e}", "danger")
    finally:
        session_db.close()

    return redirect(nxt)


@app.post("/discografica/canciones/<song_id>/info/update")
@admin_required
def discografica_song_info_update(song_id):
    """Actualiza la pestaña Información de la ficha de canción."""

    if not can_edit_catalogs():
        return forbid("No tienes permisos para editar la ficha de la canción.")

    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        # Base
        s.title = (request.form.get("title") or s.title or "").strip() or s.title
        s.version = (request.form.get("version") or "").strip() or None
        s.collaborator = (request.form.get("collaborator") or "").strip() or None

        rd = (request.form.get("release_date") or "").strip()
        if rd:
            s.release_date = parse_date(rd)

        s.is_catalog = bool(request.form.get("is_catalog"))

        # Propiedad / distribución
        ownership_type = (request.form.get("ownership_type") or "own").strip().lower()
        s.is_distribution = ownership_type == "distribution"

        master_pct_raw = (request.form.get("master_ownership_pct") or "").strip()
        if s.is_distribution:
            s.master_ownership_pct = Decimal("0")
        else:
            try:
                mp = Decimal(master_pct_raw) if master_pct_raw else Decimal("100")
            except (InvalidOperation, ValueError):
                mp = Decimal("100")
            if mp < 0:
                mp = Decimal("0")
            if mp > 100:
                mp = Decimal("100")
            s.master_ownership_pct = mp

        # Portada
        cover = request.files.get("cover")
        cover_uploaded = False
        if cover and getattr(cover, "filename", ""):
            s.cover_url = upload_image(cover, "songs")
            cover_uploaded = True

        # Portada (estado automático)
        st = session_db.get(SongStatus, s.id)
        if not st:
            st = SongStatus(song_id=s.id)
        st.cover_done = bool(s.cover_url)
        if cover_uploaded:
            st.cover_updated_at = datetime.now(TZ_MADRID)
        st.updated_at = datetime.now(TZ_MADRID)
        session_db.add(st)

        # Timing / TikTok start
        s.duration_seconds = parse_timecode_to_seconds(request.form.get("duration") or request.form.get("duration_seconds"))
        s.tiktok_start_seconds = parse_timecode_to_seconds(request.form.get("tiktok_start") or request.form.get("tiktok_start_seconds"))

        # Fecha grabación
        rec_date = (request.form.get("recording_date") or "").strip()
        s.recording_date = parse_date(rec_date) if rec_date else None

        # BPM
        bpm_raw = (request.form.get("bpm") or "").strip()
        if bpm_raw:
            try:
                s.bpm = int(bpm_raw)
            except Exception:
                s.bpm = None
        else:
            s.bpm = None

        s.genre = (request.form.get("genre") or "").strip() or None
        s.copyright_text = (request.form.get("copyright_text") or "").strip() or None

        s.recording_engineer = (request.form.get("recording_engineer") or "").strip() or None
        s.mixing_engineer = (request.form.get("mixing_engineer") or "").strip() or None
        s.mastering_engineer = (request.form.get("mastering_engineer") or "").strip() or None
        s.studio = (request.form.get("studio") or "").strip() or None

        # Listas en JSON
        def to_lines_json(v: str | None):
            raw = (v or "").replace("\r", "")
            items = [x.strip() for x in raw.split("\n") if x.strip()]
            return items or None

        s.producers = to_lines_json(request.form.get("producers"))
        s.arrangers = to_lines_json(request.form.get("arrangers"))

        # Músicos/participantes
        insts = request.form.getlist("musician_instrument[]")
        names = request.form.getlist("musician_name[]")
        mus = []
        for inst, name in zip(insts, names):
            inst = (inst or "").strip()
            name = (name or "").strip()
            if not inst and not name:
                continue
            mus.append({"instrument": inst, "name": name})
        s.musicians = mus or None

        # Intérpretes
        names_i = request.form.getlist("interpreter_name[]")
        mains_i = request.form.getlist("interpreter_is_main[]")

        session_db.query(SongInterpreter).filter(SongInterpreter.song_id == sid).delete(synchronize_session=False)
        for idx, nm in enumerate(names_i):
            nm = (nm or "").strip()
            if not nm:
                continue
            main_val = "0"
            if idx < len(mains_i):
                main_val = (mains_i[idx] or "0").strip()
            is_main = main_val in ("1", "true", "True", "MAIN")
            session_db.add(SongInterpreter(song_id=sid, name=nm, is_main=is_main))

        # Asegurar estado / portada auto
        st = session_db.get(SongStatus, sid)
        if not st:
            st = SongStatus(song_id=sid)
        st.cover_done = bool(s.cover_url)
        if cover and getattr(cover, "filename", ""):
            st.cover_updated_at = datetime.now(TZ_MADRID)
        st.updated_at = datetime.now(TZ_MADRID)
        session_db.add(st)

        session_db.commit()
        flash("Ficha actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando ficha: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))


def _generate_isrc(session_db, *, kind: str, artist_id, country: str, matrix: str) -> tuple[str, int, int]:
    """Genera un ISRC con el formato:

    CC-AAA-YY-XXNNN
    - CC: país (2 letras)
    - AAA: matriz (3 dígitos)
    - YY: año (2 dígitos, del año actual)
    - XX: matriz artista (2 dígitos)
    - NNN: secuencia (3 dígitos) por artista y año
    """
    cfg_year = today_local().year
    yy = str(cfg_year % 100).zfill(2)

    aset = session_db.get(ArtistISRCSetting, artist_id)
    if not aset or not (aset.artist_matrix or "").strip():
        raise ValueError("Falta el número matriz ISRC del artista (configurador).")
    artist_matrix = "".join([c for c in (aset.artist_matrix or "") if c.isdigit()]).zfill(2)[-2:]

    max_seq = (
        session_db.query(func.max(SongISRCCode.sequence_num))
        .filter(SongISRCCode.artist_id == artist_id)
        .filter(SongISRCCode.year == cfg_year)
        .scalar()
    )
    seq = int(max_seq or 0) + 1

    country = (country or "ES").strip().upper()[:2] or "ES"
    matrix = "".join([c for c in (matrix or "") if c.isdigit()]).zfill(3)[-3:]

    code = f"{country}-{matrix}-{yy}-{artist_matrix}{str(seq).zfill(3)}"
    return code, cfg_year, seq


@app.post("/discografica/canciones/<song_id>/isrc/add")
@admin_required
def discografica_song_isrc_add(song_id):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para añadir ISRC.")

    kind = (request.form.get("kind") or "AUDIO").strip().upper()
    if kind not in ("AUDIO", "VIDEO"):
        kind = "AUDIO"

    is_primary = (request.form.get("is_primary") or "primary").strip().lower() == "primary"
    subproduct_name = (request.form.get("subproduct_name") or "").strip() or None

    mode = (request.form.get("mode") or "generate").strip().lower()
    manual_code = (request.form.get("code") or "").strip() or None

    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        _ = s.artists
        primary_artist = s.artists[0] if s.artists else None
        if not primary_artist:
            flash("La canción no tiene artista asociado.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))

        year_full = None
        seq = None

        if mode == "manual":
            if not manual_code:
                flash("Debes indicar un código ISRC.", "warning")
                return redirect(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))
            code = manual_code.strip().upper()

            # Intento de parseo (opcional)
            try:
                # ES-270-26-01001
                parts = code.split("-")
                if len(parts) == 4 and len(parts[2]) == 2:
                    yy = int(parts[2])
                    year_full = 2000 + yy
                    tail = parts[3]
                    if len(tail) >= 5:
                        seq = int(tail[-3:])
            except Exception:
                year_full = None
                seq = None
        else:
            cfg = session_db.get(ISRCConfig, 1)
            if not cfg:
                cfg = ISRCConfig(id=1)
                session_db.add(cfg)
                session_db.flush()

            matrix = cfg.audio_matrix if kind == "AUDIO" else cfg.video_matrix
            code, year_full, seq = _generate_isrc(
                session_db,
                kind=kind,
                artist_id=primary_artist.id,
                country=cfg.country_code,
                matrix=matrix,
            )

        rec = SongISRCCode(
            song_id=sid,
            artist_id=primary_artist.id,
            kind=kind,
            code=code,
            is_primary=is_primary,
            subproduct_name=subproduct_name,
            year=year_full,
            sequence_num=seq,
        )
        session_db.add(rec)

        # Mantener compatibilidad: guardar el ISRC principal de AUDIO en songs.isrc
        if kind == "AUDIO" and is_primary:
            s.isrc = code

        session_db.commit()
        flash("ISRC añadido.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo ISRC: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))


@app.post("/discografica/canciones/<song_id>/isrc/delete/<code_id>")
@admin_required
def discografica_song_isrc_delete(song_id, code_id):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para eliminar ISRC.")

    session_db = db()
    try:
        rec = session_db.get(SongISRCCode, to_uuid(code_id))
        if rec:
            was_primary_audio = (rec.kind or "").upper() == "AUDIO" and bool(rec.is_primary)
            sid = rec.song_id

            session_db.delete(rec)
            session_db.flush()

            # Mantener compatibilidad: actualizar songs.isrc si borramos el principal de AUDIO
            if was_primary_audio and sid:
                s = session_db.get(Song, sid)
                if s:
                    other = (
                        session_db.query(SongISRCCode)
                        .filter(SongISRCCode.song_id == sid)
                        .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                        .filter(SongISRCCode.is_primary == True)  # noqa: E712
                        .first()
                    )
                    s.isrc = other.code if other else None

            session_db.commit()
            flash("ISRC eliminado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando ISRC: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id, tab="informacion"))


@app.post("/discografica/canciones/<song_id>/update")
@admin_required
def discografica_song_update(song_id):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para editar canciones.")

    session_db = db()
    s = session_db.get(Song, to_uuid(song_id))
    if not s:
        session_db.close()
        flash("Canción no encontrada.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))

    try:
        s.title = (request.form.get("title") or s.title or "").strip() or s.title
        s.collaborator = (request.form.get("collaborator") or "").strip() or None

        rd = (request.form.get("release_date") or "").strip()
        if rd:
            s.release_date = parse_date(rd)

        s.is_catalog = bool(request.form.get("is_catalog"))
        s.isrc = (request.form.get("isrc") or "").strip() or None

        cover = request.files.get("cover")
        if cover and getattr(cover, "filename", ""):
            s.cover_url = upload_image(cover, "songs")

        session_db.commit()
        flash("Canción actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando canción: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id))


@app.post("/discografica/canciones/<song_id>/set_link")
@admin_required
def discografica_song_set_link(song_id):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para editar enlaces.")

    platform = (request.form.get("platform") or "").strip().lower()
    url = (request.form.get("url") or "").strip()
    if not platform:
        flash("Falta la plataforma.", "warning")
        return redirect(url_for("discografica_song_detail", song_id=song_id))
    if not url:
        flash("Debes indicar un enlace.", "warning")
        return redirect(url_for("discografica_song_detail", song_id=song_id))
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    field_map = {
        "spotify": "spotify_url",
        "apple_music": "apple_music_url",
        "amazon_music": "amazon_music_url",
        "tiktok": "tiktok_url",
        "youtube": "youtube_url",
    }
    field = field_map.get(platform)
    if not field:
        flash("Plataforma no soportada.", "warning")
        return redirect(url_for("discografica_song_detail", song_id=song_id))

    session_db = db()
    s = session_db.get(Song, to_uuid(song_id))
    if not s:
        session_db.close()
        flash("Canción no encontrada.", "warning")
        return redirect(url_for("discografica_view", section="canciones"))

    try:
        setattr(s, field, url)
        session_db.commit()
        flash("Enlace guardado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando enlace: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id))


# =====================
# DISCOGRÁFICA: ROYALTIES (beneficiarios)
# =====================


@app.get("/api/promoters/<pid>", endpoint="api_get_promoter")
@admin_required
def api_get_promoter(pid):
    """Devuelve datos completos de un tercero (promoter) para rellenar modales."""

    session_db = db()
    try:
        p = session_db.get(Promoter, to_uuid(pid))
        if not p:
            return jsonify({"error": "Tercero no encontrado."}), 404

        return jsonify(
            {
                "id": str(p.id),
                "nick": (p.nick or "").strip(),
                "logo_url": p.logo_url,
                "tax_id": (p.tax_id or "").strip(),
                "contact_email": (p.contact_email or "").strip(),
                "contact_phone": (p.contact_phone or "").strip(),
            }
        )
    finally:
        session_db.close()


@app.get("/api/song_royalty_beneficiaries/<beneficiary_id>", endpoint="api_get_song_royalty_beneficiary")
@admin_required
def api_get_song_royalty_beneficiary(beneficiary_id):
    """Devuelve datos de un beneficiario de royalties (incluye datos del tercero)."""

    session_db = db()
    try:
        b = (
            session_db.query(SongRoyaltyBeneficiary)
            .options(joinedload(SongRoyaltyBeneficiary.promoter))
            .filter(SongRoyaltyBeneficiary.id == to_uuid(beneficiary_id))
            .first()
        )
        if not b:
            return jsonify({"error": "Beneficiario no encontrado."}), 404

        p = b.promoter
        return jsonify(
            {
                "id": str(b.id),
                "song_id": str(b.song_id),
                "pct": float(getattr(b, "pct", 0) or 0),
                "base": (b.base or "GROSS").upper(),
                "profit_scope": (b.profit_scope or "").upper(),
                "promoter": {
                    "id": str(p.id) if p else "",
                    "nick": (p.nick or "").strip() if p else "",
                    "logo_url": getattr(p, "logo_url", None) if p else None,
                    "tax_id": (getattr(p, "tax_id", "") or "").strip() if p else "",
                    "contact_email": (getattr(p, "contact_email", "") or "").strip() if p else "",
                    "contact_phone": (getattr(p, "contact_phone", "") or "").strip() if p else "",
                },
            }
        )
    finally:
        session_db.close()


@app.post("/discografica/canciones/<song_id>/royalties/beneficiaries/save", endpoint="discografica_song_royalty_beneficiary_save")
@admin_required
def discografica_song_royalty_beneficiary_save(song_id):
    """Crea o edita un beneficiario de royalties (otros beneficiarios).

    Recibe multipart/form-data (FormData) desde el modal.
    """

    if not can_edit_catalogs():
        return jsonify({"error": "No tienes permisos para editar beneficiarios."}), 403

    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            return jsonify({"error": "Canción no encontrada."}), 404

        beneficiary_id = (request.form.get("beneficiary_id") or "").strip() or None
        promoter_id = (request.form.get("promoter_id") or "").strip() or None

        # Datos del tercero
        nick = (request.form.get("nick") or "").strip()
        tax_id = (request.form.get("tax_id") or "").strip()
        contact_email = (request.form.get("contact_email") or "").strip()
        contact_phone = (request.form.get("contact_phone") or "").strip()

        # Porcentaje / base
        pct = _parse_pct(request.form.get("pct"))
        base = _norm_contract_base(request.form.get("base"))
        profit_scope = _norm_profit_scope(request.form.get("profit_scope")) if base == "PROFIT" else None

        # Foto/logo (opcional)
        photo = request.files.get("photo") or request.files.get("logo")

        # --- Resolver tercero ---
        p = None

        # Si no viene promoter_id, intentamos resolver por nick (evita duplicados si no seleccionan del typeahead)
        if not promoter_id and nick:
            p = (
                session_db.query(Promoter)
                .filter(func.lower(Promoter.nick) == nick.lower())
                .first()
            )
            if p:
                promoter_id = str(p.id)

        if promoter_id:
            p = session_db.get(Promoter, to_uuid(promoter_id))
            if not p:
                return jsonify({"error": "Tercero no encontrado."}), 404
        else:
            if not nick:
                return jsonify({"error": "El nombre del tercero (Nick) es obligatorio."}), 400
            p = Promoter(nick=nick)
            session_db.add(p)
            session_db.flush()

        # Actualizamos datos del tercero (si vienen)
        if nick:
            p.nick = nick
        p.tax_id = tax_id or p.tax_id
        p.contact_email = contact_email or p.contact_email
        p.contact_phone = contact_phone or p.contact_phone

        if photo and getattr(photo, "filename", ""):
            p.logo_url = upload_image(photo, "promoters")

        # Validación: si faltan datos, obligar a completarlos desde el modal
        missing = []
        if not (p.nick or "").strip():
            missing.append("Nick")
        if not (p.tax_id or "").strip():
            missing.append("CIF/DNI")
        if not (p.contact_email or "").strip():
            missing.append("Email")
        if not (p.contact_phone or "").strip():
            missing.append("Teléfono")
        if missing:
            return jsonify({"error": "Faltan datos del tercero: " + ", ".join(missing)}), 400

        # --- Resolver beneficiario ---
        b = None
        if beneficiary_id:
            b = session_db.get(SongRoyaltyBeneficiary, to_uuid(beneficiary_id))
            if not b or b.song_id != sid:
                return jsonify({"error": "Beneficiario no encontrado para esta canción."}), 404

        # Si el usuario cambia el tercero en edición, comprobamos duplicados
        if b and b.promoter_id != p.id:
            existing = (
                session_db.query(SongRoyaltyBeneficiary)
                .filter(SongRoyaltyBeneficiary.song_id == sid)
                .filter(SongRoyaltyBeneficiary.promoter_id == p.id)
                .filter(SongRoyaltyBeneficiary.id != b.id)
                .first()
            )
            if existing:
                return jsonify({"error": "Ya existe este beneficiario en la canción."}), 400

        if not b:
            # Evita duplicados (song_id, promoter_id)
            b = (
                session_db.query(SongRoyaltyBeneficiary)
                .filter(SongRoyaltyBeneficiary.song_id == sid)
                .filter(SongRoyaltyBeneficiary.promoter_id == p.id)
                .first()
            )
            if not b:
                b = SongRoyaltyBeneficiary(song_id=sid, promoter_id=p.id)
                session_db.add(b)

        b.promoter_id = p.id
        b.pct = pct
        b.base = base
        b.profit_scope = profit_scope
        b.updated_at = datetime.now(tz=ZoneInfo("Europe/Madrid"))

        session_db.commit()
        return jsonify({"ok": True, "id": str(b.id), "promoter_id": str(p.id)})

    except Exception as e:
        session_db.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session_db.close()


# ---------- CANCIONES (LEGACY) ----------
@app.route("/canciones", methods=["GET", "POST"])
@admin_required
def songs_view():
    session_db = db()
    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()


    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        collaborator = request.form.get("collaborator", "").strip() or None
        release_date = parse_date(request.form.get("release_date"))
        cover = request.files.get("cover")
        artist_ids = [to_uuid(aid) for aid in request.form.getlist("artist_ids[]")]
        try:
            cover_url = upload_image(cover, "songs") if cover else None
            s = Song(title=title, collaborator=collaborator,
                     release_date=release_date, cover_url=cover_url)
            session_db.add(s)
            session_db.flush()  # tener s.id
            for aid in artist_ids:
                session_db.add(SongArtist(song_id=s.id, artist_id=aid))
            session_db.commit()
            flash("Canción creada.", "success")
        except Exception as e:
            session_db.rollback()
            flash(f"Error creando canción: {e}", "danger")
        finally:
            session_db.close()
        return redirect(url_for("songs_view"))

    artist_blocks = []
    for a in artists:
        songs = (session_db.query(Song)
                 .join(SongArtist, Song.id == SongArtist.song_id)
                 .filter(SongArtist.artist_id == a.id)
                 .order_by(Song.release_date.desc())
                 .all())
        for s in songs: _ = s.artists
        artist_blocks.append((a, songs))

    session_db.close()
    return render_template("songs.html", artists=artists, artist_blocks=artist_blocks)

@app.post("/canciones/<song_id>/update")
@admin_required
def song_update(song_id):
    session_db = db()
    s = session_db.get(Song, to_uuid(song_id))
    if not s:
        flash("Canción no encontrada.", "warning")
        session_db.close()
        return redirect(url_for("songs_view"))
    s.title = request.form.get("title", s.title).strip()
    s.collaborator = (request.form.get("collaborator", "") or "").strip() or None
    s.release_date = parse_date(request.form.get("release_date"))
    cover = request.files.get("cover")
    try:
        if cover and cover.filename:
            s.cover_url = upload_image(cover, "songs")
        new_artist_ids = {to_uuid(a) for a in request.form.getlist("artist_ids[]")}
        old_artist_ids = {a.id for a in s.artists}
        for aid in old_artist_ids - new_artist_ids:
            session_db.query(SongArtist).filter_by(song_id=s.id, artist_id=aid).delete()
        for aid in new_artist_ids - old_artist_ids:
            session_db.add(SongArtist(song_id=s.id, artist_id=aid))
        session_db.commit()
        flash("Canción actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("songs_view"))

@app.post("/canciones/<song_id>/delete")
@admin_required
def song_delete(song_id):
    session_db = db()
    try:
        s = session_db.get(Song, to_uuid(song_id))
        if s:
            session_db.delete(s)
            session_db.commit()
            flash("Canción eliminada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("songs_view"))

# ---------- TOCADAS (ADMIN) ----------
@app.route("/tocadas")
@admin_required
def plays_view():
    if not can_edit_radio():
        return forbid("No tienes permisos para acceder a la actualización de tocadas.")
    session_db = db()
    current_week = monday_of(today_local())
    default_week = current_week - timedelta(days=7)

    week_start = request.args.get("week")
    if week_start:
        week_start = monday_of(parse_date(week_start))
    else:
        week_start = default_week

    prev_w, base_w, next_w = week_tabs(week_start)
    ensure_week(session_db, prev_w)
    ensure_week(session_db, base_w)
    ensure_week(session_db, next_w)
    session_db.commit()

    weeks_list = [w[0] for w in session_db.query(Week.week_start).order_by(Week.week_start.desc()).all()]

    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()
    stations = session_db.query(RadioStation).order_by(RadioStation.name.asc()).all()

    artist_blocks = []
    for a in artists:
        songs = (session_db.query(Song)
                 .join(SongArtist, Song.id == SongArtist.song_id)
                 .filter(SongArtist.artist_id == a.id)
                 .order_by(Song.release_date.desc())
                 .all())
        artist_blocks.append((a, songs))

    plays_map = {}
    for p in (session_db.query(Play).filter(Play.week_start == week_start).all()):
        plays_map[(p.song_id, p.station_id)] = (p.spins, p.position)

    rank_map = {}
    for si in (session_db.query(SongWeekInfo).filter(SongWeekInfo.week_start == week_start).all()):
        rank_map[si.song_id] = si.national_rank

    session_db.close()
    return render_template(
        "plays.html",
        week_start=week_start,
        week_label=week_label_range(week_start),
        prev_w=prev_w,
        base_w=base_w,
        next_w=next_w,
        current_week=current_week,
        weeks_list=weeks_list,
        artist_blocks=artist_blocks,
        stations=stations,
        plays_map=plays_map,
        rank_map=rank_map
    )

@app.post("/tocadas/save")
@admin_required
def plays_save():
    session_db = db()
    week_start = monday_of(parse_date(request.form["week_start"]))
    song_id = to_uuid(request.form["song_id"])

    try:
        ensure_week(session_db, week_start)

        national_rank_val = request.form.get("national_rank", "").strip()
        nr_int = int(national_rank_val) if national_rank_val else None
        s_info = (session_db.query(SongWeekInfo)
                  .filter_by(song_id=song_id, week_start=week_start)
                  .first())
        if s_info:
            s_info.national_rank = nr_int
        else:
            session_db.add(SongWeekInfo(song_id=song_id, week_start=week_start, national_rank=nr_int))

        for key, val in request.form.items():
            if key.startswith("spins_"):
                station_id_str = key.split("_", 1)[1]
                station_id = to_uuid(station_id_str)
                spins_int = int(val.strip()) if val.strip() else 0
                pos_val = request.form.get(f"pos_{station_id_str}", "").strip()
                pos_int = int(pos_val) if pos_val else None

                p = (session_db.query(Play)
                     .filter_by(song_id=song_id, station_id=station_id, week_start=week_start)
                     .first())
                if p:
                    p.spins = spins_int
                    p.position = pos_int
                else:
                    session_db.add(Play(song_id=song_id, station_id=station_id,
                                        week_start=week_start, spins=spins_int, position=pos_int))

        session_db.commit()
        flash("Tocadas guardadas.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("plays_view", week=week_start.isoformat()) + f"#song-{song_id}")

# ---------- RESUMEN (ADMIN y PÚBLICO) ----------
def build_summary_context(base_week: date):
    session_db = db()

    prev_w, base_w, next_w = week_tabs(base_week)
    current_week = monday_of(today_local())
    latest_with_data = week_with_latest_data(session_db)

    week_end = base_week + timedelta(days=6)
    week_label = f"{base_week.strftime('%d/%m/%Y')} - {week_end.strftime('%d/%m/%Y')}"

    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()

    totals = {sid: int(total) for sid, total in (
        session_db.query(Play.song_id, func.sum(Play.spins))
        .filter(Play.week_start == base_week)
        .group_by(Play.song_id).all()
    )}
    prev_week = base_week - timedelta(days=7)
    totals_prev = {sid: int(total) for sid, total in (
        session_db.query(Play.song_id, func.sum(Play.spins))
        .filter(Play.week_start == prev_week)
        .group_by(Play.song_id).all()
    )}

    by_station = {}
    for row in (session_db.query(Play.song_id, Play.station_id, Play.spins, Play.position)
                .filter(Play.week_start == base_week).all()):
        by_station.setdefault(row.song_id, {})[row.station_id] = (row.spins, row.position)

    by_station_prev = {}
    for row in (session_db.query(Play.song_id, Play.station_id, Play.spins, Play.position)
                .filter(Play.week_start == prev_week).all()):
        by_station_prev.setdefault(row.song_id, {})[row.station_id] = (row.spins, row.position)

    # Orden + filtro: solo emisoras con > 1 tocada
    by_station_sorted = {}
    for song_id, st_dict in by_station.items():
        filtered = {st_id: pair for st_id, pair in st_dict.items() if (pair[0] or 0) > 0}
        by_station_sorted[song_id] = sorted(filtered.items(), key=lambda kv: kv[1][0], reverse=True)

    stations = session_db.query(RadioStation).order_by(RadioStation.name.asc()).all()
    stations_map = {s.id: s for s in stations}

    song_ids_this_week = set(totals.keys())
    songs = []
    if song_ids_this_week:
        songs = (session_db.query(Song)
                 .filter(Song.id.in_(song_ids_this_week))
                 .order_by(Song.release_date.desc())
                 .all())
        for s in songs: _ = s.artists

    ranks = {r.song_id: r.national_rank for r in
             session_db.query(SongWeekInfo).filter_by(week_start=base_week).all()}

    session_db.close()
    return dict(
        base_week=base_week,
        prev_w=prev_w, next_w=next_w,
        current_week=current_week,
        latest_with_data=latest_with_data,
        week_end=week_end,
        week_label=week_label,
        artists=artists,
        songs=songs,
        totals=totals, totals_prev=totals_prev,
        by_station=by_station, by_station_prev=by_station_prev,
        by_station_sorted=by_station_sorted,
        stations_map=stations_map,
        ranks=ranks
    )

@app.route("/resumen")
def summary_view():
    requested = request.args.get("week")
    base_week = monday_of(parse_date(requested)) if requested else week_with_latest_data(db())
    ctx = build_summary_context(base_week)
    # endpoint para tabs (admin)
    ctx.update(PUBLIC_MODE=False, summary_endpoint="summary_view")
    return render_template("summary.html", **ctx)

@app.route("/public/resumen")
def public_summary():
    requested = request.args.get("week")
    base_week = monday_of(parse_date(requested)) if requested else week_with_latest_data(db())
    ctx = build_summary_context(base_week)
    # endpoint para tabs (público)
    ctx.update(PUBLIC_MODE=True, summary_endpoint="public_summary")
    return render_template("summary.html", **ctx)

# ---------- RESUMEN POR EMISORA ----------
@app.route("/resumen/cadena/<station_id>")
def station_summary(station_id):
    """
    Resumen de una emisora: canciones ordenadas por artista con las tocadas de ESA cadena,
    navegable por semanas. Robusto ante IDs inválidos y falta de datos.
    """
    # 1) Validar/converter el parámetro
    try:
        stid = to_uuid(station_id)
    except Exception:
        flash("Identificador de emisora inválido.", "danger")
        return redirect(url_for("summary_view"))

    session_db = db()
    try:
        # 2) Obtener la emisora
        station = session_db.get(RadioStation, stid)
        if not station:
            flash("Emisora no encontrada.", "warning")
            return redirect(url_for("summary_view"))

        # 3) Determinar semana base (si no hay datos de esta emisora,
        #    usamos la semana actual-7 como fallback coherente)
        requested = request.args.get("week")
        if requested:
            base_week = monday_of(parse_date(requested))
        else:
            latest_for_station = week_with_latest_data(session_db, stid)
            # Si no hay datos en esa emisora, toma semana anterior a la actual (coherente con Tocadas)
            if latest_for_station is None or latest_for_station == monday_of(date.today()):
                base_week = monday_of(date.today()) - timedelta(days=7)
            else:
                base_week = latest_for_station

        # 4) Asegurar semanas prev/actual/next en tabla weeks
        prev_w, base_w, next_w = week_tabs(base_week)
        ensure_week(session_db, prev_w)
        ensure_week(session_db, base_w)
        ensure_week(session_db, next_w)
        session_db.commit()

        # 5) Cargar plays de ESA emisora en la semana base (>0 para no mostrar vacíos)
        plays = (session_db.query(Play)
                 .filter(Play.week_start == base_week,
                         Play.station_id == stid,
                         Play.spins > 0)
                 .all())

        # 6) Canciones involucradas y sus artistas (orden por lanzamiento desc)
        song_ids = {p.song_id for p in plays}
        songs = []
        if song_ids:
            songs = (session_db.query(Song)
                     .filter(Song.id.in_(song_ids))
                     .order_by(Song.release_date.desc())
                     .all())
            # carga ansiosa de artistas para agrupar por bloque
            for s in songs:
                _ = s.artists

        # 7) Mapas actual y previo para diffs
        by_song = {p.song_id: (p.spins, p.position) for p in plays}
        prev_week = base_week - timedelta(days=7)
        prev_plays = (session_db.query(Play)
                      .filter(Play.week_start == prev_week, Play.station_id == stid)
                      .all())
        by_song_prev = {p.song_id: (p.spins, p.position) for p in prev_plays}

        # 8) Agrupar por artista (solo artistas con canciones en la lista)
        artists = session_db.query(Artist).order_by(Artist.name.asc()).all()
        artist_blocks = []
        if songs:
            for a in artists:
                ss = [s for s in songs if a in s.artists]
                if ss:
                    artist_blocks.append((a, ss))

        # 9) Utilidades de navegación
        weeks_list = [w[0] for w in session_db.query(Week.week_start)
                      .order_by(Week.week_start.desc()).all()]
        week_end = base_week + timedelta(days=6)
        week_label = f"{base_week.strftime('%d/%m/%Y')} - {week_end.strftime('%d/%m/%Y')}"

        # 10) Pasar el id como string para evitar problemas en url_for/Jinja
        station_id_str = str(stid)

        return render_template(
            "station_summary.html",
            station=station,
            station_id_str=station_id_str,
            base_week=base_week,
            prev_w=prev_w, next_w=next_w,
            week_label=week_label,
            artist_blocks=artist_blocks,
            by_song=by_song, by_song_prev=by_song_prev,
            weeks_list=weeks_list,
            PUBLIC_MODE=not bool(session.get("user_id"))
        )

    except Exception as e:
        session_db.rollback()
        # Mostramos un mensaje en la UI en vez del 500 en blanco.
        flash(f"Error al mostrar el resumen de la emisora: {e}", "danger")
        return redirect(url_for("summary_view"))
    finally:
        session_db.close()

# ---------- API ----------
@app.get("/api/plays_json")
def api_plays_json():
    song_id = to_uuid(request.args.get("song_id"))
    station_id_param = request.args.get("station_id")
    station_id = to_uuid(station_id_param) if station_id_param else None

    session_db = db()
    q = session_db.query(Play.week_start, func.sum(Play.spins)).filter(Play.song_id == song_id)
    if station_id:
        q = q.filter(Play.station_id == station_id)
    q = q.group_by(Play.week_start).order_by(Play.week_start.asc())
    data = q.all()
    session_db.close()
    labels = [w.strftime("%Y-%m-%d") for (w, _) in data]
    values = [int(v) for (_, v) in data]
    return jsonify({"labels": labels, "values": values})

@app.get("/api/song_meta")
def api_song_meta():
    sid = request.args.get("song_id")
    try:
        sid_uuid = to_uuid(sid)
    except Exception:
        return jsonify({"error": "bad id"}), 400
    session_db = db()
    s = session_db.get(Song, sid_uuid)
    if not s:
        session_db.close()
        return jsonify({"error": "not found"}), 404
    artists = [{"id": str(a.id), "name": a.name, "photo_url": a.photo_url} for a in s.artists]
    payload = {"song_id": str(s.id), "title": s.title, "cover_url": s.cover_url, "artists": artists}
    session_db.close()
    return jsonify(payload)

# ----------- PROMOTORES ------------
@app.route("/promotores", methods=["GET", "POST"])
@admin_required
def promoters_view():
    session = db()

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        nick = request.form.get("nick","").strip()
        logo = request.files.get("logo")
        try:
            logo_url = upload_image(logo, "promoters") if (logo and getattr(logo, "filename", "")) else None
            p = Promoter(
                nick=nick,
                logo_url=logo_url,
                tax_id=(request.form.get("tax_id") or "").strip() or None,
                contact_email=(request.form.get("contact_email") or "").strip() or None,
                contact_phone=(request.form.get("contact_phone") or "").strip() or None,
            )
            session.add(p)
            session.commit()
            flash("Promotor creado.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando promotor: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("promoters_view"))
    promoters = session.query(Promoter).order_by(Promoter.nick.asc()).all()
    session.close()
    return render_template("promoters.html", promoters=promoters)

@app.post("/promotores/<pid>/update")
@admin_required
def promoter_update(pid):
    session = db()
    p = session.get(Promoter, to_uuid(pid))
    if not p:
        flash("Promotor no encontrado.", "warning")
        session.close()
        return redirect(url_for("promoters_view"))
    p.nick = request.form.get("nick", p.nick).strip()
    logo = request.files.get("logo")
    try:
        if logo and logo.filename:
            p.logo_url = upload_image(logo, "promoters")
        session.commit()
        flash("Promotor actualizado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("promoters_view"))

@app.post("/promotores/<pid>/delete")
@admin_required
def promoter_delete(pid):
    session = db()
    try:
        p = session.get(Promoter, to_uuid(pid))
        if p:
            session.delete(p)
            session.commit()
            flash("Promotor eliminado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("promoters_view"))

# ----------- RECINTOS ---------------

@app.route("/recintos", methods=["GET", "POST"])
@admin_required
def venues_view():
    session = db()

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        name = request.form.get("name","").strip()
        covered = (request.form.get("covered") == "on")
        address = request.form.get("address","").strip()
        municipality = request.form.get("municipality","").strip()
        province = request.form.get("province","").strip()
        try:
            v = Venue(name=name, covered=covered, address=address,
                      municipality=municipality, province=province)
            session.add(v)
            session.commit()
            flash("Recinto creado.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando recinto: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("venues_view"))
    venues = session.query(Venue).order_by(Venue.name.asc()).all()
    session.close()
    return render_template("venues.html", venues=venues)

@app.post("/recintos/<vid>/update")
@admin_required
def venue_update(vid):
    session = db()
    v = session.get(Venue, to_uuid(vid))
    if not v:
        flash("Recinto no encontrado.", "warning")
        session.close()
        return redirect(url_for("venues_view"))
    v.name = request.form.get("name", v.name).strip()
    v.covered = (request.form.get("covered") == "on")
    v.address = request.form.get("address", v.address).strip()
    v.municipality = request.form.get("municipality", v.municipality).strip()
    v.province = request.form.get("province", v.province).strip()
    try:
        session.commit()
        flash("Recinto actualizado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("venues_view"))

@app.post("/recintos/<vid>/delete")
@admin_required
def venue_delete(vid):
    session = db()
    try:
        v = session.get(Venue, to_uuid(vid))
        if v:
            session.delete(v)
            session.commit()
            flash("Recinto eliminado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("venues_view"))


# ----------- TICKETERAS ---------------


@app.route("/ticketeras", methods=["GET", "POST"])
@admin_required
def ticketers_view():
    session_db = db()
    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        link_url = (request.form.get("link_url") or "").strip() or None
        logo = request.files.get("logo")
        try:
            if not name:
                raise ValueError("El nombre de la ticketera es obligatorio.")

            logo_url = upload_png(logo, "ticketers") if logo and getattr(logo, "filename", "") else None
            t = Ticketer(name=name, logo_url=logo_url, link_url=link_url)
            session_db.add(t)
            session_db.commit()
            flash("Ticketera creada.", "success")
        except Exception as e:
            session_db.rollback()
            flash(f"Error creando ticketera: {e}", "danger")
        finally:
            session_db.close()
        return redirect(url_for("ticketers_view"))

    ticketers = session_db.query(Ticketer).order_by(Ticketer.name.asc()).all()
    session_db.close()
    return render_template("ticketers.html", ticketers=ticketers)


@app.post("/ticketeras/<tid>/update")
@admin_required
def ticketer_update(tid):
    session_db = db()
    t = session_db.get(Ticketer, to_uuid(tid))
    if not t:
        flash("Ticketera no encontrada.", "warning")
        session_db.close()
        return redirect(url_for("ticketers_view"))

    t.name = (request.form.get("name") or t.name or "").strip()
    t.link_url = (request.form.get("link_url") or "").strip() or None
    logo = request.files.get("logo")
    try:
        if logo and getattr(logo, "filename", ""):
            t.logo_url = upload_png(logo, "ticketers")
        session_db.commit()
        flash("Ticketera actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando ticketera: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("ticketers_view"))


@app.post("/ticketeras/<tid>/delete")
@admin_required
def ticketer_delete(tid):
    session_db = db()
    try:
        t = session_db.get(Ticketer, to_uuid(tid))
        if t:
            session_db.delete(t)
            session_db.commit()
            flash("Ticketera eliminada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando ticketera: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("ticketers_view"))


# --- API búsqueda (Select2) ---

@app.get("/api/search/ticketers", endpoint="api_search_ticketers")
def api_search_ticketers():
    q = (request.args.get("q") or request.args.get("term") or "").strip()
    session_db = db()
    try:
        query = session_db.query(Ticketer)
        if q:
            like = f"%{q}%"
            query = query.filter(Ticketer.name.ilike(like))
        items = query.order_by(Ticketer.name.asc()).limit(30).all()
        return jsonify([
            {
                "id": str(t.id),
                "label": t.name,
                "text": t.name,
                "logo_url": t.logo_url,
                "link_url": t.link_url,
            }
            for t in items
        ])
    finally:
        session_db.close()


@app.post("/api/ticketers/create", endpoint="api_create_ticketer")
@admin_required
def api_create_ticketer():
    session_db = db()
    try:
        name = (request.form.get("name") or "").strip()
        link_url = (request.form.get("link_url") or "").strip() or None
        if not name:
            return jsonify({"error": "El nombre de la ticketera es obligatorio."}), 400

        logo = request.files.get("logo")
        logo_url = upload_png(logo, "ticketers") if logo and getattr(logo, "filename", "") else None

        t = Ticketer(name=name, logo_url=logo_url, link_url=link_url)
        session_db.add(t)
        session_db.commit()
        return jsonify({"id": str(t.id), "label": t.name, "logo_url": t.logo_url, "link_url": t.link_url})
    except Exception as e:
        session_db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        session_db.close()

# -------------- CONCIERTOS --------------

from decimal import Decimal, InvalidOperation


def _parse_optional_decimal(value: str | None) -> Decimal | None:
    """Parsea números tipo '1234,56' o '1234.56'. Vacío -> None."""
    s = (value or "").strip()
    if not s:
        return None
    s = s.replace(" ", "").replace(",", ".")
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _parse_optional_int(value: str | None, *, min_v: int | None = None, max_v: int | None = None) -> int | None:
    s = (value or "").strip()
    if not s:
        return None
    try:
        n = int(s)
    except Exception:
        return None
    if min_v is not None:
        n = max(min_v, n)
    if max_v is not None:
        n = min(max_v, n)
    return n


def _norm_base(val: str | None) -> str | None:
    """Normaliza base a GROSS/NET. Vacío -> None."""
    v = (val or "").strip().upper()
    if not v:
        return None
    if v in ("NET", "NETO"):
        return "NET"
    if v in ("GROSS", "BRUTO"):
        return "GROSS"
    # fallback
    return "GROSS"


def _norm_status(val: str | None) -> str:
    v = (val or "").strip().upper()
    if v in ("CONFIRMADO", "RESERVADO", "HABLADO"):
        return v
    return "HABLADO"


def _parse_share_rows(ids, pct_list, pct_base_list, amount_list, amount_base_list):
    """Devuelve lista de dicts con id, pct, pct_base, amount, amount_base (dedupe por id)."""
    rows = []
    for i, sid in enumerate(ids or []):
        sid = (sid or "").strip()
        if not sid:
            continue

        pct = _parse_optional_int(pct_list[i] if i < len(pct_list) else None, min_v=0, max_v=100)
        amt = _parse_optional_decimal(amount_list[i] if i < len(amount_list) else None)

        # descartamos filas vacías
        if (pct is None or pct == 0) and (amt is None or amt == 0):
            continue

        rows.append({
            "id": sid,
            "pct": pct if pct and pct > 0 else None,
            "pct_base": _norm_base(pct_base_list[i] if i < len(pct_base_list) else None),
            "amount": amt,
            "amount_base": _norm_base(amount_base_list[i] if i < len(amount_base_list) else None),
        })

    # dedupe (último gana)
    dedup = {}
    for r in rows:
        dedup[r["id"]] = r
    return list(dedup.values())


def _replace_concert_promoter_shares(session, concert_id, rows):
    session.query(ConcertPromoterShare).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.flush()
    for r in rows:
        session.add(
            ConcertPromoterShare(
                concert_id=concert_id,
                promoter_id=to_uuid(r["id"]),
                pct=r["pct"],
                pct_base=r["pct_base"],
                amount=r["amount"],
                amount_base=r["amount_base"],
            )
        )


def _replace_concert_company_shares(session, concert_id, rows):
    session.query(ConcertCompanyShare).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.flush()
    for r in rows:
        session.add(
            ConcertCompanyShare(
                concert_id=concert_id,
                company_id=to_uuid(r["id"]),
                pct=r["pct"],
                pct_base=r["pct_base"],
                amount=r["amount"],
                amount_base=r["amount_base"],
            )
        )


def _parse_zone_rows(ids, mode_list, pct_list, base_list, amount_list, exempt_list, concept_list):
    """Parsea comisionistas (promotores de zona).

    - mode: FIXED | PERCENT
    - pct/base para variable
    - amount para fijo
    - exempt_amount opcional
    - concept (motivo) opcional
    """
    rows = []
    for i, sid in enumerate(ids or []):
        sid = (sid or "").strip()
        if not sid:
            continue

        mode = (mode_list[i] if i < len(mode_list) else "")
        mode = (mode or "").strip().upper()
        if mode not in ("FIXED", "PERCENT"):
            mode = "PERCENT" if (pct_list and i < len(pct_list) and (pct_list[i] or "").strip()) else "FIXED"

        pct = _parse_optional_decimal(pct_list[i] if i < len(pct_list) else None)
        amt = _parse_optional_decimal(amount_list[i] if i < len(amount_list) else None)
        exm = _parse_optional_decimal(exempt_list[i] if i < len(exempt_list) else None)
        concept = (concept_list[i] if i < len(concept_list) else "")
        concept = (concept or "").strip() or None

        if mode == "PERCENT":
            if pct is None or pct == 0:
                continue
            ctype = "PERCENT"
            commission_pct = pct
            commission_base = _norm_base(base_list[i] if i < len(base_list) else None)
            commission_amount = None
        else:
            if amt is None or amt == 0:
                continue
            ctype = "AMOUNT"
            commission_pct = None
            commission_base = None
            commission_amount = amt

        rows.append({
            "id": sid,
            "commission_type": ctype,
            "commission_pct": commission_pct,
            "commission_base": commission_base,
            "commission_amount": commission_amount,
            "exempt_amount": exm,
            "concept": concept,
        })

    # dedupe (último gana)
    dedup = {}
    for r in rows:
        dedup[r["id"]] = r
    return list(dedup.values())


def _replace_concert_zone_agents(session, concert_id, rows):
    session.query(ConcertZoneAgent).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.flush()
    for r in rows:
        session.add(
            ConcertZoneAgent(
                concert_id=concert_id,
                promoter_id=to_uuid(r["id"]),
                commission_type=r["commission_type"],
                commission_pct=r["commission_pct"],
                commission_base=r["commission_base"],
                commission_amount=r["commission_amount"],
                commission_amount_base=None,
                exempt_amount=r.get("exempt_amount"),
                concept=r.get("concept"),
            )
        )


def _parse_cache_rows(kinds, concept_list, amount_list, var_mode_list, var_option_list,
                     from_ticket_list, min_tickets_list, min_revenue_list,
                     pct_list, pct_base_list, ticket_type_list):
    """Parsea filas de caché.

    kind:
      - FIXED: solo amount
      - VARIABLE: usa config JSON (mode/option/thresholds) y pct/amount según mode
      - OTHER: concepto + (opcional) pct/base o amount/base
    """
    rows = []
    for i, k in enumerate(kinds or []):
        kind = (k or "").strip().upper()
        if not kind:
            continue
        if kind not in ("FIXED", "VARIABLE", "OTHER"):
            kind = "FIXED"

        concept = (concept_list[i] if i < len(concept_list) else "")
        concept = (concept or "").strip() or None

        amt = _parse_optional_decimal(amount_list[i] if i < len(amount_list) else None)
        pct = _parse_optional_decimal(pct_list[i] if i < len(pct_list) else None)
        pct_base = _norm_base(pct_base_list[i] if i < len(pct_base_list) else None)

        var_mode = (var_mode_list[i] if i < len(var_mode_list) else "")
        var_mode = (var_mode or "").strip().upper() or None

        var_opt = (var_option_list[i] if i < len(var_option_list) else "")
        var_opt = (var_opt or "").strip().upper() or None

        from_ticket = _parse_optional_positive_int((from_ticket_list[i] if i < len(from_ticket_list) else "") or "")
        min_tickets = _parse_optional_positive_int((min_tickets_list[i] if i < len(min_tickets_list) else "") or "")
        min_revenue = _parse_optional_decimal(min_revenue_list[i] if i < len(min_revenue_list) else None)
        ticket_type = (ticket_type_list[i] if i < len(ticket_type_list) else "")
        ticket_type = (ticket_type or "").strip() or None

        config = None

        if kind == "FIXED":
            # fijo: solo importe
            if amt is None or amt == 0:
                continue
            rows.append({
                "kind": "FIXED",
                "concept": None,
                "amount": amt,
                "pct": None,
                "pct_base": None,
                "config": None,
            })
            continue

        if kind == "VARIABLE":
            # variable avanzado
            if var_mode not in ("FIXED", "PERCENT"):
                var_mode = "FIXED" if (amt and amt != 0) else "PERCENT"

            if var_mode == "FIXED":
                if amt is None or amt == 0:
                    continue
            else:
                if pct is None or pct == 0:
                    continue
                if pct_base not in ("GROSS", "NET"):
                    pct_base = "GROSS"

            config = {
                "mode": var_mode,  # FIXED | PERCENT
                "option": var_opt,
                "from_ticket": from_ticket,
                "min_tickets": min_tickets,
                "min_revenue": float(min_revenue) if min_revenue is not None else None,
                "ticket_type": ticket_type,
            }

            rows.append({
                "kind": "VARIABLE",
                "concept": None,
                "amount": (amt if var_mode == "FIXED" else None),
                "pct": (pct if var_mode == "PERCENT" else None),
                "pct_base": (pct_base if var_mode == "PERCENT" else None),
                "config": config,
            })
            continue

        # OTHER
        if not concept and (pct is None or pct == 0) and (amt is None or amt == 0):
            continue

        rows.append({
            "kind": "OTHER",
            "concept": concept,
            "amount": (amt if amt and amt != 0 else None),
            "pct": (pct if pct and pct != 0 else None),
            "pct_base": pct_base,
            "config": None,
        })

    return rows


def _replace_concert_caches(session, concert_id, rows):
    session.query(ConcertCache).filter_by(concert_id=concert_id).delete(synchronize_session=False)
    session.flush()
    for r in rows:
        session.add(
            ConcertCache(
                concert_id=concert_id,
                kind=r["kind"],
                variable_basis=None,
                concept=r.get("concept"),
                pct=r.get("pct"),
                pct_base=r.get("pct_base"),
                amount=r.get("amount"),
                amount_base=None,
                config=r.get("config"),
            )
        )


def _add_contracts_from_request(session, concert_id):
    concepts = request.form.getlist("contract_concept[]")
    files = request.files.getlist("contract_file[]")

    for i, fs in enumerate(files or []):
        if not fs or not getattr(fs, "filename", ""):
            continue

        concept = (concepts[i] if i < len(concepts) else "")
        concept = (concept or "").strip() or fs.filename

        url = upload_pdf(fs, "contracts")
        session.add(
            ConcertContract(
                concert_id=concert_id,
                concept=concept,
                pdf_url=url,
                original_name=fs.filename,
            )
        )



# ---------- NOTAS / EQUIPAMIENTO ----------

def _add_concert_notes_from_request(session, concert_id):
    titles = request.form.getlist("note_title[]")
    bodies = request.form.getlist("note_body[]")

    for i, body in enumerate(bodies or []):
        body = (body or "").strip()
        if not body:
            continue
        title = (titles[i] if i < len(titles) else "")
        title = (title or "").strip()
        session.add(ConcertNote(concert_id=concert_id, title=title, body=body))


def _upsert_equipment_from_request(session, concert_id):
    """Upsert del resumen de equipamiento.

    Nuevo comportamiento (2026-01):
    - UI simplificada: solo 2 opciones mutuamente excluyentes:
        * equipment_option=INCLUDED  -> Equipos incluidos
        * equipment_option=PROMOTER  -> Promotor cubre equipos
      (opcional: si no se marca nada, se elimina el resumen)

    - Se mantiene compatibilidad con el formulario legacy para no romper despliegues antiguos:
        equipment_included[], equipment_other, equipment_covered, equipment_covered_mode, equipment_covered_amount
    """

    eq = session.query(ConcertEquipment).filter_by(concert_id=concert_id).first()

    # 1) Nuevo formulario
    opt = (request.form.get("equipment_option") or "").strip().upper()
    if opt in ("INCLUDED", "PROMOTER"):
        if not eq:
            eq = ConcertEquipment(concert_id=concert_id)
            session.add(eq)

        if opt == "PROMOTER":
            eq.covered_by_promoter = True
            eq.covered_mode = None
            eq.covered_amount = None
            # limpiamos para evitar listados antiguos
            eq.included = None
            eq.other = None
        else:
            # INCLUDED
            eq.covered_by_promoter = False
            eq.covered_mode = None
            eq.covered_amount = None
            eq.other = None

            # Si ya había una lista histórica, la conservamos.
            # Si no, guardamos un marcador mínimo para poder mostrar "Equipos incluidos".
            if not eq.included:
                eq.included = ["Incluido"]
        return

    # 2) Fallback legacy (por compatibilidad)
    included = request.form.getlist("equipment_included[]")
    included = [x for x in (included or []) if (x or "").strip()]

    other = (request.form.get("equipment_other") or "").strip() or None

    covered_raw = (request.form.get("equipment_covered") or "").strip().lower()
    covered = covered_raw in ("on", "1", "true", "yes")

    covered_mode = (request.form.get("equipment_covered_mode") or "").strip().upper() or None
    if covered_mode not in ("RIDER", "AMOUNT"):
        covered_mode = None

    covered_amount = _parse_optional_decimal(request.form.get("equipment_covered_amount"))

    # determinar si hay contenido
    has_any = bool(included) or bool(other) or covered

    if not has_any:
        if eq:
            session.delete(eq)
        return

    if not eq:
        eq = ConcertEquipment(concert_id=concert_id)
        session.add(eq)

    eq.included = included or None
    eq.other = other
    eq.covered_by_promoter = bool(covered)
    eq.covered_mode = covered_mode if covered else None
    eq.covered_amount = covered_amount if (covered and covered_mode == "AMOUNT") else None



def _add_equipment_docs_from_request(session, concert_id):
    concepts = request.form.getlist("equipment_doc_concept[]")
    files = request.files.getlist("equipment_doc_file[]")

    for i, fs in enumerate(files or []):
        if not fs or not getattr(fs, "filename", ""):
            continue
        concept = (concepts[i] if i < len(concepts) else "")
        concept = (concept or "").strip() or fs.filename
        url = upload_pdf(fs, "contracts")
        session.add(
            ConcertEquipmentDocument(
                concert_id=concert_id,
                concept=concept,
                pdf_url=url,
                original_name=fs.filename,
            )
        )


def _add_equipment_notes_from_request(session, concert_id):
    bodies = request.form.getlist("equipment_note_body[]")
    for body in bodies or []:
        body = (body or "").strip()
        if not body:
            continue
        session.add(ConcertEquipmentNote(concert_id=concert_id, body=body))


# ---------- LISTAR / CREAR (2 pestañas: Alta + Vista) ----------
@app.route("/conciertos", methods=["GET", "POST"], endpoint="concerts_view")
@admin_required
def concerts_page():
    s = db()
    try:
        artists = s.query(Artist).order_by(Artist.name.asc()).all()
        venues = s.query(Venue).order_by(Venue.name.asc()).all()
        promoters = s.query(Promoter).order_by(Promoter.nick.asc()).all()
        companies = s.query(GroupCompany).order_by(GroupCompany.name.asc()).all()

        active_tab = (request.args.get("tab") or "vista").lower()
        if active_tab not in ("vista", "alta"):
            active_tab = "vista"

        # UI limpia: si el rol no puede crear/editar conciertos, nunca mostramos la pestaña "alta".
        if active_tab == "alta" and not can_edit_concerts() and not is_master():
            active_tab = "vista"

        # ---------------- filtros (solo afectan a la vista) ----------------
        f_artist_ids_raw = request.args.getlist("artist") or []
        f_sale_types_raw = request.args.getlist("type") or []
        f_statuses_raw = request.args.getlist("status") or []
        # Filtro temporal (pasados / futuros). Por defecto: futuros.
        f_when_raw = request.args.getlist("when") or []

        f_artist_ids = []
        for x in f_artist_ids_raw:
            x = (x or "").strip()
            if not x:
                continue
            try:
                f_artist_ids.append(to_uuid(x))
            except Exception:
                pass

        f_sale_types = [(x or "").strip().upper() for x in f_sale_types_raw if (x or "").strip()]
        f_statuses = [(x or "").strip().upper() for x in f_statuses_raw if (x or "").strip()]

        # when: {PAST, FUTURE}
        f_when = {(x or "").strip().upper() for x in f_when_raw if (x or "").strip()}
        allowed_when = {"PAST", "FUTURE"}
        f_when = {x for x in f_when if x in allowed_when}
        # Por defecto, si no viene nada, mostramos FUTUROS.
        if not f_when:
            f_when = {"FUTURE"}

        allowed_sale_types = CONCERT_SALE_TYPES_ALL_SET
        allowed_statuses = {"HABLADO", "RESERVADO", "CONFIRMADO"}

        f_sale_types = [x for x in f_sale_types if x in allowed_sale_types]
        f_statuses = [x for x in f_statuses if x in allowed_statuses]

        # ---------------- POST: crear concierto ----------------
        if request.method == "POST":
            try:
                sale_type = (request.form.get("sale_type") or "EMPRESA").strip().upper()
                if sale_type not in allowed_sale_types:
                    sale_type = "EMPRESA"

                venue_raw = (request.form.get("venue_id") or "").strip()
                if not venue_raw:
                    raise ValueError("Debes seleccionar un recinto de la lista (o crearlo desde el botón +).")

                be_val = _parse_optional_positive_int((request.form.get("break_even_ticket") or "").strip())

                promoter_raw = (request.form.get("promoter_id") or "").strip()
                group_company_raw = (request.form.get("group_company_id") or "").strip()
                billing_company_raw = (request.form.get("billing_company_id") or "").strip()

                c = Concert(
                    date=parse_date(request.form.get("date") or ""),
                    festival_name=(request.form.get("festival_name") or "").strip() or None,
                    venue_id=to_uuid(venue_raw),
                    sale_type=sale_type,
                    promoter_id=(to_uuid(promoter_raw) if sale_type == "VENDIDO" and promoter_raw else None),
                    group_company_id=(to_uuid(group_company_raw) if sale_type in ("EMPRESA", "GRATUITO") and group_company_raw else None),
                    billing_company_id=(to_uuid(billing_company_raw) if billing_company_raw else None),
                    artist_id=to_uuid((request.form.get("artist_id") or "").strip()),
                    capacity=int(request.form.get("capacity") or 0),
                    sale_start_date=parse_date(request.form.get("sale_start_date") or ""),
                    # En "GRATUITO" no existe punto de empate.
                    break_even_ticket=(None if sale_type in ("VENDIDO", "GRATUITO") else be_val),
                    sold_out=False,
                    status=_norm_status(request.form.get("status")),
                )

                if sale_type in ("EMPRESA", "GRATUITO") and not c.billing_company_id:
                    c.billing_company_id = c.group_company_id

                s.add(c)
                s.flush()

                # colaboradores / participaciones (opcionales)
                if sale_type != "VENDIDO":
                    p_rows = _parse_share_rows(
                        request.form.getlist("promoter_share_id[]"),
                        request.form.getlist("promoter_share_pct[]"),
                        request.form.getlist("promoter_share_pct_base[]"),
                        request.form.getlist("promoter_share_amount[]"),
                        request.form.getlist("promoter_share_amount_base[]"),
                    )
                    _replace_concert_promoter_shares(s, c.id, p_rows)

                    g_rows = _parse_share_rows(
                        request.form.getlist("company_share_id[]"),
                        request.form.getlist("company_share_pct[]"),
                        request.form.getlist("company_share_pct_base[]"),
                        request.form.getlist("company_share_amount[]"),
                        request.form.getlist("company_share_amount_base[]"),
                    )
                    _replace_concert_company_shares(s, c.id, g_rows)

                    z_rows = _parse_zone_rows(
                        request.form.getlist("zone_promoter_id[]"),
                        request.form.getlist("zone_commission_mode[]"),
                        request.form.getlist("zone_commission_pct[]"),
                        request.form.getlist("zone_commission_base[]"),
                        request.form.getlist("zone_commission_amount[]"),
                        request.form.getlist("zone_exempt_amount[]"),
                        request.form.getlist("zone_concept[]"),
                    )
                    _replace_concert_zone_agents(s, c.id, z_rows)
                else:
                    _replace_concert_promoter_shares(s, c.id, [])
                    _replace_concert_company_shares(s, c.id, [])
                    _replace_concert_zone_agents(s, c.id, [])

                # cachés (opcional)
                cache_rows = _parse_cache_rows(
                    request.form.getlist("cache_kind[]"),
                    request.form.getlist("cache_concept[]"),
                    request.form.getlist("cache_amount[]"),
                    request.form.getlist("cache_var_mode[]"),
                    request.form.getlist("cache_var_option[]"),
                    request.form.getlist("cache_from_ticket[]"),
                    request.form.getlist("cache_min_tickets[]"),
                    request.form.getlist("cache_min_revenue[]"),
                    request.form.getlist("cache_pct[]"),
                    request.form.getlist("cache_pct_base[]"),
                    request.form.getlist("cache_ticket_type[]"),
                )
                _replace_concert_caches(s, c.id, cache_rows)

                # contratos + notas contratación
                _add_contracts_from_request(s, c.id)
                _add_concert_notes_from_request(s, c.id)

                # equipamiento
                _upsert_equipment_from_request(s, c.id)
                _add_equipment_docs_from_request(s, c.id)
                _add_equipment_notes_from_request(s, c.id)

                s.commit()
                flash("Concierto creado.", "success")
                # Volver a la vista asegurando que el concierto queda visible
                # según el filtro pasados/futuros.
                target_when = "PAST" if (c.date and c.date < today_local()) else "FUTURE"
                return redirect(url_for("concerts_view", tab="vista", when=target_when) + f"#concert-{c.id}")

            except Exception as e:
                s.rollback()
                flash(f"Error creando concierto: {e}", "danger")
                return redirect(url_for("concerts_view", tab="alta"))

        # ---------------- GET: vista ----------------
        q = (
            s.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
                selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter),
                selectinload(Concert.caches),
                selectinload(Concert.contracts),
                selectinload(Concert.notes),
                selectinload(Concert.equipment),
                selectinload(Concert.equipment_documents),
                selectinload(Concert.equipment_notes),
            )
        )

        if f_artist_ids:
            q = q.filter(Concert.artist_id.in_(f_artist_ids))
        if f_sale_types:
            q = q.filter(Concert.sale_type.in_(f_sale_types))
        if f_statuses:
            q = q.filter(Concert.status.in_(f_statuses))

        # Fecha: pasados/futuros
        today = today_local()
        want_past = "PAST" in f_when
        want_future = "FUTURE" in f_when
        if want_past and not want_future:
            q = q.filter(Concert.date < today)
        elif want_future and not want_past:
            q = q.filter(Concert.date >= today)

        concerts = q.order_by(Concert.date.asc()).all()

        sections = {k: [] for k in CONCERTS_SECTION_ORDER}
        for c in concerts:
            sections.setdefault(c.sale_type or "EMPRESA", []).append(c)

        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        return render_template(
            "concerts.html",
            active_tab=active_tab,
            artists=artists,
            venues=venues,
            promoters=promoters,
            companies=companies,
            concerts=concerts,
            sections=sections,
            order=CONCERTS_SECTION_ORDER,
            titles=CONCERTS_SECTION_TITLE,
            f_artist_ids=[str(x) for x in f_artist_ids],
            f_sale_types=f_sale_types,
            f_statuses=f_statuses,
            f_when=sorted(list(f_when)),
        )
    finally:
        s.close()




# ---------- EDITAR (vista dedicada) ----------
@app.get("/conciertos/<cid>/editar", endpoint="concert_edit_view")
@admin_required
def concert_edit_view(cid):
    if not (is_master() or can_edit_concerts()):
        return forbid("Tu usuario no tiene permisos para editar conciertos.")
    session = db()
    try:
        c = (
            session.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
            joinedload(Concert.billing_company),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
                selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter),
                selectinload(Concert.caches),
                selectinload(Concert.contracts),
                selectinload(Concert.notes),
                selectinload(Concert.equipment),
                selectinload(Concert.equipment_documents),
                selectinload(Concert.equipment_notes),
            selectinload(Concert.notes),
            selectinload(Concert.equipment),
            selectinload(Concert.equipment_documents),
            selectinload(Concert.equipment_notes),
            )
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(url_for("concerts_view", tab="vista"))

        artists = session.query(Artist).order_by(Artist.name.asc()).all()
        venues = session.query(Venue).order_by(Venue.name.asc()).all()
        promoters = session.query(Promoter).order_by(Promoter.nick.asc()).all()
        companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()

        return render_template(
            "concert_edit.html",
            concert=c,   # ✅ esto arregla el template
            c=c,         # (lo dejo también por compatibilidad si lo usas en otras partes)
            artists=artists,
            venues=venues,
            promoters=promoters,
            companies=companies,
        )

    finally:
        session.close()


# ---------- ACTUALIZAR ----------
@app.post("/conciertos/<cid>/update", endpoint="concert_update")
@admin_required
def concert_update_handler(cid):
    session = db()
    c = session.get(Concert, to_uuid(cid))
    if not c:
        flash("Concierto no encontrado.", "warning")
        session.close()
        return redirect(url_for("concerts_view", tab="vista"))

    # Para el redirect final: aseguramos que el concierto queda visible
    # en la vista (pasados/futuros).
    target_when = "FUTURE"

    try:
        sale_type = (request.form.get("sale_type") or c.sale_type or "EMPRESA").strip().upper()
        if sale_type not in CONCERT_SALE_TYPES_ALL_SET:
            sale_type = "EMPRESA"

        venue_raw = (request.form.get("venue_id") or "").strip()
        if not venue_raw:
            raise ValueError("Debes seleccionar un recinto de la lista (o crearlo desde el botón +).")

        c.date = parse_date(request.form["date"])
        c.festival_name = (request.form.get("festival_name") or "").strip() or None
        c.venue_id = to_uuid(venue_raw)
        c.sale_type = sale_type
        c.artist_id = to_uuid(request.form["artist_id"])
        c.billing_company_id = to_uuid(request.form.get("billing_company_id") or None)
        if sale_type in ("EMPRESA", "GRATUITO") and not c.billing_company_id:
            c.billing_company_id = c.group_company_id
        c.capacity = int(request.form.get("capacity") or 0)
        c.sale_start_date = parse_date(request.form["sale_start_date"])
        # En "GRATUITO" no existe punto de empate.
        c.break_even_ticket = None if sale_type in ("VENDIDO", "GRATUITO") else _parse_optional_positive_int((request.form.get("break_even_ticket") or "").strip())
        c.status = _norm_status(request.form.get("status"))

        # principal según tipo
        c.group_company_id = to_uuid(request.form.get("group_company_id") or None) if sale_type in ("EMPRESA", "GRATUITO") else None
        c.promoter_id = to_uuid(request.form.get("promoter_id") or None) if sale_type == "VENDIDO" else None

        # Si es EMPRESA y no han seleccionado empresa que factura, usar la misma de gestión
        if sale_type in ("EMPRESA", "GRATUITO") and not c.billing_company_id:
            c.billing_company_id = c.group_company_id

        # --- replace relaciones ---
        # En VENDIDO no hay colaboradores
        if sale_type != "VENDIDO":
            p_rows = _parse_share_rows(
                request.form.getlist("promoter_share_id[]"),
                request.form.getlist("promoter_share_pct[]"),
                request.form.getlist("promoter_share_pct_base[]"),
                request.form.getlist("promoter_share_amount[]"),
                request.form.getlist("promoter_share_amount_base[]"),
            )
            _replace_concert_promoter_shares(session, c.id, p_rows)

            g_rows = _parse_share_rows(
                request.form.getlist("company_share_id[]"),
                request.form.getlist("company_share_pct[]"),
                request.form.getlist("company_share_pct_base[]"),
                request.form.getlist("company_share_amount[]"),
                request.form.getlist("company_share_amount_base[]"),
            )
            _replace_concert_company_shares(session, c.id, g_rows)

            z_rows = _parse_zone_rows(
                request.form.getlist("zone_promoter_id[]"),
                request.form.getlist("zone_commission_mode[]"),
                request.form.getlist("zone_commission_pct[]"),
                request.form.getlist("zone_commission_base[]"),
                request.form.getlist("zone_commission_amount[]"),
                request.form.getlist("zone_exempt_amount[]"),
                request.form.getlist("zone_concept[]"),
            )
            _replace_concert_zone_agents(session, c.id, z_rows)
        else:
            _replace_concert_promoter_shares(session, c.id, [])
            _replace_concert_company_shares(session, c.id, [])
            _replace_concert_zone_agents(session, c.id, [])

        # cachés (reemplazamos todas las filas)
        cache_rows = _parse_cache_rows(
            request.form.getlist("cache_kind[]"),
            request.form.getlist("cache_concept[]"),
            request.form.getlist("cache_amount[]"),
            request.form.getlist("cache_var_mode[]"),
            request.form.getlist("cache_var_option[]"),
            request.form.getlist("cache_from_ticket[]"),
            request.form.getlist("cache_min_tickets[]"),
            request.form.getlist("cache_min_revenue[]"),
            request.form.getlist("cache_pct[]"),
            request.form.getlist("cache_pct_base[]"),
            request.form.getlist("cache_ticket_type[]"),
        )
        _replace_concert_caches(session, c.id, cache_rows)

        # contratos (solo añadimos nuevos)
        _add_contracts_from_request(session, c.id)

        # notas contratación (solo añadimos nuevas)
        _add_concert_notes_from_request(session, c.id)

        # equipamiento (actualiza resumen + añade docs/notas nuevas)
        _upsert_equipment_from_request(session, c.id)
        _add_equipment_docs_from_request(session, c.id)
        _add_equipment_notes_from_request(session, c.id)

        session.commit()
        flash("Concierto actualizado.", "success")

        # Decide a qué filtro volver (pasados/futuros) según la nueva fecha.
        if c.date and c.date < today_local():
            target_when = "PAST"
        else:
            target_when = "FUTURE"

    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")

    finally:
        session.close()

    return redirect(url_for("concerts_view", tab="vista", when=target_when) + f"#concert-{cid}")


# ---------- BORRAR ----------
@app.post("/conciertos/<cid>/delete", endpoint="concert_delete")
@admin_required
def concert_delete_handler(cid):
    session = db()
    try:
        concert_uuid = to_uuid(cid)
        if not concert_uuid:
            raise ValueError("ID de concierto inválido")

        # limpia hijos (por si los FKs no tienen ON DELETE CASCADE)
        session.query(TicketSale).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        # Ventas V2
        session.query(TicketSaleDetail).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertTicketer).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertTicketType).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertSalesConfig).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertPromoterShare).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertCompanyShare).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertZoneAgent).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertCache).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertContract).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertNote).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertEquipmentDocument).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertEquipmentNote).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.query(ConcertEquipment).filter_by(concert_id=concert_uuid).delete(synchronize_session=False)
        session.flush()

        c = session.get(Concert, concert_uuid)
        if c:
            session.delete(c)

        session.commit()
        flash("Concierto borrado.", "success")

    except Exception as e:
        session.rollback()
        flash(f"Error borrando concierto: {e}", "danger")

    finally:
        session.close()

    return redirect(url_for("concerts_view", tab="vista"))


# ----------- API: crear Recinto / Tercero (modal) -----------

@app.post("/api/venues/create", endpoint="api_create_venue")
@admin_required
def api_create_venue():
    session_db = db()
    try:
        name = (request.form.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre del recinto es obligatorio."}), 400

        municipality = (request.form.get("municipality") or "").strip() or None
        province = (request.form.get("province") or "").strip() or None

        v = Venue(
            name=name,
            covered=(request.form.get("covered") == "on"),
            address=(request.form.get("address") or "").strip() or None,
            municipality=municipality,
            province=province,
        )
        session_db.add(v)
        session_db.commit()

        mun = (v.municipality or "").strip()
        prov = (v.province or "").strip()
        text_label = f"{v.name} — {mun} ({prov})".strip()
        if not mun and not prov:
            text_label = v.name
        elif mun and not prov:
            text_label = f"{v.name} — {mun}"
        elif not mun and prov:
            text_label = f"{v.name} ({prov})"

        return jsonify({
            "id": str(v.id),
            "name": (v.name or "").strip(),
            "municipality": mun,
            "province": prov,
            "label": text_label,
            "text": text_label,   # ✅ CLAVE para Select2
        })

    except Exception as e:
        session_db.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session_db.close()



@app.post("/api/promoters/create", endpoint="api_create_promoter")
@admin_required
def api_create_promoter():
    session = db()
    try:
        nick = (request.form.get("nick") or "").strip()
        if not nick:
            return jsonify({"error": "El nombre del tercero es obligatorio."}), 400

        logo = request.files.get("logo") or request.files.get("photo")
        logo_url = upload_image(logo, "promoters") if logo and getattr(logo, "filename", "") else None

        p = Promoter(
            nick=nick,
            logo_url=logo_url,
            tax_id=(request.form.get("tax_id") or "").strip() or None,
            contact_email=(request.form.get("contact_email") or "").strip() or None,
            contact_phone=(request.form.get("contact_phone") or "").strip() or None,
        )
        session.add(p)
        session.commit()
        return jsonify(
            {
                "id": str(p.id),
                "label": p.nick,
                "logo_url": p.logo_url,
                "tax_id": (p.tax_id or ""),
                "contact_email": (p.contact_email or ""),
                "contact_phone": (p.contact_phone or ""),
            }
        )

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()



# ----------- API: crear Artista (modal) -----------

@app.post("/api/artists/create", endpoint="api_create_artist")
@admin_required
def api_create_artist():
    session = db()
    try:
        name = (request.form.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre del artista es obligatorio."}), 400

        photo = request.files.get("photo")
        photo_url = upload_png(photo, "artists") if photo and getattr(photo, "filename", "") else None

        a = Artist(name=name, photo_url=photo_url)
        session.add(a)
        session.commit()
        return jsonify({"id": str(a.id), "label": a.name, "photo_url": a.photo_url})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()


# ----------- API: cambio rápido de estado (vista conciertos) -----------

@app.post("/conciertos/<cid>/status", endpoint="concert_quick_status")
@admin_required
def concert_quick_status(cid):
    session = db()
    try:
        c = session.get(Concert, to_uuid(cid))
        if not c:
            return jsonify({"error": "not found"}), 404

        new_status = request.form.get("status")
        if not new_status and request.is_json:
            payload = request.get_json(silent=True) or {}
            new_status = payload.get("status")

        c.status = _norm_status(new_status)
        session.commit()
        return jsonify({"ok": True, "status": c.status})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()


# ----------- NOTAS (crear / borrar) -----------

@app.post("/conciertos/<cid>/notes/create", endpoint="concert_note_create")
@admin_required
def concert_note_create(cid):
    session = db()
    try:
        concert_id = to_uuid(cid)
        title = (request.form.get("title") or "").strip()
        body = (request.form.get("body") or "").strip()
        if not body:
            flash("La nota no puede estar vacía.", "warning")
            return redirect(url_for("concerts_view", tab="vista") + f"#concert-{cid}")

        session.add(ConcertNote(concert_id=concert_id, title=title, body=body))
        session.commit()
        flash("Nota añadida.", "success")

    except Exception as e:
        session.rollback()
        flash(f"Error añadiendo nota: {e}", "danger")

    finally:
        session.close()

    return redirect(url_for("concerts_view", tab="vista") + f"#concert-{cid}")


@app.post("/conciertos/notes/<nid>/delete", endpoint="concert_note_delete")
@app.post("/conciertos/<cid>/notes/<note_id>/delete")  # compat con template (cid + note_id)
@admin_required
def concert_note_delete(nid=None, cid=None, note_id=None):
    session_db = db()
    next_url = (request.form.get("next") or "").strip() or url_for("concerts_view", tab="vista")

    try:
        # admitimos ambas formas:
        #  - /conciertos/notes/<nid>/delete
        #  - /conciertos/<cid>/notes/<note_id>/delete
        target_id = nid or note_id
        if not target_id:
            flash("Nota inválida.", "warning")
            return redirect(next_url)

        note_uuid = to_uuid(target_id)
        note = session_db.get(ConcertNote, note_uuid)
        if not note:
            flash("Nota no encontrada.", "warning")
            return redirect(next_url)

        # si viene cid, verificamos que la nota pertenece a ese concierto
        if cid:
            cid_uuid = to_uuid(cid)
            if cid_uuid and getattr(note, "concert_id", None) != cid_uuid:
                flash("La nota no corresponde a este concierto.", "warning")
                return redirect(next_url)

        session_db.delete(note)
        session_db.commit()
        flash("Nota eliminada.", "success")
        return redirect(next_url)

    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando nota: {e}", "danger")
        return redirect(next_url)

    finally:
        session_db.close()


# ----------- EQUIPAMIENTO: borrar docs / notas -----------

@app.post("/conciertos/<cid>/equipment_docs/<did>/delete", endpoint="concert_equipment_doc_delete")
@admin_required
def concert_equipment_doc_delete(cid, did):
    session = db()
    try:
        d = session.get(ConcertEquipmentDocument, to_uuid(did))
        if d:
            session.delete(d)
            session.commit()
            flash("Documento eliminado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando documento: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("concert_edit_view", cid=cid))


@app.post("/conciertos/<cid>/equipment_notes/<nid>/delete", endpoint="concert_equipment_note_delete")
@app.post("/conciertos/<cid>/equipment_notes/<note_id>/delete")  # compat template: note_id
@admin_required
def concert_equipment_note_delete(cid, nid=None, note_id=None):
    session = db()
    try:
        target_id = nid or note_id
        n = session.get(ConcertEquipmentNote, to_uuid(target_id)) if target_id else None
        if n:
            session.delete(n)
            session.commit()
            flash("Nota de equipamiento eliminada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando nota: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("concert_edit_view", cid=cid))

# --------- EMPRESAS ---------------------
@app.route("/empresas", methods=["GET", "POST"])
@admin_required
def companies_view():
    session = db()

    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        name = request.form.get("name","").strip()
        tax_info = request.form.get("tax_info","").strip()
        logo = request.files.get("logo")
        try:
            logo_url = upload_png(logo, "companies") if logo else None
            co = GroupCompany(name=name, tax_info=tax_info, logo_url=logo_url)
            session.add(co)
            session.commit()
            flash("Empresa creada.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando empresa: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("companies_view"))
    companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()
    session.close()
    return render_template("companies.html", companies=companies)

@app.post("/empresas/<cid>/update")
@admin_required
def company_update(cid):
    session = db()
    co = session.get(GroupCompany, to_uuid(cid))
    if not co:
        flash("Empresa no encontrada.", "warning")
        session.close(); return redirect(url_for("companies_view"))
    co.name = request.form.get("name", co.name).strip()
    co.tax_info = request.form.get("tax_info", co.tax_info or "").strip()
    logo = request.files.get("logo")
    try:
        if logo and logo.filename:
            co.logo_url = upload_png(logo, "companies")
        session.commit()
        flash("Empresa actualizada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("companies_view"))

@app.post("/empresas/<cid>/delete")
@admin_required
def company_delete(cid):
    session = db()
    try:
        co = session.get(GroupCompany, to_uuid(cid))
        if co:
            session.delete(co)
            session.commit()
            flash("Empresa eliminada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("companies_view"))

# -------------- VENTA DE ENTRADAS -----------


def sales_maps(session, day: date, concert_ids=None):
    """
    Devuelve:
      - totals:  {concert_id: total_acumulado_hasta_day}
      - today:   {concert_id: vendidas_hoy}
      - lastmap: {concert_id: última_fecha_con_registro}
    Todas las claves que no existan en la tabla salen como 0/None en la lectura.
    """
    q_tot = session.query(TicketSale.concert_id, func.sum(TicketSale.sold_today)).filter(TicketSale.day <= day)
    q_today = session.query(TicketSale.concert_id, func.sum(TicketSale.sold_today)).filter(TicketSale.day == day)
    q_last = session.query(TicketSale.concert_id, func.max(TicketSale.day))

    if concert_ids:
        q_tot = q_tot.filter(TicketSale.concert_id.in_(concert_ids))
        q_today = q_today.filter(TicketSale.concert_id.in_(concert_ids))
        q_last = q_last.filter(TicketSale.concert_id.in_(concert_ids))

    totals = {cid: int(total or 0) for cid, total in q_tot.group_by(TicketSale.concert_id).all()}
    today = {cid: int(q or 0) for cid, q in q_today.group_by(TicketSale.concert_id).all()}
    lastmap = {cid: d for cid, d in q_last.group_by(TicketSale.concert_id).all()}
    return totals, today, lastmap


def sales_maps_v2(session, day: date, concert_ids=None):
    """Mapas de ventas V2 (ticketeras + tipos de entrada).

    Devuelve:
      - totals_qty: {concert_id: total_qty_hasta_day}
      - today_qty:  {concert_id: qty_en_el_dia}
      - lastmap:    {concert_id: max_day}
      - totals_gross: {concert_id: gross_hasta_day}
      - today_gross:  {concert_id: gross_en_el_dia}
    """
    q_tot = session.query(TicketSaleDetail.concert_id, func.sum(TicketSaleDetail.qty)).filter(TicketSaleDetail.day <= day)
    q_today = session.query(TicketSaleDetail.concert_id, func.sum(TicketSaleDetail.qty)).filter(TicketSaleDetail.day == day)
    q_last = session.query(TicketSaleDetail.concert_id, func.max(TicketSaleDetail.day))

    q_gross_tot = (
        session.query(
            TicketSaleDetail.concert_id,
            func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
        )
        .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
        .filter(TicketSaleDetail.day <= day)
    )
    q_gross_today = (
        session.query(
            TicketSaleDetail.concert_id,
            func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
        )
        .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
        .filter(TicketSaleDetail.day == day)
    )

    if concert_ids:
        q_tot = q_tot.filter(TicketSaleDetail.concert_id.in_(concert_ids))
        q_today = q_today.filter(TicketSaleDetail.concert_id.in_(concert_ids))
        q_last = q_last.filter(TicketSaleDetail.concert_id.in_(concert_ids))
        q_gross_tot = q_gross_tot.filter(TicketSaleDetail.concert_id.in_(concert_ids))
        q_gross_today = q_gross_today.filter(TicketSaleDetail.concert_id.in_(concert_ids))

    totals_qty = {cid: int(v or 0) for cid, v in q_tot.group_by(TicketSaleDetail.concert_id).all()}
    today_qty = {cid: int(v or 0) for cid, v in q_today.group_by(TicketSaleDetail.concert_id).all()}
    lastmap = {cid: d for cid, d in q_last.group_by(TicketSaleDetail.concert_id).all()}

    totals_gross = {cid: float(v or 0) for cid, v in q_gross_tot.group_by(TicketSaleDetail.concert_id).all()}
    today_gross = {cid: float(v or 0) for cid, v in q_gross_today.group_by(TicketSaleDetail.concert_id).all()}

    return totals_qty, today_qty, lastmap, totals_gross, today_gross


def sales_maps_unified(session, day: date, concert_ids=None):
    """Combina ventas legacy (ticket_sales) con ventas V2 (ticket_sales_details).

    Regla:
      - Si un concierto tiene ventas V2 (al menos un registro en details), se usan esas.
      - Si no, se usa legacy.
    """
    legacy_totals, legacy_today, legacy_last = sales_maps(session, day, concert_ids)
    v2_totals, v2_today, v2_last, v2_gross, v2_gross_today = sales_maps_v2(session, day, concert_ids)

    totals = dict(legacy_totals)
    today_map = dict(legacy_today)
    last_map = dict(legacy_last)

    gross_map = {cid: 0.0 for cid in (concert_ids or list(set(list(totals.keys()) + list(v2_gross.keys()))))}
    gross_today_map = {cid: 0.0 for cid in (concert_ids or list(set(list(today_map.keys()) + list(v2_gross_today.keys()))))}

    # Conciertos que tienen ventas V2
    v2_concerts = set(v2_last.keys())
    for cid in v2_concerts:
        totals[cid] = int(v2_totals.get(cid, 0))
        today_map[cid] = int(v2_today.get(cid, 0))
        last_map[cid] = v2_last.get(cid)
        gross_map[cid] = float(v2_gross.get(cid, 0.0) or 0.0)
        gross_today_map[cid] = float(v2_gross_today.get(cid, 0.0) or 0.0)

    # Para conciertos legacy, dejamos gross=0
    return totals, today_map, last_map, gross_map, gross_today_map


def _sales_net_breakdown(gross: float, vat_pct: float, sgae_pct: float) -> dict:
    """Calcula neto a partir de bruto aplicando:

    1) IVA sobre el bruto.
    2) SGAE sobre el importe SIN IVA.

    (Petición cliente) No se debe restar IVA+SGAE directamente del bruto.

    Devuelve: vat_amount, sgae_amount, base_no_vat, net.
    """
    try:
        g = float(gross or 0.0)
    except Exception:
        g = 0.0

    try:
        vat = max(0.0, float(vat_pct or 0.0))
    except Exception:
        vat = 0.0

    try:
        sgae = max(0.0, float(sgae_pct or 0.0))
    except Exception:
        sgae = 0.0

    vat_amount = g * (vat / 100.0)
    base_no_vat = g - vat_amount
    sgae_amount = base_no_vat * (sgae / 100.0)
    net = base_no_vat - sgae_amount

    # Evitar negativos por redondeos / porcentajes raros
    if net < 0:
        net = 0.0
    if vat_amount < 0:
        vat_amount = 0.0
    if sgae_amount < 0:
        sgae_amount = 0.0
    if base_no_vat < 0:
        base_no_vat = 0.0

    return {
        "gross": g,
        "vat_pct": vat,
        "sgae_pct": sgae,
        "vat_amount": vat_amount,
        "base_no_vat": base_no_vat,
        "sgae_amount": sgae_amount,
        "net": net,
    }


def _concert_capacity_from_ticket_types(concert: Concert) -> int:
    """Aforo a la venta efectivo.

    Regla solicitada:
      - Si hay aforos por categoría (tipos de entrada), el aforo total debe ser la suma.
      - Si no hay tipos o la suma es 0, usamos el aforo del concierto.
    """
    try:
        types = list(getattr(concert, "ticket_types", None) or [])
        s = sum(int(getattr(tt, "qty_for_sale", 0) or 0) for tt in types)
        if s > 0:
            return int(s)
    except Exception:
        pass
    try:
        return int(getattr(concert, "capacity", 0) or 0)
    except Exception:
        return 0


def _sync_concert_capacity_from_ticket_types(session_db, concert_id) -> None:
    """Actualiza concerts.capacity como suma de concert_ticket_types.qty_for_sale.

    Esto asegura que el resto de pantallas (reporte/ventas) muestre el aforo correcto
    cuando se trabaja por categorías.
    """
    try:
        total = (
            session_db.query(func.coalesce(func.sum(ConcertTicketType.qty_for_sale), 0))
            .filter(ConcertTicketType.concert_id == concert_id)
            .scalar()
        )
        total_int = int(total or 0)
        if total_int <= 0:
            return

        c = session_db.get(Concert, concert_id)
        if not c:
            return

        if int(getattr(c, "capacity", 0) or 0) != total_int:
            c.capacity = total_int
            c.updated_at = func.now()
    except Exception:
        # No rompemos la operación principal si esto falla.
        return

@app.route("/ventas")
@admin_required
def sales_update_view():
    if not can_edit_sales():
        return forbid("No tienes permisos para acceder a la actualización de ventas.")
    if not can_edit_sales() and not is_master():
        flash("Modo lectura: no puedes actualizar ventas.", "info")
        return redirect(url_for("sales_report_view"))
    session = db()
    try:
        day = get_day("d")
        prev_day = day - timedelta(days=1)
        next_day = day + timedelta(days=1)

        concerts = (
            session.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                joinedload(Concert.sales_config),
                selectinload(Concert.ticket_types),
                selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
            )
            # Solo los tipos con ventas. "GRATUITO" no debe aparecer aquí.
            .filter(Concert.sale_type.in_(SALES_SECTION_ORDER))
            .filter(Concert.sale_start_date <= day, Concert.date >= day)
            .order_by(Concert.date.asc())
            .all()
        )

        concert_ids = [c.id for c in concerts]

        # Si el evento está configurado con aforos por tipo (modo avanzado),
        # el aforo "a la venta" total debe ser la suma de esos aforos.
        # Lo aplicamos también en reportes (sin depender de que se haya sincronizado
        # previamente la columna concerts.capacity).
        if concert_ids:
            cap_rows = (
                session.query(
                    ConcertTicketType.concert_id,
                    func.coalesce(func.sum(ConcertTicketType.qty_for_sale), 0).label("sum_qty"),
                )
                .filter(ConcertTicketType.concert_id.in_(concert_ids))
                .group_by(ConcertTicketType.concert_id)
                .all()
            )
            cap_map = {cid: int(s or 0) for cid, s in cap_rows}
            for c in concerts:
                cap_sum = cap_map.get(c.id, 0)
                if cap_sum > 0:
                    # Sobrescribimos en memoria para el reporte (sin commit)
                    c.capacity = cap_sum

        totals, today_map, last_map, gross_map, _gross_today = sales_maps_unified(session, day, concert_ids)

        # Aforo efectivo (si hay categorías/tipos, suma; si no, aforo del concierto)
        capacity_map = {c.id: _concert_capacity_from_ticket_types(c) for c in concerts}

        # Neto + desglose (IVA primero, SGAE sobre base sin IVA)
        net_map = {}
        vat_amount_map = {}
        sgae_amount_map = {}
        base_no_vat_map = {}
        for c in concerts:
            gross = float(gross_map.get(c.id, 0.0) or 0.0)
            vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            br = _sales_net_breakdown(gross, vat, sgae)
            net_map[c.id] = float(br.get("net") or 0.0)
            vat_amount_map[c.id] = float(br.get("vat_amount") or 0.0)
            sgae_amount_map[c.id] = float(br.get("sgae_amount") or 0.0)
            base_no_vat_map[c.id] = float(br.get("base_no_vat") or 0.0)

        # Potencial de recaudación (según tipos): útil para "dinero por vender"
        potential_gross_map = {}
        remaining_gross_map = {}
        for c in concerts:
            pot = 0.0
            for tt in (c.ticket_types or []):
                pot += float(getattr(tt, "price", 0) or 0) * float(getattr(tt, "qty_for_sale", 0) or 0)
            potential_gross_map[c.id] = pot
            remaining_gross_map[c.id] = max(0.0, pot - float(gross_map.get(c.id, 0.0) or 0.0))

        # Totales acumulados por tipo / ticketer (para detectar desajustes en el día a día)
        type_totals_map = {}
        ticketer_totals_map = {}
        if concert_ids:
            # Por tipo
            rows = (
                session.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticket_type_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticket_type_id)
                .all()
            )
            for cid2, ttid2, sold, gross in rows:
                type_totals_map.setdefault(cid2, {})[ttid2] = {
                    "sold": int(sold or 0),
                    "gross": float(gross or 0.0),
                }

            # Por ticketer
            rows = (
                session.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id)
                .all()
            )
            for cid2, tid2, sold, gross in rows:
                ticketer_totals_map.setdefault(cid2, {})[tid2] = {
                    "sold": int(sold or 0),
                    "gross": float(gross or 0.0),
                }

        # Detalle de HOY (V2)
        details_today = {}
        ticketer_has_today = set()
        if concert_ids:
            rows = (
                session.query(TicketSaleDetail)
                .filter(TicketSaleDetail.day == day)
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .all()
            )
            for r in rows:
                details_today.setdefault(r.concert_id, {}).setdefault(r.ticketer_id, {})[r.ticket_type_id] = int(r.qty or 0)
                ticketer_has_today.add(f"{r.concert_id}:{r.ticketer_id}")

        # Totales por ticketer (HOY)
        ticketer_today_totals = {}
        ticketer_today_gross = {}
        for c in concerts:
            price_map = {tt.id: float(tt.price or 0) for tt in (c.ticket_types or [])}
            for ct in (c.ticketers or []):
                tid = ct.ticketer_id
                tmap = (details_today.get(c.id, {}) or {}).get(tid, {}) or {}
                qty_sum = sum(int(v or 0) for v in tmap.values())
                gross_sum = 0.0
                for ttype_id, qty in tmap.items():
                    gross_sum += float(qty or 0) * float(price_map.get(ttype_id, 0.0) or 0.0)
                ticketer_today_totals.setdefault(c.id, {})[tid] = qty_sum
                ticketer_today_gross.setdefault(c.id, {})[tid] = gross_sum

        # ticketeras globales (para selector)
        all_ticketers = session.query(Ticketer).order_by(Ticketer.name.asc()).all()

        # Agrupar por secciones (igual que reporte)
        sections = {k: [] for k in SALES_SECTION_ORDER}
        for c in concerts:
            if c.sale_type in sections:
                sections[c.sale_type].append(c)
        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        return render_template(
            "sales_update.html",
            day=day,
            prev_day=prev_day,
            next_day=next_day,
            open_cfg=(request.args.get("open_cfg") or ""),
            sections=sections,
            order=SALES_SECTION_ORDER,
            titles=SALES_SECTION_TITLE,
            totals=totals,
            today_map=today_map,
            last_map=last_map,
            gross_map=gross_map,
            net_map=net_map,
            capacity_map=capacity_map,
            vat_amount_map=vat_amount_map,
            sgae_amount_map=sgae_amount_map,
            base_no_vat_map=base_no_vat_map,
            potential_gross_map=potential_gross_map,
            remaining_gross_map=remaining_gross_map,
            type_totals_map=type_totals_map,
            ticketer_totals_map=ticketer_totals_map,
            details_today=details_today,
            ticketer_has_today=ticketer_has_today,
            ticketer_today_totals=ticketer_today_totals,
            ticketer_today_gross=ticketer_today_gross,
            all_ticketers=all_ticketers,
        )
    finally:
        session.close()
@app.post("/ventas/save")
@admin_required
def sales_save():
    session = db()
    day = parse_date(request.form["day"])
    cid = to_uuid(request.form["concert_id"])
    qty = request.form.get("sold_today","").strip()
    qty_int = int(qty) if qty else 0
    try:
        row = (session.query(TicketSale)
               .filter_by(concert_id=cid, day=day).first())
        if row:
            row.sold_today = qty_int
            row.updated_at = func.now()
        else:
            session.add(TicketSale(concert_id=cid, day=day, sold_today=qty_int))
        session.commit()
        flash("Ventas guardadas.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error guardando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("sales_update_view", d=day.isoformat()) + f"#concert-{cid}")

@app.post("/ventas/soldout/<cid>/toggle", endpoint="sales_toggle_soldout")
@admin_required
def sales_toggle_soldout(cid):
    session = db()
    try:
        c = session.get(Concert, to_uuid(cid))
        if not c:
            flash("Concierto no encontrado.", "warning")
            session.close()
            return redirect(request.referrer or url_for("sales_update_view"))

        # Alterna el flag manual (independiente del aforo lleno)
        c.sold_out = not bool(c.sold_out)
        session.commit()
        flash("Estado SOLD OUT actualizado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error cambiando SOLD OUT: {e}", "danger")
    finally:
        session.close()
    # vuelve a la misma fecha
    day = request.form.get("day") or request.args.get("day")
    return redirect(url_for("sales_update_view", d=day) if day else (request.referrer or url_for("sales_update_view")))


# -------- Ventas V2: configuración (IVA/SGAE, tipos de entrada, ticketeras, detalle día) --------


@app.post("/ventas/<cid>/config/save", endpoint="sales_config_save")
@admin_required
def sales_config_save(cid):
    """Guarda IVA/SGAE del concierto."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        c = session_db.get(Concert, concert_id)
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        vat = _parse_optional_decimal(request.form.get("vat_pct"))
        sgae = _parse_optional_decimal(request.form.get("sgae_pct"))
        vat_f = float(vat or 0)
        sgae_f = float(sgae or 0)

        cfg = session_db.query(ConcertSalesConfig).filter_by(concert_id=concert_id).first()
        if not cfg:
            cfg = ConcertSalesConfig(concert_id=concert_id)
            session_db.add(cfg)

        cfg.vat_pct = vat_f
        cfg.sgae_pct = sgae_f
        cfg.updated_at = func.now()
        session_db.commit()
        flash("Configuración de IVA/SGAE guardada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando configuración: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    # Reabrir automáticamente el "recuadro" (modal) tras guardar
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticket_types/add", endpoint="sales_ticket_type_add")
@admin_required
def sales_ticket_type_add(cid):
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        name = (request.form.get("type_name") or "").strip()
        qty = _parse_optional_int(request.form.get("type_qty"), min_v=0) or 0
        price = _parse_optional_decimal(request.form.get("type_price")) or Decimal(0)
        if not name:
            raise ValueError("El tipo de entrada es obligatorio")

        tt = ConcertTicketType(concert_id=concert_id, name=name, qty_for_sale=int(qty), price=float(price))
        session_db.add(tt)
        session_db.flush()
        _sync_concert_capacity_from_ticket_types(session_db, concert_id)
        session_db.commit()
        flash("Tipo de entrada añadido.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo tipo de entrada: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticket_types/<ttid>/update", endpoint="sales_ticket_type_update")
@admin_required
def sales_ticket_type_update(cid, ttid):
    session_db = db()
    try:
        tt = session_db.get(ConcertTicketType, to_uuid(ttid))
        if not tt:
            flash("Tipo de entrada no encontrado.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        name = (request.form.get("type_name") or tt.name or "").strip()
        qty = _parse_optional_int(request.form.get("type_qty"), min_v=0)
        price = _parse_optional_decimal(request.form.get("type_price"))

        if name:
            tt.name = name
        if qty is not None:
            tt.qty_for_sale = int(qty)
        if price is not None:
            tt.price = float(price)
        tt.updated_at = func.now()
        session_db.flush()
        _sync_concert_capacity_from_ticket_types(session_db, tt.concert_id)
        session_db.commit()
        flash("Tipo de entrada actualizado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando tipo de entrada: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticket_types/<ttid>/delete", endpoint="sales_ticket_type_delete")
@admin_required
def sales_ticket_type_delete(cid, ttid):
    session_db = db()
    try:
        tt = session_db.get(ConcertTicketType, to_uuid(ttid))
        if tt:
            concert_id = tt.concert_id
            session_db.delete(tt)
            session_db.flush()
            _sync_concert_capacity_from_ticket_types(session_db, concert_id)
            session_db.commit()
            flash("Tipo de entrada eliminado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando tipo de entrada: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/add", endpoint="sales_ticketer_add")
@admin_required
def sales_ticketer_add(cid):
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(request.form.get("ticketer_id"))
        if not ticketer_id:
            raise ValueError("Selecciona una ticketera")

        cap = _parse_optional_int(request.form.get("ticketer_capacity"), min_v=0)
        if cap is None:
            # Mantener comportamiento anterior: si no se indica, usar aforo del concierto
            c = session_db.get(Concert, concert_id)
            cap = int(getattr(c, "capacity", 0) or 0) if c else 0

        exists = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if not exists:
            session_db.add(
                ConcertTicketer(
                    concert_id=concert_id,
                    ticketer_id=ticketer_id,
                    capacity_for_sale=int(cap or 0),
                )
            )
            session_db.commit()
            flash("Ticketera añadida al evento.", "success")
        else:
            # Si ya existe, permitimos actualizar el aforo de esa ticketera
            exists.capacity_for_sale = int(cap or 0)
            session_db.commit()
            flash("Aforo de ticketera actualizado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo ticketera: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/<tid>/remove", endpoint="sales_ticketer_remove")
@admin_required
def sales_ticketer_remove(cid, tid):
    session_db = db()
    try:
        row = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=to_uuid(cid), ticketer_id=to_uuid(tid))
            .first()
        )
        if row:
            session_db.delete(row)
            session_db.commit()
            flash("Ticketera eliminada del evento.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error quitando ticketera: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/<tid>/update", endpoint="sales_ticketer_update")
@admin_required
def sales_ticketer_update(cid, tid):
    """Actualiza el aforo a la venta específico de una ticketera en el evento."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(tid)

        row = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if not row:
            flash("Ticketera no encontrada en el evento.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        cap = _parse_optional_int(request.form.get("capacity_for_sale"), min_v=0) or 0
        row.capacity_for_sale = int(cap)
        session_db.commit()
        flash("Aforo de ticketera actualizado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando aforo de ticketera: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketer/<tid>/day/save", endpoint="sales_ticketer_day_save")
@admin_required
def sales_ticketer_day_save(cid, tid):
    """Guarda las entradas vendidas HOY por ticketera y tipo."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(tid)
        day = parse_date(request.form.get("day") or date.today().isoformat())

        # Validar que el concierto existe
        c = session_db.query(Concert).options(selectinload(Concert.ticket_types)).get(concert_id)
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        # Upsert para cada tipo de entrada del concierto
        types = list(c.ticket_types or [])
        if not types:
            raise ValueError("Primero añade al menos un tipo de entrada")

        for tt in types:
            field = f"qty_{tt.id}"
            raw = (request.form.get(field) or "").strip()
            qty_int = int(raw) if raw else 0
            if qty_int < 0:
                qty_int = 0

            row = (
                session_db.query(TicketSaleDetail)
                .filter_by(concert_id=concert_id, day=day, ticketer_id=ticketer_id, ticket_type_id=tt.id)
                .first()
            )
            if row:
                row.qty = qty_int
                row.updated_at = func.now()
            else:
                session_db.add(
                    TicketSaleDetail(
                        concert_id=concert_id,
                        day=day,
                        ticketer_id=ticketer_id,
                        ticket_type_id=tt.id,
                        qty=qty_int,
                    )
                )

        session_db.commit()
        flash("Ventas por ticketera guardadas.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando ventas por ticketera: {e}", "danger")
    finally:
        session_db.close()

    day_s = request.form.get("day") or request.args.get("day")
    return redirect(url_for("sales_update_view", d=day_s) + f"#concert-{cid}" if day_s else (request.referrer or url_for("sales_update_view")))


# ------------- REPORTE DE VENTAS (PUBLIC Y ADMIN) -----------

def concerts_for_report(session, day: date, past: bool = False):
    """
    - Próximos: fecha >= (hoy-2)
    - Anteriores: fecha < (hoy-2)
    Precarga TODAS las relaciones usadas en la plantilla para evitar lazy-load.
    """
    cutoff = day - timedelta(days=2)

    q = (
        session.query(Concert)
        .options(
            # entidades directas de la tarjeta
            joinedload(Concert.artist),
            joinedload(Concert.venue),
            joinedload(Concert.promoter),        # VENDIDO
            joinedload(Concert.group_company),
            joinedload(Concert.billing_company),   # EMPRESA
            # colecciones y sus relaciones anidadas (participaciones)
            selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
            selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
            joinedload(Concert.sales_config),
        )
    )

    # Solo los tipos con ventas (excluye "GRATUITO").
    q = q.filter(Concert.sale_type.in_(SALES_SECTION_ORDER))

    if past:
        q = q.filter(Concert.date < cutoff)
    else:
        q = q.filter(Concert.date >= cutoff)
    return q.order_by(Concert.date.asc()).all()

def build_sales_report_context(day: date, *, past=False,
                               promoter_id=None, artist_id=None, company_id=None):
    session = db()
    try:
        concerts = concerts_for_report(session, day, past=past)

        # Filtros específicos
        if promoter_id:
            pid = to_uuid(promoter_id)
            concerts = [c for c in concerts if (c.promoter_id == pid) or any(s.promoter_id == pid for s in c.promoter_shares)]
        if artist_id:
            aid = to_uuid(artist_id)
            concerts = [c for c in concerts if c.artist_id == aid]
        if company_id:
            gid = to_uuid(company_id)
            concerts = [c for c in concerts if (c.group_company_id == gid) or any(s.company_id == gid for s in c.company_shares)]

        concert_ids = [c.id for c in concerts]

        # Si el evento está configurado con aforos por tipo (modo avanzado),
        # el aforo "a la venta" total debe ser la suma de esos aforos.
        # Esto evita que prevalezca el aforo introducido anteriormente "desde oficina".
        if concert_ids:
            cap_rows = (
                session.query(
                    ConcertTicketType.concert_id,
                    func.coalesce(func.sum(ConcertTicketType.qty_for_sale), 0).label("sum_qty"),
                )
                .filter(ConcertTicketType.concert_id.in_(concert_ids))
                .group_by(ConcertTicketType.concert_id)
                .all()
            )
            cap_map = {cid: int(s or 0) for cid, s in cap_rows}
            for c in concerts:
                cap_sum = cap_map.get(c.id, 0)
                if cap_sum > 0:
                    # Sobrescribimos en memoria para el reporte (sin commit)
                    c.capacity = cap_sum

        totals, today_map, last_map, gross_map, _gross_today = sales_maps_unified(session, day, concert_ids)

        # Neto (IVA primero, SGAE sobre base sin IVA)
        net_map = {}
        for c in concerts:
            gross = float(gross_map.get(c.id, 0.0) or 0.0)
            vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            net_map[c.id] = float(_sales_net_breakdown(gross, vat, sgae).get("net") or 0.0)

        sections = {
            "EMPRESA":      [c for c in concerts if c.sale_type == "EMPRESA"],
            "PARTICIPADOS": [c for c in concerts if c.sale_type == "PARTICIPADOS"],
            "CADIZ":        [c for c in concerts if c.sale_type == "CADIZ"],
            "VENDIDO":      [c for c in concerts if c.sale_type == "VENDIDO"],
        }
        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        return dict(
            day=day,
            past=past,
            sections=sections,
            order=SALES_SECTION_ORDER,
            titles=SALES_SECTION_TITLE,
            totals=totals,
            today_map=today_map,
            last_map=last_map,
            gross_map=gross_map,
            net_map=net_map,
        )
    finally:
        session.close()

@app.get("/ventas/reporte", endpoint="sales_report_view")
def sales_report_view():
    day = get_day("d")
    ctx = build_sales_report_context(day)
    ctx["pdf_url"] = url_for("sales_report_pdf", d=day.isoformat())
    ctx["nav_prev_url"] = url_for("sales_report_view", d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_view", d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/anteriores", endpoint="sales_report_past")
def sales_report_past():
    day = get_day("d")
    ctx = build_sales_report_context(day, past=True)
    ctx["pdf_url"] = url_for("sales_report_pdf", d=day.isoformat(), past=1)
    ctx["nav_prev_url"] = url_for("sales_report_past", d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_past", d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/promotor/<pid>", endpoint="sales_report_by_promoter")
def sales_report_by_promoter(pid):
    day = get_day("d")
    ctx = build_sales_report_context(day, promoter_id=pid)
    ctx["pdf_url"] = url_for("sales_report_pdf", d=day.isoformat(), promoter_id=pid)
    ctx["nav_prev_url"] = url_for("sales_report_by_promoter", pid=pid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_promoter", pid=pid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/artista/<aid>", endpoint="sales_report_by_artist")
def sales_report_by_artist(aid):
    day = get_day("d")
    ctx = build_sales_report_context(day, artist_id=aid)
    ctx["pdf_url"] = url_for("sales_report_pdf", d=day.isoformat(), artist_id=aid)
    ctx["nav_prev_url"] = url_for("sales_report_by_artist", aid=aid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_artist", aid=aid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/empresa/<gid>", endpoint="sales_report_by_company")
def sales_report_by_company(gid):
    day = get_day("d")
    ctx = build_sales_report_context(day, company_id=gid)
    ctx["pdf_url"] = url_for("sales_report_pdf", d=day.isoformat(), company_id=gid)
    ctx["nav_prev_url"] = url_for("sales_report_by_company", gid=gid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_company", gid=gid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)


@app.get("/ventas/reporte/pdf", endpoint="sales_report_pdf")
def sales_report_pdf():
    """Informe genérico de ventas en formato tabla (A4 apaisado).

    Muestra una "foto" del estado de ventas en el momento de generación.
    """
    if not REPORTLAB_AVAILABLE:
        flash("ReportLab no está instalado en el servidor. No se puede generar PDF.", "danger")
        return redirect(request.referrer or url_for("sales_report_view"))

    day = get_day("d")
    past = str(request.args.get("past") or "").lower() in ("1", "true", "yes", "on")
    promoter_id = request.args.get("promoter_id")
    artist_id = request.args.get("artist_id")
    company_id = request.args.get("company_id")

    ctx = build_sales_report_context(
        day,
        past=past,
        promoter_id=promoter_id,
        artist_id=artist_id,
        company_id=company_id,
    )

    show_econ = can_view_economics()

    # Estilos y utilidades para que la tabla no se salga de márgenes en A4 apaisado.
    # (En ReportLab, si la tabla es más ancha que el frame y está centrada, se recorta
    # por ambos lados. Aquí forzamos anchos más ajustados + wrap en texto.)
    from xml.sax.saxutils import escape as _xml_escape
    from reportlab.lib.styles import ParagraphStyle

    def _fmt_int_es(n: int) -> str:
        try:
            return f"{int(n):,}".replace(",", ".")
        except Exception:
            return "0"

    # BytesIO ya se importa arriba con: `from io import BytesIO`
    # (evita NameError por usar el módulo `io` sin importarlo).
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=18,
        rightMargin=18,
        topMargin=18,
        bottomMargin=18,
        title="Informe genérico de ventas",
    )
    styles = getSampleStyleSheet()
    tbl_txt = ParagraphStyle(
        "tbl_txt",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=8,
    )

    def _p(s: str) -> Paragraph:
        return Paragraph(_xml_escape(str(s or "")), tbl_txt)
    story = []

    title = f"Informe genérico de ventas — {day.strftime('%d/%m/%Y')}"
    story.append(Paragraph(title, styles["Title"]))
    story.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]))
    story.append(Spacer(1, 10))

    totals = ctx.get("totals", {})
    today_map = ctx.get("today_map", {})
    last_map = ctx.get("last_map", {})
    gross_map = ctx.get("gross_map", {})
    net_map = ctx.get("net_map", {})

    sections = ctx.get("sections", {})
    titles = ctx.get("titles", {})

    # Columnas
    base_header = [
        "Fecha",
        "Artista",
        "Ciudad",
        "Prov.",
        "Recinto",
        "Hoy",
        "Total",
        "%",
        "Aforo",
        "Pend.",
        "Act.",
    ]
    if show_econ:
        base_header += ["Bruto", "Neto"]

    # Anchos para A4 apaisado (ajustados a márgenes). Los textos (artista/ciudad/prov/recinto)
    # irán con wrap si no caben.
    col_widths = [40, 110, 70, 45, 140, 32, 45, 30, 45, 45, 40]
    if show_econ:
        col_widths += [60, 60]

    # Si por cualquier motivo el total supera el ancho útil del documento, escalamos.
    try:
        avail_w = float(doc.width)
        total_w = float(sum(col_widths))
        if total_w > 0 and total_w > avail_w:
            scale = avail_w / total_w
            col_widths = [w * scale for w in col_widths]
    except Exception:
        pass

    for key, lista in sections.items():
        if not lista:
            continue
        story.append(Paragraph(titles.get(key, key), styles["Heading2"]))

        data = [base_header]
        for c in lista:
            cid = c.id
            total = int(totals.get(cid, 0) or 0)
            cap = int(getattr(c, "capacity", 0) or 0)
            pct = (total / cap * 100.0) if cap else 0.0
            pending = max(0, cap - total) if cap else 0
            today_sold = int(today_map.get(cid, 0) or 0)
            updated_last = last_map.get(cid)
            updated_s = updated_last.strftime("%d/%m") if updated_last else "-"

            v = c.venue
            city = (v.municipality or "") if v else ""
            prov = (v.province or "") if v else ""
            venue = (v.name or "") if v else ""

            row = [
                (c.date.strftime("%d/%m") if c.date else "-"),
                _p(c.artist.name if c.artist else "-"),
                _p(city),
                _p(prov),
                _p(venue),
                _fmt_int_es(today_sold),
                _fmt_int_es(total),
                f"{pct:.1f}",
                _fmt_int_es(cap),
                _fmt_int_es(pending),
                updated_s,
            ]
            if show_econ:
                gross = float(gross_map.get(cid, 0.0) or 0.0)
                net = float(net_map.get(cid, 0.0) or 0.0)
                row += [_fmt_money_eur(gross), _fmt_money_eur(net)]
            data.append(row)

        tbl = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("ALIGN", (5, 1), (-1, -1), "RIGHT"),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 12))

    doc.build(story)
    buf.seek(0)

    suffix = "anteriores" if past else "reporte"
    filename = f"informe_ventas_{suffix}_{day.isoformat()}.pdf"
    return send_file(buf, mimetype="application/pdf", as_attachment=False, download_name=filename)


# ------------- INFORME DE VENTAS POR EVENTO (ADMIN) -----------


def _fmt_money_eur(n: float) -> str:
    try:
        return f"{n:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00 €"


@app.get("/ventas/informe/<cid>", endpoint="sales_event_report_view")
@admin_required
def sales_event_report_view(cid):
    # Si el usuario no puede ver economía, no debe acceder al informe del concierto.
    if not can_view_economics():
        return forbid("Tu usuario no tiene permisos para ver el informe económico de ventas.")

    day = get_day("d")
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        c = (
            session_db.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                joinedload(Concert.sales_config),
                selectinload(Concert.ticket_types),
                selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
            )
            .get(concert_id)
        )
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(url_for("sales_update_view", d=day.isoformat()))

        vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if c.sales_config else 0.0
        sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if c.sales_config else 0.0

        # ¿Hay datos V2?
        has_v2 = (
            session_db.query(func.count(TicketSaleDetail.id))
            .filter(TicketSaleDetail.concert_id == concert_id)
            .scalar()
            or 0
        ) > 0

        chart_labels, chart_values = [], []
        total_sold = 0
        gross_total = 0.0

        daily_rows = []  # para tabla detallada
        daily_totals = []  # (day, qty, gross)

        by_type = []  # {name, sold, qty_for_sale, price, gross}
        by_ticketer = []  # {name, sold, gross}

        if has_v2:
            # Detalle completo hasta el día elegido
            details = (
                session_db.query(TicketSaleDetail)
                .options(joinedload(TicketSaleDetail.ticketer), joinedload(TicketSaleDetail.ticket_type))
                .filter(TicketSaleDetail.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .order_by(TicketSaleDetail.day.asc())
                .all()
            )

            # Construir detalle diario
            for r in details:
                price = float(getattr(r.ticket_type, "price", 0) or 0)
                qty = int(r.qty or 0)
                g = qty * price
                daily_rows.append({
                    "day": r.day,
                    "ticketer": r.ticketer.name if r.ticketer else "—",
                    "ticket_type": r.ticket_type.name if r.ticket_type else "—",
                    "qty": qty,
                    "price": price,
                    "gross": g,
                })

            # Totales por día (qty y gross)
            day_aggs = (
                session_db.query(
                    TicketSaleDetail.day,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
                .filter(TicketSaleDetail.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.day)
                .order_by(TicketSaleDetail.day.asc())
                .all()
            )
            running = 0
            for d, qty, gross in day_aggs:
                qv = int(qty or 0)
                gv = float(gross or 0)
                running += qv
                chart_labels.append(d.strftime("%Y-%m-%d"))
                chart_values.append(running)
                daily_totals.append((d, qv, gv))
                total_sold += qv
                gross_total += gv

            # Por tipo
            type_aggs = (
                session_db.query(
                    ConcertTicketType.id,
                    ConcertTicketType.name,
                    ConcertTicketType.qty_for_sale,
                    ConcertTicketType.price,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(TicketSaleDetail, TicketSaleDetail.ticket_type_id == ConcertTicketType.id)
                .filter(ConcertTicketType.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .group_by(ConcertTicketType.id)
                .order_by(ConcertTicketType.created_at.asc())
                .all()
            )
            by_type = []
            for _id, n, qfs, p, sold, g in type_aggs:
                qfs_i = int(qfs or 0)
                price_f = float(p or 0)
                sold_i = int(sold or 0)
                gross_f = float(g or 0)
                pending_qty = max(0, qfs_i - sold_i) if qfs_i else 0
                pct_sold = (sold_i / qfs_i * 100.0) if qfs_i else 0.0
                potential_gross = float(qfs_i) * float(price_f)
                remaining_gross = max(0.0, potential_gross - gross_f)
                by_type.append({
                    "name": n,
                    "qty_for_sale": qfs_i,
                    "pending_qty": pending_qty,
                    "pct_sold": pct_sold,
                    "price": price_f,
                    "sold": sold_i,
                    "gross": gross_f,
                    "potential_gross": potential_gross,
                    "remaining_gross": remaining_gross,
                })

            # Por ticketer (incluye capacidad configurada por ticketera)
            tick_aggs = (
                session_db.query(
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
                .filter(TicketSaleDetail.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.ticketer_id)
                .all()
            )
            tick_map = {tid: {"sold": int(sold or 0), "gross": float(g or 0.0)} for tid, sold, g in tick_aggs}

            by_ticketer = []
            seen_ticketers = set()
            for ct in (c.ticketers or []):
                t = getattr(ct, "ticketer", None)
                tid = getattr(ct, "ticketer_id", None)
                seen_ticketers.add(tid)
                sold_i = int((tick_map.get(tid, {}) or {}).get("sold", 0) or 0)
                gross_f = float((tick_map.get(tid, {}) or {}).get("gross", 0.0) or 0.0)
                cap_i = int(getattr(ct, "capacity_for_sale", 0) or 0)
                pending_qty = max(0, cap_i - sold_i) if cap_i else 0
                pct_sold = (sold_i / cap_i * 100.0) if cap_i else 0.0
                by_ticketer.append({
                    "name": getattr(t, "name", None) or "—",
                    "capacity_for_sale": cap_i,
                    "pending_qty": pending_qty,
                    "pct_sold": pct_sold,
                    "sold": sold_i,
                    "gross": gross_f,
                })

            # Si existen ventas de ticketers que ya no estén asignadas al evento, las añadimos.
            missing = [tid for tid in tick_map.keys() if tid not in seen_ticketers]
            if missing:
                extra = session_db.query(Ticketer).filter(Ticketer.id.in_(missing)).all()
                extra_name = {t.id: t.name for t in extra}
                for tid in missing:
                    sold_i = int((tick_map.get(tid, {}) or {}).get("sold", 0) or 0)
                    gross_f = float((tick_map.get(tid, {}) or {}).get("gross", 0.0) or 0.0)
                    by_ticketer.append({
                        "name": extra_name.get(tid) or "—",
                        "capacity_for_sale": 0,
                        "pending_qty": 0,
                        "pct_sold": 0.0,
                        "sold": sold_i,
                        "gross": gross_f,
                    })

            by_ticketer.sort(key=lambda r: (r.get("name") or ""))

        else:
            # Legacy: tabla ticket_sales (solo cantidades)
            pts = (
                session_db.query(TicketSale.day, func.sum(TicketSale.sold_today))
                .filter(TicketSale.concert_id == concert_id)
                .filter(TicketSale.day <= day)
                .group_by(TicketSale.day)
                .order_by(TicketSale.day.asc())
                .all()
            )
            running = 0
            for d, qty in pts:
                qv = int(qty or 0)
                running += qv
                chart_labels.append(d.strftime("%Y-%m-%d"))
                chart_values.append(running)
                daily_totals.append((d, qv, 0.0))
                total_sold += qv

        capacity = _concert_capacity_from_ticket_types(c)
        pct = (total_sold / capacity * 100.0) if capacity else 0.0
        pending = max(0, capacity - total_sold) if capacity else 0

        # Potencial (según categorías) y desglose neto
        potential_gross_total = 0.0
        for tt in (c.ticket_types or []):
            potential_gross_total += float(getattr(tt, "price", 0) or 0) * float(getattr(tt, "qty_for_sale", 0) or 0)
        remaining_gross_total = max(0.0, potential_gross_total - gross_total)

        br = _sales_net_breakdown(gross_total, vat, sgae)
        net_total = float(br.get("net") or 0.0)
        vat_amount = float(br.get("vat_amount") or 0.0)
        sgae_amount = float(br.get("sgae_amount") or 0.0)
        base_no_vat = float(br.get("base_no_vat") or 0.0)

        return render_template(
            "sales_event_report.html",
            day=day,
            concert=c,
            has_v2=has_v2,
            vat_pct=vat,
            sgae_pct=sgae,
            capacity=capacity,
            total_sold=total_sold,
            pct=pct,
            pending=pending,
            gross_total=gross_total,
            net_total=net_total,
            vat_amount=vat_amount,
            sgae_amount=sgae_amount,
            base_no_vat=base_no_vat,
            potential_gross_total=potential_gross_total,
            remaining_gross_total=remaining_gross_total,
            chart_labels=chart_labels,
            chart_values=chart_values,
            daily_totals=daily_totals,
            daily_rows=daily_rows,
            by_type=by_type,
            by_ticketer=by_ticketer,
            pdf_url=url_for("sales_event_report_pdf", cid=cid, d=day.isoformat()),
        )
    finally:
        session_db.close()


@app.get("/ventas/informe/<cid>/pdf", endpoint="sales_event_report_pdf")
@admin_required
def sales_event_report_pdf(cid):
    show_econ = can_view_economics()
    if not REPORTLAB_AVAILABLE:
        flash("El servidor no tiene ReportLab instalado. Añade 'reportlab' a requirements.txt.", "danger")
        return redirect(request.referrer or url_for("sales_event_report_view", cid=cid))

    day = get_day("d")
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        c = (
            session_db.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.sales_config),
                selectinload(Concert.ticket_types),
            )
            .get(concert_id)
        )
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(url_for("sales_update_view", d=day.isoformat()))

        vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if c.sales_config else 0.0
        sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if c.sales_config else 0.0

        # Datos (preferimos V2)
        has_v2 = (
            session_db.query(func.count(TicketSaleDetail.id))
            .filter(TicketSaleDetail.concert_id == concert_id)
            .scalar()
            or 0
        ) > 0

        # Serie acumulada
        labels = []
        values = []
        daily_rows = []

        total_sold = 0
        gross_total = 0.0

        if has_v2:
            day_aggs = (
                session_db.query(
                    TicketSaleDetail.day,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * ConcertTicketType.price),
                )
                .join(ConcertTicketType, ConcertTicketType.id == TicketSaleDetail.ticket_type_id)
                .filter(TicketSaleDetail.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.day)
                .order_by(TicketSaleDetail.day.asc())
                .all()
            )
            running = 0
            for d, qty, gross in day_aggs:
                qv = int(qty or 0)
                gv = float(gross or 0)
                running += qv
                labels.append(d.strftime("%Y-%m-%d"))
                values.append(running)
                total_sold += qv
                gross_total += gv

            details = (
                session_db.query(TicketSaleDetail)
                .options(joinedload(TicketSaleDetail.ticketer), joinedload(TicketSaleDetail.ticket_type))
                .filter(TicketSaleDetail.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .order_by(TicketSaleDetail.day.asc())
                .all()
            )
            for r in details:
                price = float(getattr(r.ticket_type, "price", 0) or 0)
                qty = int(r.qty or 0)
                if show_econ:
                    daily_rows.append([
                        r.day.strftime("%d/%m/%Y"),
                        (r.ticketer.name if r.ticketer else "—"),
                        (r.ticket_type.name if r.ticket_type else "—"),
                        str(qty),
                        _fmt_money_eur(price),
                        _fmt_money_eur(qty * price),
                    ])
                else:
                    daily_rows.append([
                        r.day.strftime("%d/%m/%Y"),
                        (r.ticketer.name if r.ticketer else "—"),
                        (r.ticket_type.name if r.ticket_type else "—"),
                        str(qty),
                    ])
        else:
            pts = (
                session_db.query(TicketSale.day, func.sum(TicketSale.sold_today))
                .filter(TicketSale.concert_id == concert_id)
                .filter(TicketSale.day <= day)
                .group_by(TicketSale.day)
                .order_by(TicketSale.day.asc())
                .all()
            )
            running = 0
            for d, qty in pts:
                qv = int(qty or 0)
                running += qv
                labels.append(d.strftime("%Y-%m-%d"))
                values.append(running)
                total_sold += qv

        capacity = _concert_capacity_from_ticket_types(c)
        pct = (total_sold / capacity * 100.0) if capacity else 0.0
        pending = max(0, capacity - total_sold) if capacity else 0

        potential_gross_total = 0.0
        for tt in (c.ticket_types or []):
            potential_gross_total += float(getattr(tt, "price", 0) or 0) * float(getattr(tt, "qty_for_sale", 0) or 0)
        remaining_gross_total = max(0.0, potential_gross_total - gross_total)

        br = _sales_net_breakdown(gross_total, vat, sgae)
        net_total = float(br.get("net") or 0.0)
        vat_amount = float(br.get("vat_amount") or 0.0)
        sgae_amount = float(br.get("sgae_amount") or 0.0)
        base_no_vat = float(br.get("base_no_vat") or 0.0)

        # --- PDF ---
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=landscape(A4),
            leftMargin=24,
            rightMargin=24,
            topMargin=24,
            bottomMargin=24,
            title="Informe de ventas",
        )
        styles = getSampleStyleSheet()
        story = []

        title = f"Informe de ventas — {c.artist.name if c.artist else 'Evento'}"
        story.append(Paragraph(title, styles["Title"]))

        v = c.venue
        sub = f"{(v.municipality or '')} · {(v.province or '')} · {(v.name or '')} · {c.date.strftime('%d/%m/%Y') if c.date else ''}"
        story.append(Paragraph(sub, styles["Normal"]))
        story.append(Spacer(1, 10))

        summary_data = [
            ["Aforo", str(capacity)],
            ["Total vendidas", str(total_sold)],
            ["% venta", f"{pct:.1f}%"],
            ["Pendientes", str(pending)],
        ]
        if show_econ:
            summary_data += [
                ["Recaudación bruta", _fmt_money_eur(gross_total)],
                ["IVA", f"{vat:.2f}%"],
                ["Importe IVA", _fmt_money_eur(vat_amount)],
                ["Base sin IVA", _fmt_money_eur(base_no_vat)],
                ["SGAE", f"{sgae:.2f}% (sobre base sin IVA)"],
                ["Importe SGAE", _fmt_money_eur(sgae_amount)],
                ["Recaudación neta", _fmt_money_eur(net_total)],
            ]
            if potential_gross_total > 0:
                summary_data += [
                    ["Bruto potencial", _fmt_money_eur(potential_gross_total)],
                    ["Bruto pendiente", _fmt_money_eur(remaining_gross_total)],
                ]
        t = Table(summary_data, colWidths=[140, 140])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(Spacer(1, 12))

        # Mini-gráfico (línea) — ventas acumuladas
        if labels and values and len(values) >= 2:
            w, h = 520, 140
            d = Drawing(w, h)
            # ejes
            d.add(Line(40, 20, 40, h - 20, strokeColor=colors.grey, strokeWidth=1))
            d.add(Line(40, 20, w - 20, 20, strokeColor=colors.grey, strokeWidth=1))

            max_v = max(values) if values else 1
            max_v = max(max_v, 1)
            n = len(values)
            pts = []
            for i, val in enumerate(values):
                x = 40 + (i / (n - 1)) * (w - 60)
                y = 20 + (val / max_v) * (h - 40)
                pts.append((x, y))
            d.add(PolyLine(pts, strokeColor=colors.HexColor("#00779d"), strokeWidth=2))
            story.append(Paragraph("Evolución venta de entradas", styles["Heading2"]))
            story.append(d)
            story.append(Spacer(1, 12))

        # Tabla detalle (puede ir a varias páginas si hay mucho)
        if daily_rows:
            story.append(Paragraph("Detalle por día / ticketera / tipo", styles["Heading2"]))
            table_data = ([["Fecha", "Ticketera", "Tipo", "Vendidas", "Precio", "Bruto"]] if show_econ else [["Fecha", "Ticketera", "Tipo", "Vendidas"]]) + daily_rows
            tbl = Table(table_data, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f3f5")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            story.append(tbl)

        doc.build(story)
        buf.seek(0)

        filename = f"informe_ventas_{cid}_{day.strftime('%Y%m%d')}.pdf"
        return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=filename)
    finally:
        session_db.close()

# ------------- APIS GRAFICA DE VENTAS -----------

@app.get("/api/sales_json")
def api_sales_json():
    cid = to_uuid(request.args.get("concert_id"))
    session = db()
    # Preferimos V2 si existe (ticketeras)
    has_v2 = (session.query(func.count(TicketSaleDetail.id))
              .filter(TicketSaleDetail.concert_id == cid)
              .scalar() or 0) > 0

    if has_v2:
        pts = (
            session.query(TicketSaleDetail.day, func.sum(TicketSaleDetail.qty))
            .filter(TicketSaleDetail.concert_id == cid)
            .group_by(TicketSaleDetail.day)
            .order_by(TicketSaleDetail.day.asc())
            .all()
        )
    else:
        # serie diaria acumulada desde el inicio de venta (legacy)
        pts = (
            session.query(TicketSale.day, func.sum(TicketSale.sold_today))
            .filter(TicketSale.concert_id == cid)
            .group_by(TicketSale.day)
            .order_by(TicketSale.day.asc())
            .all()
        )
    # acumular
    labels, values = [], []
    running = 0
    for d, qty in pts:
        running += int(qty or 0)
        labels.append(d.strftime("%Y-%m-%d"))
        values.append(running)
    session.close()
    return jsonify({"labels": labels, "values": values})

@app.get("/api/concert_meta")
def api_concert_meta():
    cid = request.args.get("concert_id")
    session = db()
    try:
        c = session.query(Concert)\
            .options(joinedload(Concert.artist), joinedload(Concert.venue))\
            .get(to_uuid(cid))
        if not c:
            return jsonify({"error": "not found"}), 404
        return jsonify({
            "artist": {
                "name": (c.artist.name if c.artist else None),
                "photo_url": (c.artist.photo_url if c.artist else None),
            },
            "festival_name": c.festival_name,
            "venue": {
                "name": (c.venue.name if c.venue else None),
                "municipality": (c.venue.municipality if c.venue else None),
                "province": (c.venue.province if c.venue else None),
            },
            "sale_start_date": (c.sale_start_date.isoformat() if c.sale_start_date else None),
            "date": (c.date.isoformat() if c.date else None),
        })
    finally:
        session.close()

#-------------- Apis Buscador de recintos y promotores ------------

@app.get("/api/search/venues", endpoint="api_search_venues")
def api_search_venues():
    # Select2 suele mandar "term"; tu frontend quizá manda "q"
    q = (request.args.get("q") or request.args.get("term") or "").strip()

    session_db = db()
    try:
        query = session_db.query(Venue)
        if q:
            like = f"%{q}%"
            query = query.filter(
                (Venue.name.ilike(like)) |
                (Venue.municipality.ilike(like)) |
                (Venue.province.ilike(like))
            )

        venues = query.order_by(Venue.name.asc()).limit(20).all()

        out = []
        for v in venues:
            name = (v.name or "").strip()
            mun = (v.municipality or "").strip()
            prov = (v.province or "").strip()

            # texto estándar que usará Select2
            text_label = f"{name} — {mun} ({prov})".strip()
            # arreglos por si faltan cosas
            if not mun and not prov:
                text_label = name
            elif mun and not prov:
                text_label = f"{name} — {mun}"
            elif not mun and prov:
                text_label = f"{name} ({prov})"

            out.append({
                "id": str(v.id),
                "name": name,
                "municipality": mun,
                "province": prov,
                "label": text_label,  # compatibilidad
                "text": text_label,   # ✅ CLAVE para Select2
            })

        return jsonify(out)

    finally:
        session_db.close()



@app.get("/api/search/promoters", endpoint="api_search_promoters")
def api_search_promoters():
    q = (request.args.get("q") or "").strip()
    session = db()
    try:
        query = session.query(Promoter)
        if q:
            like = f"%{q}%"
            query = query.filter(Promoter.nick.ilike(like))
        promoters = query.order_by(Promoter.nick.asc()).limit(20).all()
        return jsonify([
            {"id": str(p.id), "label": p.nick} for p in promoters
        ])
    finally:
        session.close()

# =========================
# CUADRANTES
# =========================

MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]
DOW_ES = ["L", "M", "X", "J", "V", "S", "D"]  # lunes..domingo


def _build_year_calendar(year: int):
    """Estructura de 12 meses con semanas (monthdayscalendar)."""
    cal = _cal.Calendar(firstweekday=0)  # 0 = lunes
    months = []
    for m in range(1, 13):
        months.append({
            "num": m,
            "name": MONTHS_ES[m - 1],
            "weeks": cal.monthdayscalendar(year, m),  # list[list[int]] con 0 para padding
        })
    return months


def _table_exists(session_db, full_name: str) -> bool:
    """
    full_name ejemplo: 'public.concert_caches'
    """
    try:
        r = session_db.execute(text("select to_regclass(:t)"), {"t": full_name}).scalar()
        return r is not None
    except Exception:
        return False


def _cache_summary(cache_rows: list) -> str:
    """
    Devuelve un resumen cortito de cachés para el cuadrante.
    Si no hay tabla cachés o no hay datos: '—'
    """
    if not cache_rows:
        return "—"

    parts = []
    for r in cache_rows:
        # amount
        if getattr(r, "amount", None) not in (None, ""):
            try:
                parts.append(f"{float(r.amount):g}€")
            except Exception:
                parts.append(f"{r.amount}€")
            continue

        # pct
        if getattr(r, "pct", None) not in (None, ""):
            try:
                parts.append(f"{float(r.pct):g}%")
            except Exception:
                parts.append(f"{r.pct}%")
            continue

        # concept / kind
        if getattr(r, "concept", None):
            parts.append(str(r.concept))
        elif getattr(r, "kind", None):
            parts.append(str(r.kind))

    if not parts:
        return "—"

    if len(parts) > 3:
        return " + ".join(parts[:3]) + f" (+{len(parts) - 3})"
    return " + ".join(parts)


def _promoter_display(concert: Concert):
    """
    Promotora(logo) en cuadrantes:
    - si hay promoter -> ese
    - si no, si hay group_company -> esa
    """
    if getattr(concert, "promoter", None):
        return (
            getattr(concert.promoter, "logo_url", None),
            getattr(concert.promoter, "nick", None),
        )
    if getattr(concert, "group_company", None):
        return (
            getattr(concert.group_company, "logo_url", None),
            getattr(concert.group_company, "name", None),
        )
    return (None, None)


@app.get("/api/geocode")
@admin_required
def api_geocode():
    """
    Geocoding server-side (Nominatim) para evitar CORS en el navegador.
    Devuelve lat/lng aproximados para (city, province).
    """
    city = (request.args.get("city") or "").strip()
    province = (request.args.get("province") or "").strip()

    if not city:
        return jsonify({"ok": False, "error": "city is required"}), 400

    q = f"{city}, {province}, España" if province else f"{city}, España"
    url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + quote_plus(q)

    try:
        req = Request(url, headers={
            "User-Agent": "radio-spins-app/1.0 (cuadrantes)"
        })
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if not data:
            return jsonify({"ok": False, "error": "not found"}), 404

        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
        return jsonify({"ok": True, "lat": lat, "lng": lng})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/cuadrantes", endpoint="quadrantes_view")
@admin_required
def quadrantes_view():
    """
    Vista Cuadrantes:
      - selector múltiple de artistas
      - calendario anual con días marcados por número de evento
      - mapa con chinchetas (número) geocodificando ciudades de recintos
      - resumen agrupado por artista (numeración reinicia por artista)
      - filtro de estado
      - control de contenido (mostrar/ocultar campos) y exportación por impresión
      - exportable a PDF via window.print()
    """
    session_db = db()
    try:
        # 1) Artistas para selector
        artists = session_db.query(Artist).order_by(Artist.name.asc()).all()

        # 2) Selección
        raw_ids = request.args.getlist("artist_id")  # ?artist_id=...&artist_id=...
        selected_uuids = []
        for rid in raw_ids:
            try:
                u = to_uuid(rid)
                if u:
                    selected_uuids.append(u)
            except Exception:
                pass

        # 3) Año
        try:
            year = int(request.args.get("year") or today_local().year)
        except Exception:
            year = today_local().year

        # años disponibles (selector)
        years_rows = (
            session_db.query(func.extract("year", Concert.date))
            .distinct()
            .order_by(func.extract("year", Concert.date))
            .all()
        )
        year_options = sorted({int(r[0]) for r in years_rows if r and r[0] is not None})
        if not year_options:
            year_options = [today_local().year]

        # 4) Calendario anual
        months = _build_year_calendar(year)

        # 5) Filtros (estado + tipo)
        allowed_status = {"HABLADO", "RESERVADO", "CONFIRMADO"}
        f_statuses = [s for s in request.args.getlist("status") if s in allowed_status]
        if not f_statuses:
            f_statuses = ["HABLADO", "RESERVADO", "CONFIRMADO"]

        allowed_types = CONCERT_SALE_TYPES_ALL_SET
        f_sale_types_raw = request.args.getlist("type") or []
        f_sale_types = [(t or "").strip().upper() for t in f_sale_types_raw if (t or "").strip()]
        f_sale_types = [t for t in f_sale_types if t in allowed_types]
        # Por defecto: todos los tipos.
        if not f_sale_types:
            f_sale_types = list(CONCERT_SALE_TYPES_ALL)

        # 6) Contenido (mostrar/ocultar). Para permitir desmarcar, usamos
        #    checkbox + input hidden (0/1) y leemos con getlist.
        def _flag(name: str, default: bool = True) -> bool:
            vals = request.args.getlist(name)
            if not vals:
                return default
            return "1" in vals or "true" in vals or "on" in vals

        show_calendar = _flag("show_calendar", True)
        show_map = _flag("show_map", True)

        show_date = _flag("show_date", True)
        show_festival = _flag("show_festival", True)
        show_sale_type = _flag("show_sale_type", True)
        show_status = _flag("show_status", True)
        show_province = _flag("show_province", True)
        show_municipality = _flag("show_municipality", True)
        show_venue = _flag("show_venue", True)
        show_capacity = _flag("show_capacity", True)
        show_cache = _flag("show_cache", True)
        show_equipment = _flag("show_equipment", True)
        show_promoter = _flag("show_promoter", True)

        selected_artists = []
        events_by_artist = []   # lista derecha, agrupada
        events_flat = []        # para JS (mapa)
        marks_by_date = {}      # YYYY-MM-DD -> list[{n,status,artist_color,...}]

        if selected_uuids:
            selected_artists = (
                session_db.query(Artist)
                .filter(Artist.id.in_(selected_uuids))
                .order_by(Artist.name.asc())
                .all()
            )

            concerts = (
                session_db.query(Concert)
                .options(
                    joinedload(Concert.artist),
                    joinedload(Concert.venue),
                    joinedload(Concert.promoter),
                    joinedload(Concert.group_company),
                )
                .filter(Concert.artist_id.in_(selected_uuids))
                .filter(func.extract("year", Concert.date) == year)
                .filter(Concert.sale_type.in_(f_sale_types))
                .order_by(Concert.date.asc())
                .all()
            )

            concert_ids = [c.id for c in concerts]

            # cachés (si existe tabla)
            caches_map = {}
            if concert_ids and _table_exists(session_db, "public.concert_caches"):
                try:
                    cache_rows = (
                        session_db.query(ConcertCache)
                        .filter(ConcertCache.concert_id.in_(concert_ids))
                        .all()
                    )
                    for r in cache_rows:
                        caches_map.setdefault(r.concert_id, []).append(r)
                except Exception:
                    caches_map = {}

            # Paleta de colores para diferenciar artistas (borde). Se usa en mapa+calendario
            # cuando hay más de un artista seleccionado.
            palette = [
                "#0d6efd",  # bootstrap primary
                "#198754",  # success
                "#6f42c1",  # purple
                "#fd7e14",  # orange
                "#d63384",  # pink
                "#20c997",  # teal
                "#0dcaf0",  # cyan
                "#dc3545",  # danger
            ]
            artist_color = {str(a.id): palette[i % len(palette)] for i, a in enumerate(selected_artists)}

            # Equipamiento (para filtro y para mostrar en resumen)
            equip_ids = set()
            try:
                if concert_ids and _table_exists(session_db, "public.concert_equipments"):
                    rows = (
                        session_db.query(ConcertEquipment.concert_id)
                        .filter(ConcertEquipment.concert_id.in_(concert_ids))
                        .all()
                    )
                    equip_ids.update({r[0] for r in rows if r and r[0]})
                if concert_ids and _table_exists(session_db, "public.concert_equipment_documents"):
                    rows = (
                        session_db.query(ConcertEquipmentDocument.concert_id)
                        .filter(ConcertEquipmentDocument.concert_id.in_(concert_ids))
                        .all()
                    )
                    equip_ids.update({r[0] for r in rows if r and r[0]})
                if concert_ids and _table_exists(session_db, "public.concert_equipment_notes"):
                    rows = (
                        session_db.query(ConcertEquipmentNote.concert_id)
                        .filter(ConcertEquipmentNote.concert_id.in_(concert_ids))
                        .all()
                    )
                    equip_ids.update({r[0] for r in rows if r and r[0]})
            except Exception:
                equip_ids = set()

            # 1) Construimos eventos por artista aplicando filtros (sin numeración todavía)
            per_artist = {str(a.id): [] for a in selected_artists}

            for c in concerts:
                st = (c.status or "HABLADO")
                if st not in f_statuses:
                    continue

                has_cache = bool(caches_map.get(c.id))
                has_equip = (c.id in equip_ids)

                cap = int(c.capacity or 0)

                dstr = c.date.isoformat()
                v = c.venue
                cache_txt = _cache_summary(caches_map.get(c.id, []))
                pro_logo, pro_name = _promoter_display(c)

                aid = str(c.artist_id) if c.artist_id else ""
                if not aid:
                    continue

                per_artist.setdefault(aid, []).append({
                    "concert_id": str(c.id),
                    "date": dstr,
                    "date_es": c.date.strftime("%d/%m/%Y"),
                    "artist_id": aid,
                    "artist_name": c.artist.name if c.artist else "",
                    "artist_photo": c.artist.photo_url if c.artist else "",
                    "artist_color": artist_color.get(aid, "#0d6efd"),
                    "festival_name": (c.festival_name or ""),
                    "sale_type": (c.sale_type or ""),
                    "status": st,
                    "province": (v.province or "") if v else "",
                    "municipality": (v.municipality or "") if v else "",
                    "venue_name": (v.name or "") if v else "",
                    "capacity": cap,
                    "cache": cache_txt,
                    "has_cache": has_cache,
                    "has_equipment": has_equip,
                    "promoter_name": pro_name or "",
                    "promoter_logo": pro_logo or "",
                })

            # 2) Numeración por artista + marks + lista agrupada
            for a in selected_artists:
                aid = str(a.id)
                evs = sorted(per_artist.get(aid, []), key=lambda x: x.get("date") or "")
                for i, e in enumerate(evs, start=1):
                    e["n"] = i
                    events_flat.append(e)

                    marks_by_date.setdefault(e["date"], []).append({
                        "n": i,
                        "status": e.get("status") or "HABLADO",
                        "artist_id": aid,
                        "artist_name": e.get("artist_name") or a.name,
                        "artist_color": e.get("artist_color") or artist_color.get(aid, "#0d6efd"),
                        "title": f"{e.get('artist_name') or a.name} · {e.get('venue_name') or ''} · {e.get('municipality') or ''} · {e.get('date_es') or ''}",
                    })

                events_by_artist.append({
                    "artist_id": aid,
                    "artist_name": a.name,
                    "artist_photo": a.photo_url or "",
                    "artist_color": artist_color.get(aid, "#0d6efd"),
                    "events": evs,
                })

        return render_template(
            "cuadrantes.html",
            artists=artists,
            selected_artist_ids=[str(u) for u in selected_uuids],
            selected_artists=selected_artists,
            year=year,
            year_options=year_options,
            months=months,
            dow=DOW_ES,
            marks_by_date=marks_by_date,
            events_by_artist=events_by_artist,
            events=events_flat,

            # filtros (para mantener UI)
            f_statuses=f_statuses,
            f_sale_types=f_sale_types,
            # (el resto de filtros se eliminan de esta pantalla)

            # contenido
            show_calendar=show_calendar,
            show_map=show_map,
            show_date=show_date,
            show_festival=show_festival,
            show_sale_type=show_sale_type,
            show_status=show_status,
            show_province=show_province,
            show_municipality=show_municipality,
            show_venue=show_venue,
            show_capacity=show_capacity,
            show_cache=show_cache,
            show_equipment=show_equipment,
            show_promoter=show_promoter,
        )

    finally:
        session_db.close()

if __name__ == "__main__":
    init_db()
    app.run(debug=True)