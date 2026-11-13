from test_api import client, auth
from fastapi.testclient import TestClient
from egidius_api.db import User,UserRole
from egidius_api.security import hash_password

def login_as(c,app,username,role):
    with app.state.db_factory.begin() as db:
        db.add(User(username=username,password_hash=hash_password('senha-ficticia-somente-teste')));db.flush();db.add(UserRole(username=username,role=role))
    r=c.post('/api/auth/login',json={'username':username,'password':'senha-ficticia-somente-teste'})
    assert r.status_code==200
    assert r.json()['role']==role
    return {'X-CSRF-Token':r.json()['csrf']}

def test_consulta_nao_grava_nem_baixa_backup(client):
    c,app=client;h=login_as(c,app,'leitor','viewer')
    remote=c.get('/api/state');assert remote.status_code==200
    assert c.put('/api/state',json={'expected_revision':remote.json()['revision'],'data':remote.json()['data']},headers=h).status_code==403
    assert c.get('/api/backup/download').status_code==403
    assert c.get('/api/admin/access').status_code==403

def test_operador_registra_futebol_mas_nao_administra(client):
    c,app=client;h=login_as(c,app,'mesario','operator');state=c.get('/api/state').json()
    assert c.put('/api/state',json={'expected_revision':state['revision'],'data':state['data']},headers=h).status_code==200
    assert c.get('/api/backup/download').status_code==403
    assert c.delete('/api/media/inexistente/purge',headers=h).status_code==403
    assert c.put('/api/admin/access/admin',json={'role':'viewer'},headers=h).status_code==403

def test_admin_atribui_acesso_sem_alterar_sua_propria_conta(client):
    c,app=client;login_as(c,app,'leitor','viewer');h={'X-CSRF-Token':auth(c)}
    assert c.put('/api/admin/access/leitor',json={'role':'operator'},headers=h).status_code==200
    assert c.put('/api/admin/access/admin',json={'role':'viewer'},headers=h).status_code==409
    data=c.get('/api/admin/access').json();assert any(u['username']=='leitor' and u['role']=='operator' for u in data['users'])
    assert any('access/leitor' in a['action'] for a in data['audit'])

def test_convite_coletivo_nunca_concede_admin(client,monkeypatch):
    c,app=client;monkeypatch.setenv('EGIDIUS_PUBLIC_INVITE_TOKEN','convite-ficticio-comprido-somente-teste-1234567890')
    r=c.post('/api/auth/invite',json={'token':'convite-ficticio-comprido-somente-teste-1234567890'});assert r.status_code==200
    assert r.json()['role']=='operator';assert c.get('/api/backup/download').status_code==403

def test_convite_individual_e_revogacao_encerram_sessoes(client):
    c,app=client;h={'X-CSRF-Token':auth(c)}
    r=c.post('/api/admin/invites',json={'username':'membro_novo','role':'viewer'},headers=h);assert r.status_code==200,r.text
    invited=TestClient(app);entry=invited.post('/api/auth/invite',json={'token':r.json()['token']});assert entry.status_code==200
    assert entry.json()['role']=='viewer';assert invited.get('/api/state').status_code==200
    assert c.post('/api/admin/invites/membro_novo/revoke',headers=h).status_code==200
    assert invited.get('/api/state').status_code==401
    assert invited.post('/api/auth/invite',json={'token':r.json()['token']}).status_code==403
    assert c.post('/api/admin/invites',json={'username':'admin','role':'operator'},headers=h).status_code==409

def test_grupo_nao_recebe_admin_por_troca_de_papel(client):
    c,app=client;login_as(c,app,'confrade_ssw','operator');h={'X-CSRF-Token':auth(c)}
    assert c.put('/api/admin/access/confrade_ssw',json={'role':'admin'},headers=h).status_code==409

def test_snapshot_de_jogo_encerrado_so_muda_apos_reabertura(client):
    from copy import deepcopy
    c,app=client;h={'X-CSRF-Token':auth(c)}
    game={'id':'g1','numero':1,'timeA':'Branco','timeB':'Colorido','golsA':1,'golsB':0,'observacoes':'histórico','status':'encerrada','atletasA':['p1'],'atletasB':['p2'],'golsPorAtleta':{'p1':1},'goleiroA':'p1','goleiroB':'p2','permitirGolsSemAutor':False,'vinculoFormacao':True,'equipeIdA':'a','equipeIdB':'b'}
    data={'versao':5,'jogadores':[{'id':'p1','nome':'A'},{'id':'p2','nome':'B'}],'rodadas':[{'id':'r1','data':'2026-11-14','presencas':['p1','p2'],'equipes':[{'id':'a','nome':'Branco','atletas':['p1']},{'id':'b','nome':'Colorido','atletas':['p2']}],'jogos':[game]}]}
    assert c.put('/api/state',json={'expected_revision':0,'data':data},headers=h).status_code==200
    future=deepcopy(data);future['rodadas'][0]['equipes'][0]['nome']='Próximo';future['rodadas'][0]['equipes'][0]['id']='novo-id'
    assert c.put('/api/state',json={'expected_revision':1,'data':future},headers=h).status_code==200
    bad=deepcopy(future);bad['rodadas'][0]['jogos'][0]['golsA']=2
    assert c.put('/api/state',json={'expected_revision':2,'data':bad},headers=h).status_code==422
    reopened=deepcopy(future);reopened['rodadas'][0]['jogos'][0]['status']='rascunho'
    assert c.put('/api/state',json={'expected_revision':2,'data':reopened},headers=h).status_code==200
    reopened['rodadas'][0]['jogos'][0]['observacoes']='correção explícita'
    assert c.put('/api/state',json={'expected_revision':3,'data':reopened},headers=h).status_code==200

def test_migracao_preserva_admin_legado_sem_promover_contas_criadas_depois(client):
    from egidius_api.main import create_app
    from sqlalchemy import text
    from egidius_api.permissions import role_for
    c,app=client
    with app.state.db_factory.begin() as db:db.add(User(username='gestor_antigo',password_hash=hash_password('senha-ficticia-somente-teste')))
    with app.state.engine.begin() as db:db.execute(text('DROP TABLE user_roles'))
    upgraded=create_app(str(app.state.engine.url))
    with upgraded.state.db_factory.begin() as db:
        assert role_for(db,'gestor_antigo')=='admin'
        db.add(User(username='conta_nova',password_hash=hash_password('senha-ficticia-somente-teste')))
    again=create_app(str(app.state.engine.url))
    with again.state.db_factory() as db:assert role_for(db,'conta_nova')=='viewer'
    upgraded.state.engine.dispose();again.state.engine.dispose()
