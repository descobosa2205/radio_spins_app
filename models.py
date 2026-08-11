import os
import re
import time

from sqlalchemy import (
    create_engine,
    Column,
    Date,
    Text,
    Integer,
    BigInteger,
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
    # ESPEJO DE UN EVENTO. Las actividades (Concert) exigen un artista (artist_id NOT NULL) y un
    # EVENTO no lo tiene, así que al convertir una simulación de evento en actividades se crea (una
    # sola vez) este artista espejo con el nombre y el logo del evento. Se reconoce por `event_id` y
    # se deja FUERA del listado de artistas y de sus buscadores: el evento sigue viviendo en Bases de
    # datos → Eventos. Mismo patrón que el espejo medio→tercero (`_ensure_promoter_for_media`).
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("app_events.id", ondelete="CASCADE"),
                      unique=True, index=True)
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

    # LA PERSONA DE UN ARTISTA ES UN TERCERO que forma parte de él: aquí solo queda el vínculo y
    # todos sus datos personales (DNI/pasaporte/carnet, tarjetas de fidelización, matrículas,
    # necesidades de viaje, cuenta bancaria, dirección fiscal…) viven en su ficha de tercero
    # (`Promoter` + `PersonDocument`), que se edita desde la propia ficha del artista. Así el mismo
    # músico puede estar en dos grupos sin duplicar datos y, cuando factura, la búsqueda por DNI/CIF
    # de la subida de facturas lo encuentra.
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"), index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist", back_populates="people")
    promoter = relationship("Promoter")


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
    # Tipos de actividad que puede ver este enlace (claves de AGENDA_KIND_ORDER).
    # Lista VACÍA = todos (comportamiento de siempre, y el de los enlaces ya generados).
    kinds = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
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
    _create_all_once()
    _exec_ddl_statements([
        "ALTER TABLE IF EXISTS artist_agenda_items ADD COLUMN IF NOT EXISTS caldav_uid text;",
        "ALTER TABLE IF EXISTS artist_agenda_items ADD COLUMN IF NOT EXISTS caldav_href text;",
        "ALTER TABLE IF EXISTS artist_calendar_links ADD COLUMN IF NOT EXISTS kinds jsonb DEFAULT '[]'::jsonb;",
        "UPDATE artist_calendar_links SET kinds = '[]'::jsonb WHERE kinds IS NULL;",
        "ALTER TABLE IF EXISTS artist_calendar_links ALTER COLUMN kinds SET DEFAULT '[]'::jsonb;",
    ], "artist_calendar")


class ArtistNotificationContact(Base):
    """QUIÉN recibe las COMUNICACIONES de un artista y de qué.

    Una persona (un tercero: normalmente un INTEGRANTE del artista, pero puede ser su mánager o su
    gestor) con los canales que recibe: liquidaciones (y de qué conceptos del contrato), producción,
    discográfica, editorial, promoción e invitaciones. Un mismo canal lo pueden recibir VARIAS
    personas, y lo que se configure aquí manda en toda la app de ese momento en adelante."""

    __tablename__ = "artist_notification_contacts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    # La persona. Si es un tercero de la base, `promoter_id`; si se apuntó a mano, basta el correo.
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    name = Column(Text)
    email = Column(Text)
    # Teléfono para WhatsApp / SMS. Si la persona es un tercero de la base se cae al suyo; este campo
    # es para las que se apuntan a mano.
    phone = Column(Text)
    # Canales que recibe: ["ACTIVIDADES_CACHE", "ACTIVIDADES_SIN_CACHE", "LIQUIDACIONES",
    # "PRODUCCION", "DISCOGRAFICA", "EDITORIAL", "PROMOCION", "INVITACIONES"].
    channels = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Qué LIQUIDACIONES concretas (conceptos del contrato del artista: royalties, discográfico…).
    liquidation_concepts = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")

    __table_args__ = (
        Index("idx_artist_notif_contacts_artist", "artist_id"),
    )


class ConcertArtistNotification(Base):
    """Cada AVISO al artista de una actividad (uno por envío).

    Es el histórico y, a la vez, lo que se comparte: `snapshot` congela lo que se mandó (cabecera,
    descripción y condiciones tal como estaban ese día) y `public_token` es el enlace que se manda
    por WhatsApp o SMS, para que lleve EXACTAMENTE el mismo contenido que el correo.
    """

    __tablename__ = "concert_artist_notifications"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    # EMAIL | WHATSAPP | SMS
    channel = Column(Text, nullable=False)
    # CONFIRMACION (nueva actividad) | CAMBIOS | CANCELACION
    kind = Column(Text, nullable=False, server_default=text("'CONFIRMACION'"))
    # A quién fue: [{"name": ..., "email": ..., "phone": ...}]
    recipients = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    note = Column(Text)
    # Módulos que se ocultaron al enviar (los «ojos» de la vista previa).
    hidden_modules = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    public_token = Column(Text)
    signature = Column(Text)          # huella de lo gordo en el momento del envío
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    sent_by_nick = Column(Text)

    __table_args__ = (
        Index("idx_concert_artist_notif_concert", "concert_id"),
    )


def ensure_artist_notifications_schema():
    """Tabla de contactos de comunicaciones de un artista (idempotente)."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS artist_notification_contacts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            name text,
            email text,
            channels jsonb NOT NULL DEFAULT '[]'::jsonb,
            liquidation_concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_artist_notif_contacts_artist ON artist_notification_contacts(artist_id);",
        # Teléfono del contacto (WhatsApp / SMS).
        "ALTER TABLE IF EXISTS artist_notification_contacts ADD COLUMN IF NOT EXISTS phone text;",
        # AVISO AL ARTISTA de una actividad: el último aviso en la propia actividad (para la etiqueta
        # y la compuerta de confirmar) y el histórico completo en su tabla.
        """
        ALTER TABLE IF EXISTS concerts
            ADD COLUMN IF NOT EXISTS artist_notified_at timestamptz,
            ADD COLUMN IF NOT EXISTS artist_notified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS artist_notified_by_nick text,
            ADD COLUMN IF NOT EXISTS artist_notified_to jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS artist_notified_signature text,
            ADD COLUMN IF NOT EXISTS artist_notified_kind text;
        """,
        """
        CREATE TABLE IF NOT EXISTS concert_artist_notifications (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            channel text NOT NULL,
            kind text NOT NULL DEFAULT 'CONFIRMACION',
            recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
            note text,
            hidden_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
            snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            public_token text,
            signature text,
            sent_at timestamptz DEFAULT now(),
            sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            sent_by_nick text
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_concert_artist_notif_concert ON concert_artist_notifications(concert_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_concert_artist_notif_token ON concert_artist_notifications(public_token) WHERE public_token IS NOT NULL AND public_token <> '';",
    ]
    _exec_ddl_statements(stmts, "artist_notifications")


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
    contract_url = Column(Text)   # PDF del contrato adjunto (Storage)

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

    # Distribuidora digital (BD Distribuidoras). Solo aplica a canciones propias o de
    # distribución: las colaboraciones externas van por la compañía colaboradora.
    distributor_id = Column(PGUUID(as_uuid=True), ForeignKey("distributors.id", ondelete="SET NULL"))

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
    # La declaración de obra que se sube FIRMADA (desde Registros → SGAE): es lo que se le entrega a
    # la sociedad, así que sin ella no se puede dar por registrada una obra publicada de hoy en
    # adelante.
    work_declaration_signed = Column(Boolean, nullable=False, server_default=text("false"))
    lyrics_text = Column(Text)
    lyrics_updated_at = Column(DateTime(timezone=True))
    # PITCH DE LANZAMIENTO: el texto con el que se presenta el lanzamiento (a plataformas, medios,
    # playlists…). Es un campo más de la ficha, y se puede descargar en PDF o mandar.
    pitch_text = Column(Text)
    pitch_updated_at = Column(DateTime(timezone=True))
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

    # COVER | MASTER | INSTRUMENTAL | TV_TRACK | STEMS | VIDEOCLIP | VIDEO_THUMB
    category = Column(Text, nullable=False)
    slot_key = Column(Text, nullable=False, server_default=text("'DEFAULT'"))
    # STEMS: agrupa los archivos de un mismo paquete. VIDEO_THUMB: el id del VIDEOCLIP al que
    # pertenece la miniatura (así una miniatura siempre sabe de qué vídeo es).
    bundle_key = Column(Text)
    display_name = Column(Text)
    file_name = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    mime_type = Column(Text)
    # Fotograma del VÍDEO generado con ffmpeg (miniatura automática). Las miniaturas que se suben a
    # mano son filas VIDEO_THUMB y mandan sobre esta.
    poster_url = Column(Text)
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
    address = Column(Text)            # domicilio (se autorrellena del DNI; editable)
    # Petición especial de HOTELES (aparece como nota junto a la persona en las rooming lists).
    hotel_notes = Column(Text)
    # Necesidades de VIAJE (se muestran en el listado de Viaje de la hoja de ruta):
    # nota libre + equipaje/asiento/extras/categoría marcados, y puntos de salida habituales.
    travel_notes = Column(Text)
    travel_prefs = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    travel_departure_flight = Column(Text)
    travel_departure_train = Column(Text)

    # Tipo de trabajador a efectos de PRL/altas: AUTONOMO | PUNTUAL (alta puntual) | EMPRESA (fijo).
    prl_type = Column(Text)
    # Datos de facturación que el propio proveedor rellena una vez en /facturacion.
    bank_account = Column(Text)          # IBAN / nº de cuenta
    bank_bic = Column(Text)              # SWIFT/BIC (para las remesas; en SEPA suele bastar el IBAN)
    # DIRECCIÓN FISCAL EN PIEZAS. `fiscal_address` es solo la calle: el código postal, el municipio y
    # la provincia van aparte porque Holded los exige separados para dar de alta al proveedor (y
    # porque una dirección en un único cuadro de texto no se puede volcar a ninguna contabilidad).
    # Para MOSTRARLA junta hay un único helper en app.py (`_fiscal_address_text`).
    fiscal_address = Column(Text)        # calle, número, piso…
    fiscal_postal_code = Column(Text)    # código postal
    fiscal_city = Column(Text)           # municipio
    fiscal_province = Column(Text)       # provincia
    fiscal_country = Column(Text)        # país (por defecto España)
    data_consent_at = Column(DateTime(timezone=True))   # aceptó las condiciones de datos
    billing_updated_at = Column(DateTime(timezone=True))

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
    # Dirección fiscal en piezas (ver el comentario de Promoter.fiscal_address).
    fiscal_address = Column(Text)
    fiscal_postal_code = Column(Text)
    fiscal_city = Column(Text)
    fiscal_province = Column(Text)
    fiscal_country = Column(Text)
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


class PromoterAltValue(Base):
    """Un dato ALTERNATIVO **con nombre** de un tercero.

    Nace del importador de terceros: al comparar lo que ya tenemos con lo que trae el fichero se
    puede decidir **conservar los dos**. El que se queda va a su campo de la ficha y el otro se
    guarda aquí con el nombre que se le ponga («casa de Madrid», «teléfono del local»…). Sirve
    también para las columnas del fichero que no son ningún campo de la ficha y que no se quieren
    perder (el nombre es entonces el de la columna).
    """

    __tablename__ = "promoter_alt_values"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("promoters.id", ondelete="CASCADE"),
        nullable=False,
    )
    field = Column(Text)              # campo de la ficha del que es alternativa (NULL = dato suelto)
    label = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
    country = Column(Text)  # país (por defecto España en los formularios)
    photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupCompany(Base):
    __tablename__ = "group_companies"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    tax_info = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupCompanyDocument(Base):
    """Documentación de una EMPRESA DEL GRUPO (pestaña «Documentación» de su ficha).

    Cada documento lleva su nombre y su fecha de caducidad: si no ha caducado sale con etiqueta verde
    («Vigente») y si ha caducado en rojo («Caducado»). Sin fecha = sin caducidad. Solo dirección los
    sube o edita; el resto los ve, los descarga y los comparte.
    """

    __tablename__ = "group_company_documents"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("group_companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(Text, nullable=False)
    file_url = Column(Text, nullable=False)
    original_name = Column(Text)
    expiry_date = Column(Date)                 # NULL = sin caducidad
    notes = Column(Text)
    uploaded_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")

    __table_args__ = (
        Index("idx_group_company_docs_company", "company_id", "expiry_date"),
    )


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

    # REPARTO de la parte autoral entre el AUTOR y PLATAFORMA MUSICAL (solo tiene sentido en autores
    # de Plataforma). Por defecto manda el contrato EDITORIAL del artista vigente el día del registro
    # (que se congela aquí al registrar la obra, `split_*`); con `special_split` se fija a mano y esos
    # porcentajes —que suman 100 sobre la parte del autor— mandan sobre el contrato.
    special_split = Column(Boolean, nullable=False, server_default=text("false"))
    special_pct_author = Column(Numeric)
    special_pct_platform = Column(Numeric)
    split_pct_author = Column(Numeric)
    split_pct_platform = Column(Numeric)
    split_frozen_at = Column(DateTime(timezone=True))

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
    # PITCH DE LANZAMIENTO (igual que en la canción): con qué texto se presenta el disco.
    pitch_text = Column(Text)
    pitch_updated_at = Column(DateTime(timezone=True))

    physical_cd = Column(Boolean, nullable=False, server_default=text("false"))
    physical_vinyl = Column(Boolean, nullable=False, server_default=text("false"))

    is_distribution = Column(Boolean, nullable=False, server_default=text("false"))
    is_catalog = Column(Boolean, nullable=False, server_default=text("false"))

    # Distribuidora digital (BD Distribuidoras), como en Song.
    distributor_id = Column(PGUUID(as_uuid=True), ForeignKey("distributors.id", ondelete="SET NULL"))

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

    # LO GENERADO QUEDA CONGELADO: al generar la liquidación se guarda aquí el detalle tal cual, con
    # su firma y su PDF. Aunque después cambien los ingresos, la liquidación NO se altera (así no hay
    # diferencias entre lo enviado y lo que registra el sistema); para actualizarla hay que generar
    # una nueva, y antes se enseña la comparativa con la anterior.
    snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    snapshot_signature = Column(Text)          # firma de los datos congelados
    snapshot_pdf_url = Column(Text)            # PDF de la liquidación generada
    # Trazabilidad completa: generada, enviada, facturada, pagada… (lista de eventos con fecha).
    history = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Factura que subió el beneficiario por su enlace y cobro.
    invoice_id = Column(PGUUID(as_uuid=True))
    invoice_uploaded_at = Column(DateTime(timezone=True))
    paid_at = Column(DateTime(timezone=True))
    # PAGO: validada la factura queda pendiente de pago y se puede meter en una remesa como
    # cualquier otro pago. Al pagarla pasa a contabilidad (pendiente de contabilizar) y se archiva.
    payment_batch_id = Column(PGUUID(as_uuid=True), ForeignKey("payment_batches.id", ondelete="SET NULL"))
    payment_method = Column(Text)
    accounted_at = Column(DateTime(timezone=True))
    accounted_by_nick = Column(Text)

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
    # ÚLTIMO DÍA cuando la actividad dura varios (una grabación de tres días, unos ensayos):
    # `date` es el primero. Vacío = un solo día.
    end_date = Column(Date)

    # RESPONSABLE DE PRODUCCIÓN. En las actividades de un artista de la casa, producción sale sola por
    # el artista asignado; pero en un EVENTO (que no es de ningún artista) o en una fecha de gira
    # comprada promovida por una empresa del grupo hay que decir A QUIÉN de producción le toca, para
    # que le aparezca. Se pregunta al confirmar la actividad.
    production_owner_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    # Cuándo se ACTIVÓ la producción (se asignó a alguien). Sin responsable, la actividad le sale
    # como tarea pendiente a quien la creó: nadie está produciéndola.
    production_activated_at = Column(DateTime(timezone=True))
    # QUIÉN creó la actividad: es a quien le toca activar la producción.
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)

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
    # Si la actividad es de un EVENTO (no de un artista), aquí queda de qué evento es; el artista
    # que lleva es su espejo (`Artist.event_id`), porque `artist_id` no puede ir vacío.
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("app_events.id", ondelete="SET NULL"), index=True)

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

    # FORMATO del recinto que se usa en ESTA actividad (un recinto puede tener varios: «Formato 360»,
    # «Escenario central»…). Si está vacío se usa el principal del recinto. Lo miran las invitaciones
    # sobre el plano, el asignador y el plano en vivo de Enterticket, así que si la actividad usa un
    # formato distinto del habitual las butacas casan con el bueno.
    seat_map_id = Column(PGUUID(as_uuid=True), ForeignKey("venue_seat_maps.id", ondelete="SET NULL"))

    # AVISO AL ARTISTA. Antes de confirmar (o cancelar) una actividad hay que habérsela comunicado al
    # artista. Aquí queda el último aviso: cuándo, quién lo mandó y a quién le llegó (para el tooltip
    # de la etiqueta «Notificado»).
    # ⚠️ `artist_notified_signature` es la huella de lo GORDO que se avisó (fecha, hora, recinto y
    # caché): si cambia, el aviso deja de valer y hay que volver a notificar. `artist_notified_kind`
    # dice de qué se avisó (CONFIRMACION / CAMBIOS / CANCELACION), para que cancelar exija su propio
    # aviso aunque ya se hubiera avisado de la confirmación.
    artist_notified_at = Column(DateTime(timezone=True))
    artist_notified_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    artist_notified_by_nick = Column(Text)
    artist_notified_to = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    artist_notified_signature = Column(Text)
    artist_notified_kind = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Empresa del grupo (si aplica)
    group_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Empresa que factura (empresa del grupo)
    billing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Agrupación operativa (FK real): gira comprada / ciclo o festival propio.
    purchased_tour_id = Column(PGUUID(as_uuid=True), ForeignKey("purchased_tours.id", ondelete="SET NULL"))
    cycle_festival_id = Column(PGUUID(as_uuid=True), ForeignKey("cycle_festivals.id", ondelete="SET NULL"))

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
    purchased_tour = relationship("PurchasedTour", foreign_keys=[purchased_tour_id])
    cycle_festival = relationship("CycleFestival", foreign_keys=[cycle_festival_id])

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

    contacts = relationship(
        "ConcertContact",
        cascade="all, delete-orphan",
        order_by="ConcertContact.created_at",
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

    # True = creado por el espejo de Enterticket (solo esos los sobrescribe/borra la integración;
    # los tipos configurados a mano nunca se pisan aunque coincidan en nombre).
    et_managed = Column(Boolean, nullable=False, server_default=text("false"))

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

    # Enlace de venta de ESTE evento en esa ticketera (p. ej. lo rellena la integración Enterticket).
    sale_url = Column(Text)

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


class ConcertContact(Base):
    """Persona de contacto asignada a una actividad, con la función (o funciones) que cumple.

    La persona es un `PromoterContact` (vive colgando de su tercero), así que al asignarla aquí
    queda vinculada al promotor para siempre. Una MISMA persona puede cubrir varias funciones:
    por eso hay UNA fila por persona con la lista de roles, y no una fila por rol — así en la
    ficha aparece una sola vez con varias etiquetas.
    """

    __tablename__ = "concert_contacts"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(PGUUID(as_uuid=True), ForeignKey("promoter_contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    # PRODUCCION | TICKETING | COMUNICACION (claves de CONCERT_CONTACT_ROLES en app.py)
    roles = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contact = relationship("PromoterContact")

    __table_args__ = (
        UniqueConstraint("concert_id", "contact_id", name="uq_concert_contact"),
    )


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
    # `data` = LA FICHA DE CONTRATACIÓN de la casa (la única que se enseña y se usa).
    data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    # `promoter_data` = LO QUE MANDÓ EL PROMOTOR, aparte y sin pisar lo nuestro: así se pueden
    # comparar los dos en pantalla partida y elegir campo por campo qué se queda. Antes el promotor
    # escribía en `data` y borraba lo que hubiera.
    promoter_data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    # Cuándo se revisó lo que mandó (si es NULL y hay `promoter_data`, está pendiente de revisar).
    promoter_reviewed_at = Column(DateTime(timezone=True))
    merge_log = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    rejection_reason = Column(Text)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at = Column(DateTime(timezone=True))
    reviewed_at = Column(DateTime(timezone=True))
    accepted_at = Column(DateTime(timezone=True))
    rejected_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert", back_populates="contract_sheet")


class MinorAuthConfig(Base):
    """Configuración de las AUTORIZACIONES DE ACCESO A MENORES de una actividad.

    Solo tiene sentido cuando promovemos nosotros (una empresa del grupo): es nuestra política de
    menores la que se aplica. El enlace público se comparte con el comprador y su token es la
    credencial (como el resto de enlaces públicos de la casa)."""

    __tablename__ = "minor_auth_configs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False, unique=True)
    # Corte de edad: hay que rellenar la hoja si el menor tiene MENOS de estos años (18, 16 o 14).
    age_limit = Column(Integer, nullable=False, server_default=text("18"))
    require_guardian_dni = Column(Boolean, nullable=False, server_default=text("true"))
    require_minor_dni = Column(Boolean, nullable=False, server_default=text("true"))
    require_email_verification = Column(Boolean, nullable=False, server_default=text("true"))
    # Leyenda que describe la política de menores (se enseña en la pestaña y en el formulario).
    policy_text = Column(Text)
    public_token = Column(Text, unique=True)
    # Enlace del CONTROL DE ACCESO, aparte del del formulario: quien valida no debe poder rellenar
    # autorizaciones con su enlace, ni al contrario.
    validate_token = Column(Text, unique=True)
    active = Column(Boolean, nullable=False, server_default=text("true"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")

    __table_args__ = (
        Index("idx_minor_auth_configs_concert", "concert_id"),
    )


class MinorAuthorization(Base):
    """Una autorización cumplimentada y FIRMADA. Se conserva tal cual se firmó (`declaration_snapshot`):
    si mañana cambian los datos del concierto, la autorización sigue diciendo lo que se firmó."""

    __tablename__ = "minor_authorizations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    config_id = Column(PGUUID(as_uuid=True), ForeignKey("minor_auth_configs.id", ondelete="CASCADE"), nullable=False)
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    # PADRE | MADRE | TUTOR
    guardian_kind = Column(Text, nullable=False, server_default=text("'TUTOR'"))
    guardian_first_name = Column(Text)
    guardian_last_name = Column(Text)
    guardian_doc_number = Column(Text)
    guardian_birth_date = Column(Date)
    guardian_phone = Column(Text)
    guardian_email = Column(Text)
    guardian_doc_url = Column(Text)
    # ¿Acompaña el propio tutor? Si no, van los datos de la persona autorizada.
    escort_is_guardian = Column(Boolean, nullable=False, server_default=text("true"))
    escort_first_name = Column(Text)
    escort_last_name = Column(Text)
    escort_doc_number = Column(Text)
    escort_birth_date = Column(Date)
    escort_phone = Column(Text)
    escort_email = Column(Text)
    escort_doc_url = Column(Text)
    consent_at = Column(DateTime(timezone=True))
    signature_url = Column(Text)
    declaration_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    # Token del QR: es lo que se valida en el control de acceso.
    qr_token = Column(Text, unique=True)
    # VALID | CANCELLED
    status = Column(Text, nullable=False, server_default=text("'VALID'"))
    email_sent_at = Column(DateTime(timezone=True))
    validated_at = Column(DateTime(timezone=True))
    validated_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    config = relationship("MinorAuthConfig")
    concert = relationship("Concert")
    minors = relationship("MinorAuthorizationMinor", back_populates="authorization",
                          cascade="all, delete-orphan", order_by="MinorAuthorizationMinor.created_at")

    __table_args__ = (
        Index("idx_minor_authorizations_concert", "concert_id", "status"),
        Index("idx_minor_authorizations_qr", "qr_token"),
    )


class MinorAuthorizationMinor(Base):
    """Un menor dentro de una autorización (se pueden meter todos los que hagan falta).

    ⚠️ El DNI del menor NO se sube: solo se apunta el número. Es un dato de un menor de edad y no
    hace falta guardar su imagen para validar el acceso."""

    __tablename__ = "minor_authorization_minors"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    authorization_id = Column(PGUUID(as_uuid=True), ForeignKey("minor_authorizations.id", ondelete="CASCADE"), nullable=False)
    first_name = Column(Text)
    last_name = Column(Text)
    doc_number = Column(Text)
    birth_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    authorization = relationship("MinorAuthorization", back_populates="minors")

    __table_args__ = (
        Index("idx_minor_authorization_minors_auth", "authorization_id"),
        Index("idx_minor_authorization_minors_doc", "doc_number"),
    )


class ConcertArtworkRequest(Base):
    __tablename__ = "concert_artwork_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    # La cartelería puede ser de UNA actividad o de TODO un grupo (gira comprada, ciclo/festival o
    # evento): una sola solicitud para toda la gira, cuyos carteles se ven además en cada fecha en su
    # propio módulo. Va uno de los dos: `concert_id` o (`group_kind`, `group_id`).
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
    )
    group_kind = Column(Text)     # TOUR (gira comprada) | CYCLE (ciclo, festival o evento)
    group_id = Column(PGUUID(as_uuid=True))
    public_token = Column(Text, nullable=False, unique=True)
    handled_by = Column(Text, nullable=False, server_default=text("'OURS'"))
    # DRAFT | PROMOTER | REQUESTED | REVIEW (subidos, pendientes de validar) | CORRECTIONS | UPLOADED
    status = Column(Text, nullable=False, server_default=text("'DRAFT'"))
    group_company_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    ticketer_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    logo_notes = Column(Text)
    ticketer_notes = Column(Text)
    other_notes = Column(Text)
    # Formatos solicitados a diseño (claves de ARTWORK_FORMAT_CHOICES o texto personalizado)
    requested_formats = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # VÍDEO promocional: se pide junto a la cartelería, con su descripción y su formato
    # (claves de ARTWORK_VIDEO_FORMAT_CHOICES: VERTICAL | HORIZONTAL).
    video_requested = Column(Boolean, nullable=False, server_default=text("false"))
    video_notes = Column(Text)
    video_formats = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Correos a los que se pidió (promotor): se reutilizan para correcciones/cambios de datos.
    recipients_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Nota de rechazo de diseño (qué hay que corregir antes de volver a subir).
    correction_notes = Column(Text)
    delivery_deadline = Column(Date)
    event_snapshot = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    needs_refresh = Column(Boolean, nullable=False, server_default=text("false"))
    # Trazabilidad de COMPARTIDO (etiquetas de la pestaña Cartelería): con el artista y, cuando el
    # cartel lo hacemos nosotros y el promotor NO es empresa del grupo, también con el promotor.
    shared_with_artist_at = Column(DateTime(timezone=True))
    shared_with_promoter_at = Column(DateTime(timezone=True))
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
    # Dimensiones (px) medidas en el navegador al subir; para mostrar el tamaño y elegir
    # como principal el más cuadrado.
    width = Column(Integer)
    height = Column(Integer)
    # Validación de diseño para carteles subidos por el PROMOTOR: PENDING | APPROVED | REJECTED.
    validation_status = Column(Text, nullable=False, server_default=text("'APPROVED'"))
    # Cartel principal (el que se muestra en cabeceras). Si solo hay uno, ese es el principal.
    is_primary = Column(Boolean, nullable=False, server_default=text("false"))
    # Quién lo subió a mano desde la ficha (para avisarle si diseño lo rechaza) y el resultado de la
    # revisión: nota de por qué hay que cambiarlo, cuándo se revisó y quién.
    uploaded_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_by_nick = Column(Text)
    rejection_note = Column(Text)
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by_nick = Column(Text)
    is_archived = Column(Boolean, nullable=False, server_default=text("false"))
    archived_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# --- NOTAS (contratación / generales) ---

class PersonalExpense(Base):
    """Gasto o factura que llega a UNA PERSONA y todavía no está asignado a una bolsa.

    Dos orígenes: facturas que un proveedor sube por el enlace público eligiendo a quién van
    (`source='INVOICE'`) y gastos importados de Pleo (`source='PLEO'`). Cada uno tiene una semana
    para asignarse a una bolsa; después salta el aviso y, a los 15 días, el escalado a dirección.
    Al asignarlo a una bolsa queda pendiente de TIPIFICAR (elegir su módulo de gasto), y cuando se
    tipifica se crea el BagExpense correspondiente."""

    __tablename__ = "personal_expenses"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source = Column(Text, nullable=False, server_default=text("'INVOICE'"))   # INVOICE | PLEO | MANUAL
    supplier_invoice_id = Column(PGUUID(as_uuid=True), ForeignKey("supplier_invoices.id", ondelete="SET NULL"))
    # id del apunte en Pleo. Lleva índice UNIQUE (ver ensure_pleo_schema): es LA garantía de que un
    # gasto importado no se duplica nunca, ni con dos sondeos a la vez.
    pleo_entry_id = Column(Text)
    # Código de la venta en Cabify. Lleva índice UNIQUE (ver ensure_cabify_schema): es LA
    # garantía de que un viaje importado no se duplica, ni con dos sondeos a la vez.
    cabify_sale_code = Column(Text)
    # VIAJE de Cabify al que pertenece. Un mismo viaje puede generar VARIAS ventas (el trayecto y
    # sus suplementos: espera, peaje, limpieza…). El gasto es UNO por viaje, con el total sumado:
    # así en «Mis gastos» se ve un viaje, no cuatro líneas sueltas.
    cabify_journey_id = Column(Text)
    # Códigos de venta ya sumados a este gasto: sin esto, volver a ver un suplemento en el siguiente
    # sondeo lo sumaría otra vez.
    cabify_sale_codes = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    concept = Column(Text)
    provider_name = Column(Text)
    expense_date = Column(Date)
    amount_net = Column(Numeric)
    amount_gross = Column(Numeric)
    amount_tax = Column(Numeric)
    currency = Column(Text, nullable=False, server_default=text("'EUR'"))
    invoice_number = Column(Text)
    document_type = Column(Text)                       # FACTURA | TICKET (lo deduce Pleo)
    file_url = Column(Text)
    original_name = Column(Text)
    # --- Datos que aporta Pleo (trazabilidad + ayuda para asignar y tipificar) ---
    pleo_account_id = Column(PGUUID(as_uuid=True), ForeignKey("pleo_accounts.id", ondelete="SET NULL"))
    pleo_company_id = Column(Text)
    pleo_employee_id = Column(Text)
    pleo_updated_at = Column(DateTime(timezone=True))  # para saltarse lo que no ha cambiado
    pleo_status = Column(Text)
    pleo_family = Column(Text)                         # CARD_PURCHASE, OUT_OF_POCKET, MILEAGE…
    pleo_subfamily = Column(Text)
    pleo_review_status = Column(Text)                  # WAITING_FOR_EXPENSE_OWNER = le falta algo
    pleo_note = Column(Text)                           # nota que escribió la persona en Pleo
    pleo_tags = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))       # [{group,value}]
    pleo_receipt_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))  # ya bajados
    pleo_files = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))      # justificantes
    pleo_account_code = Column(Text)
    merchant_mcc = Column(Text)                        # código de categoría del comercio
    suggested_category = Column(Text)                  # módulo de gasto sugerido (solo sugerencia)
    needs_receipt = Column(Boolean, nullable=False, server_default=text("false"))
    sync_warning = Column(Text)                        # p. ej. cambió el importe tras asignarlo
    is_cancelled = Column(Boolean, nullable=False, server_default=text("false"))
    last_synced_at = Column(DateTime(timezone=True))
    # Asignación: primero a una BOLSA y luego a su módulo de gasto (bag_expense_id).
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    bag_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="SET NULL"))
    # PENDING (sin bolsa) | IN_BAG (en bolsa, sin tipificar) | ASSIGNED (con su gasto creado)
    # VALIDATING (mandado a validar como gasto directo) | DIRECT (validado, no va a ninguna bolsa)
    status = Column(Text, nullable=False, server_default=text("'PENDING'"))

    # --- GASTOS DIRECTOS: los que NO van contra ninguna bolsa ---
    # OFICINA (gasto genérico de la casa) | ARTIST_INVESTMENT (inversión en un artista, va a su
    # balance de inversión). Los dos los tiene que VALIDAR administración.
    direct_target = Column(Text)
    direct_artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    validation_status = Column(Text)            # PENDIENTE | APROBADO | RECHAZADO
    validation_note = Column(Text)              # por qué no se aceptó (se le dice a quien lo mandó)
    validation_requested_at = Column(DateTime(timezone=True))
    validated_at = Column(DateTime(timezone=True))
    validated_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    validated_by_nick = Column(Text)
    # Justificante: para mandarlo a validar hace falta factura/ticket O que administración haya
    # aceptado que no lo lleva (mismo trato que el «sin ticket» de los gastos de bolsa).
    no_invoice_reason = Column(Text)
    no_invoice_status = Column(Text)            # SOLICITADO | APROBADO | RECHAZADO
    # Pago: lo de Pleo y Cabify ya está pagado con la tarjeta; una factura a nombre de la persona no.
    payment_status = Column(Text, nullable=False, server_default=text("'NO_PAGADO'"))
    paid_at = Column(DateTime(timezone=True))
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    assigned_at = Column(DateTime(timezone=True))
    notified_at = Column(DateTime(timezone=True))       # aviso a la persona (1 semana)
    escalated_at = Column(DateTime(timezone=True))      # aviso a dirección (15 días)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag")

    __table_args__ = (
        Index("idx_personal_expenses_user", "user_id", "status"),
        Index("idx_personal_expenses_bag", "bag_id", "status"),
    )


