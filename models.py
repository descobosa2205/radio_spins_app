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
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID as PGUUID

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
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Artist(Base):
    __tablename__ = "artists"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    name = Column(Text, nullable=False, unique=True)
    photo_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    songs = relationship("Song", secondary="songs_artists", back_populates="artists")


class Song(Base):
    __tablename__ = "songs"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    title = Column(Text, nullable=False)
    collaborator = Column(Text)
    release_date = Column(Date, nullable=False)
    cover_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    artists = relationship("Artist", secondary="songs_artists", back_populates="songs")
    plays = relationship("Play", back_populates="song", cascade="all, delete-orphan")


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

    # Estado: HABLADO | RESERVADO | CONFIRMADO
    status = Column(Text, nullable=False, server_default=text("'HABLADO'"))

    # relaciones:
    group_company = relationship("GroupCompany")

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


class TicketSale(Base):
    __tablename__ = "ticket_sales"
    id = Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"))
    concert_id = Column(PGUUID(as_uuid=True), ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    day = Column(Date, nullable=False)
    sold_today = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


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


def init_db():
    Base.metadata.create_all(bind=engine)
