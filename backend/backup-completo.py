"""Backup offline dos dados + mídia do EGIDIUS. Execute com API parada."""
from __future__ import annotations
import os
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from egidius_api.db import DEFAULT_DB
from egidius_api.media import root_dir


def run():
    repo = Path(__file__).resolve().parent
    url = os.environ.get('EGIDIUS_DATABASE_URL', '')
    if url and not url.startswith('sqlite:///'):
        raise SystemExit('Banco remoto configurado: use a rotina de backup do seu provedor.')
    database = Path(url[len('sqlite:///'):]) if url else DEFAULT_DB
    if not database.exists():
        raise SystemExit(f'Banco de dados não encontrado: {database}')
    media = root_dir()
    backups = repo / 'backups'
    backups.mkdir(exist_ok=True, parents=True, mode=0o700)
    tag = datetime.now().strftime('%Y%m%d-%H%M%S')
    zip_path = backups / f'EGIDIUS-BACKUP-COMPLETO-{tag}.zip'
    if zip_path.exists():
        raise SystemExit('Nome do backup já existe, aguarde 1 segundo e tente novamente.')
    with tempfile.TemporaryDirectory() as tmp:
        tempdb = Path(tmp) / 'egidius.sqlite3'
        with sqlite3.connect(str(database)) as src, sqlite3.connect(str(tempdb)) as dst:
            src.backup(dst)
        with zipfile.ZipFile(zip_path, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=4) as bundle:
            bundle.write(tempdb, 'dados/egidius.sqlite3')
            for p in sorted(media.iterdir()):
                if p.is_file() and not p.name.startswith('.'):
                    bundle.write(p, f'media/{p.name}')
    zip_path.chmod(0o600)
    print(f'Backup completo criado: {zip_path}')
    print('IMPORTANTE: faça cópia externa do ZIP em local privado. Não envie para Git.')

if __name__ == '__main__': run()