class AfavorLiquidation(Base):
    """Liquidación de royalties «A FAVOR» nuestro: lo que nos tiene que liquidar una compañía
    externa por nuestras colaboraciones, por semestre. Lleva el estado del ciclo completo:
    PENDING (pendiente) → REQUESTED (solicitado) → PENDING_INVOICE (pendiente de facturación) →
    INVOICED (facturado) → COLLECTED (cobrado)."""

    __tablename__ = "afavor_liquidations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    # Compañía externa a la que se le solicita (se guarda como tercero).
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    status = Column(Text, nullable=False, server_default=text("'PENDING'"))
    # Solicitud de la liquidación (correo a la compañía).
    requested_at = Column(DateTime(timezone=True))
    requested_by_nick = Column(Text)
    requested_to = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Factura que emitimos nosotros (la sube administración).
    invoice_requested_at = Column(DateTime(timezone=True))
    invoice_requested_by_nick = Column(Text)
    invoice_url = Column(Text)
    invoice_name = Column(Text)
    invoice_number = Column(Text)
    invoice_amount = Column(Numeric)
    invoice_sent_at = Column(DateTime(timezone=True))
    invoice_sent_to = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    collected_at = Column(DateTime(timezone=True))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Promoter")

    __table_args__ = (
        UniqueConstraint("company_id", "period_start", name="uq_afavor_company_period"),
        Index("idx_afavor_liquidations_period", "period_start", "status"),
    )


class SupplierInvoice(Base):
    """Factura subida por un proveedor: por la landing genérica (/facturacion) o desde una
    petición concreta de una bolsa. Queda pendiente de validar por administración."""

    __tablename__ = "supplier_invoices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"), nullable=False)
    source = Column(Text, nullable=False, server_default=text("'LANDING'"))   # LANDING | REQUEST
    # Si viene de una petición de bolsa: a qué bolsa/concepto se refiere.
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    bag_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="SET NULL"))
    invoice_request_id = Column(PGUUID(as_uuid=True))
    # Si es la factura de una LIQUIDACIÓN DE ROYALTIES.
    royalty_liquidation_id = Column(PGUUID(as_uuid=True), ForeignKey("royalty_liquidations.id", ondelete="SET NULL"))
    # Lo que declara el proveedor al subirla (artista y concepto vienen en la propia factura).
    artist_text = Column(Text)
    concept_text = Column(Text)
    invoice_number = Column(Text)
    issue_date = Column(Date)                 # fecha de emisión (detectada del documento)
    # IMPORTES leídos del propio documento al subirlo (o corregidos a mano): son los que hacen que
    # cuadre lo que hay que facturar con lo que se va a pagar.
    amount_gross = Column(Numeric)            # total de la factura (lo que se paga)
    amount_net = Column(Numeric)              # base imponible
    amount_vat = Column(Numeric)              # cuota de IVA
    vat_pct = Column(Numeric)
    retention_amount = Column(Numeric)        # retención / IRPF (resta del total)
    retention_pct = Column(Numeric)
    # A quién va dirigida cuando se sube por el enlace genérico (paso «¿para quién es la factura?»).
    target_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    group_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    file_url = Column(Text, nullable=False)
    original_name = Column(Text)
    mime_type = Column(Text)
    # PENDIENTE (recibida, sin validar) | VALIDADA | RECHAZADA
    status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))
    reject_reason = Column(Text)
    validated_at = Column(DateTime(timezone=True))
    validated_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")

    __table_args__ = (
        Index("idx_supplier_invoices_promoter", "promoter_id", "status"),
    )


class BagInvoiceRequest(Base):
    """Petición de facturas a un PROVEEDOR de una bolsa: enlace público donde sube la factura de
    cada concepto pendiente (y la documentación adicional que se le exija)."""

    __tablename__ = "bag_invoice_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    public_token = Column(Text, nullable=False, unique=True)
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="CASCADE"), nullable=False)
    provider_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"), nullable=False)
    # Conceptos (bag_expenses) que se le piden, congelados al enviar la petición.
    expense_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Documentación adicional exigida: ["ALTA_SS", "AUTONOMO_RECIBO", ...] (PRL_DOC_LABELS).
    required_docs = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    recipients_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))  # ACTIVE | DONE | CANCELLED
    last_sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag")
    provider = relationship("Promoter")

    __table_args__ = (
        Index("idx_bag_invoice_requests_bag", "bag_id", "provider_id"),
    )


class PersonComplianceDoc(Base):
    """Documentación de ALTA y PRL de una persona (tercero o personal propio) o el ITA de una
    empresa del grupo. Tipos: AUTONOMO_RECIBO (recibo de autónomos del mes anterior), ALTA_SS
    (alta puntual en la Seguridad Social, ligada a un concierto), ITA (informe de trabajadores en
    alta de una empresa del grupo), PRL_FORMACION (acreditación de formación) y PRL_INFORMACION
    (justificante de información de riesgos específicos)."""

    __tablename__ = "person_compliance_docs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)   # PROMOTER | USER | COMPANY
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    doc_type = Column(Text, nullable=False)     # AUTONOMO_RECIBO | ALTA_SS | ITA | PRL_FORMACION | PRL_INFORMACION
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="SET NULL"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    file_url = Column(Text, nullable=False)
    original_name = Column(Text)
    mime_type = Column(Text)
    valid_from = Column(Date)
    valid_until = Column(Date)          # NULL = sin caducidad (formación/información)
    status = Column(Text, nullable=False, server_default=text("'APPROVED'"))  # APPROVED | REJECTED
    reject_reason = Column(Text)
    # ITA: ids de terceros (promoters) y usuarios vinculados que aparecen en el informe.
    linked_person_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    detected_meta = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    uploaded_via = Column(Text, nullable=False, server_default=text("'MANUAL'"))  # MANUAL | PUBLIC | ADMIN
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PrlUploadRequest(Base):
    """Petición de documentación de alta/PRL a una persona del personal de un evento (enlace
    público para que suba sus documentos)."""

    __tablename__ = "prl_upload_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    public_token = Column(Text, nullable=False, unique=True)
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    personnel_id = Column(Text, nullable=False)      # id de la persona en roadmap_payload.personnel
    person_kind = Column(Text, nullable=False, server_default=text("'MANUAL'"))  # PROMOTER | MANUAL
    person_ref = Column(PGUUID(as_uuid=True))        # promoter id si kind=PROMOTER
    person_name = Column(Text, nullable=False, server_default=text("''"))
    worker_type = Column(Text)                       # AUTONOMO | PUNTUAL | EMPRESA (elegido en la página)
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))  # ACTIVE | DONE
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ArtistTemplate(Base):
    """PLANTILLAS de un artista: personal, rooming list y hoja de ruta.

    ⚠️ El payload se llama `roadmap_payload` A PROPÓSITO: así TODA la maquinaria de la hoja de ruta
    (endpoints de personal, hoteles/habitaciones, agenda, adjuntos, días…) funciona sobre una
    plantilla sin duplicar una línea de código, y cualquier función NUEVA de la hoja de ruta aparece
    también aquí automáticamente. Lo que cambia según el `kind` es qué pestañas se enseñan y qué se
    copia al cargarla en una actividad:
      · PERSONNEL → `payload['personnel']`
      · ROOMING   → `payload['hotels']` (con sus habitaciones) + el personal que se usó para montarla
      · ROADMAP   → `payload['agenda']` (los horarios), con los días como «Día 1, Día 2…»
    """

    __tablename__ = "artist_templates"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    kind = Column(Text, nullable=False)                 # PERSONNEL | ROOMING | ROADMAP
    name = Column(Text, nullable=False, server_default=text("''"))
    notes = Column(Text)
    # Rooming: de qué plantilla de PERSONAL se partió (para poder recargarla).
    personnel_template_id = Column(PGUUID(as_uuid=True),
                                   ForeignKey("artist_templates.id", ondelete="SET NULL"))
    # Nº de días de la plantilla de hoja de ruta (los horarios se guardan por día).
    day_count = Column(Integer, nullable=False, server_default=text("1"))
    roadmap_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist")


