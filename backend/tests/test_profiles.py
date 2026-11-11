import pytest
from fastapi.testclient import TestClient
from egidius_api.main import create_app
from egidius_api.db import User, AthleteProfile
from egidius_api.security import hash_password

@pytest.fixture()
def client(tmp_path):
    url=f'sqlite:///{tmp_path / "profiles.sqlite3"}'
    app=create_app(url)
    with app.state.db_factory() as db:
        db.add(User(username='admin',password_hash=hash_password('senha_muito_segura_123')))
        db.commit()
    with TestClient(app) as c:
        yield c,app,url
    app.state.engine.dispose()

def csrf(c):
    r=c.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'})
    assert r.status_code==200
    return {'X-CSRF-Token':r.json()['csrf']}

def roster(c,h):
    doc={'versao':5,'jogadores':[{'id':'p1','nome':'Joãozinho'},{'id':'p2','nome':'Rosa'}],'rodadas':[]}
    r=c.put('/api/state',json={'expected_revision':0,'data':doc},headers=h)
    assert r.status_code==200,r.text
    return doc

def profile(**kwargs):
    return {'nomeExibicao':'João','apelido':'Juninho','posicao':'atacante','peDominante':'direito',
            'situacao':'ativo','numeroFigurinha':11,'entradaGrupo':'2020-01-01',
            'miniBio':'Joga há muitos anos','bordao':'Hoje tem!'} | kwargs

def put(c,h,pid,rev=0,body=None):
    return c.put(f'/api/athletes/profiles/{pid}',headers=h,json={'expected_revision':rev,'profile':body or profile()})

def test_autenticacao_e_id_existente(client):
    c,_,_=client
    assert c.get('/api/athletes/profiles').status_code==401
    h=csrf(c)
    assert put(c,{},'p1').status_code==403
    assert put(c,h,'inexistente').status_code==404
    assert c.get('/api/athletes/profiles').json()=={'profiles':[]}

def test_salvar_sem_afetar_partidas_e_versoes(client):
    c,app,_=client
    h=csrf(c); original=roster(c,h)
    before=c.get('/api/state').json()
    r=put(c,h,'p1');assert r.status_code==200,r.text
    assert r.json()['revision']==1 and r.json()['profile']['apelido']=='Juninho'
    assert r.json()['fotoMediaId'] is None and r.json()['caricaturaMediaId'] is None
    assert c.get('/api/state').json()==before
    assert c.get('/api/athletes/profiles').json()['profiles'][0]['athlete_id']=='p1'
    app.state.engine.dispose()
    other=create_app(str(app.state.engine.url))
    with TestClient(other) as c2:
        assert c2.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'}).status_code==200
        assert c2.get('/api/athletes/profiles').json()['profiles'][0]['profile']['apelido']=='Juninho'
    other.state.engine.dispose()

def test_revisoes_e_conflito(client):
    c,_,_=client;h=csrf(c);roster(c,h)
    assert put(c,h,'p1').status_code==200
    assert put(c,h,'p1',rev=0).status_code==409
    assert put(c,h,'p1',rev=1,body=profile(apelido='Novo')).status_code==200
    assert put(c,h,'p1',rev=1,body=profile(apelido='Antigo')).status_code==409
    assert c.get('/api/athletes/profiles').json()['profiles'][0]['profile']['apelido']=='Novo'

def test_figurinhas_unicas_e_campos_invalidos(client):
    c,_,_=client;h=csrf(c);roster(c,h)
    assert put(c,h,'p1').status_code==200
    assert put(c,h,'p2',body=profile()).status_code==409
    assert put(c,h,'p2',body=profile(numeroFigurinha=12)).status_code==200
    assert put(c,h,'p1',rev=1,body=profile(numeroFigurinha=12)).status_code==409
    assert put(c,h,'p1',rev=1,body=profile(entradaGrupo='2026-02-31')).status_code==422
    assert put(c,h,'p1',rev=1,body=profile(posicao='ponta-esquerda')).status_code==422
    assert put(c,h,'p1',rev=1,body=profile(fotoMediaId='nao-permitido')).status_code==422

def test_protecao_csrf_origem(client):
    c,_,_=client;h=csrf(c);roster(c,h)
    assert put(c,{**h,'Origin':'https://exemplo-malicioso.invalid'},'p1').status_code==403

def test_perfil_orfao_nao_aparece_em_listagem(client):
    c,_,_=client;h=csrf(c);roster(c,h)
    assert put(c,h,'p1').status_code==200
    empty={'versao':5,'jogadores':[],'rodadas':[]}
    assert c.put('/api/state',headers=h,json={'expected_revision':1,'data':empty}).status_code==200
    assert c.get('/api/athletes/profiles').json()['profiles']==[]
