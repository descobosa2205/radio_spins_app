import os

from sqlalchemy import (
    create_engine,
    Column,
    Date,
    Text,
    Integer,
    ForeignKey,
    DateTime,
    Boolean,
    Numeric,
    func,
    text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB

from config import settings

Base = declarative_base()

if not settings.DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está configurada. Crea .env con "
        "DATABASE_URL=postgresql+psycopg2://... ?sslmode=require"
    )

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,        # descarta conexiones muertas antes de reutilizarlas
    pool_recycle=280,          # recicla antes de que el pooler/Supabase corte por inactividad (~300s)
    # DIMENSIONADO GLOBAL, no por worker suelto: Supabase admite ~90 conexiones directas y durante
    # un deploy conviven DOS instancias (vieja + nueva), o sea el doble de conexiones. Con 4 workers,
    # el antiguo 10+20 permitía hasta 120 por instancia (240 en deploy) -> Supabase se quedaba sin
    # conexiones, cada petición esperaba su conexión 30 s, los threads del servidor se agotaban y la
    # web «se caía» a ratas. 6+6 × 4 workers = 48 por instancia (96 en el pico breve de un deploy),
    # suficiente para 8 hilos/worker + hilos de fondo. pool_timeout corto: mejor un error puntual y
    # reintentar que colgar el thread medio minuto (eso es lo que tumbaba la web entera).
    pool_size=int(os.getenv("DB_POOL_SIZE", "6")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "6")),
    pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "10")),
    connect_args={
        "connect_timeout": 10,
        "application_name": "radio_spins_app",
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class User(Base):
    __tablename__ = "users"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    email = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(Integer, nullable=False, server_default=text('10'))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Artist(Base):
    __tablename__ = "artists"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    photo_url = Column(Text)
    email = Column(Text)
    # Nacional (false) / Internacional (true). Relevante para retenciones en simulaciones.
    is_international = Column(Boolean, nullable=False, server_default=text("false"))
    # Grupo (true) vs artista individual (false). Si es grupo, los cumpleaños salen de cada miembro
    # (ArtistPerson.birth_date); si no, del propio artista (Artist.birth_date).
    is_group = Column(Boolean, nullable=False, server_default=text("false"))
    birth_date = Column(Date)
    social_links = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    onesheet_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    onesheet_public_token = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    people = relationship(
        "ArtistPerson",
        back_populates="artist",
        cascade="all, delete-orphan",
        order_by="ArtistPerson.created_at",
    )

    songs = relationship("Song", secondary="songs_artists", back_populates="artists")


class ArtistPerson(Base):
    """Personas asociadas a un artista (útil si el artista es un grupo)."""

    __tablename__ = "artist_people"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artists.id", ondelete="CASCADE"),
        nullable=False,
    )

    first_name = Column(Text, nullable=False)
    last_name = Column(Text, nullable=False, server_default=text("''"))
    birth_date = Column(Date)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist", back_populates="people")


class ArtistAgendaItem(Base):
    """Entradas libres de la agenda de un artista: bloqueos (BLOCK) y notas/'otro' (NOTE).

    Multi-día (start_date..end_date). BLOCK: title = motivo, los días salen marcados como bloqueados.
    NOTE: title = nombre + note opcional. Las actividades reales (conciertos/acciones/...) NO viven aquí.
    """

    __tablename__ = "artist_agenda_items"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    kind = Column(Text, nullable=False, server_default=text("'NOTE'"))  # BLOCK | NOTE
    title = Column(Text, nullable=False, server_default=text("''"))
    note = Column(Text)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    created_by_user_id = Column(PGUUID(as_uuid=True))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Identificadores que asigna el cliente CalDAV (iPhone) al crear el evento, para no duplicar al
    # sincronizar. Nulos en los ítems creados desde la app/web.
    caldav_uid = Column(Text)
    caldav_href = Column(Text)

    artist = relationship("Artist")

    __table_args__ = (
        Index("idx_artist_agenda_items_artist_dates", "artist_id", "start_date", "end_date"),
    )


class ArtistCalendarLink(Base):
    """Enlace público de suscripción al calendario (iCal) de un artista. Un enlace por persona
    'solo-ver': se genera con una etiqueta (para quién es) y se puede ANULAR (status=CANCELLED)
    para retirarle el acceso. El feed .ics se sirve en público a partir del token."""

    __tablename__ = "artist_calendar_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    label = Column(Text)                     # para quién es el enlace
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))  # ACTIVE | CANCELLED
    created_by_user_id = Column(PGUUID(as_uuid=True))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True))

    artist = relationship("Artist")

    __table_args__ = (
        Index("idx_artist_calendar_links_artist", "artist_id", "status"),
    )


def ensure_artist_calendar_schema():
    """Crea la tabla de enlaces de calendario del artista y columnas CalDAV (idempotente)."""
    Base.metadata.create_all(bind=engine)
    _exec_ddl_statements([
        "ALTER TABLE IF EXISTS artist_agenda_items ADD COLUMN IF NOT EXISTS caldav_uid text;",
        "ALTER TABLE IF EXISTS artist_agenda_items ADD COLUMN IF NOT EXISTS caldav_href text;",
    ], "artist_calendar")


class ArtistEmail(Base):
    """Correos adicionales asociados a un artista.

    El correo principal se mantiene en `artists.email`.
    """

    __tablename__ = "artist_emails"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artists.id", ondelete="CASCADE"),
        nullable=False,
    )
    concept = Column(Text, nullable=False)
    email = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ArtistContract(Base):
    """Contratos a nivel artista (no confundir con contratos de conciertos)."""

    __tablename__ = "artist_contracts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artists.id", ondelete="CASCADE"),
        nullable=False,
    )

    name = Column(Text, nullable=False)
    signed_date = Column(Date)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    commitments = relationship(
        "ArtistContractCommitment",
        back_populates="contract",
        cascade="all, delete-orphan",
        order_by="ArtistContractCommitment.created_at",
    )

    artist = relationship("Artist")


class ArtistContractCommitment(Base):
    """Líneas de compromiso dentro de un contrato (concepto + porcentajes + base)."""

    __tablename__ = "artist_contract_commitments"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    contract_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artist_contracts.id", ondelete="CASCADE"),
        nullable=False,
    )

    concept = Column(Text, nullable=False)

    # Porcentajes (0..100) — la UI hará el control; en BD dejamos numérico.
    pct_artist = Column(Numeric, nullable=False, server_default=text("0"))
    pct_office = Column(Numeric, nullable=False, server_default=text("0"))

    # GROSS | NET | PROFIT
    base = Column(Text, nullable=False, server_default=text("'GROSS'"))

    # Si base == PROFIT: CONCEPT_ONLY | CONCEPT_PLUS_GENERAL
    profit_scope = Column(Text)

    # Alcance temporal/material del compromiso a futuro.
    material_scope = Column(Text, nullable=False, server_default=text("'ALL_MATERIALS'"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("ArtistContract", back_populates="commitments")


class Song(Base):
    __tablename__ = "songs"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    title = Column(Text, nullable=False)
    collaborator = Column(Text)
    # Si la canción forma parte del catálogo (histórico)
    is_catalog = Column(Boolean, nullable=False, server_default=text("false"))

    # Propiedad del master / distribución
    # - is_distribution: True si es una canción distribuida (no propia)
    # - master_ownership_pct: % de propiedad del master (0-100). Por defecto 100.
    is_distribution = Column(Boolean, nullable=False, server_default=text("false"))
    master_ownership_pct = Column(Numeric, nullable=False, server_default=text("100"))

    # Colaboración externa: canción de otra compañía en la que participamos. NO cuenta para
    # cumplimiento de contratos, NO genera royalties a artistas/productores, y se cobra a la
    # compañía colaboradora (tercero) según el % que nos corresponde (royalties «A favor»).
    is_external_collab = Column(Boolean, nullable=False, server_default=text("false"))
    external_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    our_pct = Column(Numeric, nullable=False, server_default=text("0"))
    our_pct_base = Column(Text, nullable=False, server_default=text("'GROSS'"))  # GROSS | NET

    # ISRC principal (legacy / compat)
    isrc = Column(Text)

    # ===== Ficha de canción (Información) =====
    version = Column(Text)
    duration_seconds = Column(Integer)
    tiktok_start_seconds = Column(Integer)
    recording_date = Column(Date)

    # ISRCs avanzados (principal/subproductos) se guardan en song_isrc_codes,
    # pero mantenemos campos básicos en songs para compatibilidad.

    bpm = Column(Integer)
    genre = Column(Text)
    copyright_text = Column(Text)

    recording_engineer = Column(Text)
    mixing_engineer = Column(Text)
    mastering_engineer = Column(Text)
    studio = Column(Text)

    # Listas (JSON)
    producers = Column(JSONB)
    arrangers = Column(JSONB)
    musicians = Column(JSONB)

    # Enlaces de plataformas
    spotify_url = Column(Text)
    apple_music_url = Column(Text)
    amazon_music_url = Column(Text)
    tiktok_url = Column(Text)
    youtube_url = Column(Text)
    # Chartmetric (canción): id de track resuelto, plataformas fijadas a mano (no re-resolver),
    # estado del enlazado y último refresco de reproducciones.
    cm_track = Column(Text)
    cm_links_locked = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cm_link_status = Column(Text)
    cm_refreshed_at = Column(DateTime(timezone=True))
    release_date = Column(Date, nullable=False)
    cover_url = Column(Text)

    # Editorial
    work_declaration_url = Column(Text)
    work_declaration_uploaded_at = Column(DateTime(timezone=True))
    lyrics_text = Column(Text)
    lyrics_updated_at = Column(DateTime(timezone=True))
    # Contenido explícito (se marca al subir la letra); muestra etiqueta "Explícita".
    is_explicit = Column(Boolean, nullable=False, server_default=text("false"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artists = relationship("Artist", secondary="songs_artists", back_populates="songs")
    plays = relationship("Play", back_populates="song", cascade="all, delete-orphan")


class SongMasterDeliveryLink(Base):
    """Enlace público de un solo uso para que un tercero entregue info y materiales de una canción.

    sections_json: lista de secciones solicitadas (PRODUCTION/AUTHORAL/LYRICS/MASTERS).
    status: ACTIVE (a la espera) | SUBMITTED (recibido, se desactiva) | CANCELLED.
    data: payload entregado (producción/autoral/letra) pendiente de validar.
    """

    __tablename__ = "song_master_delivery_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    sections_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    materials_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))  # módulos de material solicitados
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_nick = Column(Text)
    target_name = Column(Text)
    target_email = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))

    song = relationship("Song")

    __table_args__ = (
        Index("idx_song_master_delivery_song", "song_id", "status"),
    )


class ISRCConfig(Base):
    """Configuración global de ISRC.

    - country_code: 2 letras (por defecto ES)
    - audio_matrix: 3 dígitos
    - video_matrix: 3 dígitos

    Usamos una única fila (id=1) como singleton.
    """

    __tablename__ = "isrc_config"

    id = Column(Integer, primary_key=True, server_default=text("1"))
    country_code = Column(Text, nullable=False, server_default=text("'ES'"))
    audio_matrix = Column(Text, nullable=False, server_default=text("'270'"))
    video_matrix = Column(Text, nullable=False, server_default=text("'270'"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ArtistISRCSetting(Base):
    """Configuración ISRC por artista (número matriz del artista: 2 dígitos)."""

    __tablename__ = "artist_isrc_settings"

    artist_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artists.id", ondelete="CASCADE"),
        primary_key=True,
    )
    artist_matrix = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")


class SongInterpreter(Base):
    """Intérpretes / artistas participantes en una canción."""

    __tablename__ = "song_interpreters"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(Text, nullable=False)
    is_main = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SongISRCCode(Base):
    """ISRCs asociados a una canción (audio/video, principal/subproducto)."""

    __tablename__ = "song_isrc_codes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )
    artist_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("artists.id", ondelete="RESTRICT"),
        nullable=False,
    )

    kind = Column(Text, nullable=False)  # AUDIO | VIDEO
    code = Column(Text, nullable=False)
    is_primary = Column(Boolean, nullable=False, server_default=text("true"))
    subproduct_name = Column(Text)

    year = Column(Integer)
    sequence_num = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SongMaterial(Base):
    """Materiales asociados a una canción."""

    __tablename__ = "song_materials"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )

    category = Column(Text, nullable=False)  # COVER | MASTER | INSTRUMENTAL | TV_TRACK | STEMS
    slot_key = Column(Text, nullable=False, server_default=text("'DEFAULT'"))
    bundle_key = Column(Text)
    display_name = Column(Text)
    file_name = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    mime_type = Column(Text)
    # Validación de entrega pública: VALIDATED (lo sube el equipo) | PENDING (recibido por enlace, a revisar)
    validation_status = Column(Text, nullable=False, server_default=text("'VALIDATED'"))
    delivery_link_id = Column(PGUUID(as_uuid=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_song_materials_song_id", "song_id"),
        Index("idx_song_materials_song_category", "song_id", "category", "slot_key"),
    )


class SongCertification(Base):
    __tablename__ = "song_certifications"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )

    certification_type = Column(Text, nullable=False)
    country_code = Column(Text, nullable=False)
    country_name = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_song_certifications_song_id", "song_id"),
        Index("idx_song_certifications_group", "song_id", "certification_type", "country_code"),
    )


class SongProductionContract(Base):
    __tablename__ = "song_production_contracts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    producer_name = Column(Text, nullable=False)
    pdf_url = Column(Text, nullable=False)
    original_name = Column(Text)
    has_royalties = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    song = relationship("Song")

    __table_args__ = (
        Index("idx_song_production_contracts_song_id", "song_id"),
        Index("idx_song_production_contracts_song_producer", "song_id", "producer_name"),
    )


class AlbumCertification(Base):
    __tablename__ = "album_certifications"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("albums.id", ondelete="CASCADE"),
        nullable=False,
    )

    certification_type = Column(Text, nullable=False)
    country_code = Column(Text, nullable=False)
    country_name = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_album_certifications_album_id", "album_id"),
        Index("idx_album_certifications_group", "album_id", "certification_type", "country_code"),
    )


class SongStatus(Base):
    """Barra de estados de la ficha de canción (iconos rojo/verde + fecha)."""

    __tablename__ = "song_status"

    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        primary_key=True,
    )

    cover_done = Column(Boolean, nullable=False, server_default=text("false"))
    cover_updated_at = Column(DateTime(timezone=True))

    materials_done = Column(Boolean, nullable=False, server_default=text("false"))
    materials_updated_at = Column(DateTime(timezone=True))

    production_contract_done = Column(Boolean, nullable=False, server_default=text("false"))
    production_contract_updated_at = Column(DateTime(timezone=True))

    collaboration_contract_done = Column(Boolean, nullable=False, server_default=text("false"))
    collaboration_contract_updated_at = Column(DateTime(timezone=True))

    agedi_done = Column(Boolean, nullable=False, server_default=text("false"))
    agedi_updated_at = Column(DateTime(timezone=True))
    agedi_registered_isrcs = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))

    sgae_done = Column(Boolean, nullable=False, server_default=text("false"))
    sgae_updated_at = Column(DateTime(timezone=True))
    sgae_modification_pending = Column(Boolean, nullable=False, server_default=text("false"))

    ritmonet_done = Column(Boolean, nullable=False, server_default=text("false"))
    ritmonet_updated_at = Column(DateTime(timezone=True))

    distributed_done = Column(Boolean, nullable=False, server_default=text("false"))
    distributed_updated_at = Column(DateTime(timezone=True))

    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class AlbumStatus(Base):
    """Barra de estados de la ficha de álbum (iconos rojo/verde + fecha)."""

    __tablename__ = "album_status"

    album_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("albums.id", ondelete="CASCADE"),
        primary_key=True,
    )

    cover_done = Column(Boolean, nullable=False, server_default=text("false"))
    cover_updated_at = Column(DateTime(timezone=True))

    materials_done = Column(Boolean, nullable=False, server_default=text("false"))
    materials_updated_at = Column(DateTime(timezone=True))

    production_contract_done = Column(Boolean, nullable=False, server_default=text("false"))
    production_contract_updated_at = Column(DateTime(timezone=True))

    agedi_done = Column(Boolean, nullable=False, server_default=text("false"))
    agedi_updated_at = Column(DateTime(timezone=True))

    distributed_done = Column(Boolean, nullable=False, server_default=text("false"))
    distributed_updated_at = Column(DateTime(timezone=True))

    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class SongArtist(Base):
    __tablename__ = "songs_artists"
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True)


class RadioStation(Base):
    __tablename__ = "radio_stations"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    country_code = Column(Text, nullable=False, server_default=text("'ES'"))
    country_name = Column(Text, nullable=False, server_default=text("'España'"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Week(Base):
    __tablename__ = "weeks"
    week_start = Column(Date, primary_key=True)


class Play(Base):
    __tablename__ = "plays"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    station_id = Column(PGUUID(as_uuid=True), ForeignKey("radio_stations.id", ondelete="CASCADE"), nullable=False)
    week_start = Column(Date, ForeignKey("weeks.week_start", ondelete="CASCADE"), nullable=False)
    spins = Column(Integer, nullable=False, default=0)
    position = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    song = relationship("Song", back_populates="plays")
    station = relationship("RadioStation")


class SongWeekInfo(Base):
    __tablename__ = "song_week_info"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    week_start = Column(Date, ForeignKey("weeks.week_start", ondelete="CASCADE"), nullable=False)
    national_rank = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RadioStationAlias(Base):
    """Nombre de emisora tal cual aparece en los Excel de tocadas (columna 'channel') vinculado a
    una RadioStation. Permite que un enlace manual se recuerde y auto-aplique en importaciones
    futuras (y corregirlo si estaba mal)."""
    __tablename__ = "radio_station_aliases"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    alias = Column(Text, nullable=False, unique=True)  # nombre de canal normalizado (minúsculas)
    station_id = Column(PGUUID(as_uuid=True), ForeignKey("radio_stations.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class RadioIsrcAlias(Base):
    """ISRC de un Excel de tocadas vinculado a una canción. Recuerda enlaces manuales para futuras
    importaciones (y permite corregirlos)."""
    __tablename__ = "radio_isrc_aliases"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    isrc = Column(Text, nullable=False, unique=True)  # ISRC normalizado
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Promoter(Base):
    """Terceros / promotores."""

    __tablename__ = "promoters"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    nick = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)

    # Datos ampliados (autores / beneficiarios / etc.)
    first_name = Column(Text)
    last_name = Column(Text)
    tax_id = Column(Text)
    contact_email = Column(Text)
    contact_phone = Column(Text)

    # Redes sociales del tercero (p. ej. del fotógrafo) para menciones. Dict opcional:
    # {"instagram": ..., "tiktok": ..., "twitter": ..., "facebook": ..., "youtube": ...}.
    social_links = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    # Clasificación del tercero para vinculaciones/filtros: ''/NULL = persona/tercero genérico,
    # 'empresa' = empresa, 'institucion' = institución (ayuntamiento, organismo, etc.).
    kind = Column(Text)

    publishing_company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("publishing_companies.id", ondelete="SET NULL"),
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    publishing_company = relationship("PublishingCompany")
    companies = relationship(
        "PromoterCompany",
        back_populates="promoter",
        cascade="all, delete-orphan",
        order_by="PromoterCompany.created_at",
    )
    contacts = relationship(
        "PromoterContact",
        back_populates="promoter",
        cascade="all, delete-orphan",
        order_by="PromoterContact.title",
    )


class PromoterCompany(Base):
    """Sociedades / empresas vinculadas a un tercero."""

    __tablename__ = "promoter_companies"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="CASCADE"),
        nullable=False,
    )
    legal_name = Column(Text, nullable=False)
    tax_id = Column(Text)
    fiscal_address = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter", back_populates="companies")


class PromoterContact(Base):
    """Personas de contacto de un tercero."""

    __tablename__ = "promoter_contacts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(Text, nullable=False)
    first_name = Column(Text, nullable=False)
    last_name = Column(Text)
    email = Column(Text)
    phone = Column(Text)
    mobile = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter", back_populates="contacts")


class PromoterEmail(Base):
    """Correos adicionales asociados a un tercero.

    El correo principal se mantiene en `promoters.contact_email`.
    """

    __tablename__ = "promoter_emails"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="CASCADE"),
        nullable=False,
    )
    concept = Column(Text, nullable=False)
    email = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class SongRoyaltyBeneficiary(Base):
    """Beneficiarios de royalties por canción (otros beneficiarios).

    Nota:
    - El artista principal se calcula automáticamente en la UI según contratos.
    - Aquí guardamos únicamente beneficiarios adicionales (terceros/otros).
    """

    __tablename__ = "song_royalty_beneficiaries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="RESTRICT"),
        nullable=False,
    )

    pct = Column(Numeric, nullable=False, server_default=text("0"))
    # GROSS | NET | PROFIT
    base = Column(Text, nullable=False, server_default=text("'GROSS'"))
    # Si base == PROFIT: CONCEPT_ONLY | CONCEPT_PLUS_GENERAL
    profit_scope = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    song = relationship("Song")
    promoter = relationship("Promoter")

    __table_args__ = (
        UniqueConstraint("song_id", "promoter_id", name="uq_song_royalty_beneficiary"),
    )


class Venue(Base):
    __tablename__ = "venues"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    covered = Column(Boolean, nullable=False, default=False)  # True=cubierto, False=aire libre
    allows_bars = Column(Boolean, nullable=False, server_default=text("false"))  # ¿permite barras? (ingresos por barra)
    address = Column(Text)
    municipality = Column(Text)
    province = Column(Text)
    photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupCompany(Base):
    __tablename__ = "group_companies"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    tax_info = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PublishingCompany(Base):
    """Compañías editoriales (copyright publishing)."""

    __tablename__ = "publishing_companies"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SongEditorialShare(Base):
    """Autores/compositores por canción (derechos de autor)."""

    __tablename__ = "song_editorial_shares"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        nullable=False,
    )
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # AUTHOR (letra) | COMPOSER (música) | AUTHOR_COMPOSER (letra y música)
    role = Column(Text, nullable=False)
    pct = Column(Numeric, nullable=False, server_default=text("0"))

    # Editorial "congelada" en el momento del registro (snapshot). Si es NULL (registros
    # antiguos) se cae a la editorial actual del tercero al mostrarla.
    publishing_company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("publishing_companies.id", ondelete="SET NULL"),
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")
    publishing_company = relationship("PublishingCompany")

    __table_args__ = (
        UniqueConstraint("song_id", "promoter_id", "role", name="uq_song_editorial_share"),
    )