def ensure_artist_templates_schema():
    """Plantillas de personal / rooming / hoja de ruta por artista. Idempotente."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS artist_templates (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            kind text NOT NULL,
            name text NOT NULL DEFAULT '',
            notes text,
            personnel_template_id uuid REFERENCES artist_templates(id) ON DELETE SET NULL,
            day_count integer NOT NULL DEFAULT 1,
            roadmap_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS ix_artist_templates_artist_kind ON artist_templates (artist_id, kind);",
    ])


class ThirdPartyIntakeLink(Base):
    """Enlace público para que un TERCERO se dé de alta o actualice sus datos él mismo.

    `promoter_id` vacío = alta nueva (todavía no sabemos quién es); con tercero = petición de
    actualización de ESE tercero (el formulario sale con sus datos ya puestos). Si en un alta nueva
    el CIF/DNI resulta ser de un tercero que ya existe, el enlace se «engancha» a él y pasa a ser una
    actualización (`promoter_id` + `kind='UPDATE'`), que es justo lo que se le ofrece en pantalla.
    """

    __tablename__ = "third_party_intake_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    public_token = Column(Text, nullable=False, unique=True)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"))
    kind = Column(Text, nullable=False, server_default=text("'ALTA'"))      # ALTA | UPDATE
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))  # ACTIVE | DONE | CANCELLED
    # Quién lo pidió (sale en el correo: «X ha solicitado que actualices tus datos»).
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    # Último envío: por dónde y a quién (para poder reenviar sin volver a buscarlo).
    sent_channel = Column(Text)          # EMAIL | WHATSAPP | SMS | COPY
    sent_to = Column(Text)
    sent_at = Column(DateTime(timezone=True))
    # Lo que se recibió por el formulario (traza de lo que rellenó el propio tercero).
    data = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    submitted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")


def ensure_third_party_intake_schema():
    """Tabla del enlace público de alta/actualización de terceros. Idempotente."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS third_party_intake_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            public_token text NOT NULL UNIQUE,
            promoter_id uuid REFERENCES promoters(id) ON DELETE CASCADE,
            kind text NOT NULL DEFAULT 'ALTA',
            status text NOT NULL DEFAULT 'ACTIVE',
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            sent_channel text,
            sent_to text,
            sent_at timestamptz,
            data jsonb NOT NULL DEFAULT '{}'::jsonb,
            submitted_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS ix_tp_intake_promoter ON third_party_intake_links (promoter_id);",
        "CREATE INDEX IF NOT EXISTS ix_tp_intake_status ON third_party_intake_links (status);",
    ])


class ConcertSaleChannelRequest(Base):
    """Petición al promotor para que configure los CANALES DE VENTA (links + ticketeras) de un
    concierto vendido por terceros. Mientras esté ACTIVE y auto_remind, se le recuerda por correo
    una vez a la semana (desde que el evento se confirma) hasta que suba algún link."""

    __tablename__ = "concert_sale_channel_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("concerts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    public_token = Column(Text, nullable=False, unique=True)
    # ACTIVE (pendiente) | DONE (links subidos) | CANCELLED
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))
    auto_remind = Column(Boolean, nullable=False, server_default=text("true"))
    recipients_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    last_sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


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
    address = Column(Text)            # domicilio (se autorrellena del DNI; editable)
    mobile_phones = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    departments = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Qué TAREAS de administración le tocan a esta persona (claves de ADMIN_RESPONSIBILITIES).
    # NO es un permiso: es un reparto de trabajo. Lista vacía = no tiene reparto propio y ve las
    # de todos; y una tarea de la que nadie es responsable la siguen viendo todos (nada se pierde).
    admin_responsibilities = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Otros correos de empresa de la persona. NO sirven para entrar en la app (el acceso es siempre
    # `User.email`): existen solo para IDENTIFICARLA en las integraciones. En Pleo, por ejemplo, hay
    # una cuenta por empresa del grupo y cada una puede tener a la persona con un correo distinto.
    integration_emails = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Unión (compatibilidad). Las facetas separan qué artistas se asignan por Producción y por Sello
    # (una persona puede ser de ambos a la vez).
    assigned_artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    assigned_artist_ids_produccion = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    assigned_artist_ids_sello = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    legacy_permissions_seeded = Column(Boolean, nullable=False, server_default=text("false"))
    # Necesidades de VIAJE (mismas que en los terceros): nota libre, marcas de equipaje/asiento/
    # extras/categoría y puntos de salida habituales de vuelo y tren.
    travel_notes = Column(Text)
    travel_prefs = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    travel_departure_flight = Column(Text)
    travel_departure_train = Column(Text)
    # PLAZO PARA ASIGNAR GASTOS A BOLSAS: se puede PARAR para esta persona (baja, vacaciones, un
    # artista cuya bolsa aún no está abierta…). Mientras está parado no corre la cuenta atrás, no
    # se le reclama y no se escala a dirección. `expense_pause_log` guarda los tramos parados
    # [{"from": "AAAA-MM-DD", "to": "AAAA-MM-DD"}] para poder DESCONTARLOS del plazo al reanudar,
    # en vez de que los gastos aparezcan de golpe fuera de plazo.
    expense_deadline_paused = Column(Boolean, nullable=False, server_default=text("false"))
    expense_paused_since = Column(Date)
    expense_pause_log = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # ORDEN DEL MENÚ elegido por la persona (lista de claves de sección, arrastrando). Vacío = el
    # orden automático por uso.
    menu_order = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Última vez que esta persona entró en Producción → Activas (para marcar «Nueva actividad»).
    production_seen_at = Column(DateTime(timezone=True))
    # VACACIONES: días al año de esta persona (NULL = los de la casa, VACATION_DAYS_PER_YEAR).
    # Se configura desde el panel de administración de vacaciones, no desde su propia ficha.
    vacation_days_per_year = Column(Integer)
    # Ajustes manuales del saldo por año {"2026": 3}: días arrastrados del año anterior,
    # correcciones… Suman (o restan) sobre lo que le corresponde por contrato.
    vacation_adjustments = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
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
    locations = relationship(
        "MediaLocation",
        back_populates="media",
        cascade="all, delete-orphan",
        order_by="MediaLocation.name",
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


class MediaLocation(Base):
    """Ubicación de un medio (estudio, redacción, plató…). Un medio puede tener VARIAS: al montar una
    entrevista presencial se ofrecen como sugerencia y, si se escribe una nueva, se puede dejar
    vinculada al medio para la próxima vez."""

    __tablename__ = "media_locations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    media_id = Column(PGUUID(as_uuid=True), ForeignKey("media_outlets.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    address = Column(Text)
    municipality = Column(Text)
    province = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    media = relationship("MediaOutlet", back_populates="locations")

    __table_args__ = (
        Index("idx_media_locations_media", "media_id"),
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
    # A quién de producción le toca montarlo (cuando se le encarga a una persona concreta).
    owner_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    bag = relationship("WorkflowBag")
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    owner = relationship("User", foreign_keys=[owner_user_id])

    __table_args__ = (
        Index("idx_production_requests_status_date", "status", "activity_date"),
        Index("idx_production_requests_bag", "bag_id"),
        Index("idx_production_requests_linked", "linked_type", "linked_id"),
        Index("idx_production_requests_owner", "owner_user_id", "status"),
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
    # Como en los gastos de las simulaciones: cantidad (el total es unitario × cantidad) e IVA.
    quantity = Column(Numeric, nullable=False, server_default=text("1"))
    iva_pct = Column(Numeric, nullable=False, server_default=text("21"))
    iva_exempt = Column(Boolean, nullable=False, server_default=text("false"))
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
    # AÑADIDA con respecto al último envío: la entrada entró en un envío POSTERIOR al primero
    # (ampliación); se etiqueta en azul junto a la entrada hasta el siguiente envío.
    added_after_send = Column(Boolean, nullable=False, server_default=text("false"))
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
    """Contenedor de MARKETING (campaña de pago) o de PROMOCIÓN (prensa: entrevistas, junts de
    prensa, phoners…), según `kind`. Las dos comparten bolsa de gastos, hoja de ruta y empresa que
    factura; lo que cambia es lo que cuelga dentro (`PromotionActivity`)."""

    __tablename__ = "promotions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    # MARKETING (campañas de pago) | PROMO (prensa y entrevistas).
    kind = Column(Text, nullable=False, server_default=text("'MARKETING'"))
    # Nombre del plan de promoción (en marketing el título sale del elemento promocionado).
    name = Column(Text)
    # Estado de trabajo, con los MISMOS códigos que un concierto (BORRADOR|HABLADO|RESERVADO|
    # CONFIRMADO) para que calendario y pastillas de estado valgan igual. `status` es otra cosa:
    # ACTIVE|ARCHIVED.
    promo_status = Column(Text, nullable=False, server_default=text("'BORRADOR'"))
    # Quién acompaña al artista: NONE (nadie) | USER (alguien de la oficina) | PROMOTER (un tercero).
    escort_kind = Column(Text, nullable=False, server_default=text("'NONE'"))
    escort_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    escort_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    escort_note = Column(Text)
    # Logística / producción: a quién de producción le toca montarlo.
    production_needed = Column(Boolean, nullable=False, server_default=text("false"))
    production_owner_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    production_request_id = Column(PGUUID(as_uuid=True), ForeignKey("production_requests.id", ondelete="SET NULL"))
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
    escort_user = relationship("User", foreign_keys=[escort_user_id])
    escort_promoter = relationship("Promoter", foreign_keys=[escort_promoter_id])
    production_owner = relationship("User", foreign_keys=[production_owner_user_id])

    __table_args__ = (
        Index("idx_promotions_status_date", "status", "target_date"),
        Index("idx_promotions_subject", "subject_type", "subject_id"),
        Index("idx_promotions_company", "company_id", "target_date"),
        Index("idx_promotions_kind_status", "kind", "status", "target_date"),
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
    # ---- Promoción de prensa (entrevistas) ----
    # Estado propio de la entrevista, mismos códigos que un concierto.
    status = Column(Text, nullable=False, server_default=text("'BORRADOR'"))
    # PRESENCIAL | PHONER | ZOOM | PREGUNTAS
    modality = Column(Text)
    location_id = Column(PGUUID(as_uuid=True), ForeignKey("media_locations.id", ondelete="SET NULL"))
    location_name = Column(Text)
    location_address = Column(Text)
    # FULL_PLAYBACK | HALF_PLAYBACK | DIRECTO (con músicos)
    formation_kind = Column(Text)
    musicians_count = Column(Integer, nullable=False, server_default=text("0"))
    # Gastos que cubre el medio, con el mismo formato que «el promotor cubre otros gastos».
    promoter_costs_payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    # Petición a Contratación para gestionar el caché (contrato + facturación).
    booking_request_id = Column(PGUUID(as_uuid=True), ForeignKey("booking_requests.id", ondelete="SET NULL"))
    # Punto de la hoja de ruta que espeja esta entrevista (para mantenerlos a la par).
    roadmap_item_id = Column(Text)
    # Declaración por semestre de lo cantado (Registros).
    registration_declared_done = Column(Boolean, nullable=False, server_default=text("false"))
    registration_declared_at = Column(DateTime(timezone=True))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    promotion = relationship("Promotion")
    media = relationship("MediaOutlet")
    media_contact = relationship("MediaContact")
    location = relationship("MediaLocation")
    provider = relationship("Promoter")
    provider_company = relationship("PromoterCompany")
    bag_expense = relationship("BagExpense", foreign_keys=[bag_expense_id])
    booking_request = relationship("BookingRequest", foreign_keys=[booking_request_id])

    __table_args__ = (
        Index("idx_promotion_activities_promotion_date", "promotion_id", "activity_date"),
        Index("idx_promotion_activities_kind", "activity_kind", "activity_date"),
        Index("idx_promotion_activities_action_type", "action_type", "activity_date"),
        Index("idx_promotion_activities_media", "media_id", "activity_date"),
        Index("idx_promotion_activities_bag_expense", "bag_expense_id"),
    )


class Bank(Base):
    """Banco (Bases de datos → Bancos): nombre y logo. Lo usan las cuentas de las empresas del grupo
    y las remesas de pago."""

    __tablename__ = "banks"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    logo_url = Column(Text)
    # Formato de fichero de remesa que se le manda (ver `sepa_utils.BANK_PROFILES`).
    file_format = Column(Text, nullable=False, server_default=text("'SEPA_PAIN001'"))
    bic = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_banks_name", "name"),
    )


class GroupCompanyBankAccount(Base):
    """Cuenta bancaria de una empresa del grupo: desde una de estas se paga cada remesa."""

    __tablename__ = "group_company_bank_accounts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="CASCADE"), nullable=False)
    bank_id = Column(PGUUID(as_uuid=True), ForeignKey("banks.id", ondelete="SET NULL"))
    alias = Column(Text)
    iban = Column(Text, nullable=False)
    swift_bic = Column(Text)
    # Justificante de titularidad de la cuenta.
    cert_url = Column(Text)
    cert_name = Column(Text)
    is_default = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")
    bank = relationship("Bank")

    __table_args__ = (
        Index("idx_group_company_bank_accounts_company", "company_id"),
    )


class PaymentBatch(Base):
    """REMESA de pagos: se agrupan los gastos pendientes de una empresa del grupo, se exporta el
    fichero para el banco y, al subir el justificante, se dan por pagados todos de una vez."""

    __tablename__ = "payment_batches"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    reference = Column(Text, nullable=False)
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    account_id = Column(PGUUID(as_uuid=True), ForeignKey("group_company_bank_accounts.id", ondelete="SET NULL"))
    bank_id = Column(PGUUID(as_uuid=True), ForeignKey("banks.id", ondelete="SET NULL"))
    # BORRADOR (se está montando) | EXPORTADA (fichero generado) | PAGADA (con justificante)
    status = Column(Text, nullable=False, server_default=text("'BORRADOR'"))
    execution_date = Column(Date)
    total_amount = Column(Numeric, nullable=False, server_default=text("0"))
    file_url = Column(Text)
    file_name = Column(Text)
    file_format = Column(Text)
    exported_at = Column(DateTime(timezone=True))
    receipt_url = Column(Text)
    receipt_name = Column(Text)
    paid_at = Column(DateTime(timezone=True))
    notes = Column(Text)
    # APROBACIÓN DE DIRECCIÓN: una remesa no sale al banco hasta que dirección ha repasado sus
    # facturas una a una. Se apunta quién dio el visto bueno y cuándo.
    approved_at = Column(DateTime(timezone=True))
    approved_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    approved_by_nick = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")
    account = relationship("GroupCompanyBankAccount")
    bank = relationship("Bank")
    items = relationship("PaymentBatchItem", back_populates="batch", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_payment_batches_company_status", "company_id", "status"),
    )


class PaymentBatchItem(Base):
    """Cada pago de una remesa. Guarda el beneficiario TAL COMO iba en el fichero: si mañana cambia
    la cuenta del proveedor, la remesa sigue diciendo lo que se mandó al banco."""

    __tablename__ = "payment_batch_items"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    batch_id = Column(PGUUID(as_uuid=True), ForeignKey("payment_batches.id", ondelete="CASCADE"), nullable=False)
    expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="SET NULL"))
    personal_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("personal_expenses.id", ondelete="SET NULL"))
    # Una LIQUIDACIÓN DE ROYALTIES ya facturada y validada se paga como cualquier otro pago.
    royalty_liquidation_id = Column(PGUUID(as_uuid=True), ForeignKey("royalty_liquidations.id", ondelete="SET NULL"))
    provider_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    beneficiary_name = Column(Text)
    beneficiary_iban = Column(Text)
    beneficiary_bic = Column(Text)
    concept = Column(Text)
    amount = Column(Numeric, nullable=False, server_default=text("0"))
    # FECHA DE PAGO de ESTE pago (en el fichero del banco es la «fecha de emisión»: el día en que el
    # banco lo ejecuta). Por defecto, el día en que se crea la remesa; se puede cambiar pago a pago.
    payment_date = Column(Date)
    # Visto bueno de dirección a ESTE pago (la remesa se aprueba cuando lo tienen todos).
    approved_at = Column(DateTime(timezone=True))
    approved_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    approved_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("PaymentBatch", back_populates="items")
    expense = relationship("BagExpense")
    provider = relationship("Promoter")

    __table_args__ = (
        Index("idx_payment_batch_items_batch", "batch_id"),
        Index("idx_payment_batch_items_expense", "expense_id"),
    )


class PromotionAlert(Base):
    """Aviso a quien lleva la PRODUCCIÓN de una promoción cuando cambia algo que le afecta (fecha,
    hora o sitio) o cuando se cancela: si no se entera, monta un viaje para una hora que ya no es."""

    __tablename__ = "promotion_alerts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promotion_id = Column(PGUUID(as_uuid=True), ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    activity_id = Column(PGUUID(as_uuid=True), ForeignKey("promotion_activities.id", ondelete="SET NULL"))
    # CHANGE (cambió algo) | CANCELLED (se cae)
    kind = Column(Text, nullable=False, server_default=text("'CHANGE'"))
    message = Column(Text, nullable=False)
    target_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True))

    promotion = relationship("Promotion")

    __table_args__ = (
        Index("idx_promotion_alerts_target", "target_user_id", "read_at"),
        Index("idx_promotion_alerts_promotion", "promotion_id"),
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
    # Cuando TODOS sus gastos están contabilizados (u omitidos) la bolsa se cierra para contabilidad
    # y desaparece de «pendiente de contabilizar».
    accounting_done_at = Column(DateTime(timezone=True))
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
    # Remesa en la que se pagó (o en la que está metido mientras se prepara).
    payment_batch_id = Column(PGUUID(as_uuid=True), ForeignKey("payment_batches.id", ondelete="SET NULL"))
    covered_by = Column(Text, nullable=False, server_default=text("'BOLSA'"))
    cover_detail = Column(Text)
    split_info = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # SUPLIDOS: gastos que el mismo tercero tiene que facturar ADEMÁS de su trabajo (la gasolina de
    # un músico, un taxi…). [{"concept": "...", "amount": 12.5|null}] — sin importe = todavía no se
    # sabe y se le pregunta al subir la factura. ⚠️ NO llevan IVA ni retención: `amount_gross` del
    # gasto los incluye (es lo que hay que facturar y pagar), pero `amount_net`/`amount_tax` son solo
    # la parte con IVA.
    supplements = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
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
    # --- CONTABILIDAD (Holded) ---
    # PENDIENTE | SUBIDO (ya está en Holded) | CONTABILIZADO | OMITIDO (se decidió no contabilizarlo).
    # `accounting_at` es la fecha que se enseña al pasar el ratón por la etiqueta «Contabilizado».
    accounting_status = Column(Text, nullable=False, server_default=text("'PENDIENTE'"))
    accounting_at = Column(DateTime(timezone=True))
    accounting_by_nick = Column(Text)
    accounting_note = Column(Text)
    holded_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    holded_doc_id = Column(Text)
    holded_doc_type = Column(Text)
    holded_doc_number = Column(Text)
    holded_contact_id = Column(Text)
    holded_uploaded_at = Column(DateTime(timezone=True))
    holded_error = Column(Text)
    # Aviso de algo que sí hay que saber aunque el documento se haya creado (p. ej. el total que
    # calcula Holded no cuadra con el nuestro, o el adjunto no ha entrado).
    holded_warning = Column(Text)
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


class BagExpenseInvoice(Base):
    """Imputación de UNA factura a UN gasto de la bolsa.

    Una misma factura puede cubrir VARIOS gastos (y un gasto puede necesitar varias facturas), así
    que la relación va en su propia tabla con el importe imputado a cada uno. Todas las filas de la
    misma factura física comparten `group_key`, que es lo que permite saber «esta factura cubre
    estos tres conceptos» y no repetir el archivo tres veces como si fueran facturas distintas.
    """

    __tablename__ = "bag_expense_invoices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    bag_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("bag_expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    # Identifica la factura física: las filas con el mismo group_key son el mismo documento.
    group_key = Column(Text, nullable=False, index=True)
    # De dónde vino: factura subida por la landing genérica o gasto que llegó a «Mis gastos».
    supplier_invoice_id = Column(PGUUID(as_uuid=True), ForeignKey("supplier_invoices.id", ondelete="SET NULL"))
    personal_expense_id = Column(PGUUID(as_uuid=True), ForeignKey("personal_expenses.id", ondelete="SET NULL"), index=True)
    file_url = Column(Text, nullable=False)
    file_name = Column(Text)
    file_mime = Column(Text)
    invoice_number = Column(Text)
    # Importe de la factura imputado a ESTE gasto (la suma de todas sus filas = total de la factura).
    amount = Column(Numeric, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    expense = relationship("BagExpense")


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

class PartyDebt(Base):
    """ADELANTO o DEUDA de una persona/tercero con una EMPRESA DEL GRUPO.

    Sirve para lo que pidió Dani: cuando hay algo pendiente de pago a alguien, avisar de que la casa
    le ha adelantado dinero o de que tiene una deuda, para poder descontarlo o pararlo antes de
    abonarle. Es una anotación de administración, no un movimiento contable: `amount` es lo pactado y
    `amount_recovered` lo que ya se le ha recuperado (lo pendiente es la diferencia)."""

    __tablename__ = "party_debts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    # ADELANTO (le hemos adelantado dinero) | DEUDA (nos debe algo)
    kind = Column(Text, nullable=False, server_default=text("'ADELANTO'"))
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="CASCADE"), nullable=False)
    # A quién: un TERCERO (proveedor, músico, artista como tercero) o un ARTISTA.
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="CASCADE"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"))
    concept = Column(Text)
    amount = Column(Numeric, nullable=False, server_default=text("0"))
    amount_recovered = Column(Numeric, nullable=False, server_default=text("0"))
    debt_date = Column(Date)
    due_date = Column(Date)
    notes = Column(Text)
    document_url = Column(Text)
    document_name = Column(Text)
    # ABIERTA | CERRADA (recuperada o perdonada)
    status = Column(Text, nullable=False, server_default=text("'ABIERTA'"))
    closed_at = Column(DateTime(timezone=True))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")
    promoter = relationship("Promoter")
    artist = relationship("Artist")

    __table_args__ = (
        Index("idx_party_debts_promoter", "promoter_id", "status"),
        Index("idx_party_debts_artist", "artist_id", "status"),
        Index("idx_party_debts_company", "company_id", "status"),
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
# CONTRATACIÓN — entidades operativas de agrupación y buzón de peticiones.
#   • PurchasedTour  = GIRA COMPRADA por una empresa del grupo (agrupa conciertos).
#   • CycleFestival  = CICLO / FESTIVAL que ORGANIZAMOS (empresa del grupo).
#   • BookingRequest = BUZÓN de peticiones de contratación que llegan a la oficina.
# Los conciertos se enganchan por FK real (Concert.purchased_tour_id /
# Concert.cycle_festival_id), sustituyendo la agrupación frágil por etiqueta/tag.
# ============================================================================

class PurchasedTour(Base):
    """Gira comprada por una empresa del grupo. Agrupa N conciertos por FK real
    (Concert.purchased_tour_id). Su cara promocional es un one-sheet (TourOneSheet
    o el enlace público propio)."""

    __tablename__ = "purchased_tours"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    # Empresa del grupo que compra/gestiona la gira.
    managing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    # Artista principal + lista de artistas participantes.
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    logo_url = Column(Text)
    start_date = Column(Date)
    end_date = Column(Date)
    # ACTIVA | ARCHIVADA
    status = Column(Text, nullable=False, server_default=text("'ACTIVA'"))
    notes = Column(Text)
    slug = Column(Text, unique=True)
    public_token = Column(Text, unique=True)
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    managing_company = relationship("GroupCompany", foreign_keys=[managing_company_id])
    artist = relationship("Artist", foreign_keys=[artist_id])

    __table_args__ = (
        Index("idx_purchased_tours_company", "managing_company_id"),
        Index("idx_purchased_tours_artist", "artist_id"),
        Index("idx_purchased_tours_status", "status"),
    )


class CycleFestival(Base):
    """Ciclo, festival o EVENTO organizado por una empresa del grupo. Agrupa N conciertos por FK real
    (`Concert.cycle_festival_id`), igual que una gira comprada agrupa sus fechas.

    `kind='EVENTO'` es la categoría «Eventos» de Contratación: una gala, una feria, un evento propio…
    Puede ser de una fecha o de varias y, cuando viene de una simulación de EVENTO, `event_id` apunta
    al evento de Bases de datos → Eventos del que salió.
    """

    __tablename__ = "cycle_festivals"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    # FESTIVAL | CICLO | EVENTO
    kind = Column(Text, nullable=False, server_default=text("'FESTIVAL'"))
    # Evento de la base de datos del que sale (solo en kind='EVENTO').
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("app_events.id", ondelete="SET NULL"), index=True)
    managing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    logo_url = Column(Text)
    edition = Column(Text)  # edición / año
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    municipality = Column(Text)
    province = Column(Text)
    start_date = Column(Date)
    end_date = Column(Date)
    # ACTIVO | ARCHIVADO
    status = Column(Text, nullable=False, server_default=text("'ACTIVO'"))
    notes = Column(Text)
    slug = Column(Text, unique=True)
    public_token = Column(Text, unique=True)
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    managing_company = relationship("GroupCompany", foreign_keys=[managing_company_id])
    venue = relationship("Venue", foreign_keys=[venue_id])

    __table_args__ = (
        Index("idx_cycle_festivals_company", "managing_company_id"),
        Index("idx_cycle_festivals_kind", "kind"),
        Index("idx_cycle_festivals_status", "status"),
    )


