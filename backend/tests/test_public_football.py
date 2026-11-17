import json
from copy import deepcopy
from sqlalchemy import func, select
from test_api import client, auth
from egidius_api.db import State, Session, History, User, OperationAudit, AthleteProfile


def example():
    game = dict(id='g1', numero=1, timeA='Azul', timeB='Branco', golsA=2, golsB=1,
                observacoes='NOTA_PRIVADA_SENTINELA', status='encerrada', atletasA=['p1'],
                atletasB=['p2'], golsPorAtleta={'p1':2, 'p2':1}, goleiroA='p1', goleiroB='p2',
                permitirGolsSemAutor=False, vinculoFormacao=True, equipeIdA='a', equipeIdB='b')
    draft = dict(game, id='g2', numero=2, status='rascunho', golsA=9, golsPorAtleta={'p1':9,'p2':1})
    trash = dict(game, id='excluido-segredo', status='rascunho', observacoes='LIXEIRA_PRIVADA_SENTINELA')
    return dict(versao=5, jogadores=[dict(id='p1',nome='Ana'),dict(id='p2',nome='Beto')],
                rodadas=[dict(id='r1',data='2026-11-14',presencas=['p1','p2'],indisponiveis=['p2'],
                              equipes=[dict(id='a',nome='Azul',atletas=['p1']),dict(id='b',nome='Branco',atletas=[])],
                              jogos=[game,draft])],
                lixeira=[dict(id='t1',rodadaId='r1',excluidoEm='2026-11-17T12:00:00Z',jogo=trash)],
                viagem={'observacoes':'VIAGEM_PRIVADA_SENTINELA'}, novoCampoPrivado='CAMPO_PRIVADO_SENTINELA')


def seed(app, value):
    with app.state.db_factory.begin() as db:
        db.get(State,1).payload=json.dumps(value)


def test_anonimo_consulta_sem_criar_conta_sessao_ou_alterar_banco(client):
    c,app=client;seed(app,example())
    def snapshot():
        with app.state.db_factory() as db:
            return [db.scalar(select(func.count()).select_from(model)) for model in (User,Session,History,OperationAudit)], db.get(State,1).payload
    before=snapshot()
    for _ in range(3):
        r=c.get('/api/public/football');assert r.status_code==200
        assert 'set-cookie' not in r.headers
        assert r.headers['cache-control']=='no-store'
    assert snapshot()==before
    assert not c.get('/api/auth/status').json()['authenticated']


def test_projecao_so_expoe_futebol_sem_notas_fichas_viagem_ou_lixeira(client):
    c,app=client;seed(app,example())
    with app.state.db_factory.begin() as db:
        db.add(AthleteProfile(athlete_id='p1',revision=1,payload='{"miniBio":"FICHA_PRIVADA_SENTINELA"}'))
    r=c.get('/api/public/football');assert r.status_code==200
    value=r.json();assert set(value)=={'jogadores','rodadas','rankings'}
    assert set(value['jogadores'][0])=={'id','nome'}
    assert set(value['rodadas'][0])=={'id','data','presencas','equipes','jogos'}
    assert set(value['rodadas'][0]['jogos'][0])=={'id','numero','timeA','timeB','golsA','golsB','status','atletasA','atletasB','goleiroA','goleiroB','golsPorAtleta'}
    for private in ('SENTINELA','observacoes','lixeira','viagem','indisponiveis','password','token','csrf','audit','excluido-segredo'):
        assert private not in r.text
    assert value['rodadas'][0]['jogos'][0]['atletasB']==['p2']  # histórico preservado
    assert value['rodadas'][0]['equipes'][1]['atletas']==[]  # montagem futura independente


def test_rankings_contam_so_encerrados_e_presencas_uma_vez(client):
    c,app=client;seed(app,example());stats={p['id']:p for p in c.get('/api/public/football').json()['rankings']}
    a,b=stats['p1'],stats['p2']
    assert (a['jogos'],a['pontos'],a['gols'],a['vitorias'],a['presencas'])==(1,3,2,1,1)
    assert (b['jogos'],b['pontos'],b['gols'],b['derrotas'],b['presencas'])==(1,0,1,1,1)
    assert (a['jogosGoleiro'],a['golsSofridos'],b['golsSofridos'])==(1,1,2)
    value=example();value['rodadas'][0]['jogos'][0]['golsB']=2;value['rodadas'][0]['jogos'][0]['golsPorAtleta']['p2']=1
    seed(app,value);stats=c.get('/api/public/football').json()['rankings']
    assert all(p['pontos']==1 and p['empates']==1 for p in stats)
    assert stats[1]['gols']==1  # gol sem autoria não é inventado


def test_base_vazia_e_erro_de_estado_nao_vazam_conteudo(client):
    c,app=client
    assert c.get('/api/public/football').json()==dict(jogadores=[],rodadas=[],rankings=[])
    seed(app,{'segredo':'PRIVADO_SENTINELA'})
    r=c.get('/api/public/football');assert r.status_code==503 and 'SENTINELA' not in r.text


def test_publico_nao_abre_nenhum_endpoint_privado_nem_gravacao(client):
    c,app=client;seed(app,example())
    for path in ('/api/state','/api/profiles','/api/media','/api/media/privado','/api/backup/download','/api/admin/access','/api/viagem-ssw','/api/public/football/privado'):
        assert c.get(path).status_code==401,path
    for method in ('post','put','patch','delete'):
        for path in ('/api/public/football','/api/state','/api/media','/api/admin/access'):
            assert c.request(method.upper(),path,json={}).status_code==401


def test_autenticacao_e_gravacao_continuam_funcionando(client):
    c,app=client;csrf=auth(c);value=example();value.pop('novoCampoPrivado');value.pop('viagem')
    r=c.put('/api/state',json={'expected_revision':0,'data':value},headers={'X-CSRF-Token':csrf});assert r.status_code==200,r.text
    assert c.get('/api/state').status_code==200
    assert c.get('/api/public/football').status_code==200
