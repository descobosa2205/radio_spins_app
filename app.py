from datetime import date, timedelta, datetime
from uuid import UUID
import uuid as _uuid
import json
from functools import wraps
from zoneinfo import ZoneInfo
from sqlalchemy.orm import selectinload, joinedload
from flask import (
    Flask, render_template, request, redirect, url_for, flash, jsonify, session, send_from_directory
)
from sqlalchemy import func, text

from werkzeug.security import check_password_hash
import calendar as _cal
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from config import settings
from models import (
    init_db, SessionLocal, User, Artist, Song, SongArtist, RadioStation,
    Week, Play, SongWeekInfo, Promoter, Venue, Concert, TicketSale, GroupCompany,
    ConcertPromoterShare, ConcertCompanyShare, ConcertZoneAgent, ConcertCache, ConcertContract,
    ConcertNote, ConcertEquipment, ConcertEquipmentDocument, ConcertEquipmentNote
)
from supabase_utils import upload_png, upload_pdf
app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

SALES_SECTION_ORDER = ["EMPRESA", "PARTICIPADOS", "CADIZ", "VENDIDO"]
SALES_SECTION_TITLE = {
    "EMPRESA": "Conciertos — Empresa",
    "PARTICIPADOS": "Conciertos — Participados",
    "CADIZ": "Cádiz Music Stadium",
    "VENDIDO": "Conciertos — Vendidos",
}
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

def to_uuid(val):
    if val is None or val == "":
        return None
    if isinstance(val, UUID):
        return val
    return _uuid.UUID(str(val))

def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            nxt = request.full_path if request.query_string else request.path
            return redirect(url_for("admin_login", next=nxt))
        return view(*args, **kwargs)
    return wrapper

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
        has_endpoint=has_endpoint
    )

# ---------- landing ----------
@app.route("/")
def landing():
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        nxt = request.form.get("next") or url_for("home")

        session_db = db()
        try:
            user = session_db.query(User).filter(func.lower(User.email) == email).first()
            if user and check_password_hash(user.password_hash, password):
                session["user_id"] = str(user.id)
                flash("Bienvenido.", "success")
                return redirect(nxt)
            else:
                flash("Usuario o contraseña incorrectos.", "danger")
        finally:
            session_db.close()
    next_param = request.args.get("next") or ""
    return render_template("login.html", next_url=next_param)

@app.get("/logout")
def admin_logout():
    session.pop("user_id", None)
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
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

@app.post("/artistas/<artist_id>/update")
@admin_required
def artist_update(artist_id):
    session_db = db()
    a = session_db.get(Artist, to_uuid(artist_id))
    if not a:
        flash("Artista no encontrado.", "warning")
        session_db.close()
        return redirect(url_for("artists_view"))
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
    return redirect(url_for("artists_view"))

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
    return redirect(url_for("artists_view"))

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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
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