class BookingRequest(Base):
    """Petición de contratación ENTRANTE (buzón de oficina). Se registra lo que
    llega (artista, fecha aprox., contacto, recinto/ciudad, importe orientativo) y
    se tramita hasta convertirse en un concierto o descartarse."""

    __tablename__ = "booking_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="SET NULL"))
    artist_ids = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # Fecha aproximada: fecha concreta si se conoce + texto libre para lo impreciso.
    requested_date = Column(Date)
    date_text = Column(Text)
    # Quién pide (contacto) y, si es un tercero conocido, su FK.
    contact_name = Column(Text)
    contact_email = Column(Text)
    contact_phone = Column(Text)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    # Ubicación (recinto conocido o texto libre).
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="SET NULL"))
    municipality = Column(Text)
    province = Column(Text)
    # Importe orientativo (texto libre) + resumen y notas.
    fee_text = Column(Text)
    subject = Column(Text)
    notes = Column(Text)
    # EMAIL | TELEFONO | WEB | PRESENCIAL | OTRO
    source = Column(Text)
    # NUEVA | EN_TRAMITE | CONVERTIDA | DESCARTADA
    status = Column(Text, nullable=False, server_default=text("'NUEVA'"))
    # Concierto creado al convertir la petición (si la aceptamos).
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="SET NULL"))
    rejection_reason = Column(Text)
    payload = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    reviewed_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist", foreign_keys=[artist_id])
    promoter = relationship("Promoter", foreign_keys=[promoter_id])
    venue = relationship("Venue", foreign_keys=[venue_id])
    concert = relationship("Concert", foreign_keys=[concert_id])
    requested_by = relationship("User", foreign_keys=[created_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])

    __table_args__ = (
        Index("idx_booking_requests_status_date", "status", "requested_date"),
        Index("idx_booking_requests_artist", "artist_id"),
        Index("idx_booking_requests_concert", "concert_id"),
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
    # Qué es el evento: se enseña en su ficha, que funciona como la de un artista pero con los
    # datos del EVENTO (nunca los del artista espejo, que es solo un detalle de implementación).
    description = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Distributor(Base):
    """Distribuidora digital (Bases de datos → Distribuidoras). Nombre + logo. A cada canción
    o álbum que NO sea colaboración externa se le asigna su distribuidora, y los ADELANTOS de
    Discográfica se liquidan contra el contenido distribuido con ella."""
    __tablename__ = "distributors"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    logo_url = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class DistributorAdvance(Base):
    """Adelanto de una distribuidora (Discográfica → Adelantos): importe entregado a cuenta que
    se RECUPERA (amortiza) con los ingresos del contenido distribuido con esa distribuidora,
    según sus condiciones. Todo lo que no va a amortización es nuestro. El «recuperado» no se
    guarda: se CALCULA con los ingresos por canción (SongRevenueEntry)."""
    __tablename__ = "distributor_advances"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    distributor_id = Column(PGUUID(as_uuid=True), ForeignKey("distributors.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(Text)                       # nombre corto opcional («Adelanto 2026»…)
    amount = Column(Numeric(14, 2), nullable=False, server_default=text("0"))
    advance_date = Column(Date)
    contract_url = Column(Text)                # contrato adjunto (PDF en Storage)
    status = Column(Text, nullable=False, server_default=text("'ACTIVO'"))   # ACTIVO | ARCHIVADO
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    distributor = relationship("Distributor")
    rules = relationship("DistributorAdvanceRule", cascade="all, delete-orphan",
                         order_by="DistributorAdvanceRule.sort_order", backref="advance")
    exceptions = relationship("DistributorAdvanceException", cascade="all, delete-orphan", backref="advance")
    corrections = relationship("DistributorAdvanceCorrection", cascade="all, delete-orphan",
                               order_by="DistributorAdvanceCorrection.correction_date", backref="advance")
    additional_incomes = relationship("DistributorAdvanceIncome", cascade="all, delete-orphan",
                                      order_by="DistributorAdvanceIncome.income_date", backref="advance")


class DistributorAdvanceRule(Base):
    """Condición de recuperación de un adelanto: qué % de los ingresos (sobre BRUTO o NETO) va
    a amortizar, y sobre QUÉ contenido (publicado a partir de una fecha, hasta una fecha, o solo
    ciertos artistas). Un adelanto puede tener varias condiciones; una canción amortiza por la
    PRIMERA condición que la cubre (orden sort_order)."""
    __tablename__ = "distributor_advance_rules"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    advance_id = Column(PGUUID(as_uuid=True), ForeignKey("distributor_advances.id", ondelete="CASCADE"), nullable=False, index=True)
    pct = Column(Numeric(6, 2), nullable=False, server_default=text("100"))
    base = Column(Text, nullable=False, server_default=text("'NET'"))    # NET | GROSS
    date_from = Column(Date)     # contenido publicado A PARTIR de esta fecha (NULL = sin límite)
    date_until = Column(Date)    # contenido publicado HASTA esta fecha (NULL = sin límite)
    artist_ids = Column(JSONB)   # NULL/[] = todos los artistas; lista de uuid = solo esos
    # CARENCIA: cada canción solo amortiza cuando han pasado N meses desde SU publicación
    # (p. ej. 12 = las canciones empiezan a recuperar al año de publicarse). NULL = desde ya.
    min_age_months = Column(Integer)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))


class DistributorAdvanceException(Base):
    """Excepción de un adelanto: artista o canción que NO amortiza aunque las condiciones lo cubran."""
    __tablename__ = "distributor_advance_exceptions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    advance_id = Column(PGUUID(as_uuid=True), ForeignKey("distributor_advances.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Text, nullable=False)        # ARTIST | SONG
    target_id = Column(PGUUID(as_uuid=True), nullable=False)


