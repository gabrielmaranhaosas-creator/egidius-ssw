import io
import json
import sqlite3
import zipfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from pypdf import PdfWriter
from egidius_api.main import create_app


@pytest.fixture
def ctx(tmp_path, monkeypatch):
    monkeypatch.setenv('EGIDIUS_LOCAL_ACCESS', 'true')
    monkeypatch.setenv('EGIDIUS_SECURE_COOKIES', 'false')
    monkeypatch.setenv('EGIDIUS_MEDIA_DIR', str(tmp_path/'media'))
    app = create_app('sqlite:///'+str(tmp_path/'teste.sqlite3'))
    with TestClient(app, base_url='http://127.0.0.1:8017', client=('127.0.0.1', 100)) as c:
        auth = c.post('/api/auth/local').json()
        h = {'X-CSRF-Token':auth['csrf']}
        data = {'versao':5,'jogadores':[{'id':'j1','nome':'José da Silva'}],
                'rodadas':[{'id':'s-antigo','data':'2026-10-24','presencas':['j1'],'equipes':[],'jogos':[]},
                           {'id':'s-novo','data':'2026-10-31','presencas':[],'equipes':[],'jogos':[]}]}
        assert c.put('/api/state',headers=h,json={'expected_revision':0,'data':data}).status_code==200
        yield c,h,tmp_path
    app.state.engine.dispose()


def preview(c,h,raw,filename='elenco.txt',**params):
    return c.post('/api/intake/preview',params={'filename':filename,**params},content=raw,headers=h)


def test_importa_elenco_sem_presencas_e_sem_alterar_viagem(ctx):
    c,h,_=ctx
    before=c.get('/api/state').json()
    viagem=c.get('/api/viagem-ssw').json()
    p=preview(c,h,'nome;posição\n  Maria   Teste ;goleiro\nJosé da Silva;atacante\nJose da Silva;lateral\nMARIA TESTE;meio'.encode(),'elenco.csv')
    assert p.status_code==200,p.text
    data=p.json()
    assert [r['status'] for r in data['rows']]==['novo','existente','novo','repetido']
    r=c.post('/api/intake/apply',headers=h,json={'expected_revision':data['revision'],'confirm':True,
             'names':[row['nome'] for row in data['rows'] if row['status']=='novo']})
    assert r.status_code==200,r.text
    assert r.json()['created']==2
    after=c.get('/api/state').json()
    assert after['revision']==before['revision']+1
    assert after['data']['rodadas']==before['data']['rodadas']
    assert after['data']['jogadores'][0]==before['data']['jogadores'][0]
    assert c.get('/api/viagem-ssw').json()==viagem


def test_tabela_colada_mapeamento_manual_e_lista(ctx):
    c,h,_=ctx
    text='Participante\tTelefone\nMaria Teste\t123\nOutro Teste\t456'.encode()
    p=preview(c,h,text)
    assert p.status_code==200
    assert p.json()['name_column'] is None
    p=preview(c,h,text,name_column='Participante').json()
    assert [r['nome'] for r in p['rows']]==['Maria Teste','Outro Teste']
    assert all(r['status']=='novo' for r in p['rows'])
    assert preview(c,h,text,name_column='coluna ausente').status_code==422
    assert len(preview(c,h,b'Maria Teste\nOutro Teste').json()['rows'])==2


def test_xlsx_json_e_modelos(ctx):
    c,h,_=ctx
    w=Workbook();w.active.append(['Nome completo']);w.active.append(['Maria Teste'])
    data=io.BytesIO();w.save(data);w.close()
    p=preview(c,h,data.getvalue(),'elenco.xlsx')
    assert p.status_code==200 and p.json()['rows'][0]['nome']=='Maria Teste'
    p=preview(c,h,json.dumps({'jogadores':[{'nome':'Maria Teste'}]}).encode(),'elenco.json')
    assert p.status_code==200
    assert c.get('/api/intake/template').content.decode('utf-8-sig').strip()=='nome'
    xlsx=c.get('/api/intake/template?format=xlsx')
    assert xlsx.status_code==200 and zipfile.is_zipfile(io.BytesIO(xlsx.content))


