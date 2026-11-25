import io
import json
import zipfile
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from PIL import Image
from pypdf import PdfWriter

from test_media import ctx
from egidius_api.main import create_app
from egidius_api.db import engine_for_url
from egidius_api.portability import unpack_backup, restore_empty
from egidius_api.storage import LocalStorage


def archive_upload(c, h, name, data, **params):
    return c.post('/api/media/upload', params={'scope': 'archive', 'kind': 'document', **params},
                  content=data, headers={**h, 'X-Egidius-Filename': quote(name)})


def samples():
    workbook = Workbook()
    workbook.active.append(['Nome', 'Ano'])
    workbook.active.append(['História SSW', 2015])
    xlsx = io.BytesIO()
    workbook.save(xlsx)
    workbook.close()
    pdf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.write(pdf)
    image = io.BytesIO()
    Image.new('RGB', (10, 10), 'red').save(image, format='JPEG')
    return [('historia.xlsx', xlsx.getvalue()), ('memoria.pdf', pdf.getvalue()),
            ('foto.jpeg', image.getvalue()), ('nomes.csv', b'nome;ano\nTeste;2015'),
            ('nomes.tsv', b'nome\tano\nTeste\t2015'), ('texto.txt', 'Sábado Show'.encode()),
            ('dados.json', json.dumps({'ano': 2015}).encode()), ('texto-antigo.txt', 'Memória histórica'.encode('cp1252'))]


@pytest.mark.parametrize('name,content', samples())
def test_archive_preserva_original_sem_alterar_futebol(ctx, name, content):
    c, h, *_ = ctx
    before = c.get('/api/state').json()
    result = archive_upload(c, h, name, content)
    assert result.status_code == 201, result.text
    item = result.json()
    assert item['scope'] == 'archive' and item['round_id'] is None
    assert len(item['mime_type']) <= 50
    download = c.get(item['url'])
    assert download.content == content
    assert 'attachment' in download.headers['content-disposition']
    assert c.get('/api/state').json() == before
    assert c.get('/api/media', params={'scope': 'archive'}).json()['items'][0]['id'] == item['id']
    assert not c.get('/api/media', params={'scope': 'round', 'round_id': 'r1'}).json()['items']


def test_archive_paginar_excluir_restaurar_e_proteger(ctx):
    c, h, _, _, app = ctx
    ids = [archive_upload(c, h, f'texto-{i}.txt', f'Texto {i}'.encode()).json()['id'] for i in range(3)]
    first = c.get('/api/media?scope=archive&limit=2').json()['items']
    second = c.get('/api/media?scope=archive&limit=2&offset=2').json()['items']
    assert {x['id'] for x in first + second} == set(ids)
    item = first[0]
    assert c.delete('/api/media/' + item['id'], headers=h).status_code == 200
    assert c.get(item['url']).status_code == 404
    assert c.post('/api/media/' + item['id'] + '/restore', headers=h).status_code == 200
    assert c.get(item['url']).status_code == 200
    assert archive_upload(c, {}, 'sem-csrf.txt', b'Texto').status_code == 403
    with TestClient(app) as anonymous:
        assert anonymous.get('/api/media?scope=archive').status_code == 401
        assert anonymous.get(item['url']).status_code == 401


@pytest.mark.parametrize('name,content', [
    ('executavel.exe', b'MZexecutavel'), ('falso.pdf', b'texto'),
    ('quebrado.xlsx', b'PKinvalido'), ('dados.json', b'{invalido'),
    ('binario.txt', b'\x00binario'), ('vazio.txt', b'')
])
def test_archive_rejeita_arquivo_invalido_sem_gravacao(ctx, name, content):
    c, h, *_ = ctx
    result = archive_upload(c, h, name, content)
    assert result.status_code in (415, 422), result.text
    assert not c.get('/api/media?scope=archive').json()['items']


def test_archive_independe_de_rodada_e_rejeita_vinculo_indevido(ctx):
    c, h, *_ = ctx
    state = c.get('/api/state').json()
    assert c.put('/api/state', headers=h, json={
        'expected_revision': state['revision'],
        'data': {'versao': 5, 'jogadores': [], 'rodadas': []}
    }).status_code == 200
    assert archive_upload(c, h, 'historico.txt', b'Acervo sem rodada').status_code == 201
    assert archive_upload(c, h, 'erro.txt', b'Texto', round_id='r1').status_code == 422


def test_archive_backup_restaura_bytes_e_lixeira(ctx, monkeypatch):
    c, h, tmp, _, _ = ctx
    content = b'nome;ano\nSSW;2015'
    item = archive_upload(c, h, 'historia.csv', content).json()
    assert c.delete('/api/media/' + item['id'], headers=h).status_code == 200
    backup = c.get('/api/backup/download')
    assert backup.status_code == 200
    archive = tmp / 'backup-acervo.zip'
    archive.write_bytes(backup.content)
    target, media = tmp / 'restored.sqlite3', tmp / 'restored-media'
    engine = engine_for_url('sqlite:///' + str(target))
    try:
        with unpack_backup(archive) as (db, files):
            restore_empty(db, engine, LocalStorage(media), files)
        monkeypatch.setenv('EGIDIUS_MEDIA_DIR', str(media))
        restored = create_app('sqlite:///' + str(target))
        try:
            with TestClient(restored) as client:
                auth = client.post('/api/auth/login', json={'username': 'admin', 'password': 'senha_mais_que_segura_123'}).json()
                assert client.get(item['url']).status_code == 404
                assert client.post('/api/media/' + item['id'] + '/restore', headers={'X-CSRF-Token': auth['csrf']}).status_code == 200
                assert client.get(item['url']).content == content
        finally:
            restored.state.engine.dispose()
    finally:
        engine.dispose()

@pytest.mark.parametrize('extension,member,mime', [
    ('.docx', 'word/document.xml', None),
    ('.pptx', 'ppt/presentation.xml', None),
    ('.ods', None, 'application/vnd.oasis.opendocument.spreadsheet'),
    ('.odt', None, 'application/vnd.oasis.opendocument.text'),
    ('.odp', None, 'application/vnd.oasis.opendocument.presentation'),
])
def test_archive_documentos_compactados(ctx, extension, member, mime):
    c, h, *_ = ctx
    package = io.BytesIO()
    with zipfile.ZipFile(package, 'w') as archive:
        if member:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr(member, '<document/>')
        else:
            archive.writestr('mimetype', mime)
            archive.writestr('content.xml', '<document/>')
    content = package.getvalue()
    result = archive_upload(c, h, 'historia' + extension, content)
    assert result.status_code == 201, result.text
    assert len(result.json()['mime_type']) <= 50
    assert c.get(result.json()['url']).content == content
