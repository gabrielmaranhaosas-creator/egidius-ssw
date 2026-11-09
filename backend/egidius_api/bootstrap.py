"""Primeira carga privada do SQLite em volume persistente; nunca sobrescreve uma base."""
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
from .backup_format import validar_banco


def preparar_volume():
    if os.getenv('EGIDIUS_REQUIRE_PERSISTENCE', '').lower() != 'true':
        return
    mounted = os.getenv('EGIDIUS_DATA_VOLUME', '')
    database_url = os.getenv('EGIDIUS_DATABASE_URL', '')
    if not mounted or not database_url.startswith('sqlite:///'):
        raise RuntimeError('Configure o volume persistente e o SQLite antes de iniciar o EGIDIUS.')
    volume = Path(mounted).resolve()
    database = Path(database_url.removeprefix('sqlite:///')).resolve()
    media = Path(os.getenv('EGIDIUS_MEDIA_DIR', '')).resolve()
    if not volume.is_dir() or not database.is_relative_to(volume) or database == volume or not media.is_relative_to(volume) or media == volume:
        raise RuntimeError('Banco e mídia devem permanecer dentro do volume persistente.')
    if database.is_symlink():
        raise RuntimeError('O banco não deve ser um link simbólico.')
    if database.is_file() and database.stat().st_size:
        return
    encoded = os.getenv('EGIDIUS_INITIAL_DATABASE_B64', '')
    expected = os.getenv('EGIDIUS_INITIAL_DATABASE_SHA256', '')
    if not encoded or not expected:
        raise RuntimeError('A primeira carga do banco ainda não foi fornecida. Nenhuma base vazia será publicada.')
    if len(encoded) > 4*1024*1024:
        raise RuntimeError('A primeira carga excedeu o limite permitido.')
    packed = base64.b64decode(encoded, validate=True)
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as compressed:
        raw = compressed.read(32*1024*1024+1)
    if len(raw)>32*1024*1024 or hashlib.sha256(raw).hexdigest()!=expected:
        raise RuntimeError('A primeira carga não passou na verificação de integridade.')
    database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = database.with_name(database.name+'.primeira-carga')
    try:
        with temporary.open('xb') as out:
            temporary.chmod(0o600)
            out.write(raw)
        if validar_banco(temporary):
            raise RuntimeError('Esta base já contém mídia: transfira o backup completo para o volume antes de iniciar.')
        os.replace(temporary, database)
    finally:
        temporary.unlink(missing_ok=True)
