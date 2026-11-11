import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url
from egidius_api.db import engine_for_url, session_factory
from egidius_api.main import create_app
from egidius_api.portability import restore_empty, sqlite_snapshot, unpack_backup, has_ready_database
from egidius_api.storage import LocalStorage, S3Storage


@pytest.fixture
def source(tmp_path, monkeypatch):
    path = tmp_path / 'origem.sqlite3'
    monkeypatch.setenv('EGIDIUS_LOCAL_ACCESS', 'true')
    monkeypatch.setenv('EGIDIUS_SECURE_COOKIES', 'false')
    monkeypatch.setenv('EGIDIUS_MEDIA_DIR', str(tmp_path / 'midia-origem'))
    app = create_app('sqlite:///' + str(path))
    with TestClient(app, base_url='http://127.0.0.1:8017', client=('127.0.0.1', 1)) as c:
        auth = c.post('/api/auth/local').json()
        headers = {'X-CSRF-Token': auth['csrf']}
        data = {'versao': 5, 'jogadores': [{'id': 'j1', 'nome': 'José Migração'}],
                'rodadas': [{'id': 'r1', 'data': '2026-10-31', 'presencas': [], 'equipes': [], 'jogos': []}]}
        assert c.put('/api/state', headers=headers, json={'expected_revision': 0, 'data': data}).status_code == 200
        raw = b'\xff\xd8\xff' + b'foto-de-teste'
        uploaded = c.post('/api/media/upload?scope=athlete&kind=photo&athlete_id=j1', content=raw,
                          headers={**headers, 'x-egidius-filename': 'retrato.jpg'})
        assert uploaded.status_code == 201
    app.state.engine.dispose()
    return path, tmp_path / 'midia-origem'


def test_migracao_em_destino_vazio_e_backup_restaura_toda_midia(source, tmp_path):
    source_db, media = source
    raw = source_db.read_bytes()
    destination = engine_for_url('sqlite:///' + str(tmp_path / 'destino.sqlite3'))
    storage = LocalStorage(tmp_path / 'midia-destino')
    try:
        report = restore_empty(source_db, destination, storage, media)
        assert report['counts']['users'] == 1
        assert report['counts']['media_assets'] == 1
        assert has_ready_database(destination)
        snapshot = tmp_path / 'snapshot.sqlite3'
        sqlite_snapshot(destination, snapshot)
        with sqlite3.connect(snapshot) as con:
            assert json.loads(con.execute('SELECT payload FROM state').fetchone()[0])['jogadores'][0]['nome'] == 'José Migração'
        before = (tmp_path / 'destino.sqlite3').read_bytes()
        with pytest.raises(ValueError, match='já tem registros'):
            restore_empty(source_db, destination, storage, media)
        assert before == (tmp_path / 'destino.sqlite3').read_bytes()
        assert source_db.read_bytes() == raw
    finally:
        destination.dispose()


def test_falha_de_upload_reverte_registros_e_objetos(source, tmp_path):
    source_db, media = source
    class Broken(LocalStorage):
        def put_file(self, *args): raise OSError('falha simulada')
    engine = engine_for_url('sqlite:///' + str(tmp_path / 'falhou.sqlite3'))
    try:
        with pytest.raises(OSError): restore_empty(source_db, engine, Broken(tmp_path / 'files'), media)
        with engine.connect() as con:
            assert con.execute(text('SELECT COUNT(*) FROM users')).scalar_one() == 0
    finally:
        engine.dispose()


@pytest.fixture
def postgres_url():
    url = os.getenv('EGIDIUS_TEST_POSTGRES_URL')
    if not url:
        pytest.skip('PostgreSQL isolado disponível na CI.')
    parsed = make_url(url)
    if parsed.host not in ('127.0.0.1', 'localhost'):
        pytest.fail('Os testes só aceitam PostgreSQL local e isolado.')
    engine = engine_for_url(url)
    schema = 'teste_' + uuid.uuid4().hex
    with engine.begin() as con:
        con.execute(text('CREATE SCHEMA ' + schema))
    try:
        yield parsed.update_query_dict({'options': '-csearch_path=' + schema}).render_as_string(hide_password=False)
    finally:
        with engine.begin() as con: con.execute(text('DROP SCHEMA ' + schema + ' CASCADE'))
        engine.dispose()