def test_lote_invalido_duplicado_e_concorrente_nao_grava_parcial(ctx):
    c,h,_=ctx
    before=c.get('/api/state').json()
    base={'expected_revision':before['revision'],'confirm':True}
    for names in [['Maria Teste','X'],['Maria Teste','MARIA TESTE'],['José da Silva']]:
        assert c.post('/api/intake/apply',headers=h,json={**base,'names':names}).status_code in (409,422)
        assert c.get('/api/state').json()==before
    assert c.post('/api/intake/apply',headers=h,json={**base,'confirm':False,'names':['Maria Teste']}).status_code==422
    assert c.put('/api/state',headers=h,json={'expected_revision':before['revision'],'data':before['data']}).status_code==200
    assert c.post('/api/intake/apply',headers=h,json={**base,'names':['Maria Teste']}).status_code==409


def test_limites_e_csrf_da_entrada(ctx):
    c,h,_=ctx
    assert preview(c,{},b'Maria Teste').status_code==403
    assert preview(c,h,b'A\n'*302).status_code==413
    assert preview(c,h,b'x'*(3*1024*1024+1)).status_code==413
    assert preview(c,h,b'nome,nome\nA,B','dados.csv').status_code==422
    assert preview(c,h,b'abc','dados.exe').status_code==415
    assert preview(c,h,b'{broken','dados.json').status_code==422


def pdf(pages=1, password=None):
    w=PdfWriter()
    for _ in range(pages):w.add_blank_page(width=612,height=792)
    if password:w.encrypt(password)
    out=io.BytesIO();w.write(out);w.close()
    return out.getvalue()


def upload(c,h,data,kind='document'):
    return c.post('/api/media/upload',params={'scope':'round','kind':kind,'round_id':'s-novo'},
                  headers={**h,'X-Egidius-Filename':'documento.pdf'},content=data)


def test_pdf_upload_download_persistencia_e_backup_completo(ctx):
    c,h,root=ctx
    before=c.get('/api/state').json()
    content=pdf()
    sent=upload(c,h,content)
    assert sent.status_code==201,sent.text
    item=sent.json()
    assert item['kind']=='document' and item['mime_type']=='application/pdf'
    download=c.get(item['url'])
    assert download.content==content
    assert 'attachment' in download.headers['content-disposition']
    assert c.get('/api/media',params={'scope':'round','round_id':'s-novo'}).json()['items'][0]['id']==item['id']
    archive=c.get('/api/backup/download')
    assert archive.status_code==200,archive.text
    with zipfile.ZipFile(io.BytesIO(archive.content)) as z:
        assert z.testzip() is None
        copied=sqlite3.connect(':memory:')
        copied.deserialize(z.read('dados/egidius.sqlite3'))
        assert copied.execute('pragma integrity_check').fetchone()[0]=='ok'
        name=copied.execute('select stored_name from media_assets where id=?',(item['id'],)).fetchone()[0]
        assert z.read('media/'+name)==content
        assert json.loads(copied.execute('select payload from state').fetchone()[0])==before['data']
        copied.close()
    assert c.get('/api/state').json()==before


def test_pdf_invalido_encriptado_limite_e_destino(ctx):
    c,h,root=ctx
    assert upload(c,h,b'%PDF-1.7\ninvalid').status_code==422
    assert upload(c,h,pdf(password='teste')).status_code==422
    assert upload(c,h,pdf(pages=301)).status_code==422
    assert upload(c,h,pdf(),kind='photo').status_code==415
    assert upload(c,{},pdf()).status_code==403
    assert c.post('/api/media/upload',params={'scope':'athlete','kind':'document','athlete_id':'j1'},headers=h,content=pdf()).status_code==422
    assert list((root/'media').glob('*'))==[]


def test_backup_incompleto_recusado_e_download_exige_sessao(ctx):
    c,h,root=ctx
    item=upload(c,h,pdf()).json()
    for path in (root/'media').iterdir():path.unlink()
    assert c.get('/api/backup/download').status_code==409
    c.cookies.clear()
    assert c.get('/api/backup/download').status_code==401