# ---------- CANCIONES ----------
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        collaborator = request.form.get("collaborator", "").strip() or None
        release_date = parse_date(request.form.get("release_date"))
        cover = request.files.get("cover")
        artist_ids = [to_uuid(aid) for aid in request.form.getlist("artist_ids[]")]
        try:
            cover_url = upload_png(cover, "songs") if cover else None
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
            s.cover_url = upload_png(cover, "songs")
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        nick = request.form.get("nick","").strip()
        logo = request.files.get("logo")
        try:
            logo_url = upload_png(logo, "promoters") if logo else None
            p = Promoter(nick=nick, logo_url=logo_url)
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
            p.logo_url = upload_png(logo, "promoters")
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
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
    included = request.form.getlist("equipment_included[]")
    included = [x for x in (included or []) if (x or "").strip()]

    other = (request.form.get("equipment_other") or "").strip() or None

    covered = (request.form.get("equipment_covered") == "on")
    covered_mode = (request.form.get("equipment_covered_mode") or "").strip().upper() or None
    if covered_mode not in ("RIDER", "AMOUNT"):
        covered_mode = None

    covered_amount = _parse_optional_decimal(request.form.get("equipment_covered_amount"))

    # determinar si hay contenido
    has_any = bool(included) or bool(other) or covered

    eq = session.query(ConcertEquipment).filter_by(concert_id=concert_id).first()

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
    session = db()
    artists = session.query(Artist).order_by(Artist.name.asc()).all()
    venues = session.query(Venue).order_by(Venue.name.asc()).all()
    promoters = session.query(Promoter).order_by(Promoter.nick.asc()).all()
    companies = session.query(GroupCompany).order_by(GroupCompany.name.asc()).all()

    active_tab = (request.args.get("tab") or "vista").lower()
    if active_tab not in ("vista", "alta"):
        active_tab = "alta"


    # filtros (solo para vista)
    f_artist_ids = request.args.getlist("artist") or []
    f_sale_types = request.args.getlist("type") or []
    f_statuses = request.args.getlist("status") or []

    f_artist_ids = [to_uuid(x) for x in f_artist_ids if (x or "").strip()]
    f_sale_types = [(x or "").strip().upper() for x in f_sale_types if (x or "").strip()]
    f_statuses = [(x or "").strip().upper() for x in f_statuses if (x or "").strip()]

    # sanitizar
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
    f_statuses = [x for x in f_statuses if x in ("HABLADO", "RESERVADO", "CONFIRMADO")]

    if request.method == "POST":
        try:
            sale_type = (request.form.get("sale_type") or "EMPRESA").strip().upper()
            if sale_type not in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ"):
                sale_type = "EMPRESA"

            venue_raw = (request.form.get("venue_id") or "").strip()
            if not venue_raw:
                raise ValueError("Debes seleccionar un recinto de la lista (o crearlo desde el botón +).")

            be_val = _parse_optional_positive_int((request.form.get("break_even_ticket") or "").strip())

            c = Concert(
                date=parse_date(request.form["date"]),
                festival_name=(request.form.get("festival_name") or "").strip() or None,
                venue_id=to_uuid(venue_raw),
                sale_type=sale_type,
                promoter_id=to_uuid(request.form.get("promoter_id") or None) if sale_type == "VENDIDO" else None,
                group_company_id=to_uuid(request.form.get("group_company_id") or None) if sale_type == "EMPRESA" else None,
                billing_company_id=to_uuid(request.form.get("billing_company_id") or None),
                artist_id=to_uuid(request.form["artist_id"]),
                capacity=int(request.form.get("capacity") or 0),
                sale_start_date=parse_date(request.form["sale_start_date"]),
                break_even_ticket=(None if sale_type == "VENDIDO" else be_val),
                sold_out=False,
                status=_norm_status(request.form.get("status")),
            )
            # Si es EMPRESA y no han seleccionado empresa que factura, usar la misma de gestión
            if sale_type == "EMPRESA" and not c.billing_company_id:
                c.billing_company_id = c.group_company_id

            session.add(c)
            session.flush()

            # --- colaboradores / participaciones (opcionales) ---
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
            _replace_concert_caches(session, c.id, cache_rows)

            # contratos (opcionales)
            _add_contracts_from_request(session, c.id)

            # notas contratación (opcionales)
            _add_concert_notes_from_request(session, c.id)

            # equipamiento (opcional)
            _upsert_equipment_from_request(session, c.id)
            _add_equipment_docs_from_request(session, c.id)
            _add_equipment_notes_from_request(session, c.id)

            session.commit()
            flash("Concierto creado.", "success")
            return redirect(url_for("concerts_view", tab="vista") + f"#concert-{c.id}")

        except Exception as e:
            session.rollback()
            flash(f"Error creando concierto: {e}", "danger")
            return redirect(url_for("concerts_view", tab="alta"))
        finally:
            session.close()

    # --- GET ---

    # --- GET ---
    q = (
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
    )

    if f_artist_ids:
        q = q.filter(Concert.artist_id.in_(f_artist_ids))
    if f_sale_types:
        q = q.filter(Concert.sale_type.in_(f_sale_types))
    if f_statuses:
        q = q.filter(Concert.status.in_(f_statuses))

    concerts = q.order_by(Concert.date.asc()).all()

    sections = {k: [] for k in SALES_SECTION_ORDER}
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
        order=SALES_SECTION_ORDER,
        titles=SALES_SECTION_TITLE,
        f_artist_ids=[str(x) for x in f_artist_ids],
        f_sale_types=f_sale_types,
        f_statuses=f_statuses,
    )


