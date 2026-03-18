from datetime import date, timedelta, datetime
import os
import smtplib
from uuid import UUID
import uuid as _uuid
import uuid
import json
import csv
import unicodedata
from pathlib import Path
from io import BytesIO
from functools import wraps
from contextlib import contextmanager
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
    Response,
)
from sqlalchemy import func, text, or_, and_

from werkzeug.security import check_password_hash, generate_password_hash
import calendar as _cal
from urllib.parse import quote_plus, urlsplit, urlunsplit, parse_qsl, parse_qs, urlencode
from urllib.request import Request, urlopen
from decimal import Decimal, InvalidOperation
from email.message import EmailMessage
from difflib import SequenceMatcher
from collections import defaultdict

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
    ensure_editorial_schema,
    ensure_ingresos_schema,
    ensure_royalty_liquidations_schema,
    ensure_concerts_schema_enhancements,
    ensure_third_party_and_contract_sheet_schema,
    ensure_concert_artwork_schema,
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
    PromoterCompany,
    PromoterContact,
    SongRoyaltyBeneficiary,
    PublishingCompany,
    SongEditorialShare,
    SongRevenueEntry,
    RoyaltyLiquidation,
    Venue,
    Concert,
    TicketSale,
    GroupCompany,
    ConcertPromoterShare,
    ConcertCompanyShare,
    ConcertZoneAgent,
    ConcertCache,
    ConcertContract,
    ConcertContractSheet,
    ConcertArtworkRequest,
    ConcertArtworkAsset,
    ConcertNote,
    ConcertEquipment,
    ConcertEquipmentDocument,
    ConcertEquipmentNote,
    # Ventas v2 (ticketeras)
    Ticketer,
    ConcertSalesConfig,
    ConcertTicketType,
    ConcertTicketer,
    ConcertTicketerTicketType,
    TicketSaleDetail,
)
from supabase_utils import upload_png, upload_pdf, upload_image
app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

# Asegurar esquema mínimo en producción (Render/gunicorn no ejecuta __main__)
# IMPORTANTE: esto debe ser "best-effort" para no romper el arranque si la BBDD
# está ocupada (locks) o tiene `statement_timeout` bajo.
def _safe_ensure(fn, name: str):
    try:
        fn()
    except Exception as e:
        # No interrumpir el arranque por DDL idempotente.
        print(f"[schema] Aviso: no se pudo ejecutar {name}: {e}")

for _fn, _name in [
    (ensure_artist_feature_schema, "ensure_artist_feature_schema"),
    (ensure_discografica_schema, "ensure_discografica_schema"),
    (ensure_isrc_and_song_detail_schema, "ensure_isrc_and_song_detail_schema"),
    (ensure_song_royalties_schema, "ensure_song_royalties_schema"),
    (ensure_editorial_schema, "ensure_editorial_schema"),
    (ensure_ingresos_schema, "ensure_ingresos_schema"),
    (ensure_royalty_liquidations_schema, "ensure_royalty_liquidations_schema"),
    (ensure_concerts_schema_enhancements, "ensure_concerts_schema_enhancements"),
    (ensure_third_party_and_contract_sheet_schema, "ensure_third_party_and_contract_sheet_schema"),
    (ensure_concert_artwork_schema, "ensure_concert_artwork_schema"),
]:
    _safe_ensure(_fn, _name)


CONCERT_SALE_TYPE_LABELS = {
    "EMPRESA": "Conciertos — Empresa",
    "GRATUITO": "Conciertos — Gratuitos",
    "GIRAS_COMPRADAS": "Giras compradas",
    "PARTICIPADOS": "Conciertos — Participados",
    "CADIZ": "Cádiz Music Stadium",
    "VENDIDO": "Conciertos — Vendidos",
}

SALES_SECTION_ORDER = ["EMPRESA", "GIRAS_COMPRADAS", "PARTICIPADOS", "CADIZ", "VENDIDO"]
SALES_SECTION_TITLE = {k: CONCERT_SALE_TYPE_LABELS[k] for k in SALES_SECTION_ORDER}

# Tipos de concierto disponibles en la app.
# NOTA: "GRATUITO" NO debe aparecer en actualización/reporte de ventas.
CONCERT_SALE_TYPES_ALL = ["EMPRESA", "GRATUITO", "GIRAS_COMPRADAS", "PARTICIPADOS", "CADIZ", "VENDIDO"]
CONCERT_SALE_TYPES_ALL_SET = set(CONCERT_SALE_TYPES_ALL)

# Secciones SOLO para la pantalla de Conciertos (incluye gratuitos).
CONCERTS_SECTION_ORDER = list(CONCERT_SALE_TYPES_ALL)
CONCERTS_SECTION_TITLE = {k: CONCERT_SALE_TYPE_LABELS[k] for k in CONCERTS_SECTION_ORDER}

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


@contextmanager
def get_db():
    """Context manager para sesiones de base de datos (SessionLocal).

    Evita duplicar try/finally de close().
    """
    session_db = db()
    try:
        yield session_db
    finally:
        try:
            session_db.close()
        except Exception:
            pass


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


def parse_optional_date(value: str | None):
    raw = (value or "").strip()
    if not raw:
        return None
    return parse_date(raw)


def parse_concert_sale_start_date(value: str | None, sale_type: str) -> date | None:
    raw = (value or "").strip()
    if raw:
        return parse_date(raw)
    if (sale_type or "").strip().upper() == "GRATUITO":
        return None
    raise ValueError("La fecha de salida a la venta es obligatoria salvo en conciertos gratuitos.")


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
    allowed = {"landing", "admin_login", "concert_contract_public_form", "concert_artwork_public_upload"}
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
    1: "Acceso lectura",
    2: "Radios + discográfica",
    3: "Ventas",
    4: "Lectura total",
    5: "Conciertos + Catálogos",
    6: "Conciertos + Catálogos",
    10: "Master",
}

ROLE_WELCOME = {
    1: "Bienvenido. Estás en modo lectura y sin permisos de edición.",
    2: "Bienvenido. Puedes editar tocadas de radio y discográfica.",
    3: "Bienvenido. Puedes editar ventas y ver la parte económica. Radios en modo lectura.",
    4: "Bienvenido. Puedes ver toda la información en modo lectura.",
    5: "Bienvenido. Puedes editar conciertos y bases de datos (artistas/recintos/proveedores). Ventas y Radios en modo lectura.",
    6: "Bienvenido. Puedes editar conciertos y bases de datos (artistas/recintos/proveedores). Ventas y Radios en modo lectura.",
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


def can_edit_discografica() -> bool:
    """Roles que pueden modificar Discográfica (fichas, ISRC, ingresos, royalties...).

    Nota: rol 2 debe poder editar discográfica sin ampliar permisos al resto de catálogos.
    """
    return current_role() in (2, 5, 6, 10)


def can_edit_artists_stations() -> bool:
    """Permiso específico: artistas + emisoras.

    Petición del cliente: los usuarios de rango 2 deben poder añadir/editar
    artistas y emisoras, sin ampliar permisos al resto de catálogos.
    """
    return current_role() in (2, 5, 6, 10)

def can_edit_sales() -> bool:
    return current_role() in (3, 10)

def can_view_sales_report() -> bool:
    """Permiso para generar/ver reportes de ventas.

    En la app hay dos pantallas relacionadas:
    - /ventas (actualizar ventas) -> requiere can_edit_sales()
    - /ventas/reporte (reporte) -> visible para más roles pero sin economía según permisos

    Este helper lo usamos para endpoints de informe/pdfs relacionados con ventas.
    """
    return can_edit_sales() or is_master()


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
        if path.startswith(("/canciones", "/promotores", "/recintos", "/ticketeras", "/empresas", "/editoriales")):
            if not (is_master() or can_edit_catalogs()):
                return forbid("Tu usuario no tiene permisos para modificar bases de datos en esta sección.")
            return

        # Discográfica (ficha de canción, ISRC, etc.)
        if path.startswith("/discografica"):
            if not (is_master() or can_edit_discografica()):
                return forbid("Tu usuario no tiene permisos para modificar datos en Discográfica.")
            return

        # Endpoints /api usados por modales (crear tercero/recinto/ticketera/artista, etc.)
        # NOTA: los GET no entran aquí (solo bloqueamos escrituras).
        if path.startswith("/api/"):
            if path.startswith("/api/artists"):
                if not (is_master() or can_edit_artists_stations() or can_edit_catalogs()):
                    return forbid("Tu usuario no tiene permisos para modificar artistas.")
                return

            if path.startswith("/api/promoters"):
                if not (is_master() or can_edit_catalogs() or can_edit_concerts() or can_edit_discografica()):
                    return forbid("Tu usuario no tiene permisos para modificar terceros.")
                return

            if path.startswith("/api/publishing_companies"):
                if not (is_master() or can_edit_catalogs() or can_edit_discografica()):
                    return forbid("Tu usuario no tiene permisos para modificar editoriales.")
                return

            if path.startswith(("/api/venues", "/api/ticketers", "/api/companies")):
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
    
@app.template_filter("isrc")
def format_isrc_filter(value):
    return _norm_isrc(value) if value not in (None, "") else "—"


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
        CAN_EDIT_SONGS_PROMOTERS=(can_edit_catalogs() or can_edit_discografica()),
        CAN_EDIT_DISCOGRAFICA=can_edit_discografica(),
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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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

        contract_commitments_payload = []
        for contract in contracts:
            for commitment in getattr(contract, "commitments", []) or []:
                contract_commitments_payload.append({
                    "id": str(commitment.id),
                    "concept": getattr(commitment, "concept", "") or "",
                    "pct_artist": str(getattr(commitment, "pct_artist", 0) or 0),
                    "pct_office": str(getattr(commitment, "pct_office", 0) or 0),
                    "base": getattr(commitment, "base", None) or "GROSS",
                    "profit_scope": getattr(commitment, "profit_scope", None) or "CONCEPT_ONLY",
                    "material_scope": getattr(commitment, "material_scope", None) or "ALL_MATERIALS",
                })

        # Conciertos del artista (solo lectura) + filtros
        f_statuses_raw = request.args.getlist("status") or []
        f_when_raw = request.args.getlist("when") or []

        f_statuses = [(x or "").strip().upper() for x in f_statuses_raw if (x or "").strip()]
        allowed_statuses = {"BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO"}
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
            contract_commitments_payload=contract_commitments_payload,
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


def _norm_material_scope(v: str | None) -> str:
    v = (v or "").strip().upper()
    return v if v in ("ALL_MATERIALS", "ONLY_NEW_MATERIALS") else "ALL_MATERIALS"


def _norm_concert_tag(v: str | None) -> str:
    raw = (v or "").strip()
    raw = raw.lstrip('#').strip()
    raw = " ".join(raw.split())
    return raw


def _dedupe_concert_tags(values) -> list[str]:
    out = []
    seen = set()
    for raw in (values or []):
        tag = _norm_concert_tag(raw)
        key = _norm_text_key(tag)
        if not tag or not key or key in seen:
            continue
        seen.add(key)
        out.append(tag)
    return out


def _concert_tags(concert: Concert | None) -> list[str]:
    if not concert:
        return []
    raw = getattr(concert, "hashtags", None)
    if not raw:
        return []
    if isinstance(raw, list):
        return _dedupe_concert_tags(raw)
    if isinstance(raw, str):
        return _dedupe_concert_tags([x for x in raw.split(',') if x])
    return []


def _concert_tags_display(concert: Concert | None) -> list[str]:
    return [f"#{tag}" for tag in _concert_tags(concert)]


def _concert_matches_any_tag(concert: Concert | None, tags: list[str] | None) -> bool:
    selected = {_norm_text_key(_norm_concert_tag(x)) for x in (tags or []) if _norm_concert_tag(x)}
    if not selected:
        return True
    own = {_norm_text_key(x) for x in _concert_tags(concert)}
    return bool(selected & own)


def _collect_all_concert_tags(session_db) -> list[str]:
    values = []
    try:
        rows = session_db.query(Concert.hashtags).all()
    except Exception:
        rows = []
    for (raw,) in rows:
        if isinstance(raw, list):
            values.extend(raw)
        elif isinstance(raw, str):
            values.extend([x for x in raw.split(',') if x])
    return sorted(_dedupe_concert_tags(values), key=lambda x: _norm_text_key(x))


def _truthy(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val or '').strip().lower() in ('1', 'true', 'yes', 'on', 'si', 'sí')


def _similarity_score(a: str | None, b: str | None) -> float:
    ak = _norm_text_key(a or '')
    bk = _norm_text_key(b or '')
    if not ak or not bk:
        return 0.0
    if ak == bk:
        return 1.0
    if ak in bk or bk in ak:
        return 0.92
    return SequenceMatcher(None, ak, bk).ratio()


def _concert_city(concert: Concert | None) -> str:
    if not concert:
        return ''
    if getattr(concert, 'venue', None) and getattr(concert.venue, 'municipality', None):
        return (concert.venue.municipality or '').strip()
    return (getattr(concert, 'manual_municipality', None) or '').strip()


def _concert_province_value(concert: Concert | None) -> str:
    if not concert:
        return ''
    if getattr(concert, 'venue', None) and getattr(concert.venue, 'province', None):
        return (concert.venue.province or '').strip()
    return (getattr(concert, 'manual_province', None) or '').strip()


def _concert_venue_name(concert: Concert | None) -> str:
    if not concert:
        return ''
    if getattr(concert, 'venue', None) and getattr(concert.venue, 'name', None):
        return (concert.venue.name or '').strip()
    return (getattr(concert, 'manual_venue_name', None) or '').strip()


def _concert_venue_address(concert: Concert | None) -> str:
    if not concert:
        return ''
    if getattr(concert, 'venue', None) and getattr(concert.venue, 'address', None):
        return (concert.venue.address or '').strip()
    return (getattr(concert, 'manual_venue_address', None) or '').strip()


def _concert_location_summary(concert: Concert | None) -> str:
    parts = [x for x in [_concert_venue_name(concert), _concert_city(concert), _concert_province_value(concert)] if x]
    return ' · '.join(parts)


def _announcement_state(concert: Concert | None, today: date | None = None) -> str:
    if not concert:
        return 'NONE'
    today = today or today_local()
    if _truthy(getattr(concert, 'do_not_announce', False)):
        return 'NO_ANNOUNCE'
    ad = getattr(concert, 'announcement_date', None)
    if not ad:
        return 'NONE'
    return 'ANNOUNCED' if ad <= today else 'UPCOMING'


def _announcement_badge(concert: Concert | None, today: date | None = None):
    state = _announcement_state(concert, today)
    ad = getattr(concert, 'announcement_date', None) if concert else None
    if state == 'NO_ANNOUNCE':
        return {'state': state, 'label': 'No anunciar', 'class': 'bg-danger'}
    if state == 'UPCOMING' and ad:
        return {'state': state, 'label': f'Anunciar: {ad.strftime("%d/%m/%Y")}', 'class': 'bg-warning text-dark'}
    return None


def _contract_sheet_status(sheet: ConcertContractSheet | None) -> str:
    if not sheet:
        return 'NONE'
    return (sheet.status or 'REQUESTED').strip().upper() or 'REQUESTED'


def _contract_sheet_can_submit(sheet: ConcertContractSheet | None) -> bool:
    if not sheet:
        return False
    st = _contract_sheet_status(sheet)
    if st in ('ACCEPTED',):
        return False
    if st == 'REJECTED':
        return bool(getattr(sheet, 'allow_resubmission', False))
    if st == 'RECEIVED':
        return False
    return True


def _contract_sheet_badge(sheet: ConcertContractSheet | None):
    st = _contract_sheet_status(sheet)
    if st == 'RECEIVED':
        return {'label': 'Ficha de contratación recibida', 'class': 'bg-info text-dark'}
    if st == 'REJECTED':
        return {'label': 'Ficha rechazada', 'class': 'bg-danger'}
    if st == 'ACCEPTED':
        return {'label': 'Ficha aceptada', 'class': 'bg-success'}
    if st == 'REQUESTED':
        return {'label': 'Ficha solicitada', 'class': 'bg-secondary'}
    return None


def _serialize_promoter_company(row: PromoterCompany | None) -> dict:
    if not row:
        return {}
    return {
        'id': str(row.id),
        'legal_name': (row.legal_name or '').strip(),
        'tax_id': (row.tax_id or '').strip(),
        'fiscal_address': (row.fiscal_address or '').strip(),
    }


def _serialize_promoter_contact(row: PromoterContact | None) -> dict:
    if not row:
        return {}
    return {
        'id': str(row.id),
        'title': (row.title or '').strip(),
        'first_name': (row.first_name or '').strip(),
        'last_name': (row.last_name or '').strip(),
        'email': (row.email or '').strip(),
        'phone': (row.phone or '').strip(),
        'mobile': (row.mobile or '').strip(),
    }


def _contact_display_name(contact: PromoterContact | None) -> str:
    if not contact:
        return ''
    return ' '.join([x for x in [(contact.first_name or '').strip(), (contact.last_name or '').strip()] if x]).strip()


def _contact_share_text(contact: PromoterContact | None, promoter: Promoter | None = None) -> str:
    if not contact:
        return ''
    lines = []
    if promoter and getattr(promoter, 'nick', None):
        lines.append(f'Tercero: {promoter.nick}')
    if getattr(contact, 'title', None):
        lines.append(f'Título: {contact.title}')
    name = _contact_display_name(contact)
    if name:
        lines.append(f'Contacto: {name}')
    if getattr(contact, 'email', None):
        lines.append(f'Email: {contact.email}')
    if getattr(contact, 'phone', None):
        lines.append(f'Teléfono fijo: {contact.phone}')
    if getattr(contact, 'mobile', None):
        lines.append(f'Teléfono móvil: {contact.mobile}')
    return '\n'.join(lines)


def _smtp_enabled() -> bool:
    return bool((os.getenv('SMTP_HOST') or '').strip())


def _send_optional_email(to_email: str, subject: str, html_body: str, text_body: str | None = None) -> tuple[bool, str | None]:
    to_email = (to_email or '').strip()
    if not to_email:
        return False, 'No se indicó email destino.'
    host = (os.getenv('SMTP_HOST') or '').strip()
    if not host:
        return False, 'SMTP_HOST no configurado.'

    port = int((os.getenv('SMTP_PORT') or '587').strip() or '587')
    username = (os.getenv('SMTP_USERNAME') or '').strip()
    password = (os.getenv('SMTP_PASSWORD') or '').strip()
    sender = (os.getenv('SMTP_FROM_EMAIL') or username or '').strip()
    sender_name = (os.getenv('SMTP_FROM_NAME') or 'Radio Spins App').strip()
    use_ssl = _truthy(os.getenv('SMTP_SSL'))
    use_tls = not use_ssl if os.getenv('SMTP_TLS') is None else _truthy(os.getenv('SMTP_TLS'))

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f'{sender_name} <{sender}>' if sender else sender_name
    msg['To'] = to_email
    msg.set_content(text_body or 'Este mensaje contiene una versión HTML del contenido.')
    msg.add_alternative(html_body, subtype='html')

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
                if username:
                    smtp.login(username, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                if use_tls:
                    smtp.starttls()
                if username:
                    smtp.login(username, password)
                smtp.send_message(msg)
        return True, None
    except Exception as exc:
        return False, str(exc)


def _external_url_for(endpoint: str, **values) -> str:
    base = request.url_root.rstrip('/')
    return base + url_for(endpoint, **values)


def _parse_uuid_list(values) -> list[str]:
    out = []
    seen = set()
    for raw in values or []:
        raw = (raw or '').strip()
        if not raw:
            continue
        try:
            val = str(to_uuid(raw))
        except Exception:
            continue
        if val in seen:
            continue
        seen.add(val)
        out.append(val)
    return out


def _upload_artwork_file(file_storage):
    if not file_storage or not getattr(file_storage, 'filename', ''):
        return None, None
    fname = (file_storage.filename or '').lower().strip()
    if fname.endswith('.pdf'):
        return upload_pdf(file_storage, 'concert_artwork'), 'application/pdf'
    return upload_image(file_storage, 'concert_artwork'), (getattr(file_storage, 'mimetype', '') or '').strip() or None


def _concert_artwork_snapshot(concert: Concert | None) -> dict:
    if not concert:
        return {}
    return {
        'date': concert.date.isoformat() if getattr(concert, 'date', None) else '',
        'venue': _concert_venue_name(concert),
        'municipality': _concert_city(concert),
        'province': _concert_province_value(concert),
        'show_time': '' if getattr(concert, 'show_time_tbc', False) else ((getattr(concert, 'show_time', None) or '').strip()),
        'doors_time': '' if getattr(concert, 'doors_time_tbc', False) else ((getattr(concert, 'doors_time', None) or '').strip()),
    }


def _artwork_request_status(row: ConcertArtworkRequest | None) -> str:
    if not row:
        return 'NONE'
    return (getattr(row, 'status', None) or 'DRAFT').strip().upper() or 'DRAFT'


def _artwork_request_has_event_changes(row: ConcertArtworkRequest | None, concert: Concert | None) -> bool:
    if not row or not concert:
        return False
    if (getattr(row, 'handled_by', None) or 'OURS').strip().upper() != 'OURS':
        return False
    baseline = dict(getattr(row, 'event_snapshot', None) or {})
    if not baseline:
        return False
    current = _concert_artwork_snapshot(concert)
    keys = ('date', 'venue', 'municipality', 'province', 'show_time', 'doors_time')
    for key in keys:
        if str((baseline.get(key) or '')).strip() != str((current.get(key) or '')).strip():
            return True
    return False


def _sync_artwork_request_refresh_flag(concert: Concert | None) -> bool:
    if not concert or not getattr(concert, 'artwork_request', None):
        return False
    changed = _artwork_request_has_event_changes(concert.artwork_request, concert)
    concert.artwork_request.needs_refresh = bool(changed)
    return changed


def _artwork_request_badge(row: ConcertArtworkRequest | None, concert: Concert | None = None):
    st = _artwork_request_status(row)
    if st == 'PROMOTER':
        return {'label': 'Cartelería promotor', 'class': 'bg-secondary'}
    if st == 'REQUESTED':
        return {'label': 'Carteles solicitados', 'class': 'bg-warning text-dark'}
    if st == 'UPLOADED':
        return {'label': 'Carteles subidos', 'class': 'bg-success'}
    if st == 'DRAFT':
        return {'label': 'Solicitud de carteles pendiente', 'class': 'bg-light text-dark border'}
    return None


def _payment_term_status(row: dict | None) -> str:
    row = row or {}
    if row.get('collected_at') or _truthy(row.get('is_collected')):
        return 'COLLECTED'
    if row.get('invoice_url') or row.get('invoiced_at') or _truthy(row.get('is_invoiced')):
        return 'PENDING_COLLECTION'
    return 'PENDING_INVOICE'


def _payment_term_badge(row: dict | None):
    st = _payment_term_status(row)
    if st == 'PENDING_COLLECTION':
        return {'label': 'Pendiente de cobrar', 'class': 'bg-primary'}
    if st == 'COLLECTED':
        return {'label': 'Cobrado', 'class': 'bg-success'}
    return {'label': 'Pendiente de facturar', 'class': 'bg-warning text-dark'}


def _normalize_payment_term(row: dict | None, idx: int = 0) -> dict:
    data = dict(row or {})
    amount = 0.0
    try:
        amount = float(data.get('amount') or 0)
    except Exception:
        amount = 0.0
    due_date = (data.get('due_date') or '').strip() if isinstance(data.get('due_date'), str) else data.get('due_date')
    badge = _payment_term_badge(data)
    status = _payment_term_status(data)
    return {
        'idx': idx,
        'concept': (data.get('concept') or 'Pago').strip() if isinstance(data.get('concept'), str) else 'Pago',
        'amount': amount,
        'due_date': due_date or None,
        'cache_ref': data.get('cache_ref'),
        'invoice_url': data.get('invoice_url'),
        'invoice_name': data.get('invoice_name') or data.get('invoice_original_name') or 'Factura',
        'invoiced_at': data.get('invoiced_at'),
        'collected_at': data.get('collected_at'),
        'status': status,
        'badge': badge,
        'can_upload_invoice': status == 'PENDING_INVOICE',
        'can_mark_collected': status == 'PENDING_COLLECTION',
    }


def _concert_payment_rows(concert: Concert | None, pending_only: bool = False) -> list[dict]:
    rows = []
    for idx, row in enumerate(getattr(concert, 'payment_terms_json', None) or []):
        item = _normalize_payment_term(row, idx)
        if pending_only and item['status'] == 'COLLECTED':
            continue
        rows.append(item)
    return rows


def _concert_payment_total(concert: Concert | None, pending_only: bool = False) -> float:
    rows = _concert_payment_rows(concert, pending_only=pending_only)
    return sum(float(x.get('amount') or 0) for x in rows)


def _concert_billing_sort_key(concert: Concert | None, today: date | None = None):
    today = today or today_local()
    if not concert or not getattr(concert, 'date', None):
        return (2, date.max)
    if concert.date <= today:
        return (0, -concert.date.toordinal())
    return (1, concert.date.toordinal())


def _parse_invitation_rows(form) -> list[dict]:
    rows = []
    cats = form.getlist('invitation_category[]')
    artist_qtys = form.getlist('invitation_artist_qty[]')
    office_qtys = form.getlist('invitation_office_qty[]')
    for i, cat in enumerate(cats or []):
        cat = (cat or '').strip()
        if not cat:
            continue
        artist_qty = _parse_optional_positive_int((artist_qtys[i] if i < len(artist_qtys) else '') or '') or 0
        office_qty = _parse_optional_positive_int((office_qtys[i] if i < len(office_qtys) else '') or '') or 0
        rows.append({'category': cat, 'artist_qty': artist_qty, 'office_qty': office_qty, 'total_qty': artist_qty + office_qty})
    return rows


def _parse_payment_terms_rows(form) -> list[dict]:
    rows = []
    concepts = form.getlist('payment_concept[]')
    amounts = form.getlist('payment_amount[]')
    due_dates = form.getlist('payment_due_date[]')
    cache_refs = form.getlist('payment_cache_ref[]')
    for i, concept in enumerate(concepts or []):
        concept = (concept or '').strip()
        amount = _parse_optional_decimal(amounts[i] if i < len(amounts) else None)
        due_date = parse_optional_date(due_dates[i] if i < len(due_dates) else None)
        cache_ref = (cache_refs[i] if i < len(cache_refs) else '').strip() or None
        if not concept and not amount and not due_date:
            continue
        rows.append({
            'concept': concept or 'Pago',
            'amount': float(amount or 0),
            'due_date': due_date.isoformat() if due_date else None,
            'cache_ref': cache_ref,
            'invoice_url': None,
            'invoice_name': None,
            'invoiced_at': None,
            'collected_at': None,
        })
    return rows


def _parse_contract_sheet_form(form) -> dict:
    payload = {
        'gala_municipality': (form.get('gala_municipality') or '').strip(),
        'gala_province': (form.get('gala_province') or '').strip(),
        'gala_date': (form.get('gala_date') or '').strip(),
        'gala_venue': (form.get('gala_venue') or '').strip(),
        'gala_venue_address': (form.get('gala_venue_address') or '').strip(),
        'gala_postal_code': (form.get('gala_postal_code') or '').strip(),
        'gala_show_time': (form.get('gala_show_time') or '').strip(),
        'gala_doors_time': (form.get('gala_doors_time') or '').strip(),
        'gala_capacity': (form.get('gala_capacity') or '').strip(),
        'company_legal_name': (form.get('company_legal_name') or '').strip(),
        'company_tax_id': (form.get('company_tax_id') or '').strip(),
        'company_address': (form.get('company_address') or '').strip(),
        'company_municipality': (form.get('company_municipality') or '').strip(),
        'company_province': (form.get('company_province') or '').strip(),
        'company_postal_code': (form.get('company_postal_code') or '').strip(),
        'company_representative': (form.get('company_representative') or '').strip(),
        'company_representative_dni': (form.get('company_representative_dni') or '').strip(),
        'company_email': (form.get('company_email') or '').strip(),
        'company_phone': (form.get('company_phone') or '').strip(),
        'local_legal_name': (form.get('local_legal_name') or '').strip(),
        'local_tax_id': (form.get('local_tax_id') or '').strip(),
        'local_address': (form.get('local_address') or '').strip(),
        'local_municipality': (form.get('local_municipality') or '').strip(),
        'local_province': (form.get('local_province') or '').strip(),
        'local_postal_code': (form.get('local_postal_code') or '').strip(),
        'local_representative': (form.get('local_representative') or '').strip(),
        'local_representative_dni': (form.get('local_representative_dni') or '').strip(),
        'local_email': (form.get('local_email') or '').strip(),
        'local_phone': (form.get('local_phone') or '').strip(),
        'technical_responsible': (form.get('technical_responsible') or '').strip(),
        'technical_phone': (form.get('technical_phone') or '').strip(),
        'technical_email': (form.get('technical_email') or '').strip(),
        'technical_mobile': (form.get('technical_mobile') or '').strip(),
        'economics_cache': (form.get('economics_cache') or '').strip(),
        'economics_box_office_split': (form.get('economics_box_office_split') or '').strip(),
        'economics_notes': (form.get('economics_notes') or '').strip(),
        'show_format': (form.get('show_format') or '').strip(),
        'show_duration': (form.get('show_duration') or '').strip(),
        'show_notes': (form.get('show_notes') or '').strip(),
        'show_types': [x for x in (form.getlist('show_types[]') or []) if (x or '').strip()],
        'ticketing_has_mg': _truthy(form.get('ticketing_has_mg')),
        'ticketing_points_of_sale': (form.get('ticketing_points_of_sale') or '').strip(),
        'promotion_actions': (form.get('promotion_actions') or '').strip(),
        'promotion_responsible': (form.get('promotion_responsible') or '').strip(),
        'promotion_phone': (form.get('promotion_phone') or '').strip(),
        'promotion_email': (form.get('promotion_email') or '').strip(),
        'promotion_mobile': (form.get('promotion_mobile') or '').strip(),
        'promotion_announcement_date': (form.get('promotion_announcement_date') or '').strip(),
        'promotion_sale_date': (form.get('promotion_sale_date') or '').strip(),
        'promotion_poster_logos': (form.get('promotion_poster_logos') or '').strip(),
    }
    ticket_types = []
    tt_names = form.getlist('ticket_type_name[]')
    tt_qtys = form.getlist('ticket_type_qty[]')
    tt_amounts = form.getlist('ticket_type_amount[]')
    invite_total = form.getlist('ticket_type_invites_total[]')
    invite_artist = form.getlist('ticket_type_invites_artist[]')
    for i, name in enumerate(tt_names or []):
        name = (name or '').strip()
        if not name:
            continue
        ticket_types.append({
            'name': name,
            'qty_for_sale': _parse_optional_positive_int((tt_qtys[i] if i < len(tt_qtys) else '') or '') or 0,
            'amount': float(_parse_optional_decimal(tt_amounts[i] if i < len(tt_amounts) else None) or 0),
            'invites_total': _parse_optional_positive_int((invite_total[i] if i < len(invite_total) else '') or '') or 0,
            'invites_artist': _parse_optional_positive_int((invite_artist[i] if i < len(invite_artist) else '') or '') or 0,
        })
    payload['ticket_types'] = ticket_types
    return payload


def _sheet_merge_candidates(data: dict) -> dict:
    return {
        'date': (data.get('gala_date') or '').strip() or None,
        'manual_municipality': (data.get('gala_municipality') or '').strip() or None,
        'manual_province': (data.get('gala_province') or '').strip() or None,
        'manual_venue_name': (data.get('gala_venue') or '').strip() or None,
        'manual_venue_address': (data.get('gala_venue_address') or '').strip() or None,
        'manual_postal_code': (data.get('gala_postal_code') or '').strip() or None,
        'show_time': (data.get('gala_show_time') or '').strip() or None,
        'doors_time': (data.get('gala_doors_time') or '').strip() or None,
        'capacity': (data.get('gala_capacity') or '').strip() or None,
        'announcement_date': (data.get('promotion_announcement_date') or '').strip() or None,
        'sale_start_date': (data.get('promotion_sale_date') or '').strip() or None,
    }


def _prepare_contract_sheet_merge(concert: Concert, data: dict) -> tuple[list[dict], list[dict]]:
    auto_updates = []
    conflicts = []
    candidates = _sheet_merge_candidates(data or {})
    current_values = {
        'date': concert.date.isoformat() if getattr(concert, 'date', None) else None,
        'manual_municipality': _concert_city(concert) or None,
        'manual_province': _concert_province_value(concert) or None,
        'manual_venue_name': _concert_venue_name(concert) or None,
        'manual_venue_address': _concert_venue_address(concert) or None,
        'manual_postal_code': (getattr(concert, 'manual_postal_code', None) or '').strip() or None,
        'show_time': (getattr(concert, 'show_time', None) or '').strip() or None,
        'doors_time': (getattr(concert, 'doors_time', None) or '').strip() or None,
        'capacity': str(getattr(concert, 'capacity', None)) if getattr(concert, 'capacity', None) is not None else None,
        'announcement_date': concert.announcement_date.isoformat() if getattr(concert, 'announcement_date', None) else None,
        'sale_start_date': concert.sale_start_date.isoformat() if getattr(concert, 'sale_start_date', None) else None,
    }
    labels = {
        'date': 'Fecha',
        'manual_municipality': 'Municipio',
        'manual_province': 'Provincia',
        'manual_venue_name': 'Recinto',
        'manual_venue_address': 'Dirección recinto',
        'manual_postal_code': 'Código postal',
        'show_time': 'Hora del show',
        'doors_time': 'Hora apertura puertas',
        'capacity': 'Aforo',
        'announcement_date': 'Fecha de anuncio',
        'sale_start_date': 'Fecha salida a la venta',
    }
    for field, new_value in candidates.items():
        if new_value in (None, ''):
            continue
        current_value = current_values.get(field)
        if current_value in (None, ''):
            auto_updates.append({'field': field, 'label': labels.get(field, field), 'value': new_value})
        elif str(current_value).strip() != str(new_value).strip():
            conflicts.append({'field': field, 'label': labels.get(field, field), 'current': current_value, 'incoming': new_value})
    return auto_updates, conflicts


def _apply_contract_sheet_merge(concert: Concert, updates: list[dict], decisions: dict[str, str] | None = None):
    decisions = decisions or {}
    applied = []
    for item in updates or []:
        field = item['field']
        value = item['value']
        if decisions.get(field, 'replace') == 'keep':
            continue
        if field in ('date', 'announcement_date', 'sale_start_date') and value:
            try:
                value = parse_date(value)
            except Exception:
                continue
        elif field == 'capacity':
            try:
                value = max(0, int(value))
            except Exception:
                continue
        setattr(concert, field, value)
        if field == 'show_time' and value:
            concert.show_time_tbc = False
        if field == 'doors_time' and value:
            concert.doors_time_tbc = False
        if field == 'sale_start_date' and value:
            concert.sale_start_tbc = False
        if field == 'capacity' and value is not None:
            concert.no_capacity = False
        if field == 'announcement_date' and value:
            concert.do_not_announce = False
        applied.append(item['label'])
    if any(x['field'] in ('manual_venue_name', 'manual_venue_address', 'manual_municipality', 'manual_province') for x in (updates or [])):
        concert.venue_id = None
    return applied


def _build_similarity_payload(rows, key_getter, label_getter, extra_getter=None, threshold: float = 0.72):
    out = []
    seen = set()
    for row in rows or []:
        key = key_getter(row)
        score = _similarity_score(key, label_getter({'query': key}) if isinstance(label_getter, dict) else None)
        score = score  # placeholder to keep signature compatibility if ever reused
    return out


def _build_similarity_rows(query: str, rows: list[dict], threshold: float = 0.72) -> list[dict]:
    query = (query or '').strip()
    out = []
    seen = set()
    for row in rows or []:
        label = (row.get('label') or '').strip()
        score = _similarity_score(query, label)
        if score < threshold:
            continue
        rid = row.get('id')
        if rid in seen:
            continue
        seen.add(rid)
        row = dict(row)
        row['score'] = round(score, 4)
        out.append(row)
    out.sort(key=lambda x: (-x.get('score', 0), x.get('label') or ''))
    return out[:5]


def _sale_type_label(value: str | None) -> str:
    key = (value or "").strip().upper()
    return CONCERT_SALE_TYPE_LABELS.get(key, key or "—")


def _pick_artist_commitment(session_db, artist_id: UUID, concept_variants: list[str], material_date: date | None = None, as_of_date: date | None = None):
    """Devuelve el compromiso de contrato más reciente para un concepto.

    Además de escoger por fecha de contrato/creación, soporta el alcance
    `material_scope` para distinguir si un nuevo porcentaje afecta también a
    materiales ya existentes o solo a materiales nuevos.
    """

    rows = (
        session_db.query(ArtistContractCommitment, ArtistContract)
        .join(ArtistContract, ArtistContractCommitment.contract_id == ArtistContract.id)
        .filter(ArtistContract.artist_id == artist_id)
        .all()
    )

    vset = {(_norm_text_key(x) or "") for x in (concept_variants or []) if (x or "").strip()}
    candidates = []
    for m, c in rows:
        if not m or not c:
            continue
        if _norm_text_key(getattr(m, "concept", "")) not in vset:
            continue

        signed_date = getattr(c, "signed_date", None)
        contract_created = getattr(c, "created_at", None)
        commitment_created = getattr(m, "created_at", None)

        effective_date = signed_date
        if effective_date is None and contract_created is not None:
            try:
                effective_date = contract_created.date()
            except Exception:
                effective_date = None
        if effective_date is None and commitment_created is not None:
            try:
                effective_date = commitment_created.date()
            except Exception:
                effective_date = None

        if as_of_date and effective_date and effective_date > as_of_date:
            continue

        material_scope = _norm_material_scope(getattr(m, "material_scope", None))
        if material_scope == "ONLY_NEW_MATERIALS" and material_date and effective_date and material_date < effective_date:
            continue

        candidates.append((m, c, effective_date, contract_created, commitment_created))

    if not candidates:
        return None, None

    def key(item):
        _m, _c, effective_date, contract_created, commitment_created = item
        return (effective_date or date.min, contract_created or datetime.min, commitment_created or datetime.min)

    candidates.sort(key=key, reverse=True)
    chosen, contract, *_ = candidates[0]
    return chosen, contract



# ---------- helpers: artistas con contrato Discográfico/Catálogo/Distribución ----------

_DISCO_SONG_CONTRACT_KEYWORDS = ("discograf", "catalog", "distribu")


def _artist_ids_with_discography_contracts(session_db) -> set:
    """Devuelve set(artist_id) para artistas con compromisos de contrato relevantes.

    Se consideran relevantes compromisos cuyo concepto (normalizado, sin acentos)
    contenga alguna de estas claves: discograf, catalog, distribu.

    Esto permite filtrar artistas válidos para creación de canciones en Discográfica.
    """

    try:
        rows = (
            session_db.query(ArtistContract.artist_id, ArtistContractCommitment.concept)
            .join(ArtistContractCommitment, ArtistContractCommitment.contract_id == ArtistContract.id)
            .all()
        )
    except Exception:
        return set()

    aid_set = set()
    for aid, concept in rows:
        if not aid:
            continue
        ckey = _norm_text_key(concept or "")
        if any(k in ckey for k in _DISCO_SONG_CONTRACT_KEYWORDS):
            aid_set.add(aid)

    return aid_set



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
        material_scope = _norm_material_scope(request.form.get("material_scope"))

        m = ArtistContractCommitment(
            contract_id=c.id,
            concept=concept,
            pct_artist=_parse_pct(request.form.get("pct_artist")),
            pct_office=_parse_pct(request.form.get("pct_office")),
            base=base,
            profit_scope=profit_scope,
            material_scope=material_scope,
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
        material_scope = _norm_material_scope(request.form.get("material_scope") or getattr(m, "material_scope", None))

        m.concept = concept
        m.pct_artist = _parse_pct(request.form.get("pct_artist"))
        m.pct_office = _parse_pct(request.form.get("pct_office"))
        m.base = base
        m.profit_scope = profit_scope
        m.material_scope = material_scope

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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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




# -------------------------------
# Discográfica > Ingresos helpers
# -------------------------------

SPANISH_MONTH_ABBR = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _add_months(d: date, delta_months: int) -> date:
    """Return first day of month shifted by delta_months."""
    y = d.year + (d.month - 1 + delta_months) // 12
    m = (d.month - 1 + delta_months) % 12 + 1
    return date(y, m, 1)


def _month_end(d: date) -> date:
    """Last day of the month containing d."""
    start = _month_start(d)
    nxt = _add_months(start, 1)
    return nxt - timedelta(days=1)


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _parse_month_key(key: str) -> date | None:
    try:
        y_s, m_s = (key or "").split("-")
        y, m = int(y_s), int(m_s)
        if not (1 <= m <= 12):
            return None
        return date(y, m, 1)
    except Exception:
        return None


def _month_label(d: date) -> str:
    return f"{SPANISH_MONTH_ABBR[d.month - 1]} {d.year}"


def _semester_key(year: int, half: int) -> str:
    return f"{year:04d}-S{half}"


def _parse_semester_key(key: str) -> tuple[int, int] | None:
    try:
        y_s, h_s = (key or "").split("-")
        year = int(y_s)
        if not h_s.upper().startswith("S"):
            return None
        half = int(h_s[1:])
        if half not in (1, 2):
            return None
        return year, half
    except Exception:
        return None


def _semester_range(year: int, half: int) -> tuple[date, date]:
    if half == 1:
        return date(year, 1, 1), date(year, 6, 30)
    return date(year, 7, 1), date(year, 12, 31)


def _add_semesters(year: int, half: int, delta: int) -> tuple[int, int]:
    # Represent semester index as year*2 + (half-1)
    idx = year * 2 + (half - 1) + delta
    new_year = idx // 2
    new_half = (idx % 2) + 1
    return new_year, new_half


def _semester_label(year: int, half: int) -> str:
    if half == 1:
        return f"S1 {year} (Ene-Jun)"
    return f"S2 {year} (Jul-Dic)"


def _isrc_key(val: str | None) -> str:
    if not val:
        return ""
    s = str(val).strip().upper()
    return "".join(ch for ch in s if ch.isalnum())


def _norm_isrc(val: str | None) -> str:
    raw = _isrc_key(val)
    if not raw:
        return ""
    if len(raw) == 12:
        return f"{raw[:2]}-{raw[2:5]}-{raw[5:7]}-{raw[7:]}"
    return raw


def _norm_isrc_list(values) -> list[str]:
    seen = set()
    out = []
    for value in values or []:
        code = _norm_isrc(value)
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def _song_type_key(song: Song | None) -> str:
    if not song:
        return "DISCOGRAFICA"
    if bool(getattr(song, "is_distribution", False)):
        return "DISTRIBUCION"
    if bool(getattr(song, "is_catalog", False)):
        return "CATALOGO"
    return "DISCOGRAFICA"


def _song_type_label(song: Song | None) -> str:
    key = _song_type_key(song)
    if key == "DISTRIBUCION":
        return "Distribución"
    if key == "CATALOGO":
        return "Catálogo"
    return "Discográfica"


def _song_type_badge_class(song: Song | None) -> str:
    key = _song_type_key(song)
    if key == "DISTRIBUCION":
        return "text-bg-info"
    if key == "CATALOGO":
        return "text-bg-secondary"
    return "text-bg-dark"


def _ensure_song_status_row(session_db, song_or_id) -> SongStatus:
    if isinstance(song_or_id, Song):
        song = song_or_id
        sid = song.id
    else:
        sid = song_or_id
        song = session_db.get(Song, sid) if sid else None

    st = session_db.get(SongStatus, sid) if sid else None
    if not st and sid:
        st = SongStatus(song_id=sid)
        if song is not None:
            st.cover_done = bool(getattr(song, "cover_url", None))
            if st.cover_done:
                st.cover_updated_at = datetime.now(TZ_MADRID)
        session_db.add(st)
        session_db.flush()
    return st


def _current_song_isrcs(session_db, song_id, include_song_field: bool = True) -> list[str]:
    sid = to_uuid(song_id) if not isinstance(song_id, UUID) else song_id
    rows = (
        session_db.query(SongISRCCode.code)
        .filter(SongISRCCode.song_id == sid)
        .order_by(SongISRCCode.is_primary.desc(), SongISRCCode.created_at.asc())
        .all()
    )
    codes = [code for (code,) in rows if code]
    if include_song_field:
        song = session_db.get(Song, sid)
        if song and getattr(song, "isrc", None):
            codes.append(song.isrc)
    return _norm_isrc_list(codes)


def _sync_song_agedi_state(session_db, song_id, status_obj: SongStatus | None = None) -> SongStatus:
    sid = to_uuid(song_id) if not isinstance(song_id, UUID) else song_id
    st = status_obj or _ensure_song_status_row(session_db, sid)
    current_codes = set(_current_song_isrcs(session_db, sid))
    registered_codes = set(_norm_isrc_list(getattr(st, "agedi_registered_isrcs", []) or []))

    prev_done = bool(getattr(st, "agedi_done", False))
    st.agedi_done = bool(current_codes) and bool(registered_codes) and current_codes.issubset(registered_codes)

    if prev_done != bool(st.agedi_done):
        st.updated_at = datetime.now(TZ_MADRID)
    session_db.add(st)
    return st


def _mark_song_agedi_registered(session_db, song_id) -> tuple[SongStatus, list[str]]:
    sid = to_uuid(song_id) if not isinstance(song_id, UUID) else song_id
    st = _ensure_song_status_row(session_db, sid)
    current_codes = _current_song_isrcs(session_db, sid)
    st.agedi_registered_isrcs = current_codes
    st.agedi_done = bool(current_codes)
    if current_codes:
        st.agedi_updated_at = datetime.now(TZ_MADRID)
    st.updated_at = datetime.now(TZ_MADRID)
    session_db.add(st)
    return st, current_codes


def _mark_song_sgae_pending_from_editorial_change(session_db, song_id) -> SongStatus:
    sid = to_uuid(song_id) if not isinstance(song_id, UUID) else song_id
    st = _ensure_song_status_row(session_db, sid)
    if bool(getattr(st, "sgae_done", False)):
        st.sgae_done = False
        st.sgae_modification_pending = True
        st.updated_at = datetime.now(TZ_MADRID)
        session_db.add(st)
    return st


def _mark_song_sgae_registered(session_db, song_id) -> SongStatus:
    sid = to_uuid(song_id) if not isinstance(song_id, UUID) else song_id
    st = _ensure_song_status_row(session_db, sid)
    st.sgae_done = True
    st.sgae_modification_pending = False
    st.sgae_updated_at = datetime.now(TZ_MADRID)
    st.updated_at = datetime.now(TZ_MADRID)
    session_db.add(st)
    return st


def _parse_money_decimal(val: str | None) -> Decimal:
    """Parse user/csv money-like strings to Decimal (robust for ES/EN formats)."""
    if val is None:
        return Decimal("0")
    s = str(val).strip()
    if not s:
        return Decimal("0")

    if s.lower() in ("nan", "none", "null", "na"):
        return Decimal("0")

    # remove currency symbols/spaces
    for ch in ("€", "$", "£"):
        s = s.replace(ch, "")
    s = s.replace(" ", "")

    # Detect thousands/decimal separators
    if "," in s and "." in s:
        # If dot appears before comma => ES (1.234,56)
        if s.find(".") < s.find(","):
            s = s.replace(".", "")
            s = s.replace(",", ".")
        else:
            # EN (1,234.56)
            s = s.replace(",", "")
    elif "," in s and "." not in s:
        # ES decimal comma
        s = s.replace(",", ".")

    # Any remaining thousands separators
    # (keep last dot as decimal)
    try:
        dec = Decimal(s)
        return dec if dec.is_finite() else Decimal("0")
    except Exception:
        # fallback: strip anything weird
        cleaned = "".join(ch for ch in s if ch.isdigit() or ch == "." or ch == "-")
        dec = Decimal(cleaned or "0")
        return dec if dec.is_finite() else Decimal("0")


def _money_norm(val) -> Decimal:
    try:
        dec = Decimal(val or 0)
    except Exception:
        dec = Decimal("0")
    if not dec.is_finite():
        return Decimal("0")
    try:
        return dec.quantize(Decimal("0.01"))
    except Exception:
        return dec


def _money_equal(a, b) -> bool:
    return _money_norm(a) == _money_norm(b)


def _clean_csv_cell(val) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("nan", "none", "null"):
        return ""
    return s


def _income_import_store_dir() -> Path:
    base = Path("/tmp/radio_spins_app_income_imports")
    try:
        base.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    # limpieza best-effort
    try:
        now_ts = datetime.utcnow().timestamp()
        for p in base.glob("*.json"):
            try:
                if (now_ts - p.stat().st_mtime) > (48 * 3600):
                    p.unlink(missing_ok=True)
            except Exception:
                continue
    except Exception:
        pass

    return base


def _save_income_import_payload(payload: dict, prefix: str = "income") -> str:
    token = f"{prefix}_{_uuid.uuid4().hex}"
    path = _income_import_store_dir() / f"{token}.json"
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    return token


def _load_income_import_payload(token: str | None) -> dict | None:
    token = (token or "").strip()
    if not token:
        return None
    if not all(ch.isalnum() or ch in ("_", "-") for ch in token):
        return None

    path = _income_import_store_dir() / f"{token}.json"
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _delete_income_import_payload(token: str | None) -> None:
    token = (token or "").strip()
    if not token:
        return
    if not all(ch.isalnum() or ch in ("_", "-") for ch in token):
        return
    try:
        (_income_import_store_dir() / f"{token}.json").unlink(missing_ok=True)
    except Exception:
        pass


def _update_url_query(url: str | None, updates: dict[str, object]) -> str:
    raw = (url or "").strip() or url_for("discografica_view", section="ingresos")
    parsed = urlsplit(raw)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))

    for key, value in (updates or {}).items():
        if value is None or value == "":
            query.pop(key, None)
        else:
            query[str(key)] = str(value)

    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query, doseq=True), parsed.fragment))


