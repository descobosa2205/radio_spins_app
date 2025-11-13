from datetime import date, timedelta, datetime
from uuid import uuid4
from flask import Flask, render_template, request, redirect, url_for, flash
from config import settings
from models import (init_db, SessionLocal, Artist, Song, SongArtist, RadioStation,
                    Week, Play, SongWeekInfo)
from supabase_utils import upload_png
from sqlalchemy import func, text

app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

def db():
    return SessionLocal()

def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())

def ensure_week(session, week_start: date):
    """
    Garantiza que exista la semana en la tabla weeks usando un upsert idempotente.
    """
    # INSERT ... ON CONFLICT DO NOTHING
    session.execute(
        text("insert into weeks (week_start) values (:w) on conflict (week_start) do nothing"),
        {"w": week_start}
    )
    # Empuja el INSERT a DB inmediatamente para satisfacer FK de 'plays'
    session.flush()

def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()

@app.context_processor
def inject_brand():
    return dict(BRAND_PRIMARY=settings.BRAND_PRIMARY, BRAND_ACCENT=settings.BRAND_ACCENT)

@app.route("/")
def root():
    return redirect(url_for("plays_view"))

# ---------- ARTISTAS ----------
@app.route("/artistas", methods=["GET", "POST"])
def artists_view():
    session = db()
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        photo = request.files.get("photo")
        try:
            photo_url = upload_png(photo, "artists") if photo else None
            artist = Artist(id=str(uuid4()), name=name, photo_url=photo_url)
            session.add(artist)
            session.commit()
            flash("Artista creado.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando artista: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("artists_view"))
    artists = session.query(Artist).order_by(Artist.name.asc()).all()
    session.close()
    return render_template("artists.html", artists=artists)

@app.post("/artistas/<artist_id>/update")
def artist_update(artist_id):
    session = db()
    a = session.get(Artist, artist_id)
    if not a:
        flash("Artista no encontrado.", "warning")
        session.close()
        return redirect(url_for("artists_view"))
    a.name = request.form.get("name", a.name).strip()
    photo = request.files.get("photo")
    try:
        if photo and photo.filename:
            a.photo_url = upload_png(photo, "artists")
        session.commit()
        flash("Artista actualizado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("artists_view"))

@app.post("/artistas/<artist_id>/delete")
def artist_delete(artist_id):
    session = db()
    try:
        a = session.get(Artist, artist_id)
        if a:
            session.delete(a)
            session.commit()
            flash("Artista eliminado.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("artists_view"))

# ---------- EMISORAS ----------
@app.route("/emisoras", methods=["GET", "POST"])
def stations_view():
    session = db()
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        logo = request.files.get("logo")
        try:
            logo_url = upload_png(logo, "stations") if logo else None
            st = RadioStation(id=str(uuid4()), name=name, logo_url=logo_url)
            session.add(st)
            session.commit()
            flash("Emisora creada.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando emisora: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("stations_view"))
    stations = session.query(RadioStation).order_by(RadioStation.name.asc()).all()
    session.close()
    return render_template("stations.html", stations=stations)

@app.post("/emisoras/<station_id>/update")
def station_update(station_id):
    session = db()
    st = session.get(RadioStation, station_id)
    if not st:
        flash("Emisora no encontrada.", "warning")
        session.close()
        return redirect(url_for("stations_view"))
    st.name = request.form.get("name", st.name).strip()
    logo = request.files.get("logo")
    try:
        if logo and logo.filename:
            st.logo_url = upload_png(logo, "stations")
        session.commit()
        flash("Emisora actualizada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("stations_view"))

@app.post("/emisoras/<station_id>/delete")
def station_delete(station_id):
    session = db()
    try:
        st = session.get(RadioStation, station_id)
        if st:
            session.delete(st)
            session.commit()
            flash("Emisora eliminada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("stations_view"))

# ---------- CANCIONES ----------
@app.route("/canciones", methods=["GET", "POST"])
def songs_view():
    session = db()
    artists = session.query(Artist).order_by(Artist.name.asc()).all()
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        collaborator = request.form.get("collaborator", "").strip() or None
        release_date = parse_date(request.form.get("release_date"))
        cover = request.files.get("cover")
        artist_ids = request.form.getlist("artist_ids[]")
        try:
            cover_url = upload_png(cover, "songs") if cover else None
            s = Song(id=str(uuid4()), title=title, collaborator=collaborator,
                     release_date=release_date, cover_url=cover_url)
            session.add(s)
            for aid in artist_ids:
                session.add(SongArtist(song_id=s.id, artist_id=aid))
            session.commit()
            flash("Canción creada.", "success")
        except Exception as e:
            session.rollback()
            flash(f"Error creando canción: {e}", "danger")
        finally:
            session.close()
        return redirect(url_for("songs_view"))
    songs = session.query(Song).order_by(Song.release_date.desc()).all()
    # precargar artistas por canción
    songs_by_id = {s.id: s for s in songs}
    for s in songs:
        _ = s.artists  # lazy load
    session.close()
    return render_template("songs.html", songs=songs, artists=artists)

@app.post("/canciones/<song_id>/update")
def song_update(song_id):
    session = db()
    s = session.get(Song, song_id)
    if not s:
        flash("Canción no encontrada.", "warning")
        session.close()
        return redirect(url_for("songs_view"))
    s.title = request.form.get("title", s.title).strip()
    s.collaborator = (request.form.get("collaborator", "") or "").strip() or None
    s.release_date = parse_date(request.form.get("release_date"))
    cover = request.files.get("cover")
    try:
        if cover and cover.filename:
            s.cover_url = upload_png(cover, "songs")
        # actualizar artistas
        new_artist_ids = set(request.form.getlist("artist_ids[]"))
        old_artist_ids = {a.id for a in s.artists}
        # borrar relaciones
        for aid in old_artist_ids - new_artist_ids:
            session.query(SongArtist).filter_by(song_id=s.id, artist_id=aid).delete()
        # añadir relaciones
        for aid in new_artist_ids - old_artist_ids:
            session.add(SongArtist(song_id=s.id, artist_id=aid))
        session.commit()
        flash("Canción actualizada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error actualizando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("songs_view"))

@app.post("/canciones/<song_id>/delete")
def song_delete(song_id):
    session = db()
    try:
        s = session.get(Song, song_id)
        if s:
            session.delete(s)
            session.commit()
            flash("Canción eliminada.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error eliminando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("songs_view"))

# ---------- TOCADAS (SEMANA) ----------
def week_tabs(base: date):
    prev_w = base - timedelta(days=7)
    next_w = base + timedelta(days=7)
    return prev_w, base, next_w

def week_label_range(week_start: date) -> str:
    end = week_start + timedelta(days=6)
    return f"{week_start.strftime('%d/%m/%Y')} - {end.strftime('%d/%m/%Y')}"

@app.route("/tocadas")
def plays_view():
    session = db()
    today = date.today()
    current_week = monday_of(today)

    # Semana seleccionada en la URL (o actual)
    week_start = request.args.get("week")
    if week_start:
        week_start = monday_of(parse_date(week_start))
    else:
        week_start = current_week

    # Asegura que existan las 3 pestañas (prev/actual/next) en la tabla weeks
    prev_w, base_w, next_w = week_tabs(week_start)
    ensure_week(session, prev_w)
    ensure_week(session, base_w)
    ensure_week(session, next_w)
    session.commit()  # persistimos para que ya aparezcan en el desplegable

    # para el botón "Semanas anteriores"
    weeks_list = [w[0] for w in session.query(Week.week_start).order_by(Week.week_start.desc()).all()]

    artists = session.query(Artist).order_by(Artist.name.asc()).all()
    stations = session.query(RadioStation).order_by(RadioStation.name.asc()).all()
    # precargar canciones por artista, ordenadas por fecha lanzamiento desc
    artist_blocks = []
    for a in artists:
        songs = (session.query(Song)
                 .join(SongArtist, Song.id == SongArtist.song_id)
                 .filter(SongArtist.artist_id == a.id)
                 .order_by(Song.release_date.desc())
                 .all())
        artist_blocks.append((a, songs))

    # Cargar plays existentes de la semana (para rellenar formularios)
    plays_map = {}  # (song_id, station_id) -> (spins, position)
    existing = (session.query(Play)
                .filter(Play.week_start == week_start)
                .all())
    for p in existing:
        plays_map[(p.song_id, p.station_id)] = (p.spins, p.position)

    # Ranking nacional existente
    rank_map = {}  # song_id -> national_rank
    swin = (session.query(SongWeekInfo)
            .filter(SongWeekInfo.week_start == week_start)
            .all())
    for si in swin:
        rank_map[si.song_id] = si.national_rank

    session.close()
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
def plays_save():
    session = db()
    week_start = monday_of(parse_date(request.form["week_start"]))
    song_id = request.form["song_id"]

    try:
        ensure_week(session, week_start)

        # Actualizar ranking nacional
        national_rank_val = request.form.get("national_rank", "").strip()
        nr_int = int(national_rank_val) if national_rank_val else None
        s_info = (session.query(SongWeekInfo)
                  .filter_by(song_id=song_id, week_start=week_start)
                  .first())
        if s_info:
            s_info.national_rank = nr_int
        else:
            session.add(SongWeekInfo(id=str(uuid4()), song_id=song_id,
                                     week_start=week_start, national_rank=nr_int))

        # Actualizar tocadas/posición por emisora
        for key, val in request.form.items():
            if key.startswith("spins_"):
                station_id = key.split("_", 1)[1]
                spins_val = val.strip()
                pos_val = request.form.get(f"pos_{station_id}", "").strip()

                spins_int = int(spins_val) if spins_val else 0
                pos_int = int(pos_val) if pos_val else None

                p = (session.query(Play)
                     .filter_by(song_id=song_id, station_id=station_id, week_start=week_start)
                     .first())
                if p:
                    p.spins = spins_int
                    p.position = pos_int
                else:
                    session.add(Play(
                        id=str(uuid4()), song_id=song_id, station_id=station_id,
                        week_start=week_start, spins=spins_int, position=pos_int
                    ))

        session.commit()
        flash("Tocadas guardadas.", "success")
    except Exception as e:
        session.rollback()
        flash(f"Error guardando: {e}", "danger")
    finally:
        session.close()
    return redirect(url_for("plays_view", week=week_start.isoformat()))

# ---------- RESUMEN ----------
def week_with_latest_data(session):
    row = session.query(Play.week_start).order_by(Play.week_start.desc()).first()
    if row: return row[0]
    # Si no hay plays aún, usar semana actual
    return monday_of(date.today())

@app.route("/resumen")
def summary_view():
    session = db()
    requested = request.args.get("week")
    if requested:
        base_week = monday_of(parse_date(requested))
    else:
        base_week = week_with_latest_data(session)

    prev_w, base_w, next_w = week_tabs(base_week)
    current_week = monday_of(date.today())
    latest_with_data = week_with_latest_data(session)

    # Etiquetas y límites de semana para la vista
    week_end = base_week + timedelta(days=6)
    week_label = f"{base_week.strftime('%d/%m/%Y')} - {week_end.strftime('%d/%m/%Y')}"

    # Artistas y canciones con tocadas en la semana
    artists = session.query(Artist).order_by(Artist.name.asc()).all()

    # Totales semana actual
    totals = {}
    for row in (session.query(Play.song_id, func.sum(Play.spins))
                .filter(Play.week_start == base_week)
                .group_by(Play.song_id)
                .all()):
        totals[row[0]] = int(row[1])

    # Totales semana anterior
    prev_week = base_week - timedelta(days=7)
    totals_prev = {}
    for row in (session.query(Play.song_id, func.sum(Play.spins))
                .filter(Play.week_start == prev_week)
                .group_by(Play.song_id)
                .all()):
        totals_prev[row[0]] = int(row[1])

    # Por emisora (semana actual y previa)
    by_station, by_station_prev = {}, {}
    for row in (session.query(Play.song_id, Play.station_id, Play.spins, Play.position)
                .filter(Play.week_start == base_week).all()):
        by_station.setdefault(row.song_id, {})[row.station_id] = (row.spins, row.position)

    for row in (session.query(Play.song_id, Play.station_id, Play.spins, Play.position)
                .filter(Play.week_start == prev_week).all()):
        by_station_prev.setdefault(row.song_id, {})[row.station_id] = (row.spins, row.position)

    stations = session.query(RadioStation).order_by(RadioStation.name.asc()).all()
    stations_map = {s.id: s for s in stations}

    # Canciones con tocadas esta semana
    song_ids_this_week = set(totals.keys())
    songs = []
    if song_ids_this_week:
        songs = (session.query(Song)
                 .filter(Song.id.in_(song_ids_this_week))
                 .order_by(Song.release_date.desc())
                 .all())
        for s in songs:
            _ = s.artists

    # Ranking nacional
    ranks = {r.song_id: r.national_rank for r in
             session.query(SongWeekInfo).filter_by(week_start=base_week).all()}

    session.close()
    return render_template(
        "summary.html",
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
        stations_map=stations_map,
        ranks=ranks
    )

# ---------- API para gráficas ----------
from flask import jsonify

@app.get("/api/plays_json")
def api_plays_json():
    """Devuelve la serie semanal de tocadas de una canción.
       Parámetros: song_id (obligatorio), station_id (opcional)"""
    song_id = request.args.get("song_id")
    station_id = request.args.get("station_id")
    session = db()
    q = session.query(Play.week_start, func.sum(Play.spins))\
               .filter(Play.song_id == song_id)
    if station_id:
        q = q.filter(Play.station_id == station_id)
    q = q.group_by(Play.week_start).order_by(Play.week_start.asc())
    data = q.all()
    session.close()
    labels = [w.strftime("%Y-%m-%d") for (w, _) in data]
    values = [int(v) for (_, v) in data]
    return jsonify({"labels": labels, "values": values})

@app.get("/api/song_meta")
def api_song_meta():
    song_id = request.args.get("song_id")
    session = db()
    s = session.get(Song, song_id)
    if not s:
        session.close()
        return jsonify({"error": "not found"}), 404
    artists = [{"id": a.id, "name": a.name, "photo_url": a.photo_url} for a in s.artists]
    session.close()
    return jsonify({
        "song_id": s.id,
        "title": s.title,
        "cover_url": s.cover_url,
        "artists": artists
    })

if __name__ == "__main__":
    init_db()
    app.run(debug=True)