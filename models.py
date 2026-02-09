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

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


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

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artist = relationship("Artist", back_populates="people")


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
    release_date = Column(Date, nullable=False)
    cover_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artists = relationship("Artist", secondary="songs_artists", back_populates="songs")
    plays = relationship("Play", back_populates="song", cascade="all, delete-orphan")


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

    sgae_done = Column(Boolean, nullable=False, server_default=text("false"))
    sgae_updated_at = Column(DateTime(timezone=True))

    ritmonet_done = Column(Boolean, nullable=False, server_default=text("false"))
    ritmonet_updated_at = Column(DateTime(timezone=True))

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


class Promoter(Base):
    """Terceros / promotores."""

    __tablename__ = "promoters"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    nick = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Venue(Base):
    __tablename__ = "venues"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False)
    covered = Column(Boolean, nullable=False, default=False)  # True=cubierto, False=aire libre
    address = Column(Text)
    municipality = Column(Text)
    province = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupCompany(Base):
    __tablename__ = "group_companies"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    logo_url = Column(Text)
    tax_info = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Concert(Base):
    __tablename__ = "concerts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    date = Column(Date, nullable=False)

    # nombre interno / festival
    festival_name = Column(Text)

    venue_id = Column(PGUUID(as_uuid=True), ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False)

    # EMPRESA | VENDIDO | PARTICIPADOS | CADIZ
    sale_type = Column(Text, nullable=False)

    # tercero principal (p.ej. vendido)
    promoter_id = Column(PGUUID(as_uuid=True), ForeignKey("promoters.id", ondelete="SET NULL"))

    artist_id = Column(PGUUID(as_uuid=True), ForeignKey("artists.id", ondelete="RESTRICT"), nullable=False)

    # Aforo a la venta
    capacity = Column(Integer, nullable=False)

    # Fecha salida a la venta
    sale_start_date = Column(Date, nullable=False)

    # Punto de empate (OPCIONAL)
    break_even_ticket = Column(Integer, nullable=True)

    sold_out = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Empresa del grupo (si aplica)
    group_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Empresa que factura (empresa del grupo)
    billing_company_id = Column(PGUUID(as_uuid=True), ForeignKey("group_companies.id", ondelete="SET NULL"))

    # Estado: HABLADO | RESERVADO | CONFIRMADO
    status = Column(Text, nullable=False, server_default=text("'HABLADO'"))

    # relaciones:
    group_company = relationship("GroupCompany", foreign_keys=[group_company_id])
    billing_company = relationship("GroupCompany", foreign_keys=[billing_company_id])

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

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ticketer = relationship("Ticketer")

    __table_args__ = (
        UniqueConstraint("concert_id", "ticketer_id", name="uq_concert_ticketer"),
    )


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

    # % (0..100) opcional si hay amount
    pct = Column(Integer)
    pct_base = Column(Text)  # GROSS | NET

    # fijo opcional
    amount = Column(Numeric)
    amount_base = Column(Text)  # GROSS | NET

    promoter = relationship("Promoter")


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

    # PERCENT | AMOUNT
    commission_type = Column(Text, nullable=False, server_default=text("'PERCENT'"))

    commission_pct = Column(Numeric)
    commission_base = Column(Text)  # GROSS | NET

    commission_amount = Column(Numeric)
    commission_amount_base = Column(Text)  # GROSS | NET

    # Importe exento (opcional)
    exempt_amount = Column(Numeric)

    # Concepto / motivo de la comisión
    concept = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    promoter = relationship("Promoter")


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
    ]

    with engine.begin() as conn:
        for stmt in stmts:
            s = (stmt or '').strip()
            if not s:
                continue
            conn.exec_driver_sql(s)


def ensure_discografica_schema():
    """Asegura columnas nuevas en `songs` para la pestaña Discográfica.

    Lo hacemos sin Alembic, usando DDL idempotente (IF NOT EXISTS) para:
    - is_catalog
    - isrc
    - enlaces plataformas
    """

    stmts = [
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

        # Campos nuevos en songs
        """
        ALTER TABLE IF EXISTS songs
            ADD COLUMN IF NOT EXISTS is_catalog boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS isrc text,
            ADD COLUMN IF NOT EXISTS spotify_url text,
            ADD COLUMN IF NOT EXISTS apple_music_url text,
            ADD COLUMN IF NOT EXISTS amazon_music_url text,
            ADD COLUMN IF NOT EXISTS tiktok_url text,
            ADD COLUMN IF NOT EXISTS youtube_url text;
        """,

        'CREATE INDEX IF NOT EXISTS idx_songs_release_date ON songs(release_date DESC);',
        'CREATE INDEX IF NOT EXISTS idx_songs_isrc ON songs(isrc);',
    ]

    with engine.begin() as conn:
        for stmt in stmts:
            s = (stmt or "").strip()
            if not s:
                continue
            conn.exec_driver_sql(s)


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
            sgae_done boolean NOT NULL DEFAULT false,
            sgae_updated_at timestamptz,
            ritmonet_done boolean NOT NULL DEFAULT false,
            ritmonet_updated_at timestamptz,
            distributed_done boolean NOT NULL DEFAULT false,
            distributed_updated_at timestamptz,
            updated_at timestamptz DEFAULT now()
        );
        """,

        # Campos extra en songs
        """
        ALTER TABLE IF EXISTS songs
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
            ADD COLUMN IF NOT EXISTS musicians jsonb;
        """,

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

    with engine.begin() as conn:
        for stmt in stmts:
            s = (stmt or "").strip()
            if not s:
                continue
            conn.exec_driver_sql(s)


def init_db():
    Base.metadata.create_all(bind=engine)