def _infer_income_period_from_url(next_url: str | None) -> tuple[str | None, date | None]:
    raw = (next_url or "").strip()
    if not raw:
        return None, None

    try:
        query = parse_qs(urlsplit(raw).query or "", keep_blank_values=True)
    except Exception:
        return None, None

    view = ((query.get("view") or ["month"])[0] or "month").strip().lower()
    if view == "semester":
        parsed_sem = _parse_semester_key(((query.get("s") or [""])[0] or "").strip())
        if parsed_sem:
            year, half = parsed_sem
            sem_start, _ = _semester_range(year, half)
            return "SEMESTER", sem_start

    month_start = _parse_month_key(((query.get("m") or [""])[0] or "").strip())
    if month_start:
        return "MONTH", month_start

    return None, None


def _serialize_income_song_meta(session_db, song_ids: list[str]) -> dict[str, dict]:
    if not song_ids:
        return {}

    uuids = []
    for sid in song_ids:
        try:
            uuids.append(uuid.UUID(str(sid)))
        except Exception:
            continue

    if not uuids:
        return {}

    meta: dict[str, dict] = {}
    song_rows = (
        session_db.query(Song.id, Song.title, Song.release_date, Song.isrc)
        .filter(Song.id.in_(uuids))
        .all()
    )
    for sid, title, release_date, legacy_isrc in song_rows:
        meta[str(sid)] = {
            "song_id": str(sid),
            "song_title": title or "",
            "release_date": release_date.isoformat() if release_date else "",
            "display_isrc": _norm_isrc(legacy_isrc),
            "artists": [],
            "artists_label": "",
            "all_isrcs": [],
        }

    artist_rows = (
        session_db.query(SongArtist.song_id, Artist.name)
        .join(Artist, Artist.id == SongArtist.artist_id)
        .filter(SongArtist.song_id.in_(uuids))
        .order_by(Artist.name.asc())
        .all()
    )
    for sid, artist_name in artist_rows:
        item = meta.get(str(sid))
        if item and artist_name:
            item.setdefault("artists", []).append(artist_name)

    code_rows = (
        session_db.query(SongISRCCode.song_id, SongISRCCode.code, SongISRCCode.is_primary)
        .filter(SongISRCCode.song_id.in_(uuids))
        .order_by(SongISRCCode.is_primary.desc(), SongISRCCode.code.asc())
        .all()
    )
    for sid, code, is_primary in code_rows:
        item = meta.get(str(sid))
        if not item:
            continue
        norm_code = _norm_isrc(code)
        if not norm_code:
            continue
        if norm_code not in item["all_isrcs"]:
            item["all_isrcs"].append(norm_code)
        if is_primary and not item.get("display_isrc"):
            item["display_isrc"] = norm_code

    for item in meta.values():
        if not item.get("display_isrc") and item.get("all_isrcs"):
            item["display_isrc"] = item["all_isrcs"][0]
        item["artists_label"] = ", ".join(item.get("artists") or [])

    return meta


def _apply_income_import_items(session_db, items: list[dict], period_type: str, period_start: date, period_end: date, amount_kind: str, strategy: str = "replace") -> dict:
    result = {
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "kept": 0,
        "replaced": 0,
        "actions": [],
    }
    if not items:
        return result

    song_ids = []
    for item in items:
        try:
            song_ids.append(uuid.UUID(str(item.get("song_id") or "")))
        except Exception:
            continue

    if not song_ids:
        return result

    existing_rows = (
        session_db.query(SongRevenueEntry)
        .filter(SongRevenueEntry.song_id.in_(song_ids))
        .filter(SongRevenueEntry.period_type == period_type)
        .filter(SongRevenueEntry.period_start == period_start)
        .filter(SongRevenueEntry.is_base.is_(True))
        .all()
    )
    existing_by_song = {str(row.song_id): row for row in existing_rows}

    for item in items:
        sid = str(item.get("song_id") or "")
        amount = _money_norm(item.get("new_value") or item.get("amount") or 0)
        if not sid:
            continue

        entry = existing_by_song.get(sid)
        field_name = "gross" if amount_kind == "gross" else "net"
        existing_value = _money_norm(getattr(entry, field_name, 0) if entry else 0)
        action = None

        if entry and strategy == "keep" and not _money_equal(existing_value, amount):
            result["kept"] += 1
            action = "kept"
        else:
            if not entry:
                try:
                    song_uuid = uuid.UUID(sid)
                except Exception:
                    continue
                entry = SongRevenueEntry(
                    song_id=song_uuid,
                    period_type=period_type,
                    period_start=period_start,
                    period_end=period_end,
                    is_base=True,
                    name=None,
                    gross=Decimal("0"),
                    net=Decimal("0"),
                )
                session_db.add(entry)
                existing_by_song[sid] = entry
                result["created"] += 1
                action = "created"
            else:
                if strategy == "replace" and not _money_equal(existing_value, amount):
                    result["replaced"] += 1
                    action = "replaced"
                elif _money_equal(existing_value, amount):
                    result["unchanged"] += 1
                    action = "unchanged"
                else:
                    result["updated"] += 1
                    action = "updated"

            if strategy != "keep" or not _money_equal(existing_value, amount):
                setattr(entry, field_name, amount)
                entry.period_end = period_end
                entry.updated_at = func.now()
                if action not in ("created", "replaced", "unchanged"):
                    action = "updated"

        result["actions"].append(
            {
                **item,
                "existing_value": str(existing_value),
                "new_value": str(amount),
                "action": action or "updated",
            }
        )

    return result

@app.get("/discografica")
@admin_required
def discografica_view():
    """Pestaña principal Discográfica.

    Agrupa (por ahora):
    - Canciones (Repertorio)
    - Royalties (próximamente)
    - Editorial (próximamente)
    - Ingresos
    """

    section = (request.args.get("section") or "canciones").lower().strip()

    # Context (solo se usa cuando section == 'ingresos')
    income_view = request.args.get("view") or "month"  # 'month' | 'semester'
    if income_view not in ("month", "semester"):
        income_view = "month"

    income_period_label = ""
    income_period_type = "MONTH"
    income_period_key = ""
    income_period_start_iso = ""

    income_month_tabs: list[dict] = []
    income_month_prev_url: str | None = None
    income_month_next_url: str | None = None

    income_semester_tabs: list[dict] = []

    income_artist_blocks: list[tuple] = []
    editorial_pending_songs: list[Song] = []
    editorial_registered_songs: list[Song] = []
    editorial_filter_artists: list[Artist] = []
    isrc_pending_songs: list[dict] = []

    # Context (solo se usa cuando section == 'royalties')
    royalty_period_label = ""
    royalty_semester_key = ""
    royalty_semester_tabs: list[dict] = []
    royalty_beneficiaries_artists: list[dict] = []
    royalty_beneficiaries_others: list[dict] = []

    # Para redirecciones tras POST
    income_next_url = _update_url_query(request.full_path.rstrip("?"), {"upload_report": None, "import_review": None})

    # Opciones para el modal del informe
    income_report_months: list[dict] = []
    income_report_semesters: list[dict] = []
    income_report_months_selected: list[str] = []
    income_report_semesters_selected: list[str] = []
    income_upload_report = None
    income_import_review = None

    if section not in ("canciones", "royalties", "editorial", "ingresos", "isrc"):
        section = "canciones"

    editorial_tab = (request.args.get("editorial_tab") or "pendientes").lower().strip()
    if editorial_tab not in ("pendientes", "repertorio"):
        editorial_tab = "pendientes"

    # subpestañas ISRC
    isrc_tab = (request.args.get("isrc_tab") or "repertorio").lower().strip()
    if isrc_tab not in ("repertorio", "configurador", "pendientes"):
        isrc_tab = "repertorio"

    if section == "ingresos":
        income_upload_report = _load_income_import_payload(request.args.get("upload_report"))
        income_import_review = _load_income_import_payload(request.args.get("import_review"))

    session_db = db()
    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()

    # Solo artistas con contrato Discográfico / Catálogo / Distribución (para alta de canciones)
    contract_artist_ids = _artist_ids_with_discography_contracts(session_db)
    contract_artists = [a for a in artists if a.id in contract_artist_ids]

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
            if songs:
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


    if section == "editorial":
        plataforma = (
            session_db.query(PublishingCompany)
            .filter(func.lower(PublishingCompany.name) == "plataforma musical")
            .first()
        )
        plataforma_id = getattr(plataforma, "id", None)

        if plataforma_id:
            song_rows = (
                session_db.query(Song)
                .join(SongEditorialShare, SongEditorialShare.song_id == Song.id)
                .join(Promoter, Promoter.id == SongEditorialShare.promoter_id)
                .filter(Promoter.publishing_company_id == plataforma_id)
                .options(selectinload(Song.artists))
                .order_by(Song.release_date.desc(), Song.title.asc())
                .all()
            )

            dedup = []
            seen = set()
            for song in song_rows:
                if not song or song.id in seen:
                    continue
                seen.add(song.id)
                dedup.append(song)

            status_map = {}
            if dedup:
                status_map = {
                    row.song_id: row
                    for row in (
                        session_db.query(SongStatus)
                        .filter(SongStatus.song_id.in_([s.id for s in dedup]))
                        .all()
                    )
                    if row and row.song_id
                }

            editorial_artist_ids = set()
            for song in dedup:
                setattr(song, "editorial_artists_str", ", ".join([a.name for a in getattr(song, "artists", [])]) or "—")
                song_status = status_map.get(song.id)
                setattr(song, "editorial_registered", bool(getattr(song_status, "sgae_done", False)))
                setattr(song, "editorial_modification_pending", bool(getattr(song_status, "sgae_modification_pending", False)))
                for art in (getattr(song, "artists", []) or []):
                    if art and getattr(art, "id", None):
                        editorial_artist_ids.add(art.id)

            editorial_pending_songs = [
                s for s in dedup
                if (not getattr(s, "editorial_registered", False)) or bool(getattr(s, "editorial_modification_pending", False))
            ]
            editorial_registered_songs = [s for s in dedup if getattr(s, "editorial_registered", False)]
            editorial_filter_artists = [a for a in artists if a.id in editorial_artist_ids]


    if section == "royalties":
        # Subpestañas por semestres (igual que Ingresos)
        today = today_local()
        parsed_sem = _parse_semester_key((request.args.get("s") or "").strip())
        if parsed_sem is None:
            # Semestre anterior "cerrado"
            if today.month <= 6:
                sem_year, sem_half = today.year - 1, 2
            else:
                sem_year, sem_half = today.year, 1
        else:
            sem_year, sem_half = parsed_sem

        royalty_semester_key = _semester_key(sem_year, sem_half)
        sem_start, sem_end = _semester_range(sem_year, sem_half)
        royalty_period_label = _semester_label(sem_year, sem_half)

        # Tabs semestrales (últimos 12 desde el seleccionado)
        royalty_semester_tabs = []
        for i in range(12):
            y, h = _add_semesters(sem_year, sem_half, -i)
            k = _semester_key(y, h)
            royalty_semester_tabs.append(
                {
                    "key": k,
                    "label": _semester_label(y, h),
                    "is_active": k == royalty_semester_key,
                    "url": url_for("discografica_view", section="royalties", s=k),
                }
            )

        # Meses dentro del semestre (para sumar si no hay fila SEMESTER)
        month_starts = []
        cursor = date(sem_start.year, sem_start.month, 1)
        for _ in range(6):
            month_starts.append(cursor)
            cursor = _add_months(cursor, 1)

        # Canciones con ingresos en el semestre (SEMESTER o suma de meses)
        sem_song_ids = [
            sid
            for (sid,) in (
                session_db.query(SongRevenueEntry.song_id)
                .filter(func.upper(SongRevenueEntry.period_type) == "SEMESTER")
                .filter(SongRevenueEntry.period_start == sem_start)
                .distinct()
                .all()
            )
            if sid
        ]
        month_song_ids = [
            sid
            for (sid,) in (
                session_db.query(SongRevenueEntry.song_id)
                .filter(func.upper(SongRevenueEntry.period_type) == "MONTH")
                .filter(SongRevenueEntry.period_start.in_(month_starts))
                .distinct()
                .all()
            )
            if sid
        ]
        song_ids = sorted(set(sem_song_ids + month_song_ids))

        songs = []
        if song_ids:
            songs = (
                session_db.query(Song)
                .options(selectinload(Song.artists))
                .filter(Song.id.in_(song_ids))
                .order_by(Song.release_date.desc())
                .all()
            )

        # Ingresos agregados por canción
        sem_totals = {
            sid: (Decimal(g or 0), Decimal(n or 0))
            for sid, g, n in (
                session_db.query(
                    SongRevenueEntry.song_id,
                    func.sum(SongRevenueEntry.gross),
                    func.sum(SongRevenueEntry.net),
                )
                .filter(func.upper(SongRevenueEntry.period_type) == "SEMESTER")
                .filter(SongRevenueEntry.period_start == sem_start)
                .group_by(SongRevenueEntry.song_id)
                .all()
            )
            if sid
        }

        month_totals = {
            sid: (Decimal(g or 0), Decimal(n or 0))
            for sid, g, n in (
                session_db.query(
                    SongRevenueEntry.song_id,
                    func.sum(SongRevenueEntry.gross),
                    func.sum(SongRevenueEntry.net),
                )
                .filter(func.upper(SongRevenueEntry.period_type) == "MONTH")
                .filter(SongRevenueEntry.period_start.in_(month_starts))
                .group_by(SongRevenueEntry.song_id)
                .all()
            )
            if sid
        }

        gross_map = {}
        net_map = {}
        for sid in song_ids:
            if sid in sem_totals:
                g, n = sem_totals[sid]
            else:
                g, n = month_totals.get(sid, (Decimal(0), Decimal(0)))
            gross_map[sid] = float(g or 0)
            net_map[sid] = float(n or 0)

        # Intérpretes por canción
        interp_map = {sid: [] for sid in song_ids}
        if song_ids:
            rows = (
                session_db.query(SongInterpreter)
                .filter(SongInterpreter.song_id.in_(song_ids))
                .order_by(SongInterpreter.song_id, SongInterpreter.is_main.desc(), SongInterpreter.created_at.asc())
                .all()
            )
            for r in rows:
                if r.song_id in interp_map and r.name:
                    interp_map[r.song_id].append(r.name)

        interpreters_str = {sid: ", ".join(names) for sid, names in interp_map.items()}

        # ISRC AUDIO principal por canción
        isrc_map = {}
        if song_ids:
            rows = (
                session_db.query(SongISRCCode.song_id, SongISRCCode.code)
                .filter(SongISRCCode.song_id.in_(song_ids))
                .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                .filter(SongISRCCode.is_primary == True)  # noqa: E712
                .all()
            )
            for sid, code in rows:
                if sid and code:
                    isrc_map[sid] = code

        # Beneficiarios adicionales (terceros)
        extra_benef_rows = []
        if song_ids:
            extra_benef_rows = (
                session_db.query(SongRoyaltyBeneficiary)
                .options(joinedload(SongRoyaltyBeneficiary.promoter))
                .filter(SongRoyaltyBeneficiary.song_id.in_(song_ids))
                .all()
            )

        # Liquidaciones existentes (estado)
        liq_rows = (
            session_db.query(RoyaltyLiquidation)
            .filter(RoyaltyLiquidation.period_start == sem_start)
            .all()
        )
        liq_map = {(r.beneficiary_kind, str(r.beneficiary_id)): r for r in liq_rows if r}

        def liq_meta(status: str | None):
            s = (status or "GENERATED").upper()
            if s == "SENT":
                return ("Enviada", "primary")
            if s == "INVOICED":
                return ("Facturada", "warning")
            if s == "PAID":
                return ("Pagado", "success")
            return ("Generada", "secondary")

        # Acumulador por beneficiario
        ben_map = {}

        def ensure_benef(kind: str, bid: str, name: str, photo_url: str | None, kind_label: str):
            key = (kind, bid)
            if key not in ben_map:
                ben_map[key] = {
                    "kind": kind,
                    "id": bid,
                    "name": name,
                    "photo_url": photo_url,
                    "kind_label": kind_label,
                    "songs": [],
                    "total_amount": 0.0,
                    "liquidation_status": None,
                    "liquidation_label": None,
                    "liquidation_color": None,
                }
            return ben_map[key]

        # 1) Beneficiarios artistas (principal por canción)
        for s in songs:
            primary_artist = s.artists[0] if getattr(s, 'artists', None) else None
            if not primary_artist:
                continue

            # Concepto según tipo de canción
            if s.is_distribution:
                concept_variants = ["distribución", "distribucion"]
                kind_label = "Artista (Distribución)"
            elif s.is_catalog:
                concept_variants = ["catálogo", "catalogo"]
                kind_label = "Artista (Catálogo)"
            else:
                concept_variants = ["discográfico", "discografico", "discográfica", "discografica"]
                kind_label = "Artista (Discográfica)"

            m, _c = _pick_artist_commitment(session_db, primary_artist.id, concept_variants, material_date=getattr(s, "release_date", None), as_of_date=sem_end)
            pct = float(getattr(m, "pct_artist", 0) or 0) if m else 0.0
            base = _norm_contract_base(getattr(m, "base", "GROSS") or "GROSS") if m else "GROSS"

            g = gross_map.get(s.id, 0.0)
            n = net_map.get(s.id, 0.0)
            base_income = n if base in ("NET", "PROFIT") else g
            amount = float(base_income) * (pct / 100.0)

            # Excluir canciones sin ingresos (evita listados enormes con 0)
            if abs(float(g)) < 1e-9 and abs(float(n)) < 1e-9:
                continue

            b = ensure_benef("ARTIST", str(primary_artist.id), primary_artist.name, getattr(primary_artist, "photo_url", None), "Artista")
            b["songs"].append(
                {
                    "song_id": str(s.id),
                    "cover_url": s.cover_url,
                    "title": s.title,
                    "interpreters": (interpreters_str.get(s.id) or "").strip() or ", ".join([a.name for a in getattr(s, 'artists', [])]) or "",
                    "isrc": isrc_map.get(s.id) or s.isrc,
                    "release_date": s.release_date.strftime("%d/%m/%Y") if s.release_date else "",
                    "income": base_income,
                    "pct": pct,
                    "amount": amount,
                }
            )
            b["total_amount"] += amount

        # 2) Beneficiarios adicionales (terceros)
        for r in extra_benef_rows:
            p = getattr(r, "promoter", None)
            if not p:
                continue
            song_id = getattr(r, "song_id", None)
            if not song_id:
                continue

            base = (getattr(r, "base", "GROSS") or "GROSS").strip().upper()
            if base not in ("GROSS", "NET", "PROFIT"):
                base = "GROSS"
            pct = float(getattr(r, "pct", 0) or 0)

            g = gross_map.get(song_id, 0.0)
            n = net_map.get(song_id, 0.0)
            base_income = n if base in ("NET", "PROFIT") else g
            amount = float(base_income) * (pct / 100.0)

            if abs(float(g)) < 1e-9 and abs(float(n)) < 1e-9:
                continue

            # Song meta (lo buscamos en 'songs' si está; si no, lo cargamos)
            song_obj = next((x for x in songs if x.id == song_id), None)
            if not song_obj:
                song_obj = session_db.get(Song, song_id)
                if song_obj:
                    _ = song_obj.artists

            if not song_obj:
                continue

            b = ensure_benef("PROMOTER", str(p.id), (p.nick or (p.first_name or "") + " " + (p.last_name or "")).strip() or "Beneficiario", getattr(p, "logo_url", None), "Beneficiario")
            b["songs"].append(
                {
                    "song_id": str(song_obj.id),
                    "cover_url": song_obj.cover_url,
                    "title": song_obj.title,
                    "interpreters": (interpreters_str.get(song_obj.id) or "").strip() or ", ".join([a.name for a in getattr(song_obj, 'artists', [])]) or "",
                    "isrc": isrc_map.get(song_obj.id) or song_obj.isrc,
                    "release_date": song_obj.release_date.strftime("%d/%m/%Y") if song_obj.release_date else "",
                    "income": base_income,
                    "pct": pct,
                    "amount": amount,
                }
            )
            b["total_amount"] += amount

        # Enlazar estado de liquidación
        for (k, bid), b in ben_map.items():
            rec = liq_map.get((k, bid))
            if rec:
                b["liquidation_status"] = getattr(rec, "status", None)
                lbl, col = liq_meta(b["liquidation_status"])
                b["liquidation_label"] = lbl
                b["liquidation_color"] = col

        # Ordenación (artistas primero)
        royalty_beneficiaries_artists = [b for (k, _bid), b in ben_map.items() if k == "ARTIST" and (b.get('songs') or [])]
        royalty_beneficiaries_others = [b for (k, _bid), b in ben_map.items() if k == "PROMOTER" and (b.get('songs') or [])]

        royalty_beneficiaries_artists.sort(key=lambda x: (x.get('name') or '').lower())
        royalty_beneficiaries_others.sort(key=lambda x: (x.get('name') or '').lower())

        # Ordenar canciones dentro de cada beneficiario por título
        for b in royalty_beneficiaries_artists + royalty_beneficiaries_others:
            b["songs"].sort(key=lambda x: (x.get('title') or '').lower())



    if section == "ingresos":
        # 1) Selección de periodos (meses / semestres)
        today = today_local()
        current_month_start = date(today.year, today.month, 1)
        prev_month_start = _add_months(current_month_start, -1)

        # Mes seleccionado (YYYY-MM)
        sel_month_start = _parse_month_key((request.args.get("m") or "").strip()) or prev_month_start
        if sel_month_start > prev_month_start:
            sel_month_start = prev_month_start
        sel_month_key = _month_key(sel_month_start)

        # Cursor para pestañas de meses (ventana de 12)
        cursor_start = _parse_month_key((request.args.get("mc") or "").strip()) or sel_month_start
        if cursor_start > prev_month_start:
            cursor_start = prev_month_start
        cursor_key = _month_key(cursor_start)

        # Semestre seleccionado (YYYY-S1 / YYYY-S2)
        parsed_sem = _parse_semester_key((request.args.get("s") or "").strip())
        if parsed_sem is None:
            # Semestre anterior "cerrado"
            if today.month <= 6:
                sem_year, sem_half = today.year - 1, 2
            else:
                sem_year, sem_half = today.year, 1
        else:
            sem_year, sem_half = parsed_sem
        sem_key = _semester_key(sem_year, sem_half)
        sem_start, sem_end = _semester_range(sem_year, sem_half)

        # 2) Construcción de pestañas
        # Meses (12 últimos meses, empezando desde el cursor)
        income_month_tabs = []
        for i in range(12):
            d = _add_months(cursor_start, -i)
            key = _month_key(d)
            income_month_tabs.append(
                {
                    "key": key,
                    "label": _month_label(d),
                    "is_active": key == sel_month_key,
                    "url": url_for(
                        "discografica_view",
                        section="ingresos",
                        view="month",
                        m=key,
                        mc=cursor_key,
                        s=sem_key,
                    ),
                }
            )

        # Flechas meses
        left_cursor = _add_months(cursor_start, -1)
        income_month_prev_url = url_for(
            "discografica_view",
            section="ingresos",
            view="month",
            m=_month_key(left_cursor),
            mc=_month_key(left_cursor),
            s=sem_key,
        )
        if cursor_start < prev_month_start:
            right_cursor = _add_months(cursor_start, 1)
            income_month_next_url = url_for(
                "discografica_view",
                section="ingresos",
                view="month",
                m=_month_key(right_cursor),
                mc=_month_key(right_cursor),
                s=sem_key,
            )
        else:
            income_month_next_url = None

        # Semestres (últimos 12 semestres desde el seleccionado)
        income_semester_tabs = []
        for i in range(12):
            y, h = _add_semesters(sem_year, sem_half, -i)
            k = _semester_key(y, h)
            income_semester_tabs.append(
                {
                    "key": k,
                    "label": _semester_label(y, h),
                    "is_active": k == sem_key,
                    "url": url_for(
                        "discografica_view",
                        section="ingresos",
                        view="semester",
                        s=k,
                        m=sel_month_key,
                        mc=cursor_key,
                    ),
                }
            )

        # 3) Periodo activo (el que se está mostrando en el listado)
        if income_view == "semester":
            income_period_type = "SEMESTER"
            income_period_key = sem_key
            period_start = sem_start
            period_end = sem_end
            income_period_label = _semester_label(sem_year, sem_half)
            income_period_start_iso = period_start.isoformat()
            income_report_semesters_selected = [sem_key]
        else:
            income_period_type = "MONTH"
            income_period_key = sel_month_key
            period_start = sel_month_start
            period_end = _month_end(sel_month_start)
            income_period_label = _month_label(sel_month_start)
            income_period_start_iso = period_start.isoformat()
            income_report_months_selected = [sel_month_key]

        # 4) Opciones para informe (últimos 24 meses / 12 semestres)
        income_report_months = [
            {"key": _month_key(_add_months(prev_month_start, -i)), "label": _month_label(_add_months(prev_month_start, -i))}
            for i in range(24)
        ]

        base_sem_year, base_sem_half = (today.year - 1, 2) if today.month <= 6 else (today.year, 1)
        income_report_semesters = [
            {
                "key": _semester_key(*_add_semesters(base_sem_year, base_sem_half, -i)),
                "label": _semester_label(*_add_semesters(base_sem_year, base_sem_half, -i)),
            }
            for i in range(12)
        ]

        # 5) Canciones publicadas hasta el fin del periodo (ordenadas por artista)
        tmp_blocks: list[tuple[Artist, list[Song]]] = []
        for a in artists:
            songs = (
                session_db.query(Song)
                .join(SongArtist, Song.id == SongArtist.song_id)
                .filter(SongArtist.artist_id == a.id)
                .filter(Song.release_date <= period_end)
                .order_by(Song.release_date.desc())
                .all()
            )
            for s in songs:
                _ = s.artists
            if songs:
                tmp_blocks.append((a, songs))

        all_song_ids = [s.id for _, ss in tmp_blocks for s in (ss or [])]

        # Prefetch intérpretes (si no hay, usamos artistas del tema)
        interpreters_by_song: dict[str, list[str]] = {}
        if all_song_ids:
            irows = (
                session_db.query(SongInterpreter.song_id, SongInterpreter.name)
                .filter(SongInterpreter.song_id.in_(all_song_ids))
                .order_by(SongInterpreter.is_main.desc(), SongInterpreter.created_at.asc(), SongInterpreter.name.asc())
                .all()
            )
            for sid, name in irows:
                if sid and name:
                    interpreters_by_song.setdefault(str(sid), []).append(name)

        # Prefetch ISRC principal (AUDIO) o fallback a Song.isrc
        isrc_by_song: dict[str, str] = {}
        if all_song_ids:
            r_isrc = (
                session_db.query(SongISRCCode.song_id, SongISRCCode.code, SongISRCCode.is_primary)
                .filter(SongISRCCode.song_id.in_(all_song_ids))
                .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                .order_by(SongISRCCode.is_primary.desc(), SongISRCCode.code.desc())
                .all()
            )
            for sid, code, _prim in r_isrc:
                sid_s = str(sid)
                if sid_s not in isrc_by_song and code:
                    isrc_by_song[sid_s] = code

        # Prefetch ingresos
        entries_by_song_period: dict[tuple[str, str, date], list[SongRevenueEntry]] = {}
        sem_month_starts: list[date] = []
        if income_view == "semester":
            sem_month_starts = [_add_months(date(sem_start.year, sem_start.month, 1), i) for i in range(6)]

        if all_song_ids:
            if income_view == "month":
                q = (
                    session_db.query(SongRevenueEntry)
                    .filter(SongRevenueEntry.song_id.in_(all_song_ids))
                    .filter(SongRevenueEntry.period_type == "MONTH")
                    .filter(SongRevenueEntry.period_start == period_start)
                )
            else:
                q = (
                    session_db.query(SongRevenueEntry)
                    .filter(SongRevenueEntry.song_id.in_(all_song_ids))
                    .filter(
                        or_(
                            and_(SongRevenueEntry.period_type == "SEMESTER", SongRevenueEntry.period_start == sem_start),
                            and_(SongRevenueEntry.period_type == "MONTH", SongRevenueEntry.period_start.in_(sem_month_starts)),
                        )
                    )
                )

            erows = q.order_by(SongRevenueEntry.is_base.desc(), SongRevenueEntry.created_at.asc()).all()
            for e in erows:
                entries_by_song_period.setdefault((str(e.song_id), e.period_type, e.period_start), []).append(e)

        def _money_input(v: Decimal | None) -> str:
            if v is None:
                return ""
            try:
                return str(Decimal(v).quantize(Decimal("0.01")))
            except Exception:
                return str(v)

        # 6) Construimos bloques enriquecidos para la plantilla
        income_artist_blocks = []
        for a, songs in tmp_blocks:
            rows = []
            for s in songs:
                sid = str(s.id)

                # intérpretes
                inames = interpreters_by_song.get(sid)
                if not inames:
                    inames = [ar.name for ar in (s.artists or []) if ar and ar.name]
                interpreters_str = ", ".join(inames) if inames else ""

                # isrc
                isrc = isrc_by_song.get(sid) or (s.isrc or "")

                # entradas del periodo
                if income_view == "month":
                    entries = entries_by_song_period.get((sid, "MONTH", period_start), [])
                    base = next((x for x in entries if x.is_base), None)
                    extras = [x for x in entries if not x.is_base]

                    total_gross = sum((Decimal(x.gross or 0) for x in entries), Decimal("0"))
                    total_net = sum((Decimal(x.net or 0) for x in entries), Decimal("0"))

                    status = {"label": "Completo" if entries else "Sin datos", "class": "text-bg-success" if entries else "text-bg-danger"}

                    rows.append(
                        {
                            "song": s,
                            "cover_url": s.cover_url,
                            "interpreters": interpreters_str,
                            "isrc": isrc,
                            "status": status,
                            "base_entry_id": str(base.id) if base else "",
                            "base_gross": _money_input(base.gross) if base else "",
                            "base_net": _money_input(base.net) if base else "",
                            "extra_entries": [
                                {"id": str(x.id), "name": x.name, "gross": x.gross or 0, "net": x.net or 0}
                                for x in extras
                            ],
                            "show_total": len(extras) > 0,
                            "total_gross": total_gross,
                            "total_net": total_net,
                            "semester_sum_gross": Decimal("0"),
                            "semester_sum_net": Decimal("0"),
                            "semester_missing_months": None,
                            "semester_has_manual": False,
                        }
                    )

                else:
                    sem_entries = entries_by_song_period.get((sid, "SEMESTER", sem_start), [])
                    base = next((x for x in sem_entries if x.is_base), None)
                    extras = [x for x in sem_entries if not x.is_base]

                    # suma de meses
                    months_with_data = 0
                    sum_gross = Decimal("0")
                    sum_net = Decimal("0")
                    for ms in sem_month_starts:
                        mentries = entries_by_song_period.get((sid, "MONTH", ms), [])
                        if mentries:
                            months_with_data += 1
                        sum_gross += sum((Decimal(x.gross or 0) for x in mentries), Decimal("0"))
                        sum_net += sum((Decimal(x.net or 0) for x in mentries), Decimal("0"))

                    missing = 6 - months_with_data

                    # estado
                    if months_with_data == 0 and not sem_entries:
                        status = {"label": "Sin datos", "class": "text-bg-danger"}
                    elif missing == 0:
                        status = {"label": "Completo", "class": "text-bg-success"}
                    else:
                        status = {"label": "Incompleto", "class": "text-bg-warning"}

                    display_gross = base.gross if base else sum_gross
                    display_net = base.net if base else sum_net

                    extras_gross = sum((Decimal(x.gross or 0) for x in extras), Decimal("0"))
                    extras_net = sum((Decimal(x.net or 0) for x in extras), Decimal("0"))

                    # Total mostrado (base manual o auto + extras) solo cuando hay más de un ingreso (extras).
                    total_gross = Decimal(display_gross or 0) + extras_gross
                    total_net = Decimal(display_net or 0) + extras_net

                    rows.append(
                        {
                            "song": s,
                            "cover_url": s.cover_url,
                            "interpreters": interpreters_str,
                            "isrc": isrc,
                            "status": status,
                            "base_entry_id": str(base.id) if base else "",
                            "base_gross": _money_input(display_gross),
                            "base_net": _money_input(display_net),
                            "extra_entries": [
                                {"id": str(x.id), "name": x.name, "gross": x.gross or 0, "net": x.net or 0}
                                for x in extras
                            ],
                            "show_total": len(extras) > 0,
                            "total_gross": total_gross,
                            "total_net": total_net,
                            "semester_sum_gross": sum_gross,
                            "semester_sum_net": sum_net,
                            "semester_missing_months": missing,
                            "semester_has_manual": bool(base),
                        }
                    )

            income_artist_blocks.append((a, rows))

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
                            "audio_primary": _norm_isrc(audio_p.code) if audio_p else None,
                            "video_primary": _norm_isrc(video_p.code) if video_p else None,
                            "audio_subs": [(_norm_isrc(c.code), c.subproduct_name) for c in audio_subs],
                            "video_subs": [(_norm_isrc(c.code), c.subproduct_name) for c in video_subs],
                            "max_code": _norm_isrc(max_code),
                        }
                    )

                isrc_artist_blocks.append((a, enriched))

        elif isrc_tab == "pendientes":
            song_rows = (
                session_db.query(Song)
                .join(SongArtist, Song.id == SongArtist.song_id)
                .join(SongISRCCode, SongISRCCode.song_id == Song.id)
                .filter(ownership_cond)
                .distinct()
                .options(selectinload(Song.artists))
                .order_by(Song.release_date.desc(), Song.title.asc())
                .all()
            )
            if f_artist_id:
                song_rows = [s for s in song_rows if any(getattr(a, 'id', None) == f_artist_id for a in (s.artists or []))]
            if f_year:
                song_rows = [s for s in song_rows if getattr(s, 'release_date', None) and s.release_date.year == f_year]

            song_ids = [s.id for s in song_rows]
            status_map = {}
            if song_ids:
                status_map = {
                    row.song_id: row
                    for row in session_db.query(SongStatus).filter(SongStatus.song_id.in_(song_ids)).all()
                    if row and row.song_id
                }

            codes_by_song = defaultdict(list)
            if song_ids:
                rows = (
                    session_db.query(SongISRCCode)
                    .filter(SongISRCCode.song_id.in_(song_ids))
                    .order_by(SongISRCCode.is_primary.desc(), SongISRCCode.code.asc())
                    .all()
                )
                for row in rows:
                    codes_by_song[row.song_id].append(row)

            for song in song_rows:
                st = status_map.get(song.id) or _ensure_song_status_row(session_db, song)
                _sync_song_agedi_state(session_db, song.id, st)
                current_codes = _current_song_isrcs(session_db, song.id, include_song_field=True)
                if not current_codes:
                    continue
                registered_codes = set(_norm_isrc_list(getattr(st, 'agedi_registered_isrcs', []) or []))
                pending_codes = [code for code in current_codes if code not in registered_codes]
                if not pending_codes and bool(getattr(st, 'agedi_done', False)):
                    continue
                isrc_pending_songs.append({
                    'song': song,
                    'artists_label': ", ".join([a.name for a in (song.artists or []) if getattr(a, 'name', None)]) or '—',
                    'registered_codes': [code for code in current_codes if code in registered_codes],
                    'pending_codes': pending_codes if pending_codes else current_codes,
                    'all_codes': [
                        {
                            'code': code,
                            'registered': code in registered_codes,
                            'pending': code not in registered_codes,
                        }
                        for code in current_codes
                    ],
                    'status': st,
                })
            session_db.commit()

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
            # Reutilizamos el cálculo robusto (sin acentos) para evitar listas vacías por variantes.
            isrc_contract_artists = contract_artists

    session_db.close()
    return render_template(
        "discografica.html",
        section=section,
        artists=artists,
        contract_artists=contract_artists,
        artist_blocks=artist_blocks,
        song_audio_isrc_map=song_audio_isrc_map,
        editorial_tab=editorial_tab,
        editorial_pending_songs=editorial_pending_songs,
        editorial_registered_songs=editorial_registered_songs,
        editorial_filter_artists=editorial_filter_artists,
        # ISRC
        isrc_tab=isrc_tab,
        isrc_artist_blocks=isrc_artist_blocks,
        isrc_pending_songs=isrc_pending_songs,
        isrc_filter_artists=isrc_filter_artists,
        isrc_years=isrc_years,
        isrc_config=isrc_config,
        isrc_artist_settings=isrc_artist_settings,
        isrc_contract_artists=isrc_contract_artists,
        selected_artist_id=str(f_artist_id) if section == "isrc" and 'f_artist_id' in locals() and f_artist_id else "",
        selected_year=str(f_year) if section == "isrc" and 'f_year' in locals() and f_year else "",
        # Ingresos
        income_view=income_view,
        income_period_label=income_period_label,
        income_period_type=income_period_type,
        income_period_key=income_period_key,
        income_period_start_iso=income_period_start_iso,
        income_month_tabs=income_month_tabs,
        income_month_prev_url=income_month_prev_url,
        income_month_next_url=income_month_next_url,
        income_semester_tabs=income_semester_tabs,
        income_artist_blocks=income_artist_blocks,
        income_next_url=income_next_url,
        income_upload_report=income_upload_report,
        income_import_review=income_import_review,
        income_report_months=income_report_months,
        income_report_semesters=income_report_semesters,
        income_report_months_selected=income_report_months_selected,
        income_report_semesters_selected=income_report_semesters_selected,
        # Royalties
        royalty_period_label=royalty_period_label,
        royalty_semester_key=royalty_semester_key,
        royalty_semester_tabs=royalty_semester_tabs,
        royalty_beneficiaries_artists=royalty_beneficiaries_artists,
        royalty_beneficiaries_others=royalty_beneficiaries_others,
    )