class SongRevenueEntry(Base):
    """Ingresos (bruto/neto) por canción y periodo (mes o semestre).

    - period_type: 'MONTH' | 'SEMESTER'
    - period_start / period_end: rango del periodo
    - is_base: True para la fila principal (sin nombre), False para filas extra con nombre

    NOTA: El índice único (con COALESCE(name,'')) se crea vía migración/ensure_schema.
    """

    __tablename__ = "song_revenue_entries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)

    period_type = Column(Text, nullable=False)  # MONTH | SEMESTER
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)

    is_base = Column(Boolean, nullable=False, server_default=text("true"))
    name = Column(Text)

    gross = Column(Numeric, nullable=False, server_default=text("0"))
    net = Column(Numeric, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    song = relationship("Song")

    __table_args__ = (
        Index("idx_song_revenue_entries_song_period", "song_id", "period_type", "period_start"),
        Index("idx_song_revenue_entries_period", "period_type", "period_start"),
    )


class ProductCodeConfig(Base):
    """Configuración global legacy para referencias de producto."""

    __tablename__ = "product_code_config"

    id = Column(Integer, primary_key=True, server_default=text("1"))
    prefix = Column(Text, nullable=False, server_default=text("'REF'"))
    padding = Column(Integer, nullable=False, server_default=text("5"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ProductCodeSeries(Base):
    """Serie histórica para generar referencias de álbumes."""

    __tablename__ = "product_code_series"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    prefix = Column(Text, nullable=False, server_default=text("'REF'"))
    padding = Column(Integer, nullable=False, server_default=text("5"))
    starts_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class AlbumRevenueEntry(Base):
    """Ingresos (bruto/neto) por álbum y periodo (mes o semestre)."""

    __tablename__ = "album_revenue_entries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)

    period_type = Column(Text, nullable=False)  # MONTH | SEMESTER
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)

    is_base = Column(Boolean, nullable=False, server_default=text("true"))
    name = Column(Text)

    gross = Column(Numeric, nullable=False, server_default=text("0"))
    net = Column(Numeric, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")

    __table_args__ = (
        Index("idx_album_revenue_entries_album_period", "album_id", "period_type", "period_start"),
        Index("idx_album_revenue_entries_period", "period_type", "period_start"),
    )


class Album(Base):
    __tablename__ = "albums"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="RESTRICT"), nullable=False)

    title = Column(Text, nullable=False)
    album_type = Column(Text, nullable=False, server_default=text("'ALBUM'"))  # ALBUM | EP
    release_date = Column(Date, nullable=False)
    cover_url = Column(Text)

    spotify_url = Column(Text)
    apple_music_url = Column(Text)
    amazon_music_url = Column(Text)
    tiktok_url = Column(Text)
    youtube_url = Column(Text)
    # Chartmetric (álbum): id de álbum/track resuelto, plataformas fijadas a mano, estado del enlazado.
    cm_track = Column(Text)
    cm_links_locked = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cm_link_status = Column(Text)

    specifications = Column(Text)
    copyright_text = Column(Text)
    mastering_engineer = Column(Text)
    edited_by = Column(Text)
    distributed_by = Column(Text)
    producers = Column(JSONB)

    physical_cd = Column(Boolean, nullable=False, server_default=text("false"))
    physical_vinyl = Column(Boolean, nullable=False, server_default=text("false"))

    is_distribution = Column(Boolean, nullable=False, server_default=text("false"))
    is_catalog = Column(Boolean, nullable=False, server_default=text("false"))

    upc_code = Column(Text)
    legal_deposit_code = Column(Text)
    label_code = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")
    tracks = relationship(
        "AlbumTrack",
        cascade="all, delete-orphan",
        order_by="AlbumTrack.track_number",
    )
    product_codes = relationship(
        "AlbumProductCode",
        cascade="all, delete-orphan",
        order_by="AlbumProductCode.created_at",
    )
    materials = relationship(
        "AlbumMaterial",
        cascade="all, delete-orphan",
        order_by="AlbumMaterial.created_at",
    )

    __table_args__ = (
        Index("idx_albums_artist_release", "artist_id", "release_date"),
    )


class AlbumProductCode(Base):
    __tablename__ = "album_product_codes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    series_id = Column(PGUUID(as_uuid=True), ForeignKey("product_code_series.id", ondelete="SET NULL"))

    format_kind = Column(Text, nullable=False)  # CD | VINYL | CASSETTE | OTHER
    other_label = Column(Text)
    code = Column(Text, nullable=False)
    generated_sequence = Column(Integer)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")
    series = relationship("ProductCodeSeries")

    __table_args__ = (
        UniqueConstraint("code", name="uq_album_product_code"),
        Index("idx_album_product_codes_album_id", "album_id"),
    )


class AlbumTrack(Base):
    __tablename__ = "album_tracks"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    track_number = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")
    song = relationship("Song")

    __table_args__ = (
        UniqueConstraint("album_id", "song_id", name="uq_album_track_song"),
        UniqueConstraint("album_id", "track_number", name="uq_album_track_number"),
        Index("idx_album_tracks_album_id", "album_id"),
    )


class AlbumMaterial(Base):
    __tablename__ = "album_materials"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)

    category = Column(Text, nullable=False)  # COVER | DDP | BODEGON | PHYSICAL_DESIGN
    file_name = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    mime_type = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")

    __table_args__ = (
        Index("idx_album_materials_album_id", "album_id"),
        Index("idx_album_materials_category", "category"),
    )


class AlbumProductionContract(Base):
    __tablename__ = "album_production_contracts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    producer_name = Column(Text, nullable=False)
    pdf_url = Column(Text, nullable=False)
    original_name = Column(Text)
    has_royalties = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")

    __table_args__ = (
        Index("idx_album_production_contracts_album_id", "album_id"),
        Index("idx_album_production_contracts_album_producer", "album_id", "producer_name"),
    )


class AlbumRoyaltyBeneficiary(Base):
    """Beneficiarios adicionales de royalties por álbum."""

    __tablename__ = "album_royalty_beneficiaries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="RESTRICT"), nullable=False)

    pct = Column(Numeric, nullable=False, server_default=text("0"))
    base = Column(Text, nullable=False, server_default=text("'GROSS'"))
    profit_scope = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    album = relationship("Album")
    promoter = relationship("Promoter")

    __table_args__ = (
        UniqueConstraint("album_id", "promoter_id", name="uq_album_royalty_beneficiary"),
        Index("idx_album_royalty_beneficiaries_album_id", "album_id"),
        Index("idx_album_royalty_beneficiaries_promoter_id", "promoter_id"),
    )


class RoyaltyLiquidation(Base):
    """Estado de liquidaciones de royalties por beneficiario y periodo.

    Guardamos un registro por beneficiario (artista o tercero) y semestre,
    para poder marcar: Generada -> Enviada -> Facturada -> Pagado.

    beneficiary_kind: 'ARTIST' | 'PROMOTER'
    beneficiary_id: UUID del beneficiario (Artist.id o Promoter.id)

    Nota: no imponemos FK doble; se valida en aplicación.
    """

    __tablename__ = "royalty_liquidations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))

    beneficiary_kind = Column(Text, nullable=False)  # ARTIST | PROMOTER
    beneficiary_id = Column(PGUUID(as_uuid=True), nullable=False)

    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)

    status = Column(Text, nullable=False, server_default=text("'GENERATED'"))

    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    last_sent_at = Column(DateTime(timezone=True))
    last_sent_to = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    last_sent_signature = Column(Text)
    last_sent_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_sent_pdf_url = Column(Text)

    __table_args__ = (
        UniqueConstraint(
            "beneficiary_kind",
            "beneficiary_id",
            "period_start",
            name="uq_royalty_liquidations_key",
        ),
        Index("idx_royalty_liquidations_period", "period_start"),
        Index("idx_royalty_liquidations_beneficiary", "beneficiary_kind", "beneficiary_id"),
    )


class Concert(Base):
    __tablename__ = "concerts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    date = Column(Date, nullable=False)

    # nombre interno / festival
    festival_name = Column(Text)

    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=True)

    # EMPRESA | VENDIDO | PARTICIPADOS | CADIZ
    sale_type = Column(Text, nullable=False)

    # tercero principal (p.ej. vendido)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    promoter_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_companies.id", ondelete="SET NULL"))

    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="RESTRICT"), nullable=False)
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))

    # Tipo de actividad de contratación: CONCIERTO | FESTIVAL | EVENTO_PROMOCIONAL | TV | MARCA | OTROS
    activity_type = Column(Text, nullable=False, server_default=text("'CONCIERTO'"))
    activity_subtype = Column(Text)
    contracting_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    ticketing_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    equipment_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    promoter_costs_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    commission_payload = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))

    # Producción / ficha viva de contratación. Estos campos se sincronizan con
    # el formulario público y con el panel operativo de Producción.
    production_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    roadmap_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    roadmap_public_token = Column(Text)
    contract_form_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    production_status = Column(Text)

    # Aforo a la venta
    capacity = Column(Integer, nullable=False)
    no_capacity = Column(Boolean, nullable=False, server_default=text("false"))

    # Fecha salida a la venta (opcional en conciertos gratuitos)
    sale_start_date = Column(Date, nullable=True)
    sale_start_tbc = Column(Boolean, nullable=False, server_default=text("false"))

    # Datos manuales de localización / horario
    manual_venue_name = Column(Text)
    manual_venue_address = Column(Text)
    manual_municipality = Column(Text)
    manual_province = Column(Text)
    manual_postal_code = Column(Text)
    show_time = Column(Text)
    doors_time = Column(Text)
    show_time_tbc = Column(Boolean, nullable=False, server_default=text("false"))
    doors_time_tbc = Column(Boolean, nullable=False, server_default=text("false"))

    # Punto de empate (OPCIONAL)
    break_even_ticket = Column(Integer, nullable=True)

    sold_out = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Empresa del grupo (si aplica)
    group_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Empresa que factura (empresa del grupo)
    billing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Hashtags / concepto / gira (multi-valor)
    hashtags = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))

    # Extra de contratación / comunicación
    invitations_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    payment_terms_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    announcement_date = Column(Date)
    do_not_announce = Column(Boolean, nullable=False, server_default=text("false"))

    # Registros: conciertos comunicados/declarados en la sección Registros.
    registration_declared_done = Column(Boolean, nullable=False, server_default=text("false"))
    registration_declared_at = Column(DateTime(timezone=True))

    # Estado: BORRADOR | HABLADO | RESERVADO | CONFIRMADO
    status = Column(Text, nullable=False, server_default=text("'BORRADOR'"))

    # relaciones:
    group_company = relationship("GroupCompany", foreign_keys=[group_company_id])
    billing_company = relationship("GroupCompany", foreign_keys=[billing_company_id])
    promoter_company = relationship("PromoterCompany", foreign_keys=[promoter_company_id])

    notes = relationship(
        "ConcertNote",
        cascade="all, delete-orphan",
        order_by="ConcertNote.created_at",
    )

    equipment = relationship(
        "ConcertEquipment",
        uselist=False,
        cascade="all, delete-orphan",
    )

    equipment_documents = relationship(
        "ConcertEquipmentDocument",
        cascade="all, delete-orphan",
        order_by="ConcertEquipmentDocument.uploaded_at",
    )

    equipment_notes = relationship(
        "ConcertEquipmentNote",
        cascade="all, delete-orphan",
        order_by="ConcertEquipmentNote.created_at",
    )

    promoter_shares = relationship(
        "ConcertPromoterShare",
        cascade="all, delete-orphan",
        order_by="ConcertPromoterShare.pct",
    )
    company_shares = relationship(
        "ConcertCompanyShare",
        cascade="all, delete-orphan",
        order_by="ConcertCompanyShare.pct",
    )

    zone_agents = relationship(
        "ConcertZoneAgent",
        cascade="all, delete-orphan",
        order_by="ConcertZoneAgent.created_at",
    )

    caches = relationship(
        "ConcertCache",
        cascade="all, delete-orphan",
        order_by="ConcertCache.created_at",
    )

    contracts = relationship(
        "ConcertContract",
        cascade="all, delete-orphan",
        order_by="ConcertContract.uploaded_at",
    )
    contract_sheet = relationship(
        "ConcertContractSheet",
        uselist=False,
        cascade="all, delete-orphan",
        back_populates="concert",
    )
    artwork_request = relationship(
        "ConcertArtworkRequest",
        uselist=False,
        cascade="all, delete-orphan",
    )

    artist = relationship("Artist")
    promoter = relationship("Promoter")
    venue = relationship("Venue")

    sales = relationship("TicketSale", cascade="all, delete-orphan", order_by="TicketSale.day")

    # --- Ventas V2 (ticketeras + tipos de entrada) ---
    sales_config = relationship(
        "ConcertSalesConfig",
        uselist=False,
        cascade="all, delete-orphan",
    )
    ticket_types = relationship(
        "ConcertTicketType",
        cascade="all, delete-orphan",
        order_by="ConcertTicketType.created_at",
    )
    ticketers = relationship(
        "ConcertTicketer",
        cascade="all, delete-orphan",
        order_by="ConcertTicketer.created_at",
    )
    sales_details = relationship(
        "TicketSaleDetail",
        cascade="all, delete-orphan",
        order_by="TicketSaleDetail.day",
    )


class TicketSale(Base):
    __tablename__ = "ticket_sales"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)
    sold_today = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


# ==============================
#   VENTAS (V2) — TICKETERAS
# ==============================


class Ticketer(Base):
    """Ticketeras (plataformas de venta de entradas)."""

    __tablename__ = "ticketers"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    link_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ConcertSalesConfig(Base):
    """Configuración de ventas por concierto (IVA/SGAE)."""

    __tablename__ = "concert_sales_config"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    vat_pct = Column(Numeric, nullable=False, server_default=text("0"))
    sgae_pct = Column(Numeric, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ConcertTicketType(Base):
    """Tipos de entrada por concierto (nombre, cupo y precio)."""

    __tablename__ = "concert_ticket_types"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    name = Column(Text, nullable=False)
    qty_for_sale = Column(Integer, nullable=False, server_default=text("0"))
    price = Column(Numeric, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("concert_id", "name", name="uq_concert_ticket_type_name"),
    )


class ConcertTicketer(Base):
    """Relación: ticketeras asignadas a un concierto."""

    __tablename__ = "concert_ticketers"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    ticketer_id = Column(PGUUID(as_uuid=True), ForeignKey("ticketers.id", ondelete="CASCADE"), nullable=False)

    # Aforo a la venta específico de esta ticketera para el evento.
    # (Si no se configura, puede quedar a 0; la UI permite establecerlo.)
    capacity_for_sale = Column(Integer, nullable=False, server_default=text("0"))

    # --- Rebate (ingreso adicional NO incluido en ventas) ---
    # FIXED: importe fijo por entrada (bruto, IVA 21% incluido)
    # PERCENT: % sobre base de ingresos SIN IVA de esa ticketera
    rebate_mode = Column(Text)  # FIXED | PERCENT
    rebate_fixed_gross = Column(Numeric)  # bruto con IVA incluido (21%)
    rebate_pct = Column(Numeric)  # porcentaje (0..100)
    rebate_updated_at = Column(DateTime(timezone=True), server_default=func.now())

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ticketer = relationship("Ticketer")

    __table_args__ = (
        UniqueConstraint("concert_id", "ticketer_id", name="uq_concert_ticketer"),
    )



class ConcertTicketerTicketType(Base):
    """Configuración por ticketera y tipo de entrada (aforo + precio).

    - qty_for_sale: cuántas entradas de ese tipo se venden por esa ticketera (cupo).
    - price_gross: precio bruto por entrada (incluye IVA y SGAE).
    """

    __tablename__ = "concert_ticketer_ticket_types"

    # ⚠️ IMPORTANTE (fix 2026-02-13):
    # Esta tabla se crea en la migración con PRIMARY KEY compuesto
    # (concert_id, ticketer_id, ticket_type_id) y NO tiene columna "id".
    # Si el modelo declara un id, SQLAlchemy intentará hacer SELECT ... .id
    # y fallará con "column ... id does not exist".
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    ticketer_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("ticketers.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    ticket_type_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concert_ticket_types.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    qty_for_sale = Column(Integer, nullable=False, server_default=text("0"))
    price_gross = Column(Numeric, nullable=False, server_default=text("0"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    ticketer = relationship("Ticketer")
    ticket_type = relationship("ConcertTicketType")

    # La PK ya garantiza unicidad. No añadimos UniqueConstraint extra.
    __table_args__ = ()


class TicketSaleDetail(Base):
    """Ventas diarias por ticketer y tipo de entrada."""

    __tablename__ = "ticket_sales_details"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)

    ticketer_id = Column(PGUUID(as_uuid=True), ForeignKey("ticketers.id", ondelete="CASCADE"), nullable=False)
    ticket_type_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concert_ticket_types.id", ondelete="CASCADE"),
        nullable=False,
    )

    qty = Column(Integer, nullable=False, server_default=text("0"))

    # Precio unitario BRUTO usado para este registro (incluye IVA y SGAE).
    # Se guarda para que cambios posteriores en configuración no alteren históricos.
    unit_price_gross = Column(Numeric, nullable=False, server_default=text("0"))

    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    ticketer = relationship("Ticketer")
    ticket_type = relationship("ConcertTicketType")

    __table_args__ = (
        UniqueConstraint(
            "concert_id",
            "day",
            "ticketer_id",
            "ticket_type_id",
            name="uq_ticket_sales_details_day",
        ),
    )


# --- PARTICIPACIONES / COLABORADORES ---

class ConcertPromoterShare(Base):
    """Participación de terceros (promoters)."""

    __tablename__ = "concert_promoter_shares"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"), nullable=False)
    promoter_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_companies.id", ondelete="SET NULL"))

    # % (0..100) opcional si hay amount
    pct = Column(Integer)
    pct_base = Column(Text)  # GROSS | NET | PROFIT

    # fijo opcional
    amount = Column(Numeric)
    amount_base = Column(Text)  # GROSS | NET | PROFIT

    promoter = relationship("Promoter")
    promoter_company = relationship("PromoterCompany")


class ConcertCompanyShare(Base):
    """Participación de empresas del grupo."""

    __tablename__ = "concert_company_shares"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="CASCADE"), nullable=False)

    # % (0..100) opcional si hay amount
    pct = Column(Integer)
    pct_base = Column(Text)  # GROSS | NET

    # fijo opcional
    amount = Column(Numeric)
    amount_base = Column(Text)  # GROSS | NET

    company = relationship("GroupCompany")


class ConcertZoneAgent(Base):
    """Promotores de zona / comisionistas."""

    __tablename__ = "concert_zone_agents"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"), nullable=False)
    promoter_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_companies.id", ondelete="SET NULL"))

    # PERCENT | AMOUNT
    commission_type = Column(Text, nullable=False, server_default=text("'PERCENT'"))

    commission_pct = Column(Numeric)
    commission_base = Column(Text)  # GROSS | NET | PROFIT

    commission_amount = Column(Numeric)
    commission_amount_base = Column(Text)  # GROSS | NET | PROFIT

    # Importe exento (opcional)
    exempt_amount = Column(Numeric)

    # Concepto / motivo de la comisión
    concept = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")
    promoter_company = relationship("PromoterCompany")


# --- CACHÉS ---

class ConcertCache(Base):
    __tablename__ = "concert_caches"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    # FIXED | VARIABLE | OTHER
    kind = Column(Text, nullable=False)

    # Para VARIABLE: TICKETS | REVENUE
    variable_basis = Column(Text)

    # Para OTHER: concepto
    concept = Column(Text)

    pct = Column(Numeric)
    pct_base = Column(Text)  # GROSS | NET

    amount = Column(Numeric)
    amount_base = Column(Text)  # GROSS | NET

    # Config extra (JSON) para cachés variables avanzados
    config = Column(JSONB)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# --- CONTRATOS ---

class ConcertContract(Base):
    __tablename__ = "concert_contracts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    concept = Column(Text, nullable=False)
    pdf_url = Column(Text, nullable=False)
    original_name = Column(Text)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class ConcertContractSheet(Base):
    __tablename__ = "concert_contract_sheets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    public_token = Column(Text, nullable=False, unique=True)
    promoter_email = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'REQUESTED'"))
    allow_resubmission = Column(Boolean, nullable=False, server_default=text("false"))
    request_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    merge_log = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    rejection_reason = Column(Text)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at = Column(DateTime(timezone=True))
    reviewed_at = Column(DateTime(timezone=True))
    accepted_at = Column(DateTime(timezone=True))
    rejected_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert", back_populates="contract_sheet")


class ConcertArtworkRequest(Base):
    __tablename__ = "concert_artwork_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    public_token = Column(Text, nullable=False, unique=True)
    handled_by = Column(Text, nullable=False, server_default=text("'OURS'"))
    status = Column(Text, nullable=False, server_default=text("'DRAFT'"))
    group_company_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    ticketer_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    logo_notes = Column(Text)
    ticketer_notes = Column(Text)
    other_notes = Column(Text)
    delivery_deadline = Column(Date)
    event_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    needs_refresh = Column(Boolean, nullable=False, server_default=text("false"))
    requested_at = Column(DateTime(timezone=True))
    uploaded_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    assets = relationship(
        "ConcertArtworkAsset",
        cascade="all, delete-orphan",
        order_by="ConcertArtworkAsset.created_at",
    )


class ConcertArtworkAsset(Base):
    __tablename__ = "concert_artwork_assets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artwork_request_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concert_artwork_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    format_label = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    original_name = Column(Text)
    mime_type = Column(Text)
    # Cartel principal (el que se muestra en cabeceras). Si solo hay uno, ese es el principal.
    is_primary = Column(Boolean, nullable=False, server_default=text("false"))
    is_archived = Column(Boolean, nullable=False, server_default=text("false"))
    archived_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# --- NOTAS (contratación / generales) ---

class ConcertNote(Base):
    __tablename__ = "concert_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    title = Column(Text, nullable=False, server_default=text("''"))
    body = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# --- EQUIPAMIENTO ---

class ConcertEquipment(Base):
    __tablename__ = "concert_equipments"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # lista seleccionada (JSON)
    included = Column(JSONB)

    # texto libre (opcional)
    other = Column(Text)

    covered_by_promoter = Column(Boolean, nullable=False, default=False)
    # RIDER | AMOUNT
    covered_mode = Column(Text)
    covered_amount = Column(Numeric)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ConcertEquipmentDocument(Base):
    __tablename__ = "concert_equipment_documents"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    concept = Column(Text, nullable=False)
    pdf_url = Column(Text, nullable=False)
    original_name = Column(Text)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class ConcertEquipmentNote(Base):
    __tablename__ = "concert_equipment_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)

    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ==============================
#  MIGRACIONES LIGERAS (SIN ALEMBIC)
# ==============================




class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    nick = Column(Text, nullable=False)
    photo_url = Column(Text)
    first_name = Column(Text)
    last_name = Column(Text)
    dni = Column(Text)
    birth_date = Column(Date)
    mobile_phones = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    departments = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Unión (compatibilidad). Las facetas separan qué artistas se asignan por Producción y por Sello
    # (una persona puede ser de ambos a la vez).
    assigned_artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    assigned_artist_ids_produccion = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    assigned_artist_ids_sello = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    legacy_permissions_seeded = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class UserSecurity(Base):
    __tablename__ = "user_security"

    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_blocked = Column(Boolean, nullable=False, server_default=text("false"))
    blocked_at = Column(DateTime(timezone=True))
    is_deleted = Column(Boolean, nullable=False, server_default=text("false"))
    deleted_at = Column(DateTime(timezone=True))
    # DEPRECADA por seguridad: ya no se almacena la contraseña en claro. La columna se conserva por
    # compatibilidad pero se mantiene siempre vacía (ver el UPDATE de borrado en
    # ensure_personnel_and_operations_schema). No volver a escribir aquí.
    password_preview = Column(Text)
    password_last_changed_at = Column(DateTime(timezone=True))
    password_reset_sent_at = Column(DateTime(timezone=True))
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class UserAccessResource(Base):
    __tablename__ = "user_access_resources"

    key = Column(Text, primary_key=True)
    parent_key = Column(Text, ForeignKey("user_access_resources.key", ondelete="CASCADE"))
    section_key = Column(Text, nullable=False)
    label = Column(Text, nullable=False)
    level = Column(Text, nullable=False, server_default=text("'SECTION'"))
    economic_capable = Column(Boolean, nullable=False, server_default=text("false"))
    route_hint = Column(Text)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class UserAccessGrant(Base):
    __tablename__ = "user_access_grants"

    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    resource_key = Column(
        Text,
        ForeignKey("user_access_resources.key", ondelete="CASCADE"),
        primary_key=True,
    )
    can_view_basic = Column(Boolean, nullable=False, server_default=text("false"))
    can_view_econ = Column(Boolean, nullable=False, server_default=text("false"))
    can_edit = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    resource = relationship("UserAccessResource")


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resource_key = Column(Text)
    endpoint = Column(Text)
    path = Column(Text)
    method = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")

    __table_args__ = (
        Index("idx_user_activity_logs_user_created", "user_id", "created_at"),
        Index("idx_user_activity_logs_resource", "resource_key"),
    )


class MediaOutlet(Base):
    __tablename__ = "media_outlets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    media_type = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    logo_url = Column(Text)
    country_code = Column(Text, nullable=False, server_default=text("'ES'"))
    country_name = Column(Text, nullable=False, server_default=text("'España'"))
    address = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    contacts = relationship(
        "MediaContact",
        back_populates="media",
        cascade="all, delete-orphan",
        order_by="MediaContact.created_at",
    )
    history_rows = relationship(
        "MediaPromotionRecord",
        back_populates="media",
        cascade="all, delete-orphan",
        order_by="MediaPromotionRecord.promoted_at.desc()",
    )

    __table_args__ = (
        Index("idx_media_outlets_type_name", "media_type", "name"),
    )


class MediaContact(Base):
    __tablename__ = "media_contacts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    media_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="CASCADE"), nullable=False)
    program = Column(Text)
    role = Column(Text)
    first_name = Column(Text)
    last_name = Column(Text)
    phone = Column(Text)
    email = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    media = relationship("MediaOutlet", back_populates="contacts")

    __table_args__ = (
        Index("idx_media_contacts_media_id", "media_id"),
    )


