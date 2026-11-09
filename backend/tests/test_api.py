import importlib, json
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

@pytest.fixture()
def client(tmp_path, monkeypatch):
    url = f'sqlite:///{tmp_path / "egidius.sqlite3"}'
    monkeypatch.setenv('EGIDIUS_DATABASE_URL',url)
    from egidius_api.main import create_app
    from egidius_api.db import User
    from egidius_api.security import hash_password
    app=create_app(url)
    with app.state.db_factory() as db:
        db.add(User(username='admin', password_hash=hash_password('senha_muito_segura_123')))
        db.commit()
    with TestClient(app) as c:
        yield c,app

def auth(c):
    response=c.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'})
    assert response.status_code==200,response.text
    return response.json()['csrf']

def doc(name='Teste'):
    return {'versao':5,'jogadores':[{'id':'p1','nome':name}],'rodadas':[]}

def test_precisa_login(client):
    c,_=client
    assert c.get('/api/state').status_code==401
    assert c.get('/api/auth/status').json()['authenticated'] is False
    assert c.post('/api/auth/login',json={'username':'admin','password':'errada'}).status_code==401

def test_login_csrf_revision(client):
    c,_=client
    csrf=auth(c)
    assert c.get('/api/auth/status').json()['authenticated']
    assert c.get('/api/state').json()['revision']==0
    assert c.put('/api/state',json={'expected_revision':0,'data':doc('Ana')}).status_code==403
    payload={'expected_revision':0,'data':doc('Ana')}
    ok=c.put('/api/state',json=payload,headers={'X-CSRF-Token':csrf,'Origin':'http://127.0.0.1:5173'})
    assert ok.status_code==200,ok.text
    assert ok.json()['revision']==1
    assert c.get('/api/state').json()['data']['jogadores'][0]['nome']=='Ana'
    lost=c.put('/api/state',json=payload,headers={'X-CSRF-Token':csrf})
    assert lost.status_code==409
    assert c.get('/api/state').json()['revision']==1
    assert c.post('/api/auth/logout',headers={'X-CSRF-Token':csrf}).status_code==200
    assert c.get('/api/state').status_code==401

def test_documento_invalido_era_bloqueado(client):
    c,_=client
    csrf=auth(c)
    headers={'X-CSRF-Token':csrf}
    payload={'expected_revision':0,'data':{'versao':5,'jogadores':[],'rodadas':[{'id':'1','data':'2026-10-16','presencas':[],'equipes':[],'jogos':[]}]}}
    assert c.put('/api/state',json=payload,headers=headers).status_code==422
    assert c.get('/api/state').json()['revision']==0

def test_concorrencia_e_persistencia(client):
    c,app=client
    csrf=auth(c)
    update=lambda n,d:c.put('/api/state',json={'expected_revision':n,'data':d},headers={'X-CSRF-Token':csrf})
    assert update(0,doc('Maria')).status_code==200
    assert update(0,doc('Carlos')).status_code==409
    url=str(app.state.engine.url)
    app.state.engine.dispose()
    from egidius_api.main import create_app
    restart=create_app(url)
    with TestClient(restart) as r:
        assert r.get('/api/state').status_code==401
        assert r.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'}).status_code==200
        assert r.get('/api/state').json()['data']['jogadores'][0]['nome']=='Maria'
        assert r.get('/api/state').json()['revision']==1
    restart.state.engine.dispose()

def test_protecao_de_origem(client):
    c,_=client
    csrf=auth(c)
    result=c.put('/api/state',json={'expected_revision':0,'data':doc()},headers={'X-CSRF-Token':csrf,'Origin':'https://site-malicioso.example'})
    assert result.status_code==403

def test_varios_times_e_jogos(client):
    c,_=client
    csrf=auth(c)
    jogadores=[{'id':f'p{i}','nome':f'Atleta {i}'} for i in range(1,7)]
    equipes=[{'id':'a','nome':'Branco','atletas':['p1','p2']},
             {'id':'b','nome':'Colorido','atletas':['p3','p4']},
             {'id':'c','nome':'Azul','atletas':['p5','p6']}]
    def jogo(id, numero,a,b,gols_a,gols_b):
        ea=next(e for e in equipes if e['id']==a)
        eb=next(e for e in equipes if e['id']==b)
        return {'id':id,'numero':numero,'timeA':ea['nome'],'timeB':eb['nome'],
                'equipeIdA':a,'equipeIdB':b,'atletasA':ea['atletas'],'atletasB':eb['atletas'],
                'golsA':gols_a,'golsB':gols_b,'golsPorAtleta':{},'goleiroA':None,'goleiroB':None,
                'observacoes':'','status':'encerrada','permitirGolsSemAutor':True,'vinculoFormacao':True}
    data={'versao':5,'jogadores':jogadores,'rodadas':[
        {'id':'r1','data':'2026-10-17','presencas':[f'p{i}' for i in range(1,7)],
         'equipes':equipes,'jogos':[jogo('j1',1,'a','b',3,2),jogo('j2',2,'c','a',1,0)]}
    ]}
    sent=c.put('/api/state',json={'expected_revision':0,'data':data},headers={'X-CSRF-Token':csrf})
    assert sent.status_code==200,sent.text
    recovered=c.get('/api/state').json()['data']
    assert len(recovered['rodadas'][0]['equipes'])==3
    assert recovered['rodadas'][0]['jogos'][1]['timeA']=='Azul'
