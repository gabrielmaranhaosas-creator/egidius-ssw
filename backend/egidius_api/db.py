from __future__ import annotations
import os
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DEFAULT_DB = Path(__file__).resolve().parents[1] / 'var' / 'egidius.sqlite3'

def utcnow():
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    username: Mapped[str] = mapped_column(String(100), primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)

class Session(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(ForeignKey('users.username'), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(100), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

class State(Base):
    __tablename__ = 'state'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AthleteProfile(Base):
    """Perfil editorial independente dos dados operacionais do sábado."""
    __tablename__ = 'athlete_profiles'
    athlete_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    sticker_number: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class MediaAsset(Base):
    """Metadados de fotos/vídeos; bytes ficam no diretório privado backend/var/media."""
    __tablename__ = 'media_assets'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    athlete_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    round_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    match_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    caption: Mapped[str] = mapped_column(String(250), nullable=False, default='')
    original_name: Mapped[str] = mapped_column(String(120), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class History(Base):
    __tablename__ = 'state_history'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    actor: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PendingMediaDeletion(Base):
    __tablename__ = 'pending_media_deletions'
    stored_name: Mapped[str] = mapped_column(String(120), primary_key=True)
    size: Mapped[int] = mapped_column(Integer, nullable=False)

def engine_for_url(db_url):
    if db_url.startswith(('postgres://', 'postgresql://')):
        db_url = 'postgresql+psycopg://' + db_url.split('://', 1)[1]
    options = {'pool_pre_ping': True, 'hide_parameters': True}
    if db_url.startswith('postgresql'):
        options.update(pool_size=2, max_overflow=0, pool_recycle=300, connect_args={'connect_timeout': 15})
    else:
        options['connect_args'] = {'check_same_thread': False} if db_url.startswith('sqlite:') else {}
    return create_engine(db_url, **options)


def session_factory(url: str | None = None):
    db_url = url or os.environ.get('EGIDIUS_DATABASE_URL') or f'sqlite:///{DEFAULT_DB}'
    if db_url.startswith('sqlite:') and ':memory:' not in db_url:
        address = db_url.partition('sqlite:///')[2]
        if address:
            dbfile = Path(address)
            dbfile.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if dbfile.exists(): os.chmod(dbfile, 0o600)
    engine = engine_for_url(db_url)
    Base.metadata.create_all(engine)
    if db_url.startswith('sqlite:') and ':memory:' not in db_url:
        address = db_url.partition('sqlite:///')[2]
        if address and Path(address).exists(): os.chmod(address, 0o600)
    SessionLocal = sessionmaker(engine, expire_on_commit=False)
    with SessionLocal.begin() as db:
        if db.get(State, 1) is None:
            db.add(State(id=1, revision=0, payload='{"versao":5,"jogadores":[],"rodadas":[]}'))
    return SessionLocal, engine
