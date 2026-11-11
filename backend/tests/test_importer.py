import io
import json
import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from egidius_api.main import create_app
from egidius_api.db import User
from egidius_api.security import hash_password

@pytest.fixture
def ctx(tmp_path):
    app=create_app(f'sqlite:///{tmp_path/"import.sqlite3"}')
    with app.state.db_factory() as db:
        db.add(User(username='admin',password_hash=hash_password('senha_muito_segura_123')))
        db.commit()
    with TestClient(app) as c:
        login=c.post('/api/auth/login',json={'username':'admin','password':'senha_muito_segura_123'})
        assert login.status_code==200
        headers={'X-CSRF-Token':login.json()['csrf']}
        state={'versao':5,'jogadores':[{'id':'p1','nome':'Joãozinho'},{'id':'p2','nome':'Takeshi'},{'id':'p3','nome':'Outro'}], 'rodadas':[]}
        assert c.put('/api/state',headers=headers,json={'expected_revision':0,'data':state}).status_code==200
        yield c,headers,state
    app.state.engine.dispose()

def preview(c,h,filename,raw):
    return c.post('/api/import/preview',params={'filename':filename},headers=h,content=raw)

def apply(c,h,obj):
    return c.post('/api/import/apply',headers=h,json=obj)

def payload(p,lines=None):
    return {'expected_state_revision':p['revision'],'confirm':True,
        'lines':lines if lines is not None else [
            {'row_number':r['row_number'],'athlete_id':r['athlete_id'],'expected_revision':r['expected_revision'],'fields':r['fields']}
            for r in p['rows'] if r['status']=='pronto']}

def test_csv_previa_importacao_preserva_elenco_e_sumaulas(ctx):
    c,h,state=ctx
    assert preview(c,{},'jogadores.csv',b'nome,apelido\nJoaozinho,Joca').status_code==403
    raw='nome;apelido;numero_figurinha\nJoãozinho;Joca;23\nTakeshi;Taka;24'.encode()
    r=preview(c,h,'jogadores.csv',raw); assert r.status_code==200,r.text
    p=r.json(); assert p['summary']['ready']==2
    before=c.get('/api/state').json()
    applied=apply(c,h,payload(p)); assert applied.status_code==200,applied.text
    assert applied.json()['updated']==2
    assert c.get('/api/state').json()==before
    profiles=c.get('/api/athletes/profiles').json()['profiles']
    assert {x['athlete_id']:x['profile']['apelido'] for x in profiles}=={'p1':'Joca','p2':'Taka'}

def test_json_matching_ambiguo_manual_e_conflicto(ctx):
    c,h,state=ctx
    r=preview(c,h,'jogadores.json',json.dumps([{'nome':'desconhecido','apelido':'Test'}]).encode())
    p=r.json();assert p['rows'][0]['status']=='revisar'
    assert apply(c,h,payload(p,[])).status_code==422
    entry=payload(p,[{'row_number':2,'athlete_id':'p3','expected_revision':0,'fields':{'apelido':'Teste'}}])
    assert apply(c,h,entry).status_code==200
    assert apply(c,h,entry).status_code==409

def test_conflito_numero_reverte_lote(ctx):
    c,h,_=ctx
    p=preview(c,h,'dados.csv',b'nome,numero_figurinha\nJoaozinho,10\nTakeshi,10').json()
    r=apply(c,h,payload(p));assert r.status_code==409
    assert c.get('/api/athletes/profiles').json()['profiles']==[]

def test_xlsx_e_backup_json(ctx):
    c,h,_=ctx
    w=Workbook();w.active.append(['nome','apelido','posicao']);w.active.append(['Joãozinho','Joca','atacante'])
    out=io.BytesIO();w.save(out)
    r=preview(c,h,'atletas.xlsx',out.getvalue());assert r.status_code==200,r.text
    assert r.json()['rows'][0]['fields']['posicao']=='atacante'
    r=preview(c,h,'perfis.json',json.dumps({'profiles':[{'athlete_id':'p2','profile':{'apelido':'Takesh'}}]}).encode())
    assert r.status_code==200 and r.json()['rows'][0]['athlete_id']=='p2'

def test_arquivos_invalidos_protegidos(ctx):
    c,h,_=ctx
    assert preview(c,h,'atletas.txt',b'x').status_code==415
    assert preview(c,h,'atletas.csv',b'nome,apelido\nA,1'+b'x'*(3*1024*1024)).status_code==413
    assert preview(c,h,'atletas.json',b'{broken').status_code==422
    assert preview(c,h,'atletas.csv',b'nome,apelido\nA,J',).status_code==200
    assert preview(c,{**h,'Origin':'https://evil.invalid'},'atletas.csv',b'nome,apelido\nA,J').status_code==403

def test_revisao_estado_conflito(ctx):
    c,h,doc=ctx
    p=preview(c,h,'dados.csv',b'nome,apelido\nJoaozinho,Joca').json()
    assert c.put('/api/state',headers=h,json={'expected_revision':1,'data':doc}).status_code==200
    assert apply(c,h,payload(p)).status_code==409
    assert c.get('/api/athletes/profiles').json()['profiles']==[]
