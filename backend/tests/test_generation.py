from test_api import client, auth, doc
from egidius_api.db import State, OperationAudit

def test_reinicio_bloqueia_cliente_antigo_mesmo_com_revisao_atual(client):
    c,app=client;csrf=auth(c);headers={'X-CSRF-Token':csrf}
    assert c.put('/api/state',json={'expected_revision':0,'data':doc('Teste antigo')},headers=headers).status_code==200
    with app.state.db_factory.begin() as db:
        db.add(OperationAudit(actor='admin',action='test-data-reset'))
        s=db.get(State,1);s.revision+=1;s.payload='{"versao":5,"jogadores":[],"rodadas":[]}'
    remote=c.get('/api/state').json();assert remote['generation']>0
    stale={'expected_revision':remote['revision'],'data':doc('Não deve voltar')}
    assert c.put('/api/state',json=stale,headers=headers).status_code==409
    assert c.get('/api/state').json()['data']['jogadores']==[]
    stale['expected_generation']=remote['generation']
    assert c.put('/api/state',json=stale,headers=headers).status_code==200
    assert c.get('/api/state').json()['data']['jogadores'][0]['nome']=='Não deve voltar'

def test_auditoria_comum_nao_muda_geracao(client):
    c,app=client;auth(c)
    with app.state.db_factory.begin() as db:db.add(OperationAudit(actor='admin',action='download backup'))
    assert c.get('/api/state').json()['generation']==0
