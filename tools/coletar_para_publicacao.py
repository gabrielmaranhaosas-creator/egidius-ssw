"""Preserva os dados atuais do Mac para a primeira publicação, sem alterar a base."""
import argparse
from datetime import datetime
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from egidius_api.backup_format import validar_banco


def coletar(project, destination):
    os.umask(0o077)
    project=project.expanduser().resolve()
    database=project/'backend/var/egidius.sqlite3'
    media=project/'backend/var/media'
    if not database.is_file():raise RuntimeError('Banco não encontrado em: '+str(database))
    destination=destination.expanduser().resolve()
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.touch(mode=0o600,exist_ok=False)
    try:
        with tempfile.TemporaryDirectory(prefix='egidius-coleta-') as temporary:
            snapshot=Path(temporary)/'egidius.sqlite3'
            src=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True)
            dst=sqlite3.connect(snapshot)
            try:src.backup(dst)
            finally:dst.close();src.close()
            files=validar_banco(snapshot)
            with zipfile.ZipFile(destination,'w',zipfile.ZIP_STORED) as bundle:
                bundle.write(snapshot,'dados/egidius.sqlite3',compress_type=zipfile.ZIP_DEFLATED)
                for name,size in files:
                    path=media/name
                    if Path(name).name!=name or path.is_symlink() or not path.is_file() or path.stat().st_size!=size:
                        raise RuntimeError('Um arquivo mudou durante a coleta. Tente novamente antes de publicar.')
                    bundle.write(path,'media/'+name)
                bundle.writestr('LEIA-ME.txt','Cópia privada dos dados do EGIDIUS para transferência de hospedagem.\n'
                                'Contém contas e arquivos do SSW. Não publique em repositório Git.\n')
            with zipfile.ZipFile(destination) as bundle:
                if bundle.testzip() is not None:raise RuntimeError('A cópia não passou na verificação.')
        print('DADOS PRESERVADOS. Nenhum registro foi alterado.')
        print('Arquivo para enviar nesta conversa: '+str(destination))
    except Exception:
        destination.unlink(missing_ok=True)
        raise


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project',type=Path,default=Path.home()/'Downloads/EGIDIUS-2')
    parser.add_argument('--destino',type=Path,default=Path.home()/'Downloads'/('EGIDIUS_DADOS_PARA_PUBLICAR_'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.zip'))
    args=parser.parse_args()
    try:coletar(args.project,args.destino)
    except Exception as error:raise SystemExit('INTERROMPIDO: '+str(error))
