"""Confere um backup completo. Para restaurar offline, acrescente --aplicar."""
import argparse
import os
from datetime import datetime
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from egidius_api.backup_format import validar_banco
import zipfile


def restaurar(project, archive, aplicar=False):
    os.umask(0o077)
    project=project.expanduser().resolve()
    var=project/'backend/var'
    if var.is_symlink() or not var.resolve().is_relative_to(project):
        raise RuntimeError('A pasta de dados deve estar dentro do projeto.')
    with tempfile.TemporaryDirectory(prefix='egidius-conferir-') as temporary:
        stage=Path(temporary)
        with zipfile.ZipFile(archive) as bundle:
            infos=bundle.infolist()
            if len(infos)>10000 or sum(i.file_size for i in infos)>3*1024**3:
                raise RuntimeError('Backup acima do limite de 3 GB ou 10.000 arquivos.')
            if len({i.filename for i in infos})!=len(infos):
                raise RuntimeError('Há entradas duplicadas no ZIP.')
            with bundle.open('dados/egidius.sqlite3') as src, (stage/'db.sqlite3').open('xb') as dst:
                shutil.copyfileobj(src,dst)
            files=validar_banco(stage/'db.sqlite3')
            (stage/'media').mkdir()
            for name,size in files:
                if Path(name).name!=name or name in ('.','..'):
                    raise RuntimeError('Nome de mídia inválido no banco.')
                info=bundle.getinfo('media/'+name)
                if info.file_size!=size:raise RuntimeError('Tamanho de mídia divergente: '+name)
                with bundle.open(info) as src,(stage/'media'/name).open('xb') as dst:shutil.copyfileobj(src,dst)
        print('Backup conferido: SQLite íntegro e %s arquivo(s) de mídia.' % len(files))
        if not aplicar:
            print('Somente conferência. Para restaurar, pare o EGIDIUS e acrescente --aplicar.')
            return
        if not shutil.which('lsof'):raise RuntimeError('lsof é necessário para conferir os serviços antes de restaurar.')
        for port in (8017,5173,8080,5174):
            result=subprocess.run(['lsof','-nP',f'-iTCP:{port}','-sTCP:LISTEN'],stdout=subprocess.DEVNULL)
            if result.returncode!=1:raise RuntimeError('Pare os serviços do EGIDIUS antes de restaurar; porta '+str(port))
        target=var/'egidius.sqlite3'
        media=var/'media'
        for path in (target,media):
            if path.is_symlink():raise RuntimeError('Não é permitido restaurar sobre links simbólicos.')
        if not target.is_file():raise RuntimeError('O banco atual não foi encontrado. Confira o projeto informado.')
        backup=project/'.egidius-backups'/('antes-restauracao-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        if not backup.resolve().is_relative_to(project):raise RuntimeError('Destino de backup fora do projeto.')
        backup.mkdir(parents=True,mode=0o700)
        incoming=var/('restauracao-'+datetime.now().strftime('%H%M%S%f'))
        incoming.mkdir(mode=0o700)
        shutil.copyfile(stage/'db.sqlite3',incoming/'egidius.sqlite3')
        (incoming/'egidius.sqlite3').chmod(0o600)
        shutil.copytree(stage/'media',incoming/'media')
        moved=[]
        installed=[]
        try:
            for path in (target,Path(str(target)+'-wal'),Path(str(target)+'-shm'),media):
                if path.exists():
                    path.rename(backup/path.name)
                    moved.append(path)
            for path in (target,media):
                (incoming/path.name).rename(path)
                installed.append(path)
        except (Exception,KeyboardInterrupt):
            for path in reversed(installed):
                if path.is_dir():shutil.rmtree(path)
                else:path.unlink(missing_ok=True)
            for path in reversed(moved):(backup/path.name).rename(path)
            raise
        finally:shutil.rmtree(incoming,ignore_errors=True)
        print('Restauração concluída. A cópia anterior foi preservada em: '+str(backup))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup',type=Path)
    parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--aplicar',action='store_true')
    args=parser.parse_args()
    try:restaurar(args.project,args.backup,args.aplicar)
    except Exception as error:raise SystemExit('INTERROMPIDO: '+str(error))