@app.post("/discografica/isrc/config/update")
@admin_required
def discografica_isrc_config_update():
    """Guardar configuración global de ISRC (país + matrices audio/video)."""

    if not can_edit_discografica():
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

    if not can_edit_discografica():
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
    if not can_edit_discografica():
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




# -------------------------------
# Discográfica > Ingresos endpoints
# -------------------------------


@app.post("/discografica/ingresos/entry/save")
@admin_required
def discografica_income_entry_save():
    """Crea/actualiza un ingreso (base o extra) para una canción y un periodo."""

    with get_db() as session_db:
        entry_id = (request.form.get("entry_id") or "").strip()
        song_id_raw = (request.form.get("song_id") or "").strip()
        period_type = (request.form.get("period_type") or "").strip().upper()
        period_start_iso = (request.form.get("period_start") or "").strip()
        is_base = (request.form.get("is_base") or "0").strip() in ("1", "true", "True")
        name = (request.form.get("name") or "").strip() or None
        gross = _parse_money_decimal(request.form.get("gross"))
        net = _parse_money_decimal(request.form.get("net"))
        next_url = request.form.get("next") or url_for("discografica_view", section="ingresos")

        entry = None
        if entry_id:
            try:
                eid = uuid.UUID(entry_id)
            except Exception:
                flash("ID de ingreso inválido.", "danger")
                return redirect(next_url)

            entry = session_db.query(SongRevenueEntry).filter(SongRevenueEntry.id == eid).one_or_none()
            if not entry:
                flash("Ingreso no encontrado.", "warning")
                return redirect(next_url)

        sid = None
        if song_id_raw:
            try:
                sid = uuid.UUID(song_id_raw)
            except Exception:
                sid = None

        if sid is None and entry is not None:
            sid = entry.song_id

        if sid is None:
            flash("ID de canción inválido.", "danger")
            return redirect(next_url)

        ps = None
        if period_start_iso:
            try:
                ps = datetime.fromisoformat(period_start_iso).date()
            except Exception:
                ps = None

        if (not period_type or period_type not in ("MONTH", "SEMESTER")) and entry is not None:
            period_type = entry.period_type

        if ps is None and entry is not None:
            ps = entry.period_start

        if ps is None:
            inferred_type, inferred_start = _infer_income_period_from_url(next_url)
            if period_type not in ("MONTH", "SEMESTER"):
                period_type = inferred_type or period_type
            if ps is None:
                ps = inferred_start

        if period_type not in ("MONTH", "SEMESTER"):
            flash("Tipo de periodo inválido.", "danger")
            return redirect(next_url)

        if ps is None:
            flash("Periodo inválido.", "danger")
            return redirect(next_url)

        # Calcular fin de periodo
        if period_type == "MONTH":
            pe = _month_end(ps)
        else:
            if ps.month <= 6:
                pe = date(ps.year, 6, 30)
            else:
                pe = date(ps.year, 12, 31)

        # Update existing entry
        if entry is not None:
            if str(entry.song_id) != str(sid):
                flash("El ingreso no corresponde a esta canción.", "danger")
                return redirect(next_url)

            # No permitimos convertir base<->extra aquí
            if not entry.is_base:
                entry.name = name
            entry.gross = gross
            entry.net = net
            entry.period_type = period_type
            entry.period_start = ps
            entry.period_end = pe
            entry.updated_at = func.now()
            session_db.commit()
            flash("Ingreso actualizado.", "success")
            return redirect(next_url)

        # Upsert base / create extra
        if is_base:
            base = (
                session_db.query(SongRevenueEntry)
                .filter(SongRevenueEntry.song_id == sid)
                .filter(SongRevenueEntry.period_type == period_type)
                .filter(SongRevenueEntry.period_start == ps)
                .filter(SongRevenueEntry.is_base.is_(True))
                .one_or_none()
            )
            if base:
                base.gross = gross
                base.net = net
                base.period_end = pe
                base.updated_at = func.now()
            else:
                base = SongRevenueEntry(
                    song_id=sid,
                    period_type=period_type,
                    period_start=ps,
                    period_end=pe,
                    is_base=True,
                    name=None,
                    gross=gross,
                    net=net,
                )
                session_db.add(base)
            session_db.commit()
            flash("Ingresos guardados.", "success")
            return redirect(next_url)

        # Extra
        if not name:
            flash("El nombre del ingreso es obligatorio.", "danger")
            return redirect(next_url)

        extra = SongRevenueEntry(
            song_id=sid,
            period_type=period_type,
            period_start=ps,
            period_end=pe,
            is_base=False,
            name=name,
            gross=gross,
            net=net,
        )
        session_db.add(extra)
        session_db.commit()
        flash("Ingreso añadido.", "success")
        return redirect(next_url)


@app.post("/discografica/ingresos/entry/<entry_id>/delete")
@admin_required
def discografica_income_entry_delete(entry_id):
    next_url = request.form.get("next") or url_for("discografica_view", section="ingresos")
    try:
        eid = uuid.UUID(entry_id)
    except Exception:
        flash("ID de ingreso inválido.", "danger")
        return redirect(next_url)

    with get_db() as session_db:
        entry = session_db.query(SongRevenueEntry).filter(SongRevenueEntry.id == eid).one_or_none()
        if not entry:
            flash("Ingreso no encontrado.", "warning")
            return redirect(next_url)

        session_db.delete(entry)
        session_db.commit()
        flash("Ingreso eliminado.", "success")
        return redirect(next_url)


@app.post("/discografica/ingresos/upload")
@admin_required
def discografica_income_upload_csv():
    """Importa ingresos desde CSV priorizando siempre el emparejado por ISRC.

    Admite varios archivos simultáneamente y detecta automáticamente dos formatos:
    - estándar: Track / ISRC / Net Revenue o Gross Revenue
    - alternativo: PRODUCT CODE / PRICE
    """

    next_url = request.form.get("next") or url_for("discografica_view", section="ingresos")
    artist_id_raw = (request.form.get("artist_id") or "").strip()
    period_type = (request.form.get("period_type") or "").strip().upper()
    period_start_iso = (request.form.get("period_start") or "").strip()

    isrc_col = (request.form.get("isrc_col") or "").strip()
    track_col = (request.form.get("track_col") or "").strip()
    amount_col = (request.form.get("amount_col") or "").strip()
    amount_kind = (request.form.get("amount_kind") or "net").strip().lower()

    uploaded_files = [f for f in (request.files.getlist("csv_files") or []) if f and getattr(f, "filename", "")]
    if not uploaded_files:
        single = request.files.get("csv_file")
        if single and getattr(single, "filename", ""):
            uploaded_files = [single]
    if not uploaded_files:
        flash("No se ha recibido ningún archivo CSV.", "danger")
        return redirect(next_url)

    artist_id = None
    if artist_id_raw:
        try:
            artist_id = str(uuid.UUID(artist_id_raw))
        except Exception:
            artist_id = None

    if period_type not in ("MONTH", "SEMESTER"):
        inferred_type, inferred_start = _infer_income_period_from_url(next_url)
        period_type = inferred_type or period_type
        if not period_start_iso and inferred_start:
            period_start_iso = inferred_start.isoformat()

    try:
        ps = datetime.fromisoformat(period_start_iso).date()
    except Exception:
        ps = None

    if period_type not in ("MONTH", "SEMESTER"):
        flash("Tipo de periodo inválido.", "danger")
        return redirect(next_url)

    if ps is None:
        flash("Periodo inválido.", "danger")
        return redirect(next_url)

    if amount_kind not in ("net", "gross"):
        amount_kind = "net"

    if period_type == "MONTH":
        pe = _month_end(ps)
        period_label = _month_label(ps)
    else:
        pe = date(ps.year, 6, 30) if ps.month <= 6 else date(ps.year, 12, 31)
        period_label = _semester_label(ps.year, 1 if ps.month <= 6 else 2)

    try:
        import pandas as pd
    except Exception:
        flash("Falta la dependencia pandas para importar CSV.", "danger")
        return redirect(next_url)

    parsed_rows = []
    rows_total = 0
    files_processed = 0

    def _pick_existing(columns, candidates, fallback=""):
        for candidate in candidates:
            if candidate and candidate in columns:
                return candidate
        return fallback

    for uploaded in uploaded_files:
        try:
            content = uploaded.read()
            try:
                decoded = content.decode("utf-8-sig")
            except Exception:
                decoded = content.decode("latin-1")
            first_line = (decoded.splitlines() or [""])[0]
            sep = ";" if first_line.count(";") > first_line.count(",") else ","
            from io import StringIO
            df = pd.read_csv(StringIO(decoded), sep=sep)
        except Exception as e:
            flash(f"Error leyendo CSV '{getattr(uploaded, 'filename', 'archivo')}': {e}", "danger")
            return redirect(next_url)

        cols = list(df.columns)
        file_isrc_col = _pick_existing(cols, [isrc_col, "ISRC", "PRODUCT CODE", "Product Code", "Product code"])
        file_track_col = _pick_existing(cols, [track_col, "Track", "TITLE", "Title", "Song Title", "Name"])
        file_amount_col = _pick_existing(
            cols,
            [
                amount_col,
                "PRICE",
                "Price",
                "Net Revenue" if amount_kind == "net" else "Gross Revenue",
                "Gross Revenue" if amount_kind == "net" else "Net Revenue",
            ],
        )
        if not file_isrc_col or not file_amount_col:
            flash(
                f"El archivo '{getattr(uploaded, 'filename', 'archivo')}' no contiene una columna de ISRC válida ni una columna de importe compatible.",
                "danger",
            )
            return redirect(next_url)

        df["__row_number"] = range(2, len(df) + 2)
        df["__isrc"] = df[file_isrc_col].map(_clean_csv_cell).map(_norm_isrc)
        df["__amount"] = df[file_amount_col].apply(_parse_money_decimal).map(_money_norm)
        rows_total += int(len(df.index))
        files_processed += 1

        for _, row in df.iterrows():
            raw_row = {col: _clean_csv_cell(row.get(col)) for col in cols}
            parsed_rows.append(
                {
                    "file_name": getattr(uploaded, "filename", "archivo.csv"),
                    "row_number": int(row.get("__row_number") or 0),
                    "raw_row": raw_row,
                    "isrc": str(row.get("__isrc") or ""),
                    "amount": _money_norm(row.get("__amount") or 0),
                    "track": _clean_csv_cell(row.get(file_track_col)) if file_track_col else "",
                    "primary_artist": _clean_csv_cell(row.get("Primary Artist") or row.get("ARTIST") or row.get("Artist")),
                }
            )

    with get_db() as session_db:
        song_rows = session_db.query(Song.id, Song.title, Song.release_date, Song.isrc).all()
        isrc_to_song: dict[str, str] = {}
        ambiguous_isrcs: dict[str, set[str]] = defaultdict(set)

        def _register_isrc(code_val, sid_val):
            norm_code = _norm_isrc(code_val)
            sid_s = str(sid_val)
            if not norm_code:
                return
            if norm_code in ambiguous_isrcs:
                ambiguous_isrcs[norm_code].add(sid_s)
                return
            current = isrc_to_song.get(norm_code)
            if current and current != sid_s:
                ambiguous_isrcs[norm_code].update({current, sid_s})
                isrc_to_song.pop(norm_code, None)
            else:
                isrc_to_song[norm_code] = sid_s

        for sid, _title, _release_date, legacy_isrc in song_rows:
            _register_isrc(legacy_isrc, sid)

        code_rows = session_db.query(SongISRCCode.song_id, SongISRCCode.code).all()
        for sid, code in code_rows:
            _register_isrc(code, sid)

        aggregated_by_song: dict[str, dict] = {}
        unmatched_rows: list[dict] = []

        for row in parsed_rows:
            row_number = int(row.get("row_number") or 0)
            raw_row = row.get("raw_row") or {}
            norm_isrc = str(row.get("isrc") or "")
            amount = _money_norm(row.get("amount") or 0)
            track_name = row.get("track") or ""
            primary_artist_name = row.get("primary_artist") or ""
            file_name = row.get("file_name") or "archivo.csv"

            if not norm_isrc:
                unmatched_rows.append(
                    {
                        "file_name": file_name,
                        "row_number": row_number,
                        "isrc": "",
                        "track": track_name,
                        "primary_artist": primary_artist_name,
                        "reason": "Fila sin ISRC.",
                        "row": raw_row,
                        "row_json": json.dumps(raw_row, ensure_ascii=False, indent=2),
                    }
                )
                continue

            if norm_isrc in ambiguous_isrcs:
                unmatched_rows.append(
                    {
                        "file_name": file_name,
                        "row_number": row_number,
                        "isrc": norm_isrc,
                        "track": track_name,
                        "primary_artist": primary_artist_name,
                        "reason": "ISRC asociado a más de una canción en la base de datos.",
                        "row": raw_row,
                        "row_json": json.dumps(raw_row, ensure_ascii=False, indent=2),
                    }
                )
                continue

            song_id = isrc_to_song.get(norm_isrc)
            if not song_id:
                unmatched_rows.append(
                    {
                        "file_name": file_name,
                        "row_number": row_number,
                        "isrc": norm_isrc,
                        "track": track_name,
                        "primary_artist": primary_artist_name,
                        "reason": "ISRC no encontrado o no relacionado con ninguna canción.",
                        "row": raw_row,
                        "row_json": json.dumps(raw_row, ensure_ascii=False, indent=2),
                    }
                )
                continue

            bucket = aggregated_by_song.setdefault(
                song_id,
                {
                    "song_id": song_id,
                    "amount": Decimal("0"),
                    "matched_isrcs": set(),
                    "source_tracks": set(),
                    "rows": [],
                },
            )
            bucket["amount"] += amount
            bucket["matched_isrcs"].add(norm_isrc)
            if track_name:
                bucket["source_tracks"].add(track_name)
            bucket["rows"].append(
                {
                    "file_name": file_name,
                    "row_number": row_number,
                    "isrc": norm_isrc,
                    "track": track_name,
                    "primary_artist": primary_artist_name,
                    "amount": str(amount),
                }
            )

        matched_song_ids = list(aggregated_by_song.keys())
        song_meta = _serialize_income_song_meta(session_db, matched_song_ids)

        existing_entries = []
        if matched_song_ids:
            existing_entries = (
                session_db.query(SongRevenueEntry)
                .filter(SongRevenueEntry.song_id.in_([uuid.UUID(sid) for sid in matched_song_ids]))
                .filter(SongRevenueEntry.period_type == period_type)
                .filter(SongRevenueEntry.period_start == ps)
                .filter(SongRevenueEntry.is_base.is_(True))
                .all()
            )
        existing_by_song = {str(row.song_id): row for row in existing_entries}

        immediate_items = []
        conflict_items = []

        for sid, bucket in aggregated_by_song.items():
            meta = song_meta.get(sid) or {"song_title": "", "artists_label": "", "display_isrc": "", "all_isrcs": []}
            amount = _money_norm(bucket.get("amount") or 0)
            existing_entry = existing_by_song.get(sid)
            existing_value = _money_norm(getattr(existing_entry, "gross" if amount_kind == "gross" else "net", 0) if existing_entry else 0)
            item = {
                "song_id": sid,
                "song_title": meta.get("song_title") or "",
                "artists_label": meta.get("artists_label") or "",
                "display_isrc": meta.get("display_isrc") or "",
                "matched_isrcs": sorted(bucket.get("matched_isrcs") or []),
                "source_tracks": sorted(bucket.get("source_tracks") or []),
                "row_count": len(bucket.get("rows") or []),
                "rows": bucket.get("rows") or [],
                "new_value": str(amount),
                "existing_value": str(existing_value),
            }
            if existing_entry and not _money_equal(existing_value, amount):
                conflict_items.append(item)
            else:
                immediate_items.append(item)

        apply_result = _apply_income_import_items(
            session_db,
            immediate_items,
            period_type=period_type,
            period_start=ps,
            period_end=pe,
            amount_kind=amount_kind,
            strategy="replace",
        )
        session_db.commit()

        amount_kind_label = "Bruto" if amount_kind == "gross" else "Neto"
        applied_songs = []
        for action_item in apply_result.get("actions") or []:
            applied_songs.append(
                {
                    "song_id": action_item.get("song_id") or "",
                    "song_title": action_item.get("song_title") or "",
                    "artists_label": action_item.get("artists_label") or "",
                    "display_isrc": action_item.get("display_isrc") or "",
                    "amount": action_item.get("new_value") or "0.00",
                    "action": action_item.get("action") or "updated",
                }
            )

        report_payload = {
            "kind": "income_upload_report",
            "generated_at": datetime.utcnow().isoformat(),
            "artist_id": artist_id or "",
            "period_type": period_type,
            "period_start": ps.isoformat(),
            "period_end": pe.isoformat(),
            "period_label": period_label,
            "amount_kind": amount_kind,
            "amount_kind_label": amount_kind_label,
            "summary": {
                "files_total": files_processed,
                "rows_total": int(rows_total),
                "matched_songs": len(matched_song_ids),
                "created": int(apply_result.get("created") or 0),
                "updated": int(apply_result.get("updated") or 0),
                "unchanged": int(apply_result.get("unchanged") or 0),
                "replaced": 0,
                "kept": 0,
                "conflicts_pending": len(conflict_items),
                "unmatched_rows": len(unmatched_rows),
            },
            "applied_songs": applied_songs,
            "unmatched_rows": unmatched_rows,
        }

        report_token = _save_income_import_payload(report_payload, prefix="income_report")

        if conflict_items:
            review_payload = {
                "kind": "income_import_review",
                "generated_at": datetime.utcnow().isoformat(),
                "next_url": next_url,
                "period_type": period_type,
                "period_start": ps.isoformat(),
                "period_end": pe.isoformat(),
                "period_label": period_label,
                "amount_kind": amount_kind,
                "amount_kind_label": amount_kind_label,
                "report_base": report_payload,
                "conflicts": conflict_items,
            }
            review_token = _save_income_import_payload(review_payload, prefix="income_review")
            flash(
                f"Importación parcial procesada. {len(conflict_items)} canciones tienen un importe distinto y necesitan confirmación.",
                "warning",
            )
            return redirect(_update_url_query(next_url, {"upload_report": report_token, "import_review": review_token}))

    flash(
        f"CSV procesado por ISRC. Archivos: {files_processed}. Canciones con match: {report_payload['summary']['matched_songs']}. Filas sin match: {report_payload['summary']['unmatched_rows']}.",
        "success" if report_payload["summary"]["matched_songs"] else "warning",
    )
    return redirect(_update_url_query(next_url, {"upload_report": report_token}))