class DistributorAdvanceCorrection(Base):
    """Corrección MANUAL sobre la cuenta general de amortización de un adelanto: importe con
    signo (positivo = amortiza más; negativo = reduce lo amortizado), con nombre, fecha, nota
    opcional y quién la hizo (usuario, se muestra con su foto)."""
    __tablename__ = "distributor_advance_corrections"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    advance_id = Column(PGUUID(as_uuid=True), ForeignKey("distributor_advances.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(Text, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False, server_default=text("0"))
    correction_date = Column(Date)
    note = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DistributorAdvanceIncome(Base):
    """Ingreso ADICIONAL de un adelanto: un cobro que no viene de los apuntes por canción pero que
    igualmente AMORTIZA el adelanto aplicando una de sus condiciones de recuperación. Se guarda el
    importe en NETO y en BRUTO (el motor usa el que pida la base de la regla elegida: NET→neto,
    GROSS→bruto) y la regla que se aplica (`rule_id`; al crear, si el adelanto tiene una sola
    condición se asigna sola). Lo que amortiza = base × pct de esa regla, y reduce lo pendiente."""
    __tablename__ = "distributor_advance_incomes"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    advance_id = Column(PGUUID(as_uuid=True), ForeignKey("distributor_advances.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(PGUUID(as_uuid=True), ForeignKey("distributor_advance_rules.id", ondelete="SET NULL"), index=True)
    label = Column(Text, nullable=False)
    amount_net = Column(Numeric(14, 2), nullable=False, server_default=text("0"))
    amount_gross = Column(Numeric(14, 2), nullable=False, server_default=text("0"))
    income_date = Column(Date)
    note = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    rule = relationship("DistributorAdvanceRule")


def ensure_distributors_schema():
    """Distribuidoras + adelantos (Discográfica → Adelantos) + columna distributor_id en
    canciones y álbumes. Idempotente."""
    _create_all_once()
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS distributors (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL,
            logo_url text,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS distributor_advances (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            distributor_id uuid NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
            label text,
            amount numeric(14,2) NOT NULL DEFAULT 0,
            advance_date date,
            contract_url text,
            status text NOT NULL DEFAULT 'ACTIVO',
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_dist_advances_distributor ON distributor_advances(distributor_id);",
        """
        CREATE TABLE IF NOT EXISTS distributor_advance_rules (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            advance_id uuid NOT NULL REFERENCES distributor_advances(id) ON DELETE CASCADE,
            pct numeric(6,2) NOT NULL DEFAULT 100,
            base text NOT NULL DEFAULT 'NET',
            date_from date,
            date_until date,
            artist_ids jsonb,
            sort_order integer NOT NULL DEFAULT 0
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_dist_adv_rules_advance ON distributor_advance_rules(advance_id);",
        "ALTER TABLE IF EXISTS distributor_advance_rules ADD COLUMN IF NOT EXISTS min_age_months integer;",
        """
        CREATE TABLE IF NOT EXISTS distributor_advance_exceptions (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            advance_id uuid NOT NULL REFERENCES distributor_advances(id) ON DELETE CASCADE,
            kind text NOT NULL,
            target_id uuid NOT NULL
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_dist_adv_exc_advance ON distributor_advance_exceptions(advance_id);",
        """
        CREATE TABLE IF NOT EXISTS distributor_advance_corrections (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            advance_id uuid NOT NULL REFERENCES distributor_advances(id) ON DELETE CASCADE,
            label text NOT NULL,
            amount numeric(14,2) NOT NULL DEFAULT 0,
            correction_date date,
            note text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_dist_adv_corr_advance ON distributor_advance_corrections(advance_id);",
        """
        CREATE TABLE IF NOT EXISTS distributor_advance_incomes (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            advance_id uuid NOT NULL REFERENCES distributor_advances(id) ON DELETE CASCADE,
            rule_id uuid REFERENCES distributor_advance_rules(id) ON DELETE SET NULL,
            label text NOT NULL,
            amount_net numeric(14,2) NOT NULL DEFAULT 0,
            amount_gross numeric(14,2) NOT NULL DEFAULT 0,
            income_date date,
            note text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_dist_adv_income_advance ON distributor_advance_incomes(advance_id);",
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS distributor_id uuid REFERENCES distributors(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS idx_songs_distributor ON songs(distributor_id);",
        "ALTER TABLE IF EXISTS albums ADD COLUMN IF NOT EXISTS distributor_id uuid REFERENCES distributors(id) ON DELETE SET NULL;",
    ]
    _exec_ddl_statements(stmts, "distributors_schema")


class AppSetting(Base):
    """Ajustes GLOBALES de la app (clave/valor de texto), compartidos por todos los workers.
    Usado, p. ej., para el «modo trabajo» (mantenimiento): key='maintenance_mode', value='1'/'0'."""
    __tablename__ = "app_settings"
    key = Column(Text, primary_key=True)
    value = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


def ensure_app_settings_schema():
    """Tabla de ajustes globales clave/valor. Idempotente."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key text PRIMARY KEY,
            value text,
            updated_at timestamptz DEFAULT now()
        );
        """,
    ], "app_settings")


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
    """Plantilla de categorías por recinto (sin precio; se rellena en cada simulación).

    `seat_map_id` liga la categoría a un FORMATO del recinto (venue_seat_maps: «Formato 360»,
    «Medio aforo»…, subpestañas de la pestaña Ticketing). NULL = legado sin formato: se trata
    como parte del formato PRINCIPAL (is_default)."""
    __tablename__ = "venue_ticket_categories"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    seat_map_id = Column(PGUUID(as_uuid=True), ForeignKey("venue_seat_maps.id", ondelete="CASCADE"), index=True)
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
    """Línea de un set list / plantilla de repertorio, en orden.

    `kind`: SONG (canción), BREAK (línea de parón) o NOTE (nota/agradecimiento). Las canciones
    pueden venir del repertorio del artista (`song_id`) o escritas a mano; `duration_seconds` es la
    duración de la canción (para el recuento total; el PDF no la muestra). `note` es el comentario
    que se enseña bajo la canción (también en el PDF)."""
    __tablename__ = "repertoire_template_items"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    template_id = Column(PGUUID(as_uuid=True), ForeignKey("repertoire_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Text, nullable=False, server_default=text("'SONG'"))  # SONG | BREAK | NOTE
    song_id = Column(PGUUID(as_uuid=True))   # opcional: canción del repertorio del artista
    title = Column(Text, nullable=False, server_default=text("''"))
    note = Column(Text)
    duration_seconds = Column(Integer)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))

    template = relationship("RepertoireTemplate", back_populates="items")


class PushSubscription(Base):
    """Suscripción Web Push de un usuario (un endpoint por navegador/dispositivo)."""
    __tablename__ = "push_subscriptions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))


def ensure_push_schema():
    """Tabla de suscripciones Web Push (idempotente)."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint text NOT NULL UNIQUE,
            p256dh text NOT NULL,
            auth text NOT NULL,
            user_agent text,
            created_at timestamptz DEFAULT now(),
            last_used_at timestamptz
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);",
    ]
    _exec_ddl_statements(stmts, "push")


class AppNotification(Base):
    """AVISO para una persona: le han asignado algo (una tarea, una producción, una solicitud de
    diseño, una petición o una bolsa para liquidar).

    Vive en la app (campanita + aviso emergente) y, si hay claves VAPID, sale además como
    notificación del sistema (en el Mac, la del propio Mac) por Web Push."""

    __tablename__ = "app_notifications"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Text, nullable=False)          # TAREA | PRODUCCION | DISENO | ADMIN_PETICION | ADMIN_BOLSA
    title = Column(Text, nullable=False)
    body = Column(Text)
    url = Column(Text)
    icon = Column(Text)
    # Quién lo provoca (para no avisarse a uno mismo) y a qué se refiere.
    actor_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    ref_type = Column(Text)
    ref_id = Column(Text)
    # `shown_at` = ya ha saltado el aviso emergente; `read_at` = la persona lo ha leído.
    shown_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_app_notifications_user_created", "user_id", "created_at"),
    )


def ensure_notifications_schema():
    """Tabla de AVISOS de la app (idempotente)."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS app_notifications (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind text NOT NULL,
            title text NOT NULL,
            body text,
            url text,
            icon text,
            actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ref_type text,
            ref_id text,
            shown_at timestamptz,
            read_at timestamptz,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_app_notifications_user ON app_notifications(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_app_notifications_user_created ON app_notifications(user_id, created_at);",
        "CREATE INDEX IF NOT EXISTS idx_app_notifications_unread ON app_notifications(user_id) WHERE read_at IS NULL;",
    ]
    _exec_ddl_statements(stmts, "notifications")


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
    # Póster de VÍDEO: fotograma intermedio generado en el servidor (ffmpeg) y subido a Storage. Se
    # usa como miniatura (img) para que el vídeo tenga portada real también en móvil (iOS no puede
    # pintar un fotograma de <video> sin interacción). NULL en fotos y en vídeos aún sin procesar.
    poster_url = Column(Text)

    # Fotógrafo: un tercero (Promoter) o desconocido.
    photographer_promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    photographer_unknown = Column(Boolean, nullable=False, server_default=text("false"))

    taken_date = Column(Date)  # fecha de la foto (no la de subida)
    # sha256 del ARCHIVO ORIGINAL subido: detecta duplicados al volver a subir el mismo
    # contenido (se avisa con la fecha de la subida anterior). NULL en fotos antiguas.
    file_sha256 = Column(Text)
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


class PersonDocument(Base):
    """Documento personal adjunto a una persona: DNI, carnet de conducir, pasaporte, tarjeta de
    fidelización (Renfe, Iberia…) o matrícula de vehículo. Polimórfico: `owner_type` USER (personal de
    oficina) o PROMOTER (tercero). El detalle específico va en los campos comunes + `extra` (JSONB):

    - kind DNI / LICENSE: imágenes por ambas caras (`front_url`/`back_url`), `doc_number`,
      `full_name`, `birth_date`, `expiry_date` (autodetectados por OCR al subir el documento; se
      acepta foto o PDF, incluidas las dos caras en una misma página o en páginas separadas).
    - kind PASSPORT: una sola cara (`front_url`), `doc_number`, `full_name`, `birth_date`,
      `expiry_date` y además `issue_date` (fecha de emisión). OCR del MRZ (TD3) + texto impreso.
    - kind LOYALTY (fidelización): `company` (marca), `doc_number` (nº de tarjeta), `front_url`
      opcional (imagen de la tarjeta); se pinta como tarjeta con el color/logotipo de la marca.
    - kind PLATE (matrícula): `doc_number` (la matrícula) + `label` (nombre del vehículo); se pinta
      con estética de placa española.
    """

    __tablename__ = "person_documents"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    owner_type = Column(Text, nullable=False)   # USER | PROMOTER
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    kind = Column(Text, nullable=False, server_default=text("'DNI'"))  # DNI|LICENSE|PASSPORT|LOYALTY|PLATE
    label = Column(Text)              # nombre del vehículo (PLATE) / etiqueta libre
    company = Column(Text)            # marca de la tarjeta de fidelización (LOYALTY)
    doc_number = Column(Text)         # nº DNI / carnet / pasaporte / tarjeta / matrícula
    full_name = Column(Text)         # nombre y apellidos (DNI/carnet/pasaporte)
    birth_date = Column(Date)
    expiry_date = Column(Date)
    issue_date = Column(Date)         # fecha de emisión (pasaporte)
    address = Column(Text)            # domicilio (DNI)
    front_url = Column(Text)          # anverso / imagen principal
    back_url = Column(Text)           # reverso (DNI/carnet por las dos caras)
    extra = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_by_nick = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_person_documents_owner", "owner_type", "owner_id", "sort_order"),
    )


class PersonDocRequest(Base):
    """Petición a una persona (o tercero) para que suba un DOCUMENTO: la renovación de uno caducado
    (DNI, carnet o pasaporte) o el carnet de conducir cuando se le pide expresamente.

    Se le manda un enlace público: sube las dos caras, se leen el número y las fechas, las confirma y
    el documento nuevo SUSTITUYE al anterior.
    """

    __tablename__ = "person_doc_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    token = Column(Text, nullable=False, unique=True)
    owner_type = Column(Text, nullable=False)          # USER | PROMOTER
    owner_id = Column(PGUUID(as_uuid=True), nullable=False)
    kind = Column(Text, nullable=False)                # DNI | LICENSE | PASSPORT
    # Documento que hay que sustituir (el caducado), si lo hay.
    document_id = Column(PGUUID(as_uuid=True), ForeignKey("person_documents.id", ondelete="SET NULL"))
    reason = Column(Text)                              # EXPIRED | REQUESTED
    status = Column(Text, nullable=False, server_default=text("'ACTIVE'"))   # ACTIVE | DONE | CANCELLED
    requested_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_nick = Column(Text)
    sent_to = Column(Text)
    last_sent_at = Column(DateTime(timezone=True))
    done_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_person_doc_requests_owner", "owner_type", "owner_id", "status"),
    )


def ensure_person_documents_schema():
    """Crea/actualiza la tabla de documentos personales (idempotente, sin Alembic)."""
    _create_all_once()
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS person_documents (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            kind text NOT NULL DEFAULT 'DNI',
            label text,
            company text,
            doc_number text,
            full_name text,
            birth_date date,
            expiry_date date,
            front_url text,
            back_url text,
            extra jsonb NOT NULL DEFAULT '{}'::jsonb,
            sort_order integer NOT NULL DEFAULT 0,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "ALTER TABLE IF EXISTS person_documents ADD COLUMN IF NOT EXISTS issue_date date;",
        "ALTER TABLE IF EXISTS person_documents ADD COLUMN IF NOT EXISTS address text;",
        "CREATE INDEX IF NOT EXISTS idx_person_documents_owner ON person_documents(owner_type, owner_id, sort_order);",
        # Peticiones de documento (renovar uno caducado o pedir el carnet de conducir).
        """
        CREATE TABLE IF NOT EXISTS person_doc_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            token text NOT NULL UNIQUE,
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            kind text NOT NULL,
            document_id uuid REFERENCES person_documents(id) ON DELETE SET NULL,
            reason text,
            status text NOT NULL DEFAULT 'ACTIVE',
            requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            requested_by_nick text,
            sent_to text,
            last_sent_at timestamptz,
            done_at timestamptz,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_person_doc_requests_owner ON person_doc_requests(owner_type, owner_id, status);',
    ]
    _exec_ddl_statements(stmts, "person_documents_schema")


def ensure_fotos_schema():
    """Crea/actualiza las tablas de la galería de fotos (idempotente, sin Alembic)."""
    _create_all_once()
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
        "ALTER TABLE IF EXISTS photos ADD COLUMN IF NOT EXISTS file_sha256 text;",
        "ALTER TABLE IF EXISTS photos ADD COLUMN IF NOT EXISTS poster_url text;",
        "CREATE INDEX IF NOT EXISTS idx_photos_sha ON photos(owner_type, owner_id, file_sha256);",
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


# =====================================================================================
# Arranque del esquema: idempotente, SIN bloquear la web en cada deploy.
#
# PROBLEMA que resuelve: en cada deploy, el contenedor nuevo (sin fichero de cerrojo) reejecutaba
# TODAS las migraciones `ensure_*`. Aunque son idempotentes (`IF NOT EXISTS`), un `ALTER TABLE ...
# ADD COLUMN IF NOT EXISTS` toma un lock ACCESS EXCLUSIVE de la tabla ANTES de comprobar el
# `IF NOT EXISTS`: incluso siendo un no-op, encola detrás de las peticiones en curso y bloquea
# TODAS las lecturas de esa tabla mientras espera (y sin `lock_timeout`, la espera es ilimitada).
# Con decenas de ALTER sobre tablas calientes (concerts/songs/artists/simulations) y la BD remota,
# eso dejaba la web devolviendo 502 varios minutos en cada deploy (los hilos del worker se quedaban
# esperando locks/consultas encoladas). Se arregla en dos frentes, GENERALIZANDO el patrón que ya
# usaba `ensure_discografica_schema`:
#   1) SALTAR el DDL idempotente que ya está aplicado (se lee UNA vez el esquema vivo y se comparan
#      tablas/columnas/índices): en un deploy sin cambios de esquema NO se ejecuta ni un ALTER.
#   2) Acotar la espera de locks (`SET LOCAL lock_timeout`): si una tabla está ocupada, el DDL aborta
#      en vez de encolarse y bloquear a todos; es idempotente, así que se reintenta y, si no, se
#      aplica en el siguiente arranque. Nunca vuelve a colgar la web.
# =====================================================================================

_CREATE_ALL_DONE = False


def _create_all_once():
    """`Base.metadata.create_all` UNA sola vez por proceso.

    Todas las `ensure_*` lo llamaban «a la defensiva», pero como TODOS los modelos ya están definidos
    al importar el módulo, una sola llamada crea todas las tablas que falten. Repetirlo ~12 veces solo
    añadía cientos de round-trips de reflexión contra la BD remota en cada arranque.
    """
    global _CREATE_ALL_DONE
    if _CREATE_ALL_DONE:
        return
    Base.metadata.create_all(bind=engine, checkfirst=True)
    _CREATE_ALL_DONE = True


_SCHEMA_SNAPSHOT = None  # {"tables": set, "columns": {tabla: set}, "indexes": set} | None


def _load_schema_snapshot(force: bool = False):
    """Lee UNA vez (cacheado por proceso) las tablas/columnas/índices existentes en `public`.

    Sirve para saltar el DDL idempotente ya aplicado. Si falla, devuelve None y se ejecuta todo el
    DDL como antes (con `lock_timeout`): degradación segura, nunca peor que el comportamiento previo.
    """
    global _SCHEMA_SNAPSHOT
    if _SCHEMA_SNAPSHOT is not None and not force:
        return _SCHEMA_SNAPSHOT
    snap = {"tables": set(), "columns": {}, "indexes": set()}
    try:
        with engine.connect() as conn:
            for row in conn.exec_driver_sql(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            ):
                snap["tables"].add(row[0])
            for row in conn.exec_driver_sql(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public'"
            ):
                snap["columns"].setdefault(row[0], set()).add(row[1])
            for row in conn.exec_driver_sql(
                "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
            ):
                snap["indexes"].add(row[0])
    except Exception as exc:
        print(f"[schema] no se pudo leer el esquema vivo (se ejecutará todo el DDL): {exc}")
        snap = None
    _SCHEMA_SNAPSHOT = snap
    return snap


_RE_CREATE_TABLE = re.compile(r"create\s+table\s+if\s+not\s+exists\s+([a-z0-9_.\"]+)", re.I)
_RE_CREATE_INDEX = re.compile(r"create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z0-9_.\"]+)", re.I)
_RE_ALTER_TABLE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_.\"]+)\s+(.*)", re.I | re.S)
_RE_ADD_COL = re.compile(r"add\s+column\s+if\s+not\s+exists\s+([a-z0-9_\"]+)", re.I)


def _norm_ident(name: str) -> str:
    return (name or "").strip().strip('"').split(".")[-1].lower()


def _ddl_already_applied(stmt: str, snap) -> bool:
    """True SOLO si podemos PROBAR que el objeto del DDL idempotente ya existe (para saltarlo).

    Conservador por diseño: ante cualquier duda devuelve False (se ejecuta el DDL). Como el snapshot
    solo se toma tras `create_all` y los objetos solo se CREAN durante el arranque (nunca se borran),
    «existe en el snapshot» ⇒ «existe ahora» ⇒ saltarlo es seguro. Nunca salta un cambio nuevo.
    """
    if not snap:
        return False
    s = stmt.strip().rstrip(";").strip()
    low = s.lower()

    m = _RE_CREATE_TABLE.match(low)
    if m:
        return _norm_ident(m.group(1)) in snap["tables"]

    m = _RE_CREATE_INDEX.match(low)
    if m:
        return _norm_ident(m.group(1)) in snap["indexes"]

    m = _RE_ALTER_TABLE.match(s)
    if m:
        table = _norm_ident(m.group(1))
        body = m.group(2)
        cols = _RE_ADD_COL.findall(body)
        if cols:
            # Solo saltamos si el ALTER es EXCLUSIVAMENTE «ADD COLUMN IF NOT EXISTS …» (una o varias)
            # y TODAS esas columnas ya existen. Si mezcla otra operación (ALTER COLUMN, etc.) o hay
            # cualquier ambigüedad, no se salta. Split por comas fuera de paréntesis (p. ej. numeric(10,2)).
            clauses = [c.strip() for c in re.split(r",(?![^()]*\))", body) if c.strip()]
            if clauses and all(re.match(r"add\s+column\s+if\s+not\s+exists\s", c, re.I) for c in clauses):
                have = snap["columns"].get(table, set())
                return all(_norm_ident(c) in have for c in cols)
    return False


def _snapshot_add(snap, stmt: str) -> None:
    """Mantiene el snapshot al día tras aplicar un DDL, para poder saltar dependientes en el mismo arranque."""
    if not snap:
        return
    s = stmt.strip().rstrip(";").strip()
    low = s.lower()
    m = _RE_CREATE_TABLE.match(low)
    if m:
        snap["tables"].add(_norm_ident(m.group(1)))
        return
    m = _RE_CREATE_INDEX.match(low)
    if m:
        snap["indexes"].add(_norm_ident(m.group(1)))
        return
    m = _RE_ALTER_TABLE.match(s)
    if m:
        table = _norm_ident(m.group(1))
        cols = _RE_ADD_COL.findall(m.group(2))
        if cols:
            have = snap["columns"].setdefault(table, set())
            for c in cols:
                have.add(_norm_ident(c))


def _exec_ddl_statements(stmts, label: str = "schema"):
    """Ejecuta DDL idempotente sentencia a sentencia, SIN bloquear la web en cada deploy.

    - Salta lo que ya está aplicado (ver `_ddl_already_applied`): en un deploy sin cambios de esquema
      no se ejecuta ni un ALTER, así que no hay locks ACCESS EXCLUSIVE sobre tablas calientes.
    - Cada sentencia va en su propia transacción con `lock_timeout` acotado: si no consigue el lock
      rápido, aborta y se reintenta unas veces; si aun así no, se aplica en el próximo arranque.
    - Cada sentencia aislada evita que un fallo tardío tire cambios previos ya válidos.
    """

    snap = _load_schema_snapshot()
    for idx, stmt in enumerate(stmts, start=1):
        s = (stmt or "").strip()
        if not s:
            continue
        if _ddl_already_applied(s, snap):
            continue
        applied = False
        for attempt in range(3):
            try:
                with engine.begin() as conn:
                    # Espera de lock acotada: mejor abortar y reintentar que encolar y bloquear TODAS
                    # las lecturas de la tabla durante el deploy (lo que devolvía 502). NO limitamos la
                    # DURACIÓN de la sentencia (statement_timeout) para no matar la creación legítima de
                    # un índice grande la primera vez.
                    conn.exec_driver_sql("SET LOCAL lock_timeout = '3s';")
                    conn.exec_driver_sql(s)
                applied = True
                break
            except Exception as exc:
                msg = str(exc).lower()
                transient = ("lock" in msg or "timeout" in msg or "deadlock" in msg
                             or "canceling statement" in msg)
                if transient and attempt < 2:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                print(f"[schema:{label}] Aviso en sentencia {idx}: {exc}")
                break
        if applied:
            _snapshot_add(snap, s)


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
        "ALTER TABLE IF EXISTS app_events ADD COLUMN IF NOT EXISTS description text;",
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
        # Set list enriquecido (reutilizamos esta tabla para el set list por concierto/acción y para
        # las plantillas de artista/gira): tipo de línea, canción del repertorio y duración.
        "ALTER TABLE repertoire_template_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'SONG';",
        "ALTER TABLE repertoire_template_items ADD COLUMN IF NOT EXISTS song_id uuid;",
        "ALTER TABLE repertoire_template_items ADD COLUMN IF NOT EXISTS duration_seconds integer;",
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
        'ALTER TABLE IF EXISTS artist_contracts ADD COLUMN IF NOT EXISTS contract_url text;',

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
        # Artista ESPEJO de un evento (para que un evento pueda tener actividades) y evento de la
        # actividad. Ver los comentarios de los modelos.
        "ALTER TABLE IF EXISTS artists ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES app_events(id) ON DELETE CASCADE;",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_artists_event ON artists (event_id) WHERE event_id IS NOT NULL;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES app_events(id) ON DELETE SET NULL;",
        # Responsable de producción de la actividad (eventos y fechas de gira sin artista de la casa).
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS production_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS ix_concerts_production_owner ON concerts (production_owner_user_id);",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS end_date date;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS production_activated_at timestamptz;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS created_by_nick text;",
        "CREATE INDEX IF NOT EXISTS ix_concerts_created_by ON concerts (created_by_user_id);",
        # Contenedor de EVENTO (categoría «Eventos» de Contratación): de qué evento sale.
        "ALTER TABLE IF EXISTS cycle_festivals ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES app_events(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS ix_cycle_festivals_event ON cycle_festivals (event_id);",
        "CREATE INDEX IF NOT EXISTS ix_concerts_event ON concerts (event_id);",
        "ALTER TABLE IF EXISTS artist_people ADD COLUMN IF NOT EXISTS birth_date date;",
        # Cada persona del artista ES UN TERCERO que forma parte de él: sus datos (DNI, pasaporte,
        # carnet, tarjetas de fidelización, viaje, cuenta bancaria…) viven en su ficha de tercero y
        # se editan desde la propia ficha del artista.
        "ALTER TABLE IF EXISTS artist_people ADD COLUMN IF NOT EXISTS promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS ix_artist_people_promoter ON artist_people (promoter_id);",
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
        # Miniatura automática del VIDEOCLIP (fotograma sacado con ffmpeg).
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS poster_url text;",
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
        # PITCH DE LANZAMIENTO: el texto con el que se presenta el lanzamiento.
        "ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS pitch_text text, ADD COLUMN IF NOT EXISTS pitch_updated_at timestamptz;",
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
        # Miniatura automática del VIDEOCLIP (fotograma sacado con ffmpeg).
        "ALTER TABLE song_materials ADD COLUMN IF NOT EXISTS poster_url text;",
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
        # Declaración de obra FIRMADA (la que se sube desde Registros → SGAE) y quién la subió.
        """
        ALTER TABLE IF EXISTS songs
            ADD COLUMN IF NOT EXISTS work_declaration_signed boolean NOT NULL DEFAULT false;
        """,
        # REPARTO de la parte autoral entre el autor de Plataforma y Plataforma Musical: por contrato
        # (congelado al registrar) o a mano («reparto especial»).
        """
        ALTER TABLE IF EXISTS song_editorial_shares
            ADD COLUMN IF NOT EXISTS special_split boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS special_pct_author numeric,
            ADD COLUMN IF NOT EXISTS special_pct_platform numeric,
            ADD COLUMN IF NOT EXISTS split_pct_author numeric,
            ADD COLUMN IF NOT EXISTS split_pct_platform numeric,
            ADD COLUMN IF NOT EXISTS split_frozen_at timestamptz;
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

        # Datos alternativos con nombre de un tercero (importador: «conservar los dos»).
        """
        CREATE TABLE IF NOT EXISTS promoter_alt_values (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            field text,
            label text NOT NULL,
            value text NOT NULL,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promoter_alt_values_promoter_id ON promoter_alt_values(promoter_id);',

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
        # Congelado de lo generado + trazabilidad (historial, factura y cobro).
        """
        ALTER TABLE IF EXISTS royalty_liquidations
            ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS snapshot_signature text,
            ADD COLUMN IF NOT EXISTS snapshot_pdf_url text,
            ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS invoice_id uuid,
            ADD COLUMN IF NOT EXISTS invoice_uploaded_at timestamptz,
            ADD COLUMN IF NOT EXISTS paid_at timestamptz;
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
        # PITCH DE LANZAMIENTO del disco.
        "ALTER TABLE IF EXISTS albums ADD COLUMN IF NOT EXISTS pitch_text text, ADD COLUMN IF NOT EXISTS pitch_updated_at timestamptz;",
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

        # País del recinto (alta de recintos con país; por defecto España en los formularios).
        'ALTER TABLE IF EXISTS venues ADD COLUMN IF NOT EXISTS country text;',

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
        # Domicilio del tercero (se autorrellena del DNI al darlo de alta; editable).
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS address text;",
        # Petición especial de hoteles (nota junto a la persona en las rooming lists).
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS hotel_notes text;",
        # Necesidades de viaje (terceros y personal).
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS travel_notes text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS travel_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS travel_departure_flight text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS travel_departure_train text;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS travel_notes text;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS travel_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS travel_departure_flight text;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS travel_departure_train text;",
        # Plazo para asignar gastos a bolsas: parada por persona + histórico de tramos parados.
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS expense_deadline_paused boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS expense_paused_since date;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS expense_pause_log jsonb NOT NULL DEFAULT '[]'::jsonb;",
        # Reparto de las tareas de ADMINISTRACIÓN por persona (liquidar bolsas, pagos, ITAs…).
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS admin_responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS menu_order jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS production_seen_at timestamptz;",
        # Tipo de trabajador a efectos de PRL (autónomo / alta puntual / empresa fija).
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS prl_type text;",
        # Documentación de alta y PRL (personas y empresas del grupo) + peticiones de subida.
        """
        CREATE TABLE IF NOT EXISTS person_compliance_docs (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_type text NOT NULL,
            owner_id uuid NOT NULL,
            doc_type text NOT NULL,
            concert_id uuid REFERENCES concerts(id) ON DELETE SET NULL,
            company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            file_url text NOT NULL,
            original_name text,
            mime_type text,
            valid_from date,
            valid_until date,
            status text NOT NULL DEFAULT 'APPROVED',
            reject_reason text,
            linked_person_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            detected_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
            uploaded_via text NOT NULL DEFAULT 'MANUAL',
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_person_compliance_owner ON person_compliance_docs(owner_type, owner_id);',
        'CREATE INDEX IF NOT EXISTS idx_person_compliance_type ON person_compliance_docs(doc_type);',
        # Documentación de las EMPRESAS DEL GRUPO (ficha de la empresa, pestaña «Documentación»).
        """
        CREATE TABLE IF NOT EXISTS group_company_documents (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            company_id uuid NOT NULL REFERENCES group_companies(id) ON DELETE CASCADE,
            name text NOT NULL,
            file_url text NOT NULL,
            original_name text,
            expiry_date date,
            notes text,
            uploaded_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_group_company_docs_company ON group_company_documents(company_id, expiry_date);',
        # Datos de facturación que el proveedor rellena una vez en /facturacion.
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS bank_account text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS fiscal_address text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS data_consent_at timestamptz;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS billing_updated_at timestamptz;",
        "ALTER TABLE IF EXISTS supplier_invoices ADD COLUMN IF NOT EXISTS issue_date date;",
        "ALTER TABLE IF EXISTS supplier_invoices ADD COLUMN IF NOT EXISTS target_user_id uuid;",
        # Importes leídos de la propia factura al subirla (base, IVA y retención).
        """
        ALTER TABLE IF EXISTS supplier_invoices
            ADD COLUMN IF NOT EXISTS amount_net numeric,
            ADD COLUMN IF NOT EXISTS amount_vat numeric,
            ADD COLUMN IF NOT EXISTS vat_pct numeric,
            ADD COLUMN IF NOT EXISTS retention_amount numeric,
            ADD COLUMN IF NOT EXISTS retention_pct numeric;
        """,
        # Gastos/facturas de una PERSONA pendientes de asignar a una bolsa (formulario y Pleo).
        """
        CREATE TABLE IF NOT EXISTS personal_expenses (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source text NOT NULL DEFAULT 'INVOICE',
            supplier_invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
            pleo_entry_id text,
            concept text,
            provider_name text,
            expense_date date,
            amount_net numeric,
            amount_gross numeric,
            invoice_number text,
            file_url text,
            original_name text,
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            bag_expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL,
            status text NOT NULL DEFAULT 'PENDING',
            received_at timestamptz DEFAULT now(),
            assigned_at timestamptz,
            notified_at timestamptz,
            escalated_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_personal_expenses_user ON personal_expenses(user_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_personal_expenses_bag ON personal_expenses(bag_id, status);',
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_expenses_pleo ON personal_expenses(pleo_entry_id) WHERE pleo_entry_id IS NOT NULL;',
        # Liquidaciones «A FAVOR» nuestro (lo que nos liquidan las compañías externas).
        """
        CREATE TABLE IF NOT EXISTS afavor_liquidations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            company_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            period_start date NOT NULL,
            period_end date NOT NULL,
            status text NOT NULL DEFAULT 'PENDING',
            requested_at timestamptz,
            requested_by_nick text,
            requested_to jsonb NOT NULL DEFAULT '[]'::jsonb,
            invoice_requested_at timestamptz,
            invoice_requested_by_nick text,
            invoice_url text,
            invoice_name text,
            invoice_number text,
            invoice_amount numeric,
            invoice_sent_at timestamptz,
            invoice_sent_to jsonb NOT NULL DEFAULT '[]'::jsonb,
            collected_at timestamptz,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_afavor_company_period UNIQUE (company_id, period_start)
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_afavor_liquidations_period ON afavor_liquidations(period_start, status);',
        # Facturas subidas por los proveedores (landing genérica o petición concreta).
        """
        CREATE TABLE IF NOT EXISTS supplier_invoices (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            source text NOT NULL DEFAULT 'LANDING',
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            bag_expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL,
            invoice_request_id uuid,
            royalty_liquidation_id uuid REFERENCES royalty_liquidations(id) ON DELETE SET NULL,
            artist_text text,
            concept_text text,
            invoice_number text,
            amount_gross numeric,
            group_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            file_url text NOT NULL,
            original_name text,
            mime_type text,
            status text NOT NULL DEFAULT 'PENDIENTE',
            reject_reason text,
            validated_at timestamptz,
            validated_by_nick text,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_supplier_invoices_promoter ON supplier_invoices(promoter_id, status);',
        "ALTER TABLE IF EXISTS supplier_invoices ADD COLUMN IF NOT EXISTS royalty_liquidation_id uuid;",
        # Peticiones de factura a proveedores de una bolsa (enlace público por proveedor).
        """
        CREATE TABLE IF NOT EXISTS bag_invoice_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            public_token text NOT NULL UNIQUE,
            bag_id uuid NOT NULL REFERENCES workflow_bags(id) ON DELETE CASCADE,
            provider_id uuid NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
            expense_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            required_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
            recipients_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            status text NOT NULL DEFAULT 'ACTIVE',
            last_sent_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_invoice_requests_bag ON bag_invoice_requests(bag_id, provider_id);',
        """
        CREATE TABLE IF NOT EXISTS prl_upload_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            public_token text NOT NULL UNIQUE,
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            personnel_id text NOT NULL,
            person_kind text NOT NULL DEFAULT 'MANUAL',
            person_ref uuid,
            person_name text NOT NULL DEFAULT '',
            worker_type text,
            status text NOT NULL DEFAULT 'ACTIVE',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,

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
            ADD COLUMN IF NOT EXISTS seat_map_id uuid,
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
        # LO QUE MANDA EL PROMOTOR va aparte de la ficha de la casa (antes la pisaba), y se apunta
        # cuándo se revisó para poder avisar de que hay algo nuevo que mirar.
        """
        ALTER TABLE IF EXISTS concert_contract_sheets
            ADD COLUMN IF NOT EXISTS promoter_data jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS promoter_reviewed_at timestamptz;
        """,
    ]

    _exec_ddl_statements(stmts, "third_party")

def ensure_minor_auth_schema():
    """AUTORIZACIONES DE ACCESO A MENORES (pestaña «Menores» del ticketing). Idempotente."""
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS minor_auth_configs (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
            age_limit integer NOT NULL DEFAULT 18,
            require_guardian_dni boolean NOT NULL DEFAULT true,
            require_minor_dni boolean NOT NULL DEFAULT true,
            require_email_verification boolean NOT NULL DEFAULT true,
            policy_text text,
            public_token text UNIQUE,
            validate_token text UNIQUE,
            active boolean NOT NULL DEFAULT true,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_minor_auth_configs_concert ON minor_auth_configs(concert_id);',
        'ALTER TABLE IF EXISTS minor_auth_configs ADD COLUMN IF NOT EXISTS validate_token text;',
        """
        CREATE TABLE IF NOT EXISTS minor_authorizations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            config_id uuid NOT NULL REFERENCES minor_auth_configs(id) ON DELETE CASCADE,
            concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
            guardian_kind text NOT NULL DEFAULT 'TUTOR',
            guardian_first_name text,
            guardian_last_name text,
            guardian_doc_number text,
            guardian_birth_date date,
            guardian_phone text,
            guardian_email text,
            guardian_doc_url text,
            escort_is_guardian boolean NOT NULL DEFAULT true,
            escort_first_name text,
            escort_last_name text,
            escort_doc_number text,
            escort_birth_date date,
            escort_phone text,
            escort_email text,
            escort_doc_url text,
            consent_at timestamptz,
            signature_url text,
            declaration_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
            qr_token text UNIQUE,
            status text NOT NULL DEFAULT 'VALID',
            email_sent_at timestamptz,
            validated_at timestamptz,
            validated_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_minor_authorizations_concert ON minor_authorizations(concert_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_minor_authorizations_qr ON minor_authorizations(qr_token);',
        """
        CREATE TABLE IF NOT EXISTS minor_authorization_minors (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            authorization_id uuid NOT NULL REFERENCES minor_authorizations(id) ON DELETE CASCADE,
            first_name text,
            last_name text,
            doc_number text,
            birth_date date,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_minor_authorization_minors_auth ON minor_authorization_minors(authorization_id);',
        'CREATE INDEX IF NOT EXISTS idx_minor_authorization_minors_doc ON minor_authorization_minors(doc_number);',
    ]
    _exec_ddl_statements(stmts, "minor_auth")


def ensure_concert_artwork_schema():
    """Asegura el esquema de cartelería de conciertos."""

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        # Trazabilidad de compartido (con el artista y con el promotor).
        "ALTER TABLE IF EXISTS concert_artwork_requests ADD COLUMN IF NOT EXISTS shared_with_artist_at timestamptz;",
        "ALTER TABLE IF EXISTS concert_artwork_requests ADD COLUMN IF NOT EXISTS shared_with_promoter_at timestamptz;",
        # Vídeo promocional pedido a diseño (descripción + formato vertical/horizontal).
        "ALTER TABLE IF EXISTS concert_artwork_requests ADD COLUMN IF NOT EXISTS video_requested boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS concert_artwork_requests ADD COLUMN IF NOT EXISTS video_notes text;",
        "ALTER TABLE IF EXISTS concert_artwork_requests ADD COLUMN IF NOT EXISTS video_formats jsonb NOT NULL DEFAULT '[]'::jsonb;",

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
        # Cartelería de TODO un grupo (gira comprada / ciclo / festival / evento): una sola solicitud
        # para todas sus fechas. Entonces `concert_id` va vacío y manda (group_kind, group_id).
        """
        ALTER TABLE IF EXISTS concert_artwork_requests
            ADD COLUMN IF NOT EXISTS group_kind text,
            ADD COLUMN IF NOT EXISTS group_id uuid;
        """,
        "ALTER TABLE IF EXISTS concert_artwork_requests ALTER COLUMN concert_id DROP NOT NULL;",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_concert_artwork_group ON concert_artwork_requests (group_kind, group_id) WHERE group_id IS NOT NULL;",
        "CREATE INDEX IF NOT EXISTS ix_concert_artwork_group ON concert_artwork_requests (group_id);",
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
        # Formatos solicitados desde el asistente/ficha (claves de ARTWORK_FORMAT_CHOICES o
        # personalizados) + destinatarios del promotor + nota de rechazo de diseño.
        """
        ALTER TABLE IF EXISTS concert_artwork_requests
            ADD COLUMN IF NOT EXISTS requested_formats jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS recipients_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS correction_notes text;
        """,
        # Validación de diseño + dimensiones de los carteles subidos.
        """
        ALTER TABLE IF EXISTS concert_artwork_assets
            ADD COLUMN IF NOT EXISTS width integer,
            ADD COLUMN IF NOT EXISTS height integer,
            ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'APPROVED';
        """,
        # Carteles subidos a mano: quién los subió (para avisarle si diseño los rechaza) y el
        # resultado de la revisión uno a uno.
        """
        ALTER TABLE IF EXISTS concert_artwork_assets
            ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS uploaded_by_nick text,
            ADD COLUMN IF NOT EXISTS rejection_note text,
            ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
            ADD COLUMN IF NOT EXISTS reviewed_by_nick text;
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_assets_uploader ON concert_artwork_assets(uploaded_by_user_id, validation_status);',
        # Estados nuevos del flujo de validación (REVIEW/CORRECTIONS): rehacer el CHECK.
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='public' AND table_name='concert_artwork_requests'
                  AND constraint_name='chk_concert_artwork_status'
            ) THEN
                ALTER TABLE concert_artwork_requests DROP CONSTRAINT chk_concert_artwork_status;
            END IF;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='concert_artwork_requests'
            ) THEN
                BEGIN
                    ALTER TABLE concert_artwork_requests
                        ADD CONSTRAINT chk_concert_artwork_status
                        CHECK (status IN ('DRAFT', 'PROMOTER', 'REQUESTED', 'REVIEW', 'CORRECTIONS', 'UPLOADED'));
                EXCEPTION WHEN duplicate_object THEN
                    NULL;
                END;
            END IF;
        END $$;
        """,
        # Petición de canales de venta al promotor (links de venta + recordatorio semanal).
        """
        CREATE TABLE IF NOT EXISTS concert_sale_channel_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            concert_id uuid NOT NULL UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
            public_token text NOT NULL UNIQUE,
            status text NOT NULL DEFAULT 'ACTIVE',
            auto_remind boolean NOT NULL DEFAULT true,
            recipients_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            last_sent_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_concert_sale_channel_requests_status ON concert_sale_channel_requests(status);',
        'CREATE INDEX IF NOT EXISTS idx_concert_artwork_assets_is_archived ON concert_artwork_assets(is_archived);',
    ]

    _exec_ddl_statements(stmts, "concert_artwork")




def ensure_personnel_and_operations_schema():
    """Crea tablas de Personal, Promoción y nuevas bases de datos operativas."""
    _create_all_once()
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        # SEGURIDAD: borra cualquier contraseña en claro almacenada históricamente. Ya no se guardan
        # (gestión solo por hash + enlace de restablecimiento); este UPDATE limpia los valores viejos.
        'UPDATE user_security SET password_preview = NULL WHERE password_preview IS NOT NULL;',
        """
        ALTER TABLE IF EXISTS user_profiles
            ADD COLUMN IF NOT EXISTS assigned_artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS assigned_artist_ids_produccion jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS assigned_artist_ids_sello jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS address text;
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
    _create_all_once()
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        # Imputación de facturas a gastos (una factura puede cubrir varios gastos).
        """
        CREATE TABLE IF NOT EXISTS bag_expense_invoices (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            bag_expense_id uuid NOT NULL REFERENCES bag_expenses(id) ON DELETE CASCADE,
            group_key text NOT NULL,
            supplier_invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
            personal_expense_id uuid REFERENCES personal_expenses(id) ON DELETE SET NULL,
            file_url text NOT NULL,
            file_name text,
            file_mime text,
            invoice_number text,
            amount numeric NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_bag_expense_invoices_expense ON bag_expense_invoices(bag_expense_id);",
        "CREATE INDEX IF NOT EXISTS idx_bag_expense_invoices_group ON bag_expense_invoices(group_key);",
        "CREATE INDEX IF NOT EXISTS idx_bag_expense_invoices_personal ON bag_expense_invoices(personal_expense_id);",
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


def ensure_payment_batches_schema():
    """Bancos, cuentas de las empresas del grupo y REMESAS de pago. Idempotente, sin Alembic."""
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS banks (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL,
            logo_url text,
            file_format text NOT NULL DEFAULT 'SEPA_PAIN001',
            bic text,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_banks_name ON banks(name);',
        """
        CREATE TABLE IF NOT EXISTS group_company_bank_accounts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            company_id uuid NOT NULL REFERENCES group_companies(id) ON DELETE CASCADE,
            bank_id uuid REFERENCES banks(id) ON DELETE SET NULL,
            alias text,
            iban text NOT NULL,
            swift_bic text,
            cert_url text,
            cert_name text,
            is_default boolean NOT NULL DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_group_company_bank_accounts_company ON group_company_bank_accounts(company_id);',
        """
        CREATE TABLE IF NOT EXISTS payment_batches (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            reference text NOT NULL,
            company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            account_id uuid REFERENCES group_company_bank_accounts(id) ON DELETE SET NULL,
            bank_id uuid REFERENCES banks(id) ON DELETE SET NULL,
            status text NOT NULL DEFAULT 'BORRADOR',
            execution_date date,
            total_amount numeric NOT NULL DEFAULT 0,
            file_url text,
            file_name text,
            file_format text,
            exported_at timestamptz,
            receipt_url text,
            receipt_name text,
            paid_at timestamptz,
            notes text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_payment_batches_company_status ON payment_batches(company_id, status);',
        """
        CREATE TABLE IF NOT EXISTS payment_batch_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            batch_id uuid NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
            expense_id uuid REFERENCES bag_expenses(id) ON DELETE SET NULL,
            personal_expense_id uuid REFERENCES personal_expenses(id) ON DELETE SET NULL,
            provider_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            beneficiary_name text,
            beneficiary_iban text,
            beneficiary_bic text,
            concept text,
            amount numeric NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_payment_batch_items_batch ON payment_batch_items(batch_id);',
        'CREATE INDEX IF NOT EXISTS idx_payment_batch_items_expense ON payment_batch_items(expense_id);',
        # FECHA DE PAGO por pago (el banco la lee como fecha de EMISIÓN) y visto bueno de dirección,
        # pago a pago y de la remesa entera.
        """
        ALTER TABLE IF EXISTS payment_batch_items
            ADD COLUMN IF NOT EXISTS payment_date date,
            ADD COLUMN IF NOT EXISTS approved_at timestamptz,
            ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS approved_by_nick text;
        """,
        """
        ALTER TABLE IF EXISTS payment_batches
            ADD COLUMN IF NOT EXISTS approved_at timestamptz,
            ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS approved_by_nick text;
        """,
        # Las remesas que ya existían se quedan con la fecha de la propia remesa como fecha de pago.
        """
        UPDATE payment_batch_items i SET payment_date = b.execution_date
          FROM payment_batches b
         WHERE i.batch_id = b.id AND i.payment_date IS NULL AND b.execution_date IS NOT NULL;
        """,
        # Las liquidaciones de royalties validadas se pagan por remesa como cualquier otro pago.
        """
        ALTER TABLE IF EXISTS payment_batch_items
            ADD COLUMN IF NOT EXISTS royalty_liquidation_id uuid REFERENCES royalty_liquidations(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_payment_batch_items_royalty ON payment_batch_items(royalty_liquidation_id);',
        """
        ALTER TABLE IF EXISTS royalty_liquidations
            ADD COLUMN IF NOT EXISTS payment_batch_id uuid REFERENCES payment_batches(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS payment_method text,
            ADD COLUMN IF NOT EXISTS accounted_at timestamptz,
            ADD COLUMN IF NOT EXISTS accounted_by_nick text;
        """,
        'CREATE INDEX IF NOT EXISTS idx_royalty_liquidations_batch ON royalty_liquidations(payment_batch_id);',
        'CREATE INDEX IF NOT EXISTS idx_royalty_liquidations_status ON royalty_liquidations(status);',
        """
        ALTER TABLE IF EXISTS bag_expenses
            ADD COLUMN IF NOT EXISTS payment_batch_id uuid REFERENCES payment_batches(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_bag_expenses_payment_batch ON bag_expenses(payment_batch_id);',
        # Datos bancarios del proveedor: el IBAN ya existía; el BIC hace falta para algunas remesas.
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS bank_bic text;",
        # ADELANTOS / DEUDAS con una empresa del grupo: se avisan al ir a pagar a esa persona.
        """
        CREATE TABLE IF NOT EXISTS party_debts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            kind text NOT NULL DEFAULT 'ADELANTO',
            company_id uuid NOT NULL REFERENCES group_companies(id) ON DELETE CASCADE,
            promoter_id uuid REFERENCES promoters(id) ON DELETE CASCADE,
            artist_id uuid REFERENCES artists(id) ON DELETE CASCADE,
            concept text,
            amount numeric NOT NULL DEFAULT 0,
            amount_recovered numeric NOT NULL DEFAULT 0,
            debt_date date,
            due_date date,
            notes text,
            document_url text,
            document_name text,
            status text NOT NULL DEFAULT 'ABIERTA',
            closed_at timestamptz,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_party_debts_promoter ON party_debts(promoter_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_party_debts_artist ON party_debts(artist_id, status);',
        'CREATE INDEX IF NOT EXISTS idx_party_debts_company ON party_debts(company_id, status);',
    ]
    _exec_ddl_statements(stmts, "payment_batches")


def ensure_promocion_prensa_schema():
    """PROMOCIÓN de prensa (entrevistas, junts de prensa, phoners) sobre las tablas de Marketing.

    `promotions.kind` separa las campañas de pago (MARKETING) de la promoción de prensa (PROMO), y
    cada entrevista es una `promotion_activities` con su modalidad, ubicación, formación y caché.
    Idempotente, como todos los `ensure_*`."""
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS media_locations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            media_id uuid NOT NULL REFERENCES media_outlets(id) ON DELETE CASCADE,
            name text NOT NULL,
            address text,
            municipality text,
            province text,
            notes text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_media_locations_media ON media_locations(media_id);',
        """
        ALTER TABLE IF EXISTS promotions
            ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'MARKETING',
            ADD COLUMN IF NOT EXISTS name text,
            ADD COLUMN IF NOT EXISTS promo_status text NOT NULL DEFAULT 'BORRADOR',
            ADD COLUMN IF NOT EXISTS escort_kind text NOT NULL DEFAULT 'NONE',
            ADD COLUMN IF NOT EXISTS escort_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS escort_promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS escort_note text,
            ADD COLUMN IF NOT EXISTS production_needed boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS production_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS production_request_id uuid REFERENCES production_requests(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotions_kind_status ON promotions(kind, status, target_date);',
        """
        ALTER TABLE IF EXISTS promotion_activities
            ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'BORRADOR',
            ADD COLUMN IF NOT EXISTS modality text,
            ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES media_locations(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS location_name text,
            ADD COLUMN IF NOT EXISTS location_address text,
            ADD COLUMN IF NOT EXISTS formation_kind text,
            ADD COLUMN IF NOT EXISTS musicians_count integer NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS promoter_costs_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS roadmap_item_id text,
            ADD COLUMN IF NOT EXISTS registration_declared_done boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS registration_declared_at timestamptz;
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotion_activities_declare ON promotion_activities(registration_declared_done, activity_date);',
        """
        ALTER TABLE IF EXISTS production_requests
            ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
        """,
        'CREATE INDEX IF NOT EXISTS idx_production_requests_owner ON production_requests(owner_user_id, status);',
        """
        CREATE TABLE IF NOT EXISTS promotion_alerts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
            activity_id uuid REFERENCES promotion_activities(id) ON DELETE SET NULL,
            kind text NOT NULL DEFAULT 'CHANGE',
            message text NOT NULL,
            target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            read_at timestamptz
        );
        """,
        'CREATE INDEX IF NOT EXISTS idx_promotion_alerts_target ON promotion_alerts(target_user_id, read_at);',
        'CREATE INDEX IF NOT EXISTS idx_promotion_alerts_promotion ON promotion_alerts(promotion_id);',
        # Lo que ya había creado es marketing: la promoción de prensa nace con este lote.
        """
        UPDATE promotions
           SET kind = 'MARKETING'
         WHERE kind IS NULL OR kind = '';
        """,
    ]
    _exec_ddl_statements(stmts, "promocion_prensa")


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
    _create_all_once()
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
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS supplements jsonb NOT NULL DEFAULT '[]'::jsonb;",
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
        "ALTER TABLE IF EXISTS concert_budget_items ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1;",
        "ALTER TABLE IF EXISTS concert_budget_items ADD COLUMN IF NOT EXISTS iva_pct numeric NOT NULL DEFAULT 21;",
        "ALTER TABLE IF EXISTS concert_budget_items ADD COLUMN IF NOT EXISTS iva_exempt boolean NOT NULL DEFAULT false;",
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


def ensure_activities_grouping_schema():
    """Entidades de agrupación de contratación (giras compradas, ciclos/festivales)
    y el BUZÓN de peticiones de contratación, más el enganche por FK real en
    `concerts` (purchased_tour_id / cycle_festival_id). Idempotente y best-effort."""
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS purchased_tours (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL,
            managing_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            logo_url text,
            start_date date,
            end_date date,
            status text NOT NULL DEFAULT 'ACTIVA',
            notes text,
            slug text UNIQUE,
            public_token text UNIQUE,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_purchased_tours_company ON purchased_tours(managing_company_id);",
        "CREATE INDEX IF NOT EXISTS idx_purchased_tours_artist ON purchased_tours(artist_id);",
        "CREATE INDEX IF NOT EXISTS idx_purchased_tours_status ON purchased_tours(status);",
        """
        CREATE TABLE IF NOT EXISTS cycle_festivals (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name text NOT NULL,
            kind text NOT NULL DEFAULT 'FESTIVAL',
            managing_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
            logo_url text,
            edition text,
            venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
            municipality text,
            province text,
            start_date date,
            end_date date,
            status text NOT NULL DEFAULT 'ACTIVO',
            notes text,
            slug text UNIQUE,
            public_token text UNIQUE,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_cycle_festivals_company ON cycle_festivals(managing_company_id);",
        "CREATE INDEX IF NOT EXISTS idx_cycle_festivals_kind ON cycle_festivals(kind);",
        "CREATE INDEX IF NOT EXISTS idx_cycle_festivals_status ON cycle_festivals(status);",
        """
        CREATE TABLE IF NOT EXISTS booking_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            artist_id uuid REFERENCES artists(id) ON DELETE SET NULL,
            artist_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
            requested_date date,
            date_text text,
            contact_name text,
            contact_email text,
            contact_phone text,
            promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
            municipality text,
            province text,
            fee_text text,
            subject text,
            notes text,
            source text,
            status text NOT NULL DEFAULT 'NUEVA',
            concert_id uuid REFERENCES concerts(id) ON DELETE SET NULL,
            rejection_reason text,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            received_at timestamptz DEFAULT now(),
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by_nick text,
            reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            reviewed_by_nick text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_booking_requests_status_date ON booking_requests(status, requested_date);",
        "CREATE INDEX IF NOT EXISTS idx_booking_requests_artist ON booking_requests(artist_id);",
        "CREATE INDEX IF NOT EXISTS idx_booking_requests_concert ON booking_requests(concert_id);",
        # Enganche por FK real en concerts (tras existir las tablas destino).
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS purchased_tour_id uuid REFERENCES purchased_tours(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS concerts ADD COLUMN IF NOT EXISTS cycle_festival_id uuid REFERENCES cycle_festivals(id) ON DELETE SET NULL;",
        "CREATE INDEX IF NOT EXISTS idx_concerts_purchased_tour ON concerts(purchased_tour_id);",
        "CREATE INDEX IF NOT EXISTS idx_concerts_cycle_festival ON concerts(cycle_festival_id);",
    ]
    _exec_ddl_statements(stmts, "activities_grouping")


def init_db():
    _create_all_once()


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
    _create_all_once()
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
    _create_all_once()
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
    _create_all_once()
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
        "ALTER TABLE invitation_tickets ADD COLUMN IF NOT EXISTS added_after_send boolean NOT NULL DEFAULT false;",
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
    _create_all_once()
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
    _create_all_once()
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
    _create_all_once()
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
        # Formatos: cada categoría clásica puede pertenecer a un formato (mapa) del recinto.
        "ALTER TABLE venue_ticket_categories ADD COLUMN IF NOT EXISTS seat_map_id uuid REFERENCES venue_seat_maps(id) ON DELETE CASCADE;",
        "CREATE INDEX IF NOT EXISTS idx_venue_ticket_categories_map ON venue_ticket_categories(seat_map_id);",
        # FORMATO que usa cada ACTIVIDAD (un recinto puede tener varios). La columna se añade con el
        # resto de las de `concerts`, pero la clave ajena va aquí: en una base recién creada
        # `venue_seat_maps` todavía no existía cuando corrió aquel bloque.
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_concerts_seat_map') THEN
                ALTER TABLE concerts ADD CONSTRAINT fk_concerts_seat_map
                    FOREIGN KEY (seat_map_id) REFERENCES venue_seat_maps(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """,
        "CREATE INDEX IF NOT EXISTS idx_concerts_seat_map ON concerts(seat_map_id);",
    ], "venue_seatmap")



# =========================================================
# Integración ENTERTICKET (ticketera del grupo): venta de entradas en tiempo casi real.
# El espejo local de la API vive en estas tablas; la sincronización la hace app.py
# (enterticket_utils.py es el cliente HTTP). Todo desactivable: sin credenciales no se sincroniza.
# =========================================================
class EnterticketMeta(Base):
    """Fila única (id=1): token compartido entre workers (la API solo admite UN token activo)
    y estado global de la sincronización."""

    __tablename__ = "enterticket_meta"
    id = Column(Integer, primary_key=True)
    token = Column(Text)
    token_expires_at = Column(Text)  # texto tal cual lo devuelve la API ("YYYY-MM-DD HH:MM:SS")
    last_catalog_sync_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class EnterticketEvent(Base):
    """Evento del cliente en Enterticket (espejo de /eventos). Puede estar VINCULADO a un
    concierto nuestro (matching por artista + recinto + fecha) o pendiente/ignorado/solicitado
    (petición a Contratación para crearlo)."""

    __tablename__ = "enterticket_events"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    et_event_id = Column(Integer, nullable=False, unique=True)
    et_client_id = Column(Integer)
    name = Column(Text, nullable=False)
    event_date = Column(Date)
    event_end_date = Column(Date)
    start_time = Column(Text)
    venue_name = Column(Text)
    venue_town = Column(Text)
    venue_province = Column(Text)
    url_enterticket = Column(Text)      # enlace público de venta
    image_url = Column(Text)            # cabecera/cartel del evento en ET
    artist_names = Column(Text)         # "A, B" (de /eventos/:id/artistas), para el matching
    artist_image = Column(Text)
    active = Column(Boolean, nullable=False, server_default=text("true"))
    has_seat_mapping = Column(Boolean, nullable=False, server_default=text("false"))
    capacity_on_sale = Column(Integer)  # info.numero_entradas (aforo a la venta)
    blocked_count = Column(Integer, nullable=False, server_default=text("0"))
    blocked_json = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))

    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="SET NULL"))
    # PENDING (sin vincular) | LINKED | IGNORED | REQUESTED (petición a Contratación creada)
    link_status = Column(Text, nullable=False, server_default=text("'PENDING'"))
    booking_request_id = Column(PGUUID(as_uuid=True), ForeignKey("booking_requests.id", ondelete="SET NULL"))

    # Sincronización incremental de ventas: último id visto (desde_id) y última marca updated_at.
    sales_last_id = Column(BigInteger, nullable=False, server_default=text("0"))
    sales_last_sync_unix = Column(BigInteger, nullable=False, server_default=text("0"))
    last_synced_at = Column(DateTime(timezone=True))
    last_error = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    concert = relationship("Concert")
    ticket_types = relationship(
        "EnterticketTicketType", cascade="all, delete-orphan",
        order_by="EnterticketTicketType.sort_order", back_populates="event",
    )


class EnterticketTicketType(Base):
    """Tipo de entrada del evento en ET (espejo de /eventos/:id → entradas[]), con el estado de
    venta actual: vendidas / disponibles / precio. Se refresca entero en cada sincronización."""

    __tablename__ = "enterticket_ticket_types"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("enterticket_events.id", ondelete="CASCADE"), nullable=False)
    et_entrada_id = Column(Integer, nullable=False)
    name = Column(Text, nullable=False)
    price = Column(Numeric, nullable=False, server_default=text("0"))
    qty_sold = Column(Integer, nullable=False, server_default=text("0"))
    qty_available = Column(Integer, nullable=False, server_default=text("0"))  # restantes
    is_numbered = Column(Boolean, nullable=False, server_default=text("false"))
    color = Column(Text)
    accesses = Column(Integer, nullable=False, server_default=text("0"))
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("EnterticketEvent", back_populates="ticket_types")

    __table_args__ = (
        UniqueConstraint("event_id", "et_entrada_id", name="uq_et_ticket_type"),
    )


class EnterticketSale(Base):
    """Una entrada vendida en ET (espejo de /ventas/:id). De aquí salen el histórico diario,
    las «vendidas hoy», la recaudación, las invitaciones por concepto, el plano en tiempo real
    (sector/asiento) y la base de datos de compradores."""

    __tablename__ = "enterticket_sales"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("enterticket_events.id", ondelete="CASCADE"), nullable=False)
    et_sale_id = Column(BigInteger, nullable=False)
    et_entrada_id = Column(Integer)
    entrada_name = Column(Text)
    purchase_at = Column(DateTime)  # hora local ES tal cual la da la API
    price = Column(Numeric, nullable=False, server_default=text("0"))
    fees = Column(Numeric, nullable=False, server_default=text("0"))          # gastos_distribucion
    total = Column(Numeric, nullable=False, server_default=text("0"))         # precio_total
    mode = Column(Text)                    # Online / Taquilla / RRPP...
    is_invitation = Column(Boolean, nullable=False, server_default=text("false"))
    invitation_concept = Column(Text)
    cancelled = Column(Boolean, nullable=False, server_default=text("false"))  # anulada
    refunded = Column(Boolean, nullable=False, server_default=text("false"))   # devuelta
    sector = Column(Text)
    seat = Column(Text)
    buyer_name = Column(Text)
    buyer_email = Column(Text)             # se guarda en minúsculas
    buyer_phone = Column(Text)
    buyer_postal_code = Column(Text)
    accepts_marketing = Column(Boolean, nullable=False, server_default=text("false"))
    updated_at_unix = Column(BigInteger, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("event_id", "et_sale_id", name="uq_et_sale"),
        Index("idx_et_sales_event_day", "event_id", "purchase_at"),
        Index("idx_et_sales_event_type", "event_id", "et_entrada_id"),
        Index("idx_et_sales_email", "buyer_email"),
    )


class Buyer(Base):
    """Base de datos de COMPRADORES (deduplicada por email): si una persona compra para varios
    eventos no se duplica, se amplía su historial (BuyerEvent). Los agregados se recalculan en
    cada sincronización a partir de enterticket_sales (ventas válidas: ni anuladas ni devueltas)."""

    __tablename__ = "buyers"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    email = Column(Text, nullable=False, unique=True)  # minúsculas
    name = Column(Text)
    phone = Column(Text)
    accepts_marketing = Column(Boolean, nullable=False, server_default=text("false"))
    events_count = Column(Integer, nullable=False, server_default=text("0"))
    tickets_count = Column(Integer, nullable=False, server_default=text("0"))
    amount_total = Column(Numeric, nullable=False, server_default=text("0"))
    first_purchase_at = Column(DateTime)
    last_purchase_at = Column(DateTime)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("BuyerEvent", cascade="all, delete-orphan", back_populates="buyer")


class BuyerEvent(Base):
    """Historial de un comprador en UN evento (entradas e importe)."""

    __tablename__ = "buyer_events"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    buyer_id = Column(PGUUID(as_uuid=True), ForeignKey("buyers.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(PGUUID(as_uuid=True), ForeignKey("enterticket_events.id", ondelete="CASCADE"), nullable=False)
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="SET NULL"))  # denormalizado
    tickets_count = Column(Integer, nullable=False, server_default=text("0"))
    amount_total = Column(Numeric, nullable=False, server_default=text("0"))
    first_purchase_at = Column(DateTime)
    last_purchase_at = Column(DateTime)

    buyer = relationship("Buyer", back_populates="events")
    event = relationship("EnterticketEvent")

    __table_args__ = (
        UniqueConstraint("buyer_id", "event_id", name="uq_buyer_event"),
        Index("idx_buyer_events_event", "event_id"),
    )


def ensure_enterticket_schema():
    """Esquema de la integración Enterticket + base de datos de compradores. Idempotente."""
    _create_all_once()
    _exec_ddl_statements([
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS enterticket_meta (
            id integer PRIMARY KEY,
            token text,
            token_expires_at text,
            last_catalog_sync_at timestamptz,
            last_error text,
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS enterticket_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            et_event_id integer NOT NULL UNIQUE,
            et_client_id integer,
            name text NOT NULL,
            event_date date,
            event_end_date date,
            start_time text,
            venue_name text,
            venue_town text,
            venue_province text,
            url_enterticket text,
            image_url text,
            artist_names text,
            artist_image text,
            active boolean NOT NULL DEFAULT true,
            has_seat_mapping boolean NOT NULL DEFAULT false,
            capacity_on_sale integer,
            blocked_count integer NOT NULL DEFAULT 0,
            blocked_json jsonb NOT NULL DEFAULT '[]'::jsonb,
            concert_id uuid REFERENCES concerts(id) ON DELETE SET NULL,
            link_status text NOT NULL DEFAULT 'PENDING',
            booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
            sales_last_id bigint NOT NULL DEFAULT 0,
            sales_last_sync_unix bigint NOT NULL DEFAULT 0,
            last_synced_at timestamptz,
            last_error text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_et_events_concert ON enterticket_events(concert_id);",
        "CREATE INDEX IF NOT EXISTS idx_et_events_status ON enterticket_events(link_status, event_date);",
        """
        CREATE TABLE IF NOT EXISTS enterticket_ticket_types (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_id uuid NOT NULL REFERENCES enterticket_events(id) ON DELETE CASCADE,
            et_entrada_id integer NOT NULL,
            name text NOT NULL,
            price numeric NOT NULL DEFAULT 0,
            qty_sold integer NOT NULL DEFAULT 0,
            qty_available integer NOT NULL DEFAULT 0,
            is_numbered boolean NOT NULL DEFAULT false,
            color text,
            accesses integer NOT NULL DEFAULT 0,
            sort_order integer NOT NULL DEFAULT 0,
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_et_ticket_type UNIQUE(event_id, et_entrada_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS enterticket_sales (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_id uuid NOT NULL REFERENCES enterticket_events(id) ON DELETE CASCADE,
            et_sale_id bigint NOT NULL,
            et_entrada_id integer,
            entrada_name text,
            purchase_at timestamp,
            price numeric NOT NULL DEFAULT 0,
            fees numeric NOT NULL DEFAULT 0,
            total numeric NOT NULL DEFAULT 0,
            mode text,
            is_invitation boolean NOT NULL DEFAULT false,
            invitation_concept text,
            cancelled boolean NOT NULL DEFAULT false,
            refunded boolean NOT NULL DEFAULT false,
            sector text,
            seat text,
            buyer_name text,
            buyer_email text,
            buyer_phone text,
            buyer_postal_code text,
            accepts_marketing boolean NOT NULL DEFAULT false,
            updated_at_unix bigint NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(),
            CONSTRAINT uq_et_sale UNIQUE(event_id, et_sale_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_et_sales_event_day ON enterticket_sales(event_id, purchase_at);",
        "CREATE INDEX IF NOT EXISTS idx_et_sales_event_type ON enterticket_sales(event_id, et_entrada_id);",
        "CREATE INDEX IF NOT EXISTS idx_et_sales_email ON enterticket_sales(buyer_email);",
        """
        CREATE TABLE IF NOT EXISTS buyers (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            email text NOT NULL UNIQUE,
            name text,
            phone text,
            accepts_marketing boolean NOT NULL DEFAULT false,
            events_count integer NOT NULL DEFAULT 0,
            tickets_count integer NOT NULL DEFAULT 0,
            amount_total numeric NOT NULL DEFAULT 0,
            first_purchase_at timestamp,
            last_purchase_at timestamp,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS buyer_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            buyer_id uuid NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
            event_id uuid NOT NULL REFERENCES enterticket_events(id) ON DELETE CASCADE,
            concert_id uuid REFERENCES concerts(id) ON DELETE SET NULL,
            tickets_count integer NOT NULL DEFAULT 0,
            amount_total numeric NOT NULL DEFAULT 0,
            first_purchase_at timestamp,
            last_purchase_at timestamp,
            CONSTRAINT uq_buyer_event UNIQUE(buyer_id, event_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_buyer_events_event ON buyer_events(event_id);",
        # Enlace de venta por ticketera×concierto (lo rellena la integración al vincular).
        "ALTER TABLE IF EXISTS concert_ticketers ADD COLUMN IF NOT EXISTS sale_url text;",
        # Tipos de entrada CREADOS por el espejo de Enterticket (solo esos se sobrescriben/borran).
        "ALTER TABLE IF EXISTS concert_ticket_types ADD COLUMN IF NOT EXISTS et_managed boolean NOT NULL DEFAULT false;",
    ], "enterticket")



# ===========================================================================
#  PLEO · importación automática de los gastos del personal
#  ------------------------------------------------------------------------
#  Hay UNA cuenta de Pleo por empresa del grupo y cada persona tiene su usuario
#  en cada una de ellas. Por eso la credencial y el `company_id` se guardan por
#  empresa (`PleoAccount`) y la correspondencia empleado-de-Pleo → usuario de la
#  app se resuelve por CORREO y queda registrada (`PleoEmployeeLink`), para poder
#  arreglar a mano los casos en que el correo de Pleo no es el de la app.
#  Los gastos importados aterrizan en `personal_expenses` (source='PLEO'), con
#  UNIQUE sobre `pleo_entry_id`: eso es lo que garantiza que nunca se dupliquen.
# ===========================================================================

class PleoAccount(Base):
    """Credencial y estado de sincronización de la cuenta de Pleo de UNA empresa del grupo."""

    __tablename__ = "pleo_accounts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    group_company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("group_companies.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    # IDs de Pleo. `pleo_company_id` es obligatorio para poder pedir nada: TODA llamada de
    # contabilidad va con el company_id de la entidad legal.
    pleo_company_id = Column(Text)
    pleo_organization_id = Column(Text)
    # "Standalone API Key" (formato pls_…). Puede ser la MISMA en varias empresas si Pleo la emite
    # con acceso a todas las entidades del grupo.
    api_key = Column(Text)
    is_active = Column(Boolean, nullable=False, server_default=text("false"))
    # Si es true, un gasto solo entra en «Mis gastos» cuando ya tiene justificante en Pleo.
    require_receipt = Column(Boolean, nullable=False, server_default=text("false"))
    # Días hacia atrás que revisa cada sondeo (los antiguos incompletos se repescan aparte).
    sync_window_days = Column(Integer, nullable=False, server_default=text("45"))
    # Volcado histórico: desde cuándo queremos traer y hasta dónde se ha llegado ya.
    backfill_from = Column(Date)
    backfill_done_from = Column(Date)
    # Estado del último sondeo (se muestra en Integraciones).
    last_sync_at = Column(DateTime(timezone=True))
    last_sync_ok = Column(Boolean)
    last_error = Column(Text)
    last_stats = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_employees_sync_at = Column(DateTime(timezone=True))
    last_catalog_sync_at = Column(DateTime(timezone=True))
    # Cachés del catálogo de la empresa (se refrescan a diario):
    #   tax_codes: {tax_code_id: {"rate": "0.21", "type": "inclusive", "name": …, "code": …}}
    #   tag_catalog: {tag_id: {"group": "Artista", "value": "Nombre"}}
    tax_codes = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    tag_catalog = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    group_company = relationship("GroupCompany")


class PleoEmployeeLink(Base):
    """Empleado de Pleo (en UNA empresa) y a qué usuario de la app corresponde.

    La misma persona tiene un `pleo_employee_id` distinto en cada empresa del grupo, así que hay una
    fila por empresa y empleado. El emparejamiento normal es por correo (`AUTO_EMAIL`); si el correo
    de Pleo no está en la app, la fila queda sin `user_id` y sale en Integraciones para vincularla a
    mano (`MANUAL`) o descartarla (`IGNORED`).
    """

    __tablename__ = "pleo_employee_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    account_id = Column(PGUUID(as_uuid=True), ForeignKey("pleo_accounts.id", ondelete="CASCADE"), nullable=False)
    pleo_employee_id = Column(Text, nullable=False)
    email = Column(Text)
    first_name = Column(Text)
    last_name = Column(Text)
    code = Column(Text)                    # ID externo del empleado en Pleo
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    match_mode = Column(Text, nullable=False, server_default=text("'NONE'"))   # AUTO_EMAIL|MANUAL|IGNORED|NONE
    last_seen_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("PleoAccount")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("account_id", "pleo_employee_id", name="uq_pleo_employee"),
        Index("idx_pleo_employee_links_user", "user_id"),
    )


class CabifyAccount(Base):
    """Credencial y estado de sincronización de la cuenta de Cabify de UNA empresa del grupo.

    Una cuenta por empresa: cada una tiene sus credenciales, sus empleados y su facturación.
    `base_url` es editable porque la URL de PRODUCCIÓN la entrega Cabify al conceder el acceso y no
    es pública (la de sandbox sí: https://cabify-sandbox.com).
    """

    __tablename__ = "cabify_accounts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    group_company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("group_companies.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    base_url = Column(Text)
    client_id = Column(Text)
    client_secret = Column(Text)
    currency = Column(Text, nullable=False, server_default=text("'EUR'"))
    is_active = Column(Boolean, nullable=False, server_default=text("false"))
    # Días hacia atrás que revisa cada sondeo.
    sync_window_days = Column(Integer, nullable=False, server_default=text("45"))
    # Volcado histórico: desde cuándo traer y hasta dónde se ha llegado ya.
    backfill_from = Column(Date)
    backfill_done_from = Column(Date)
    last_sync_at = Column(DateTime(timezone=True))
    last_sync_ok = Column(Boolean)
    last_error = Column(Text)
    last_stats = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")


class CabifyUserLink(Base):
    """Empleado de Cabify (en UNA cuenta) y a qué usuario de la app corresponde.

    El emparejamiento normal es por CORREO (`AUTO_EMAIL`): la gente de la cuenta de empresa está
    dada de alta en Cabify con su correo de la empresa del grupo. Si ese correo no está en la app,
    la fila queda sin `user_id` y sale en Integraciones para vincularla a mano o descartarla.
    """

    __tablename__ = "cabify_user_links"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    account_id = Column(PGUUID(as_uuid=True), ForeignKey("cabify_accounts.id", ondelete="CASCADE"), nullable=False)
    cabify_user_id = Column(Text, nullable=False)
    email = Column(Text)
    first_name = Column(Text)
    last_name = Column(Text)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    match_mode = Column(Text, nullable=False, server_default=text("'NONE'"))   # AUTO_EMAIL|MANUAL|IGNORED|NONE
    last_seen_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    account = relationship("CabifyAccount")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("account_id", "cabify_user_id", name="uq_cabify_user"),
        Index("idx_cabify_user_links_user", "user_id"),
    )


def ensure_cabify_schema():
    """Crea/actualiza el esquema de la integración con Cabify (idempotente, sin Alembic)."""
    _create_all_once()
    _exec_ddl_statements([
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS cabify_sale_code text;",
        # Un VIAJE de Cabify puede generar varias ventas (trayecto + suplementos): el gasto es uno
        # por viaje, con el total sumado y la lista de ventas ya aplicadas.
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS cabify_journey_id text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS cabify_sale_codes jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "CREATE INDEX IF NOT EXISTS idx_personal_expenses_cabify_journey ON personal_expenses(cabify_journey_id);",
        # Gastos DIRECTOS (no van a ninguna bolsa): gasto de oficina o inversión en un artista.
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS direct_target text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS direct_artist_id uuid REFERENCES artists(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validation_status text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validation_note text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validation_requested_at timestamptz;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validated_at timestamptz;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS validated_by_nick text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS no_invoice_reason text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS no_invoice_status text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'NO_PAGADO';",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS paid_at timestamptz;",
        "CREATE INDEX IF NOT EXISTS idx_personal_expenses_validation ON personal_expenses(validation_status, direct_target);",
        # Antiduplicados de verdad: el mismo viaje no puede entrar dos veces.
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_expenses_cabify "
        "ON personal_expenses(cabify_sale_code) WHERE cabify_sale_code IS NOT NULL;",
    ], "cabify")


def ensure_pleo_schema():
    """Crea/actualiza el esquema de la integración con Pleo (idempotente, sin Alembic)."""
    _create_all_once()
    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS pleo_accounts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            group_company_id uuid NOT NULL UNIQUE REFERENCES group_companies(id) ON DELETE CASCADE,
            pleo_company_id text,
            pleo_organization_id text,
            api_key text,
            is_active boolean NOT NULL DEFAULT false,
            require_receipt boolean NOT NULL DEFAULT false,
            sync_window_days integer NOT NULL DEFAULT 45,
            backfill_from date,
            backfill_done_from date,
            last_sync_at timestamptz,
            last_sync_ok boolean,
            last_error text,
            last_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
            last_employees_sync_at timestamptz,
            last_catalog_sync_at timestamptz,
            tax_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
            tag_catalog jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS pleo_employee_links (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            account_id uuid NOT NULL REFERENCES pleo_accounts(id) ON DELETE CASCADE,
            pleo_employee_id text NOT NULL,
            email text,
            first_name text,
            last_name text,
            code text,
            user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            match_mode text NOT NULL DEFAULT 'NONE',
            last_seen_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            CONSTRAINT uq_pleo_employee UNIQUE(account_id, pleo_employee_id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_pleo_employee_links_user ON pleo_employee_links(user_id);",
        # --- Gastos personales: todo lo que aporta Pleo ---
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_account_id uuid REFERENCES pleo_accounts(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_company_id text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_employee_id text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_updated_at timestamptz;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_status text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_family text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_subfamily text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_review_status text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_note text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_tags jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_receipt_ids jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_files jsonb NOT NULL DEFAULT '[]'::jsonb;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS pleo_account_code text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS merchant_mcc text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS amount_tax numeric;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS document_type text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS suggested_category text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS needs_receipt boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS sync_warning text;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;",
        "ALTER TABLE IF EXISTS personal_expenses ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;",
        # ⚠️ ESTA es la garantía real de que un gasto de Pleo no se duplica nunca, ni con dos
        # sondeos a la vez ni al volver a gestionar su justificante: lo impone la BD.
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_expenses_pleo_entry ON personal_expenses(pleo_entry_id) WHERE pleo_entry_id IS NOT NULL;",
        "CREATE INDEX IF NOT EXISTS idx_personal_expenses_pleo_pending ON personal_expenses(pleo_account_id, needs_receipt) WHERE pleo_entry_id IS NOT NULL;",
        # --- Correos adicionales de la persona (solo para identificarla en integraciones) ---
        "ALTER TABLE IF EXISTS user_profiles ADD COLUMN IF NOT EXISTS integration_emails jsonb NOT NULL DEFAULT '[]'::jsonb;",
    ]
    _exec_ddl_statements(stmts, "pleo_schema")


# ===========================================================================
#  HOLDED · contabilidad del grupo
#  ------------------------------------------------------------------------
#  Cada empresa del grupo lleva su contabilidad en SU cuenta de Holded, así que
#  la API Key se guarda por empresa (`HoldedAccount`), igual que en Pleo y en
#  Cabify. Nada de una clave global en el `.env`.
#
#  Lo que se sube a Holded es cada GASTO (bag_expenses): las facturas como
#  compra y los tickets / gastos sin ticket como gasto. El estado contable vive
#  en el propio gasto (`accounting_status`), que es lo que permite enseñar la
#  etiqueta «Contabilizado» en la bolsa y en todas las pantallas donde sale.
# ===========================================================================

class HoldedAccount(Base):
    """Credencial y estado de la cuenta de Holded de UNA empresa del grupo."""

    __tablename__ = "holded_accounts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    group_company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("group_companies.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    # API Key de Holded (Configuración → Desarrolladores). Una por cuenta.
    api_key = Column(Text)
    is_active = Column(Boolean, nullable=False, server_default=text("false"))
    # Tipos de documento con los que se crean las compras. Editables porque el tipo de «gasto»
    # (ticket) no se llama igual en todas las cuentas: `detect_ticket_doc_type` lo comprueba.
    invoice_doc_type = Column(Text, nullable=False, server_default=text("'purchase'"))
    ticket_doc_type = Column(Text, nullable=False, server_default=text("'dailyexpense'"))
    # Cabecera con la que se manda la clave: AUTO (se prueban las tres y se guarda la que funcione),
    # `key` (la documentada), `X-API-KEY` o `Authorization` (Bearer, que es la que indica Holded al
    # crear algunas credenciales). Se puede fijar a mano desde Integraciones.
    auth_header = Column(Text, nullable=False, server_default=text("'AUTO'"))
    # Rutas ya descubiertas (adjuntar documento, formas de pago): mismo patrón que la URL base de
    # Cabify, para que la integración se ajuste a la cuenta real sin tocar código.
    endpoints = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    # Catálogo de formas de pago de la cuenta: {id: nombre}.
    payment_methods = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    last_test_at = Column(DateTime(timezone=True))
    last_test_ok = Column(Boolean)
    last_sync_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    last_stats = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("GroupCompany")


def ensure_holded_schema():
    """Crea/actualiza el esquema de la integración con Holded (idempotente, sin Alembic)."""
    _create_all_once()
    _exec_ddl_statements([
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
        """
        CREATE TABLE IF NOT EXISTS holded_accounts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            group_company_id uuid NOT NULL UNIQUE REFERENCES group_companies(id) ON DELETE CASCADE,
            api_key text,
            is_active boolean NOT NULL DEFAULT false,
            invoice_doc_type text NOT NULL DEFAULT 'purchase',
            ticket_doc_type text NOT NULL DEFAULT 'dailyexpense',
            auth_header text NOT NULL DEFAULT 'AUTO',
            endpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
            payment_methods jsonb NOT NULL DEFAULT '{}'::jsonb,
            last_test_at timestamptz,
            last_test_ok boolean,
            last_sync_at timestamptz,
            last_error text,
            last_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        # --- ESTADO CONTABLE de cada gasto ---
        # PENDIENTE (nadie lo ha tocado) | SUBIDO (está en Holded, sin contabilizar) |
        # CONTABILIZADO (asiento hecho) | OMITIDO (se decidió no contabilizarlo: ahí acaba).
        "ALTER TABLE IF EXISTS holded_accounts ADD COLUMN IF NOT EXISTS auth_header text NOT NULL DEFAULT 'AUTO';",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS accounting_status text NOT NULL DEFAULT 'PENDIENTE';",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS accounting_at timestamptz;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS accounting_by_nick text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS accounting_note text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_doc_id text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_doc_type text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_doc_number text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_contact_id text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_uploaded_at timestamptz;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_error text;",
        "ALTER TABLE IF EXISTS bag_expenses ADD COLUMN IF NOT EXISTS holded_warning text;",
        "CREATE INDEX IF NOT EXISTS idx_bag_expenses_accounting ON bag_expenses(accounting_status);",
        "CREATE INDEX IF NOT EXISTS idx_bag_expenses_holded_doc ON bag_expenses(holded_doc_id) WHERE holded_doc_id IS NOT NULL;",
        # Una bolsa con TODOS sus gastos contabilizados se archiva y desaparece de pendiente.
        "ALTER TABLE IF EXISTS workflow_bags ADD COLUMN IF NOT EXISTS accounting_done_at timestamptz;",
        # --- DIRECCIÓN FISCAL EN PIEZAS ---
        # Holded exige el código postal, el municipio y la provincia por separado para crear el
        # contacto: con la dirección en un solo cuadro de texto no se puede dar de alta al proveedor.
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS fiscal_postal_code text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS fiscal_city text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS fiscal_province text;",
        "ALTER TABLE IF EXISTS promoters ADD COLUMN IF NOT EXISTS fiscal_country text;",
        "ALTER TABLE IF EXISTS promoter_companies ADD COLUMN IF NOT EXISTS fiscal_postal_code text;",
        "ALTER TABLE IF EXISTS promoter_companies ADD COLUMN IF NOT EXISTS fiscal_city text;",
        "ALTER TABLE IF EXISTS promoter_companies ADD COLUMN IF NOT EXISTS fiscal_province text;",
        "ALTER TABLE IF EXISTS promoter_companies ADD COLUMN IF NOT EXISTS fiscal_country text;",
    ], "holded_schema")


# ===========================================================================
#  DIRECCIONES · caché del buscador
#  ------------------------------------------------------------------------
#  Autocompletar una dirección son varias peticiones por dirección escrita. El
#  proveedor (Photon, sobre OpenStreetMap) es gratis pero no es nuestro, así que
#  lo que ya se ha buscado se guarda: la segunda vez que alguien escriba la misma
#  calle sale al instante y sin salir a Internet.
# ===========================================================================

class AddressLookup(Base):
    """Lo que devolvió el buscador de direcciones para una búsqueda concreta."""

    __tablename__ = "address_lookups"

    # La propia búsqueda normalizada (minúsculas, sin espacios de más) es la clave.
    query_key = Column(Text, primary_key=True)
    payload = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    hits = Column(Integer, nullable=False, server_default=text("1"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


def ensure_geo_schema():
    """Crea/actualiza la caché del buscador de direcciones (idempotente, sin Alembic)."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS address_lookups (
            query_key text PRIMARY KEY,
            payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            hits integer NOT NULL DEFAULT 1,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_address_lookups_updated ON address_lookups(updated_at);",
    ], "geo_schema")


# ===========================================================================
#  INTENTOS DE SUBIDA DE FACTURA que el servidor RECHAZA
#  ------------------------------------------------------------------------
#  Cuando a un proveedor no se le acepta la factura (el importe no cuadra, le
#  faltan datos, el enlace no vale, ya había una…) el aviso se le enseña a él y
#  aquí no quedaba constancia de nada. Resultado: alguien dice «yo la subí» y no
#  hay forma de saber si es verdad. Cada rechazo se apunta aquí para poder
#  contestar a eso con datos.
# ===========================================================================

class InvoiceUploadAttempt(Base):
    """Un intento de subir una factura que NO se aceptó, con su motivo."""

    __tablename__ = "invoice_upload_attempts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))
    # De dónde venía: ROYALTY (enlace de una liquidación) | REQUEST (petición de una bolsa) | LANDING.
    origin = Column(Text, nullable=False, server_default=text("'LANDING'"))
    royalty_liquidation_id = Column(PGUUID(as_uuid=True), ForeignKey("royalty_liquidations.id", ondelete="SET NULL"))
    bag_id = Column(PGUUID(as_uuid=True), ForeignKey("workflow_bags.id", ondelete="SET NULL"))
    # Por qué no se aceptó (el mismo texto que se le enseñó a quien la subía).
    reason = Column(Text, nullable=False)
    reason_code = Column(Text)          # AMOUNT | DATA | LINK | DUPLICATE | DOCS
    file_name = Column(Text)
    invoice_number = Column(Text)
    amount_gross = Column(Numeric)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")

    __table_args__ = (
        Index("idx_invoice_upload_attempts_fecha", "created_at"),
    )


def ensure_invoice_attempts_schema():
    """Crea/actualiza la tabla de intentos de subida rechazados (idempotente, sin Alembic)."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS invoice_upload_attempts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            promoter_id uuid REFERENCES promoters(id) ON DELETE SET NULL,
            origin text NOT NULL DEFAULT 'LANDING',
            royalty_liquidation_id uuid REFERENCES royalty_liquidations(id) ON DELETE SET NULL,
            bag_id uuid REFERENCES workflow_bags(id) ON DELETE SET NULL,
            reason text NOT NULL,
            reason_code text,
            file_name text,
            invoice_number text,
            amount_gross numeric,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_invoice_upload_attempts_fecha ON invoice_upload_attempts(created_at);",
    ], "invoice_attempts_schema")


# ---------------------------------------------------------------------------
# VACACIONES Y DÍAS LIBRES · del personal de la oficina
# ---------------------------------------------------------------------------
# Tres piezas:
#   · `Holiday`         — el calendario de FESTIVOS (Madrid: nacionales, de la
#                         Comunidad y locales). Se siembra solo por año y se
#                         puede corregir a mano: el BOE cambia cada año y no se
#                         puede dar por buena una lista calculada para siempre.
#   · `VacationRequest` — una petición (BORRADOR no existe: nace PENDIENTE).
#   · `VacationDay`     — un DÍA por fila. Es lo que hace que el calendario de
#                         toda la oficina y el saldo de cada persona sean una
#                         consulta y no un recorrido de listas en JSON.
# ⚠️ `VacationDay.user_id` va DENORMALIZADO a propósito: el calendario general
# pinta días de mucha gente y sin él haría un JOIN por cada celda.

class Holiday(Base):
    """Día festivo. `scope` NACIONAL | AUTONOMICO | LOCAL (solo informativo: a efectos
    de contar, cualquier festivo de la lista no consume vacaciones)."""

    __tablename__ = "holidays"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    day = Column(Date, nullable=False)
    name = Column(Text, nullable=False)
    scope = Column(Text, nullable=False, server_default=text("'NACIONAL'"))
    region = Column(Text, nullable=False, server_default=text("'Madrid'"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("day", "region", name="uq_holidays_day_region"),
        Index("idx_holidays_day", "day"),
    )


class VacationRequest(Base):
    """Petición de VACACIONES o de DÍA LIBRE de una persona de la oficina.

    Las dos cosas comparten tabla, calendario y flujo de aprobación —lo único que cambia es de qué
    bolsa salen los días—, así que `kind` es lo que las separa. ⚠️ Un DÍA LIBRE **no consume
    vacaciones**: se lleva en su propia cuenta."""

    __tablename__ = "vacation_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # VACACIONES | DIA_LIBRE
    kind = Column(Text, nullable=False, server_default=text("'VACACIONES'"))
    # PENDING | APPROVED | REJECTED | CANCELLED
    status = Column(Text, nullable=False, server_default=text("'PENDING'"))
    # Año natural al que se imputan los días (el de la primera fecha pedida).
    year = Column(Integer, nullable=False)
    # Días LABORABLES que consume la petición (ya descontados findes y festivos).
    days_count = Column(Integer, nullable=False, server_default=text("0"))
    note = Column(Text)                 # lo que escribe quien pide
    decision_note = Column(Text)        # el motivo de quien aprueba o rechaza
    decided_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    decided_at = Column(DateTime(timezone=True))
    # Lo dio de alta administración/dirección directamente (no lo pidió la persona).
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
    days = relationship("VacationDay", cascade="all, delete-orphan", back_populates="request")

    __table_args__ = (
        Index("idx_vacation_requests_user", "user_id"),
        Index("idx_vacation_requests_status", "status"),
        Index("idx_vacation_requests_year", "user_id", "year"),
        Index("idx_vacation_requests_kind", "user_id", "year", "kind"),
    )


class VacationDay(Base):
    """Un día concreto de una petición."""

    __tablename__ = "vacation_days"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    request_id = Column(PGUUID(as_uuid=True), ForeignKey("vacation_requests.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)
    # ¿Consume saldo? Un día pedido que cae en sábado, domingo o festivo se guarda igual (así el
    # calendario enseña el tramo entero, de principio a fin) pero NO cuenta.
    counts = Column(Boolean, nullable=False, server_default=text("true"))

    request = relationship("VacationRequest", back_populates="days")

    __table_args__ = (
        Index("idx_vacation_days_user_day", "user_id", "day"),
        Index("idx_vacation_days_request", "request_id"),
        Index("idx_vacation_days_day", "day"),
    )


class UserContract(Base):
    """Contrato de una persona de la oficina. La FECHA DE COMIENZO es la que manda para
    calcular las vacaciones que le corresponden (30 días por año trabajado, prorrateados
    en el año de alta). Se guarda el histórico: la antigüedad es la fecha más antigua."""

    __tablename__ = "user_contracts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # CON QUÉ EMPRESA DEL GRUPO tiene el contrato: es su logo el que va en los avisos que se le
    # mandan (vacaciones aprobadas, día libre, día no laborable).
    company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    contract_type = Column(Text)          # indefinido, temporal, prácticas… (texto libre)
    file_url = Column(Text)
    file_name = Column(Text)
    notes = Column(Text)
    created_by_user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_user_contracts_user", "user_id"),
        Index("idx_user_contracts_start", "user_id", "start_date"),
    )


def ensure_vacations_schema():
    """Vacaciones, festivos y contratos del personal (idempotente, sin Alembic)."""
    _create_all_once()
    _exec_ddl_statements([
        """
        CREATE TABLE IF NOT EXISTS holidays (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            day date NOT NULL,
            name text NOT NULL,
            scope text NOT NULL DEFAULT 'NACIONAL',
            region text NOT NULL DEFAULT 'Madrid',
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_day_region ON holidays(day, region);",
        "CREATE INDEX IF NOT EXISTS idx_holidays_day ON holidays(day);",
        """
        CREATE TABLE IF NOT EXISTS vacation_requests (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status text NOT NULL DEFAULT 'PENDING',
            year integer NOT NULL,
            days_count integer NOT NULL DEFAULT 0,
            note text,
            decision_note text,
            decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            decided_at timestamptz,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_vacation_requests_user ON vacation_requests(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_vacation_requests_status ON vacation_requests(status);",
        "CREATE INDEX IF NOT EXISTS idx_vacation_requests_year ON vacation_requests(user_id, year);",
        # VACACIONES | DIA_LIBRE. Lo que ya existía son vacaciones (de ahí el DEFAULT).
        "ALTER TABLE vacation_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'VACACIONES';",
        "CREATE INDEX IF NOT EXISTS idx_vacation_requests_kind ON vacation_requests(user_id, year, kind);",
        """
        CREATE TABLE IF NOT EXISTS vacation_days (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            request_id uuid NOT NULL REFERENCES vacation_requests(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            day date NOT NULL,
            counts boolean NOT NULL DEFAULT true
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_vacation_days_user_day ON vacation_days(user_id, day);",
        "CREATE INDEX IF NOT EXISTS idx_vacation_days_request ON vacation_days(request_id);",
        "CREATE INDEX IF NOT EXISTS idx_vacation_days_day ON vacation_days(day);",
        """
        CREATE TABLE IF NOT EXISTS user_contracts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            start_date date NOT NULL,
            end_date date,
            contract_type text,
            file_url text,
            file_name text,
            notes text,
            created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz DEFAULT now()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_user_contracts_user ON user_contracts(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_user_contracts_start ON user_contracts(user_id, start_date);",
        "ALTER TABLE user_contracts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL;",
        # Días de vacaciones al año de cada persona: se configura desde el panel de vacaciones.
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vacation_days_per_year integer;",
        # Ajuste manual del saldo de un año {\"2026\": 3} (días arrastrados, correcciones…).
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vacation_adjustments jsonb NOT NULL DEFAULT '{}'::jsonb;",
    ], "vacations_schema")