# ---------- EDITAR (vista dedicada) ----------
@app.get("/conciertos/<cid>/editar", endpoint="concert_edit_view")
@admin_required
def concert_edit_view(cid):
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
            c=c,
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

    try:
        sale_type = (request.form.get("sale_type") or c.sale_type or "EMPRESA").strip().upper()
        if sale_type not in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ"):
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
        if sale_type == "EMPRESA" and not c.billing_company_id:
            c.billing_company_id = c.group_company_id
        c.capacity = int(request.form.get("capacity") or 0)
        c.sale_start_date = parse_date(request.form["sale_start_date"])
        c.break_even_ticket = None if sale_type == "VENDIDO" else _parse_optional_positive_int((request.form.get("break_even_ticket") or "").strip())
        c.status = _norm_status(request.form.get("status"))

        # principal según tipo
        c.group_company_id = to_uuid(request.form.get("group_company_id") or None) if sale_type == "EMPRESA" else None
        c.promoter_id = to_uuid(request.form.get("promoter_id") or None) if sale_type == "VENDIDO" else None

        # Si es EMPRESA y no han seleccionado empresa que factura, usar la misma de gestión
        if sale_type == "EMPRESA" and not c.billing_company_id:
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

    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")

    finally:
        session.close()

    return redirect(url_for("concerts_view", tab="vista") + f"#concert-{cid}")


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
    session = db()
    try:
        name = (request.form.get("name") or "").strip()
        if not name:
            return jsonify({"error": "El nombre del recinto es obligatorio."}), 400

        v = Venue(
            name=name,
            covered=(request.form.get("covered") == "on"),
            address=(request.form.get("address") or "").strip() or None,
            municipality=(request.form.get("municipality") or "").strip() or None,
            province=(request.form.get("province") or "").strip() or None,
        )
        session.add(v)
        session.commit()

        label = f"{v.name} — {(v.municipality or '').strip()} {(v.province or '').strip()}".strip(" —")
        return jsonify({"id": str(v.id), "label": label, "municipality": v.municipality, "province": v.province})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 400

    finally:
        session.close()


@app.post("/api/promoters/create", endpoint="api_create_promoter")
@admin_required
def api_create_promoter():
    session = db()
    try:
        nick = (request.form.get("nick") or "").strip()
        if not nick:
            return jsonify({"error": "El nombre del tercero es obligatorio."}), 400

        logo = request.files.get("logo")
        logo_url = upload_png(logo, "promoters") if logo and getattr(logo, "filename", "") else None

        p = Promoter(nick=nick, logo_url=logo_url)
        session.add(p)
        session.commit()
        return jsonify({"id": str(p.id), "label": p.nick, "logo_url": p.logo_url})

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
@admin_required
def concert_equipment_note_delete(cid, nid):
    session = db()
    try:
        n = session.get(ConcertEquipmentNote, to_uuid(nid))
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
    f_sale_types = [x for x in f_sale_types if x in ("EMPRESA", "VENDIDO", "PARTICIPADOS", "CADIZ")]
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