@app.post("/discografica/ingresos/upload/resolve")
@admin_required
def discografica_income_upload_resolve():
    next_url = request.form.get("next") or url_for("discografica_view", section="ingresos")
    review_token = (request.form.get("review_token") or "").strip()
    strategy = (request.form.get("strategy") or "keep").strip().lower()
    if strategy not in ("keep", "replace"):
        strategy = "keep"

    payload = _load_income_import_payload(review_token)
    if not payload:
        flash("La revisión de importación ya no está disponible.", "warning")
        return redirect(next_url)

    try:
        period_start = datetime.fromisoformat(payload.get("period_start") or "").date()
    except Exception:
        flash("No se pudo recuperar el periodo de la importación pendiente.", "danger")
        return redirect(next_url)

    try:
        period_end = datetime.fromisoformat(payload.get("period_end") or "").date()
    except Exception:
        if period_start.month <= 6 and payload.get("period_type") == "SEMESTER":
            period_end = date(period_start.year, 6, 30)
        elif payload.get("period_type") == "SEMESTER":
            period_end = date(period_start.year, 12, 31)
        else:
            period_end = _month_end(period_start)

    conflicts = payload.get("conflicts") or []
    amount_kind = (payload.get("amount_kind") or "net").lower()
    period_type = (payload.get("period_type") or "MONTH").upper()

    with get_db() as session_db:
        apply_result = _apply_income_import_items(
            session_db,
            conflicts,
            period_type=period_type,
            period_start=period_start,
            period_end=period_end,
            amount_kind=amount_kind,
            strategy=strategy,
        )
        session_db.commit()

    report_payload = payload.get("report_base") or {}
    summary = report_payload.setdefault("summary", {})
    summary["replaced"] = int(apply_result.get("replaced") or 0)
    summary["kept"] = int(apply_result.get("kept") or 0)
    summary["created"] = int(summary.get("created") or 0) + int(apply_result.get("created") or 0)
    summary["updated"] = int(summary.get("updated") or 0) + int(apply_result.get("updated") or 0)
    summary["unchanged"] = int(summary.get("unchanged") or 0) + int(apply_result.get("unchanged") or 0)
    summary["conflicts_pending"] = 0

    applied_songs = report_payload.setdefault("applied_songs", [])
    for action_item in apply_result.get("actions") or []:
        applied_songs.append(
            {
                "song_id": action_item.get("song_id") or "",
                "song_title": action_item.get("song_title") or "",
                "artists_label": action_item.get("artists_label") or "",
                "display_isrc": action_item.get("display_isrc") or "",
                "amount": action_item.get("new_value") or "0.00",
                "action": action_item.get("action") or strategy,
            }
        )

    report_payload["resolved_at"] = datetime.utcnow().isoformat()
    report_payload["resolution"] = strategy
    report_token = _save_income_import_payload(report_payload, prefix="income_report")
    _delete_income_import_payload(review_token)

    flash(
        "Se han reemplazado los importes conflictivos por los valores del CSV." if strategy == "replace" else "Se han mantenido los importes anteriores en las canciones conflictivas.",
        "success",
    )
    return redirect(_update_url_query(next_url, {"upload_report": report_token, "import_review": None}))


@app.route("/discografica/ingresos/informe/pdf", methods=["GET", "POST"])
@admin_required
def discografica_income_report_pdf():
    """Genera un PDF ligero del informe de ingresos.

    Cambios importantes:
    - admite GET y POST (evita URLs gigantes cuando hay muchos artistas)
    - agrega ingresos en consultas agrupadas, sin N+1 por artista
    - no descarga imágenes remotas durante el render del PDF
    - pinta el documento con canvas página a página para no retener toda la
      estructura del informe en memoria
    """

    params = request.form if request.method == "POST" else request.args

    artist_ids = params.getlist("artist_ids")
    months = params.getlist("months")
    semesters = params.getlist("semesters")
    kinds = params.getlist("kinds")

    allowed_kinds = {"discografica", "catalogo", "distribucion"}
    kinds = [k for k in kinds if k in allowed_kinds]
    if not kinds:
        kinds = ["discografica", "catalogo", "distribucion"]

    month_starts: list[date] = []
    sem_starts: list[date] = []

    for m in months:
        d = _parse_month_key(m)
        if d:
            month_starts.append(d)

    for s in semesters:
        parsed = _parse_semester_key(s)
        if parsed:
            y, h = parsed
            ss, _se = _semester_range(y, h)
            sem_starts.append(ss)

    if not month_starts and not sem_starts:
        today = today_local()
        prev = _add_months(date(today.year, today.month, 1), -1)
        month_starts = [prev]

    period_filters: list[tuple[str, date]] = [("MONTH", d) for d in month_starts] + [("SEMESTER", d) for d in sem_starts]

    def _song_kind_from_flags(is_distribution: bool, is_catalog: bool) -> str:
        if is_distribution:
            return "distribucion"
        if is_catalog:
            return "catalogo"
        return "discografica"

    def _kind_filter_expr(selected_kinds: list[str]):
        clauses = []
        if "distribucion" in selected_kinds:
            clauses.append(Song.is_distribution.is_(True))
        if "catalogo" in selected_kinds:
            clauses.append(and_(Song.is_distribution.is_(False), Song.is_catalog.is_(True)))
        if "discografica" in selected_kinds:
            clauses.append(and_(Song.is_distribution.is_(False), or_(Song.is_catalog.is_(False), Song.is_catalog.is_(None))))
        if not clauses:
            return None
        return or_(*clauses)

    def _parse_artist_ids(raw_ids: list[str]) -> list[uuid.UUID]:
        parsed: list[uuid.UUID] = []
        for raw in raw_ids or []:
            try:
                parsed.append(uuid.UUID(str(raw)))
            except Exception:
                continue
        return parsed

    selected_artist_ids = _parse_artist_ids(artist_ids)
    kind_expr = _kind_filter_expr(kinds)

    with get_db() as session_db:
        pair_query = (
            session_db.query(
                Artist.id.label("artist_id"),
                Artist.name.label("artist_name"),
                Song.id.label("song_id"),
                Song.title.label("song_title"),
                Song.release_date.label("release_date"),
                Song.is_distribution.label("is_distribution"),
                Song.is_catalog.label("is_catalog"),
                Song.isrc.label("song_isrc"),
            )
            .join(SongArtist, SongArtist.artist_id == Artist.id)
            .join(Song, Song.id == SongArtist.song_id)
        )

        if selected_artist_ids:
            pair_query = pair_query.filter(Artist.id.in_(selected_artist_ids))
        if kind_expr is not None:
            pair_query = pair_query.filter(kind_expr)

        period_ors = [and_(SongRevenueEntry.period_type == pt, SongRevenueEntry.period_start == ps) for pt, ps in period_filters]
        if period_ors:
            revenue_song_ids = (
                session_db.query(SongRevenueEntry.song_id)
                .filter(or_(*period_ors))
                .distinct()
                .subquery()
            )
            pair_query = pair_query.filter(Song.id.in_(session_db.query(revenue_song_ids.c.song_id)))

        pair_rows = (
            pair_query
            .order_by(Artist.name.asc(), Song.release_date.desc(), Song.title.asc())
            .all()
        )

        if pair_rows:
            song_ids = list({row.song_id for row in pair_rows if row.song_id})
        else:
            song_ids = []

        interpreter_map: dict[str, list[str]] = defaultdict(list)
        fallback_artist_names: dict[str, list[str]] = defaultdict(list)
        for row in pair_rows:
            sid_s = str(row.song_id)
            if row.artist_name and row.artist_name not in fallback_artist_names[sid_s]:
                fallback_artist_names[sid_s].append(row.artist_name)

        if song_ids:
            inter_rows = (
                session_db.query(SongInterpreter.song_id, SongInterpreter.name)
                .filter(SongInterpreter.song_id.in_(song_ids))
                .order_by(
                    SongInterpreter.song_id.asc(),
                    SongInterpreter.is_main.desc(),
                    SongInterpreter.created_at.asc(),
                    SongInterpreter.name.asc(),
                )
                .all()
            )
            for sid, name in inter_rows:
                sid_s = str(sid)
                clean_name = (name or "").strip()
                if clean_name and clean_name not in interpreter_map[sid_s]:
                    interpreter_map[sid_s].append(clean_name)

            isrc_map: dict[str, str] = {}
            code_rows = (
                session_db.query(SongISRCCode.song_id, SongISRCCode.code, SongISRCCode.is_primary)
                .filter(SongISRCCode.song_id.in_(song_ids))
                .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                .order_by(SongISRCCode.song_id.asc(), SongISRCCode.is_primary.desc(), SongISRCCode.code.asc())
                .all()
            )
            for sid, code, _is_primary in code_rows:
                sid_s = str(sid)
                clean_code = (code or "").strip()
                if clean_code and sid_s not in isrc_map:
                    isrc_map[sid_s] = clean_code

            sums_map: dict[str, tuple[Decimal, Decimal]] = {}
            sums_query = (
                session_db.query(
                    SongRevenueEntry.song_id,
                    func.coalesce(func.sum(SongRevenueEntry.gross), 0),
                    func.coalesce(func.sum(SongRevenueEntry.net), 0),
                )
                .filter(SongRevenueEntry.song_id.in_(song_ids))
            )
            if period_ors:
                sums_query = sums_query.filter(or_(*period_ors))
            sums_query = sums_query.group_by(SongRevenueEntry.song_id)

            for sid, gross_sum, net_sum in sums_query.all():
                sums_map[str(sid)] = (Decimal(gross_sum or 0), Decimal(net_sum or 0))
        else:
            isrc_map = {}
            sums_map = {}

        report_blocks: list[dict] = []
        block_index: dict[str, dict] = {}
        for row in pair_rows:
            artist_key = str(row.artist_id)
            block = block_index.get(artist_key)
            if block is None:
                block = {
                    "artist_name": (row.artist_name or "").strip() or "Sin artista",
                    "gross": Decimal("0"),
                    "net": Decimal("0"),
                    "rows": [],
                }
                block_index[artist_key] = block
                report_blocks.append(block)

            sid_s = str(row.song_id)
            gross_value, net_value = sums_map.get(sid_s, (Decimal("0"), Decimal("0")))
            block["gross"] += gross_value
            block["net"] += net_value

            interpreters = interpreter_map.get(sid_s) or fallback_artist_names.get(sid_s) or []
            block["rows"].append(
                {
                    "title": (row.song_title or "").strip(),
                    "interpreters": ", ".join(interpreters),
                    "isrc": isrc_map.get(sid_s) or ((row.song_isrc or "").strip()),
                    "kind": _song_kind_from_flags(bool(row.is_distribution), bool(row.is_catalog)),
                    "gross": gross_value,
                    "net": net_value,
                }
            )

    from io import BytesIO
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase.pdfmetrics import stringWidth

    kind_labels = {
        "discografica": "Discográfica",
        "catalogo": "Catálogo",
        "distribucion": "Distribución",
    }

    period_labels = []
    for d in month_starts:
        period_labels.append(_month_label(d))
    for d in sem_starts:
        half = 1 if d.month == 1 else 2
        period_labels.append(_semester_label(d.year, half))
    period_text = ", ".join(period_labels) if period_labels else "Sin periodo"

    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=landscape(A4))
    page_width, page_height = landscape(A4)

    left = 1.2 * cm
    right = page_width - (1.2 * cm)
    top = page_height - (1.0 * cm)
    bottom = 1.0 * cm
    row_h = 12

    col_widths = [6.4 * cm, 7.4 * cm, 3.2 * cm, 3.2 * cm, 3.0 * cm, 3.0 * cm]
    col_titles = ["Canción", "Intérpretes", "ISRC", "Tipo", "Bruto", "Neto"]
    col_starts = [left]
    for width in col_widths[:-1]:
        col_starts.append(col_starts[-1] + width)

    def _truncate(value: str, max_width: float, font_name: str = "Helvetica", font_size: int = 8) -> str:
        txt = (value or "").strip()
        if not txt:
            return ""
        if stringWidth(txt, font_name, font_size) <= max_width:
            return txt
        ellipsis = "…"
        while txt and stringWidth(txt + ellipsis, font_name, font_size) > max_width:
            txt = txt[:-1]
        return (txt + ellipsis) if txt else ellipsis

    def _draw_page_header() -> float:
        y = top
        pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(left, y, "Informe de ingresos")
        y -= 14
        pdf.setFont("Helvetica", 9)
        pdf.drawString(left, y, f"Periodo: {period_text}")
        y -= 8
        pdf.setStrokeColor(colors.lightgrey)
        pdf.line(left, y, right, y)
        return y - 10

    def _draw_table_header(y: float) -> float:
        pdf.setFillColor(colors.black)
        pdf.setFont("Helvetica-Bold", 8.5)
        for x, title, width in zip(col_starts, col_titles, col_widths):
            if title in ("Bruto", "Neto"):
                pdf.drawRightString(x + width - 2, y, title)
            else:
                pdf.drawString(x, y, title)
        y -= 4
        pdf.setStrokeColor(colors.grey)
        pdf.line(left, y, right, y)
        return y - 9

    y = _draw_page_header()

    if not report_blocks:
        pdf.setFont("Helvetica", 10)
        pdf.drawString(left, y, "No hay datos para los filtros seleccionados.")
    else:
        for block in report_blocks:
            artist_name = block["artist_name"]
            artist_gross = block["gross"]
            artist_net = block["net"]
            rows = block["rows"]

            if y < bottom + 32:
                pdf.showPage()
                y = _draw_page_header()

            pdf.setFont("Helvetica-Bold", 10.5)
            pdf.drawString(left, y, artist_name)
            pdf.drawRightString(right, y, f"Bruto {artist_gross:.2f} €   Neto {artist_net:.2f} €")
            y -= 12
            y = _draw_table_header(y)

            row_index = 0
            for row in rows:
                if y < bottom + row_h:
                    pdf.showPage()
                    y = _draw_page_header()
                    pdf.setFont("Helvetica-Bold", 10)
                    pdf.drawString(left, y, f"{artist_name} (cont.)")
                    pdf.drawRightString(right, y, f"Bruto {artist_gross:.2f} €   Neto {artist_net:.2f} €")
                    y -= 12
                    y = _draw_table_header(y)

                if row_index % 2 == 0:
                    pdf.setFillColorRGB(0.97, 0.97, 0.97)
                    pdf.rect(left - 2, y - 3, right - left + 4, row_h, fill=1, stroke=0)
                pdf.setFillColor(colors.black)
                pdf.setFont("Helvetica", 8)
                values = [
                    _truncate(row["title"], col_widths[0] - 4),
                    _truncate(row["interpreters"], col_widths[1] - 4),
                    _truncate(row["isrc"], col_widths[2] - 4),
                    _truncate(kind_labels.get(row["kind"], row["kind"]), col_widths[3] - 4),
                    f"{row['gross']:.2f} €",
                    f"{row['net']:.2f} €",
                ]
                for idx, (x, width, value) in enumerate(zip(col_starts, col_widths, values)):
                    if idx >= 4:
                        pdf.drawRightString(x + width - 2, y, value)
                    else:
                        pdf.drawString(x, y, value)
                y -= row_h
                row_index += 1

            y -= 8

    pdf.save()
    pdf_value = buf.getvalue()
    buf.close()

    filename = f"informe_ingresos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        pdf_value,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )



@app.get("/discografica/royalties/liquidacion/pdf")
@admin_required
def discografica_royalties_liquidation_pdf():
    """Genera y descarga la Liquidación de Royalties (PDF) para un beneficiario y semestre.

    Query params:
    - kind: ARTIST | PROMOTER
    - bid: UUID del beneficiario
    - s: semestre (YYYY-S1 / YYYY-S2)

    Al generar, se crea/actualiza el registro en royalty_liquidations con estado GENERATED.
    """

    kind = (request.args.get("kind") or "").strip().upper()
    bid_raw = (request.args.get("bid") or "").strip()
    sem_key = (request.args.get("s") or "").strip()

    parsed_sem = _parse_semester_key(sem_key)
    if not parsed_sem:
        abort(400)
    sem_year, sem_half = parsed_sem
    sem_start, sem_end = _semester_range(sem_year, sem_half)

    if kind not in ("ARTIST", "PROMOTER"):
        abort(400)

    try:
        bid = uuid.UUID(bid_raw)
    except Exception:
        abort(400)

    from io import BytesIO
    from urllib.request import urlopen

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet

    def _fetch_img(url: str, w: float, h: float):
        if not url:
            return ""
        try:
            with urlopen(url, timeout=6) as resp:
                data = resp.read()
            bio = BytesIO(data)
            img = Image(bio, width=w, height=h)
            img.hAlign = "LEFT"
            return img
        except Exception:
            return ""

    def _song_kind(song: Song) -> str:
        if song.is_distribution:
            return "distribucion"
        if song.is_catalog:
            return "catalogo"
        return "discografica"

    def _concept_variants(song: Song) -> list[str]:
        k = _song_kind(song)
        if k == "distribucion":
            return ["distribución", "distribucion"]
        if k == "catalogo":
            return ["catálogo", "catalogo"]
        return ["discográfico", "discografico", "discográfica", "discografica"]

    def _clean_filename(s: str) -> str:
        s = (s or "").strip()
        allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ "
        s = "".join(ch for ch in s if ch in allowed)
        s = "_".join([p for p in s.split() if p])
        return s or "beneficiario"

    # Meses dentro del semestre (para sumar si no hay fila SEMESTER)
    month_starts = []
    cursor = date(sem_start.year, sem_start.month, 1)
    for _ in range(6):
        month_starts.append(cursor)
        cursor = _add_months(cursor, 1)

    with get_db() as session_db:
        # Beneficiario
        if kind == "ARTIST":
            ben = session_db.get(Artist, bid)
            if not ben:
                abort(404)
            ben_name = ben.name
            ben_photo = getattr(ben, "photo_url", None)
        else:
            ben = session_db.get(Promoter, bid)
            if not ben:
                abort(404)
            ben_name = (ben.nick or (ben.first_name or "") + " " + (ben.last_name or "")).strip() or "Beneficiario"
            ben_photo = getattr(ben, "logo_url", None)

        # Canciones del beneficiario
        songs: list[Song] = []
        if kind == "ARTIST":
            songs = (
                session_db.query(Song)
                .join(SongArtist, Song.id == SongArtist.song_id)
                .filter(SongArtist.artist_id == bid)
                .options(selectinload(Song.artists))
                .order_by(Song.release_date.desc())
                .all()
            )
        else:
            sids = [
                sid
                for (sid,) in (
                    session_db.query(SongRoyaltyBeneficiary.song_id)
                    .filter(SongRoyaltyBeneficiary.promoter_id == bid)
                    .distinct()
                    .all()
                )
                if sid
            ]
            if sids:
                songs = (
                    session_db.query(Song)
                    .options(selectinload(Song.artists))
                    .filter(Song.id.in_(sids))
                    .order_by(Song.release_date.desc())
                    .all()
                )

        song_ids = [s.id for s in songs]

        # Ingresos agregados por canción (semestre: usa SEMESTER si existe, si no suma meses)
        sem_totals = {}
        month_totals = {}
        if song_ids:
            sem_totals = {
                sid: (Decimal(g or 0), Decimal(n or 0))
                for sid, g, n in (
                    session_db.query(
                        SongRevenueEntry.song_id,
                        func.sum(SongRevenueEntry.gross),
                        func.sum(SongRevenueEntry.net),
                    )
                    .filter(SongRevenueEntry.song_id.in_(song_ids))
                    .filter(func.upper(SongRevenueEntry.period_type) == "SEMESTER")
                    .filter(SongRevenueEntry.period_start == sem_start)
                    .group_by(SongRevenueEntry.song_id)
                    .all()
                )
                if sid
            }

            month_totals = {
                sid: (Decimal(g or 0), Decimal(n or 0))
                for sid, g, n in (
                    session_db.query(
                        SongRevenueEntry.song_id,
                        func.sum(SongRevenueEntry.gross),
                        func.sum(SongRevenueEntry.net),
                    )
                    .filter(SongRevenueEntry.song_id.in_(song_ids))
                    .filter(func.upper(SongRevenueEntry.period_type) == "MONTH")
                    .filter(SongRevenueEntry.period_start.in_(month_starts))
                    .group_by(SongRevenueEntry.song_id)
                    .all()
                )
                if sid
            }

        gross_map = {}
        net_map = {}
        for sid in song_ids:
            if sid in sem_totals:
                g, n = sem_totals[sid]
            else:
                g, n = month_totals.get(sid, (Decimal(0), Decimal(0)))
            gross_map[sid] = float(g or 0)
            net_map[sid] = float(n or 0)

        # Intérpretes
        interp_map = {sid: [] for sid in song_ids}
        if song_ids:
            rows = (
                session_db.query(SongInterpreter)
                .filter(SongInterpreter.song_id.in_(song_ids))
                .order_by(SongInterpreter.song_id, SongInterpreter.is_main.desc(), SongInterpreter.created_at.asc())
                .all()
            )
            for r in rows:
                if r.song_id in interp_map and r.name:
                    interp_map[r.song_id].append(r.name)
        interpreters_str = {sid: ", ".join(names) for sid, names in interp_map.items()}

        # ISRC AUDIO principal
        isrc_map = {}
        if song_ids:
            rows = (
                session_db.query(SongISRCCode.song_id, SongISRCCode.code)
                .filter(SongISRCCode.song_id.in_(song_ids))
                .filter(func.upper(SongISRCCode.kind) == "AUDIO")
                .filter(SongISRCCode.is_primary == True)  # noqa: E712
                .all()
            )
            for sid, code in rows:
                if sid and code:
                    isrc_map[sid] = code

        # Para PROMOTER: pct/base por canción (se asume 1 fila por canción y beneficiario)
        prom_pct_base = {}
        if kind == "PROMOTER" and song_ids:
            rows = (
                session_db.query(SongRoyaltyBeneficiary)
                .filter(SongRoyaltyBeneficiary.promoter_id == bid)
                .filter(SongRoyaltyBeneficiary.song_id.in_(song_ids))
                .all()
            )
            for r in rows:
                prom_pct_base[r.song_id] = (float(getattr(r, 'pct', 0) or 0), (getattr(r, 'base', 'GROSS') or 'GROSS').strip().upper())

        # Construimos filas
        rows = []
        total_amount = 0.0

        for s in songs:
            g = gross_map.get(s.id, 0.0)
            n = net_map.get(s.id, 0.0)

            # Excluir canciones sin ingresos
            if abs(float(g)) < 1e-9 and abs(float(n)) < 1e-9:
                continue

            if kind == "ARTIST":
                m, _c = _pick_artist_commitment(session_db, bid, _concept_variants(s), material_date=getattr(s, "release_date", None), as_of_date=sem_end)
                pct = float(getattr(m, 'pct_artist', 0) or 0) if m else 0.0
                base = _norm_contract_base(getattr(m, 'base', 'GROSS') or 'GROSS') if m else 'GROSS'
            else:
                pct, base = prom_pct_base.get(s.id, (0.0, 'GROSS'))
                base = (base or 'GROSS').upper()

            if base not in ('GROSS','NET','PROFIT'):
                base = 'GROSS'

            income = n if base in ('NET','PROFIT') else g
            amount = float(income) * (float(pct) / 100.0)
            total_amount += amount

            rows.append(
                {
                    'cover_url': s.cover_url,
                    'title': s.title,
                    'interpreters': (interpreters_str.get(s.id) or '').strip() or ", ".join([a.name for a in getattr(s, 'artists', [])]) or "",
                    'isrc': _norm_isrc(isrc_map.get(s.id) or s.isrc),
                    'release_date': s.release_date.strftime('%d/%m/%Y') if s.release_date else '',
                    'income': float(income or 0),
                    'pct': float(pct or 0),
                    'amount': float(amount or 0),
                }
            )

        # Upsert liquidación (si existe, mantenemos status; si no existe, queda GENERATED)
        now_dt = datetime.now(TZ_MADRID)
        rec = (
            session_db.query(RoyaltyLiquidation)
            .filter(RoyaltyLiquidation.beneficiary_kind == kind)
            .filter(RoyaltyLiquidation.beneficiary_id == bid)
            .filter(RoyaltyLiquidation.period_start == sem_start)
            .first()
        )

        if rec:
            rec.period_end = sem_end
            rec.generated_at = now_dt
            rec.updated_at = now_dt
            if not getattr(rec, 'status', None):
                rec.status = 'GENERATED'
        else:
            rec = RoyaltyLiquidation(
                beneficiary_kind=kind,
                beneficiary_id=bid,
                period_start=sem_start,
                period_end=sem_end,
                status='GENERATED',
                generated_at=now_dt,
                updated_at=now_dt,
            )
            session_db.add(rec)

        session_db.commit()

        pies_company = (
            session_db.query(GroupCompany)
            .filter(func.lower(GroupCompany.name).like('%pies%'))
            .order_by(GroupCompany.name.asc())
            .first()
        )
        pies_tax_info = (getattr(pies_company, 'tax_info', None) or 'poner los datos fiscales de la empresa del grupo PIES').strip()
        pies_logo_url = getattr(pies_company, 'logo_url', None) or None

        # ---------------- PDF ----------------
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=landscape(A4),
            leftMargin=1.2 * cm,
            rightMargin=1.2 * cm,
            topMargin=1.0 * cm,
            bottomMargin=1.0 * cm,
        )
        styles = getSampleStyleSheet()

        story = []

        logo = _fetch_img(pies_logo_url or '', 3.2 * cm, 1.3 * cm)
        if not logo:
            try:
                import os
                logo_path = os.path.join(app.root_path, 'static', 'img', 'logo.png')
                logo = Image(logo_path, width=3.2 * cm, height=1.3 * cm)
            except Exception:
                logo = ''

        title = Paragraph("<b>Liquidación de Royalties</b>", styles['Title'])
        header = Table([[logo, title]], colWidths=[4.0 * cm, None])
        header.setStyle(
            TableStyle(
                [
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (1, 0), (1, 0), 'CENTER'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(header)

        story.append(Spacer(1, 6))

        period_str = f"{_semester_label(sem_year, sem_half)} ({sem_start.strftime('%d/%m/%Y')} - {sem_end.strftime('%d/%m/%Y')})"
        info = Paragraph(
            f"<b>Beneficiario:</b> {ben_name}<br/><b>Periodo:</b> {period_str}",
            styles['Normal'],
        )
        story.append(info)
        story.append(Spacer(1, 10))

        # Tabla canciones
        def eur(v):
            try:
                return f"{float(v):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
            except Exception:
                return "0,00 €"

        data = [["", "Canción", "ISRC", "Publicación", "Ingreso", "%", "A facturar"]]

        for r in rows:
            cover = _fetch_img(r.get('cover_url') or "", 0.9 * cm, 0.9 * cm)
            title_cell = Paragraph(
                f"<b>{(r.get('title') or '').replace('<','').replace('>','')}</b><br/><font size=8>{(r.get('interpreters') or '').replace('<','').replace('>','')}</font>",
                styles['Normal'],
            )
            data.append(
                [
                    cover,
                    title_cell,
                    r.get('isrc') or "",
                    r.get('release_date') or "",
                    eur(r.get('income') or 0),
                    f"{float(r.get('pct') or 0):.2f}%",
                    eur(r.get('amount') or 0),
                ]
            )

        tbl = Table(data, colWidths=[1.2 * cm, None, 4.0 * cm, 2.6 * cm, 3.0 * cm, 1.6 * cm, 3.0 * cm])
        tbl.setStyle(
            TableStyle(
                [
                    ('BACKGROUND', (0, 0), (-1, 0), colors.whitesmoke),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 9),
                    ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
                    ('FONTSIZE', (0, 1), (-1, -1), 8),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.Color(0.98, 0.98, 0.98)]),
                ]
            )
        )
        story.append(tbl)

        story.append(Spacer(1, 10))
        total_box = Table(
            [[Paragraph(f"<para alignment='right'><b>Total a facturar:</b> {eur(total_amount)}</para>", styles['Normal'])]],
            colWidths=[8.0 * cm],
            hAlign='RIGHT',
        )
        total_box.setStyle(
            TableStyle(
                [
                    ('BOX', (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ('BACKGROUND', (0, 0), (-1, -1), colors.whitesmoke),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(total_box)
        story.append(Spacer(1, 8))
        note_style = styles['Normal']
        safe_pies_tax_info = (pies_tax_info or "poner los datos fiscales de la empresa del grupo PIES").replace("<", "").replace(">", "")
        story.append(Paragraph(f'Emitir factura a nombre de "{safe_pies_tax_info}"', note_style))
        story.append(Spacer(1, 4))
        story.append(Paragraph("<link href='https://www.piesrecords.com/facturacion'><u>Subir factura</u></link>", note_style))

        doc.build(story)
        buf.seek(0)

        sem_year_num, sem_half_num = parsed_sem
        semester_label_for_file = f"S{sem_half_num}"
        fname = f"{_clean_filename(ben_name)}_Liquidación Royalties_{semester_label_for_file}_{sem_year_num}.pdf"
        return send_file(buf, mimetype='application/pdf', as_attachment=True, download_name=fname)


@app.post("/discografica/royalties/liquidacion/status")
@admin_required
def discografica_royalties_liquidation_status():
    """Actualiza el estado de una liquidación (Generada/Enviada/Facturada/Pagado)."""

    data = request.get_json(silent=True) or {}
    kind = (data.get('kind') or '').strip().upper()
    bid_raw = (data.get('bid') or '').strip()
    sem_key = (data.get('s') or '').strip()
    status = (data.get('status') or '').strip().upper()

    if kind not in ('ARTIST','PROMOTER'):
        abort(400)

    parsed_sem = _parse_semester_key(sem_key)
    if not parsed_sem:
        abort(400)
    sem_year, sem_half = parsed_sem
    sem_start, sem_end = _semester_range(sem_year, sem_half)

    allowed = {'GENERATED','SENT','INVOICED','PAID'}
    if status not in allowed:
        abort(400)

    try:
        bid = uuid.UUID(bid_raw)
    except Exception:
        abort(400)

    now_dt = datetime.now(TZ_MADRID)

    with get_db() as session_db:
        rec = (
            session_db.query(RoyaltyLiquidation)
            .filter(RoyaltyLiquidation.beneficiary_kind == kind)
            .filter(RoyaltyLiquidation.beneficiary_id == bid)
            .filter(RoyaltyLiquidation.period_start == sem_start)
            .first()
        )
        if not rec:
            rec = RoyaltyLiquidation(
                beneficiary_kind=kind,
                beneficiary_id=bid,
                period_start=sem_start,
                period_end=sem_end,
                status=status,
                generated_at=now_dt,
                updated_at=now_dt,
            )
            session_db.add(rec)
        else:
            rec.status = status
            rec.period_end = sem_end
            rec.updated_at = now_dt

        session_db.commit()

    return jsonify({'ok': True, 'status': status})

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
    if edit and not can_edit_discografica():
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
    st = _ensure_song_status_row(session_db, s)
    st.cover_done = bool(s.cover_url)
    if st.cover_done and not getattr(st, "cover_updated_at", None):
        st.cover_updated_at = datetime.now(tz=ZoneInfo("Europe/Madrid"))
    _sync_song_agedi_state(session_db, s.id, st)
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
    for code in isrc_codes:
        setattr(code, "display_code", _norm_isrc(getattr(code, "code", None)))

    current_isrcs = _current_song_isrcs(session_db, s.id, include_song_field=True)
    agedi_registered_isrcs = _norm_isrc_list(getattr(st, "agedi_registered_isrcs", []) or [])
    agedi_pending_isrcs = [code for code in current_isrcs if code not in set(agedi_registered_isrcs)]

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

    song_type_label = _song_type_label(s)
    song_type_badge_class = _song_type_badge_class(s)

    # =====================
    # TAB: ROYALTIES
    # =====================
    royalties_artist = None
    royalty_other_beneficiaries = []
    radio_total_spins = 0
    radio_station_rows = []
    song_income_groups = []
    song_income_group_mode = (request.args.get("period_mode") or "semester").strip().lower()
    if song_income_group_mode not in ("semester", "month", "year"):
        song_income_group_mode = "semester"
    song_income_total_gross = Decimal("0")
    song_income_total_net = Decimal("0")
    song_income_entries = []

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

            m, c = _pick_artist_commitment(session_db, primary_artist.id, concept_variants, material_date=getattr(s, "release_date", None), as_of_date=today_local())
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

    if tab == "ingresos":
        rows = (
            session_db.query(SongRevenueEntry)
            .filter(SongRevenueEntry.song_id == s.id)
            .order_by(SongRevenueEntry.period_start.desc(), SongRevenueEntry.is_base.desc(), SongRevenueEntry.created_at.asc())
            .all()
        )
        grouped = defaultdict(lambda: {"rows": [], "total_gross": Decimal("0"), "total_net": Decimal("0"), "sort_key": None, "label": ""})
        for row in rows:
            gross = Decimal(row.gross or 0)
            net = Decimal(row.net or 0)
            song_income_total_gross += gross
            song_income_total_net += net

            ps = getattr(row, "period_start", None)
            if song_income_group_mode == "month":
                group_key = f"month:{ps.isoformat() if ps else 'na'}"
                group_label = _month_label(ps) if ps else "Sin fecha"
                sort_key = ps or date.min
            elif song_income_group_mode == "year":
                year_val = ps.year if ps else 0
                group_key = f"year:{year_val}"
                group_label = str(year_val) if year_val else "Sin fecha"
                sort_key = date(year_val, 1, 1) if year_val else date.min
            else:
                if ps:
                    half = 1 if ps.month <= 6 else 2
                    group_key = f"semester:{ps.year}-S{half}"
                    group_label = _semester_label(ps.year, half)
                    sort_key = _semester_range(ps.year, half)[0]
                else:
                    group_key = "semester:na"
                    group_label = "Sin fecha"
                    sort_key = date.min

            grouped[group_key]["rows"].append({
                "id": str(row.id),
                "name": (row.name or ("Base" if row.is_base else "Ingreso")),
                "is_base": bool(row.is_base),
                "period_type": row.period_type,
                "period_start": ps,
                "period_end": getattr(row, "period_end", None),
                "period_label": _month_label(ps) if row.period_type == "MONTH" and ps else (_semester_label(ps.year, 1 if ps.month <= 6 else 2) if ps else ""),
                "gross": gross,
                "net": net,
            })
            grouped[group_key]["total_gross"] += gross
            grouped[group_key]["total_net"] += net
            grouped[group_key]["sort_key"] = sort_key
            grouped[group_key]["label"] = group_label

        song_income_groups = sorted(
            [
                {
                    "key": key,
                    "label": data["label"],
                    "rows": data["rows"],
                    "total_gross": data["total_gross"],
                    "total_net": data["total_net"],
                    "sort_key": data["sort_key"],
                }
                for key, data in grouped.items()
            ],
            key=lambda item: item.get("sort_key") or date.min,
            reverse=True,
        )
        song_income_entries = rows

    if tab == "radio":
        radio_total_spins = int(
            session_db.query(func.coalesce(func.sum(Play.spins), 0))
            .filter(Play.song_id == s.id)
            .scalar()
            or 0
        )

        rows = (
            session_db.query(
                RadioStation.id,
                RadioStation.name,
                RadioStation.logo_url,
                func.coalesce(func.sum(Play.spins), 0).label("total_spins"),
            )
            .join(Play, Play.station_id == RadioStation.id)
            .filter(Play.song_id == s.id)
            .group_by(RadioStation.id, RadioStation.name, RadioStation.logo_url)
            .order_by(text("total_spins DESC"), RadioStation.name.asc())
            .all()
        )

        radio_station_rows = [
            {
                "station_id": str(station_id),
                "name": name,
                "logo_url": logo_url,
                "total_spins": int(total_spins or 0),
            }
            for station_id, name, logo_url, total_spins in rows
        ]

    # Editorial (solo si se pide esa pestaña)
    editorial_shares = []
    editorial_total_pct = 0.0
    if tab == "editorial":
        shares = (
            session_db.query(SongEditorialShare)
            .options(joinedload(SongEditorialShare.promoter).joinedload(Promoter.publishing_company))
            .filter(SongEditorialShare.song_id == s.id)
            .order_by(SongEditorialShare.created_at.asc())
            .all()
        )

        for sh in shares:
            p = sh.promoter
            full_name = " ".join([x for x in [(p.first_name or "").strip(), (p.last_name or "").strip()] if x]).strip()
            if not full_name:
                full_name = (p.nick or "").strip()
            pub = p.publishing_company
            publisher_name = (pub.name or "").strip() if pub else ""

            pct_val = float(sh.pct or 0)
            editorial_total_pct += pct_val
            editorial_shares.append({
                "id": str(sh.id),
                "promoter_id": str(p.id),
                "full_name": full_name,
                "first_name": (p.first_name or ""),
                "last_name": (p.last_name or ""),
                "nick": (p.nick or ""),
                "publisher_id": str(pub.id) if pub else "",
                "publisher_name": publisher_name,
                "contact_email": (p.contact_email or ""),
                "contact_phone": (p.contact_phone or ""),
                "role": (sh.role or "").upper(),
                "pct": pct_val,
            })

    session_db.expunge_all()
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
        current_isrcs=current_isrcs,
        agedi_registered_isrcs=agedi_registered_isrcs,
        agedi_pending_isrcs=agedi_pending_isrcs,
        song_type_label=song_type_label,
        song_type_badge_class=song_type_badge_class,
        days_remaining=days_remaining,
        default_copyright=default_copyright,
        royalties_artist=royalties_artist,
        royalty_other_beneficiaries=royalty_other_beneficiaries,
        radio_total_spins=radio_total_spins,
        radio_station_rows=radio_station_rows,
        editorial_shares=editorial_shares,
        editorial_total_pct=round(editorial_total_pct, 2),
        editorial_remaining_pct=round(max(0.0, 100.0 - editorial_total_pct), 2),
        editorial_sgae_modification_pending=bool(getattr(st, "sgae_modification_pending", False)),
        song_income_group_mode=song_income_group_mode,
        song_income_groups=song_income_groups,
        song_income_total_gross=song_income_total_gross,
        song_income_total_net=song_income_total_net,
        song_income_entries=song_income_entries,
    )




@app.post("/discografica/canciones/<song_id>/editorial/share/save")
@admin_required
def discografica_song_editorial_share_save(song_id):
    """Crea/edita un autor/compositor de la pestaña Editorial."""

    if not can_edit_discografica():
        return forbid("No tienes permisos para editar la pestaña Editorial.")

    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        share_id = (request.form.get("share_id") or "").strip() or None
        promoter_id = (request.form.get("promoter_id") or "").strip() or None

        first_name = (request.form.get("first_name") or "").strip()
        last_name = (request.form.get("last_name") or "").strip()
        contact_email = (request.form.get("contact_email") or "").strip() or None
        contact_phone = (request.form.get("contact_phone") or "").strip() or None

        role = (request.form.get("role") or "").strip().upper()
        if role not in ("AUTHOR", "COMPOSER", "AUTHOR_COMPOSER"):
            flash("Tipo no válido (Autor/Compositor/Autor y compositor).", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

        pct = _parse_pct(request.form.get("pct"))

        # Editorial (compañía)
        pub_id = (request.form.get("publishing_company_id") or "").strip() or None
        pub_name = (request.form.get("publishing_company_name") or "").strip() or None

        publishing_company = None
        if pub_id:
            publishing_company = session_db.get(PublishingCompany, to_uuid(pub_id))
        elif pub_name:
            # Crear sobre la marcha si viene un nombre y no hay id
            existing = (
                session_db.query(PublishingCompany)
                .filter(func.lower(PublishingCompany.name) == pub_name.lower())
                .first()
            )
            if existing:
                publishing_company = existing
            else:
                publishing_company = PublishingCompany(name=pub_name)
                session_db.add(publishing_company)
                session_db.flush()

        if publishing_company is None:
            flash("Selecciona o crea una compañía editorial.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

        # Resolver/crear tercero
        promoter = None
        if promoter_id:
            promoter = session_db.get(Promoter, to_uuid(promoter_id))
            if not promoter:
                flash("Tercero no encontrado.", "warning")
                return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
        else:
            if not first_name and not last_name:
                flash("Indica Nombre y/o Apellidos para crear el autor/compositor.", "warning")
                return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
            nick_base = (f"{first_name} {last_name}".strip() or first_name or last_name).strip()
            nick = nick_base
            # garantizar unicidad
            i = 2
            while session_db.query(Promoter).filter(func.lower(Promoter.nick) == nick.lower()).first():
                nick = f"{nick_base} ({i})"
                i += 1
            promoter = Promoter(nick=nick)
            session_db.add(promoter)
            session_db.flush()

        # Actualizar datos extendidos del tercero (solo si vienen informados)
        if first_name:
            promoter.first_name = first_name
        if last_name:
            promoter.last_name = last_name
        if contact_email is not None and contact_email != "":
            promoter.contact_email = contact_email
        if contact_phone is not None and contact_phone != "":
            promoter.contact_phone = contact_phone
        if publishing_company is not None:
            promoter.publishing_company_id = publishing_company.id

        # Validar suma de porcentajes (<= 100)
        q = session_db.query(func.coalesce(func.sum(SongEditorialShare.pct), 0)).filter(SongEditorialShare.song_id == sid)
        if share_id:
            q = q.filter(SongEditorialShare.id != to_uuid(share_id))
        current_total = float(q.scalar() or 0)
        if current_total + pct > 100.0001:
            flash(f"La suma de porcentajes no puede superar el 100%. Total actual: {round(current_total,2)}%.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

        if share_id:
            sh = session_db.get(SongEditorialShare, to_uuid(share_id))
            if not sh or sh.song_id != sid:
                flash("Registro editorial no encontrado.", "warning")
                return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
            sh.promoter_id = promoter.id
            sh.role = role
            sh.pct = pct
            sh.updated_at = datetime.now(TZ_MADRID)
            session_db.add(sh)
        else:
            sh = SongEditorialShare(
                song_id=sid,
                promoter_id=promoter.id,
                role=role,
                pct=pct,
                created_at=datetime.now(TZ_MADRID),
                updated_at=datetime.now(TZ_MADRID),
            )
            session_db.add(sh)

        session_db.add(promoter)
        _mark_song_sgae_pending_from_editorial_change(session_db, sid)
        session_db.commit()
        flash("Autor/Compositor guardado.", "success")
        return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando editorial: {e}", "danger")
        return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
    finally:
        session_db.close()


@app.post("/discografica/canciones/<song_id>/editorial/share/<share_id>/delete")
@admin_required
def discografica_song_editorial_share_delete(song_id, share_id):
    """Elimina un autor/compositor de la pestaña Editorial."""

    if not can_edit_discografica():
        return forbid("No tienes permisos para eliminar autores/compositores.")

    session_db = db()
    try:
        sid = to_uuid(song_id)
        sh = session_db.get(SongEditorialShare, to_uuid(share_id))
        if not sh or sh.song_id != sid:
            flash("Registro editorial no encontrado.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

        session_db.delete(sh)
        _mark_song_sgae_pending_from_editorial_change(session_db, sid)
        session_db.commit()
        flash("Autor/Compositor eliminado.", "success")
        return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando autor/compositor: {e}", "danger")
        return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
    finally:
        session_db.close()


@app.post("/discografica/canciones/<song_id>/editorial/declaration/upload")
@admin_required
def discografica_song_declaration_upload(song_id):
    if not can_edit_discografica():
        return forbid("No tienes permisos para subir documentos.")

    session_db = db()
    try:
        s = session_db.get(Song, to_uuid(song_id))
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        f = request.files.get("declaration_pdf")
        url = upload_pdf(f, "song_declarations")
        if not url:
            flash("Selecciona un PDF.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))

        s.work_declaration_url = url
        s.work_declaration_uploaded_at = datetime.now(TZ_MADRID)
        session_db.add(s)
        _mark_song_sgae_pending_from_editorial_change(session_db, s.id)
        session_db.commit()
        flash("Declaración de obra subida.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error subiendo PDF: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id, tab="editorial"))


@app.post("/discografica/canciones/<song_id>/editorial/agedi/register")
@admin_required
def discografica_song_agedi_register(song_id):
    if not can_edit_discografica():
        return forbid("No tienes permisos para actualizar AGEDI.")

    nxt = safe_next_or(request.form.get("next") or url_for("discografica_view", section="isrc", isrc_tab="pendientes"))
    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        _mark_song_agedi_registered(session_db, sid)
        session_db.commit()
        flash("Marcada como registrada en AGEDI.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error marcando AGEDI: {e}", "danger")
    finally:
        session_db.close()

    return redirect(nxt)


@app.post("/discografica/canciones/<song_id>/editorial/sgae/register")
@admin_required
def discografica_song_sgae_register(song_id):
    if not can_edit_discografica():
        return forbid("No tienes permisos para actualizar SGAE.")

    nxt = safe_next_or(request.form.get("next") or url_for("discografica_song_detail", song_id=song_id, tab="editorial"))
    session_db = db()
    try:
        sid = to_uuid(song_id)
        s = session_db.get(Song, sid)
        if not s:
            flash("Canción no encontrada.", "warning")
            return redirect(url_for("discografica_view", section="canciones"))

        _mark_song_sgae_registered(session_db, sid)
        session_db.commit()
        flash("Marcado como registrado en SGAE.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error marcando SGAE: {e}", "danger")
    finally:
        session_db.close()

    return redirect(nxt)


@app.post("/discografica/canciones/<song_id>/status/toggle")
@admin_required
def discografica_song_status_toggle(song_id):
    """Toggle de iconos de estado (excepto portada, que es automática)."""

    if not can_edit_discografica():
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
        now_dt = datetime.now(TZ_MADRID)

        if key == "agedi":
            if current:
                st.agedi_done = False
                st.agedi_updated_at = now_dt
                st.updated_at = now_dt
            else:
                _mark_song_agedi_registered(session_db, sid)
        elif key == "sgae":
            if current:
                st.sgae_done = False
                st.sgae_modification_pending = False
                st.sgae_updated_at = now_dt
                st.updated_at = now_dt
            else:
                _mark_song_sgae_registered(session_db, sid)
        else:
            setattr(st, done_attr, not current)
            setattr(st, ts_attr, now_dt)
            st.updated_at = now_dt
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

    if not can_edit_discografica():
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
    if not can_edit_discografica():
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
            code = _norm_isrc(manual_code)

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
            code=_norm_isrc(code),
            is_primary=is_primary,
            subproduct_name=subproduct_name,
            year=year_full,
            sequence_num=seq,
        )
        session_db.add(rec)

        # Mantener compatibilidad: guardar el ISRC principal de AUDIO en songs.isrc
        if kind == "AUDIO" and is_primary:
            s.isrc = _norm_isrc(code)

        _sync_song_agedi_state(session_db, sid)
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
    if not can_edit_discografica():
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
                    s.isrc = _norm_isrc(other.code) if other else None

            _sync_song_agedi_state(session_db, sid)
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
    if not can_edit_discografica():
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
        s.isrc = _norm_isrc((request.form.get("isrc") or "").strip() or None)

        cover = request.files.get("cover")
        if cover and getattr(cover, "filename", ""):
            s.cover_url = upload_image(cover, "songs")

        _sync_song_agedi_state(session_db, s.id)
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
    if not can_edit_discografica():
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

        pub = None
        if getattr(p, "publishing_company_id", None):
            pub = session_db.get(PublishingCompany, p.publishing_company_id)

        return jsonify(
            {
                "id": str(p.id),
                "nick": (p.nick or "").strip(),
                "logo_url": p.logo_url,
                "tax_id": (p.tax_id or "").strip(),
                "first_name": (p.first_name or "").strip(),
                "last_name": (p.last_name or "").strip(),
                "contact_email": (p.contact_email or "").strip(),
                "contact_phone": (p.contact_phone or "").strip(),
                "publishing_company_id": str(pub.id) if pub else "",
                "publishing_company_name": (pub.name or "") if pub else "",
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

    if not can_edit_discografica():
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




@app.post("/discografica/canciones/<song_id>/royalties/beneficiaries/<beneficiary_id>/delete")
@admin_required
def discografica_song_royalty_beneficiary_delete(song_id, beneficiary_id):
    """Elimina un 'otro beneficiario' de Royalties (no borra el tercero)."""

    if not can_edit_discografica():
        return forbid("No tienes permisos para eliminar beneficiarios.")

    session_db = db()
    try:
        sid = to_uuid(song_id)
        b = session_db.get(SongRoyaltyBeneficiary, to_uuid(beneficiary_id))
        if not b or b.song_id != sid:
            flash("Beneficiario no encontrado.", "warning")
            return redirect(url_for("discografica_song_detail", song_id=song_id, tab="royalties"))

        session_db.delete(b)
        session_db.commit()
        flash("Beneficiario eliminado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando beneficiario: {e}", "danger")
    finally:
        session_db.close()

    return redirect(url_for("discografica_song_detail", song_id=song_id, tab="royalties"))

# ---------- CANCIONES (LEGACY) ----------
@app.route("/canciones", methods=["GET", "POST"])
@admin_required
def songs_view():
    session_db = db()
    artists = session_db.query(Artist).order_by(Artist.name.asc()).all()

    # Solo artistas con contrato Discográfico / Catálogo / Distribución (para alta de canciones)
    contract_artist_ids = _artist_ids_with_discography_contracts(session_db)
    create_artists = [a for a in artists if a.id in contract_artist_ids]



    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in CONCERT_SALE_TYPES_ALL_SET]
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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
    return render_template("songs.html", artists=artists, create_artists=create_artists, artist_blocks=artist_blocks)

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
    next_url = (request.form.get("next") or "").strip()
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
    return redirect(safe_next_or(next_url or url_for("songs_view")))

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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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
    next_url = (request.form.get("next") or "").strip() or url_for("promoters_view")
    if not p:
        flash("Promotor no encontrado.", "warning")
        session.close()
        return redirect(next_url)
    p.nick = request.form.get("nick", p.nick).strip()
    p.tax_id = (request.form.get("tax_id") or p.tax_id or "").strip() or None
    p.contact_email = (request.form.get("contact_email") or p.contact_email or "").strip() or None
    p.contact_phone = (request.form.get("contact_phone") or p.contact_phone or "").strip() or None
    logo = request.files.get("logo")
    try:
        if logo and logo.filename:
            p.logo_url = upload_image(logo, "promoters")
        session.commit()
        flash("Tercero actualizado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(next_url)

@app.post("/promotores/<pid>/delete")


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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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
from email.message import EmailMessage
from difflib import SequenceMatcher
from collections import defaultdict


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
    """Normaliza base a GROSS/NET/PROFIT. Vacío -> None."""
    v = (val or "").strip().upper()
    if not v:
        return None
    if v in ("NET", "NETO"):
        return "NET"
    if v in ("PROFIT", "BENEFIT", "BENEFICIO", "EMPRESA"):
        return "PROFIT"
    if v in ("GROSS", "BRUTO"):
        return "GROSS"
    # fallback
    return "GROSS"


def _norm_status(val: str | None) -> str:
    v = (val or "").strip().upper()
    if v in ("BORRADOR", "CONFIRMADO", "RESERVADO", "HABLADO"):
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
        promoter_id = to_uuid(r["id"])
        promoter_company_id = to_uuid(r.get("company_id") or None)
        session.add(
            ConcertPromoterShare(
                concert_id=concert_id,
                promoter_id=promoter_id,
                promoter_company_id=promoter_company_id,
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
                promoter_company_id=to_uuid(r.get("company_id") or None),
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
    - UI simplificada: 3 opciones mutuamente excluyentes:
        * equipment_option=INCLUDED        -> Equipos incluidos
        * equipment_option=PROMOTER        -> Promotor cubre equipos
        * equipment_option=FESTIVAL_RIDER  -> Rider de festival
      (opcional: si no se marca nada, se elimina el resumen)

    - Se mantiene compatibilidad con el formulario legacy para no romper despliegues antiguos:
        equipment_included[], equipment_other, equipment_covered, equipment_covered_mode, equipment_covered_amount
    """

    eq = session.query(ConcertEquipment).filter_by(concert_id=concert_id).first()

    # 1) Nuevo formulario
    opt = (request.form.get("equipment_option") or "").strip().upper()
    if opt in ("INCLUDED", "PROMOTER", "FESTIVAL_RIDER"):
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
        elif opt == "FESTIVAL_RIDER":
            eq.covered_by_promoter = True
            eq.covered_mode = "RIDER"
            eq.covered_amount = None
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
        promoters = s.query(Promoter).options(selectinload(Promoter.companies)).order_by(Promoter.nick.asc()).all()
        companies = s.query(GroupCompany).order_by(GroupCompany.name.asc()).all()
        all_concert_tags = _collect_all_concert_tags(s)
        type_choices = [(k, CONCERT_SALE_TYPE_LABELS.get(k, k)) for k in CONCERTS_SECTION_ORDER]

        active_tab = (request.args.get("tab") or "vista").lower()
        if active_tab not in ("vista", "alta", "facturacion"):
            active_tab = "vista"

        if active_tab == "alta" and not can_edit_concerts() and not is_master():
            active_tab = "vista"

        f_artist_ids_raw = request.args.getlist("artist") or []
        f_sale_types_raw = request.args.getlist("type") or []
        f_statuses_raw = request.args.getlist("status") or []
        f_when_raw = request.args.getlist("when") or []
        f_announcements_raw = request.args.getlist('announcement') or []
        f_concert_tags = _dedupe_concert_tags(request.args.getlist("concert_tag") or request.args.getlist("hashtag") or [])

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
        f_announcements = [(x or '').strip().upper() for x in f_announcements_raw if (x or '').strip()]

        f_when = {(x or "").strip().upper() for x in f_when_raw if (x or "").strip()}
        allowed_when = {"PAST", "FUTURE"}
        f_when = {x for x in f_when if x in allowed_when}
        if not f_when:
            f_when = {"PAST", "FUTURE"} if active_tab == 'facturacion' else {"FUTURE"}

        allowed_sale_types = CONCERT_SALE_TYPES_ALL_SET
        allowed_statuses = {"BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO"}
        allowed_announcements = {'NO_ANNOUNCE', 'UPCOMING', 'ANNOUNCED', 'NONE'}

        f_sale_types = [x for x in f_sale_types if x in allowed_sale_types]
        f_statuses = [x for x in f_statuses if x in allowed_statuses]
        f_announcements = [x for x in f_announcements if x in allowed_announcements]

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
                billing_company_raw = (request.form.get("billing_company_id") or "").strip()
                concert_tags = _dedupe_concert_tags(request.form.getlist("concert_tags[]"))

                c = Concert(
                    date=parse_date(request.form.get("date") or ""),
                    festival_name=(request.form.get("festival_name") or "").strip() or None,
                    venue_id=to_uuid(venue_raw),
                    sale_type=sale_type,
                    promoter_id=(to_uuid(promoter_raw) if sale_type in ("VENDIDO", "GRATUITO", "GIRAS_COMPRADAS") and promoter_raw else None),
                    group_company_id=None,
                    billing_company_id=(to_uuid(billing_company_raw) if billing_company_raw else None),
                    artist_id=to_uuid((request.form.get("artist_id") or "").strip()),
                    capacity=int(request.form.get("capacity") or 0),
                    sale_start_date=parse_concert_sale_start_date(request.form.get("sale_start_date"), sale_type),
                    break_even_ticket=(None if sale_type in ("VENDIDO", "GRATUITO") else be_val),
                    sold_out=False,
                    status=_norm_status(request.form.get("status")),
                    hashtags=concert_tags,
                )

                s.add(c)
                s.flush()

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

                _add_contracts_from_request(s, c.id)
                _add_concert_notes_from_request(s, c.id)
                _upsert_equipment_from_request(s, c.id)
                _add_equipment_docs_from_request(s, c.id)
                _add_equipment_notes_from_request(s, c.id)

                s.commit()
                flash("Concierto creado.", "success")
                target_when = "PAST" if (c.date and c.date < today_local()) else "FUTURE"
                return redirect(url_for("concerts_view", tab="vista", when=target_when) + f"#concert-{c.id}")

            except Exception as e:
                s.rollback()
                flash(f"Error creando concierto: {e}", "danger")
                return redirect(url_for("concerts_view", tab="alta"))

        q = (
            s.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.promoter_company),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter_company),
                selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter_company),
                selectinload(Concert.caches),
                selectinload(Concert.contracts),
                selectinload(Concert.contract_sheet),
                selectinload(Concert.artwork_request).selectinload(ConcertArtworkRequest.assets),
                selectinload(Concert.notes),
                selectinload(Concert.equipment),
                selectinload(Concert.equipment_documents),
                selectinload(Concert.equipment_notes),
                selectinload(Concert.ticket_types),
            )
        )

        if f_artist_ids:
            q = q.filter(Concert.artist_id.in_(f_artist_ids))
        if f_sale_types:
            q = q.filter(Concert.sale_type.in_(f_sale_types))
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
        if f_concert_tags:
            concerts = [c for c in concerts if _concert_matches_any_tag(c, f_concert_tags)]
        if f_announcements:
            concerts = [c for c in concerts if _announcement_state(c, today) in f_announcements]

        for c in concerts:
            setattr(c, "tags_clean", _concert_tags(c))
            setattr(c, "sale_type_label", _sale_type_label(c.sale_type))
            setattr(c, 'announcement_badge', _announcement_badge(c, today))
            setattr(c, 'announcement_state', _announcement_state(c, today))
            setattr(c, 'contract_sheet_badge', _contract_sheet_badge(getattr(c, 'contract_sheet', None)))
            setattr(c, 'contract_sheet_status', _contract_sheet_status(getattr(c, 'contract_sheet', None)))
            setattr(c, 'location_summary', _concert_location_summary(c))

        billing_items = []
        for c in concerts:
            pending_rows = _concert_payment_rows(c, pending_only=True)
            if not pending_rows:
                continue
            billing_items.append({
                'concert': c,
                'payment_rows': pending_rows,
                'pending_total': sum(float(x.get('amount') or 0) for x in pending_rows),
                'income_total': _concert_payment_total(c, pending_only=False),
            })
        billing_items.sort(key=lambda item: _concert_billing_sort_key(item['concert'], today))

        sections = {k: [] for k in CONCERTS_SECTION_ORDER}
        for c in concerts:
            sections.setdefault(c.sale_type or "EMPRESA", []).append(c)

        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        promoters_payload = [
            {
                'id': str(p.id),
                'nick': (p.nick or '').strip(),
                'logo_url': (p.logo_url or '').strip(),
                'companies': [_serialize_promoter_company(x) for x in (p.companies or [])],
            }
            for p in promoters
        ]

        return render_template(
            "concerts.html",
            active_tab=active_tab,
            artists=artists,
            venues=venues,
            promoters=promoters,
            promoters_payload=promoters_payload,
            companies=companies,
            concerts=concerts,
            billing_items=billing_items,
            sections=sections,
            order=CONCERTS_SECTION_ORDER,
            titles=CONCERTS_SECTION_TITLE,
            type_choices=type_choices,
            all_concert_tags=all_concert_tags,
            f_concert_tags=f_concert_tags,
            f_artist_ids=[str(x) for x in f_artist_ids],
            f_sale_types=f_sale_types,
            f_statuses=f_statuses,
            f_when=sorted(list(f_when)),
            f_announcements=f_announcements,
        )
    finally:
        s.close()




# ---------- FICHA CONCIERTO ----------
@app.get("/conciertos/<cid>", endpoint="concert_detail_view")
@admin_required
def concert_detail_view(cid):
    session = db()
    try:
        c = (
            session.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.promoter_company),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
                selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter_company),
                selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter),
                selectinload(Concert.zone_agents).joinedload(ConcertZoneAgent.promoter_company),
                selectinload(Concert.caches),
                selectinload(Concert.contracts),
                selectinload(Concert.contract_sheet),
                selectinload(Concert.notes),
                selectinload(Concert.equipment),
                selectinload(Concert.equipment_documents),
                selectinload(Concert.equipment_notes),
                selectinload(Concert.ticket_types),
                selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
                joinedload(Concert.sales_config),
            )
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(url_for("concerts_view", tab="vista"))

        setattr(c, "tags_clean", _concert_tags(c))
        setattr(c, "sale_type_label", _sale_type_label(c.sale_type))

        today = today_local()
        totals_map, today_map, last_map, gross_map, gross_today_map = sales_maps_unified(session, today, [c.id])
        capacity_sale = _concert_capacity_from_ticket_types(c)
        sold_total = int(totals_map.get(c.id, 0) or 0)
        sold_today = int(today_map.get(c.id, 0) or 0)
        gross_total = float(gross_map.get(c.id, 0.0) or 0.0)
        gross_today = float(gross_today_map.get(c.id, 0.0) or 0.0)
        sales_pct = round((sold_total * 100.0 / capacity_sale), 1) if capacity_sale else 0.0
        remaining_tickets = max(0, int(capacity_sale or 0) - sold_total)

        sales_cfg = getattr(c, "sales_config", None)
        vat_pct = float(getattr(sales_cfg, "vat_pct", 0) or 0) if sales_cfg else 0.0
        sgae_pct = float(getattr(sales_cfg, "sgae_pct", 0) or 0) if sales_cfg else 0.0
        net_breakdown = _sales_net_breakdown(gross_total, vat_pct, sgae_pct)

        tab = (request.args.get("tab") or "general").strip().lower()
        if tab not in {"general", "invitations", "ficha", "carteleria"}:
            tab = "general"

        sheet = c.contract_sheet
        contract_sheet_data = _contract_sheet_prefill(c, sheet) if sheet else {}
        contract_sheet_sections = _contract_sheet_sections(contract_sheet_data) if sheet else []
        invitation_rows = list(getattr(c, 'invitations_json', None) or [])
        invitation_totals = {
            'artist': sum(int(x.get('artist_qty') or 0) for x in invitation_rows),
            'office': sum(int(x.get('office_qty') or 0) for x in invitation_rows),
        }
        invitation_totals['total'] = invitation_totals['artist'] + invitation_totals['office']
        payment_terms = _concert_payment_rows(c, pending_only=False)
        payment_pending = _concert_payment_total(c, pending_only=True)
        payment_total_configured = _concert_payment_total(c, pending_only=False)

        artwork_request = getattr(c, 'artwork_request', None)
        artwork_needs_refresh = _artwork_request_has_event_changes(artwork_request, c) if artwork_request else False
        if artwork_request:
            artwork_request.needs_refresh = bool(artwork_needs_refresh or getattr(artwork_request, 'needs_refresh', False))
        artwork_assets = list(getattr(artwork_request, 'assets', None) or []) if artwork_request else []
        artwork_company_ids = set(str(x) for x in ((artwork_request.group_company_ids if artwork_request else None) or []))
        artwork_ticketer_ids = set(str(x) for x in ((artwork_request.ticketer_ids if artwork_request else None) or []))
        artwork_companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()
        artwork_ticketers = session.query(Ticketer).order_by(Ticketer.name.asc()).all()

        return render_template(
            "concert_detail.html",
            concert=c,
            tab=tab,
            today=today,
            capacity_sale=capacity_sale,
            sold_total=sold_total,
            sold_today=sold_today,
            gross_total=gross_total,
            gross_today=gross_today,
            sales_pct=sales_pct,
            remaining_tickets=remaining_tickets,
            last_sales_day=last_map.get(c.id),
            net_breakdown=net_breakdown,
            sale_type_label=_sale_type_label(c.sale_type),
            announcement_badge=_announcement_badge(c, today),
            contract_sheet_badge=_contract_sheet_badge(sheet),
            contract_sheet_status=_contract_sheet_status(sheet),
            contract_sheet_data=contract_sheet_data,
            contract_sheet_sections=contract_sheet_sections,
            invitation_rows=invitation_rows,
            invitation_totals=invitation_totals,
            payment_terms=payment_terms,
            payment_pending=payment_pending,
            payment_total_configured=payment_total_configured,
            artwork_request=artwork_request,
            artwork_badge=_artwork_request_badge(artwork_request, c),
            artwork_assets=artwork_assets,
            artwork_companies=artwork_companies,
            artwork_ticketers=artwork_ticketers,
            artwork_company_ids=artwork_company_ids,
            artwork_ticketer_ids=artwork_ticketer_ids,
            artwork_needs_refresh=artwork_needs_refresh,
            location_summary=_concert_location_summary(c),
            artwork_upload_url=_external_url_for('concert_artwork_public_upload', token=artwork_request.public_token) if artwork_request else None,
        )
    finally:
        session.close()



@app.post('/conciertos/<cid>/carteleria/guardar', endpoint='concert_artwork_save')
@admin_required
def concert_artwork_save(cid):
    if not (is_master() or can_edit_concerts()):
        return forbid('Tu usuario no tiene permisos para gestionar cartelería.')
    session = db()
    try:
        concert = (
            session.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.billing_company),
                selectinload(Concert.artwork_request).selectinload(ConcertArtworkRequest.assets),
            )
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not concert:
            flash('Concierto no encontrado.', 'warning')
            return redirect(url_for('concerts_view', tab='vista'))

        handled_by = (request.form.get('handled_by') or 'OURS').strip().upper()
        if handled_by not in {'OURS', 'PROMOTER'}:
            handled_by = 'OURS'

        row = getattr(concert, 'artwork_request', None)
        if not row:
            row = ConcertArtworkRequest(concert_id=concert.id, public_token=uuid.uuid4().hex)
            session.add(row)
            session.flush()

        now = datetime.now(ZoneInfo('Europe/Madrid'))
        row.handled_by = handled_by
        row.updated_at = now

        if handled_by == 'PROMOTER':
            row.status = 'PROMOTER'
            row.logo_notes = None
            row.ticketer_notes = None
            row.other_notes = None
            row.delivery_deadline = None
            row.group_company_ids = []
            row.ticketer_ids = []
            row.event_snapshot = _concert_artwork_snapshot(concert)
            row.needs_refresh = False
            session.commit()
            flash('Cartelería configurada: la realiza el promotor.', 'success')
            return redirect(url_for('concert_detail_view', cid=cid, tab='carteleria'))

        row.group_company_ids = _parse_uuid_list(request.form.getlist('group_company_ids[]'))
        row.ticketer_ids = _parse_uuid_list(request.form.getlist('ticketer_ids[]'))
        row.logo_notes = (request.form.get('logo_notes') or '').strip() or None
        row.ticketer_notes = (request.form.get('ticketer_notes') or '').strip() or None
        row.other_notes = (request.form.get('other_notes') or '').strip() or None
        row.delivery_deadline = parse_optional_date(request.form.get('delivery_deadline'))
        row.status = 'REQUESTED'
        row.requested_at = now
        row.event_snapshot = _concert_artwork_snapshot(concert)
        row.needs_refresh = False
        session.commit()

        all_companies = {str(x.id): x for x in session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()}
        all_ticketers = {str(x.id): x for x in session.query(Ticketer).order_by(Ticketer.name.asc()).all()}
        selected_company_names = [all_companies[x].name for x in (row.group_company_ids or []) if x in all_companies]
        selected_ticketer_names = [all_ticketers[x].name for x in (row.ticketer_ids or []) if x in all_ticketers]
        upload_url = _external_url_for('concert_artwork_public_upload', token=row.public_token)
        logo_html = ''
        if concert.billing_company and getattr(concert.billing_company, 'logo_url', None):
            logo_html = f'<div style="margin-bottom:20px;"><img src="{concert.billing_company.logo_url}" style="max-height:64px;max-width:220px;"></div>'
        artist_photo = ''
        if concert.artist and getattr(concert.artist, 'photo_url', None):
            artist_photo = f'<img src="{concert.artist.photo_url}" style="width:74px;height:74px;object-fit:cover;border-radius:50%;">'
        deadline_txt = row.delivery_deadline.strftime('%d/%m/%Y') if row.delivery_deadline else 'Sin fecha máxima indicada'
        logos_txt = ', '.join(selected_company_names) if selected_company_names else 'No se han marcado logos de empresas del grupo'
        ticketers_txt = ', '.join(selected_ticketer_names) if selected_ticketer_names else 'No se han marcado ticketeras'
        html_body = f'''<div style="font-family:Arial,sans-serif;color:#1f2937;">{logo_html}<h2 style="margin:0 0 16px;">Solicitud de cartelería</h2><div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;"><div style="display:flex;gap:16px;align-items:center;"><div>{artist_photo}</div><div><div style="font-size:18px;font-weight:700;">{concert.artist.name if concert.artist else 'Concierto'}</div><div>Fecha: {concert.date.strftime('%d/%m/%Y') if concert.date else '—'}</div><div>{_concert_venue_name(concert) or 'Recinto pendiente'}</div><div>{_concert_city(concert)} {('· ' + _concert_province_value(concert)) if _concert_province_value(concert) else ''}</div><div>Hora show: {concert.show_time or ('TBC' if concert.show_time_tbc else '—')}</div></div></div></div><p><strong>Logos empresas del grupo:</strong> {logos_txt}</p><p><strong>Notas de logos:</strong> {row.logo_notes or '—'}</p><p><strong>Ticketeras:</strong> {ticketers_txt}</p><p><strong>Notas de ticketeras:</strong> {row.ticketer_notes or '—'}</p><p><strong>Otras notas:</strong> {row.other_notes or '—'}</p><p><strong>Fecha máxima de entrega:</strong> {deadline_txt}</p><p><a href="{upload_url}" style="display:inline-block;background:#0d6efd;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Subir carteles</a></p></div>'''
        ok, error = _send_optional_email('grafico@33producciones.es', f'Solicitud cartelería · {concert.artist.name if concert.artist else "concierto"}', html_body, text_body=upload_url)
        if ok:
            flash('Solicitud de cartelería enviada a grafico@33producciones.es.', 'success')
        else:
            flash(f'Cartelería guardada, pero no se pudo enviar el correo automáticamente: {error}', 'warning')
        return redirect(url_for('concert_detail_view', cid=cid, tab='carteleria'))
    except Exception as exc:
        session.rollback()
        flash(f'Error gestionando cartelería: {exc}', 'danger')
        return redirect(url_for('concert_detail_view', cid=cid, tab='carteleria'))
    finally:
        session.close()


@app.route('/carteleria/<token>', methods=['GET', 'POST'], endpoint='concert_artwork_public_upload')
def concert_artwork_public_upload(token):
    session = db()
    try:
        row = (
            session.query(ConcertArtworkRequest)
            .options(selectinload(ConcertArtworkRequest.assets))
            .filter(ConcertArtworkRequest.public_token == token)
            .first()
        )
        if not row:
            return abort(404)
        concert = (
            session.query(Concert)
            .options(joinedload(Concert.artist), joinedload(Concert.venue), joinedload(Concert.billing_company))
            .filter(Concert.id == row.concert_id)
            .first()
        )
        if not concert:
            return abort(404)

        all_companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()
        all_ticketers = session.query(Ticketer).order_by(Ticketer.name.asc()).all()
        selected_company_ids = set(str(x) for x in (row.group_company_ids or []))
        selected_ticketer_ids = set(str(x) for x in (row.ticketer_ids or []))
        selected_companies = [x for x in all_companies if str(x.id) in selected_company_ids]
        selected_ticketers = [x for x in all_ticketers if str(x.id) in selected_ticketer_ids]

        if request.method == 'POST':
            labels = request.form.getlist('asset_format[]')
            files = request.files.getlist('asset_file[]')
            uploaded = 0
            for i, fs in enumerate(files or []):
                if not fs or not getattr(fs, 'filename', ''):
                    continue
                label = (labels[i] if i < len(labels) else '').strip() or Path(fs.filename).stem
                file_url, mime_type = _upload_artwork_file(fs)
                if not file_url:
                    continue
                for existing in list(row.assets or []):
                    if (existing.format_label or '').strip().lower() == label.lower():
                        session.delete(existing)
                session.add(ConcertArtworkAsset(
                    artwork_request_id=row.id,
                    format_label=label,
                    file_url=file_url,
                    original_name=fs.filename,
                    mime_type=mime_type,
                ))
                uploaded += 1
            if uploaded <= 0:
                flash('Debes subir al menos un archivo de cartelería.', 'warning')
            else:
                now = datetime.now(ZoneInfo('Europe/Madrid'))
                row.status = 'UPLOADED'
                row.uploaded_at = now
                row.updated_at = now
                row.event_snapshot = _concert_artwork_snapshot(concert)
                row.needs_refresh = False
                session.commit()
                flash('Cartelería subida correctamente.', 'success')
                return redirect(url_for('concert_artwork_public_upload', token=token))

        return render_template(
            'concert_artwork_public.html',
            concert=concert,
            artwork_request=row,
            artwork_badge=_artwork_request_badge(row, concert),
            selected_companies=selected_companies,
            selected_ticketers=selected_ticketers,
            artwork_assets=list(row.assets or []),
            upload_action=url_for('concert_artwork_public_upload', token=token),
        )
    finally:
        session.close()


@app.post('/conciertos/<cid>/pagos/<int:payment_idx>/factura', endpoint='concert_payment_upload_invoice')
@admin_required
def concert_payment_upload_invoice(cid, payment_idx):
    if not (is_master() or can_edit_concerts() or can_view_economics()):
        return forbid('Tu usuario no tiene permisos para subir facturas.')
    session = db()
    try:
        concert = session.get(Concert, to_uuid(cid))
        if not concert:
            flash('Concierto no encontrado.', 'warning')
            return redirect(url_for('concerts_view', tab='facturacion'))
        rows = list(getattr(concert, 'payment_terms_json', None) or [])
        if payment_idx < 0 or payment_idx >= len(rows):
            flash('Pago no encontrado.', 'warning')
            return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))
        fs = request.files.get('invoice_file')
        if not fs or not getattr(fs, 'filename', ''):
            flash('Debes seleccionar un PDF de factura.', 'warning')
            return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))
        invoice_url = upload_pdf(fs, 'concert_invoices')
        row = dict(rows[payment_idx] or {})
        row['invoice_url'] = invoice_url
        row['invoice_name'] = fs.filename
        row['invoiced_at'] = datetime.now(ZoneInfo('Europe/Madrid')).isoformat()
        rows[payment_idx] = row
        concert.payment_terms_json = rows
        session.commit()
        flash('Factura subida correctamente.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error subiendo la factura: {exc}', 'danger')
    finally:
        session.close()
    return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))


@app.post('/conciertos/<cid>/pagos/<int:payment_idx>/cobrado', endpoint='concert_payment_mark_collected')
@admin_required
def concert_payment_mark_collected(cid, payment_idx):
    if not (is_master() or can_edit_concerts() or can_view_economics()):
        return forbid('Tu usuario no tiene permisos para marcar cobros.')
    session = db()
    try:
        concert = session.get(Concert, to_uuid(cid))
        if not concert:
            flash('Concierto no encontrado.', 'warning')
            return redirect(url_for('concerts_view', tab='facturacion'))
        rows = list(getattr(concert, 'payment_terms_json', None) or [])
        if payment_idx < 0 or payment_idx >= len(rows):
            flash('Pago no encontrado.', 'warning')
            return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))
        row = dict(rows[payment_idx] or {})
        if not (row.get('invoice_url') or row.get('invoiced_at')):
            flash('Primero debes subir la factura de este pago.', 'warning')
            return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))
        row['collected_at'] = datetime.now(ZoneInfo('Europe/Madrid')).isoformat()
        rows[payment_idx] = row
        concert.payment_terms_json = rows
        session.commit()
        flash('Pago marcado como cobrado.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error marcando el pago como cobrado: {exc}', 'danger')
    finally:
        session.close()
    return redirect(safe_next_or(url_for('concerts_view', tab='facturacion')))


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
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(url_for("concerts_view", tab="vista"))

        setattr(c, "tags_clean", _concert_tags(c))
        setattr(c, "sale_type_label", _sale_type_label(c.sale_type))

        artists = session.query(Artist).order_by(Artist.name.asc()).all()
        venues = session.query(Venue).order_by(Venue.name.asc()).all()
        promoters = session.query(Promoter).order_by(Promoter.nick.asc()).all()
        companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()
        all_concert_tags = _collect_all_concert_tags(session)
        type_choices = [(k, CONCERT_SALE_TYPE_LABELS.get(k, k)) for k in CONCERTS_SECTION_ORDER]

        return render_template(
            "concert_edit.html",
            concert=c,
            c=c,
            artists=artists,
            venues=venues,
            promoters=promoters,
            companies=companies,
            all_concert_tags=all_concert_tags,
            type_choices=type_choices,
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
        requested_capacity = max(0, int(request.form.get("capacity") or 0))
        previous_effective_capacity = _concert_capacity_from_ticket_types(c)
        c.capacity = requested_capacity
        c.sale_start_date = parse_concert_sale_start_date(request.form.get("sale_start_date"), sale_type)
        c.break_even_ticket = None if sale_type in ("VENDIDO", "GRATUITO") else _parse_optional_positive_int((request.form.get("break_even_ticket") or "").strip())
        c.status = _norm_status(request.form.get("status"))
        c.group_company_id = None
        c.promoter_id = to_uuid(request.form.get("promoter_id") or None) if sale_type in ("VENDIDO", "GRATUITO", "GIRAS_COMPRADAS") else None
        c.hashtags = _dedupe_concert_tags(request.form.getlist("concert_tags[]"))

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

        _add_contracts_from_request(session, c.id)
        _add_concert_notes_from_request(session, c.id)
        _upsert_equipment_from_request(session, c.id)
        _add_equipment_docs_from_request(session, c.id)
        _add_equipment_notes_from_request(session, c.id)

        if requested_capacity != previous_effective_capacity:
            _sync_concert_capacity_after_manual_edit(session, c.id, requested_capacity)

        session.flush()
        try:
            session.expire(c, ['venue'])
        except Exception:
            pass
        _sync_artwork_request_refresh_flag(c)

        session.commit()
        flash("Concierto actualizado.", "success")

    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")

    finally:
        session.close()

    return redirect(url_for("concert_detail_view", cid=cid))


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
        payload = request.get_json(silent=True) if request.is_json else None
        payload = payload or request.form

        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre del recinto es obligatorio."}), 400

        municipality = (payload.get("municipality") or "").strip() or None
        province = (payload.get("province") or "").strip() or None
        address = (payload.get("address") or "").strip() or None
        force_new = _truthy(payload.get("force_new"))

        covered_value = payload.get("covered")
        if isinstance(covered_value, bool):
            covered = covered_value
        else:
            covered = str(covered_value or "").strip().lower() in ("1", "true", "yes", "on", "si", "sí")

        rows = []
        for row in session_db.query(Venue).order_by(Venue.name.asc()).all():
            label = (row.name or '').strip()
            if row.municipality or row.province:
                label = f"{label} — {(row.municipality or '').strip()} ({(row.province or '').strip()})".strip()
            rows.append({"id": str(row.id), "label": label, "name": (row.name or '').strip()})

        exact = None
        for row in session_db.query(Venue).all():
            if _norm_text_key(row.name or '') == _norm_text_key(name) and (_norm_text_key(row.municipality or '') == _norm_text_key(municipality or '') or not municipality):
                exact = row
                break
        similar = _build_similarity_rows(name, rows, threshold=0.76)
        if exact and not force_new:
            similar = [{"id": str(exact.id), "label": f"{(exact.name or '').strip()} — {(exact.municipality or '').strip()} ({(exact.province or '').strip()})".strip(), "score": 1.0}]
        if similar and not force_new:
            return jsonify({"error": "Parece que ya existe un recinto similar.", "similar": similar}), 409

        v = Venue(
            name=name,
            covered=covered,
            address=address,
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
            "text": text_label,
        })

    except Exception as e:
        session_db.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session_db.close()

@app.post("/api/promoters/create", endpoint="api_create_promoter")




@app.post("/api/promoters/create", endpoint="api_create_promoter")
@admin_required
def api_create_promoter():
    session = db()
    try:
        nick = (request.form.get("nick") or "").strip()
        if not nick:
            return jsonify({"error": "El nombre del tercero es obligatorio."}), 400

        force_new = _truthy(request.form.get("force_new"))
        rows = []
        for row in session.query(Promoter).order_by(Promoter.nick.asc()).all():
            rows.append({
                "id": str(row.id),
                "label": (row.nick or '').strip(),
                "logo_url": (row.logo_url or '').strip(),
            })
        similar = _build_similarity_rows(nick, rows, threshold=0.76)
        exact = session.query(Promoter).filter(func.lower(Promoter.nick) == nick.lower()).first()
        if exact and not force_new:
            similar = [{"id": str(exact.id), "label": (exact.nick or '').strip(), "score": 1.0, "logo_url": (exact.logo_url or '').strip()}]
        if similar and not force_new:
            return jsonify({"error": "Ya existe un tercero similar.", "similar": similar}), 409

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
                "nick": p.nick,
                "label": p.nick,
                "text": p.nick,
                "logo_url": p.logo_url,
                "tax_id": (p.tax_id or ""),
                "contact_email": (p.contact_email or ""),
                "contact_phone": (p.contact_phone or ""),
                "companies": [],
            }
        )

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()

@app.get("/api/promoters/<promoter_id>", endpoint="api_promoter_detail")



@app.get("/api/promoters/<promoter_id>", endpoint="api_promoter_detail")
@admin_required
def api_promoter_detail(promoter_id):
    session_db = db()
    try:
        p = (
            session_db.query(Promoter)
            .options(selectinload(Promoter.companies), selectinload(Promoter.contacts))
            .filter(Promoter.id == to_uuid(promoter_id))
            .first()
        )
        if not p:
            return jsonify({"error": "not found"}), 404
        pub = None
        if getattr(p, "publishing_company_id", None):
            pub = session_db.get(PublishingCompany, p.publishing_company_id)

        return jsonify({
            "id": str(p.id),
            "nick": (p.nick or ""),
            "first_name": (p.first_name or ""),
            "last_name": (p.last_name or ""),
            "contact_email": (p.contact_email or ""),
            "contact_phone": (p.contact_phone or ""),
            "publishing_company_id": str(pub.id) if pub else "",
            "publishing_company_name": (pub.name or "") if pub else "",
            "logo_url": (p.logo_url or ""),
            "companies": [_serialize_promoter_company(x) for x in (p.companies or [])],
            "contacts": [_serialize_promoter_contact(x) for x in (p.contacts or [])],
        })
    finally:
        session_db.close()

@app.get("/api/search/publishing_companies", endpoint="api_search_publishing_companies")



@app.get("/api/search/publishing_companies", endpoint="api_search_publishing_companies")
def api_search_publishing_companies():
    q = (request.args.get("q") or "").strip()
    session_db = db()
    try:
        query = session_db.query(PublishingCompany)
        if q:
            like = f"%{q}%"
            query = query.filter(PublishingCompany.name.ilike(like))
        res = query.order_by(PublishingCompany.name.asc()).limit(20).all()
        return jsonify([
            {"id": str(pc.id), "label": pc.name} for pc in res
        ])
    finally:
        session_db.close()


@app.post("/api/publishing_companies/create", endpoint="api_create_publishing_company")
@admin_required
def api_create_publishing_company():
    session_db = db()
    try:
        name = (request.form.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre de la editorial es obligatorio."}), 400

        # Si ya existe (case-insensitive), devolvemos el existente
        existing = (
            session_db.query(PublishingCompany)
            .filter(func.lower(PublishingCompany.name) == name.lower())
            .first()
        )
        if existing:
            return jsonify({"id": str(existing.id), "label": existing.name, "logo_url": existing.logo_url})

        logo = request.files.get("logo")
        logo_url = upload_image(logo, "publishing_companies") if logo and getattr(logo, "filename", "") else None

        pc = PublishingCompany(name=name, logo_url=logo_url)
        session_db.add(pc)
        session_db.commit()
        return jsonify({"id": str(pc.id), "label": pc.name, "logo_url": pc.logo_url})
    except Exception as e:
        session_db.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        session_db.close()


@app.get("/api/song_editorial_shares/<share_id>", endpoint="api_song_editorial_share_detail")
@admin_required
def api_song_editorial_share_detail(share_id):
    session_db = db()
    try:
        sh = (
            session_db.query(SongEditorialShare)
            .options(joinedload(SongEditorialShare.promoter).joinedload(Promoter.publishing_company))
            .filter(SongEditorialShare.id == to_uuid(share_id))
            .first()
        )
        if not sh:
            return jsonify({"error": "not found"}), 404

        p = sh.promoter
        pub = p.publishing_company
        return jsonify({
            "id": str(sh.id),
            "song_id": str(sh.song_id),
            "role": (sh.role or "").upper(),
            "pct": float(sh.pct or 0),
            "promoter": {
                "id": str(p.id),
                "nick": (p.nick or ""),
                "first_name": (p.first_name or ""),
                "last_name": (p.last_name or ""),
                "contact_email": (p.contact_email or ""),
                "contact_phone": (p.contact_phone or ""),
                "publishing_company_id": str(pub.id) if pub else "",
                "publishing_company_name": (pub.name or "") if pub else "",
            },
        })
    finally:
        session_db.close()



# ----------- API: crear Artista (modal) -----------

@app.post("/api/artists/create", endpoint="api_create_artist")
@admin_required
def api_create_artist():
    session = db()
    try:
        name = (request.form.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre del artista es obligatorio."}), 400

        force_new = _truthy(request.form.get("force_new"))
        rows = []
        for row in session.query(Artist).order_by(Artist.name.asc()).all():
            rows.append({"id": str(row.id), "label": (row.name or '').strip(), "photo_url": (row.photo_url or '').strip()})
        exact = session.query(Artist).filter(func.lower(Artist.name) == name.lower()).first()
        similar = _build_similarity_rows(name, rows, threshold=0.78)
        if exact and not force_new:
            similar = [{"id": str(exact.id), "label": (exact.name or '').strip(), "score": 1.0, "photo_url": (exact.photo_url or '').strip()}]
        if similar and not force_new:
            return jsonify({"error": "Ya existe un artista similar.", "similar": similar}), 409

        photo = request.files.get("photo")
        photo_url = upload_png(photo, "artists") if photo and getattr(photo, "filename", "") else None

        a = Artist(name=name, photo_url=photo_url)
        session.add(a)
        session.commit()
        return jsonify({"id": str(a.id), "label": a.name, "text": a.name, "name": a.name, "photo_url": a.photo_url})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()

# ----------- API: cambio rápido de estado (vista conciertos) -----------



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
    f_statuses = [x for x in f_statuses if x in ("BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO")]

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

# =====================
# BASES DE DATOS: EDITORIALES (Publishing Companies)
# =====================

@app.route("/editoriales", methods=["GET", "POST"])
@admin_required
def publishing_companies_view():
    session_db = db()

    if request.method == "POST":
        if not can_edit_catalogs():
            session_db.close()
            return forbid("No tienes permisos para modificar editoriales.")

        name = (request.form.get("name") or "").strip()
        if not name:
            flash("El nombre de la editorial es obligatorio.", "warning")
            session_db.close()
            return redirect(url_for("publishing_companies_view"))

        # Evitar duplicados por mayúsculas/minúsculas
        exists = (
            session_db.query(PublishingCompany)
            .filter(func.lower(PublishingCompany.name) == name.lower())
            .first()
        )
        if exists:
            flash("Ya existe una editorial con ese nombre.", "warning")
            session_db.close()
            return redirect(url_for("publishing_companies_view"))

        logo = request.files.get("logo")
        logo_url = upload_image(logo, "publishing_companies") if logo and getattr(logo, "filename", "") else None

        try:
            pc = PublishingCompany(name=name, logo_url=logo_url)
            session_db.add(pc)
            session_db.commit()
            flash("Editorial creada.", "success")
        except Exception as e:
            session_db.rollback()
            flash(f"Error creando editorial: {e}", "danger")

        session_db.close()
        return redirect(url_for("publishing_companies_view"))

    # GET
    companies = session_db.query(PublishingCompany).order_by(PublishingCompany.name.asc()).all()
    session_db.close()
    return render_template("publishing_companies.html", publishing_companies=companies)


@app.post("/editoriales/<pcid>/update")
@admin_required
def publishing_company_update(pcid):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para modificar editoriales.")

    session_db = db()
    try:
        pc = session_db.get(PublishingCompany, to_uuid(pcid))
        if not pc:
            flash("Editorial no encontrada.", "warning")
            return redirect(url_for("publishing_companies_view"))

        name = (request.form.get("name") or "").strip()
        if not name:
            flash("El nombre es obligatorio.", "warning")
            return redirect(url_for("publishing_companies_view"))

        # Evitar duplicados (ignorando el propio)
        exists = (
            session_db.query(PublishingCompany)
            .filter(func.lower(PublishingCompany.name) == name.lower())
            .filter(PublishingCompany.id != pc.id)
            .first()
        )
        if exists:
            flash("Ya existe otra editorial con ese nombre.", "warning")
            return redirect(url_for("publishing_companies_view"))

        pc.name = name

        logo = request.files.get("logo")
        if logo and getattr(logo, "filename", ""):
            pc.logo_url = upload_image(logo, "publishing_companies")

        session_db.commit()
        flash("Editorial actualizada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando editorial: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("publishing_companies_view"))


@app.post("/editoriales/<pcid>/delete")
@admin_required
def publishing_company_delete(pcid):
    if not can_edit_catalogs():
        return forbid("No tienes permisos para borrar editoriales.")

    session_db = db()
    try:
        pc = session_db.get(PublishingCompany, to_uuid(pcid))
        if pc:
            session_db.delete(pc)
            session_db.commit()
            flash("Editorial eliminada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando editorial: {e}", "danger")
    finally:
        session_db.close()
    return redirect(url_for("publishing_companies_view"))


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
            func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
        )
                .filter(TicketSaleDetail.day <= day)
    )
    q_gross_today = (
        session.query(
            TicketSaleDetail.concert_id,
            func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
        )
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

    # El bruto incluye IVA. Para obtener la base sin IVA:
    # base = bruto / (1 + IVA%)
    vat_factor = 1.0 + (vat / 100.0)
    base_no_vat = (g / vat_factor) if vat_factor > 0 else g
    vat_amount = g - base_no_vat
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


def _redistribute_integer_amounts(amounts: list[int], new_total: int) -> list[int]:
    """Reparte un total entero preservando, en lo posible, el peso relativo de cada valor."""
    try:
        target = max(0, int(new_total or 0))
    except Exception:
        target = 0

    base = [max(0, int(a or 0)) for a in (amounts or [])]
    if not base:
        return []

    current_total = sum(base)
    if current_total <= 0:
        out = [0 for _ in base]
        if out:
            out[0] = target
        return out

    scaled = [(a * target) / current_total for a in base]
    floors = [int(v) for v in scaled]
    remainder = target - sum(floors)

    order = sorted(
        range(len(base)),
        key=lambda i: ((scaled[i] - floors[i]), base[i], -i),
        reverse=True,
    )
    for idx in order[:max(0, remainder)]:
        floors[idx] += 1
    return floors


def _sync_concert_capacity_after_manual_edit(session_db, concert_id, new_total: int) -> None:
    """Si el concierto usa tipos de entrada, adapta sus cupos al nuevo aforo manual.

    Esto evita que al editar el aforo del concierto parezca que el cambio no se ha guardado
    porque otras pantallas calculan el aforo efectivo como la suma de los tipos de entrada.
    """
    try:
        ticket_types = (
            session_db.query(ConcertTicketType)
            .filter(ConcertTicketType.concert_id == concert_id)
            .order_by(ConcertTicketType.created_at.asc(), ConcertTicketType.id.asc())
            .all()
        )
        if not ticket_types:
            return

        target_total = max(0, int(new_total or 0))
        resized = _redistribute_integer_amounts([int(getattr(tt, "qty_for_sale", 0) or 0) for tt in ticket_types], target_total)
        for tt, qty in zip(ticket_types, resized):
            tt.qty_for_sale = int(qty or 0)
            tt.updated_at = func.now()

        alloc_rows = (
            session_db.query(ConcertTicketerTicketType)
            .filter(ConcertTicketerTicketType.concert_id == concert_id)
            .order_by(ConcertTicketerTicketType.ticketer_id.asc(), ConcertTicketerTicketType.ticket_type_id.asc())
            .all()
        )
        if alloc_rows:
            rows_by_type = defaultdict(list)
            for row in alloc_rows:
                rows_by_type[row.ticket_type_id].append(row)

            for tt in ticket_types:
                rows = rows_by_type.get(tt.id) or []
                if not rows:
                    continue
                new_allocs = _redistribute_integer_amounts(
                    [int(getattr(r, "qty_for_sale", 0) or 0) for r in rows],
                    int(getattr(tt, "qty_for_sale", 0) or 0),
                )
                for row, qty in zip(rows, new_allocs):
                    row.qty_for_sale = int(qty or 0)
                    row.updated_at = func.now()

            ticketer_totals = defaultdict(int)
            for row in alloc_rows:
                ticketer_totals[row.ticketer_id] += int(getattr(row, "qty_for_sale", 0) or 0)

            ticketers = session_db.query(ConcertTicketer).filter(ConcertTicketer.concert_id == concert_id).all()
            for ct in ticketers:
                ct.capacity_for_sale = int(ticketer_totals.get(ct.ticketer_id, 0) or 0)

        session_db.flush()
    except Exception:
        return


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

    session_db = db()
    try:
        day = get_day("d")
        prev_day = day - timedelta(days=1)
        next_day = day + timedelta(days=1)

        concerts = (
            session_db.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.promoter),
                joinedload(Concert.group_company),
                joinedload(Concert.billing_company),
                joinedload(Concert.sales_config),
            selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
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

        # Guardamos el aforo original (tal y como se creó el evento) para avisar si el aforo
        # configurado por tipos no coincide.
        original_capacity_map = {c.id: int(getattr(c, "capacity", 0) or 0) for c in concerts}

        # Si el evento está configurado con aforos por tipo (modo avanzado),
        # el aforo "a la venta" total debe ser la suma de esos aforos.
        # Lo aplicamos en memoria para la UI/reporte (sin commit).
        if concert_ids:
            cap_rows = (
                session_db.query(
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
                    c.capacity = cap_sum

        totals, today_map, last_map, gross_map, _gross_today = sales_maps_unified(session_db, day, concert_ids)

        # Aforo efectivo (si hay categorías/tipos, suma; si no, aforo del concierto)
        capacity_map = {c.id: _concert_capacity_from_ticket_types(c) for c in concerts}

        # --- Config por ticketera/tipo (aforo + precio) ---
        # alloc_map[cid][ticketer_id][ticket_type_id] = {qty_for_sale, price_gross}
        alloc_map = {}
        ticketer_capacity_cfg_map = {}  # cupo total por ticketera
        type_alloc_sum_map = {}  # suma de cupos por tipo entre todas las ticketeras
        if concert_ids:
            alloc_rows = (
                session_db.query(ConcertTicketerTicketType)
                .filter(ConcertTicketerTicketType.concert_id.in_(concert_ids))
                .all()
            )
            for r in alloc_rows:
                cid2 = r.concert_id
                tid2 = r.ticketer_id
                ttid2 = r.ticket_type_id
                qfs = int(getattr(r, "qty_for_sale", 0) or 0)
                price_g = float(getattr(r, "price_gross", 0) or 0.0)

                alloc_map.setdefault(cid2, {}).setdefault(tid2, {})[ttid2] = {
                    "qty_for_sale": qfs,
                    "price_gross": price_g,
                }
                ticketer_capacity_cfg_map.setdefault(cid2, {}).setdefault(tid2, 0)
                ticketer_capacity_cfg_map[cid2][tid2] += qfs
                type_alloc_sum_map.setdefault(cid2, {}).setdefault(ttid2, 0)
                type_alloc_sum_map[cid2][ttid2] += qfs

        # Entradas que faltan por configurar (por tipo, entre TODAS las ticketeras)
        type_missing_map = {}
        for c in concerts:
            for tt in (c.ticket_types or []):
                allocated = int((type_alloc_sum_map.get(c.id, {}) or {}).get(tt.id, 0) or 0)
                missing = int(getattr(tt, "qty_for_sale", 0) or 0) - allocated
                type_missing_map.setdefault(c.id, {})[tt.id] = missing

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

        # Potencial de recaudación (según config por ticketera/tipo): útil para "dinero por vender"
        potential_gross_map = {}
        remaining_gross_map = {}
        for c in concerts:
            pot = 0.0

            # Preferimos config por ticketer/tipo (qty * precio bruto)
            for _tid2, tmap in (alloc_map.get(c.id, {}) or {}).items():
                for _ttid2, cfg in (tmap or {}).items():
                    pot += float(cfg.get("qty_for_sale", 0) or 0) * float(cfg.get("price_gross", 0.0) or 0.0)

            # Fallback legacy (si aún no está configurado por ticketera/tipo)
            if pot <= 0:
                for tt in (c.ticket_types or []):
                    pot += float(getattr(tt, "price", 0) or 0) * float(getattr(tt, "qty_for_sale", 0) or 0)

            potential_gross_map[c.id] = pot
            remaining_gross_map[c.id] = max(0.0, pot - float(gross_map.get(c.id, 0.0) or 0.0))

        # Totales acumulados por tipo / ticketer / ticketer+tipo
        type_totals_map = {}
        ticketer_totals_map = {}
        ticketer_type_totals_map = {}
        if concert_ids:
            # Por tipo
            rows = (
                session_db.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticket_type_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticket_type_id)
                .all()
            )
            for cid2, ttid2, sold, gross in rows:
                type_totals_map.setdefault(cid2, {})[ttid2] = {"sold": int(sold or 0), "gross": float(gross or 0.0)}

            # Por ticketer
            rows = (
                session_db.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id)
                .all()
            )
            for cid2, tid2, sold, gross in rows:
                ticketer_totals_map.setdefault(cid2, {})[tid2] = {"sold": int(sold or 0), "gross": float(gross or 0.0)}

            # Por ticketer + tipo
            rows = (
                session_db.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    TicketSaleDetail.ticket_type_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id, TicketSaleDetail.ticket_type_id)
                .all()
            )
            for cid2, tid2, ttid2, sold, gross in rows:
                ticketer_type_totals_map.setdefault(cid2, {}).setdefault(tid2, {})[ttid2] = {
                    "sold": int(sold or 0),
                    "gross": float(gross or 0.0),
                }

        # Detalle de HOY (V2)
        details_today = {}
        ticketer_has_today = set()
        if concert_ids:
            rows = (
                session_db.query(TicketSaleDetail)
                .filter(TicketSaleDetail.day == day)
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .all()
            )
            for r in rows:
                details_today.setdefault(r.concert_id, {}).setdefault(r.ticketer_id, {})[r.ticket_type_id] = int(r.qty or 0)
                ticketer_has_today.add(f"{r.concert_id}:{r.ticketer_id}")

        # Totales por ticketer (HOY) (qty y bruto) usando el precio guardado en el detalle
        ticketer_today_totals = {}
        ticketer_today_gross = {}
        if concert_ids:
            rows = (
                session_db.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day == day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id)
                .all()
            )
            for cid2, tid2, sold, gross in rows:
                ticketer_today_totals.setdefault(cid2, {})[tid2] = int(sold or 0)
                ticketer_today_gross.setdefault(cid2, {})[tid2] = float(gross or 0.0)

        # Rebate neto (por ticketera) — ingreso separado de ventas
        rebate_net_map = {}
        rebate_net_by_ticketer_map = {}
        for c in concerts:
            vat_pct = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            cid2 = c.id
            total_rebate_net = 0.0

            for ct in (c.ticketers or []):
                tid2 = ct.ticketer_id
                sold_i = int((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("sold", 0) or 0)
                gross_f = float((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("gross", 0.0) or 0.0)

                rn = 0.0
                mode = (getattr(ct, "rebate_mode", None) or "").upper()
                if mode == "FIXED":
                    fixed_gross = float(getattr(ct, "rebate_fixed_gross", 0) or 0.0)
                    rn = (sold_i * fixed_gross) / 1.21 if fixed_gross else 0.0
                elif mode == "PERCENT":
                    pct = float(getattr(ct, "rebate_pct", 0) or 0.0)
                    if pct and gross_f:
                        vat_factor = 1.0 + (vat_pct / 100.0)
                        base_no_vat_ticketer = (gross_f / vat_factor) if vat_factor > 0 else gross_f
                        rn = base_no_vat_ticketer * (pct / 100.0)

                if rn < 0:
                    rn = 0.0
                rebate_net_by_ticketer_map.setdefault(cid2, {})[tid2] = rn
                total_rebate_net += rn

            rebate_net_map[cid2] = total_rebate_net

        # ticketeras globales (para selector)
        all_ticketers = session_db.query(Ticketer).order_by(Ticketer.name.asc()).all()

        # Agrupar por secciones (igual que reporte)
        sections = {k: [] for k in SALES_SECTION_ORDER}
        for c in concerts:
            if c.sale_type in sections:
                sections[c.sale_type].append(c)
        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        # Lista de artistas visibles en este día (para el modal de informe)
        report_artists = []
        seen_artist_ids = set()
        for c in concerts:
            if c.artist and c.artist.id not in seen_artist_ids:
                seen_artist_ids.add(c.artist.id)
                report_artists.append(c.artist)
        report_artists.sort(key=lambda a: a.name or "")

        return render_template(
            "sales_update.html",
            day=day,
            prev_day=prev_day,
            next_day=next_day,
            open_cfg=(request.args.get("open_cfg") or ""),
            open_sales=(request.args.get("open_sales") or ""),
            open_ticketer=(request.args.get("open_ticketer") or ""),
            sections=sections,
            order=SALES_SECTION_ORDER,
            titles=SALES_SECTION_TITLE,
            totals=totals,
            today_map=today_map,
            last_map=last_map,
            gross_map=gross_map,
            net_map=net_map,
            capacity_map=capacity_map,
            original_capacity_map=original_capacity_map,
            alloc_map=alloc_map,
            type_missing_map=type_missing_map,
            ticketer_capacity_cfg_map=ticketer_capacity_cfg_map,
            ticketer_type_totals_map=ticketer_type_totals_map,
            rebate_net_map=rebate_net_map,
            rebate_net_by_ticketer_map=rebate_net_by_ticketer_map,
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
            report_artists=report_artists,
        )
    finally:
        session_db.close()

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
    return redirect(url_for("sales_update_view", d=day.isoformat(), open_sales=str(cid)) + f"#concert-{cid}")

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

        if not name:
            raise ValueError("El tipo de entrada es obligatorio")

        # Ya no se configura el precio aquí (se configura por ticketera/tipo)
        tt = ConcertTicketType(concert_id=concert_id, name=name, qty_for_sale=int(qty))
        session_db.add(tt)
        session_db.flush()

        # Crear filas de configuración por ticketera/tipo para las ticketeras ya añadidas
        ticketers_rows = (
            session_db.query(ConcertTicketer.ticketer_id)
            .filter(ConcertTicketer.concert_id == concert_id)
            .all()
        )
        for (tid,) in ticketers_rows:
            exists_cfg = (
                session_db.query(ConcertTicketerTicketType)
                .filter_by(concert_id=concert_id, ticketer_id=tid, ticket_type_id=tt.id)
                .first()
            )
            if not exists_cfg:
                session_db.add(
                    ConcertTicketerTicketType(
                        concert_id=concert_id,
                        ticketer_id=tid,
                        ticket_type_id=tt.id,
                        qty_for_sale=0,
                        price_gross=0,
                    )
                )

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

        if name:
            tt.name = name
        if qty is not None:
            tt.qty_for_sale = int(qty)

        # Precio eliminado de la configuración por tipo (ahora es por ticketera/tipo).
        tt.updated_at = func.now()
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
            session_db.delete(tt)
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

        ct = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if not ct:
            ct = ConcertTicketer(concert_id=concert_id, ticketer_id=ticketer_id, capacity_for_sale=0)
            session_db.add(ct)
            session_db.flush()
            flash("Ticketera añadida al evento.", "success")
        else:
            flash("La ticketera ya estaba añadida al evento.", "info")

        # Crear/asegurar filas de configuración por ticketera/tipo para TODOS los tipos existentes
        types = (
            session_db.query(ConcertTicketType)
            .filter(ConcertTicketType.concert_id == concert_id)
            .order_by(ConcertTicketType.created_at.asc())
            .all()
        )
        for tt in types:
            exists_cfg = (
                session_db.query(ConcertTicketerTicketType)
                .filter_by(concert_id=concert_id, ticketer_id=ticketer_id, ticket_type_id=tt.id)
                .first()
            )
            if not exists_cfg:
                session_db.add(
                    ConcertTicketerTicketType(
                        concert_id=concert_id,
                        ticketer_id=ticketer_id,
                        ticket_type_id=tt.id,
                        qty_for_sale=0,
                        price_gross=0,
                    )
                )

        session_db.commit()
    except Exception as e:
        session_db.rollback()
        flash(f"Error añadiendo ticketera: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid, open_ticketer=ticketer_id) + f"#concert-{cid}"
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
        url_for("sales_update_view", d=day, open_cfg=cid, open_ticketer=tid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/<tid>/allocations/save", endpoint="sales_ticketer_allocations_save")
@admin_required
def sales_ticketer_allocations_save(cid, tid):
    """Guarda (cupo + precio) por tipo de entrada para una ticketera en un concierto."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(tid)

        # Validar relación concierto-ticketera
        ct = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if not ct:
            flash("Ticketera no encontrada en el evento.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        types = (
            session_db.query(ConcertTicketType)
            .filter(ConcertTicketType.concert_id == concert_id)
            .order_by(ConcertTicketType.created_at.asc())
            .all()
        )

        total_cap = 0
        for tt in types:
            q_raw = request.form.get(f"alloc_qty_{tt.id}")
            p_raw = request.form.get(f"alloc_price_{tt.id}")

            qty = _parse_optional_int(q_raw, min_v=0) or 0
            price = _parse_optional_decimal(p_raw) or Decimal(0)

            total_cap += int(qty)

            row = (
                session_db.query(ConcertTicketerTicketType)
                .filter_by(concert_id=concert_id, ticketer_id=ticketer_id, ticket_type_id=tt.id)
                .first()
            )
            if row:
                row.qty_for_sale = int(qty)
                row.price_gross = float(price)
                row.updated_at = func.now()
            else:
                session_db.add(
                    ConcertTicketerTicketType(
                        concert_id=concert_id,
                        ticketer_id=ticketer_id,
                        ticket_type_id=tt.id,
                        qty_for_sale=int(qty),
                        price_gross=float(price),
                    )
                )

        # Mantener el campo legacy en sincronía (útil para listados existentes)
        ct.capacity_for_sale = int(total_cap)
        session_db.commit()
        flash("Configuración de ticketera guardada.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando configuración de ticketera: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid, open_ticketer=tid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/<tid>/rebate/save", endpoint="sales_ticketer_rebate_save")
@admin_required
def sales_ticketer_rebate_save(cid, tid):
    """Guarda rebate para ticketera (FIXED/PERCENT)."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(tid)
        ct = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if not ct:
            flash("Ticketera no encontrada en el evento.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        mode = (request.form.get("rebate_mode") or "").upper().strip()
        if mode == "FIXED":
            fixed = _parse_optional_decimal(request.form.get("rebate_fixed_gross")) or Decimal(0)
            ct.rebate_mode = "FIXED"
            ct.rebate_fixed_gross = float(fixed)
            ct.rebate_pct = None
        elif mode == "PERCENT":
            pct = _parse_optional_decimal(request.form.get("rebate_pct")) or Decimal(0)
            pct_f = float(pct)
            if pct_f < 0:
                pct_f = 0.0
            if pct_f > 100:
                pct_f = 100.0
            ct.rebate_mode = "PERCENT"
            ct.rebate_pct = pct_f
            ct.rebate_fixed_gross = None
        else:
            ct.rebate_mode = None
            ct.rebate_fixed_gross = None
            ct.rebate_pct = None

        ct.rebate_updated_at = func.now()
        session_db.commit()
        flash("Rebate guardado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error guardando rebate: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid, open_ticketer=tid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/ticketers/<tid>/rebate/delete", endpoint="sales_ticketer_rebate_delete")
@admin_required
def sales_ticketer_rebate_delete(cid, tid):
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        ticketer_id = to_uuid(tid)
        ct = (
            session_db.query(ConcertTicketer)
            .filter_by(concert_id=concert_id, ticketer_id=ticketer_id)
            .first()
        )
        if ct:
            ct.rebate_mode = None
            ct.rebate_fixed_gross = None
            ct.rebate_pct = None
            ct.rebate_updated_at = func.now()
            session_db.commit()
            flash("Rebate eliminado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error eliminando rebate: {e}", "danger")
    finally:
        session_db.close()

    day = request.form.get("day") or request.args.get("day")
    return redirect(
        url_for("sales_update_view", d=day, open_cfg=cid, open_ticketer=tid) + f"#concert-{cid}"
        if day
        else (request.referrer or url_for("sales_update_view"))
    )


@app.post("/ventas/<cid>/capacity/update", endpoint="sales_concert_capacity_update")
@admin_required
def sales_concert_capacity_update(cid):
    """Actualiza el aforo ORIGINAL del evento para que coincida con el aforo configurado por tipos."""
    session_db = db()
    try:
        concert_id = to_uuid(cid)
        c = session_db.get(Concert, concert_id)
        if not c:
            flash("Concierto no encontrado.", "warning")
            return redirect(request.referrer or url_for("sales_update_view"))

        # suma de tipos
        sum_qty = (
            session_db.query(func.coalesce(func.sum(ConcertTicketType.qty_for_sale), 0))
            .filter(ConcertTicketType.concert_id == concert_id)
            .scalar()
        )
        new_cap = int(sum_qty or 0)
        if new_cap <= 0:
            flash("No hay aforo por tipos configurado para actualizar.", "warning")
        else:
            c.capacity = new_cap
            session_db.commit()
            flash("Aforo del evento actualizado.", "success")
    except Exception as e:
        session_db.rollback()
        flash(f"Error actualizando aforo del evento: {e}", "danger")
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


        # Precio bruto por tipo para esta ticketera (configuración)
        cfg_rows = (
            session_db.query(ConcertTicketerTicketType.ticket_type_id, ConcertTicketerTicketType.price_gross)
            .filter(ConcertTicketerTicketType.concert_id == concert_id)
            .filter(ConcertTicketerTicketType.ticketer_id == ticketer_id)
            .all()
        )
        cfg_price_map = {ttid: float(p or 0.0) for ttid, p in cfg_rows}

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

            price_gross = float(cfg_price_map.get(tt.id, 0.0) or 0.0)
            if price_gross <= 0:
                # Fallback (modo antiguo): precio en la categoría
                price_gross = float(getattr(tt, "price", 0) or 0.0)

            row = (
                session_db.query(TicketSaleDetail)
                .filter_by(concert_id=concert_id, day=day, ticketer_id=ticketer_id, ticket_type_id=tt.id)
                .first()
            )
            if row:
                row.qty = qty_int
                row.unit_price_gross = price_gross
                row.updated_at = func.now()
            else:
                session_db.add(
                    TicketSaleDetail(
                        concert_id=concert_id,
                        day=day,
                        ticketer_id=ticketer_id,
                        ticket_type_id=tt.id,
                        qty=qty_int,
                        unit_price_gross=price_gross,
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
    return redirect(url_for("sales_update_view", d=day_s, open_sales=str(cid)) + f"#concert-{cid}" if day_s else (request.referrer or url_for("sales_update_view")))


# ------------- REPORTE DE VENTAS (PUBLIC Y ADMIN) -----------

def concerts_for_report(session, day: date, past: bool = False, promoter_id=None, artist_id=None, company_id=None):
    """
    Devuelve conciertos para el reporte de ventas, precargando TODAS las relaciones usadas en la plantilla.

    - Próximos: fecha >= (día-2)
    - Anteriores: fecha < (día-2)

    Filtros opcionales:
      - promoter_id: conciertos vendidos por ese promotor o con participación de promotor.
      - company_id: conciertos EMPRESA (empresa/grupo o facturación) o con participación de empresa.
      - artist_id: filtra por artista.
    """
    cutoff = day - timedelta(days=2)

    q = (
        session.query(Concert)
        .options(
            # entidades directas de la tarjeta
            joinedload(Concert.artist),
            joinedload(Concert.venue),
            joinedload(Concert.promoter),          # VENDIDO
            joinedload(Concert.group_company),
            joinedload(Concert.billing_company),   # EMPRESA
            # colecciones y sus relaciones anidadas (participaciones)
            selectinload(Concert.promoter_shares).joinedload(ConcertPromoterShare.promoter),
            selectinload(Concert.company_shares).joinedload(ConcertCompanyShare.company),
            joinedload(Concert.sales_config),
            selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
        )
        # Solo los tipos con ventas (excluye "GRATUITO")
        .filter(Concert.sale_type.in_(SALES_SECTION_ORDER))
    )

    if past:
        q = q.filter(Concert.date < cutoff)
    else:
        q = q.filter(Concert.date >= cutoff)

    concerts = q.order_by(Concert.date.asc()).all()

    def _safe_uuid(x):
        try:
            return to_uuid(x) if x else None
        except Exception:
            return None

    pid = _safe_uuid(promoter_id)
    aid = _safe_uuid(artist_id)
    cid = _safe_uuid(company_id)

    if aid:
        concerts = [c for c in concerts if c.artist_id == aid]

    if pid:
        def _has_promoter(c):
            if c.promoter_id == pid:
                return True
            for s in (c.promoter_shares or []):
                if s.promoter_id == pid:
                    return True
            return False
        concerts = [c for c in concerts if _has_promoter(c)]

    if cid:
        def _has_company(c):
            if c.group_company_id == cid or getattr(c, "billing_company_id", None) == cid:
                return True
            for s in (c.company_shares or []):
                if s.company_id == cid:
                    return True
            return False
        concerts = [c for c in concerts if _has_company(c)]

    return concerts

def build_sales_report_context(day: date, *, past=False, promoter_id=None, artist_id=None, company_id=None):
    session = db()
    try:
        concerts = concerts_for_report(
            session,
            day,
            past=past,
            promoter_id=promoter_id,
            artist_id=artist_id,
            company_id=company_id,
        )
        concert_ids = [c.id for c in concerts]

        # Aforo a la venta (si hay categorías por tipo, suma de aforos por tipo)
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
                    c.capacity = cap_sum

        totals, today_map, last_map, gross_map, _gross_today = sales_maps_unified(session, day, concert_ids)

        # Neto (IVA primero, luego SGAE sobre base sin IVA)
        net_map = {}
        for c in concerts:
            gross = float(gross_map.get(c.id, 0.0) or 0.0)
            vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            net_map[c.id] = float(_sales_net_breakdown(gross, vat, sgae).get("net") or 0.0)

        # Rebate neto (por ticketera) — ingreso separado de ventas
        ticketer_totals_map = {}
        rebate_net_map = {}
        if concert_ids:
            rows = (
                session.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id)
                .all()
            )
            for cid2, tid2, sold, gross in rows:
                ticketer_totals_map.setdefault(cid2, {})[tid2] = {"sold": int(sold or 0), "gross": float(gross or 0.0)}

        for c in concerts:
            vat_pct = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            cid2 = c.id
            total_rebate_net = 0.0
            for ct in (c.ticketers or []):
                tid2 = ct.ticketer_id
                sold_i = int((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("sold", 0) or 0)
                gross_f = float((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("gross", 0.0) or 0.0)

                rn = 0.0
                mode = (getattr(ct, "rebate_mode", None) or "").upper()
                if mode == "FIXED":
                    fixed_gross = float(getattr(ct, "rebate_fixed_gross", 0) or 0.0)
                    rn = (sold_i * fixed_gross) / 1.21 if fixed_gross else 0.0
                elif mode == "PERCENT":
                    pct = float(getattr(ct, "rebate_pct", 0) or 0.0)
                    if pct and gross_f:
                        vat_factor = 1.0 + (vat_pct / 100.0)
                        base_no_vat_ticketer = (gross_f / vat_factor) if vat_factor > 0 else gross_f
                        rn = base_no_vat_ticketer * (pct / 100.0)

                if rn < 0:
                    rn = 0.0
                total_rebate_net += rn

            rebate_net_map[cid2] = total_rebate_net

        sections = {k: [] for k in SALES_SECTION_ORDER}
        for c in concerts:
            if c.sale_type in sections:
                sections[c.sale_type].append(c)
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
            rebate_net_map=rebate_net_map,
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


def _concert_is_soldout_for_sales(concert, sold_total=0, capacity=None):
    try:
        sold_total = int(sold_total or 0)
    except Exception:
        sold_total = 0

    try:
        capacity_value = int((getattr(concert, "capacity", 0) if capacity is None else capacity) or 0)
    except Exception:
        capacity_value = 0

    return bool(getattr(concert, "sold_out", False) or (capacity_value > 0 and sold_total >= capacity_value))


def _sales_pdf_logo_path():
    candidates = [
        Path(app.root_path) / "static" / "img" / "logo_33_producciones.png",
        Path(app.root_path) / "static" / "img" / "logo_33.png",
        Path(app.root_path) / "static" / "img" / "logo.png",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def _draw_sales_pdf_logo(canvas, doc):
    logo_source = getattr(doc, "_sales_logo_source", None) or _sales_pdf_logo_path()
    if not logo_source:
        return

    try:
        from reportlab.lib.utils import ImageReader

        image_source = logo_source
        if isinstance(logo_source, str) and logo_source.startswith(("http://", "https://")):
            with urlopen(logo_source, timeout=6) as resp:
                image_source = BytesIO(resp.read())

        image = ImageReader(image_source)
        iw, ih = image.getSize()
        max_w = 96.0
        max_h = 24.0
        scale = min(max_w / float(iw or 1), max_h / float(ih or 1))
        width = max(1.0, float(iw) * scale)
        height = max(1.0, float(ih) * scale)
        x = float(getattr(doc, "leftMargin", 18) or 18)
        y = float(doc.pagesize[1]) - height - 10.0

        canvas.saveState()
        canvas.drawImage(image, x, y, width=width, height=height, mask="auto")
        canvas.restoreState()
    except Exception:
        pass



def _sales_pdf_clean_text(value, max_chars=None):
    text = " ".join(str(value or "").split())
    if max_chars and len(text) > max_chars:
        text = text[: max_chars - 1].rstrip() + "…"
    return text



def _sales_pdf_scaled_widths(widths, available_width):
    total = float(sum(widths) or 0)
    if total <= 0 or available_width <= 0:
        return list(widths)
    if total <= available_width:
        return list(widths)

    scale = float(available_width) / total
    return [w * scale for w in widths]



def _sales_pdf_body_font_size(ncols):
    if ncols >= 13:
        return 6.0
    if ncols >= 11:
        return 6.4
    if ncols >= 9:
        return 6.8
    return 7.0


@app.get("/ventas/reporte/pdf", endpoint="sales_report_pdf")
def sales_report_pdf():
    """Informe genérico de ventas en formato tabla (A4 apaisado)."""
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

    from xml.sax.saxutils import escape as _xml_escape
    from reportlab.lib.styles import ParagraphStyle

    def _fmt_int_es(n):
        try:
            return f"{int(n):,}".replace(",", ".")
        except Exception:
            return "0"

    totals = ctx.get("totals", {})
    today_map = ctx.get("today_map", {})
    last_map = ctx.get("last_map", {})
    gross_map = ctx.get("gross_map", {})
    net_map = ctx.get("net_map", {})
    sections = ctx.get("sections", {})
    titles = ctx.get("titles", {})

    header_labels = [
        "Fecha",
        "Artista",
        "Ciudad",
        "Prov.",
        "Recinto",
        "Hoy",
        "Total",
        "% venta",
        "Aforo",
        "Pend.",
        "Act.",
    ]
    base_widths = [46, 128, 78, 50, 134, 36, 48, 44, 50, 52, 54]
    if show_econ:
        header_labels += ["Bruto", "Neto"]
        base_widths += [70, 70]

    ncols = len(header_labels)
    body_font = _sales_pdf_body_font_size(ncols)

    logo_source = None
    if company_id:
        try:
            with get_db() as logo_db:
                company = logo_db.get(GroupCompany, to_uuid(company_id))
                if company and getattr(company, "logo_url", None):
                    logo_source = company.logo_url
        except Exception:
            logo_source = None
    if not logo_source:
        company_ids = {str(getattr(c, "billing_company_id", None) or getattr(c, "group_company_id", None)) for sale_type in SALES_SECTION_ORDER for c in (sections.get(sale_type) or []) if (getattr(c, "billing_company_id", None) or getattr(c, "group_company_id", None))}
        if len(company_ids) == 1:
            try:
                with get_db() as logo_db:
                    company = logo_db.get(GroupCompany, to_uuid(next(iter(company_ids))))
                    if company and getattr(company, "logo_url", None):
                        logo_source = company.logo_url
            except Exception:
                logo_source = None

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=18,
        rightMargin=18,
        topMargin=46,
        bottomMargin=20,
        title="Informe genérico de ventas",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "sales_report_pdf_title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=17,
        spaceAfter=0,
    )
    meta_style = ParagraphStyle(
        "sales_report_pdf_meta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#6c757d"),
    )
    body_style = ParagraphStyle(
        "sales_report_pdf_body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=body_font,
        leading=body_font + 1.25,
        wordWrap="CJK",
        splitLongWords=True,
    )
    header_style = ParagraphStyle(
        "sales_report_pdf_header",
        parent=body_style,
        fontName="Helvetica-Bold",
    )

    def _max_chars(width, lines=2):
        approx_per_line = max(8, int(width / max(body_font * 0.58, 1.0)))
        return approx_per_line * lines

    col_widths = _sales_pdf_scaled_widths(base_widths, doc.width)

    def _cell(text_value, col_idx, lines=1):
        cleaned = _sales_pdf_clean_text(text_value, _max_chars(col_widths[col_idx], lines))
        return Paragraph(_xml_escape(cleaned), body_style)

    def _artist_cell(concert, sold_total, cap, col_idx):
        name = _sales_pdf_clean_text(concert.artist.name if concert.artist else "-", _max_chars(col_widths[col_idx], 2))
        html = _xml_escape(name)
        if _concert_is_soldout_for_sales(concert, sold_total, cap):
            html += "<br/><font color='#c62828'><b>SOLD OUT</b></font>"
        return Paragraph(html, body_style)

    story = []
    title = f"Informe genérico de ventas — {day.strftime('%d/%m/%Y')}"
    generated = datetime.now(tz=TZ_MADRID).strftime("%d/%m/%Y %H:%M")
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(f"Generado: {generated}", meta_style))
    story.append(Spacer(1, 10))

    has_rows = False
    header_row = [Paragraph(_xml_escape(label), header_style) for label in header_labels]

    for key in SALES_SECTION_ORDER:
        lista = sections.get(key, []) or []
        if not lista:
            continue

        has_rows = True
        story.append(Paragraph(titles.get(key, key), styles["Heading2"]))
        data = [header_row]

        for concert in lista:
            cid = concert.id
            sold_total = int(totals.get(cid, 0) or 0)
            capacity = int(getattr(concert, "capacity", 0) or 0)
            pct = (sold_total / capacity * 100.0) if capacity else 0.0
            pending = max(0, capacity - sold_total) if capacity else 0
            sold_today = int(today_map.get(cid, 0) or 0)
            updated_last = last_map.get(cid)
            updated_str = updated_last.strftime("%d/%m") if updated_last else "-"
            venue = concert.venue

            row = [
                _cell(concert.date.strftime("%d/%m") if concert.date else "-", 0),
                _artist_cell(concert, sold_total, capacity, 1),
                _cell((venue.municipality if venue else "") or "", 2, lines=2),
                _cell((venue.province if venue else "") or "", 3, lines=2),
                _cell((venue.name if venue else "") or "", 4, lines=2),
                Paragraph(_fmt_int_es(sold_today), body_style),
                Paragraph(_fmt_int_es(sold_total), body_style),
                Paragraph(f"{pct:.1f}%", body_style),
                Paragraph(_fmt_int_es(capacity), body_style),
                Paragraph(_fmt_int_es(pending), body_style),
                _cell(updated_str, 10),
            ]
            if show_econ:
                row += [
                    Paragraph(_xml_escape(_fmt_money_eur(float(gross_map.get(cid, 0.0) or 0.0))), body_style),
                    Paragraph(_xml_escape(_fmt_money_eur(float(net_map.get(cid, 0.0) or 0.0))), body_style),
                ]
            data.append(row)

        table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
        table_style = TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ]
        )
        for col_idx in range(5, len(header_labels)):
            table_style.add("ALIGN", (col_idx, 1), (col_idx, -1), "RIGHT")
        table.setStyle(table_style)
        story.append(table)
        story.append(Spacer(1, 10))

    if not has_rows:
        story.append(Paragraph("No hay conciertos para los filtros seleccionados.", styles["Normal"]))

    doc._sales_logo_source = logo_source
    doc.build(story, onFirstPage=_draw_sales_pdf_logo, onLaterPages=_draw_sales_pdf_logo)
    buf.seek(0)

    suffix = "anteriores" if past else "reporte"
    filename = f"informe_ventas_{suffix}_{day.isoformat()}.pdf"
    return send_file(buf, mimetype="application/pdf", as_attachment=False, download_name=filename)


@app.get("/ventas/actualizar/informe/pdf", endpoint="sales_update_report_pdf")
@admin_required
def sales_update_report_pdf():
    """Genera un informe PDF (A4 horizontal) con campos seleccionables desde /ventas."""
    if not can_view_sales_report():
        return forbid("No tienes permisos para ver reportes de ventas.")

    session_db = db()
    try:
        day = get_day("d")

        selected_fields = request.args.getlist("fields") or []
        default_fields = [
            "date",
            "artist",
            "city",
            "province",
            "venue",
            "sold_total",
            "sold_today",
            "capacity",
            "pct",
            "pending",
            "gross",
            "net",
            "rebate_net",
            "updated",
        ]
        if not selected_fields:
            selected_fields = default_fields

        if not can_view_economics():
            selected_fields = [f for f in selected_fields if f not in ("gross", "net", "rebate_net")]

        artist_ids = [a for a in request.args.getlist("artist_ids") if a]
        artist_uuid_set = set()
        for a in artist_ids:
            try:
                artist_uuid_set.add(to_uuid(a))
            except Exception:
                pass

        concerts_q = (
            session_db.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                joinedload(Concert.sales_config),
                selectinload(Concert.ticket_types),
                selectinload(Concert.ticketers).joinedload(ConcertTicketer.ticketer),
            )
            .filter(Concert.sale_type.in_(SALES_SECTION_ORDER))
            .filter(Concert.sale_start_date <= day, Concert.date >= day)
        )
        if artist_uuid_set:
            concerts_q = concerts_q.filter(Concert.artist_id.in_(artist_uuid_set))

        concerts = concerts_q.order_by(Concert.date.asc()).all()
        concert_ids = [c.id for c in concerts]

        if concert_ids:
            cap_rows = (
                session_db.query(
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
                    c.capacity = cap_sum

        totals, today_map, last_map, gross_map, _gross_today = sales_maps_unified(session_db, day, concert_ids)
        capacity_map = {c.id: _concert_capacity_from_ticket_types(c) for c in concerts}

        net_map = {}
        for c in concerts:
            gross = float(gross_map.get(c.id, 0.0) or 0.0)
            vat = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            sgae = float(getattr(c.sales_config, "sgae_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            net_map[c.id] = float(_sales_net_breakdown(gross, vat, sgae).get("net") or 0.0)

        ticketer_totals_map = {}
        rebate_net_map = {}
        if concert_ids:
            rows = (
                session_db.query(
                    TicketSaleDetail.concert_id,
                    TicketSaleDetail.ticketer_id,
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .filter(TicketSaleDetail.concert_id.in_(concert_ids))
                .filter(TicketSaleDetail.day <= day)
                .group_by(TicketSaleDetail.concert_id, TicketSaleDetail.ticketer_id)
                .all()
            )
            for cid2, tid2, sold, gross in rows:
                ticketer_totals_map.setdefault(cid2, {})[tid2] = {"sold": int(sold or 0), "gross": float(gross or 0.0)}

        for c in concerts:
            vat_pct = float(getattr(c.sales_config, "vat_pct", 0) or 0) if getattr(c, "sales_config", None) else 0.0
            cid2 = c.id
            total_rebate_net = 0.0
            for ct in (c.ticketers or []):
                tid2 = ct.ticketer_id
                sold_i = int((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("sold", 0) or 0)
                gross_f = float((ticketer_totals_map.get(cid2, {}) or {}).get(tid2, {}).get("gross", 0.0) or 0.0)

                rn = 0.0
                mode = (getattr(ct, "rebate_mode", None) or "").upper()
                if mode == "FIXED":
                    fixed_gross = float(getattr(ct, "rebate_fixed_gross", 0) or 0.0)
                    rn = (sold_i * fixed_gross) / 1.21 if fixed_gross else 0.0
                elif mode == "PERCENT":
                    pct = float(getattr(ct, "rebate_pct", 0) or 0.0)
                    if pct and gross_f:
                        vat_factor = 1.0 + (vat_pct / 100.0)
                        base_no_vat_ticketer = (gross_f / vat_factor) if vat_factor > 0 else gross_f
                        rn = base_no_vat_ticketer * (pct / 100.0)

                if rn < 0:
                    rn = 0.0
                total_rebate_net += rn

            rebate_net_map[cid2] = total_rebate_net

        rebate_cfg_map = {
            c.id: any(((getattr(ct, 'rebate_mode', None) or '').strip()) for ct in (c.ticketers or []))
            for c in concerts
        }

        sections = {k: [] for k in SALES_SECTION_ORDER}
        for c in concerts:
            if c.sale_type in sections:
                sections[c.sale_type].append(c)
        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        def _pct_for(c):
            cap = float(capacity_map.get(c.id, c.capacity or 0) or 0)
            sold = float(totals.get(c.id, 0) or 0)
            return (sold / cap * 100.0) if cap > 0 else 0.0

        def _pending_for(c):
            cap = int(capacity_map.get(c.id, c.capacity or 0) or 0)
            sold = int(totals.get(c.id, 0) or 0)
            return max(0, cap - sold)

        def _updated_for(c):
            d2 = last_map.get(c.id)
            return d2.strftime("%d/%m/%Y") if d2 else ""

        field_defs = {
            "date": ("Fecha", lambda c: (c.date.strftime("%d/%m/%Y") if c.date else "")),
            "artist": ("Artista", lambda c: (c.artist.name if c.artist else "")),
            "city": ("Municipio", lambda c: (c.venue.municipality if c.venue else "")),
            "province": ("Provincia", lambda c: (c.venue.province if c.venue else "")),
            "venue": ("Recinto", lambda c: (c.venue.name if c.venue else "")),
            "sold_total": ("Vendidas", lambda c: str(int(totals.get(c.id, 0) or 0))),
            "sold_today": ("Hoy", lambda c: str(int(today_map.get(c.id, 0) or 0))),
            "capacity": ("Aforo", lambda c: str(int(capacity_map.get(c.id, c.capacity or 0) or 0))),
            "pct": ("% venta", lambda c: f"{_pct_for(c):.1f}%"),
            "pending": ("Pendientes", lambda c: str(_pending_for(c))),
            "gross": ("Bruto", lambda c: _fmt_money_eur(float(gross_map.get(c.id, 0.0) or 0.0))),
            "net": ("Neto", lambda c: _fmt_money_eur(float(net_map.get(c.id, 0.0) or 0.0))),
            "rebate_net": ("Rebate neto", lambda c: (_fmt_money_eur(float(rebate_net_map.get(c.id, 0.0) or 0.0)) if rebate_cfg_map.get(c.id) else "")),
            "updated": ("Actualizado", lambda c: _updated_for(c)),
        }

        selected_fields = [f for f in selected_fields if f in field_defs]
        if not selected_fields:
            selected_fields = ["date", "artist"]

        soldout_exists = any(
            _concert_is_soldout_for_sales(c, totals.get(c.id, 0), capacity_map.get(c.id, c.capacity or 0))
            for c in concerts
        )
        render_fields = list(selected_fields)
        inject_status_col = soldout_exists and ("artist" not in render_fields)
        if inject_status_col:
            render_fields.append("__status")

        field_defs_render = dict(field_defs)
        if inject_status_col:
            field_defs_render["__status"] = (
                "Estado",
                lambda c: ("SOLD OUT" if _concert_is_soldout_for_sales(c, totals.get(c.id, 0), capacity_map.get(c.id, c.capacity or 0)) else ""),
            )

        from xml.sax.saxutils import escape as _xml_escape
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import cm

        logo_source = None
        company_ids = {str(getattr(c, "billing_company_id", None) or getattr(c, "group_company_id", None)) for c in concerts if (getattr(c, "billing_company_id", None) or getattr(c, "group_company_id", None))}
        if len(company_ids) == 1:
            try:
                company = session_db.get(GroupCompany, to_uuid(next(iter(company_ids))))
                if company and getattr(company, "logo_url", None):
                    logo_source = company.logo_url
            except Exception:
                logo_source = None

        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=landscape(A4),
            leftMargin=1.0 * cm,
            rightMargin=1.0 * cm,
            topMargin=1.7 * cm,
            bottomMargin=1.0 * cm,
            title="Reporte de ventas",
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "sales_update_pdf_title",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=17,
            spaceAfter=0,
        )
        meta_style = ParagraphStyle(
            "sales_update_pdf_meta",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#6c757d"),
        )
        ncols = max(1, len(render_fields))
        body_font = _sales_pdf_body_font_size(ncols)
        body_style = ParagraphStyle(
            "sales_update_pdf_body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=body_font,
            leading=body_font + 1.25,
            wordWrap="CJK",
            splitLongWords=True,
        )
        header_style = ParagraphStyle(
            "sales_update_pdf_header",
            parent=body_style,
            fontName="Helvetica-Bold",
        )

        width_map = {
            "date": 54,
            "artist": 140,
            "city": 84,
            "province": 66,
            "venue": 136,
            "sold_total": 52,
            "sold_today": 46,
            "capacity": 56,
            "pct": 46,
            "pending": 58,
            "gross": 72,
            "net": 72,
            "rebate_net": 76,
            "updated": 68,
            "__status": 62,
        }
        col_widths = _sales_pdf_scaled_widths([width_map.get(field, 60) for field in render_fields], doc.width)

        def _max_chars(width, lines=2):
            approx_per_line = max(8, int(width / max(body_font * 0.58, 1.0)))
            return approx_per_line * lines

        def _make_cell(field_name, concert, col_idx):
            raw = str(field_defs_render[field_name][1](concert) or "")
            width = col_widths[col_idx]

            if field_name == "__status":
                if raw:
                    return Paragraph("<font color='#c62828'><b>SOLD OUT</b></font>", body_style)
                return Paragraph("", body_style)

            if field_name == "artist":
                name = _sales_pdf_clean_text(raw, _max_chars(width, 2))
                html = _xml_escape(name)
                if _concert_is_soldout_for_sales(concert, totals.get(concert.id, 0), capacity_map.get(concert.id, concert.capacity or 0)):
                    html += "<br/><font color='#c62828'><b>SOLD OUT</b></font>"
                return Paragraph(html, body_style)

            line_count = 3 if field_name == "venue" else (2 if field_name in ("city", "province") else 1)
            cleaned = _sales_pdf_clean_text(raw, _max_chars(width, line_count))
            return Paragraph(_xml_escape(cleaned), body_style)

        story = []
        generated = datetime.now(tz=TZ_MADRID).strftime("%d/%m/%Y %H:%M")
        story.append(Paragraph(f"Reporte de ventas — {day.strftime('%d/%m/%Y')}", title_style))
        story.append(Paragraph(f"Generado: {generated}", meta_style))
        story.append(Spacer(1, 0.25 * cm))

        if not concerts:
            story.append(Paragraph("No hay conciertos para los filtros seleccionados.", styles["Normal"]))
        else:
            cols = [field_defs_render[f][0] for f in render_fields]
            table_data = [[Paragraph(_xml_escape(col), header_style) for col in cols]]
            section_rows = []
            for sale_type in SALES_SECTION_ORDER:
                items = sections.get(sale_type, []) or []
                if not items:
                    continue

                section_rows.append(len(table_data))
                table_data.append([Paragraph(_xml_escape(SALES_SECTION_TITLE.get(sale_type, sale_type)), header_style)] + [""] * (len(cols) - 1))

                for concert in items:
                    row = [_make_cell(field_name, concert, idx) for idx, field_name in enumerate(render_fields)]
                    table_data.append(row)

            table = Table(table_data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
            table_style = TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )

            for row_idx in section_rows:
                table_style.add("SPAN", (0, row_idx), (-1, row_idx))
                table_style.add("BACKGROUND", (0, row_idx), (-1, row_idx), colors.whitesmoke)
                table_style.add("ALIGN", (0, row_idx), (-1, row_idx), "LEFT")

            numeric_fields = {"sold_total", "sold_today", "capacity", "pct", "pending", "gross", "net", "rebate_net"}
            center_fields = {"date", "updated", "__status"}
            for col_idx, field_name in enumerate(render_fields):
                if field_name in numeric_fields:
                    table_style.add("ALIGN", (col_idx, 1), (col_idx, -1), "RIGHT")
                elif field_name in center_fields:
                    table_style.add("ALIGN", (col_idx, 1), (col_idx, -1), "CENTER")

            table.setStyle(table_style)
            story.append(table)

        doc._sales_logo_source = logo_source
        doc.build(story, onFirstPage=_draw_sales_pdf_logo, onLaterPages=_draw_sales_pdf_logo)
        buf.seek(0)

        filename = f"reporte_ventas_{day.isoformat()}.pdf"
        return send_file(buf, mimetype="application/pdf", as_attachment=False, download_name=filename)
    finally:
        session_db.close()


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
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
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
                    func.sum(TicketSaleDetail.qty),
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
                .join(TicketSaleDetail, TicketSaleDetail.ticket_type_id == ConcertTicketType.id)
                .filter(ConcertTicketType.concert_id == concert_id)
                .filter(TicketSaleDetail.day <= day)
                .group_by(ConcertTicketType.id)
                .order_by(ConcertTicketType.created_at.asc())
                .all()
            )
            by_type = []
            for _id, n, qfs, sold, g in type_aggs:
                qfs_i = int(qfs or 0)
                sold_i = int(sold or 0)
                gross_f = float(g or 0)
                price_f = (gross_f / float(sold_i)) if sold_i else 0.0
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
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
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
                    func.sum(TicketSaleDetail.qty * TicketSaleDetail.unit_price_gross),
                )
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
    q = (request.args.get("q") or request.args.get("term") or "").strip()
    session = db()
    try:
        query = session.query(Promoter).options(
            joinedload(Promoter.publishing_company),
            selectinload(Promoter.companies),
        )
        if q:
            like = f"%{q}%"
            query = query.filter(
                (Promoter.nick.ilike(like))
                | (Promoter.first_name.ilike(like))
                | (Promoter.last_name.ilike(like))
                | (Promoter.contact_email.ilike(like))
                | (Promoter.contact_phone.ilike(like))
                | Promoter.id.in_(
                    session.query(PromoterCompany.promoter_id).filter(
                        or_(
                            PromoterCompany.legal_name.ilike(like),
                            PromoterCompany.tax_id.ilike(like),
                            PromoterCompany.fiscal_address.ilike(like),
                        )
                    )
                )
            )
        promoters = query.order_by(Promoter.nick.asc()).limit(20).all()

        out = []
        for p in promoters:
            first_name = (p.first_name or "").strip()
            last_name = (p.last_name or "").strip()
            full_name = " ".join([x for x in [first_name, last_name] if x]).strip()
            nick = (p.nick or "").strip()
            label = nick or full_name or (p.contact_email or "").strip() or (p.contact_phone or "").strip() or "Sin nombre"
            pub = p.publishing_company
            out.append({
                "id": str(p.id),
                "label": label,
                "text": label,
                "nick": nick,
                "first_name": first_name,
                "last_name": last_name,
                "contact_email": (p.contact_email or "").strip(),
                "contact_phone": (p.contact_phone or "").strip(),
                "publishing_company_id": str(pub.id) if pub else "",
                "publishing_company_name": (pub.name or "") if pub else "",
                "logo_url": (p.logo_url or ""),
                "companies": [_serialize_promoter_company(x) for x in (p.companies or [])],
            })
        return jsonify(out)
    finally:
        session.close()



def _parse_hashtag_text(raw: str | None) -> list[str]:
    raw = (raw or '').replace('\n', ',').replace(';', ',')
    parts = []
    for chunk in raw.split(','):
        chunk = (chunk or '').strip()
        if not chunk:
            continue
        if ' ' in chunk and chunk.count('#') <= 1 and ',' not in chunk:
            parts.extend([x for x in chunk.split() if x.strip()])
        else:
            parts.append(chunk)
    return _dedupe_concert_tags(parts)


def _contract_sheet_prefill(concert: Concert, sheet: ConcertContractSheet | None = None) -> dict:
    payload = dict(getattr(sheet, 'request_payload', {}) or {})
    data = dict(getattr(sheet, 'data', {}) or {})
    merged = {**payload, **data}
    if not merged.get('gala_date') and getattr(concert, 'date', None):
        merged['gala_date'] = concert.date.isoformat()
    if not merged.get('gala_municipality'):
        merged['gala_municipality'] = _concert_city(concert)
    if not merged.get('gala_province'):
        merged['gala_province'] = _concert_province_value(concert)
    if not merged.get('gala_venue'):
        merged['gala_venue'] = _concert_venue_name(concert)
    if not merged.get('gala_venue_address'):
        merged['gala_venue_address'] = _concert_venue_address(concert)
    if not merged.get('gala_postal_code'):
        merged['gala_postal_code'] = (getattr(concert, 'manual_postal_code', None) or '').strip()
    if not merged.get('gala_show_time'):
        merged['gala_show_time'] = (getattr(concert, 'show_time', None) or '').strip()
    if not merged.get('gala_doors_time'):
        merged['gala_doors_time'] = (getattr(concert, 'doors_time', None) or '').strip()
    if not merged.get('gala_capacity') and getattr(concert, 'capacity', None):
        merged['gala_capacity'] = str(concert.capacity)
    if not merged.get('promotion_announcement_date') and getattr(concert, 'announcement_date', None):
        merged['promotion_announcement_date'] = concert.announcement_date.isoformat()
    if not merged.get('promotion_sale_date') and getattr(concert, 'sale_start_date', None):
        merged['promotion_sale_date'] = concert.sale_start_date.isoformat()
    if 'ticket_types' not in merged:
        merged['ticket_types'] = []
    return merged


def _contract_sheet_sections(data: dict | None) -> list[dict]:
    data = data or {}
    tickets = data.get('ticket_types') or []
    total_sale = sum(int(x.get('qty_for_sale') or 0) for x in tickets)
    total_invites = sum(int(x.get('invites_total') or 0) for x in tickets)
    total_artist = sum(int(x.get('invites_artist') or 0) for x in tickets)
    return [
        {
            'title': 'Datos de la gala',
            'rows': [
                ('Municipio', data.get('gala_municipality')),
                ('Provincia', data.get('gala_province')),
                ('Fecha', data.get('gala_date')),
                ('Recinto', data.get('gala_venue')),
                ('Dirección del recinto', data.get('gala_venue_address')),
                ('Código postal', data.get('gala_postal_code')),
                ('Hora del show', data.get('gala_show_time')),
                ('Hora apertura de puertas', data.get('gala_doors_time')),
                ('Aforo', data.get('gala_capacity')),
            ],
        },
        {
            'title': 'Datos de la empresa',
            'rows': [
                ('Razón social', data.get('company_legal_name')),
                ('CIF', data.get('company_tax_id')),
                ('Dirección', data.get('company_address')),
                ('Municipio', data.get('company_municipality')),
                ('Provincia', data.get('company_province')),
                ('Código postal', data.get('company_postal_code')),
                ('Representante', data.get('company_representative')),
                ('DNI representante', data.get('company_representative_dni')),
                ('Email', data.get('company_email')),
                ('Teléfono', data.get('company_phone')),
            ],
        },
        {
            'title': 'Datos de producción local',
            'rows': [
                ('Razón social', data.get('local_legal_name')),
                ('CIF', data.get('local_tax_id')),
                ('Dirección', data.get('local_address')),
                ('Municipio', data.get('local_municipality')),
                ('Provincia', data.get('local_province')),
                ('Código postal', data.get('local_postal_code')),
                ('Representante', data.get('local_representative')),
                ('DNI representante', data.get('local_representative_dni')),
                ('Email', data.get('local_email')),
                ('Teléfono', data.get('local_phone')),
            ],
        },
        {
            'title': 'Datos producción técnica',
            'rows': [
                ('Responsable', data.get('technical_responsible')),
                ('Teléfono', data.get('technical_phone')),
                ('Email', data.get('technical_email')),
                ('Móvil', data.get('technical_mobile')),
            ],
        },
        {
            'title': 'Datos económicos',
            'rows': [
                ('Caché', data.get('economics_cache')),
                ('Reparto de taquilla', data.get('economics_box_office_split')),
                ('Observaciones', data.get('economics_notes')),
            ],
        },
        {
            'title': 'Datos del show',
            'rows': [
                ('Formato', data.get('show_format')),
                ('Tipo de concierto', ', '.join(data.get('show_types') or [])),
                ('Duración', data.get('show_duration')),
                ('Observaciones', data.get('show_notes')),
            ],
        },
        {
            'title': 'Promoción',
            'rows': [
                ('Acciones', data.get('promotion_actions')),
                ('Responsable de promoción', data.get('promotion_responsible')),
                ('Teléfono', data.get('promotion_phone')),
                ('Email', data.get('promotion_email')),
                ('Móvil', data.get('promotion_mobile')),
                ('Fecha de anuncio', data.get('promotion_announcement_date')),
                ('Fecha salida a la venta', data.get('promotion_sale_date')),
                ('Logotipos en cartel', data.get('promotion_poster_logos')),
            ],
        },
        {
            'title': 'Datos de ticketing',
            'rows': [
                ('¿Hay M&G?', 'Sí' if _truthy(data.get('ticketing_has_mg')) else 'No'),
                ('Puntos de venta', data.get('ticketing_points_of_sale')),
                ('Entradas a la venta (total)', total_sale or None),
                ('Invitaciones totales', total_invites or None),
                ('Invitaciones para artista', total_artist or None),
            ],
            'ticket_rows': tickets,
        },
    ]


@app.get('/promotores/<pid>', endpoint='promoter_detail_view')
@admin_required
def promoter_detail_view(pid):
    session = db()
    try:
        promoter = (
            session.query(Promoter)
            .options(selectinload(Promoter.companies), selectinload(Promoter.contacts))
            .filter(Promoter.id == to_uuid(pid))
            .first()
        )
        if not promoter:
            flash('Tercero no encontrado.', 'warning')
            return redirect(url_for('promoters_view'))
        tab = (request.args.get('tab') or 'general').strip().lower()
        if tab not in {'general', 'contactos'}:
            tab = 'general'
        grouped = defaultdict(list)
        for contact in promoter.contacts or []:
            key = (contact.title or 'Sin título').strip() or 'Sin título'
            grouped[key].append(contact)
        return render_template(
            'promoter_detail.html',
            promoter=promoter,
            tab=tab,
            contacts_by_title=sorted(grouped.items(), key=lambda x: _norm_text_key(x[0])),
        )
    finally:
        session.close()


@app.post('/promotores/<pid>/sociedades/create', endpoint='promoter_company_create')
@admin_required
def promoter_company_create(pid):
    session = db()
    try:
        promoter = session.get(Promoter, to_uuid(pid))
        if not promoter:
            flash('Tercero no encontrado.', 'warning')
            return redirect(url_for('promoters_view'))
        legal_name = (request.form.get('legal_name') or '').strip()
        if not legal_name:
            flash('Debes indicar el nombre social.', 'warning')
            return redirect(url_for('promoter_detail_view', pid=pid, tab='general'))
        company = PromoterCompany(
            promoter_id=promoter.id,
            legal_name=legal_name,
            tax_id=(request.form.get('tax_id') or '').strip() or None,
            fiscal_address=(request.form.get('fiscal_address') or '').strip() or None,
        )
        session.add(company)
        session.commit()
        flash('Sociedad añadida.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error creando sociedad: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='general'))


@app.post('/promotores/<pid>/sociedades/<company_id>/update', endpoint='promoter_company_update')
@admin_required
def promoter_company_update(pid, company_id):
    session = db()
    try:
        company = session.get(PromoterCompany, to_uuid(company_id))
        if not company or str(company.promoter_id) != str(pid):
            flash('Sociedad no encontrada.', 'warning')
            return redirect(url_for('promoter_detail_view', pid=pid, tab='general'))
        company.legal_name = (request.form.get('legal_name') or company.legal_name or '').strip()
        company.tax_id = (request.form.get('tax_id') or '').strip() or None
        company.fiscal_address = (request.form.get('fiscal_address') or '').strip() or None
        company.updated_at = datetime.now(ZoneInfo('Europe/Madrid'))
        session.commit()
        flash('Sociedad actualizada.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error actualizando sociedad: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='general'))


@app.post('/promotores/<pid>/sociedades/<company_id>/delete', endpoint='promoter_company_delete')
@admin_required
def promoter_company_delete(pid, company_id):
    session = db()
    try:
        company = session.get(PromoterCompany, to_uuid(company_id))
        if company and str(company.promoter_id) == str(pid):
            session.delete(company)
            session.commit()
            flash('Sociedad eliminada.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error eliminando sociedad: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='general'))


@app.post('/promotores/<pid>/contactos/create', endpoint='promoter_contact_create')
@admin_required
def promoter_contact_create(pid):
    session = db()
    try:
        promoter = session.get(Promoter, to_uuid(pid))
        if not promoter:
            flash('Tercero no encontrado.', 'warning')
            return redirect(url_for('promoters_view'))
        title = (request.form.get('title') or '').strip()
        first_name = (request.form.get('first_name') or '').strip()
        if not title or not first_name:
            flash('Título y nombre son obligatorios.', 'warning')
            return redirect(url_for('promoter_detail_view', pid=pid, tab='contactos'))
        contact = PromoterContact(
            promoter_id=promoter.id,
            title=title,
            first_name=first_name,
            last_name=(request.form.get('last_name') or '').strip() or None,
            email=(request.form.get('email') or '').strip() or None,
            phone=(request.form.get('phone') or '').strip() or None,
            mobile=(request.form.get('mobile') or '').strip() or None,
        )
        session.add(contact)
        session.commit()
        flash('Contacto añadido.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error creando contacto: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='contactos'))


@app.post('/promotores/<pid>/contactos/<contact_id>/update', endpoint='promoter_contact_update')
@admin_required
def promoter_contact_update(pid, contact_id):
    session = db()
    try:
        contact = session.get(PromoterContact, to_uuid(contact_id))
        if not contact or str(contact.promoter_id) != str(pid):
            flash('Contacto no encontrado.', 'warning')
            return redirect(url_for('promoter_detail_view', pid=pid, tab='contactos'))
        contact.title = (request.form.get('title') or contact.title or '').strip()
        contact.first_name = (request.form.get('first_name') or contact.first_name or '').strip()
        contact.last_name = (request.form.get('last_name') or '').strip() or None
        contact.email = (request.form.get('email') or '').strip() or None
        contact.phone = (request.form.get('phone') or '').strip() or None
        contact.mobile = (request.form.get('mobile') or '').strip() or None
        contact.updated_at = datetime.now(ZoneInfo('Europe/Madrid'))
        session.commit()
        flash('Contacto actualizado.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error actualizando contacto: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='contactos'))


@app.post('/promotores/<pid>/contactos/<contact_id>/delete', endpoint='promoter_contact_delete')
@admin_required
def promoter_contact_delete(pid, contact_id):
    session = db()
    try:
        contact = session.get(PromoterContact, to_uuid(contact_id))
        if contact and str(contact.promoter_id) == str(pid):
            session.delete(contact)
            session.commit()
            flash('Contacto eliminado.', 'success')
    except Exception as exc:
        session.rollback()
        flash(f'Error eliminando contacto: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('promoter_detail_view', pid=pid, tab='contactos'))


@app.get('/promotores/contactos/<contact_id>/share/<channel>', endpoint='promoter_contact_share')
@admin_required
def promoter_contact_share(contact_id, channel):
    session = db()
    try:
        contact = session.get(PromoterContact, to_uuid(contact_id))
        if not contact:
            flash('Contacto no encontrado.', 'warning')
            return redirect(url_for('promoters_view'))
        promoter = session.get(Promoter, contact.promoter_id)
        body = _contact_share_text(contact, promoter)
        subject = quote_plus(f'Contacto {promoter.nick if promoter else "tercero"}')
        encoded = quote_plus(body)
        channel = (channel or '').strip().lower()
        if channel == 'mail':
            return redirect(f'mailto:?subject={subject}&body={encoded}')
        if channel == 'sms':
            return redirect(f'sms:?body={encoded}')
        return redirect(f'https://wa.me/?text={encoded}')
    finally:
        session.close()


@app.get('/api/concerts/check-artist-conflict', endpoint='api_concert_artist_conflicts')
@admin_required
def api_concert_artist_conflicts():
    session = db()
    try:
        artist_id = to_uuid((request.args.get('artist_id') or '').strip())
        event_date = parse_date((request.args.get('date') or '').strip())
        exclude_id_raw = (request.args.get('exclude_id') or '').strip() or None
        query = (
            session.query(Concert)
            .options(joinedload(Concert.venue))
            .filter(Concert.artist_id == artist_id)
            .filter(Concert.date == event_date)
        )
        if exclude_id_raw:
            try:
                query = query.filter(Concert.id != to_uuid(exclude_id_raw))
            except Exception:
                pass
        rows = query.order_by(Concert.created_at.asc()).all()
        return jsonify([
            {
                'id': str(c.id),
                'festival_name': (c.festival_name or '').strip(),
                'venue_name': _concert_venue_name(c),
                'municipality': _concert_city(c),
                'province': _concert_province_value(c),
                'summary': ' · '.join([x for x in [c.festival_name or 'Evento', _concert_venue_name(c), _concert_city(c), _concert_province_value(c)] if x]),
            }
            for c in rows
        ])
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400
    finally:
        session.close()


def _parse_wizard_promoter_share_rows(form) -> list[dict]:
    rows = []
    ids = form.getlist('wizard_partner_promoter_id[]')
    company_ids = form.getlist('wizard_partner_company_id[]')
    pcts = form.getlist('wizard_partner_pct[]')
    bases = form.getlist('wizard_partner_base[]')
    for i, raw_id in enumerate(ids or []):
        raw_id = (raw_id or '').strip()
        if not raw_id:
            continue
        pct = _parse_optional_decimal(pcts[i] if i < len(pcts) else None)
        if pct is None:
            continue
        rows.append({
            'id': raw_id,
            'company_id': (company_ids[i] if i < len(company_ids) else '').strip() or None,
            'pct': pct,
            'pct_base': _norm_base(bases[i] if i < len(bases) else None),
            'amount': None,
            'amount_base': None,
        })
    dedup = {}
    for row in rows:
        dedup[(row['id'], row.get('company_id') or '')] = row
    return list(dedup.values())


def _parse_wizard_zone_rows(form) -> list[dict]:
    rows = []
    ids = form.getlist('wizard_zone_promoter_id[]')
    company_ids = form.getlist('wizard_zone_company_id[]')
    modes = form.getlist('wizard_zone_mode[]')
    amounts = form.getlist('wizard_zone_amount[]')
    pcts = form.getlist('wizard_zone_pct[]')
    bases = form.getlist('wizard_zone_base[]')
    concepts = form.getlist('wizard_zone_concept[]')
    for i, raw_id in enumerate(ids or []):
        raw_id = (raw_id or '').strip()
        if not raw_id:
            continue
        mode = (modes[i] if i < len(modes) else 'PERCENT').strip().upper()
        if mode not in {'PERCENT', 'FIXED'}:
            mode = 'PERCENT'
        if mode == 'FIXED':
            amount = _parse_optional_decimal(amounts[i] if i < len(amounts) else None)
            if amount is None:
                continue
            rows.append({
                'id': raw_id,
                'company_id': (company_ids[i] if i < len(company_ids) else '').strip() or None,
                'commission_type': 'AMOUNT',
                'commission_pct': None,
                'commission_base': None,
                'commission_amount': amount,
                'concept': (concepts[i] if i < len(concepts) else '').strip() or None,
                'exempt_amount': None,
            })
        else:
            pct = _parse_optional_decimal(pcts[i] if i < len(pcts) else None)
            if pct is None:
                continue
            rows.append({
                'id': raw_id,
                'company_id': (company_ids[i] if i < len(company_ids) else '').strip() or None,
                'commission_type': 'PERCENT',
                'commission_pct': pct,
                'commission_base': _norm_base(bases[i] if i < len(bases) else None),
                'commission_amount': None,
                'concept': (concepts[i] if i < len(concepts) else '').strip() or None,
                'exempt_amount': None,
            })
    return rows


@app.post('/conciertos/wizard/create', endpoint='concert_wizard_create')
@admin_required
def concert_wizard_create():
    if not (is_master() or can_edit_concerts()):
        return forbid('Tu usuario no tiene permisos para crear conciertos.')
    session = db()
    try:
        mode = (request.form.get('wizard_mode') or 'direct').strip().lower()
        artist_id_raw = (request.form.get('artist_id') or '').strip()
        if not artist_id_raw:
            raise ValueError('Debes seleccionar un artista.')
        artist_id = to_uuid(artist_id_raw)
        event_date = parse_date(request.form.get('date') or '')
        sale_type = (request.form.get('sale_type') or 'EMPRESA').strip().upper()
        if sale_type not in CONCERT_SALE_TYPES_ALL_SET:
            sale_type = 'EMPRESA'
        hashtags = _parse_hashtag_text(request.form.get('wizard_hashtags_text'))
        billing_company_id = to_uuid((request.form.get('billing_company_id') or '').strip() or None)
        festival_name = (request.form.get('festival_name') or '').strip() or None
        venue_id = to_uuid((request.form.get('venue_id') or '').strip() or None)
        manual_venue_name = (request.form.get('manual_venue_name') or '').strip() or None
        manual_venue_address = (request.form.get('manual_venue_address') or '').strip() or None
        manual_municipality = (request.form.get('manual_municipality') or '').strip() or None
        manual_province = (request.form.get('manual_province') or '').strip() or None
        manual_postal_code = (request.form.get('manual_postal_code') or '').strip() or None
        if not (venue_id or manual_municipality or manual_province):
            raise ValueError('Debes indicar recinto o al menos municipio y provincia.')

        if mode == 'request_sheet':
            promoter_email = (request.form.get('promoter_email') or '').strip()
            if not promoter_email:
                raise ValueError('Debes indicar el email del promotor.')
            concert = Concert(
                date=event_date,
                festival_name=festival_name,
                venue_id=venue_id,
                sale_type=sale_type,
                artist_id=artist_id,
                capacity=0,
                no_capacity=True,
                sale_start_date=None,
                sale_start_tbc=True,
                break_even_ticket=None,
                sold_out=False,
                group_company_id=None,
                billing_company_id=billing_company_id,
                hashtags=hashtags,
                status='BORRADOR',
                manual_venue_name=manual_venue_name,
                manual_venue_address=manual_venue_address,
                manual_municipality=manual_municipality,
                manual_province=manual_province,
                manual_postal_code=manual_postal_code,
            )
            session.add(concert)
            session.flush()
            artist = session.get(Artist, artist_id)
            sheet = ConcertContractSheet(
                concert_id=concert.id,
                public_token=uuid.uuid4().hex,
                promoter_email=promoter_email,
                status='REQUESTED',
                request_payload={
                    'artist_name': (artist.name if artist else ''),
                    'gala_date': event_date.isoformat() if event_date else '',
                    'gala_venue': _concert_venue_name(concert),
                    'gala_municipality': _concert_city(concert),
                    'gala_province': _concert_province_value(concert),
                    'hashtags': hashtags,
                    'sale_type': sale_type,
                },
            )
            session.add(sheet)
            session.commit()
            concert = session.get(Concert, concert.id)
            sheet = session.query(ConcertContractSheet).filter(ConcertContractSheet.concert_id == concert.id).first()
            company = session.get(GroupCompany, billing_company_id) if billing_company_id else None
            form_url = _external_url_for('concert_contract_public_form', token=sheet.public_token)
            logo_html = ''
            if company and company.logo_url:
                logo_html = f'<div style="margin-bottom:20px;"><img src="{company.logo_url}" style="max-height:64px;max-width:220px;"></div>'
            photo_html = ''
            if artist and artist.photo_url:
                photo_html = f'<img src="{artist.photo_url}" style="width:70px;height:70px;object-fit:cover;border-radius:50%;">'
            html_body = f'''<div style="font-family:Arial,sans-serif;color:#1f2937;">{logo_html}<h2 style="margin:0 0 16px;">Solicitud ficha de contratación</h2><div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;"><div style="display:flex;gap:16px;align-items:center;"><div>{photo_html}</div><div><div style="font-size:18px;font-weight:700;">{artist.name if artist else ''}</div><div>Fecha: {event_date.strftime('%d/%m/%Y')}</div><div>{_concert_venue_name(concert) or 'Recinto pendiente'}</div><div>{_concert_city(concert)} {('· ' + _concert_province_value(concert)) if _concert_province_value(concert) else ''}</div></div></div></div><p>Puedes cumplimentar la ficha de contratación desde este enlace:</p><p><a href="{form_url}" style="display:inline-block;background:#0d6efd;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Cumplimentar ficha de contratación</a></p><p style="color:#6b7280;font-size:13px;">Si el enlace deja de estar disponible es porque la ficha ya fue enviada o cerrada.</p></div>'''
            ok, error = _send_optional_email(promoter_email, 'Solicitud ficha de contratación', html_body, text_body=form_url)
            if ok:
                flash('Concierto creado en borrador y ficha de contratación enviada al promotor.', 'success')
            else:
                flash(f'Concierto creado en borrador. No se pudo enviar el correo automáticamente: {error}', 'warning')
            return redirect(url_for('concert_detail_view', cid=concert.id, tab='ficha'))

        promoter_id = to_uuid((request.form.get('promoter_id') or '').strip() or None)
        promoter_company_id = to_uuid((request.form.get('promoter_company_id') or '').strip() or None)
        no_capacity = _truthy(request.form.get('no_capacity'))
        sale_start_tbc = _truthy(request.form.get('sale_start_tbc'))
        show_time_tbc = _truthy(request.form.get('show_time_tbc'))
        doors_time_tbc = _truthy(request.form.get('doors_time_tbc'))
        do_not_announce = _truthy(request.form.get('do_not_announce'))
        capacity = 0 if no_capacity else (_parse_optional_positive_int(request.form.get('capacity')) or 0)
        announcement_date = None if do_not_announce else parse_optional_date(request.form.get('announcement_date'))
        sale_start_date = None if sale_start_tbc else parse_optional_date(request.form.get('sale_start_date'))

        concert = Concert(
            date=event_date,
            festival_name=festival_name,
            venue_id=venue_id,
            sale_type=sale_type,
            promoter_id=promoter_id,
            promoter_company_id=promoter_company_id,
            artist_id=artist_id,
            capacity=capacity,
            no_capacity=no_capacity,
            sale_start_date=sale_start_date,
            sale_start_tbc=sale_start_tbc,
            break_even_ticket=None,
            sold_out=False,
            group_company_id=None,
            billing_company_id=billing_company_id,
            hashtags=hashtags,
            status='HABLADO',
            manual_venue_name=manual_venue_name,
            manual_venue_address=manual_venue_address,
            manual_municipality=manual_municipality,
            manual_province=manual_province,
            manual_postal_code=manual_postal_code,
            show_time=(request.form.get('show_time') or '').strip() or None,
            doors_time=(request.form.get('doors_time') or '').strip() or None,
            show_time_tbc=show_time_tbc,
            doors_time_tbc=doors_time_tbc,
            invitations_json=_parse_invitation_rows(request.form),
            payment_terms_json=_parse_payment_terms_rows(request.form),
            announcement_date=announcement_date,
            do_not_announce=do_not_announce,
        )
        session.add(concert)
        session.flush()

        _replace_concert_promoter_shares(session, concert.id, _parse_wizard_promoter_share_rows(request.form))
        _replace_concert_zone_agents(session, concert.id, _parse_wizard_zone_rows(request.form))
        _replace_concert_company_shares(session, concert.id, [])

        cache_rows = _parse_cache_rows(
            request.form.getlist('cache_kind[]'),
            request.form.getlist('cache_concept[]'),
            request.form.getlist('cache_amount[]'),
            request.form.getlist('cache_var_mode[]'),
            request.form.getlist('cache_var_option[]'),
            request.form.getlist('cache_from_ticket[]'),
            request.form.getlist('cache_min_tickets[]'),
            request.form.getlist('cache_min_revenue[]'),
            request.form.getlist('cache_pct[]'),
            request.form.getlist('cache_pct_base[]'),
            request.form.getlist('cache_ticket_type[]'),
        )
        _replace_concert_caches(session, concert.id, cache_rows)
        _upsert_equipment_from_request(session, concert.id)
        _add_equipment_docs_from_request(session, concert.id)
        _add_equipment_notes_from_request(session, concert.id)

        session.commit()
        flash('Concierto creado correctamente.', 'success')
        return redirect(url_for('concert_detail_view', cid=concert.id, tab='general'))
    except Exception as exc:
        session.rollback()
        flash(f'Error creando concierto: {exc}', 'danger')
        return redirect(url_for('concerts_view', tab='vista'))
    finally:
        session.close()


@app.route('/ficha-contratacion/<token>', methods=['GET', 'POST'], endpoint='concert_contract_public_form')
def concert_contract_public_form(token):
    session = db()
    try:
        sheet = (
            session.query(ConcertContractSheet)
            .options(
                joinedload(ConcertContractSheet.concert).joinedload(Concert.artist),
                joinedload(ConcertContractSheet.concert).joinedload(Concert.venue),
                joinedload(ConcertContractSheet.concert).joinedload(Concert.billing_company),
            )
            .filter(ConcertContractSheet.public_token == (token or '').strip())
            .first()
        )
        if not sheet:
            abort(404)
        concert = sheet.concert
        if request.method == 'POST':
            if not _contract_sheet_can_submit(sheet):
                flash('Esta ficha ya no admite más envíos.', 'warning')
                return redirect(url_for('concert_contract_public_form', token=token))
            data = _parse_contract_sheet_form(request.form)
            sheet.data = data
            sheet.status = 'RECEIVED'
            sheet.submitted_at = datetime.now(ZoneInfo('Europe/Madrid'))
            sheet.updated_at = datetime.now(ZoneInfo('Europe/Madrid'))
            sheet.allow_resubmission = False
            session.commit()
            return render_template(
                'concert_contract_public.html',
                concert=concert,
                sheet=sheet,
                data=data,
                submitted=True,
                can_submit=False,
                public_mode=True,
                form_action=url_for('concert_contract_public_form', token=token),
            )
        data = _contract_sheet_prefill(concert, sheet)
        can_submit = _contract_sheet_can_submit(sheet)
        return render_template(
            'concert_contract_public.html',
            concert=concert,
            sheet=sheet,
            data=data,
            submitted=False,
            can_submit=can_submit,
            public_mode=True,
            form_action=url_for('concert_contract_public_form', token=token),
        )
    finally:
        session.close()


@app.route('/conciertos/<cid>/ficha-contratacion/revisar', methods=['GET', 'POST'], endpoint='concert_contract_sheet_review')
@admin_required
def concert_contract_sheet_review(cid):
    session = db()
    try:
        concert = (
            session.query(Concert)
            .options(
                joinedload(Concert.artist),
                joinedload(Concert.venue),
                selectinload(Concert.contract_sheet),
            )
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not concert or not concert.contract_sheet:
            flash('No hay ficha de contratación para este concierto.', 'warning')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        sheet = concert.contract_sheet
        auto_updates, conflicts = _prepare_contract_sheet_merge(concert, sheet.data or {})
        if request.method == 'POST':
            updates = list(auto_updates)
            for item in conflicts:
                updates.append({'field': item['field'], 'label': item['label'], 'value': item['incoming']})
            decisions = {}
            for item in conflicts:
                decisions[item['field']] = (request.form.get(f'decision_{item["field"]}') or 'keep').strip().lower()
            applied = _apply_contract_sheet_merge(concert, updates, decisions)
            try:
                session.flush()
                session.expire(concert, ['venue'])
            except Exception:
                pass
            _sync_artwork_request_refresh_flag(concert)
            sheet.status = 'ACCEPTED'
            sheet.allow_resubmission = False
            now = datetime.now(ZoneInfo('Europe/Madrid'))
            sheet.accepted_at = now
            sheet.reviewed_at = now
            sheet.updated_at = now
            sheet.merge_log = list(sheet.merge_log or []) + [{
                'at': now.isoformat(),
                'applied': applied,
                'decisions': decisions,
            }]
            session.commit()
            if applied:
                flash('Ficha aceptada. Se completaron automáticamente: ' + ', '.join(applied), 'success')
            else:
                flash('Ficha aceptada.', 'success')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        return render_template(
            'concert_contract_merge.html',
            concert=concert,
            sheet=sheet,
            auto_updates=auto_updates,
            conflicts=conflicts,
        )
    finally:
        session.close()


@app.post('/conciertos/<cid>/ficha-contratacion/rechazar', endpoint='concert_contract_sheet_reject')
@admin_required
def concert_contract_sheet_reject(cid):
    session = db()
    try:
        concert = (
            session.query(Concert)
            .options(selectinload(Concert.contract_sheet), joinedload(Concert.artist))
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not concert or not concert.contract_sheet:
            flash('No hay ficha de contratación para este concierto.', 'warning')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        reason = (request.form.get('reason') or '').strip()
        if not reason:
            flash('Debes indicar el motivo del rechazo.', 'warning')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        sheet = concert.contract_sheet
        now = datetime.now(ZoneInfo('Europe/Madrid'))
        sheet.status = 'REJECTED'
        sheet.rejection_reason = reason
        sheet.allow_resubmission = True
        sheet.rejected_at = now
        sheet.reviewed_at = now
        sheet.updated_at = now
        session.commit()
        form_url = _external_url_for('concert_contract_public_form', token=sheet.public_token)
        html_body = f'''<div style="font-family:Arial,sans-serif;color:#1f2937;"><h2>Solicitud de subsanación de ficha de contratación</h2><p>La ficha enviada para <strong>{concert.artist.name if concert.artist else 'el concierto'}</strong> necesita correcciones.</p><p><strong>Motivo:</strong><br>{reason}</p><p><a href="{form_url}" style="display:inline-block;background:#0d6efd;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Subsanar ficha</a></p></div>'''
        ok, error = _send_optional_email(sheet.promoter_email or '', 'Subsanación ficha de contratación', html_body, text_body=form_url)
        if ok:
            flash('Ficha rechazada y solicitud de subsanación enviada.', 'warning')
        else:
            flash(f'Ficha rechazada. No se pudo enviar el correo automáticamente: {error}', 'warning')
    except Exception as exc:
        session.rollback()
        flash(f'Error rechazando ficha: {exc}', 'danger')
    finally:
        session.close()
    return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))


@app.route('/conciertos/<cid>/ficha-contratacion/editar', methods=['GET', 'POST'], endpoint='concert_contract_sheet_edit')
@admin_required
def concert_contract_sheet_edit(cid):
    session = db()
    try:
        concert = (
            session.query(Concert)
            .options(selectinload(Concert.contract_sheet), joinedload(Concert.artist), joinedload(Concert.venue), joinedload(Concert.billing_company))
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not concert or not concert.contract_sheet:
            flash('No hay ficha de contratación para este concierto.', 'warning')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        sheet = concert.contract_sheet
        if request.method == 'POST':
            sheet.data = _parse_contract_sheet_form(request.form)
            sheet.updated_at = datetime.now(ZoneInfo('Europe/Madrid'))
            if sheet.status == 'REQUESTED':
                sheet.status = 'RECEIVED'
            session.commit()
            flash('Ficha actualizada.', 'success')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        return render_template(
            'concert_contract_public.html',
            concert=concert,
            sheet=sheet,
            data=_contract_sheet_prefill(concert, sheet),
            submitted=False,
            can_submit=True,
            public_mode=False,
            admin_mode=True,
            form_action=url_for('concert_contract_sheet_edit', cid=cid),
        )
    finally:
        session.close()


@app.get('/conciertos/<cid>/ficha-contratacion/pdf', endpoint='concert_contract_sheet_pdf')
@admin_required
def concert_contract_sheet_pdf(cid):
    if not REPORTLAB_AVAILABLE:
        return abort(503)
    session = db()
    try:
        concert = (
            session.query(Concert)
            .options(selectinload(Concert.contract_sheet), joinedload(Concert.artist))
            .filter(Concert.id == to_uuid(cid))
            .first()
        )
        if not concert or not concert.contract_sheet:
            flash('No hay ficha de contratación para este concierto.', 'warning')
            return redirect(url_for('concert_detail_view', cid=cid, tab='ficha'))
        sheet = concert.contract_sheet
        data = _contract_sheet_prefill(concert, sheet)
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
        styles = getSampleStyleSheet()
        story = [
            Paragraph('Ficha de contratación', styles['Title']),
            Spacer(1, 8),
            Paragraph(f"Artista: {concert.artist.name if concert.artist else '—'}", styles['Normal']),
            Paragraph(f"Fecha concierto: {concert.date.strftime('%d/%m/%Y') if concert.date else '—'}", styles['Normal']),
            Spacer(1, 12),
        ]
        for section in _contract_sheet_sections(data):
            story.append(Paragraph(section['title'], styles['Heading2']))
            rows = [['Campo', 'Valor']]
            for label, value in section.get('rows') or []:
                if value in (None, '', []):
                    continue
                rows.append([label, str(value)])
            if len(rows) > 1:
                table = Table(rows, colWidths=[170, 330])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
                ]))
                story.append(table)
                story.append(Spacer(1, 10))
            ticket_rows = section.get('ticket_rows') or []
            if ticket_rows:
                trows = [['Tipo', 'Entradas venta', 'Importe', 'Inv. totales', 'Inv. artista']]
                for row in ticket_rows:
                    trows.append([
                        str(row.get('name') or ''),
                        str(row.get('qty_for_sale') or 0),
                        str(row.get('amount') or 0),
                        str(row.get('invites_total') or 0),
                        str(row.get('invites_artist') or 0),
                    ])
                t = Table(trows, colWidths=[150, 90, 70, 90, 90])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ]))
                story.append(t)
                story.append(Spacer(1, 10))
        doc.build(story)
        buf.seek(0)
        filename = f"ficha_contratacion_{(concert.artist.name if concert.artist else 'concierto').replace(' ', '_')}.pdf"
        return send_file(buf, mimetype='application/pdf', as_attachment=False, download_name=filename)
    finally:
        session.close()

# =========================
# CUADRANTES
# =========================


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
    """Promotora/empresa principal visible en cuadrantes."""
    if getattr(concert, "promoter", None):
        return (
            getattr(concert.promoter, "logo_url", None),
            getattr(concert.promoter, "nick", None),
        )
    if getattr(concert, "billing_company", None):
        return (
            getattr(concert.billing_company, "logo_url", None),
            getattr(concert.billing_company, "name", None),
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
    """Vista Cuadrantes."""
    session_db = db()
    try:
        artists = session_db.query(Artist).order_by(Artist.name.asc()).all()
        all_concert_tags = _collect_all_concert_tags(session_db)
        type_choices = [(k, CONCERT_SALE_TYPE_LABELS.get(k, k)) for k in CONCERTS_SECTION_ORDER]

        raw_ids = request.args.getlist("artist_id")
        selected_uuids = []
        for rid in raw_ids:
            try:
                u = to_uuid(rid)
                if u:
                    selected_uuids.append(u)
            except Exception:
                pass

        try:
            year = int(request.args.get("year") or today_local().year)
        except Exception:
            year = today_local().year

        years_rows = (
            session_db.query(func.extract("year", Concert.date))
            .distinct()
            .order_by(func.extract("year", Concert.date))
            .all()
        )
        year_options = sorted({int(r[0]) for r in years_rows if r and r[0] is not None})
        if not year_options:
            year_options = [today_local().year]

        months = _build_year_calendar(year)

        allowed_status = {"BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO"}
        f_statuses = [s for s in request.args.getlist("status") if s in allowed_status]
        if not f_statuses:
            f_statuses = ["BORRADOR", "HABLADO", "RESERVADO", "CONFIRMADO"]

        allowed_types = CONCERT_SALE_TYPES_ALL_SET
        f_sale_types_raw = request.args.getlist("type") or []
        f_sale_types = [(t or "").strip().upper() for t in f_sale_types_raw if (t or "").strip()]
        f_sale_types = [t for t in f_sale_types if t in allowed_types]
        if not f_sale_types:
            f_sale_types = list(CONCERT_SALE_TYPES_ALL)

        f_concert_tags = _dedupe_concert_tags(request.args.getlist("concert_tag") or request.args.getlist("hashtag") or [])
        allowed_announcements = {"NO_ANNOUNCE", "UPCOMING", "ANNOUNCED"}
        f_announcements = [
            (a or "").strip().upper()
            for a in (request.args.getlist("announcement") or [])
            if (a or "").strip()
        ]
        f_announcements = [a for a in f_announcements if a in allowed_announcements]
        if not f_announcements:
            f_announcements = ["NO_ANNOUNCE", "UPCOMING", "ANNOUNCED"]

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
        show_hashtag = _flag("show_hashtag", True)
        show_announcement = _flag("show_announcement", True)

        selected_artists = []
        events_by_artist = []
        events_flat = []
        marks_by_date = {}

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
                    joinedload(Concert.billing_company),
                )
                .filter(Concert.artist_id.in_(selected_uuids))
                .filter(func.extract("year", Concert.date) == year)
                .filter(Concert.sale_type.in_(f_sale_types))
                .order_by(Concert.date.asc())
                .all()
            )

            if f_concert_tags:
                concerts = [c for c in concerts if _concert_matches_any_tag(c, f_concert_tags)]
            if f_announcements:
                concerts = [c for c in concerts if _announcement_state(c) in f_announcements]

            concert_ids = [c.id for c in concerts]

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

            palette = [
                "#0d6efd",
                "#198754",
                "#6f42c1",
                "#fd7e14",
                "#d63384",
                "#20c997",
                "#0dcaf0",
                "#dc3545",
            ]
            artist_color = {str(a.id): palette[i % len(palette)] for i, a in enumerate(selected_artists)}

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

            per_artist = {str(a.id): [] for a in selected_artists}

            for c in concerts:
                st = (c.status or "HABLADO")
                if st not in f_statuses:
                    continue

                has_cache = bool(caches_map.get(c.id))
                has_equip = (c.id in equip_ids)
                cap = int(c.capacity or 0)
                dstr = c.date.isoformat()
                cache_txt = _cache_summary(caches_map.get(c.id, []))
                pro_logo, pro_name = _promoter_display(c)
                tags_clean = _concert_tags(c)
                announcement_state = _announcement_state(c)
                announcement_badge = _announcement_badge(c)

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
                    "sale_type_label": _sale_type_label(c.sale_type),
                    "status": st,
                    "province": _concert_province_value(c),
                    "municipality": _concert_city(c),
                    "venue_name": _concert_venue_name(c),
                    "capacity": cap,
                    "capacity_label": "Sin aforo" if getattr(c, "no_capacity", False) else cap,
                    "cache": cache_txt,
                    "has_cache": has_cache,
                    "has_equipment": has_equip,
                    "promoter_name": pro_name or "",
                    "promoter_logo": pro_logo or "",
                    "hashtags": tags_clean,
                    "hashtags_text": " · ".join([f"#{x}" for x in tags_clean]),
                    "announcement_state": announcement_state,
                    "announcement_badge": announcement_badge,
                })

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
            type_choices=type_choices,
            all_concert_tags=all_concert_tags,
            f_concert_tags=f_concert_tags,
            f_announcements=f_announcements,
            f_statuses=f_statuses,
            f_sale_types=f_sale_types,
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
            show_hashtag=show_hashtag,
            show_announcement=show_announcement,
        )

    finally:
        session_db.close()

if __name__ == "__main__":
    init_db()
    app.run(debug=True)