class MediaPromotionRecord(Base):
    __tablename__ = "media_promotion_records"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    media_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="CASCADE"), nullable=False)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    promotion_id = Column(PGUUID(as_uuid=True), ForeignKey("promotions.id", ondelete="SET NULL"))
    promotion_title = Column(Text)
    program_name = Column(Text)
    promoted_at = Column(Date, nullable=False)
    artist_performed = Column(Boolean, nullable=False, server_default=text("false"))
    performed_song = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    media = relationship("MediaOutlet", back_populates="history_rows")
    artist = relationship("Artist")
    promotion = relationship("Promotion")

    __table_args__ = (
        Index("idx_media_promotion_records_media_date", "media_id", "promoted_at"),
        Index("idx_media_promotion_records_artist_date", "artist_id", "promoted_at"),
        Index("idx_media_promotion_records_promotion_id", "promotion_id"),
    )




class PromotionRequest(Base):
    __tablename__ = "promotion_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    source_type = Column(Text, nullable=False)
    source_id = Column(PGUUID(as_uuid=True))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    subject_date = Column(Date)
    objectives_notes = Column(Text)
    budget_notes = Column(Text)
    request_kind = Column(Text, nullable=False, server_default=text("'PLAN'"))
    action_types = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    budget_mode = Column(Text, nullable=False, server_default=text("'REQUEST_BUDGET'"))
    budget_max = Column(Numeric)
    budget_by_action = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    starts_on = Column(Date)
    ends_on = Column(Date)
    deadline_notes = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'REQUESTED'"))
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_email = Column(Text)
    requested_by_nick = Column(Text)
    reviewed_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by_nick = Column(Text)
    rejection_reason = Column(Text)
    reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_promotion_requests_status_date", "status", "subject_date"),
        Index("idx_promotion_requests_source", "source_type", "source_id"),
        Index("idx_promotion_requests_requested_by", "requested_by_user_id", "created_at"),
    )


class ProductionRequest(Base):
    __tablename__ = "production_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_type = Column(Text, nullable=False, server_default=text("'GENERAL'"))
    activity_title = Column(Text)
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    activity_date = Column(Date)
    city = Column(Text)
    province = Column(Text)
    linked_type = Column(Text)
    linked_id = Column(PGUUID(as_uuid=True))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    status = Column(Text, nullable=False, server_default=text("'REQUESTED'"))
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_email = Column(Text)
    requested_by_nick = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag")
    requested_by = relationship("User")

    __table_args__ = (
        Index("idx_production_requests_status_date", "status", "activity_date"),
        Index("idx_production_requests_bag", "bag_id"),
        Index("idx_production_requests_linked", "linked_type", "linked_id"),
    )


class ConcertBudgetItem(Base):
    """Presupuesto operativo vinculado a una actividad/concierto.

    Se mantiene separado de WorkflowBag porque aquí todavía no son gastos reales:
    solo concepto e importes, que se pueden usar como base al abrir la bolsa.
    """

    __tablename__ = "concert_budget_items"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    category = Column(Text, nullable=False, server_default=text("'OTROS'"))
    concept = Column(Text, nullable=False)
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))
    amount_gross = Column(Numeric, nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    status = Column(Text, nullable=False, server_default=text("'ACTIVO'"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_concert_budget_items_concert", "concert_id", "category", "sort_order"),
        Index("idx_concert_budget_items_status", "status"),
    )



class InvitationCategory(Base):
    """Categorías de invitaciones configuradas para una actividad/concierto."""

    __tablename__ = "invitation_categories"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    source = Column(Text, nullable=False, server_default=text("'MANUAL'"))
    ticket_kind = Column(Text, nullable=False, server_default=text("'PDF_UNNUMBERED'"))
    guest_list_mode = Column(Text)
    numbering_mode = Column(Text)
    qty_contract = Column(Integer, nullable=False, server_default=text("0"))
    qty_extra = Column(Integer, nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    requests_blocked = Column(Boolean, nullable=False, server_default=text("false"))
    # «No aceptar peticiones por encima del cupo»: si está activo, pedir/modificar esta categoría se
    # rechaza cuando la cantidad supera el aforo disponible del evento (por defecto NO se limita).
    requests_over_quota_blocked = Column(Boolean, nullable=False, server_default=text("false"))
    # Categoría PMR (movilidad reducida): cada entrada puede llevar una entrada de ACOMPAÑANTE
    # vinculada (segundo PDF); al enviar la invitación se mandan siempre las dos juntas.
    is_pmr = Column(Boolean, nullable=False, server_default=text("false"))
    # Enlaces de «reparto en vivo» por sector: {sector: {token, created_at}} (se borra al anular).
    plan_share_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    zone = Column(Text)  # PISTA / GRADA / PALCO (si vacío se infiere del nombre)
    stairs_spec = Column(Text)  # Escaleras del plano (opcional): butacas entre las que hay escalera, p. ej. "17-19, 27-29"
    # Plano por sector (configurador de la rueda): {sectors: {"<sector>": {stairs:[17,..], gaps:[..],
    # off:[..], stage:"top|bottom|left|right"}}}. Rejilla auto (rango mín→máx por paso) + estos retoques.
    layout_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    created_by = relationship("User")

    __table_args__ = (
        UniqueConstraint("concert_id", "name", name="uq_invitation_categories_concert_name"),
        Index("idx_invitation_categories_concert", "concert_id", "is_active", "sort_order"),
    )


class InvitationCommitment(Base):
    """Compromisos de invitaciones del recinto, artista, promotor, patrocinadores, etc."""

    __tablename__ = "invitation_commitments"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    name = Column(Text, nullable=False)
    reason = Column(Text)
    quantities_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status = Column(Text, nullable=False, server_default=text("'COMPROMETIDAS'"))
    note = Column(Text)
    # Destinatario (a quién se le mandan): igual que en las solicitudes (tercero / artista / empleado).
    guest_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    guest_artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    guest_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    guest_name = Column(Text)
    guest_email = Column(Text)
    guest_phone = Column(Text)
    delivery_token = Column(Text)  # token para el ZIP público de descarga (igual que en solicitudes)
    sent_via = Column(Text)   # cómo se envió (tooltip): Email/WhatsApp/SMS/Manual/Taquilla
    sent_to = Column(Text)    # a quién (correos/teléfono)
    downloaded_at = Column(DateTime(timezone=True))
    downloaded_count = Column(Integer, nullable=False, server_default=text("0"))
    # Descargas por categoría: {category_id: iso_datetime}. Permite marcar en el listado qué
    # categorías (Pista, Grada…) del compromiso se han descargado y cuáles no.
    downloaded_categories_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    promoter = relationship("Promoter", foreign_keys=[promoter_id])
    guest_promoter = relationship("Promoter", foreign_keys=[guest_promoter_id])
    guest_artist = relationship("Artist", foreign_keys=[guest_artist_id])
    guest_user = relationship("User", foreign_keys=[guest_user_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        Index("idx_invitation_commitments_concert", "concert_id", "status"),
        Index("idx_invitation_commitments_promoter", "promoter_id"),
    )


class InvitationPublicLink(Base):
    """Enlaces únicos para que un tercero pueda hacer peticiones públicas de invitaciones."""

    __tablename__ = "invitation_public_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    target_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    target_name = Column(Text)
    target_email = Column(Text)
    target_phone = Column(Text)
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_nick = Column(Text)
    requested_by_email = Column(Text)
    requested_by_photo_url = Column(Text)
    limit_mode = Column(Text, nullable=False, server_default=text("'NONE'"))
    total_limit = Column(Integer)
    category_limits_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    categories_enabled_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    categorize_requests = Column(Boolean, nullable=False, server_default=text("true"))
    # Congelación manual: bloquea nuevas peticiones y cambios sin anular el enlace.
    locked = Column(Boolean, nullable=False, server_default=text("false"))
    # Solo mostrar categorías con aforo disponible (mostrando el disponible).
    show_only_available = Column(Boolean, nullable=False, server_default=text("false"))
    # Limitar lo solicitable al aforo real disponible del evento.
    limit_to_available = Column(Boolean, nullable=False, server_default=text("false"))
    deadline_at = Column(DateTime(timezone=True))
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True))
    cancelled_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    concert = relationship("Concert")
    target_promoter = relationship("Promoter", foreign_keys=[target_promoter_id])
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_user_id])

    __table_args__ = (
        Index("idx_invitation_public_links_concert", "concert_id", "status", "deadline_at"),
        Index("idx_invitation_public_links_target", "target_promoter_id"),
    )


class InvitationRequest(Base):
    """Solicitud de invitaciones, interna o generada desde enlace público."""

    __tablename__ = "invitation_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    public_link_id = Column(PGUUID(as_uuid=True), ForeignKey("invitation_public_links.id", ondelete="SET NULL"))
    request_source = Column(Text, nullable=False, server_default=text("'INTERNAL'"))
    requester_type = Column(Text, nullable=False, server_default=text("'USER'"))
    requester_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requester_nick = Column(Text)
    requester_email = Column(Text)
    requester_photo_url = Column(Text)
    # Auditoría: quién registró la solicitud (puede diferir del solicitante cuando se pide en nombre
    # de otra persona de la oficina). Snapshot informativo, sin FK.
    created_by_user_id = Column(PGUUID(as_uuid=True))
    created_by_nick = Column(Text)
    guest_type = Column(Text, nullable=False, server_default=text("'THIRD_PARTY'"))
    guest_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    guest_artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    guest_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    guest_name = Column(Text, nullable=False)
    guest_company = Column(Text)
    guest_title = Column(Text)
    guest_link_summary = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    guest_email = Column(Text)
    guest_phone = Column(Text)
    guest_note = Column(Text)
    receiver_mode = Column(Text, nullable=False, server_default=text("'GUEST'"))
    receiver_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    quantities_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status = Column(Text, nullable=False, server_default=text("'SOLICITADAS'"))
    note = Column(Text)
    delivery_token = Column(Text, unique=True)
    downloaded_at = Column(DateTime(timezone=True))
    downloaded_count = Column(Integer, nullable=False, server_default=text("0"))
    # Reenvío por el propio invitado desde el correo (Compartir WhatsApp/SMS).
    reforwarded_at = Column(DateTime(timezone=True))
    reforwarded_count = Column(Integer, nullable=False, server_default=text("0"))
    # Cómo y a quién se envió (tooltip de la etiqueta «Enviadas»): 'Email'/'WhatsApp'/'SMS'/'Manual' + destino.
    sent_via = Column(Text)
    sent_to = Column(Text)
    approved_at = Column(DateTime(timezone=True))
    assigned_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    rejected_at = Column(DateTime(timezone=True))
    rejection_reason = Column(Text)
    cancelled_at = Column(DateTime(timezone=True))
    cancelled_by_label = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    public_link = relationship("InvitationPublicLink")
    requester = relationship("User", foreign_keys=[requester_user_id])
    guest_promoter = relationship("Promoter", foreign_keys=[guest_promoter_id])
    guest_artist = relationship("Artist", foreign_keys=[guest_artist_id])
    guest_user = relationship("User", foreign_keys=[guest_user_id])

    __table_args__ = (
        Index("idx_invitation_requests_concert_status", "concert_id", "status", "created_at"),
        Index("idx_invitation_requests_public_link", "public_link_id", "created_at"),
        Index("idx_invitation_requests_requester", "requester_user_id", "created_at"),
        Index("idx_invitation_requests_delivery_token", "delivery_token"),
    )


class InvitationTicket(Base):
    """PDF/entrada individual subida a una categoría de invitaciones."""

    __tablename__ = "invitation_tickets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(PGUUID(as_uuid=True), ForeignKey("invitation_categories.id", ondelete="CASCADE"), nullable=True)
    ticket_code = Column(Text)
    pdf_url = Column(Text, nullable=False)
    pdf_name = Column(Text)
    pdf_sha256 = Column(Text)
    is_numbered = Column(Boolean, nullable=False, server_default=text("false"))
    sector = Column(Text)
    row_label = Column(Text)
    seat_number = Column(Text)
    # PMR: PDF de la entrada de ACOMPAÑANTE adjunta a esta entrada. No es una entrada suelta ni cuenta
    # como invitación aparte: viaja SIEMPRE con esta (se incluye en la fusión/ZIP/descarga al enviar).
    companion_pdf_url = Column(Text)
    companion_pdf_name = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'AVAILABLE'"))
    assigned_request_id = Column(PGUUID(as_uuid=True), ForeignKey("invitation_requests.id", ondelete="SET NULL"))
    assigned_commitment_id = Column(PGUUID(as_uuid=True), ForeignKey("invitation_commitments.id", ondelete="SET NULL"))
    assigned_label = Column(Text)
    assigned_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    printed_at = Column(DateTime(timezone=True))  # impresa en bloque (funciona como enviada, color naranja)
    print_reason = Column(Text)  # motivo de la impresión en bloque
    previous_assignment_warning = Column(Text)
    uploaded_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_by_nick = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    category = relationship("InvitationCategory")
    assigned_request = relationship("InvitationRequest")
    assigned_commitment = relationship("InvitationCommitment")
    uploaded_by = relationship("User")

    __table_args__ = (
        Index("idx_invitation_tickets_concert_category", "concert_id", "category_id", "status"),
        Index("idx_invitation_tickets_assigned_request", "assigned_request_id"),
        Index("idx_invitation_tickets_sha", "pdf_sha256"),
        UniqueConstraint("concert_id", "ticket_code", name="uq_invitation_tickets_concert_code"),
    )


class ThirdPartyLink(Base):
    """Vinculaciones genéricas entre terceros y entidades de la app."""

    __tablename__ = "third_party_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    source_type = Column(Text, nullable=False)
    source_id = Column(PGUUID(as_uuid=True), nullable=False)
    target_type = Column(Text, nullable=False)
    target_id = Column(PGUUID(as_uuid=True), nullable=False)
    relation_title = Column(Text)
    note = Column(Text)
    is_active = Column(Boolean, nullable=False, server_default=text("true"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    created_by = relationship("User")

    __table_args__ = (
        Index("idx_third_party_links_source", "source_type", "source_id", "is_active"),
        Index("idx_third_party_links_target", "target_type", "target_id", "is_active"),
        UniqueConstraint("source_type", "source_id", "target_type", "target_id", name="uq_third_party_links_direct"),
    )


class InvitationGuestListLink(Base):
    """Enlaces públicos para listados de invitados de un evento."""

    __tablename__ = "invitation_guest_list_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    list_type = Column(Text, nullable=False, server_default=text("'COMPLETE'"))
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True))
    cancelled_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    concert = relationship("Concert")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_user_id])

    __table_args__ = (
        Index("idx_invitation_guest_list_links_concert", "concert_id", "status", "list_type"),
        Index("idx_invitation_guest_list_links_token", "token"),
    )


class InvitationManagerOptIn(Base):
    """Actividades que un usuario ha añadido manualmente a su lista de gestión de
    invitaciones ('Gestionar otros'), aunque no le correspondan por artista o departamento."""

    __tablename__ = "invitation_manager_optins"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    concert = relationship("Concert")

    __table_args__ = (
        UniqueConstraint("user_id", "concert_id", name="uq_invitation_manager_optins_user_concert"),
        Index("idx_invitation_manager_optins_user", "user_id"),
    )


class CompanyActionRequest(Base):
    """Solicitudes previas a la creación de una acción."""

    __tablename__ = "company_action_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    title = Column(Text)
    action_type = Column(Text, nullable=False, server_default=text("'EVENTO_PROMOCIONAL'"))
    content_subtype = Column(Text)
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    source_type = Column(Text)
    source_id = Column(PGUUID(as_uuid=True))
    requested_date = Column(Date)
    due_date = Column(Date)
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status = Column(Text, nullable=False, server_default=text("'REQUESTED'"))
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_nick = Column(Text)
    reviewed_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by_nick = Column(Text)
    rejection_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])

    __table_args__ = (
        Index("idx_company_action_requests_status_date", "status", "requested_date", "due_date"),
        Index("idx_company_action_requests_source", "source_type", "source_id"),
    )


class CompanyAction(Base):
    """Acciones no puramente de concierto: promos, premios, TV y generación de contenido."""

    __tablename__ = "company_actions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    title = Column(Text, nullable=False)
    action_type = Column(Text, nullable=False, server_default=text("'EVENTO_PROMOCIONAL'"))
    content_subtype = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'RESERVA'"))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    linked_content = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    media_type = Column(Text)
    media_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="SET NULL"))
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    start_date = Column(Date)
    end_date = Column(Date)
    start_time = Column(Text)
    end_time = Column(Text)
    time_tbc = Column(Boolean, nullable=False, server_default=text("false"))
    location_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    events_payload = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    artist_tasks = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    repertoire_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    formation_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    has_fee = Column(Boolean, nullable=False, server_default=text("false"))
    fee_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    promoter_costs_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    announcement_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    roadmap_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    roadmap_public_token = Column(Text)
    source_request_id = Column(PGUUID(as_uuid=True), ForeignKey("company_action_requests.id", ondelete="SET NULL"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    archived_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    venue = relationship("Venue")
    media = relationship("MediaOutlet")
    bag = relationship("WorkflowBag")
    source_request = relationship("CompanyActionRequest")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_company_actions_status_date", "status", "start_date"),
        Index("idx_company_actions_type_date", "action_type", "start_date"),
        Index("idx_company_actions_venue", "venue_id", "start_date"),
        Index("idx_company_actions_bag", "bag_id"),
    )


class Promotion(Base):
    __tablename__ = "promotions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    subject_type = Column(Text, nullable=False)
    subject_id = Column(PGUUID(as_uuid=True))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    source_request_id = Column(PGUUID(as_uuid=True), ForeignKey("promotion_requests.id", ondelete="SET NULL"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    roadmap_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    roadmap_public_token = Column(Text)
    objectives_notes = Column(Text)
    budget_notes = Column(Text)
    request_kind = Column(Text, nullable=False, server_default=text("'PLAN'"))
    action_types = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    budget_mode = Column(Text, nullable=False, server_default=text("'REQUEST_BUDGET'"))
    budget_max = Column(Numeric)
    budget_by_action = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    starts_on = Column(Date)
    ends_on = Column(Date)
    deadline_notes = Column(Text)
    target_date = Column(Date)
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    archived_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")
    bag = relationship("WorkflowBag")
    source_request = relationship("PromotionRequest")

    __table_args__ = (
        Index("idx_promotions_status_date", "status", "target_date"),
        Index("idx_promotions_subject", "subject_type", "subject_id"),
        Index("idx_promotions_company", "company_id", "target_date"),
    )


class PromotionActivity(Base):
    __tablename__ = "promotion_activities"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promotion_id = Column(PGUUID(as_uuid=True), ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    activity_date = Column(Date, nullable=False)
    start_time = Column(Text)
    end_time = Column(Text)
    time_tbc = Column(Boolean, nullable=False, server_default=text("false"))
    show_as_tbc = Column(Boolean, nullable=False, server_default=text("false"))
    activity_kind = Column(Text, nullable=False)
    action_type = Column(Text)
    subtype = Column(Text)
    exterior_subtype = Column(Text)
    media_type = Column(Text)
    media_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="SET NULL"))
    media_contact_id = Column(PGUUID(as_uuid=True), ForeignKey("media_contacts.id", ondelete="SET NULL"))
    media_target_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    details_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    task_description = Column(Text)
    execution_mode = Column(Text, nullable=False, server_default=text("'PERIODO'"))
    waves_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    provider_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    provider_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_companies.id", ondelete="SET NULL"))
    provider_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    budget_group_key = Column(Text)
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))
    amount_tax = Column(Numeric, nullable=False, server_default=text("0"))
    amount_gross = Column(Numeric, nullable=False, server_default=text("0"))
    allocation_mode = Column(Text, nullable=False, server_default=text("'SOURCE'"))
    allocation_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    document_type = Column(Text, nullable=False, server_default=text("'FACTURA'"))
    invoice_number = Column(Text)
    issue_date = Column(Date)
    attachment_url = Column(Text)
    attachment_name = Column(Text)
    attachment_mime = Column(Text)
    consolidation_status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))
    no_invoice_reason = Column(Text)
    immediate_payment_requested = Column(Boolean, nullable=False, server_default=text("false"))
    immediate_payment_requested_at = Column(DateTime(timezone=True))
    bag_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="SET NULL"))
    artist_performed = Column(Boolean, nullable=False, server_default=text("false"))
    performed_song_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    has_fee = Column(Boolean, nullable=False, server_default=text("false"))
    fee_amount = Column(Numeric, nullable=False, server_default=text("0"))
    covered_costs = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cost_note = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promotion = relationship("Promotion")
    media = relationship("MediaOutlet")
    media_contact = relationship("MediaContact")
    provider = relationship("Promoter")
    provider_company = relationship("PromoterCompany")
    bag_expense = relationship("BagExpense", foreign_keys=[bag_expense_id])

    __table_args__ = (
        Index("idx_promotion_activities_promotion_date", "promotion_id", "activity_date"),
        Index("idx_promotion_activities_kind", "activity_kind", "activity_date"),
        Index("idx_promotion_activities_action_type", "action_type", "activity_date"),
        Index("idx_promotion_activities_media", "media_id", "activity_date"),
        Index("idx_promotion_activities_bag_expense", "bag_expense_id"),
    )


class WorkflowBag(Base):
    __tablename__ = "workflow_bags"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    title = Column(Text, nullable=False)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    bag_type = Column(Text, nullable=False, server_default=text("'GENERAL'"))
    linked_type = Column(Text)
    linked_id = Column(PGUUID(as_uuid=True))
    linked_title = Column(Text)
    linked_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    start_date = Column(Date)
    end_date = Column(Date)
    description = Column(Text)
    economic_indications = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'ACTIVA'"))
    liquidation_status = Column(Text, nullable=False, server_default=text("'NO_INICIADA'"))
    is_archived = Column(Boolean, nullable=False, server_default=text("false"))
    archived_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    closed_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    liquidation_requested_at = Column(DateTime(timezone=True))
    liquidation_reviewed_at = Column(DateTime(timezone=True))
    liquidation_paid_at = Column(DateTime(timezone=True))
    liquidation_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    liquidation_adjustments = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    closed_liquidation_pdf_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")
    company = relationship("GroupCompany")
    closed_by = relationship("User")
    expenses = relationship("BagExpense", back_populates="bag", cascade="all, delete-orphan", order_by="BagExpense.sort_order", foreign_keys="BagExpense.bag_id")
    notes = relationship("BagNote", back_populates="bag", cascade="all, delete-orphan", order_by="BagNote.created_at")

    __table_args__ = (
        Index("idx_workflow_bags_archived", "is_archived", "start_date"),
        Index("idx_workflow_bags_artist_company", "artist_id", "company_id"),
        Index("idx_workflow_bags_liquidation_status", "liquidation_status", "closed_at"),
        Index("idx_workflow_bags_linked", "linked_type", "linked_id"),
    )


class BagNote(Base):
    __tablename__ = "bag_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="CASCADE"), nullable=False)
    note_type = Column(Text, nullable=False, server_default=text("'GENERAL'"))
    body = Column(Text, nullable=False)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_by_photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag", back_populates="notes")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_bag_notes_bag_type", "bag_id", "note_type", "created_at"),
    )