def sales_maps(session, day: date):
    """
    Devuelve:
      - totals:  {concert_id: total_acumulado_hasta_day}
      - today:   {concert_id: vendidas_hoy}
      - lastmap: {concert_id: última_fecha_con_registro}
    Todas las claves que no existan en la tabla salen como 0/None en la lectura.
    """
    totals = {cid: int(total) for cid, total in (
        session.query(TicketSale.concert_id, func.sum(TicketSale.sold_today))
              .filter(TicketSale.day <= day)
              .group_by(TicketSale.concert_id).all()
    )}

    today = {cid: int(q) for cid, q in (
        session.query(TicketSale.concert_id, func.sum(TicketSale.sold_today))
              .filter(TicketSale.day == day)
              .group_by(TicketSale.concert_id).all()
    )}

    lastmap = {cid: d for cid, d in (
        session.query(TicketSale.concert_id, func.max(TicketSale.day))
              .group_by(TicketSale.concert_id).all()
    )}

    return totals, today, lastmap

@app.route("/ventas")
@admin_required
def sales_update_view():
    session = db()
    day = date_or_today("d")
    prev_day = day - timedelta(days=1)
    next_day = day + timedelta(days=1)

    # Conciertos a la venta ese día (inicio venta <= día y fecha de concierto futura)
    concerts = (
        session.query(Concert)
        .options(
            joinedload(Concert.artist),
            joinedload(Concert.venue),
            joinedload(Concert.promoter),
            joinedload(Concert.group_company),
            joinedload(Concert.billing_company),
        )
        .filter(Concert.sale_start_date <= day, Concert.date >= day)
        .filter(Concert.artist_id.in_(f_artist_ids)) if f_artist_ids else None
        #FILTER_ARTISTS
        .order_by(Concert.date.asc())
        .all()
    )

    totals, today_map, _last = sales_maps(session, day)

    # Agrupamos por tipo de concierto usando el mismo orden y títulos que el reporte
    sections = {k: [] for k in SALES_SECTION_ORDER}
    for c in concerts:
        if c.sale_type in sections:
            sections[c.sale_type].append(c)

    # Orden interno: fecha y nombre de artista
    for lst in sections.values():
        lst.sort(key=lambda x: (x.date or date.max,
                                x.artist.name if x.artist else ""))

    session.close()
    return render_template(
        "sales_update.html",
        day=day,
        prev_day=prev_day,
        next_day=next_day,
        sections=sections,
        order=SALES_SECTION_ORDER,
        titles=SALES_SECTION_TITLE,
        f_artist_ids=[str(x) for x in f_artist_ids],
        f_sale_types=f_sale_types,
        f_statuses=f_statuses,
        totals=totals,
        today_map=today_map,
    )
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
        )
    )

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

        totals, today_map, last_map = sales_maps(session, day)

        sections = {
            "EMPRESA":      [c for c in concerts if c.sale_type == "EMPRESA"],
            "PARTICIPADOS": [c for c in concerts if c.sale_type == "PARTICIPADOS"],
            "CADIZ":        [c for c in concerts if c.sale_type == "CADIZ"],
            "VENDIDO":      [c for c in concerts if c.sale_type == "VENDIDO"],
        }
        for k in sections:
            sections[k].sort(key=lambda x: (x.date or date.max, x.artist.name if x.artist else ""))

        return dict(
            day=day, past=past, sections=sections,
            order=SALES_SECTION_ORDER, titles=SALES_SECTION_TITLE,
            totals=totals, today_map=today_map, last_map=last_map
        )
    finally:
        session.close()

@app.get("/ventas/reporte", endpoint="sales_report_view")
def sales_report_view():
    day = get_day("d")
    ctx = build_sales_report_context(day)
    ctx["nav_prev_url"] = url_for("sales_report_view", d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_view", d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/anteriores", endpoint="sales_report_past")
def sales_report_past():
    day = get_day("d")
    ctx = build_sales_report_context(day, past=True)
    ctx["nav_prev_url"] = url_for("sales_report_past", d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_past", d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/promotor/<pid>", endpoint="sales_report_by_promoter")
def sales_report_by_promoter(pid):
    day = get_day("d")
    ctx = build_sales_report_context(day, promoter_id=pid)
    ctx["nav_prev_url"] = url_for("sales_report_by_promoter", pid=pid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_promoter", pid=pid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/artista/<aid>", endpoint="sales_report_by_artist")
