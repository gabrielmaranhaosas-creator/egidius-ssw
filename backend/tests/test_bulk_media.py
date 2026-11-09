import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from egidius_api.db import User
from egidius_api.main import create_app
from egidius_api.security import hash_password


def make_image(fmt='PNG'):
    out=io.BytesIO()
    Image.new('RGB',(20,20),(192,77,28)).save(out,format=fmt)
    return out.getvalue()


def make_zip(contents):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for n,blob in contents.items(): z.writestr(n,blob)
    return out.getvalue()


@pytest.fixture
def ctx(tmp_path,monkeypatch):
    monkeypatch.setenv('EGIDIUS_MEDIA_DIR',str(tmp_path/'media'))
    app=create_app(f'sqlite:///{tmp_path/"test.sqlite3"}')
    with app.state.db_factory() as db:
        db.add(User(username='admin',password_hash=hash_password('senha_muito_segura_123')))
        db.commit()
    with TestClient(app) as c:
        login=c.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'})
        h={'X-CSRF-Token':login.json()['csrf']}
        state={'versao':5,'jogadores':[{'id':'p1','nome':'Joãozinho'},{'id':'p2','nome':'Takeshi'}], 'rodadas':[]}
        assert c.put('/api/state',headers=h,json={'expected_revision':0,'data':state}).status_code==200
        yield c,h,state, tmp_path/'media'
    app.state.engine.dispose()


def preview(c,h,files):
    return c.post('/api/import-media/preview',params={'filename':'jogadores.zip'},headers=h, content=make_zip(files))


def payload(p,ids=None):
    ids=ids or {}
    return {'batch_id':p['batch_id'],'expected_state_revision':p['revision'],'confirm':True,
            'items':[{'item_id':i['item_id'],'athlete_id':ids.get(i['item_id'],i['athlete_id']),
                       'kind':i['kind']} for i in p['items'] if ids.get(i['item_id'],i['athlete_id'])]}


def test_preview_confirma_persistencia_e_nao_altera_rodadas(ctx):
    c,h,doc,media_dir=ctx
    initial=c.get('/api/state').json()
    r=preview(c,h,{'Joaozinho_foto.jpg':make_image('JPEG'), 'Takeshi_caricatura.png':make_image()})
    assert r.status_code==200,r.text
    p=r.json()
    assert len(p['items'])==2
    assert {x['athlete_id'] for x in p['items']}=={'p1','p2'}
    assert {x['kind'] for x in p['items']}=={'photo','caricature'}
    img=p['items'][0]
    response=c.get(f'/api/import-media/preview/{p["batch_id"]}/{img["item_id"]}/image')
    assert response.status_code==200
    assert c.post('/api/import-media/apply',json=payload(p)).status_code==403
    result=c.post('/api/import-media/apply',headers=h,json=payload(p))
    assert result.status_code==200,result.text
    assert result.json()['created']==2
    assert c.get('/api/state').json()==initial
    assert len(c.get('/api/media').json()['items'])==2
    assert c.post('/api/import-media/apply',headers=h,json=payload(p)).status_code==404


def test_sem_vinculo_expresso_nao_aplica(ctx):
    c,h,_,media=ctx
    p=preview(c,h,{'Indefinido_foto.png':make_image()}).json()
    assert p['items'][0]['athlete_id'] is None
    missing={'batch_id':p['batch_id'],'expected_state_revision':p['revision'], 'confirm':True,'items':[]}
    assert c.post('/api/import-media/apply',headers=h,json=missing).status_code==422
    i=p['items'][0]['item_id']
    r=c.post('/api/import-media/apply',headers=h,json=payload(p,{i:'p2'}))
    assert r.status_code==200,r.text
    assert c.get('/api/media',params={'scope':'athlete','athlete_id':'p2'}).json()['items'][0]['kind']=='photo'


def test_antigo_retrato_nao_excluido(ctx):
    c,h,_,media=ctx
    p=preview(c,h,{'Joaozinho_foto.png':make_image()}).json()
    assert c.post('/api/import-media/apply',headers=h,json=payload(p)).status_code==200
    p2=preview(c,h,{'Joaozinho_caricatura.png':make_image()}).json()
    assert c.post('/api/import-media/apply',headers=h,json=payload(p2)).status_code==200
    result=c.get('/api/media',params={'scope':'athlete','athlete_id':'p1'}).json()['items']
    assert len(result)==2 and {x['kind'] for x in result}=={'photo','caricature'}


def test_rejeita_tipo_invalido_path_e_arquivo_maior_que_limite(ctx):
    c,h,_,_=ctx
    assert preview(c,h,{'../Joaozinho.png':make_image()}).status_code==422
    assert preview(c,h,{'Joaozinho.png':b'not a picture'}).status_code==415
    assert preview(c,h,{'Joaozinho.exe':b'x'}).status_code==415
    assert preview(c,h,{'Joaozinho.png':make_image(),'Outra.png':b'A'*(12*1024*1024+1)}).status_code==413


def test_csrf_auth_e_troca_do_cadastro(ctx):
    c,h,doc,media=ctx
    assert preview(c,{}, {'Joaozinho.png':make_image()}).status_code==403
    assert preview(c,{**h,'Origin':'https://evil.invalid'},{'Joaozinho.png':make_image()}).status_code==403
    p=preview(c,h,{'Joaozinho.png':make_image()}).json()
    assert c.put('/api/state',headers=h,json={'expected_revision':1,'data':doc}).status_code==200
    assert c.post('/api/import-media/apply',headers=h,json=payload(p)).status_code==409
    assert c.get('/api/media').json()['items']==[]


def test_nao_permite_repetir_imagem_no_mesmo_lote(ctx):
    c,h,doc,_=ctx
    p=preview(c,h,{'Joaozinho.png':make_image()}).json()
    items=payload(p)['items']
    req=payload(p);req['items']=items+items
    assert c.post('/api/import-media/apply',headers=h,json=req).status_code==409
    assert c.get('/api/media').json()['items']==[]
