"""Migração para banco vazio e backup portátil, sem alterar a origem."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import zipfile

from sqlalchemy import create_engine, inspect, select, text
from .db import Base, State, engine_for_url
from .viagem_ssw import ViagemState, ViagemData
from .schema import DadosSSW
from .backup_format import validar_banco


def validate_source(path):
    files = validar_banco(path)
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as db:
        DadosSSW.model_validate(json.loads(db.execute('SELECT payload FROM state WHERE id=1').fetchone()[0]))
        for payload, in db.execute('SELECT payload FROM viagem_ssw_state'):
            ViagemData.model_validate(json.loads(payload))
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Backup com relações de usuários ou sessões inconsistentes.')
    return files


def readonly_sqlite(path):
    uri = Path(path).resolve().as_uri() + '?mode=ro'
    return create_engine('sqlite://', creator=lambda: sqlite3.connect(uri, uri=True), hide_parameters=True)


def copy_rows(source, destination):
    counts = {}
    available = set(inspect(source).get_table_names())
    for table in Base.metadata.sorted_tables:
        counts[table.name] = 0
        if table.name not in available:
            if table.name=='user_roles':
                users=source.execute(select(Base.metadata.tables['users'].c.username)).scalars().all()
                admins=[{'username':u,'role':'admin'} for u in users if u not in ('confrade_ssw','operador_local')]
                if admins:destination.execute(table.insert(),admins)
                counts[table.name]=len(admins)
                continue
            if table.name in ('pending_media_deletions','media_trash','operation_audit','invite_access'): continue
            raise ValueError('Tabela obrigatória ausente na origem.')
        rows = source.execute(select(table)).mappings()
        while batch := rows.fetchmany(128):
            values = []
            for row in batch:
                record = dict(row)
                for key, value in record.items():
                    if isinstance(value, datetime):
                        record[key] = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
                values.append(record)
            destination.execute(table.insert(), values)
            counts[table.name] += len(values)
    return counts


def sqlite_snapshot(engine, target):
    target = Path(target)
    if target.exists():
        raise ValueError('O destino do snapshot já existe.')
    if engine.dialect.name == 'sqlite':
        if not engine.url.database or engine.url.database == ':memory:':
            raise ValueError('Backup exige uma base persistida em arquivo ou PostgreSQL.')
        with closing(sqlite3.connect(Path(engine.url.database).resolve().as_uri() + '?mode=ro', uri=True)) as src:
            with closing(sqlite3.connect(target)) as dst:
                src.backup(dst)
    else:
        if engine.dialect.name != 'postgresql':
            raise ValueError('Banco sem suporte a backup portátil.')
        dest = create_engine('sqlite:///' + str(target), hide_parameters=True)
        try:
            Base.metadata.create_all(dest)
            with engine.connect().execution_options(isolation_level='REPEATABLE READ') as src:
                with src.begin(), dest.begin() as dst:
                    src.execute(text('SET TRANSACTION READ ONLY'))
                    copy_rows(src, dst)
        finally:
            dest.dispose()
    target.chmod(0o600)
    validate_source(target)


def has_ready_database(engine):
    with engine.connect() as con:
        tables = set(inspect(con).get_table_names())
        if not tables.intersection(Base.metadata.tables):
            return False
        if not (set(Base.metadata.tables) - {'pending_media_deletions','user_roles','media_trash','operation_audit','invite_access'}).issubset(tables):
            raise ValueError('Base externa parcialmente configurada; nenhuma carga será aplicada.')
        count = con.execute(text('SELECT COUNT(*) FROM users')).scalar_one()
        row = con.execute(select(State.__table__).where(State.id == 1)).mappings().first()
        if not count and not row:
            return False
        if not row or not count:
            raise ValueError('Base externa não reconhecida; nenhuma carga será aplicada.')
        DadosSSW.model_validate(json.loads(row['payload']))
        return True


def restore_empty(source, engine, storage, media_folder=None):
    files = validate_source(source)
    if sum(size for _, size in files) > 2 * 1024**3:
        raise ValueError('A mídia excede a reserva de 2 GB do aplicativo.')
    for name, size in files:
        from .storage import safe_name
        safe_name(name)
        path = Path(media_folder or '') / name
        if not media_folder or path.is_symlink() or not path.is_file() or path.stat().st_size != size:
            raise ValueError('Mídia ausente ou divergente no backup.')
    src_engine = readonly_sqlite(source)
    uploaded = []
    try:
        with engine.begin() as dst:
            if engine.dialect.name == 'postgresql':
                dst.execute(text('SELECT pg_advisory_xact_lock(793820114)'))
            tables = set(inspect(dst).get_table_names())
            unknown = tables - set(Base.metadata.tables)
            if unknown:
                raise ValueError('O destino contém tabelas de outro sistema. Use um banco novo.')
            Base.metadata.create_all(dst)
            for table in Base.metadata.sorted_tables:
                if dst.execute(select(table).limit(1)).first() is not None:
                    raise ValueError('O destino já tem registros. Nenhuma linha será sobrescrita.')
            storage.check()
            if any(storage.exists(name) for name, _ in files):
                raise ValueError('Há arquivos com os mesmos nomes no destino. Use armazenamento novo.')
            with src_engine.connect() as src:
                media = src.execute(select(Base.metadata.tables['media_assets'])).mappings().all()
                for row in media:
                    storage.put_file(row['stored_name'], Path(media_folder) / row['stored_name'], row['mime_type'])
                    uploaded.append(row['stored_name'])
                counts = copy_rows(src, dst)
            if engine.dialect.name == 'postgresql':
                for name in ('state', 'state_history', 'viagem_ssw_state', 'operation_audit'):
                    maximum = dst.execute(text('SELECT MAX(id) FROM ' + name)).scalar_one()
                    dst.execute(text("SELECT setval(pg_get_serial_sequence(:table_name, 'id'), :value, :called)"),
                                {'table_name': name, 'value': max(maximum or 0, 1), 'called': maximum is not None})
        return {'counts': counts, 'media_files': len(files),
                'source_sha256': hashlib.sha256(Path(source).read_bytes()).hexdigest()}
    except BaseException:
        for name in uploaded:
            try: storage.remove(name)
            except Exception: pass
        raise
    finally:
        src_engine.dispose()


@contextmanager
def unpack_backup(archive):
    with tempfile.TemporaryDirectory(prefix='egidius-migrar-') as temporary:
        folder = Path(temporary)
        folder.chmod(0o700)
        db = folder / 'egidius.sqlite3'
        media = folder / 'media'
        media.mkdir(mode=0o700)
        with zipfile.ZipFile(archive) as bundle:
            infos = bundle.infolist()
            if len(infos) > 10000 or sum(i.file_size for i in infos) > 3 * 1024**3:
                raise ValueError('Backup acima de 3 GB ou 10.000 arquivos.')
            if len({i.filename for i in infos}) != len(infos):
                raise ValueError('Entradas duplicadas no ZIP.')
            info = bundle.getinfo('dados/egidius.sqlite3')
            if info.file_size > 512 * 1024**2:
                raise ValueError('Banco acima de 512 MB; use transferência assistida.')
            with bundle.open(info) as src, db.open('xb') as dst:
                db.chmod(0o600)
                shutil.copyfileobj(src, dst)
            files = validate_source(db)
            from .storage import safe_name
            for name, size in files:
                safe_name(name)
                info = bundle.getinfo('media/' + name)
                if info.file_size != size:
                    raise ValueError('Tamanho de mídia divergente.')
                with bundle.open(info) as src, (media / name).open('xb') as dst:
                    os.chmod(media / name, 0o600)
                    shutil.copyfileobj(src, dst)
        yield db, media
