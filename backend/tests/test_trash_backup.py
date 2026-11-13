from test_media import ctx,upload,MP4
from egidius_api.portability import unpack_backup,restore_empty
from egidius_api.storage import LocalStorage
from egidius_api.db import engine_for_url
from egidius_api.main import create_app
from fastapi.testclient import TestClient

def test_backup_restaura_arquivo_da_lixeira_e_mantem_recuperacao(ctx,monkeypatch):
    c,h,tmp,url,app=ctx
    item=upload(c,h,data=MP4,params={'scope':'round','kind':'video','round_id':'r1'}).json()
    assert c.delete('/api/media/'+item['id'],headers=h).status_code==200
    backup=c.get('/api/backup/download');assert backup.status_code==200
    archive=tmp/'backup-lixeira.zip';archive.write_bytes(backup.content)
    target=tmp/'restaurado.sqlite3';media=tmp/'midia-restaurada';engine=engine_for_url('sqlite:///'+str(target))
    try:
        with unpack_backup(archive) as (db,files):
            report=restore_empty(db,engine,LocalStorage(media),files)
            assert report['counts']['media_trash']==1
        monkeypatch.setenv('EGIDIUS_MEDIA_DIR',str(media))
        restored=create_app('sqlite:///'+str(target))
        with TestClient(restored) as r:
            login=r.post('/api/auth/login',json={'username':'admin','password':'senha_mais_que_segura_123'});headers={'X-CSRF-Token':login.json()['csrf']}
            assert r.get(item['url']).status_code==404
            assert r.get('/api/media/trash').json()['items'][0]['id']==item['id']
            assert r.post('/api/media/'+item['id']+'/restore',headers=headers).status_code==200
            assert r.get(item['url']).content==MP4
        restored.state.engine.dispose()
    finally:engine.dispose()
