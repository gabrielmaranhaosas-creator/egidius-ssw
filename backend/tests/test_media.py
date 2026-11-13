from __future__ import annotations

import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from egidius_api.main import create_app
from egidius_api.db import User
from egidius_api.security import hash_password

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 200
MP4 = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 200

@pytest.fixture
def ctx(tmp_path, monkeypatch):
    monkeypatch.setenv('EGIDIUS_MEDIA_DIR', str(tmp_path/'media'))
    url = f'sqlite:///{tmp_path/"system.sqlite3"}'
    app = create_app(url)
    with app.state.db_factory() as db:
        db.add(User(username='admin', password_hash=hash_password('senha_mais_que_segura_123')))
        db.commit()
    with TestClient(app) as c:
        r = c.post('/api/auth/login', json={'username':'admin','password':'senha_mais_que_segura_123'})
        assert r.status_code == 200
        h={'X-CSRF-Token':r.json()['csrf']}
        doc={'versao':5,'jogadores':[{'id':'u1','nome':'Bia'}], 'rodadas':[
            {'id':'r1','data':'2026-10-17','presencas':[], 'equipes':[], 'jogos':[
                {'id':'m1','numero':1,'timeA':'Branco','timeB':'Laranja',
                 'golsA':1,'golsB':0,'observacoes':'','status':'rascunho',
                 'atletasA':[],'atletasB':[],'golsPorAtleta':{},'goleiroA':None,
                 'goleiroB':None,'permitirGolsSemAutor':False,'vinculoFormacao':False,
                 'equipeIdA':None,'equipeIdB':None}
            ]}
        ]}
        r=c.put('/api/state',json={'expected_revision':0,'data':doc},headers=h)
        assert r.status_code==200,r.text
        yield c,h,tmp_path,url,app
    app.state.engine.dispose()


def upload(c,h,data=PNG,params=None,extra_headers=None):
    base={'scope':'athlete','kind':'photo','athlete_id':'u1'}
    return c.post('/api/media/upload',params=params or base,content=data,headers={**h, 'X-Egidius-Filename':'teste.png',**(extra_headers or {})})


def test_upload_private_and_persistent(ctx):
    c,h,tmp,url,app=ctx
    anon=TestClient(app)
    assert anon.get('/api/media?scope=all').status_code==401
    assert anon.get('/api/media/abc/content').status_code==401
    assert upload(c,{}).status_code==403
    r=upload(c,h);assert r.status_code==201,r.text
    item=r.json();assert item['size']==len(PNG) and item['mime_type']=='image/png'
    assert c.get(item['url']).content==PNG
    profiles=c.get('/api/athletes/profiles').json()['profiles']
    # Ainda que a ficha editorial não exista, o retrato é preservado pelo ID.
    assert len(profiles)==1 and profiles[0]['revision']==0 and profiles[0]['fotoMediaId']==item['id']
    assert len(list((tmp/'media').glob('*.png')))==1
    app.state.engine.dispose()
    again=create_app(url)
    with TestClient(again) as c2:
        assert c2.post('/api/auth/login',json={'username':'admin','password':'senha_mais_que_segura_123'}).status_code==200
        assert c2.get('/api/media',params={'scope':'athlete','athlete_id':'u1'}).json()['items'][0]['id']==item['id']
        assert c2.get(item['url']).content==PNG
    again.state.engine.dispose()


def test_portrait_photo_and_caricature(ctx):
    c,h,*_=ctx
    assert upload(c,h).status_code==201
    assert upload(c,h,params={'scope':'athlete','kind':'caricature','athlete_id':'u1'}).status_code==201
    from egidius_api.profiles import PerfilEntrada
    body=PerfilEntrada().model_dump()
    r=c.put('/api/athletes/profiles/u1',headers=h,json={'expected_revision':0,'profile':body})
    assert r.status_code==200,r.text
    obj=r.json()
    assert obj['fotoMediaId'] and obj['caricaturaMediaId'] and obj['fotoMediaId']!=obj['caricaturaMediaId']


def test_round_match_and_delete(ctx):
    c,h,tmp,*_=ctx
    params={'scope':'round','kind':'video','round_id':'r1','match_id':'m1'}
    r=upload(c,h,data=MP4,params=params)
    assert r.status_code==201,r.text
    item=r.json(); assert item['mime_type']=='video/mp4'
    assert c.get('/api/media',params={'scope':'round','round_id':'r1'}).json()['items'][0]['match_id']=='m1'
    edited=c.patch(f'/api/media/{item["id"]}',headers=h,json={'caption':'Gol da rodada'})
    assert edited.status_code==200 and edited.json()['caption']=='Gol da rodada'
    assert c.delete(f'/api/media/{item["id"]}',headers={}).status_code==403
    assert c.delete(f'/api/media/{item["id"]}',headers=h).status_code==200
    assert c.get(item['url']).status_code==404
    assert list((tmp/'media').glob('*.mp4'))  # recuperável na lixeira
    assert c.get('/api/media/trash').json()['items'][0]['id']==item['id']
    assert c.post(f'/api/media/{item["id"]}/restore',headers=h).status_code==200
    assert c.get(item['url']).content==MP4
    assert c.delete(f'/api/media/{item["id"]}',headers=h).status_code==200
    assert c.delete(f'/api/media/{item["id"]}/purge',headers=h).status_code==200
    assert not list((tmp/'media').glob('*.mp4'))


def test_validation_and_cleanup(ctx):
    c,h,tmp,*_=ctx
    assert upload(c,h,data=b'<html>script</html>').status_code==415
    assert upload(c,h,params={'scope':'athlete','kind':'photo','athlete_id':'ghost'}).status_code==404
    assert upload(c,h,params={'scope':'round','kind':'photo','round_id':'r1','match_id':'ghost'}).status_code==404
    assert upload(c,h,params={'scope':'round','kind':'photo','round_id':'r1'},data=MP4).status_code==415
    assert upload(c,h,data=b'\xff\xd8\xff'+b'1'*(12*1024*1024)).status_code==413
    assert not list((tmp/'media').iterdir())


def test_session_scope_and_origin(ctx):
    c,h,*_=ctx
    assert upload(c,{**h,'Origin':'https://invalid.example'}).status_code==403
    assert upload(c,h,params={'scope':'athlete','kind':'video','athlete_id':'u1'},data=MP4).status_code==422
    assert upload(c,h,params={'scope':'round','kind':'photo','round_id':'invalid'}).status_code==404
