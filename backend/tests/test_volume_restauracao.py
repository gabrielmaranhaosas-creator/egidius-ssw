import base64
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import zipfile
import pytest
from egidius_api.bootstrap import preparar_volume
from egidius_api.db import session_factory
from egidius_api.viagem_ssw import ViagemState


def database(path, revision=10):
    factory,engine=session_factory('sqlite:///'+str(path))
    with sqlite3.connect(path) as db:
        db.execute('UPDATE state SET revision=? WHERE id=1',(revision,))
    engine.dispose()
    return path.read_bytes()


def configure(monkeypatch,tmp_path,raw):
    volume=tmp_path/'volume';volume.mkdir()
    monkeypatch.setenv('EGIDIUS_REQUIRE_PERSISTENCE','true')
    monkeypatch.setenv('EGIDIUS_DATA_VOLUME',str(volume))
    monkeypatch.setenv('EGIDIUS_DATABASE_URL','sqlite:///'+str(volume/'egidius.sqlite3'))
    monkeypatch.setenv('EGIDIUS_MEDIA_DIR',str(volume/'media'))
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_B64',base64.b64encode(gzip.compress(raw)).decode())
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_SHA256',hashlib.sha256(raw).hexdigest())
    return volume/'egidius.sqlite3'


def test_primeira_carga_preserva_bytes_e_redeploy_nao_sobrescreve(tmp_path,monkeypatch):
    raw=database(tmp_path/'origem.sqlite3')
    target=configure(monkeypatch,tmp_path,raw)
    preparar_volume()
    assert target.read_bytes()==raw
    assert target.stat().st_mode & 0o777==0o600
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_B64','inválido')
    preparar_volume()
    assert target.read_bytes()==raw


def test_volume_sem_carga_e_hash_invalido_nao_criam_base_vazia(tmp_path,monkeypatch):
    raw=database(tmp_path/'origem.sqlite3')
    target=configure(monkeypatch,tmp_path,raw)
    monkeypatch.setenv('EGIDIUS_INITIAL_DATABASE_SHA256','x'*64)
    with pytest.raises(RuntimeError):preparar_volume()
    assert not target.exists()
    monkeypatch.delenv('EGIDIUS_INITIAL_DATABASE_B64')
    with pytest.raises(RuntimeError):preparar_volume()
    assert not target.exists()


def test_volume_fora_da_pasta_e_sqlite_incompativel_recusados(tmp_path,monkeypatch):
    target=configure(monkeypatch,tmp_path,b'arquivo invalido')
    with pytest.raises((RuntimeError,sqlite3.Error,ValueError)):preparar_volume()
    assert not target.exists()
    monkeypatch.setenv('EGIDIUS_DATABASE_URL','sqlite:///'+str(tmp_path/'fora.sqlite3'))
    with pytest.raises(RuntimeError):preparar_volume()
    assert not (tmp_path/'fora.sqlite3').exists()


def test_restauracao_offline_e_copia_anterior_preservada(tmp_path,monkeypatch):
    root=Path(__file__).resolve().parents[2]
    spec=importlib.util.spec_from_file_location('restaurar',root/'tools/restaurar_backup.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    project=tmp_path/'Projeto com espaços';var=project/'backend/var';var.mkdir(parents=True)
    current=database(var/'egidius.sqlite3',revision=10)
    incoming=database(tmp_path/'novo.sqlite3',revision=20)
    archive=tmp_path/'backup.zip'
    with zipfile.ZipFile(archive,'w') as z:z.writestr('dados/egidius.sqlite3',incoming)
    module.restaurar(project,archive)
    assert (var/'egidius.sqlite3').read_bytes()==current
    class Free:
        returncode=1
    monkeypatch.setattr(module.shutil,'which',lambda name:'/teste/lsof')
    monkeypatch.setattr(module.subprocess,'run',lambda *a,**k:Free())
    module.restaurar(project,archive,True)
    assert (var/'egidius.sqlite3').read_bytes()==incoming
    preserved=list((project/'.egidius-backups').glob('*/egidius.sqlite3'))
    assert len(preserved)==1 and preserved[0].read_bytes()==current


def test_backup_com_midia_ausente_recusado_antes_de_mudar_dados(tmp_path):
    root=Path(__file__).resolve().parents[2]
    spec=importlib.util.spec_from_file_location('restaurar',root/'tools/restaurar_backup.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    project=tmp_path/'Projeto';var=project/'backend/var';var.mkdir(parents=True)
    current=database(var/'egidius.sqlite3')
    source=tmp_path/'midia.sqlite3';database(source)
    with sqlite3.connect(source) as db:
        db.execute("INSERT INTO media_assets(id,scope,kind,round_id,caption,original_name,stored_name,mime_type,size,actor,created_at) VALUES('m','round','document','r','','a.pdf','a.pdf','application/pdf',10,'teste','2026-10-28')")
    archive=tmp_path/'backup.zip'
    with zipfile.ZipFile(archive,'w') as z:z.write(source,'dados/egidius.sqlite3')
    with pytest.raises(KeyError):module.restaurar(project,archive,True)
    assert (var/'egidius.sqlite3').read_bytes()==current


def test_coleta_para_publicacao_preserva_origem_e_gera_zip_integro(tmp_path):
    root=Path(__file__).resolve().parents[2]
    spec=importlib.util.spec_from_file_location('coletar',root/'tools/coletar_para_publicacao.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    project=tmp_path/'Projeto';var=project/'backend/var';var.mkdir(parents=True)
    source=database(var/'egidius.sqlite3',revision=31)
    target=tmp_path/'dados-para-publicar.zip'
    module.coletar(project,target)
    assert (var/'egidius.sqlite3').read_bytes()==source
    assert target.stat().st_mode & 0o777==0o600
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        db=sqlite3.connect(':memory:');db.deserialize(z.read('dados/egidius.sqlite3'))
        assert db.execute('select revision from state where id=1').fetchone()[0]==31
        db.close()