class BagExpense(Base):
    __tablename__ = "bag_expenses"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="CASCADE"), nullable=False)
    source_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="SET NULL"))
    category = Column(Text, nullable=False, server_default=text("'OTROS'"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    concept = Column(Text)
    provider_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    provider_company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_companies.id", ondelete="SET NULL"))
    provider_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    ticket_establishment = Column(Text)
    document_type = Column(Text, nullable=False, server_default=text("'FACTURA'"))
    invoice_number = Column(Text)
    issue_date = Column(Date)
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))
    amount_tax = Column(Numeric, nullable=False, server_default=text("0"))
    amount_gross = Column(Numeric, nullable=False, server_default=text("0"))
    retention_amount = Column(Numeric, nullable=False, server_default=text("0"))
    payment_status = Column(Text, nullable=False, server_default=text("'NO_PAGADO'"))
    paid_amount = Column(Numeric, nullable=False, server_default=text("0"))
    payment_method = Column(Text)
    covered_by = Column(Text, nullable=False, server_default=text("'BOLSA'"))
    cover_detail = Column(Text)
    split_info = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    consolidation_status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))
    no_invoice_reason = Column(Text)
    no_invoice_rejection_reason = Column(Text)
    attachment_url = Column(Text)
    attachment_name = Column(Text)
    attachment_mime = Column(Text)
    rectification_url = Column(Text)
    rectification_name = Column(Text)
    rectification_mime = Column(Text)
    replace_history = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    immediate_payment_requested = Column(Boolean, nullable=False, server_default=text("false"))
    immediate_payment_reason = Column(Text)
    immediate_payment_amount_mode = Column(Text)
    immediate_payment_percent = Column(Numeric)
    immediate_payment_amount = Column(Numeric)
    immediate_payment_send_receipt = Column(Boolean, nullable=False, server_default=text("false"))
    immediate_payment_requested_at = Column(DateTime(timezone=True))
    admin_review_status = Column(Text)
    admin_review_note = Column(Text)
    admin_reviewed_at = Column(DateTime(timezone=True))
    payment_receipt_url = Column(Text)
    payment_receipt_name = Column(Text)
    is_proration = Column(Boolean, nullable=False, server_default=text("false"))
    proration_source_bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    proration_pending_snapshot = Column(Numeric)
    status = Column(Text, nullable=False, server_default=text("'ACTIVO'"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag", foreign_keys=[bag_id], back_populates="expenses")
    source_expense = relationship("BagExpense", remote_side=[id])
    proration_source_bag = relationship("WorkflowBag", foreign_keys=[proration_source_bag_id])
    provider = relationship("Promoter")
    provider_company = relationship("PromoterCompany")
    created_by = relationship("User")
    notes = relationship("BagExpenseNote", back_populates="expense", cascade="all, delete-orphan", order_by="BagExpenseNote.created_at")
    alerts = relationship("BagExpenseAlert", back_populates="expense", cascade="all, delete-orphan", order_by="BagExpenseAlert.alert_date")
    payment_events = relationship("BagPaymentInteraction", back_populates="expense", cascade="all, delete-orphan", order_by="BagPaymentInteraction.created_at")

    __table_args__ = (
        Index("idx_bag_expenses_bag_category", "bag_id", "category", "sort_order"),
        Index("idx_bag_expenses_consolidation", "consolidation_status"),
        Index("idx_bag_expenses_payment", "payment_status", "immediate_payment_requested"),
        Index("idx_bag_expenses_provider", "provider_id"),
    )


class BagExpenseNote(Base):
    __tablename__ = "bag_expense_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_by_photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expense = relationship("BagExpense", back_populates="notes")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_bag_expense_notes_expense", "expense_id", "created_at"),
    )


class BagExpenseAlert(Base):
    __tablename__ = "bag_expense_alerts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="CASCADE"), nullable=False)
    alert_date = Column(Date, nullable=False)
    body = Column(Text)
    is_done = Column(Boolean, nullable=False, server_default=text("false"))
    done_at = Column(DateTime(timezone=True))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expense = relationship("BagExpense", back_populates="alerts")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_bag_expense_alerts_due", "alert_date", "is_done"),
        Index("idx_bag_expense_alerts_expense", "expense_id"),
    )


class BagPaymentInteraction(Base):
    __tablename__ = "bag_payment_interactions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="CASCADE"), nullable=False)
    kind = Column(Text, nullable=False)
    description = Column(Text)
    amount = Column(Numeric)
    percent = Column(Numeric)
    method = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expense = relationship("BagExpense", back_populates="payment_events")
    created_by = relationship("User")

    __table_args__ = (
        Index("idx_bag_payment_interactions_expense", "expense_id", "created_at"),
        Index("idx_bag_payment_interactions_kind", "kind", "created_at"),
    )


class InvoiceRecord(Base):
    __tablename__ = "invoice_records"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    invoice_kind = Column(Text, nullable=False)
    invoice_number = Column(Text, nullable=False)
    third_party_name = Column(Text, nullable=False)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date)
    status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))
    total_amount = Column(Numeric, nullable=False, server_default=text("0"))
    pdf_url = Column(Text)
    original_name = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")
    company = relationship("GroupCompany")
    bag = relationship("WorkflowBag")

    __table_args__ = (
        Index("idx_invoice_records_kind_date", "invoice_kind", "issue_date"),
        Index("idx_invoice_records_status", "status"),
        Index("idx_invoice_records_company_artist", "company_id", "artist_id"),
    )




class TourOneSheet(Base):
    """One-sheet editable para giras compradas agrupadas por slug."""

    __tablename__ = "tour_onesheets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    slug = Column(Text, nullable=False, unique=True)
    title = Column(Text, nullable=False)
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cover_url = Column(Text)
    background_color = Column(Text, nullable=False, server_default=text("'#ffffff'"))
    text_color = Column(Text, nullable=False, server_default=text("'#111111'"))
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    public_token = Column(Text, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_tour_onesheets_slug", "slug"),
        Index("idx_tour_onesheets_token", "public_token"),
    )

class EmbargoOrder(Base):
    """Órdenes de embargo o levantamiento subidas desde Administración."""

    __tablename__ = "embargo_orders"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    order_type = Column(Text, nullable=False, server_default=text("'EMBARGO'"))  # EMBARGO | LEVANTAMIENTO | DESCONOCIDO
    status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))  # ACTIVA | PENDIENTE | REVISAR | ARCHIVADA
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    provider_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    detected_name = Column(Text)
    detected_tax_id = Column(Text)
    detected_address = Column(Text)
    reference = Column(Text)
    diligence_number = Column(Text)
    order_date = Column(Date)
    amount_total = Column(Numeric)
    detected_text = Column(Text)
    pdf_url = Column(Text)
    pdf_name = Column(Text)
    suggested_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    match_score = Column(Numeric)
    match_label = Column(Text)
    related_embargo_id = Column(PGUUID(as_uuid=True), ForeignKey("embargo_orders.id", ondelete="SET NULL"))
    uploaded_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_by_nick = Column(Text)
    archived_at = Column(DateTime(timezone=True))
    archived_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    archived_by_nick = Column(Text)
    archive_reason = Column(Text)
    notified_at = Column(DateTime(timezone=True))
    notified_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter", foreign_keys=[promoter_id])
    suggested_promoter = relationship("Promoter", foreign_keys=[suggested_promoter_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    archived_by = relationship("User", foreign_keys=[archived_by_user_id])
    related_embargo = relationship("EmbargoOrder", remote_side=[id])

    __table_args__ = (
        Index("idx_embargo_orders_type_status", "order_type", "status"),
        Index("idx_embargo_orders_promoter", "promoter_id"),
        Index("idx_embargo_orders_suggested_promoter", "suggested_promoter_id"),
        Index("idx_embargo_orders_tax_status", "detected_tax_id", "status"),
        Index("idx_embargo_orders_created", "created_at"),
    )


# ============================================================================
# SIMULACIONES (Contratación) — viabilidad / potencial de conciertos y giras.
# Una Simulación tiene N actividades (1 si es concierto, varias si es gira).
# Cada actividad lleva su ticketing, ingresos, cachés, comisiones y producción.
# Los socios (% que suman 100) viven a nivel de simulación.
# ============================================================================

class AppEvent(Base):
    """Evento (base de datos propia, sección Bases de datos → Eventos).

    Funciona como un "artista" en Simulaciones (una simulación puede ser de un
    artista O de un evento), pero NO aparece en las búsquedas de artistas: solo
    en las de eventos. Se crea con nombre y, opcionalmente, logo.
    """
    __tablename__ = "app_events"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    logo_url = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Simulation(Base):
    """Simulación económica de un concierto o de una gira."""
    __tablename__ = "simulations"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    # Sujeto: un ARTISTA o un EVENTO (uno de los dos).
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=True, index=True)
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("app_events.id", ondelete="CASCADE"), nullable=True, index=True)
    managing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"), index=True)
    kind = Column(Text, nullable=False, server_default=text("'CONCERT'"))   # CONCERT | TOUR | CYCLE | FESTIVAL
    title = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'DRAFT'"))   # DRAFT | ACTIVE | ARCHIVED
    notes = Column(Text)
    poster_url = Column(Text)   # cartel/logo del ciclo o festival (subido)
    public_token = Column(Text, unique=True)   # enlace público de solo lectura (compartir)
    settings = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")
    event = relationship("AppEvent")
    managing_company = relationship("GroupCompany")
    activities = relationship(
        "SimulationActivity", back_populates="simulation",
        cascade="all, delete-orphan", order_by="SimulationActivity.sort_order",
    )
    partners = relationship(
        "SimulationPartner", back_populates="simulation",
        cascade="all, delete-orphan", order_by="SimulationPartner.sort_order",
    )
    lineup = relationship(
        "SimulationArtist", back_populates="simulation",
        cascade="all, delete-orphan", order_by="SimulationArtist.sort_order",
    )


class SimulationActivity(Base):
    """Una fecha / concierto dentro de una simulación (1 en concierto, N en gira)."""
    __tablename__ = "simulation_activities"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    simulation_id = Column(PGUUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    label = Column(Text)
    event_date = Column(Date)
    date_unknown = Column(Boolean, nullable=False, server_default=text("false"))
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"), index=True)
    venue_unknown = Column(Boolean, nullable=False, server_default=text("false"))
    # Ciclo: cada concierto tiene su artista. Festival: el evento no lleva artista (van en el lineup).
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"), index=True)
    # Contenedor de "gastos generales" (compartidos del ciclo/festival): is_shared=True, sin ticketing.
    is_shared = Column(Boolean, nullable=False, server_default=text("false"))
    settings = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    simulation = relationship("Simulation", back_populates="activities")
    venue = relationship("Venue")
    artist = relationship("Artist", foreign_keys=[artist_id])
    ticket_categories = relationship(
        "SimulationTicketCategory", back_populates="activity",
        cascade="all, delete-orphan", order_by="SimulationTicketCategory.sort_order",
    )
    income_items = relationship(
        "SimulationIncomeItem", back_populates="activity",
        cascade="all, delete-orphan", order_by="SimulationIncomeItem.sort_order",
    )
    caches = relationship(
        "SimulationCache", back_populates="activity",
        cascade="all, delete-orphan", order_by="SimulationCache.sort_order",
    )
    commissions = relationship(
        "SimulationCommission", back_populates="activity",
        cascade="all, delete-orphan", order_by="SimulationCommission.sort_order",
    )
    production_items = relationship(
        "SimulationProductionItem", back_populates="activity",
        cascade="all, delete-orphan", order_by="SimulationProductionItem.sort_order",
    )


class SimulationPartner(Base):
    """Socio de la simulación (empresa del grupo o tercero). Los % suman 100.

    activity_id NULL = socio COMÚN de toda la simulación. Con activity_id = reparto
    PROPIO de esa fecha (giras/ciclos con socios distintos por fecha): si una fecha
    tiene filas propias, estas sustituyen a las comunes para esa fecha.
    """
    __tablename__ = "simulation_partners"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    simulation_id = Column(PGUUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=True, index=True)
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"), index=True)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"), index=True)
    name = Column(Text)  # etiqueta/snapshot (socio sin ficha o para preservar el nombre)
    pct = Column(Numeric, nullable=False, server_default=text("0"))
    # No soporta pérdidas: participa del beneficio pero no asume riesgo; su parte de gasto se
    # reparte entre el resto de socios proporcionalmente a su %.
    no_loss = Column(Boolean, nullable=False, server_default=text("false"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    simulation = relationship("Simulation", back_populates="partners")
    company = relationship("GroupCompany")
    promoter = relationship("Promoter")


class SimulationArtist(Base):
    """Lineup de artistas de un festival/ciclo (los conciertos del ciclo también usan activity.artist_id)."""
    __tablename__ = "simulation_artists"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    simulation_id = Column(PGUUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, index=True)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    simulation = relationship("Simulation", back_populates="lineup")
    artist = relationship("Artist")


class SimulationTicketCategory(Base):
    """Categoría de entrada (precio sin IVA, incluye SGAE) en zona Pista/Grada."""
    __tablename__ = "simulation_ticket_categories"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    zone = Column(Text, nullable=False, server_default=text("'PISTA'"))   # PISTA | GRADA
    name = Column(Text, nullable=False, server_default=text("''"))
    price_net = Column(Numeric, nullable=False, server_default=text("0"))     # sin IVA, incluye SGAE
    quantity = Column(Integer, nullable=False, server_default=text("0"))      # aforo de la categoría
    invitations = Column(Integer, nullable=False, server_default=text("0"))   # invitaciones (no a la venta)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    activity = relationship("SimulationActivity", back_populates="ticket_categories")
    extras = relationship(
        "SimulationTicketExtra", back_populates="category",
        cascade="all, delete-orphan", order_by="SimulationTicketExtra.sort_order",
    )


class SimulationTicketExtra(Base):
    """Complemento de una categoría (p. ej. Early Access). IVA incluido, sin SGAE."""
    __tablename__ = "simulation_ticket_extras"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    category_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_ticket_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(Text, nullable=False, server_default=text("''"))
    amount_gross = Column(Numeric, nullable=False, server_default=text("0"))  # IVA incluido
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    category = relationship("SimulationTicketCategory", back_populates="extras")


class SimulationIncomeItem(Base):
    """Subvención o patrocinio (importe sin IVA). Varios por actividad."""
    __tablename__ = "simulation_income_items"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Text, nullable=False, server_default=text("'SUBVENCION'"))  # SUBVENCION | PATROCINIO
    name = Column(Text, nullable=False, server_default=text("''"))
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))    # sin IVA
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))    # ACTIVE | OMIT | NA
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    activity = relationship("SimulationActivity", back_populates="income_items")


class SimulationCache(Base):
    """Caché del artista: fijo o variable. Varios por actividad."""
    __tablename__ = "simulation_caches"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(Text)
    mode = Column(Text, nullable=False, server_default=text("'FIXED'"))    # FIXED | VARIABLE
    # Fijo
    amount = Column(Numeric, nullable=False, server_default=text("0"))
    includes_iva = Column(Boolean, nullable=False, server_default=text("false"))
    includes_retention = Column(Boolean, nullable=False, server_default=text("false"))
    retention_exempt = Column(Boolean, nullable=False, server_default=text("false"))
    # Variable
    var_type = Column(Text)              # PER_TICKET | PERCENT
    var_value = Column(Numeric, nullable=False, server_default=text("0"))
    var_threshold_type = Column(Text)    # TICKETS | AMOUNT | NONE
    var_threshold_value = Column(Numeric, nullable=False, server_default=text("0"))
    # Festival: artistas a los que aplica este caché (1 = de ese artista; varios = compartido a 1/N).
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    activity = relationship("SimulationActivity", back_populates="caches")


class SimulationCommission(Base):
    """Comisión de un comisionista (tercero): fija o variable."""
    __tablename__ = "simulation_commissions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"), index=True)
    # El comisionista también puede ser un MEDIO (o cualquier tercero); solo uno de los dos ids.
    media_outlet_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="SET NULL"), index=True)
    name = Column(Text)
    mode = Column(Text, nullable=False, server_default=text("'FIXED'"))    # FIXED | VARIABLE
    amount = Column(Numeric, nullable=False, server_default=text("0"))
    includes_iva = Column(Boolean, nullable=False, server_default=text("false"))
    includes_retention = Column(Boolean, nullable=False, server_default=text("false"))
    retention_exempt = Column(Boolean, nullable=False, server_default=text("false"))
    var_type = Column(Text)
    var_value = Column(Numeric, nullable=False, server_default=text("0"))
    var_threshold_type = Column(Text)
    var_threshold_value = Column(Numeric, nullable=False, server_default=text("0"))
    exempt_amount = Column(Numeric, nullable=False, server_default=text("0"))  # importe exento de comisiones
    # Festival: artistas a los que aplica esta comisión (varios = compartido a 1/N).
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    activity = relationship("SimulationActivity", back_populates="commissions")
    promoter = relationship("Promoter")
    media_outlet = relationship("MediaOutlet")


class SimulationProductionItem(Base):
    """Línea de gasto de producción (presupuesto). IVA por defecto 21%."""
    __tablename__ = "simulation_production_items"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("simulation_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(Text, nullable=False, server_default=text("'OTROS'"))   # claves de SIM_EXPENSE_CATEGORIES
    concept = Column(Text, nullable=False, server_default=text("''"))
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))    # importe (unitario si quantity>1); sin IVA (o con IVA si includes_iva)
    quantity = Column(Numeric, nullable=False, server_default=text("1"))      # cantidad (total = amount_net · quantity)
    iva_pct = Column(Numeric, nullable=False, server_default=text("21"))
    includes_iva = Column(Boolean, nullable=False, server_default=text("false"))  # el importe tecleado lleva el IVA dentro
    iva_exempt = Column(Boolean, nullable=False, server_default=text("false"))    # gasto exento de IVA
    # Variable (p. ej. alquiler de recinto variable; se configura como los cachés)
    is_variable = Column(Boolean, nullable=False, server_default=text("false"))
    var_type = Column(Text)              # PER_TICKET | PERCENT
    var_value = Column(Numeric, nullable=False, server_default=text("0"))
    var_threshold_type = Column(Text)
    var_threshold_value = Column(Numeric, nullable=False, server_default=text("0"))
    # Condicionante (gastos del recinto): el variable solo aplica si se venden MENOS de X entradas.
    cond_under_tickets = Column(Numeric)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    activity = relationship("SimulationActivity", back_populates="production_items")


# ----- Ticketing vinculado al RECINTO (plantilla que se autocarga en simulaciones) -----