def sales_report_by_artist(aid):
    day = get_day("d")
    ctx = build_sales_report_context(day, artist_id=aid)
    ctx["nav_prev_url"] = url_for("sales_report_by_artist", aid=aid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_artist", aid=aid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

@app.get("/ventas/empresa/<gid>", endpoint="sales_report_by_company")
def sales_report_by_company(gid):
    day = get_day("d")
    ctx = build_sales_report_context(day, company_id=gid)
    ctx["nav_prev_url"] = url_for("sales_report_by_company", gid=gid, d=(day - timedelta(days=1)).isoformat())
    ctx["nav_next_url"] = url_for("sales_report_by_company", gid=gid, d=(day + timedelta(days=1)).isoformat())
    return render_template("sales_report.html", **ctx)

# ------------- APIS GRAFICA DE VENTAS -----------

@app.get("/api/sales_json")
def api_sales_json():
    cid = to_uuid(request.args.get("concert_id"))
    session = db()
    # serie diaria acumulada desde el inicio de venta
    pts = (session.query(TicketSale.day, func.sum(TicketSale.sold_today))
           .filter(TicketSale.concert_id == cid)
           .group_by(TicketSale.day)
           .order_by(TicketSale.day.asc()).all())
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
            "festival_name": c.festival_name,
            "venue": {
                "name": (c.venue.name if c.venue else None),
                "municipality": (c.venue.municipality if c.venue else None),
                "province": (c.venue.province if c.venue else None),
            },
            "date": (c.date.isoformat() if c.date else None),
        })
    finally:
        session.close()

#-------------- Apis Buscador de recintos y promotores ------------

@app.get("/api/search/venues", endpoint="api_search_venues")
def api_search_venues():
    q = (request.args.get("q") or "").strip()
    session = db()
    try:
        query = session.query(Venue)
        if q:
            like = f"%{q}%"
            query = query.filter(
                (Venue.name.ilike(like)) |
                (Venue.municipality.ilike(like)) |
                (Venue.province.ilike(like))
            )
        venues = query.order_by(Venue.name.asc()).limit(20).all()
        return jsonify([
            {
                "id": str(v.id),
                "label": f"{v.name} — {v.municipality or ''} {v.province or ''}".strip()
            } for v in venues
        ])
    finally:
        session.close()


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
      - calendario anual con días marcados por logos
      - mapa con chinchetas (logos) geocodificando ciudades de recintos
      - resumen de eventos ordenados de más cercano a más lejano
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

        selected_artists = []
        events = []          # lista derecha
        marks_by_date = {}   # YYYY-MM-DD -> list[{id,name,photo_url}]

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

            for idx, c in enumerate(concerts, start=1):
                dstr = c.date.isoformat()

                # marks: dedup por artista
                marks_by_date.setdefault(dstr, {})
                if c.artist_id:
                    marks_by_date[dstr][str(c.artist_id)] = {
                        "id": str(c.artist_id),
                        "name": c.artist.name if c.artist else "",
                        "photo_url": c.artist.photo_url if c.artist else "",
                    }

                cache_txt = _cache_summary(caches_map.get(c.id, []))
                pro_logo, pro_name = _promoter_display(c)
                v = c.venue

                events.append({
                    "n": idx,
                    "concert_id": str(c.id),
                    "date": dstr,
                    "date_es": c.date.strftime("%d/%m/%Y"),
                    "artist_name": c.artist.name if c.artist else "",
                    "artist_photo": c.artist.photo_url if c.artist else "",
                    "province": (v.province or "") if v else "",
                    "municipality": (v.municipality or "") if v else "",
                    "venue_name": (v.name or "") if v else "",
                    "capacity": int(c.capacity or 0),
                    "cache": cache_txt,
                    "promoter_name": pro_name or "",
                    "promoter_logo": pro_logo or "",
                })

            # convertir dict interno -> lista para template
            marks_by_date = {k: list(v.values()) for k, v in marks_by_date.items()}

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
            events=events,
        )

    finally:
        session_db.close()

if __name__ == "__main__":
    init_db()
    app.run(debug=True)