def test_postgres_migracao_snapshot_api_e_sequencias(source, tmp_path, monkeypatch, postgres_url):
    source_db, media = source
    engine = engine_for_url(postgres_url)
    target_media = tmp_path / 'media-pg'
    try:
        report = restore_empty(source_db, engine, LocalStorage(target_media), media)
        assert report['counts']['state_history'] == 1
        sqlite_snapshot(engine, tmp_path / 'de-volta.sqlite3')
        with sqlite3.connect(tmp_path / 'de-volta.sqlite3') as con:
            assert con.execute('SELECT COUNT(*) FROM media_assets').fetchone()[0] == 1
        monkeypatch.setenv('EGIDIUS_MEDIA_DIR', str(target_media))
        app = create_app(postgres_url)
        with TestClient(app, base_url='http://127.0.0.1:8017', client=('127.0.0.1', 1)) as c:
            auth = c.post('/api/auth/local').json(); headers = {'X-CSRF-Token': auth['csrf']}
            current = c.get('/api/state').json()
            current['data']['jogadores'].append({'id': 'j2', 'nome': 'Novo teste'})
            assert c.put('/api/state', headers=headers, json={'expected_revision': current['revision'], 'data': current['data']}).status_code == 200
            assert c.put('/api/state', headers=headers, json={'expected_revision': current['revision'], 'data': current['data']}).status_code == 409
            backup = c.get('/api/backup/download')
            assert backup.status_code == 200
            with zipfile.ZipFile(io.BytesIO(backup.content)) as bundle:
                assert any(name.startswith('media/') for name in bundle.namelist())
        app.state.engine.dispose()
    finally:
        engine.dispose()


def test_integracao_s3_persiste_apos_troca_do_disco_temporario(source, tmp_path, monkeypatch):
    endpoint = os.getenv('EGIDIUS_TEST_S3_ENDPOINT')
    if not endpoint:
        pytest.skip('S3 compatível isolado disponível na CI.')
    monkeypatch.setenv('EGIDIUS_STORAGE_TESTING', 'true')
    bucket = 'egidius-' + uuid.uuid4().hex
    storage = S3Storage(endpoint, bucket, 'egidius-test', 'somente-testes-locais-123', 'us-east-1', '')
    storage.client.create_bucket(Bucket=bucket)
    source_db, media = source
    engine = engine_for_url('sqlite:///' + str(tmp_path / 'remoto.sqlite3'))
    try:
        restore_empty(source_db, engine, storage, media)
        with sqlite3.connect(tmp_path / 'remoto.sqlite3') as con:
            name, size = con.execute('SELECT stored_name,size FROM media_assets').fetchone()
        downloaded = tmp_path / 'nova-pasta' / name
        downloaded.parent.mkdir()
        storage.download(name, downloaded, size)
        assert downloaded.read_bytes() == (media / name).read_bytes()
    finally:
        engine.dispose()
        listed = storage.client.list_objects_v2(Bucket=bucket).get('Contents', [])
        for obj in listed: storage.client.delete_object(Bucket=bucket, Key=obj['Key'])
        storage.client.delete_bucket(Bucket=bucket)


def test_primeira_carga_postgres_recusa_vazio_e_reinicio_nao_sobrescreve(source, tmp_path, monkeypatch, postgres_url):
    from egidius_api.bootstrap import preparar_volume
    import egidius_api.storage as storage_module
    source_db, _ = source
    with sqlite3.connect(source_db) as con:
        con.execute('DELETE FROM media_assets')
    raw = source_db.read_bytes()
    monkeypatch.setenv('EGIDIUS_DEPLOYMENT_MODE', 'neon')
    monkeypatch.setenv('EGIDIUS_STORAGE_BACKEND', 's3')
    monkeypatch.setenv('EGIDIUS_STORAGE_TESTING', 'true')
    monkeypatch.setenv('EGIDIUS_DATABASE_URL', postgres_url)
    monkeypatch.setenv('EGIDIUS_LOCAL_ACCESS', 'false')
    monkeypatch.setenv('EGIDIUS_SECURE_COOKIES', 'true')
    monkeypatch.setenv('EGIDIUS_PUBLIC_INVITE_TOKEN', 'convite-somente-para-testes-' * 3)
    monkeypatch.setattr(storage_module, 'get_storage', lambda: LocalStorage(tmp_path / 'cloud-media'))
    monkeypatch.delenv('EGIDIUS_INITIAL_DATABASE_B64', raising=False)
    with pytest.raises(RuntimeError, match='Nenhuma base vazia'): preparar_volume()
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_B64', base64.b64encode(gzip.compress(raw)).decode())
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_SHA256', hashlib.sha256(raw).hexdigest())
    preparar_volume()
    monkeypatch.delenv('EGIDIUS_INITIAL_DATABASE_B64')
    monkeypatch.delenv('EGIDIUS_INITIAL_DATABASE_SHA256')
    preparar_volume()
    engine = engine_for_url(postgres_url)
    try:
        with engine.connect() as con:
            assert con.execute(text('SELECT revision FROM state WHERE id=1')).scalar_one() == 1
            assert con.execute(text('SELECT COUNT(*) FROM users')).scalar_one() == 1
    finally:
        engine.dispose()
    assert source_db.read_bytes() == raw