class VenueTicketCategory(Base):
    """Plantilla de categorías por recinto (sin precio; se rellena en cada simulación)."""
    __tablename__ = "venue_ticket_categories"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    zone = Column(Text, nullable=False, server_default=text("'PISTA'"))
    name = Column(Text, nullable=False, server_default=text("''"))
    quantity = Column(Integer, nullable=False, server_default=text("0"))
    invitations = Column(Integer, nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    venue = relationship("Venue")
    extras = relationship(
        "VenueTicketExtra", back_populates="category",
        cascade="all, delete-orphan", order_by="VenueTicketExtra.sort_order",
    )


class VenueTicketExtra(Base):
    """Complemento de una categoría de la plantilla del recinto."""
    __tablename__ = "venue_ticket_extras"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    category_id = Column(PGUUID(as_uuid=True), ForeignKey("venue_ticket_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(Text, nullable=False, server_default=text("''"))
    amount_gross = Column(Numeric, nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    category = relationship("VenueTicketCategory", back_populates="extras")


class VenueSeatMap(Base):
    """Mapa de butacas del RECINTO (plantilla, pestaña Ticketing de la ficha). Un recinto puede
    tener varios («Formato 360», «Medio aforo»…); de momento la UI trabaja con el marcado
    `is_default`. `layout_json` es PARAMÉTRICO (secciones por parámetros: arco/rejilla/pista,
    numeración, elementos de pista…): NO guarda coordenadas por butaca — la geometría se deriva
    siempre de los parámetros (JS al pintar). `assignments_json` (reservado, se usa a partir del
    lote de categorías) guarda la asignación butaca→categoría por RANGOS comprimidos. `version`
    da bloqueo optimista: el guardado exige la versión leída y evita pisar la edición de otro."""
    __tablename__ = "venue_seat_maps"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(Text, nullable=False, server_default=text("'Principal'"))
    is_default = Column(Boolean, nullable=False, server_default=text("true"))
    layout_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    assignments_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    version = Column(Integer, nullable=False, server_default=text("0"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    venue = relationship("Venue")
    __table_args__ = (UniqueConstraint("venue_id", "name", name="uq_venue_seat_maps_venue_name"),)


# ----- Plantillas de GASTOS (vinculadas a artista, evento o recinto) -----

class ExpenseTemplate(Base):
    """Plantilla de gastos reutilizable en Simulaciones.

    Pertenece a un artista, un evento o un recinto (owner polimórfico). Se crea al
    guardar los gastos de una simulación («vincular gastos a…» con nombre) y se
    ofrece al abrir la pestaña de gastos de una simulación nueva.
    """
    __tablename__ = "expense_templates"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)   # ARTIST | EVENT | VENUE
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    name = Column(Text, nullable=False, server_default=text("''"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship(
        "ExpenseTemplateItem", back_populates="template",
        cascade="all, delete-orphan", order_by="ExpenseTemplateItem.sort_order",
    )

    __table_args__ = (
        Index("idx_expense_templates_owner", "owner_type", "owner_id"),
    )


class ExpenseTemplateItem(Base):
    """Línea de una plantilla de gastos (mismos campos que SimulationProductionItem)."""
    __tablename__ = "expense_template_items"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    template_id = Column(PGUUID(as_uuid=True), ForeignKey("expense_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(Text, nullable=False, server_default=text("'OTROS'"))
    concept = Column(Text, nullable=False, server_default=text("''"))
    amount_net = Column(Numeric, nullable=False, server_default=text("0"))
    quantity = Column(Numeric, nullable=False, server_default=text("1"))
    iva_pct = Column(Numeric, nullable=False, server_default=text("21"))
    includes_iva = Column(Boolean, nullable=False, server_default=text("false"))
    iva_exempt = Column(Boolean, nullable=False, server_default=text("false"))
    is_variable = Column(Boolean, nullable=False, server_default=text("false"))
    var_type = Column(Text)
    var_value = Column(Numeric, nullable=False, server_default=text("0"))
    var_threshold_type = Column(Text)
    var_threshold_value = Column(Numeric, nullable=False, server_default=text("0"))
    cond_under_tickets = Column(Numeric)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    template = relationship("ExpenseTemplate", back_populates="items")


class RepertoireTemplate(Base):
    """Plantilla de repertorio (setlist) reutilizable. Pertenece a un artista/evento/recinto."""
    __tablename__ = "repertoire_templates"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)   # ARTIST | EVENT | VENUE
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    name = Column(Text, nullable=False, server_default=text("''"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship(
        "RepertoireTemplateItem", back_populates="template",
        cascade="all, delete-orphan", order_by="RepertoireTemplateItem.sort_order",
    )

    __table_args__ = (
        Index("idx_repertoire_templates_owner", "owner_type", "owner_id"),
    )


class RepertoireTemplateItem(Base):
    """Línea de una plantilla de repertorio (una canción/tema, en orden)."""
    __tablename__ = "repertoire_template_items"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    template_id = Column(PGUUID(as_uuid=True), ForeignKey("repertoire_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False, server_default=text("''"))
    note = Column(Text)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    template = relationship("RepertoireTemplate", back_populates="items")


# ---------------------------------------------------------------------------
# Fotos / vídeos (galería transversal)
# ---------------------------------------------------------------------------
# Una foto/vídeo pertenece a un "owner" polimórfico (concierto o acción) y, de
# forma denormalizada, guarda el artista para poder agregarla en la ficha del
# artista. No lleva FK al owner (es polimórfico); sí al artista/fotógrafo/usuario.

class Photo(Base):
    """Fotografía o vídeo subido a un concierto/acción."""

    __tablename__ = "photos"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)  # CONCERT | ACTION
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))

    kind = Column(Text, nullable=False, server_default=text("'IMAGE'"))  # IMAGE | VIDEO
    title = Column(Text)
    file_name = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    mime_type = Column(Text)

    # Fotógrafo: un tercero (Promoter) o desconocido.
    photographer_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    photographer_unknown = Column(Boolean, nullable=False, server_default=text("false"))

    taken_date = Column(Date)  # fecha de la foto (no la de subida)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    # Descartada: se oculta de la vista por defecto pero no se borra (recuperable con un filtro).
    discarded = Column(Boolean, nullable=False, server_default=text("false"))

    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # subida al back office
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photos_owner", "owner_type", "owner_id", "sort_order"),
        Index("idx_photos_artist", "artist_id"),
    )


class PhotoAlbum(Base):
    """Álbum de fotos dentro de un concierto/acción (una foto puede estar en varios)."""

    __tablename__ = "photo_albums"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)  # CONCERT | ACTION
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))

    name = Column(Text, nullable=False)
    cover_photo_id = Column(PGUUID(as_uuid=True), ForeignKey("photos.id", ondelete="SET NULL"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photo_albums_owner", "owner_type", "owner_id", "sort_order"),
    )


class PhotoAlbumItem(Base):
    """Pertenencia de una foto a un álbum (N:M con orden propio por álbum)."""

    __tablename__ = "photo_album_items"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    album_id = Column(PGUUID(as_uuid=True), ForeignKey("photo_albums.id", ondelete="CASCADE"), nullable=False)
    photo_id = Column(PGUUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("album_id", "photo_id", name="uq_photo_album_items"),
        Index("idx_photo_album_items_album", "album_id", "sort_order"),
        Index("idx_photo_album_items_photo", "photo_id"),
    )


class PhotoNote(Base):
    """Nota asociada a una foto (con autor y fecha; patrón BagNote)."""

    __tablename__ = "photo_notes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    photo_id = Column(PGUUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    # TEAM (nota interna del equipo) | APPROVAL (dejada por un aprobador en el enlace público)
    source = Column(Text, nullable=False, server_default=text("'TEAM'"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_by_photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photo_notes_photo", "photo_id", "created_at"),
    )


class PhotoApprovalRequest(Base):
    """Una petición de aprobación (un lote de fotos enviado a uno o varios aprobadores)."""

    __tablename__ = "photo_approval_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    brand_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    photo_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    message = Column(Text)
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_nick = Column(Text)
    requested_by_photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photo_appr_req_owner", "owner_type", "owner_id"),
    )


class PhotoApprover(Base):
    """Cada persona a la que se le pide aprobar (con su enlace público propio)."""

    __tablename__ = "photo_approvers"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    request_id = Column(PGUUID(as_uuid=True), ForeignKey("photo_approval_requests.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    kind = Column(Text, nullable=False, server_default=text("'CUSTOM'"))  # ARTIST|ARTIST_MEMBER|PROMOTER|RESPONSIBLE|COLLABORATOR|CUSTOM
    name = Column(Text, nullable=False)
    role = Column(Text)
    email = Column(Text)
    photo_url = Column(Text)
    artist_id = Column(PGUUID(as_uuid=True))
    status = Column(Text, nullable=False, server_default=text("'PENDING'"))  # PENDING|SUBMITTED
    submitted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photo_approvers_request", "request_id"),
        Index("idx_photo_approvers_token", "token"),
    )


class PhotoApproval(Base):
    """Decisión de un aprobador sobre una foto concreta."""

    __tablename__ = "photo_approvals"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    approver_id = Column(PGUUID(as_uuid=True), ForeignKey("photo_approvers.id", ondelete="CASCADE"), nullable=False)
    photo_id = Column(PGUUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    decision = Column(Text, nullable=False, server_default=text("'PENDING'"))  # PENDING|APPROVED|REJECTED
    decided_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("approver_id", "photo_id", name="uq_photo_approvals"),
        Index("idx_photo_approvals_photo", "photo_id"),
        Index("idx_photo_approvals_approver", "approver_id"),
    )


class PhotoShare(Base):
    """Enlace público para compartir/descargar un conjunto de fotos (email/WhatsApp/SMS)."""

    __tablename__ = "photo_shares"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    token = Column(Text, nullable=False, unique=True)
    photo_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    brand_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    title = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_photo_shares_token", "token"),
    )


def ensure_fotos_schema():
    """Crea/actualiza las tablas de la galería de fotos (idempotente, sin Alembic)."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS photos (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
            kind text NOT NULL DEFAULT 'IMAGE',
            title text,
            file_name text NOT NULL,
            file_url text NOT NULL,
            mime_type text,
            photographer_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            photographer_unknown boolean NOT NULL DEFAULT false,
            taken_date date,
            sort_order integer NOT NULL DEFAULT 0,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "ALTER TABLE IF EXISTS photos ADD COLUMN IF NOT EXISTS discarded boolean NOT NULL DEFAULT false;",
        "CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_type, owner_id, sort_order);",
        "CREATE INDEX IF NOT EXISTS idx_photos_artist ON photos(artist_id);",
        """
        CREATE TABLE IF NOT EXISTS photo_albums (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
            name text NOT NULL,
            cover_photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
            sort_order integer NOT NULL DEFAULT 0,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_albums_owner ON photo_albums(owner_type, owner_id, sort_order);",
        """
        CREATE TABLE IF NOT EXISTS photo_album_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES photo_albums(id) ON DELETE CASCADE,
            photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            sort_order integer NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT uq_photo_album_items UNIQUE(album_id, photo_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_album_items_album ON photo_album_items(album_id, sort_order);",
        "CREATE INDEX IF NOT EXISTS idx_photo_album_items_photo ON photo_album_items(photo_id);",
        """
        CREATE TABLE IF NOT EXISTS photo_notes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            body text NOT NULL,
            source text NOT NULL DEFAULT 'TEAM',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_by_photo_url text,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_notes_photo ON photo_notes(photo_id, created_at);",
        """
        CREATE TABLE IF NOT EXISTS photo_approval_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            brand_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            photo_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            message text,
            status text NOT NULL DEFAULT 'ACTIVE',
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_nick text,
            requested_by_photo_url text,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_appr_req_owner ON photo_approval_requests(owner_type, owner_id);",
        """
        CREATE TABLE IF NOT EXISTS photo_approvers (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            request_id uuid NOT NULL REFERENCES photo_approval_requests(id) ON DELETE CASCADE,
            token text NOT NULL UNIQUE,
            kind text NOT NULL DEFAULT 'CUSTOM',
            name text NOT NULL,
            role text,
            email text,
            photo_url text,
            artist_id uuid,
            status text NOT NULL DEFAULT 'PENDING',
            submitted_at timestamptz,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_approvers_request ON photo_approvers(request_id);",
        "CREATE INDEX IF NOT EXISTS idx_photo_approvers_token ON photo_approvers(token);",
        """
        CREATE TABLE IF NOT EXISTS photo_approvals (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            approver_id uuid NOT NULL REFERENCES photo_approvers(id) ON DELETE CASCADE,
            photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            decision text NOT NULL DEFAULT 'PENDING',
            decided_at timestamptz,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT uq_photo_approvals UNIQUE(approver_id, photo_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_approvals_photo ON photo_approvals(photo_id);",
        "CREATE INDEX IF NOT EXISTS idx_photo_approvals_approver ON photo_approvals(approver_id);",
        """
        CREATE TABLE IF NOT EXISTS photo_shares (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            token text NOT NULL UNIQUE,
            photo_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            brand_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            title text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_photo_shares_token ON photo_shares(token);",
    ]
    _exec_ddl_statements(stmts, "fotos_schema")


def _exec_ddl_statements(stmts, label: str = "schema"):
    """Ejecuta DDL idempotente sentencia a sentencia.

    Evita que un fallo tardío haga rollback de cambios previos ya válidos
    (por ejemplo, un ``ALTER TABLE ... ADD COLUMN`` aplicado antes de una
    sentencia que referencia otra tabla todavía inexistente).
    """

    for idx, stmt in enumerate(stmts, start=1):
        s = (stmt or "").strip()
        if not s:
            continue
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(s)
        except Exception as exc:
            print(f"[schema:{label}] Aviso en sentencia {idx}: {exc}")


def ensure_simulations_schema():
    """Esquema de la función *Simulaciones* (Contratación) y banderas de catálogo.

    Idempotente. Por ahora añade banderas transversales:
      - ``artists.is_international`` (Nacional/Internacional).
      - ``venues.allows_bars`` (¿el recinto permite barras?).
    Las tablas de simulaciones y de ticketing del recinto se añaden por fases.
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        "ALTER TABLE IF EXISTS artists  ADD COLUMN IF NOT EXISTS is_international boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS venues   ADD COLUMN IF NOT EXISTS allows_bars     boolean NOT NULL DEFAULT false;",
        # Ciclo / Festival (multi-artista + costes compartidos).
        "ALTER TABLE IF EXISTS simulations           ADD COLUMN IF NOT EXISTS poster_url text;",
        "ALTER TABLE IF EXISTS simulation_activities ADD COLUMN IF NOT EXISTS artist_id uuid REFERENCES artists(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS simulation_activities ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS simulation_caches      ADD COLUMN IF NOT EXISTS artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS simulation_commissions ADD COLUMN IF NOT EXISTS artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS simulation_commissions ADD COLUMN IF NOT EXISTS media_outlet_id uuid REFERENCES media_outlets(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS idx_sim_activities_artist ON simulation_activities(artist_id);",
        # --- Eventos (Bases de datos → Eventos): sujeto alternativo de una simulación ---
        """
        CREATE TABLE IF NOT EXISTS app_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL,
            logo_url text,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "ALTER TABLE IF EXISTS simulations ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES app_events(id) ON DELETE CASCADE;",
        "ALTER TABLE IF EXISTS simulations ADD COLUMN IF NOT EXISTS public_token text;",
        "ALTER TABLE IF EXISTS simulations ALTER COLUMN artist_id DROP NOT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_simulations_event ON simulations(event_id);",
        # --- Socios por fecha (gira/ciclo): NULL = socio común de toda la simulación ---
        "ALTER TABLE IF EXISTS simulation_partners ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES simulation_activities(id) ON DELETE CASCADE;",
        "CREATE INDEX IF NOT EXISTS idx_sim_partners_activity ON simulation_partners(activity_id);",
        "ALTER TABLE IF EXISTS simulation_partners ADD COLUMN IF NOT EXISTS no_loss boolean NOT NULL DEFAULT false;",
        # --- Ingresos: omitir / no aplica ---
        "ALTER TABLE IF EXISTS simulation_income_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';",
        # --- Gastos: IVA configurable (rueda) y condicionante de venta mínima ---
        "ALTER TABLE IF EXISTS simulation_production_items ADD COLUMN IF NOT EXISTS includes_iva boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS simulation_production_items ADD COLUMN IF NOT EXISTS iva_exempt boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS simulation_production_items ADD COLUMN IF NOT EXISTS cond_under_tickets numeric;",
        "ALTER TABLE IF EXISTS simulation_production_items ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1;",
        "ALTER TABLE IF EXISTS expense_template_items      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1;",
        # --- Plantillas de gastos (artista / evento / recinto) ---
        """
        CREATE TABLE IF NOT EXISTS expense_templates (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            name text NOT NULL DEFAULT '',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_expense_templates_owner ON expense_templates(owner_type, owner_id);",
        """
        CREATE TABLE IF NOT EXISTS expense_template_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            template_id uuid NOT NULL REFERENCES expense_templates(id) ON DELETE CASCADE,
            category text NOT NULL DEFAULT 'OTROS',
            concept text NOT NULL DEFAULT '',
            amount_net numeric NOT NULL DEFAULT 0,
            quantity numeric NOT NULL DEFAULT 1,
            iva_pct numeric NOT NULL DEFAULT 21,
            includes_iva boolean NOT NULL DEFAULT false,
            iva_exempt boolean NOT NULL DEFAULT false,
            is_variable boolean NOT NULL DEFAULT false,
            var_type text,
            var_value numeric NOT NULL DEFAULT 0,
            var_threshold_type text,
            var_threshold_value numeric NOT NULL DEFAULT 0,
            cond_under_tickets numeric,
            sort_order integer NOT NULL DEFAULT 0
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_expense_template_items_tpl ON expense_template_items(template_id);",
        # --- Plantillas de repertorio (setlist) por artista/evento/recinto ---
        """
        CREATE TABLE IF NOT EXISTS repertoire_templates (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            name text NOT NULL DEFAULT '',
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_repertoire_templates_owner ON repertoire_templates(owner_type, owner_id);",
        """
        CREATE TABLE IF NOT EXISTS repertoire_template_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            template_id uuid NOT NULL REFERENCES repertoire_templates(id) ON DELETE CASCADE,
            title text NOT NULL DEFAULT '',
            note text,
            sort_order integer NOT NULL DEFAULT 0
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_repertoire_template_items_tpl ON repertoire_template_items(template_id);",
    ]
    _exec_ddl_statements(stmts, "simulations")


def ensure_artist_feature_schema():
    """Asegura que existan las tablas nuevas del apartado *Artistas*.

    En producción (p. ej. Render + gunicorn) no se ejecuta el bloque
    ``if __name__ == "__main__"`` y por tanto ``init_db()`` no se lanzaba.

    Aquí usamos DDL con ``IF NOT EXISTS`` para que sea:
    - idempotente
    - seguro ante múltiples workers arrancando a la vez

    Tablas:
    - artist_people
    - artist_contracts
    - artist_contract_commitments
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        # Personas asociadas al artista (útil para grupos)
        """
        CREATE TABLE IF NOT EXISTS artist_people (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            first_name text NOT NULL,
            last_name text NOT NULL DEFAULT '',
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_artist_people_artist_id ON artist_people(artist_id);',

        # Contratos a nivel artista
        """
        CREATE TABLE IF NOT EXISTS artist_contracts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            name text NOT NULL,
            signed_date date,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_artist_contracts_artist_id ON artist_contracts(artist_id);',

        # Líneas/compromisos de cada contrato
        """
        CREATE TABLE IF NOT EXISTS artist_contract_commitments (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            contract_id uuid NOT NULL REFERENCES artist_contracts(id) ON DELETE CASCADE,
            concept text NOT NULL,
            pct_artist numeric NOT NULL DEFAULT 0,
            pct_office numeric NOT NULL DEFAULT 0,
            base text NOT NULL DEFAULT 'GROSS',
            profit_scope text,
            created_at timestamptz DEFAULT now(),

            CONSTRAINT chk_acc_pct_artist CHECK (pct_artist >= 0 AND pct_artist <= 100),
            CONSTRAINT chk_acc_pct_office CHECK (pct_office >= 0 AND pct_office <= 100),
            CONSTRAINT chk_acc_base CHECK (base IN ('GROSS', 'NET', 'PROFIT')),
            CONSTRAINT chk_acc_profit_scope CHECK (
                profit_scope IS NULL
                OR profit_scope IN ('CONCEPT_ONLY', 'CONCEPT_PLUS_GENERAL')
            )
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_artist_contract_commitments_contract_id ON artist_contract_commitments(contract_id);',

        """
        ALTER TABLE IF EXISTS artists
            ADD COLUMN IF NOT EXISTS email text;
        """,
        # Grupo vs individual + fecha de nacimiento (para cumpleaños en la agenda).
        "ALTER TABLE IF EXISTS artists ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS artists ADD COLUMN IF NOT EXISTS birth_date date;",
        "ALTER TABLE IF EXISTS artist_people ADD COLUMN IF NOT EXISTS birth_date date;",
        # Entradas libres de la agenda del artista (bloqueos / notas).
        """
        CREATE TABLE IF NOT EXISTS artist_agenda_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            kind text NOT NULL DEFAULT 'NOTE',
            title text NOT NULL DEFAULT '',
            note text,
            start_date date NOT NULL,
            end_date date NOT NULL,
            created_by_user_id uuid,
            created_by_nick text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_artist_agenda_items_artist_dates ON artist_agenda_items(artist_id, start_date, end_date);',
        """
        CREATE TABLE IF NOT EXISTS artist_emails (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            concept text NOT NULL,
            email text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_artist_emails_artist_id ON artist_emails(artist_id);',
    ]

    _exec_ddl_statements(stmts, "artist_feature")



def ensure_discografica_schema():
    """Asegura columnas nuevas en `songs` para la pestaña Discográfica.

    IMPORTANTE:
    - En producción (Render/Gunicorn) no debemos ejecutar ALTERs innecesarios en cada arranque,
      porque pueden bloquear `songs` y disparar `statement_timeout`.
    - Por eso aquí solo alteramos si realmente faltan columnas.
    - Los índices se dejan a migraciones (o a mantenimiento manual), no al arranque.
    """

    required_cols = {
        "is_catalog": "boolean NOT NULL DEFAULT false",
        "isrc": "text",
        "spotify_url": "text",
        "apple_music_url": "text",
        "amazon_music_url": "text",
        "tiktok_url": "text",
        "youtube_url": "text",
    }

    with engine.begin() as conn:
        # Evita esperas largas por locks en arranque
        try:
            conn.exec_driver_sql("SET LOCAL lock_timeout = '2s';")
        except Exception:
            pass

        conn.exec_driver_sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

        # Si la tabla no existe todavía, no hacemos nada más.
        exists = conn.exec_driver_sql(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name='songs' "
            "LIMIT 1;"
        ).fetchone()
        if not exists:
            return

        existing = {
            r[0]
            for r in conn.exec_driver_sql(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='songs';"
            ).fetchall()
        }

        missing = [c for c in required_cols.keys() if c not in existing]
        if not missing:
            return

        parts = [f"ADD COLUMN IF NOT EXISTS {c} {required_cols[c]}" for c in missing]
        stmt = "ALTER TABLE songs\n    " + ",\n    ".join(parts) + ";"
        conn.exec_driver_sql(stmt)


def ensure_song_delivery_schema():
    """Esquema de la entrega de masters (tabla + columnas nuevas).

    Robusto: cada statement va en su propia transacción para que, si uno falla
    (BD ocupada, etc.), no aborte los demás. Idempotente.
    """
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS song_master_delivery_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            token text NOT NULL UNIQUE,
            sections_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            materials_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            status text NOT NULL DEFAULT 'ACTIVE',
            data jsonb NOT NULL DEFAULT '{}'::jsonb,
            requested_by_user_id uuid,
            requested_by_nick text,
            target_name text,
            target_email text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            submitted_at timestamptz,
            cancelled_at timestamptz
        );
        """,
        "ALTER TABLE song_master_delivery_links ADD COLUMN IF NOT EXISTS materials_json jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "CREATE INDEX IF NOT EXISTS idx_song_master_delivery_song ON song_master_delivery_links(song_id, status);",
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'VALIDATED';",
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS delivery_link_id uuid;",
    ]
    for _s in stmts:
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(_s)
        except Exception as e:
            print(f"[schema] ensure_song_delivery_schema aviso: {e}")


def ensure_isrc_and_song_detail_schema():
    """Asegura el esquema necesario para:

    - Pestaña Discográfica > ISRC (config global + config por artista)
    - Ficha de canción (campos adicionales + barra de estados)
    - ISRCs múltiples (audio/video, principal/subproducto)

    Lo hacemos sin Alembic (DDL idempotente).
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        # Config global
        """
        CREATE TABLE IF NOT EXISTS isrc_config (
            id integer PRIMARY KEY DEFAULT 1,
            country_code text NOT NULL DEFAULT 'ES',
            audio_matrix text NOT NULL DEFAULT '270',
            video_matrix text NOT NULL DEFAULT '270',
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        INSERT INTO isrc_config (id)
        SELECT 1
        WHERE NOT EXISTS (SELECT 1 FROM isrc_config WHERE id = 1);
        """,

        # Config por artista
        """
        CREATE TABLE IF NOT EXISTS artist_isrc_settings (
            artist_id uuid PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
            artist_matrix text,
            updated_at timestamptz DEFAULT now()
        );
        """,

        # Intérpretes
        """
        CREATE TABLE IF NOT EXISTS song_interpreters (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            name text NOT NULL,
            is_main boolean NOT NULL DEFAULT false,
            created_at timestamptz DEFAULT now()
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_interpreters_song_id ON song_interpreters(song_id);
        """,

        # Backfill: crear al menos un intérprete "main" por canción existente si no hay ninguno.
        # (Tomamos un artista asociado; en esta app normalmente hay 1 artista por canción.)
        """
        INSERT INTO song_interpreters (song_id, name, is_main)
        SELECT DISTINCT ON (sa.song_id) sa.song_id, a.name, true
        FROM songs_artists sa
        JOIN artists a ON a.id = sa.artist_id
        WHERE NOT EXISTS (SELECT 1 FROM song_interpreters si WHERE si.song_id = sa.song_id)
        ORDER BY sa.song_id, a.name;
        """,

        # ISRCs por canción
        """
        CREATE TABLE IF NOT EXISTS song_isrc_codes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,
            kind text NOT NULL,
            code text NOT NULL,
            is_primary boolean NOT NULL DEFAULT true,
            subproduct_name text,
            year integer,
            sequence_num integer,
            created_at timestamptz DEFAULT now(),

            CONSTRAINT chk_song_isrc_kind CHECK (kind IN ('AUDIO', 'VIDEO'))
        );
        """,
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_song_isrc_code_code ON song_isrc_codes(code);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_isrc_codes_song_id ON song_isrc_codes(song_id);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_isrc_codes_artist_year ON song_isrc_codes(artist_id, year, sequence_num);
        """,
        # Único "primary" por canción y tipo
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_song_isrc_primary_per_kind
        ON song_isrc_codes(song_id, kind)
        WHERE is_primary = true;
        """,

        # Estados de ficha
        """
        CREATE TABLE IF NOT EXISTS song_status (
            song_id uuid PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
            cover_done boolean NOT NULL DEFAULT false,
            cover_updated_at timestamptz,
            materials_done boolean NOT NULL DEFAULT false,
            materials_updated_at timestamptz,
            production_contract_done boolean NOT NULL DEFAULT false,
            production_contract_updated_at timestamptz,
            collaboration_contract_done boolean NOT NULL DEFAULT false,
            collaboration_contract_updated_at timestamptz,
            agedi_done boolean NOT NULL DEFAULT false,
            agedi_updated_at timestamptz,
            agedi_registered_isrcs jsonb NOT NULL DEFAULT '[]'::jsonb,
            sgae_done boolean NOT NULL DEFAULT false,
            sgae_updated_at timestamptz,
            sgae_modification_pending boolean NOT NULL DEFAULT false,
            ritmonet_done boolean NOT NULL DEFAULT false,
            ritmonet_updated_at timestamptz,
            distributed_done boolean NOT NULL DEFAULT false,
            distributed_updated_at timestamptz,
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        ALTER TABLE IF EXISTS song_status
            ADD COLUMN IF NOT EXISTS agedi_registered_isrcs jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS sgae_modification_pending boolean NOT NULL DEFAULT false;
        """,
        """
        UPDATE song_status ss
           SET agedi_registered_isrcs = sub.codes
          FROM (
                SELECT s.id AS song_id,
                       COALESCE(
                           jsonb_agg(DISTINCT code_txt) FILTER (WHERE code_txt IS NOT NULL AND code_txt <> ''),
                           '[]'::jsonb
                       ) AS codes
                  FROM songs s
             LEFT JOIN LATERAL (
                        SELECT NULLIF(trim(sic.code), '') AS code_txt
                          FROM song_isrc_codes sic
                         WHERE sic.song_id = s.id
                        UNION ALL
                        SELECT NULLIF(trim(s.isrc), '') AS code_txt
                   ) src ON true
              GROUP BY s.id
          ) sub
         WHERE ss.song_id = sub.song_id
           AND ss.agedi_done = true
           AND COALESCE(jsonb_array_length(ss.agedi_registered_isrcs), 0) = 0
           AND COALESCE(jsonb_array_length(sub.codes), 0) > 0;
        """,

        # Campos extra en songs
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'songs'
            ) THEN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='version')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='duration_seconds')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='tiktok_start_seconds')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='recording_date')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='is_distribution')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='master_ownership_pct')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='bpm')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='genre')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='copyright_text')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='recording_engineer')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='mixing_engineer')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='mastering_engineer')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='studio')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='producers')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='arrangers')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='musicians')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='lyrics_text')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='lyrics_updated_at')
                THEN
                    ALTER TABLE songs
                        ADD COLUMN IF NOT EXISTS version text,
                        ADD COLUMN IF NOT EXISTS duration_seconds integer,
                        ADD COLUMN IF NOT EXISTS tiktok_start_seconds integer,
                        ADD COLUMN IF NOT EXISTS recording_date date,
                        ADD COLUMN IF NOT EXISTS is_distribution boolean NOT NULL DEFAULT false,
                        ADD COLUMN IF NOT EXISTS master_ownership_pct numeric NOT NULL DEFAULT 100,
                        ADD COLUMN IF NOT EXISTS bpm integer,
                        ADD COLUMN IF NOT EXISTS genre text,
                        ADD COLUMN IF NOT EXISTS copyright_text text,
                        ADD COLUMN IF NOT EXISTS recording_engineer text,
                        ADD COLUMN IF NOT EXISTS mixing_engineer text,
                        ADD COLUMN IF NOT EXISTS mastering_engineer text,
                        ADD COLUMN IF NOT EXISTS studio text,
                        ADD COLUMN IF NOT EXISTS producers jsonb,
                        ADD COLUMN IF NOT EXISTS arrangers jsonb,
                        ADD COLUMN IF NOT EXISTS musicians jsonb,
                        ADD COLUMN IF NOT EXISTS lyrics_text text,
                        ADD COLUMN IF NOT EXISTS lyrics_updated_at timestamptz;
                END IF;
            END IF;
        END$$;
        """,
        # Contenido explícito de la canción (se marca al subir la letra).
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS is_explicit boolean NOT NULL DEFAULT false;",
        # Colaboración externa (canción de otra compañía en la que participamos).
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS is_external_collab boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS external_company_id uuid REFERENCES promoters(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS our_pct numeric NOT NULL DEFAULT 0;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS our_pct_base text NOT NULL DEFAULT 'GROSS';",

        # Materiales de canción
        """
        CREATE TABLE IF NOT EXISTS song_materials (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            category text NOT NULL,
            slot_key text NOT NULL DEFAULT 'DEFAULT',
            bundle_key text,
            display_name text,
            file_name text NOT NULL,
            file_url text NOT NULL,
            mime_type text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_song_material_category CHECK (category IN ('COVER','MASTER','INSTRUMENTAL','TV_TRACK','STEMS'))
        );
        """,
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'VALIDATED';",
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS delivery_link_id uuid;",
        "ALTER TABLE IF EXISTS song_master_delivery_links ADD COLUMN IF NOT EXISTS materials_json jsonb NOT NULL DEFAULT '[]'::jsonb;",
        'CREATE INDEX IF NOT EXISTS idx_song_materials_song_id ON song_materials(song_id);',
        'CREATE INDEX IF NOT EXISTS idx_song_materials_song_category ON song_materials(song_id, category, slot_key);',

        # Contratos de producción de canción
        """
        CREATE TABLE IF NOT EXISTS song_production_contracts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            producer_name text NOT NULL,
            pdf_url text NOT NULL,
            original_name text,
            has_royalties boolean NOT NULL DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_song_production_contracts_song_id ON song_production_contracts(song_id);',
        'CREATE INDEX IF NOT EXISTS idx_song_production_contracts_song_producer ON song_production_contracts(song_id, producer_name);',

        # Certificaciones de canción
        """
        CREATE TABLE IF NOT EXISTS song_certifications (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            certification_type text NOT NULL,
            country_code text NOT NULL,
            country_name text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_song_certification_type CHECK (certification_type IN ('GOLD','PLATINUM','DIAMOND','URANIUM'))
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_song_certifications_song_id ON song_certifications(song_id);',
        'CREATE INDEX IF NOT EXISTS idx_song_certifications_group ON song_certifications(song_id, certification_type, country_code);',

        # Backfill: crear estado para canciones existentes si no existe
        """
        INSERT INTO song_status (song_id, cover_done, cover_updated_at, updated_at)
        SELECT s.id,
               (s.cover_url IS NOT NULL) AS cover_done,
               CASE WHEN s.cover_url IS NOT NULL THEN now() ELSE NULL END AS cover_updated_at,
               now() AS updated_at
        FROM songs s
        WHERE NOT EXISTS (SELECT 1 FROM song_status ss WHERE ss.song_id = s.id);
        """,
    ]

    _exec_ddl_statements(stmts, "song_detail")


def ensure_editorial_schema():
    """Asegura el esquema necesario para la pestaña Editorial (autores/compositores).

    Incluye:
    - publishing_companies
    - ampliación de campos en promoters
    - song_editorial_shares
    - declaración de obra (PDF) en songs
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        # Tabla de editoriales
        """
        CREATE TABLE IF NOT EXISTS publishing_companies (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL UNIQUE,
            logo_url text,
            created_at timestamptz DEFAULT now()
        );
        """,

        # Campos ampliados en terceros
        """
        ALTER TABLE IF EXISTS promoters
            ADD COLUMN IF NOT EXISTS first_name text,
            ADD COLUMN IF NOT EXISTS last_name text,
            ADD COLUMN IF NOT EXISTS tax_id text,
            ADD COLUMN IF NOT EXISTS contact_email text,
            ADD COLUMN IF NOT EXISTS contact_phone text,
            ADD COLUMN IF NOT EXISTS publishing_company_id uuid;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_schema='public'
                  AND table_name='promoters'
                  AND constraint_name='promoters_publishing_company_id_fkey'
            ) THEN
                ALTER TABLE promoters
                    ADD CONSTRAINT promoters_publishing_company_id_fkey
                    FOREIGN KEY (publishing_company_id)
                    REFERENCES publishing_companies(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """,

        # Tabla de shares editoriales por canción
        """
        CREATE TABLE IF NOT EXISTS song_editorial_shares (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE RESTRICT,
            role text NOT NULL,
            pct numeric NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_ses_pct CHECK (pct >= 0 AND pct <= 100),
            CONSTRAINT chk_ses_role CHECK (role IN ('AUTHOR','COMPOSER','AUTHOR_COMPOSER')),
            CONSTRAINT uq_song_editorial_share UNIQUE (song_id, promoter_id, role)
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_song_editorial_shares_song_id ON song_editorial_shares(song_id);',
        # Snapshot de la editorial por registro (la editorial del tercero puede cambiar
        # en el futuro sin afectar a registros ya guardados).
        'ALTER TABLE IF EXISTS song_editorial_shares ADD COLUMN IF NOT EXISTS publishing_company_id uuid;',
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='song_editorial_shares'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='song_editorial_shares'
                  AND constraint_name='song_editorial_shares_publishing_company_id_fkey'
            ) THEN
                ALTER TABLE song_editorial_shares
                    ADD CONSTRAINT song_editorial_shares_publishing_company_id_fkey
                    FOREIGN KEY (publishing_company_id)
                    REFERENCES publishing_companies(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema='public' AND table_name='song_editorial_shares'
            ) THEN
                ALTER TABLE song_editorial_shares DROP CONSTRAINT IF EXISTS chk_ses_role;
                ALTER TABLE song_editorial_shares
                    ADD CONSTRAINT chk_ses_role CHECK (role IN ('AUTHOR','COMPOSER','AUTHOR_COMPOSER'));
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """,

        # Declaración de obra en songs
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'songs'
            ) THEN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='work_declaration_url')
                   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='songs' AND column_name='work_declaration_uploaded_at')
                THEN
                    ALTER TABLE songs
                        ADD COLUMN IF NOT EXISTS work_declaration_url text,
                        ADD COLUMN IF NOT EXISTS work_declaration_uploaded_at timestamptz;
                END IF;
            END IF;
        END$$;
        """,
    ]

    _exec_ddl_statements(stmts, "editorial")


def ensure_song_royalties_schema():
    """Asegura el esquema necesario para la pestaña de Royalties por canción.

    - Ampliamos `promoters` (terceros) con datos fiscales y de contacto.
    - Creamos `song_royalty_beneficiaries` para guardar beneficiarios adicionales.

    Lo hacemos sin Alembic (DDL idempotente).
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        # Datos extra en terceros (promoters)
        """
        ALTER TABLE IF EXISTS promoters
            ADD COLUMN IF NOT EXISTS tax_id text,
            ADD COLUMN IF NOT EXISTS contact_email text,
            ADD COLUMN IF NOT EXISTS contact_phone text;
        """,
        """
        CREATE TABLE IF NOT EXISTS promoter_emails (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            concept text NOT NULL,
            email text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promoter_emails_promoter_id ON promoter_emails(promoter_id);',

        # Beneficiarios adicionales por canción
        """
        CREATE TABLE IF NOT EXISTS song_royalty_beneficiaries (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE RESTRICT,
            pct numeric NOT NULL DEFAULT 0,
            base text NOT NULL DEFAULT 'GROSS',
            profit_scope text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),

            CONSTRAINT chk_srb_pct CHECK (pct >= 0 AND pct <= 100),
            CONSTRAINT chk_srb_base CHECK (base IN ('GROSS','NET','PROFIT')),
            CONSTRAINT chk_srb_profit_scope CHECK (
                profit_scope IS NULL
                OR profit_scope IN ('CONCEPT_ONLY','CONCEPT_PLUS_GENERAL')
            ),
            CONSTRAINT uq_song_royalty_beneficiary UNIQUE (song_id, promoter_id)
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_royalty_beneficiaries_song_id
        ON song_royalty_beneficiaries(song_id);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_royalty_beneficiaries_promoter_id
        ON song_royalty_beneficiaries(promoter_id);
        """,
    ]

    _exec_ddl_statements(stmts, "song_royalties")


def ensure_ingresos_schema():
    """Asegura el esquema necesario para la pestaña de Ingresos (discográfica).

    - song_revenue_entries: ingresos por canción y periodo (mes/semestre)
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        """
        CREATE TABLE IF NOT EXISTS song_revenue_entries (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,

            period_type text NOT NULL,
            period_start date NOT NULL,
            period_end date NOT NULL,

            is_base boolean NOT NULL DEFAULT true,
            name text,

            gross numeric NOT NULL DEFAULT 0,
            net numeric NOT NULL DEFAULT 0,

            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),

            CONSTRAINT chk_song_revenue_period_type CHECK (period_type IN ('MONTH','SEMESTER'))
        );
        """,

        # Índice único: evita duplicar base y también evita nombres duplicados (por periodo)
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_song_revenue_entry_key
        ON song_revenue_entries(song_id, period_type, period_start, is_base, COALESCE(name,''));
        """,

        """
        CREATE INDEX IF NOT EXISTS idx_song_revenue_entries_song_period
        ON song_revenue_entries(song_id, period_type, period_start);
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_song_revenue_entries_period
        ON song_revenue_entries(period_type, period_start);
        """,
    ]

    _exec_ddl_statements(stmts, "ingresos")



def ensure_royalty_liquidations_schema():
    """Asegura el esquema necesario para la pestaña Royalties (liquidaciones por semestre)."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        """
        CREATE TABLE IF NOT EXISTS royalty_liquidations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

            beneficiary_kind text NOT NULL,
            beneficiary_id uuid NOT NULL,

            period_start date NOT NULL,
            period_end date NOT NULL,

            status text NOT NULL DEFAULT 'GENERATED',

            generated_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),

            CONSTRAINT chk_roy_liq_kind CHECK (beneficiary_kind IN ('ARTIST','PROMOTER')),
            CONSTRAINT chk_roy_liq_status CHECK (status IN ('GENERATED','SENT','INVOICED','PAID'))
        );
        """,

        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_royalty_liquidations_key
        ON royalty_liquidations(beneficiary_kind, beneficiary_id, period_start);
        """,

        """
        CREATE INDEX IF NOT EXISTS idx_royalty_liquidations_period
        ON royalty_liquidations(period_start);
        """,

        """
        CREATE INDEX IF NOT EXISTS idx_royalty_liquidations_beneficiary
        ON royalty_liquidations(beneficiary_kind, beneficiary_id);
        """,
        """
        ALTER TABLE IF EXISTS royalty_liquidations
            ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
            ADD COLUMN IF NOT EXISTS last_sent_to jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS last_sent_signature text,
            ADD COLUMN IF NOT EXISTS last_sent_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS last_sent_pdf_url text;
        """,
    ]

    _exec_ddl_statements(stmts, "royalty_liquidations")


def ensure_album_schema():
    """Asegura el esquema necesario para la nueva pestaña Repertorio > Álbumes."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS product_code_config (
            id integer PRIMARY KEY DEFAULT 1,
            prefix text NOT NULL DEFAULT 'REF',
            padding integer NOT NULL DEFAULT 5,
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        INSERT INTO product_code_config (id)
        SELECT 1
        WHERE NOT EXISTS (SELECT 1 FROM product_code_config WHERE id = 1);
        """,
        """
        ALTER TABLE IF EXISTS product_code_config
            ADD COLUMN IF NOT EXISTS prefix text NOT NULL DEFAULT 'REF',
            ADD COLUMN IF NOT EXISTS padding integer NOT NULL DEFAULT 5,
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        """,
        """
        CREATE TABLE IF NOT EXISTS product_code_series (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            prefix text NOT NULL DEFAULT 'REF',
            padding integer NOT NULL DEFAULT 5,
            starts_at timestamptz NOT NULL DEFAULT now(),
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_product_code_series_starts_at ON product_code_series(starts_at DESC);',
        """
        INSERT INTO product_code_series (prefix, padding, starts_at)
        SELECT
            COALESCE(NULLIF(trim(prefix), ''), 'REF'),
            COALESCE(NULLIF(padding, 0), 5),
            COALESCE(updated_at, now())
        FROM product_code_config
        WHERE NOT EXISTS (SELECT 1 FROM product_code_series);
        """,
        """
        CREATE TABLE IF NOT EXISTS albums (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,
            title text NOT NULL,
            album_type text NOT NULL DEFAULT 'ALBUM',
            release_date date NOT NULL,
            cover_url text,
            specifications text,
            copyright_text text,
            mastering_engineer text,
            edited_by text,
            distributed_by text,
            physical_cd boolean NOT NULL DEFAULT false,
            physical_vinyl boolean NOT NULL DEFAULT false,
            is_distribution boolean NOT NULL DEFAULT false,
            is_catalog boolean NOT NULL DEFAULT false,
            upc_code text,
            legal_deposit_code text,
            label_code text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_album_type CHECK (album_type IN ('ALBUM','EP'))
        );
        """,
        """
        ALTER TABLE IF EXISTS albums
            ADD COLUMN IF NOT EXISTS cover_url text,
            ADD COLUMN IF NOT EXISTS specifications text,
            ADD COLUMN IF NOT EXISTS copyright_text text,
            ADD COLUMN IF NOT EXISTS mastering_engineer text,
            ADD COLUMN IF NOT EXISTS edited_by text,
            ADD COLUMN IF NOT EXISTS distributed_by text,
            ADD COLUMN IF NOT EXISTS producers jsonb,
            ADD COLUMN IF NOT EXISTS physical_cd boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS physical_vinyl boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_distribution boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_catalog boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS upc_code text,
            ADD COLUMN IF NOT EXISTS legal_deposit_code text,
            ADD COLUMN IF NOT EXISTS label_code text,
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
            ADD COLUMN IF NOT EXISTS album_type text NOT NULL DEFAULT 'ALBUM';
        """,
        'CREATE INDEX IF NOT EXISTS idx_albums_artist_release ON albums(artist_id, release_date);',
        """
        CREATE TABLE IF NOT EXISTS album_product_codes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            series_id uuid REFERENCES product_code_series(id) ON DELETE SET NULL,
            format_kind text NOT NULL,
            other_label text,
            code text NOT NULL,
            generated_sequence integer,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_album_product_code_kind CHECK (format_kind IN ('CD','VINYL','CASSETTE','OTHER')),
            CONSTRAINT uq_album_product_code UNIQUE (code)
        );
        """,
        """
        ALTER TABLE IF EXISTS album_product_codes
            ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES product_code_series(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_product_codes_album_id ON album_product_codes(album_id);',
        'CREATE INDEX IF NOT EXISTS idx_album_product_codes_series_id ON album_product_codes(series_id);',
        """
        WITH current_series AS (
            SELECT id, prefix
            FROM product_code_series
            ORDER BY starts_at DESC, created_at DESC
            LIMIT 1
        )
        UPDATE album_product_codes apc
           SET series_id = cs.id
          FROM current_series cs
         WHERE apc.series_id IS NULL
           AND apc.generated_sequence IS NOT NULL
           AND upper(apc.code) LIKE upper(cs.prefix) || '%';
        """,
        """
        CREATE TABLE IF NOT EXISTS album_revenue_entries (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            period_type text NOT NULL,
            period_start date NOT NULL,
            period_end date NOT NULL,
            is_base boolean NOT NULL DEFAULT true,
            name text,
            gross numeric NOT NULL DEFAULT 0,
            net numeric NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_album_revenue_period_type CHECK (period_type IN ('MONTH','SEMESTER'))
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_revenue_entries_album_period ON album_revenue_entries(album_id, period_type, period_start);',
        'CREATE INDEX IF NOT EXISTS idx_album_revenue_entries_period ON album_revenue_entries(period_type, period_start);',
        """
        CREATE TABLE IF NOT EXISTS album_tracks (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            track_number integer NOT NULL,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT uq_album_track_song UNIQUE (album_id, song_id),
            CONSTRAINT uq_album_track_number UNIQUE (album_id, track_number)
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_tracks_album_id ON album_tracks(album_id);',
        """
        CREATE TABLE IF NOT EXISTS album_materials (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            category text NOT NULL,
            file_name text NOT NULL,
            file_url text NOT NULL,
            mime_type text,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT chk_album_material_category CHECK (category IN ('COVER','DDP','BODEGON','PHYSICAL_DESIGN'))
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_materials_album_id ON album_materials(album_id);',
        'CREATE INDEX IF NOT EXISTS idx_album_materials_category ON album_materials(category);',
        """
        CREATE TABLE IF NOT EXISTS album_status (
            album_id uuid PRIMARY KEY REFERENCES albums(id) ON DELETE CASCADE,
            cover_done boolean NOT NULL DEFAULT false,
            cover_updated_at timestamptz,
            materials_done boolean NOT NULL DEFAULT false,
            materials_updated_at timestamptz,
            production_contract_done boolean NOT NULL DEFAULT false,
            production_contract_updated_at timestamptz,
            agedi_done boolean NOT NULL DEFAULT false,
            agedi_updated_at timestamptz,
            distributed_done boolean NOT NULL DEFAULT false,
            distributed_updated_at timestamptz,
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        ALTER TABLE IF EXISTS album_status
            ADD COLUMN IF NOT EXISTS cover_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS cover_updated_at timestamptz,
            ADD COLUMN IF NOT EXISTS materials_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS materials_updated_at timestamptz,
            ADD COLUMN IF NOT EXISTS production_contract_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS production_contract_updated_at timestamptz,
            ADD COLUMN IF NOT EXISTS agedi_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS agedi_updated_at timestamptz,
            ADD COLUMN IF NOT EXISTS distributed_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS distributed_updated_at timestamptz,
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        """,
        """
        CREATE TABLE IF NOT EXISTS album_production_contracts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            producer_name text NOT NULL,
            pdf_url text NOT NULL,
            original_name text,
            has_royalties boolean NOT NULL DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_production_contracts_album_id ON album_production_contracts(album_id);',
        'CREATE INDEX IF NOT EXISTS idx_album_production_contracts_album_producer ON album_production_contracts(album_id, producer_name);',
        """
        INSERT INTO album_status (album_id, cover_done, cover_updated_at, updated_at)
        SELECT a.id,
               (a.cover_url IS NOT NULL AND btrim(a.cover_url) <> '') AS cover_done,
               CASE WHEN a.cover_url IS NOT NULL AND btrim(a.cover_url) <> '' THEN now() ELSE NULL END,
               now()
        FROM albums a
        WHERE NOT EXISTS (SELECT 1 FROM album_status ast WHERE ast.album_id = a.id);
        """,
        """
        CREATE TABLE IF NOT EXISTS album_certifications (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            certification_type text NOT NULL,
            country_code text NOT NULL,
            country_name text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_album_certification_type CHECK (certification_type IN ('GOLD','PLATINUM','DIAMOND','URANIUM'))
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_certifications_album_id ON album_certifications(album_id);',
        'CREATE INDEX IF NOT EXISTS idx_album_certifications_group ON album_certifications(album_id, certification_type, country_code);',

        """
        CREATE TABLE IF NOT EXISTS album_royalty_beneficiaries (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE RESTRICT,
            pct numeric NOT NULL DEFAULT 0,
            base text NOT NULL DEFAULT 'GROSS',
            profit_scope text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_arb_pct CHECK (pct >= 0 AND pct <= 100),
            CONSTRAINT chk_arb_base CHECK (base IN ('GROSS','NET','PROFIT')),
            CONSTRAINT chk_arb_profit_scope CHECK (
                profit_scope IS NULL
                OR profit_scope IN ('CONCEPT_ONLY','CONCEPT_PLUS_GENERAL')
            ),
            CONSTRAINT uq_album_royalty_beneficiary UNIQUE (album_id, promoter_id)
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_album_royalty_beneficiaries_album_id ON album_royalty_beneficiaries(album_id);',
        'CREATE INDEX IF NOT EXISTS idx_album_royalty_beneficiaries_promoter_id ON album_royalty_beneficiaries(promoter_id);',
    ]

    _exec_ddl_statements(stmts, "album")


def ensure_concerts_schema_enhancements():
    """Asegura mejoras de conciertos sin Alembic."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        """
        ALTER TABLE IF EXISTS concerts
            ADD COLUMN IF NOT EXISTS hashtags jsonb NOT NULL DEFAULT '[]'::jsonb;
        """,

        """
        UPDATE concerts
           SET billing_company_id = COALESCE(billing_company_id, group_company_id)
         WHERE billing_company_id IS NULL
           AND group_company_id IS NOT NULL;
        """,

        """
        ALTER TABLE IF EXISTS artist_contract_commitments
            ADD COLUMN IF NOT EXISTS material_scope text NOT NULL DEFAULT 'ALL_MATERIALS';
        """,

        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                  FROM information_schema.table_constraints
                 WHERE table_schema='public'
                   AND table_name='concerts'
                   AND constraint_name='concerts_sale_type_check'
            ) THEN
                ALTER TABLE concerts DROP CONSTRAINT concerts_sale_type_check;
            END IF;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END $$;
        """,

        """
        ALTER TABLE IF EXISTS concerts
            ALTER COLUMN sale_start_date DROP NOT NULL;
        """,

        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                  FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='concerts'
            ) THEN
                BEGIN
                    ALTER TABLE concerts
                        ADD CONSTRAINT concerts_sale_type_check
                        CHECK (sale_type = ANY (ARRAY['EMPRESA'::text, 'VENDIDO'::text, 'PARTICIPADOS'::text, 'CADIZ'::text, 'GRATUITO'::text, 'GIRAS_COMPRADAS'::text]));
                EXCEPTION WHEN duplicate_object THEN
                    NULL;
                END;
            END IF;
        END $$;
        """,
    ]

    _exec_ddl_statements(stmts, "concerts")





def ensure_third_party_and_contract_sheet_schema():
    """Asegura sociedades/contactos de terceros y flujo de ficha de contratación."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        # Clasificación del tercero (empresa / institución) para vinculaciones.
        'ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS kind text;',
        # Redes sociales del tercero (fotógrafo…) para menciones.
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;",

        """
        CREATE TABLE IF NOT EXISTS promoter_companies (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            legal_name text NOT NULL,
            tax_id text,
            fiscal_address text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promoter_companies_promoter_id ON promoter_companies(promoter_id);',

        """
        CREATE TABLE IF NOT EXISTS promoter_contacts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            title text NOT NULL,
            first_name text NOT NULL,
            last_name text,
            email text,
            phone text,
            mobile text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promoter_contacts_promoter_id ON promoter_contacts(promoter_id);',
        'CREATE INDEX IF NOT EXISTS idx_promoter_contacts_title ON promoter_contacts(title);',

        """
        ALTER TABLE IF EXISTS concerts
            ALTER COLUMN venue_id DROP NOT NULL;
        """,
        """
        ALTER TABLE IF EXISTS concerts
            ADD COLUMN IF NOT EXISTS promoter_company_id uuid,
            ADD COLUMN IF NOT EXISTS no_capacity boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS sale_start_tbc boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS manual_venue_name text,
            ADD COLUMN IF NOT EXISTS manual_venue_address text,
            ADD COLUMN IF NOT EXISTS manual_municipality text,
            ADD COLUMN IF NOT EXISTS manual_province text,
            ADD COLUMN IF NOT EXISTS manual_postal_code text,
            ADD COLUMN IF NOT EXISTS show_time text,
            ADD COLUMN IF NOT EXISTS doors_time text,
            ADD COLUMN IF NOT EXISTS show_time_tbc boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS doors_time_tbc boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS invitations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS payment_terms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS announcement_date date,
            ADD COLUMN IF NOT EXISTS do_not_announce boolean NOT NULL DEFAULT false;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='concerts'
                  AND constraint_name='concerts_promoter_company_id_fkey'
            ) THEN
                ALTER TABLE concerts
                    ADD CONSTRAINT concerts_promoter_company_id_fkey
                    FOREIGN KEY (promoter_company_id)
                    REFERENCES promoter_companies(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_schema='public'
                  AND table_name='concerts'
                  AND constraint_name='concerts_status_check'
            ) THEN
                ALTER TABLE concerts DROP CONSTRAINT concerts_status_check;
            END IF;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema='public' AND table_name='concerts'
            ) THEN
                BEGIN
                    ALTER TABLE concerts
                        ADD CONSTRAINT concerts_status_check
                        CHECK (status = ANY (ARRAY['BORRADOR'::text, 'HABLADO'::text, 'RESERVADO'::text, 'CONFIRMADO'::text]));
                EXCEPTION WHEN duplicate_object THEN
                    NULL;
                END;
            END IF;
        END $$;
        """,

        """
        ALTER TABLE IF EXISTS concert_promoter_shares
            ADD COLUMN IF NOT EXISTS promoter_company_id uuid;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='concert_promoter_shares'
                  AND constraint_name='concert_promoter_shares_promoter_company_id_fkey'
            ) THEN
                ALTER TABLE concert_promoter_shares
                    ADD CONSTRAINT concert_promoter_shares_promoter_company_id_fkey
                    FOREIGN KEY (promoter_company_id)
                    REFERENCES promoter_companies(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        """
        ALTER TABLE IF EXISTS concert_zone_agents
            ADD COLUMN IF NOT EXISTS promoter_company_id uuid;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='concert_zone_agents'
                  AND constraint_name='concert_zone_agents_promoter_company_id_fkey'
            ) THEN
                ALTER TABLE concert_zone_agents
                    ADD CONSTRAINT concert_zone_agents_promoter_company_id_fkey
                    FOREIGN KEY (promoter_company_id)
                    REFERENCES promoter_companies(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """,

        """
        CREATE TABLE IF NOT EXISTS concert_contract_sheets (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
            public_token text NOT NULL UNIQUE,
            promoter_email text,
            status text NOT NULL DEFAULT 'REQUESTED',
            allow_resubmission boolean NOT NULL DEFAULT false,
            request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            data jsonb NOT NULL DEFAULT '{}'::jsonb,
            merge_log jsonb NOT NULL DEFAULT '[]'::jsonb,
            rejection_reason text,
            requested_at timestamptz DEFAULT now(),
            submitted_at timestamptz,
            reviewed_at timestamptz,
            accepted_at timestamptz,
            rejected_at timestamptz,
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_contract_sheets_status ON concert_contract_sheets(status);',
    ]

    _exec_ddl_statements(stmts, "third_party")

def ensure_concert_artwork_schema():
    """Asegura el esquema de cartelería de conciertos."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        """
        CREATE TABLE IF NOT EXISTS concert_artwork_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
            public_token text NOT NULL UNIQUE,
            handled_by text NOT NULL DEFAULT 'OURS',
            status text NOT NULL DEFAULT 'DRAFT',
            group_company_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            ticketer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            logo_notes text,
            ticketer_notes text,
            other_notes text,
            delivery_deadline date,
            event_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            needs_refresh boolean NOT NULL DEFAULT false,
            requested_at timestamptz,
            uploaded_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT chk_concert_artwork_handled_by CHECK (handled_by IN ('OURS', 'PROMOTER')),
            CONSTRAINT chk_concert_artwork_status CHECK (status IN ('DRAFT', 'PROMOTER', 'REQUESTED', 'UPLOADED'))
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_requests_status ON concert_artwork_requests(status);',
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_requests_concert_id ON concert_artwork_requests(concert_id);',

        """
        CREATE TABLE IF NOT EXISTS concert_artwork_assets (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artwork_request_id uuid NOT NULL REFERENCES concert_artwork_requests(id) ON DELETE CASCADE,
            format_label text NOT NULL,
            file_url text NOT NULL,
            original_name text,
            mime_type text,
            is_archived boolean NOT NULL DEFAULT false,
            archived_at timestamptz,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_assets_request_id ON concert_artwork_assets(artwork_request_id);',
        """
        ALTER TABLE IF EXISTS concert_artwork_assets
            ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS archived_at timestamptz,
            ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_assets_is_archived ON concert_artwork_assets(is_archived);',
    ]

    _exec_ddl_statements(stmts, "concert_artwork")




def ensure_personnel_and_operations_schema():
    """Crea tablas de Personal, Promoción y nuevas bases de datos operativas."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        # SEGURIDAD: borra cualquier contraseña en claro almacenada históricamente. Ya no se guardan
        # (gestión solo por hash + enlace de restablecimiento); este UPDATE limpia los valores viejos.
        'UPDATE user_security SET password_preview = NULL WHERE password_preview IS NOT NULL;',
        """
        ALTER TABLE IF EXISTS user_profiles
            ADD COLUMN IF NOT EXISTS assigned_artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS assigned_artist_ids_produccion jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS assigned_artist_ids_sello jsonb NOT NULL DEFAULT '[]'::jsonb;
        """,
        """
        UPDATE user_profiles
           SET departments = (
               SELECT COALESCE(jsonb_agg(CASE WHEN elem = '"Derechos"'::jsonb THEN '"Registros"'::jsonb ELSE elem END), '[]'::jsonb)
                 FROM jsonb_array_elements(COALESCE(user_profiles.departments, '[]'::jsonb)) AS elems(elem)
           )
         WHERE COALESCE(user_profiles.departments, '[]'::jsonb) ? 'Derechos';
        """,
        """
        CREATE TABLE IF NOT EXISTS promotion_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            source_type text NOT NULL,
            source_id uuid,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            subject_date date,
            objectives_notes text,
            budget_notes text,
            status text NOT NULL DEFAULT 'REQUESTED',
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_email text,
            requested_by_nick text,
            reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            reviewed_by_nick text,
            rejection_reason text,
            reviewed_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotion_requests_status_date ON promotion_requests(status, subject_date);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_requests_source ON promotion_requests(source_type, source_id);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_requests_requested_by ON promotion_requests(requested_by_user_id, created_at);',
        """
        CREATE TABLE IF NOT EXISTS production_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            activity_type text NOT NULL DEFAULT 'GENERAL',
            activity_title text,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            activity_date date,
            city text,
            province text,
            linked_type text,
            linked_id uuid,
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            status text NOT NULL DEFAULT 'REQUESTED',
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_email text,
            requested_by_nick text,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_production_requests_status_date ON production_requests(status, activity_date);',
        'CREATE INDEX IF NOT EXISTS idx_production_requests_bag ON production_requests(bag_id);',
        'CREATE INDEX IF NOT EXISTS idx_production_requests_linked ON production_requests(linked_type, linked_id);',
        """
        CREATE TABLE IF NOT EXISTS promotions (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            subject_type text NOT NULL,
            subject_id uuid,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            source_request_id uuid REFERENCES promotion_requests(id) ON DELETE SET NULL,
            company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            objectives_notes text,
            budget_notes text,
            target_date date,
            status text NOT NULL DEFAULT 'ACTIVE',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            archived_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotions_status_date ON promotions(status, target_date);',
        'CREATE INDEX IF NOT EXISTS idx_promotions_subject ON promotions(subject_type, subject_id);',
        'CREATE INDEX IF NOT EXISTS idx_promotions_company ON promotions(company_id, target_date);',
        """
        CREATE TABLE IF NOT EXISTS promotion_activities (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
            activity_date date NOT NULL,
            start_time text,
            end_time text,
            time_tbc boolean NOT NULL DEFAULT false,
            show_as_tbc boolean NOT NULL DEFAULT false,
            activity_kind text NOT NULL,
            subtype text,
            media_type text,
            media_id uuid REFERENCES media_outlets(id) ON DELETE SET NULL,
            media_contact_id uuid REFERENCES media_contacts(id) ON DELETE SET NULL,
            details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            task_description text,
            artist_performed boolean NOT NULL DEFAULT false,
            performed_song_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            has_fee boolean NOT NULL DEFAULT false,
            fee_amount numeric NOT NULL DEFAULT 0,
            covered_costs jsonb NOT NULL DEFAULT '[]'::jsonb,
            cost_note text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_promotion_date ON promotion_activities(promotion_id, activity_date);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_kind ON promotion_activities(activity_kind, activity_date);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_media ON promotion_activities(media_id, activity_date);',
        'ALTER TABLE IF EXISTS media_promotion_records ADD COLUMN IF NOT EXISTS promotion_id uuid;',
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='media_promotion_records'
                  AND constraint_name='media_promotion_records_promotion_id_fkey'
            ) THEN
                ALTER TABLE media_promotion_records
                    ADD CONSTRAINT media_promotion_records_promotion_id_fkey
                    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        'CREATE INDEX IF NOT EXISTS idx_media_promotion_records_promotion_id ON media_promotion_records(promotion_id);',
    ]
    _exec_ddl_statements(stmts, "personnel_operations_promotions")


def ensure_bag_expense_schema():
    """Asegura el esquema ampliado de bolsas y gastos administrativos."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        ALTER TABLE IF EXISTS workflow_bags
            ADD COLUMN IF NOT EXISTS artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS bag_type text NOT NULL DEFAULT 'GENERAL',
            ADD COLUMN IF NOT EXISTS linked_type text,
            ADD COLUMN IF NOT EXISTS linked_id uuid,
            ADD COLUMN IF NOT EXISTS linked_title text,
            ADD COLUMN IF NOT EXISTS linked_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS economic_indications text,
            ADD COLUMN IF NOT EXISTS liquidation_status text NOT NULL DEFAULT 'NO_INICIADA',
            ADD COLUMN IF NOT EXISTS closed_at timestamptz,
            ADD COLUMN IF NOT EXISTS closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS liquidation_requested_at timestamptz,
            ADD COLUMN IF NOT EXISTS liquidation_reviewed_at timestamptz,
            ADD COLUMN IF NOT EXISTS liquidation_paid_at timestamptz;
        """,
        """
        UPDATE workflow_bags
           SET artist_ids = CASE
                WHEN artist_id IS NULL THEN COALESCE(artist_ids, '[]'::jsonb)
                WHEN COALESCE(jsonb_array_length(artist_ids), 0) = 0 THEN jsonb_build_array(artist_id::text)
                ELSE artist_ids
           END
         WHERE artist_ids IS NULL OR COALESCE(jsonb_array_length(artist_ids), 0) = 0;
        """,
        'CREATE INDEX IF NOT EXISTS idx_workflow_bags_liquidation_status ON workflow_bags(liquidation_status, closed_at);',
        'CREATE INDEX IF NOT EXISTS idx_workflow_bags_linked ON workflow_bags(linked_type, linked_id);',
        """
        CREATE TABLE IF NOT EXISTS bag_notes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            bag_id uuid NOT NULL REFERENCES workflow_bags(id) ON DELETE CASCADE,
            note_type text NOT NULL DEFAULT 'GENERAL',
            body text NOT NULL,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_by_photo_url text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_notes_bag_type ON bag_notes(bag_id, note_type, created_at);',
        """
        CREATE TABLE IF NOT EXISTS bag_expenses (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            bag_id uuid NOT NULL REFERENCES workflow_bags(id) ON DELETE CASCADE,
            source_expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL,
            category text NOT NULL DEFAULT 'OTROS',
            sort_order integer NOT NULL DEFAULT 0,
            concept text,
            provider_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            provider_company_id uuid REFERENCES promoter_companies(id) ON DELETE SET NULL,
            provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ticket_establishment text,
            document_type text NOT NULL DEFAULT 'FACTURA',
            invoice_number text,
            issue_date date,
            amount_net numeric NOT NULL DEFAULT 0,
            amount_tax numeric NOT NULL DEFAULT 0,
            amount_gross numeric NOT NULL DEFAULT 0,
            retention_amount numeric NOT NULL DEFAULT 0,
            payment_status text NOT NULL DEFAULT 'NO_PAGADO',
            paid_amount numeric NOT NULL DEFAULT 0,
            payment_method text,
            covered_by text NOT NULL DEFAULT 'BOLSA',
            cover_detail text,
            split_info jsonb NOT NULL DEFAULT '[]'::jsonb,
            consolidation_status text NOT NULL DEFAULT 'PENDIENTE',
            no_invoice_reason text,
            no_invoice_rejection_reason text,
            attachment_url text,
            attachment_name text,
            attachment_mime text,
            rectification_url text,
            rectification_name text,
            rectification_mime text,
            replace_history jsonb NOT NULL DEFAULT '[]'::jsonb,
            immediate_payment_requested boolean NOT NULL DEFAULT false,
            immediate_payment_reason text,
            immediate_payment_amount_mode text,
            immediate_payment_percent numeric,
            immediate_payment_amount numeric,
            immediate_payment_send_receipt boolean NOT NULL DEFAULT false,
            immediate_payment_requested_at timestamptz,
            is_proration boolean NOT NULL DEFAULT false,
            proration_source_bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            proration_pending_snapshot numeric,
            status text NOT NULL DEFAULT 'ACTIVO',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_expenses_bag_category ON bag_expenses(bag_id, category, sort_order);',
        'CREATE INDEX IF NOT EXISTS idx_bag_expenses_consolidation ON bag_expenses(consolidation_status);',
        'CREATE INDEX IF NOT EXISTS idx_bag_expenses_payment ON bag_expenses(payment_status, immediate_payment_requested);',
        'CREATE INDEX IF NOT EXISTS idx_bag_expenses_provider ON bag_expenses(provider_id);',
        """
        ALTER TABLE IF EXISTS bag_expenses
            ADD COLUMN IF NOT EXISTS source_expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS provider_company_id uuid REFERENCES promoter_companies(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS ticket_establishment text,
            ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'FACTURA',
            ADD COLUMN IF NOT EXISTS invoice_number text,
            ADD COLUMN IF NOT EXISTS issue_date date,
            ADD COLUMN IF NOT EXISTS amount_net numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS amount_tax numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS amount_gross numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS retention_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'NO_PAGADO',
            ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payment_method text,
            ADD COLUMN IF NOT EXISTS covered_by text NOT NULL DEFAULT 'BOLSA',
            ADD COLUMN IF NOT EXISTS cover_detail text,
            ADD COLUMN IF NOT EXISTS split_info jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS consolidation_status text NOT NULL DEFAULT 'PENDIENTE',
            ADD COLUMN IF NOT EXISTS no_invoice_reason text,
            ADD COLUMN IF NOT EXISTS no_invoice_rejection_reason text,
            ADD COLUMN IF NOT EXISTS attachment_url text,
            ADD COLUMN IF NOT EXISTS attachment_name text,
            ADD COLUMN IF NOT EXISTS attachment_mime text,
            ADD COLUMN IF NOT EXISTS rectification_url text,
            ADD COLUMN IF NOT EXISTS rectification_name text,
            ADD COLUMN IF NOT EXISTS rectification_mime text,
            ADD COLUMN IF NOT EXISTS replace_history jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS immediate_payment_requested boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS immediate_payment_reason text,
            ADD COLUMN IF NOT EXISTS immediate_payment_amount_mode text,
            ADD COLUMN IF NOT EXISTS immediate_payment_percent numeric,
            ADD COLUMN IF NOT EXISTS immediate_payment_amount numeric,
            ADD COLUMN IF NOT EXISTS immediate_payment_send_receipt boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS immediate_payment_requested_at timestamptz,
            ADD COLUMN IF NOT EXISTS is_proration boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS proration_source_bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS proration_pending_snapshot numeric,
            ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVO',
            ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS created_by_nick text,
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        """,
        """
        CREATE TABLE IF NOT EXISTS bag_expense_notes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            expense_id uuid NOT NULL REFERENCES bag_expenses(id) ON DELETE CASCADE,
            body text NOT NULL,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_by_photo_url text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_expense_notes_expense ON bag_expense_notes(expense_id, created_at);',
        """
        CREATE TABLE IF NOT EXISTS bag_expense_alerts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            expense_id uuid NOT NULL REFERENCES bag_expenses(id) ON DELETE CASCADE,
            alert_date date NOT NULL,
            body text,
            is_done boolean NOT NULL DEFAULT false,
            done_at timestamptz,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_expense_alerts_due ON bag_expense_alerts(alert_date, is_done);',
        'CREATE INDEX IF NOT EXISTS idx_bag_expense_alerts_expense ON bag_expense_alerts(expense_id);',
        """
        CREATE TABLE IF NOT EXISTS bag_payment_interactions (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            expense_id uuid NOT NULL REFERENCES bag_expenses(id) ON DELETE CASCADE,
            kind text NOT NULL,
            description text,
            amount numeric,
            percent numeric,
            method text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_payment_interactions_expense ON bag_payment_interactions(expense_id, created_at);',
        'CREATE INDEX IF NOT EXISTS idx_bag_payment_interactions_kind ON bag_payment_interactions(kind, created_at);',
    ]
    _exec_ddl_statements(stmts, "bag_expenses")


def ensure_marketing_country_schema():
    """Asegura países de emisoras/medios y campos extendidos de Marketing."""
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        ALTER TABLE IF EXISTS radio_stations
            ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'ES',
            ADD COLUMN IF NOT EXISTS country_name text NOT NULL DEFAULT 'España';
        """,
        """
        UPDATE radio_stations
           SET country_code = COALESCE(NULLIF(country_code, ''), 'ES'),
               country_name = COALESCE(NULLIF(country_name, ''), 'España')
         WHERE country_code IS NULL OR country_code = '' OR country_name IS NULL OR country_name = '';
        """,
        """
        ALTER TABLE IF EXISTS media_outlets
            ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'ES',
            ADD COLUMN IF NOT EXISTS country_name text NOT NULL DEFAULT 'España';
        """,
        """
        UPDATE media_outlets
           SET country_code = COALESCE(NULLIF(country_code, ''), 'ES'),
               country_name = COALESCE(NULLIF(country_name, ''), 'España')
         WHERE country_code IS NULL OR country_code = '' OR country_name IS NULL OR country_name = '';
        """,
        """
        ALTER TABLE IF EXISTS promotion_requests
            ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'PLAN',
            ADD COLUMN IF NOT EXISTS action_types jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS budget_mode text NOT NULL DEFAULT 'REQUEST_BUDGET',
            ADD COLUMN IF NOT EXISTS budget_max numeric,
            ADD COLUMN IF NOT EXISTS budget_by_action jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS starts_on date,
            ADD COLUMN IF NOT EXISTS ends_on date,
            ADD COLUMN IF NOT EXISTS deadline_notes text;
        """,
        """
        ALTER TABLE IF EXISTS promotions
            ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'PLAN',
            ADD COLUMN IF NOT EXISTS action_types jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS budget_mode text NOT NULL DEFAULT 'REQUEST_BUDGET',
            ADD COLUMN IF NOT EXISTS budget_max numeric,
            ADD COLUMN IF NOT EXISTS budget_by_action jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS starts_on date,
            ADD COLUMN IF NOT EXISTS ends_on date,
            ADD COLUMN IF NOT EXISTS deadline_notes text;
        """,
        """
        ALTER TABLE IF EXISTS promotion_activities
            ADD COLUMN IF NOT EXISTS action_type text,
            ADD COLUMN IF NOT EXISTS exterior_subtype text,
            ADD COLUMN IF NOT EXISTS media_target_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'PERIODO',
            ADD COLUMN IF NOT EXISTS waves_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS provider_company_id uuid REFERENCES promoter_companies(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS budget_group_key text,
            ADD COLUMN IF NOT EXISTS amount_net numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS amount_tax numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS amount_gross numeric NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS allocation_mode text NOT NULL DEFAULT 'SOURCE',
            ADD COLUMN IF NOT EXISTS allocation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'FACTURA',
            ADD COLUMN IF NOT EXISTS invoice_number text,
            ADD COLUMN IF NOT EXISTS issue_date date,
            ADD COLUMN IF NOT EXISTS attachment_url text,
            ADD COLUMN IF NOT EXISTS attachment_name text,
            ADD COLUMN IF NOT EXISTS attachment_mime text,
            ADD COLUMN IF NOT EXISTS consolidation_status text NOT NULL DEFAULT 'PENDIENTE',
            ADD COLUMN IF NOT EXISTS no_invoice_reason text,
            ADD COLUMN IF NOT EXISTS immediate_payment_requested boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS immediate_payment_requested_at timestamptz,
            ADD COLUMN IF NOT EXISTS bag_expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_action_type ON promotion_activities(action_type, activity_date);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_bag_expense ON promotion_activities(bag_expense_id);',
        """
        UPDATE promotion_requests
           SET request_kind = COALESCE(NULLIF(request_kind, ''), 'PLAN'),
               budget_mode = COALESCE(NULLIF(budget_mode, ''), 'REQUEST_BUDGET')
         WHERE request_kind IS NULL OR request_kind = '' OR budget_mode IS NULL OR budget_mode = '';
        """,
        """
        UPDATE promotions
           SET request_kind = COALESCE(NULLIF(request_kind, ''), 'PLAN'),
               budget_mode = COALESCE(NULLIF(budget_mode, ''), 'REQUEST_BUDGET')
         WHERE request_kind IS NULL OR request_kind = '' OR budget_mode IS NULL OR budget_mode = '';
        """,
    ]
    _exec_ddl_statements(stmts, "marketing_country")



def ensure_actions_contracting_admin_schema():
    """Asegura acciones, presupuesto de actividades y recursos de acceso nuevos."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS production_payload jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS contract_form_payload jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS production_status text;",
        "ALTER TABLE IF EXISTS workflow_bags ADD COLUMN IF NOT EXISTS liquidation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS workflow_bags ADD COLUMN IF NOT EXISTS liquidation_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS workflow_bags ADD COLUMN IF NOT EXISTS closed_liquidation_pdf_url text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS admin_review_status text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS admin_review_note text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS payment_receipt_url text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS payment_receipt_name text;",
        """
        CREATE TABLE IF NOT EXISTS concert_budget_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            category text NOT NULL DEFAULT 'OTROS',
            concept text NOT NULL,
            amount_net numeric NOT NULL DEFAULT 0,
            amount_gross numeric NOT NULL DEFAULT 0,
            sort_order integer NOT NULL DEFAULT 0,
            status text NOT NULL DEFAULT 'ACTIVO',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_concert_budget_items_concert ON concert_budget_items(concert_id, category, sort_order);",
        "CREATE INDEX IF NOT EXISTS idx_concert_budget_items_status ON concert_budget_items(status);",
        """
        CREATE TABLE IF NOT EXISTS company_action_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            title text,
            action_type text NOT NULL DEFAULT 'EVENTO_PROMOCIONAL',
            content_subtype text,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            source_type text,
            source_id uuid,
            requested_date date,
            due_date date,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            status text NOT NULL DEFAULT 'REQUESTED',
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_nick text,
            reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            reviewed_by_nick text,
            rejection_reason text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_company_action_requests_status_date ON company_action_requests(status, requested_date, due_date);",
        "CREATE INDEX IF NOT EXISTS idx_company_action_requests_source ON company_action_requests(source_type, source_id);",
        """
        CREATE TABLE IF NOT EXISTS company_actions (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            title text NOT NULL,
            action_type text NOT NULL DEFAULT 'EVENTO_PROMOCIONAL',
            content_subtype text,
            status text NOT NULL DEFAULT 'RESERVA',
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            linked_content jsonb NOT NULL DEFAULT '[]'::jsonb,
            media_type text,
            media_id uuid REFERENCES media_outlets(id) ON DELETE SET NULL,
            venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
            start_date date,
            end_date date,
            start_time text,
            end_time text,
            time_tbc boolean NOT NULL DEFAULT false,
            location_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            events_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            artist_tasks jsonb NOT NULL DEFAULT '{}'::jsonb,
            repertoire_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            formation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            has_fee boolean NOT NULL DEFAULT false,
            fee_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            promoter_costs_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            announcement_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            source_request_id uuid REFERENCES company_action_requests(id) ON DELETE SET NULL,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            archived_at timestamptz,
            closed_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_company_actions_status_date ON company_actions(status, start_date);",
        "CREATE INDEX IF NOT EXISTS idx_company_actions_type_date ON company_actions(action_type, start_date);",
        "CREATE INDEX IF NOT EXISTS idx_company_actions_venue ON company_actions(venue_id, start_date);",
        "CREATE INDEX IF NOT EXISTS idx_company_actions_bag ON company_actions(bag_id);",
        """
        INSERT INTO user_access_resources(key, parent_key, section_key, label, level, economic_capable, sort_order)
        VALUES
            ('acciones', NULL, 'acciones', 'Acciones', 'SECTION', true, 92),
            ('acciones.inicio', 'acciones', 'acciones', 'Inicio', 'TAB', true, 93),
            ('acciones.activas', 'acciones', 'acciones', 'Acciones activas', 'TAB', true, 94),
            ('acciones.archivadas', 'acciones', 'acciones', 'Acciones archivadas', 'TAB', true, 95),
            ('acciones.solicitudes', 'acciones', 'acciones', 'Solicitudes', 'TAB', true, 96)
        ON CONFLICT (key) DO UPDATE SET
            parent_key = EXCLUDED.parent_key,
            section_key = EXCLUDED.section_key,
            label = EXCLUDED.label,
            level = EXCLUDED.level,
            economic_capable = EXCLUDED.economic_capable,
            sort_order = EXCLUDED.sort_order,
            updated_at = now();
        """,
    ]
    _exec_ddl_statements(stmts, "actions_contracting_admin")

def init_db():
    Base.metadata.create_all(bind=engine)


def ensure_contracting_embargo_schema():
    """Migración defensiva para Contratación, PDFs de embargos y enlaces de álbum."""
    _exec_ddl_statements([
        "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"",
        "ALTER TABLE venues ADD COLUMN IF NOT EXISTS photo_url text",
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS spotify_url text",
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS apple_music_url text",
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS amazon_music_url text",
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS tiktok_url text",
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS youtube_url text",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS artist_ids jsonb DEFAULT '[]'::jsonb",
        "UPDATE concerts SET artist_ids = jsonb_build_array(artist_id::text) WHERE (artist_ids IS NULL OR artist_ids = '[]'::jsonb) AND artist_id IS NOT NULL",
        "ALTER TABLE concerts ALTER COLUMN artist_ids SET DEFAULT '[]'::jsonb",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS activity_type text DEFAULT 'CONCIERTO'",
        "UPDATE concerts SET activity_type = 'FESTIVAL' WHERE activity_type IS NULL AND (upper(coalesce(sale_type,'')) = 'CADIZ' OR festival_name ILIKE '%festival%')",
        "UPDATE concerts SET activity_type = 'CONCIERTO' WHERE activity_type IS NULL",
        "ALTER TABLE concerts ALTER COLUMN activity_type SET DEFAULT 'CONCIERTO'",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS activity_subtype text",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS contracting_payload jsonb DEFAULT '{}'::jsonb",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS ticketing_payload jsonb DEFAULT '{}'::jsonb",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS equipment_payload jsonb DEFAULT '{}'::jsonb",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS promoter_costs_payload jsonb DEFAULT '{}'::jsonb",
        "ALTER TABLE concerts ADD COLUMN IF NOT EXISTS commission_payload jsonb DEFAULT '[]'::jsonb",
        "CREATE TABLE IF NOT EXISTS embargo_orders (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), order_type text NOT NULL DEFAULT 'EMBARGO', status text NOT NULL DEFAULT 'PENDIENTE', promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL, provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, detected_name text, detected_tax_id text, detected_text text, pdf_url text, pdf_name text, uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, uploaded_by_nick text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS detected_address text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS reference text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS diligence_number text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS order_date date",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS amount_total numeric",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS suggested_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS match_score numeric",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS match_label text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS related_embargo_id uuid REFERENCES embargo_orders(id) ON DELETE SET NULL",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS archived_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS archived_by_nick text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS archive_reason text",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS notified_at timestamptz",
        "ALTER TABLE embargo_orders ADD COLUMN IF NOT EXISTS notified_emails jsonb NOT NULL DEFAULT '[]'::jsonb",
        "CREATE INDEX IF NOT EXISTS idx_embargo_orders_type_status ON embargo_orders(order_type, status)",
        "CREATE INDEX IF NOT EXISTS idx_embargo_orders_promoter ON embargo_orders(promoter_id)",
        "CREATE INDEX IF NOT EXISTS idx_embargo_orders_suggested_promoter ON embargo_orders(suggested_promoter_id)",
        "CREATE INDEX IF NOT EXISTS idx_embargo_orders_tax_status ON embargo_orders(detected_tax_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_embargo_orders_created ON embargo_orders(created_at)",
    ], "contracting_embargo_schema")

def ensure_radio_import_schema():
    """Tablas de alias para la importación de tocadas por Excel (emisora e ISRC)."""
    Base.metadata.create_all(bind=engine)
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS radio_station_aliases (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            alias text NOT NULL UNIQUE,
            station_id uuid NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_radio_station_aliases_station ON radio_station_aliases(station_id);",
        """
        CREATE TABLE IF NOT EXISTS radio_isrc_aliases (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            isrc text NOT NULL UNIQUE,
            song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_radio_isrc_aliases_song ON radio_isrc_aliases(song_id);",
    ], "radio_import_schema")


def ensure_entity_links_schema():
    """Asegura vinculaciones genéricas y campos extra de invitaciones."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS third_party_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            source_type text NOT NULL,
            source_id uuid NOT NULL,
            target_type text NOT NULL,
            target_id uuid NOT NULL,
            relation_title text,
            note text,
            is_active boolean NOT NULL DEFAULT true,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_third_party_links_direct UNIQUE(source_type, source_id, target_type, target_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_third_party_links_source ON third_party_links(source_type, source_id, is_active);",
        "CREATE INDEX IF NOT EXISTS idx_third_party_links_target ON third_party_links(target_type, target_id, is_active);",
        "ALTER TABLE IF EXISTS invitation_requests ADD COLUMN IF NOT EXISTS guest_title text;",
        "ALTER TABLE IF EXISTS invitation_requests ADD COLUMN IF NOT EXISTS guest_link_summary jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS invitation_requests ADD COLUMN IF NOT EXISTS created_by_user_id uuid;",
        "ALTER TABLE IF EXISTS invitation_requests ADD COLUMN IF NOT EXISTS created_by_nick text;",
        """
        CREATE TABLE IF NOT EXISTS invitation_guest_list_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            token text NOT NULL UNIQUE,
            list_type text NOT NULL DEFAULT 'COMPLETE',
            status text NOT NULL DEFAULT 'ACTIVE',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            cancelled_at timestamptz,
            cancelled_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_guest_list_links_concert ON invitation_guest_list_links(concert_id, status, list_type);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_guest_list_links_token ON invitation_guest_list_links(token);",
    ]
    _exec_ddl_statements(stmts, "entity_links_schema")

def ensure_invitation_schema():
    """Asegura la funcionalidad completa de Invitaciones sin depender de Alembic."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS invitation_categories (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            name text NOT NULL,
            source text NOT NULL DEFAULT 'MANUAL',
            ticket_kind text NOT NULL DEFAULT 'PDF_UNNUMBERED',
            guest_list_mode text,
            qty_contract integer NOT NULL DEFAULT 0,
            qty_extra integer NOT NULL DEFAULT 0,
            sort_order integer NOT NULL DEFAULT 0,
            is_active boolean NOT NULL DEFAULT true,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_invitation_categories_concert_name UNIQUE(concert_id, name)
        );
        """,
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS ticket_kind text NOT NULL DEFAULT 'PDF_UNNUMBERED';",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS guest_list_mode text;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS numbering_mode text;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS qty_contract integer NOT NULL DEFAULT 0;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS qty_extra integer NOT NULL DEFAULT 0;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS requests_blocked boolean NOT NULL DEFAULT false;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS requests_over_quota_blocked boolean NOT NULL DEFAULT false;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS is_pmr boolean NOT NULL DEFAULT false;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS plan_share_json jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS sent_via text;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS sent_to text;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS reforwarded_at timestamptz;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS reforwarded_count integer NOT NULL DEFAULT 0;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS sent_via text;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS sent_to text;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS zone text;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS stairs_spec text;",
        "ALTER TABLE invitation_categories ADD COLUMN IF NOT EXISTS layout_json jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "CREATE INDEX IF NOT EXISTS idx_invitation_categories_concert ON invitation_categories(concert_id, is_active, sort_order);",
        """
        CREATE TABLE IF NOT EXISTS invitation_commitments (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            name text NOT NULL,
            reason text,
            quantities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            status text NOT NULL DEFAULT 'COMPROMETIDAS',
            note text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_commitments_concert ON invitation_commitments(concert_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_commitments_promoter ON invitation_commitments(promoter_id);",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_artist_id uuid REFERENCES artists(id) ON DELETE SET NULL;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_user_id uuid REFERENCES users(id) ON DELETE SET NULL;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_name text;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_email text;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS guest_phone text;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS delivery_token text;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS downloaded_count integer NOT NULL DEFAULT 0;",
        "ALTER TABLE invitation_commitments ADD COLUMN IF NOT EXISTS downloaded_categories_json jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "CREATE INDEX IF NOT EXISTS idx_invitation_commitments_token ON invitation_commitments(delivery_token);",
        """
        CREATE TABLE IF NOT EXISTS invitation_public_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            token text NOT NULL UNIQUE,
            target_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            target_name text,
            target_email text,
            target_phone text,
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_nick text,
            requested_by_email text,
            requested_by_photo_url text,
            limit_mode text NOT NULL DEFAULT 'NONE',
            total_limit integer,
            category_limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            categories_enabled_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            categorize_requests boolean NOT NULL DEFAULT true,
            deadline_at timestamptz,
            status text NOT NULL DEFAULT 'ACTIVE',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            cancelled_at timestamptz,
            cancelled_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_public_links_concert ON invitation_public_links(concert_id, status, deadline_at);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_public_links_target ON invitation_public_links(target_promoter_id);",
        """
        ALTER TABLE IF EXISTS invitation_public_links
            ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS show_only_available boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS limit_to_available boolean NOT NULL DEFAULT false;
        """,
        """
        CREATE TABLE IF NOT EXISTS invitation_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            public_link_id uuid REFERENCES invitation_public_links(id) ON DELETE SET NULL,
            request_source text NOT NULL DEFAULT 'INTERNAL',
            requester_type text NOT NULL DEFAULT 'USER',
            requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requester_nick text,
            requester_email text,
            requester_photo_url text,
            guest_type text NOT NULL DEFAULT 'THIRD_PARTY',
            guest_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            guest_artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
            guest_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            guest_name text NOT NULL,
            guest_company text,
            guest_email text,
            guest_phone text,
            guest_note text,
            receiver_mode text NOT NULL DEFAULT 'GUEST',
            receiver_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            quantities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            status text NOT NULL DEFAULT 'SOLICITADAS',
            note text,
            delivery_token text UNIQUE,
            downloaded_at timestamptz,
            downloaded_count integer NOT NULL DEFAULT 0,
            approved_at timestamptz,
            assigned_at timestamptz,
            sent_at timestamptz,
            delivered_at timestamptz,
            rejected_at timestamptz,
            rejection_reason text,
            cancelled_at timestamptz,
            cancelled_by_label text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_requests_concert_status ON invitation_requests(concert_id, status, created_at);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_requests_public_link ON invitation_requests(public_link_id, created_at);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_requests_requester ON invitation_requests(requester_user_id, created_at);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_requests_delivery_token ON invitation_requests(delivery_token);",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS guest_title text;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS guest_link_summary jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS created_by_user_id uuid;",
        "ALTER TABLE invitation_requests ADD COLUMN IF NOT EXISTS created_by_nick text;",
        """
        CREATE TABLE IF NOT EXISTS invitation_tickets (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            category_id uuid NOT NULL REFERENCES invitation_categories(id) ON DELETE CASCADE,
            ticket_code text,
            pdf_url text NOT NULL,
            pdf_name text,
            pdf_sha256 text,
            is_numbered boolean NOT NULL DEFAULT false,
            sector text,
            row_label text,
            seat_number text,
            status text NOT NULL DEFAULT 'AVAILABLE',
            assigned_request_id uuid REFERENCES invitation_requests(id) ON DELETE SET NULL,
            assigned_commitment_id uuid REFERENCES invitation_commitments(id) ON DELETE SET NULL,
            assigned_label text,
            assigned_at timestamptz,
            sent_at timestamptz,
            delivered_at timestamptz,
            previous_assignment_warning text,
            uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            uploaded_by_nick text,
            uploaded_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_invitation_tickets_concert_code UNIQUE(concert_id, ticket_code)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_tickets_concert_category ON invitation_tickets(concert_id, category_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_tickets_assigned_request ON invitation_tickets(assigned_request_id);",
        "CREATE INDEX IF NOT EXISTS idx_invitation_tickets_sha ON invitation_tickets(pdf_sha256);",
        "ALTER TABLE invitation_tickets ALTER COLUMN category_id DROP NOT NULL;",
        "ALTER TABLE invitation_tickets ADD COLUMN IF NOT EXISTS printed_at timestamptz;",
        "ALTER TABLE invitation_tickets ADD COLUMN IF NOT EXISTS print_reason text;",
        "ALTER TABLE invitation_tickets ADD COLUMN IF NOT EXISTS companion_pdf_url text;",
        "ALTER TABLE invitation_tickets ADD COLUMN IF NOT EXISTS companion_pdf_name text;",
        """
        INSERT INTO user_access_resources(key, parent_key, section_key, label, level, economic_capable, sort_order)
        VALUES
          ('invitaciones', NULL, 'invitaciones', 'Invitaciones', 'SECTION', false, 97),
          ('invitaciones.pedir', 'invitaciones', 'invitaciones', 'Pedir invitaciones', 'TAB', false, 98),
          ('invitaciones.gestionar', 'invitaciones', 'invitaciones', 'Gestionar invitaciones', 'TAB', false, 99)
        ON CONFLICT (key) DO UPDATE SET
          parent_key = EXCLUDED.parent_key,
          section_key = EXCLUDED.section_key,
          label = EXCLUDED.label,
          level = EXCLUDED.level,
          economic_capable = EXCLUDED.economic_capable,
          sort_order = EXCLUDED.sort_order,
          updated_at = now();
        """,
        """
        CREATE TABLE IF NOT EXISTS invitation_manager_optins (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT uq_invitation_manager_optins_user_concert UNIQUE(user_id, concert_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invitation_manager_optins_user ON invitation_manager_optins(user_id);",
    ]
    _exec_ddl_statements(stmts, "invitation_schema")


def ensure_roadmap_onesheet_schema():
    """Asegura campos de hoja de ruta avanzada, redes sociales y one-sheets."""
    Base.metadata.create_all(bind=engine)
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        ALTER TABLE IF EXISTS artists
            ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS onesheet_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS onesheet_public_token text;
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_onesheet_public_token ON artists(onesheet_public_token) WHERE onesheet_public_token IS NOT NULL AND onesheet_public_token <> '';",
        """
        ALTER TABLE IF EXISTS concerts
            ADD COLUMN IF NOT EXISTS roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS roadmap_public_token text;
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_concerts_roadmap_public_token ON concerts(roadmap_public_token) WHERE roadmap_public_token IS NOT NULL AND roadmap_public_token <> '';",
        """
        ALTER TABLE IF EXISTS promotions
            ADD COLUMN IF NOT EXISTS roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS roadmap_public_token text;
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_roadmap_public_token ON promotions(roadmap_public_token) WHERE roadmap_public_token IS NOT NULL AND roadmap_public_token <> '';",
        """
        ALTER TABLE IF EXISTS company_actions
            ADD COLUMN IF NOT EXISTS roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS roadmap_public_token text;
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_company_actions_roadmap_public_token ON company_actions(roadmap_public_token) WHERE roadmap_public_token IS NOT NULL AND roadmap_public_token <> '';",
        """
        CREATE TABLE IF NOT EXISTS tour_onesheets (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            slug text NOT NULL UNIQUE,
            title text NOT NULL,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            cover_url text,
            background_color text NOT NULL DEFAULT '#ffffff',
            text_color text NOT NULL DEFAULT '#111111',
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            public_token text UNIQUE,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_tour_onesheets_slug ON tour_onesheets(slug);",
        "CREATE INDEX IF NOT EXISTS idx_tour_onesheets_token ON tour_onesheets(public_token);",
        """
        INSERT INTO user_access_resources(key, parent_key, section_key, label, level, economic_capable, sort_order)
        VALUES
          ('artists.onesheet', 'artists', 'artists', 'One-sheet', 'TAB', false, 24),
          ('contratacion.giras.onesheet', 'contratacion.giras', 'contratacion', 'One-sheet de giras', 'TAB', false, 68)
        ON CONFLICT (key) DO UPDATE SET
          parent_key = EXCLUDED.parent_key,
          section_key = EXCLUDED.section_key,
          label = EXCLUDED.label,
          level = EXCLUDED.level,
          economic_capable = EXCLUDED.economic_capable,
          sort_order = EXCLUDED.sort_order,
          updated_at = now();
        """,
    ]
    _exec_ddl_statements(stmts, "roadmap_onesheets")


def ensure_performance_indexes():
    """Crea índices en columnas de clave foránea que no los tengan (acelera JOINs/filtros).

    PostgreSQL NO indexa las claves foráneas automáticamente; sin estos índices, los
    listados que filtran por concert_id / song_id / bag_id / user_id, etc. recorren la
    tabla entera. Es idempotente (CREATE INDEX IF NOT EXISTS): solo crea los que faltan.
    """
    stmts = []
    for table in Base.metadata.tables.values():
        indexed_first = set()
        for idx in table.indexes:
            cols = list(idx.columns)
            if cols:
                indexed_first.add(cols[0].name)
        pk_cols = {c.name for c in table.primary_key.columns}
        for col in table.columns:
            if not col.foreign_keys:
                continue
            if col.name in indexed_first or col.name in pk_cols:
                continue
            ix_name = ("ix_%s_%s" % (table.name, col.name))[:63]
            stmts.append('CREATE INDEX IF NOT EXISTS "%s" ON "%s" ("%s");' % (ix_name, table.name, col.name))
    # Índice compuesto para el ranking de uso del menú (consulta por usuario + fecha).
    stmts.append('CREATE INDEX IF NOT EXISTS "ix_user_activity_logs_user_created" ON "user_activity_logs" ("user_id", "created_at");')
    _exec_ddl_statements(stmts, "performance_indexes")


# =========================================================
# Integración Chartmetric (métricas) — caché en BD
# Patrón: NO llamar a la API en cada carga (plan por uso, $0.01/llamada). Resolvemos una vez el
# Chartmetric ID (CMID) de cada artista y guardamos las métricas como series temporales; la web lee
# de estas tablas y un proceso en segundo plano las refresca.
# =========================================================
class ChartmetricArtist(Base):
    """Vínculo de un artista nuestro con su ficha en Chartmetric (CMID) + estado del refresco."""
    __tablename__ = "chartmetric_artist"
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True)
    chartmetric_id = Column(Text)
    chartmetric_name = Column(Text)        # nombre del artista en Chartmetric (para revisar el match)
    chartmetric_image_url = Column(Text)   # foto en Chartmetric (para comparar visualmente)
    match_source = Column(Text)            # spotify | name | manual
    status = Column(Text, nullable=False, server_default=text("'PENDING'"))  # PENDING|LINKED|NOT_FOUND|ERROR
    # URLs de redes/plataformas del artista tal como las da Chartmetric: {platform_key: url}
    # (instagram, tiktok, youtube, bandsintown, facebook, x, spotify, apple_music, amazon_music).
    social_urls = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_refreshed_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ChartmetricMetricPoint(Base):
    """Un punto de una serie temporal: (artista, plataforma, métrica, fecha) -> valor."""
    __tablename__ = "chartmetric_metric_point"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    source = Column(Text, nullable=False)   # spotify, instagram, tiktok, youtube_channel, facebook...
    field = Column(Text, nullable=False)    # followers, listeners, popularity...
    date = Column(Date, nullable=False)
    value = Column(Numeric)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("artist_id", "source", "field", "date", name="uq_cm_metric_point"),
        Index("idx_cm_metric_point_lookup", "artist_id", "source", "field", "date"),
    )


class ChartmetricTrackMetricPoint(Base):
    """Serie temporal por CANCIÓN: (canción, plataforma, métrica, fecha) -> valor.

    Se usa para las reproducciones de la cabecera de la ficha de canción (total acumulado + tendencia
    semanal). `field`: streams (Spotify) / views (YouTube). Apple/Amazon casi nunca traen dato."""
    __tablename__ = "chartmetric_track_metric_point"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    source = Column(Text, nullable=False)   # spotify, apple_music, amazon_music, youtube
    field = Column(Text, nullable=False)    # streams, views
    date = Column(Date, nullable=False)
    value = Column(Numeric)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("song_id", "source", "field", "date", name="uq_cm_track_metric_point"),
        Index("idx_cm_track_metric_point_lookup", "song_id", "source", "field", "date"),
    )


class ChartmetricPlaylistEntry(Base):
    """Pertenencia de una canción de un artista a una playlist (actual o pasada), por plataforma.

    Una fila = (artista, plataforma, canción, playlist). 'is_official' = la lista la cura la propia
    plataforma (owner/curator Spotify/Apple/Amazon o editorial=true). 'days_in_list' = días que lleva.
    """
    __tablename__ = "chartmetric_playlist_entry"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    platform = Column(Text, nullable=False)   # spotify, applemusic, amazon
    status = Column(Text, nullable=False, server_default=text("'current'"))  # current | past
    cm_track = Column(Text)                    # id de track en Chartmetric
    track_name = Column(Text)
    song_id = Column(PGUUID(as_uuid=True), ForeignKey("songs.id", ondelete="SET NULL"))  # nuestra canción
    playlist_id = Column(Text, nullable=False)
    playlist_name = Column(Text)
    owner_name = Column(Text)                  # curator/owner (p. ej. "Spotify")
    is_official = Column(Boolean, nullable=False, server_default=text("false"))
    position = Column(Integer)
    peak_position = Column(Integer)
    days_in_list = Column(Integer)             # 'period' de Chartmetric
    added_at = Column(Date)
    followers = Column(Numeric)                # oyentes/seguidores de la lista (puede faltar en editoriales)
    image_url = Column(Text)                    # portada de la PLAYLIST
    track_image_url = Column(Text)             # portada de la CANCIÓN (respaldo de Chartmetric si no hay Song enlazada)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("artist_id", "platform", "status", "playlist_id", "cm_track", name="uq_cm_playlist_entry"),
        Index("idx_cm_playlist_entry_artist", "artist_id", "platform", "status"),
        Index("idx_cm_playlist_entry_track", "cm_track", "platform", "status"),
    )


class ChartmetricMeta(Base):
    """Fila única (id=1) para coordinar el refresco diario automático entre procesos (workers)."""
    __tablename__ = "chartmetric_meta"
    id = Column(Integer, primary_key=True)
    last_auto_refresh = Column(Date)


def ensure_chartmetric_schema():
    """Crea/actualiza las tablas de caché de Chartmetric (idempotente). Inofensivo si no se usa."""
    Base.metadata.create_all(bind=engine)
    _exec_ddl_statements([
        "ALTER TABLE IF EXISTS chartmetric_artist ADD COLUMN IF NOT EXISTS chartmetric_name text;",
        "ALTER TABLE IF EXISTS chartmetric_artist ADD COLUMN IF NOT EXISTS chartmetric_image_url text;",
        "ALTER TABLE IF EXISTS chartmetric_artist ADD COLUMN IF NOT EXISTS match_source text;",
        "ALTER TABLE IF EXISTS chartmetric_artist ADD COLUMN IF NOT EXISTS social_urls jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS chartmetric_playlist_entry ADD COLUMN IF NOT EXISTS song_id uuid;",
        "ALTER TABLE IF EXISTS chartmetric_playlist_entry ADD COLUMN IF NOT EXISTS track_image_url text;",
        "INSERT INTO chartmetric_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;",
        # Chartmetric a nivel canción/álbum (enlaces automáticos + reproducciones).
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS cm_track text;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS cm_links_locked jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS cm_link_status text;",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS cm_refreshed_at timestamptz;",
        "ALTER TABLE IF EXISTS albums ADD COLUMN IF NOT EXISTS cm_track text;",
        "ALTER TABLE IF EXISTS albums ADD COLUMN IF NOT EXISTS cm_links_locked jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS albums ADD COLUMN IF NOT EXISTS cm_link_status text;",
    ], "chartmetric")


def ensure_venue_seatmap_schema():
    """Mapa de butacas por recinto (pestaña Ticketing de la ficha). Idempotente, sin Alembic."""
    Base.metadata.create_all(bind=engine)
    _exec_ddl_statements([
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS venue_seat_maps (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
            name text NOT NULL DEFAULT 'Principal',
            is_default boolean NOT NULL DEFAULT true,
            layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            assignments_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            version integer NOT NULL DEFAULT 0,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_venue_seat_maps_venue_name UNIQUE(venue_id, name)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_venue_seat_maps_venue ON venue_seat_maps(venue_id, is_default);",
    ], "venue_seatmap")

