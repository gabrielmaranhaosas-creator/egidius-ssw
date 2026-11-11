"""Download de backup completo: SQLite consistente e mídia referenciada nessa cópia."""
from contextlib import closing
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import zipfile
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from .media import root_dir
from .storage import get_storage
from .portability import sqlite_snapshot


def exports_router(session_auth, get_db):
    router = APIRouter(prefix='/api/backup', tags=['backup'])

    @router.get('/download')
    def download(_=Depends(session_auth), db=Depends(get_db)):
        folder = Path(tempfile.mkdtemp(prefix='egidius-backup-'))
        try:
            os.chmod(folder, 0o700)
            snapshot = folder/'egidius.sqlite3'
            sqlite_snapshot(db.get_bind(), snapshot)
            with closing(sqlite3.connect(snapshot)) as copied:
                if copied.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise HTTPException(409, 'Não foi possível confirmar a integridade do backup.')
                files = copied.execute('SELECT stored_name,size FROM media_assets').fetchall()
            storage = get_storage()
            archive = folder/'EGIDIUS_BACKUP_COMPLETO.zip'
            with zipfile.ZipFile(archive, 'x', zipfile.ZIP_STORED) as bundle:
                bundle.write(snapshot, 'dados/egidius.sqlite3')
                for name, size in files:
                    path = folder / ('midia-' + name)
                    storage.download(name, path, size)
                    bundle.write(path, 'media/'+name)
                    path.unlink()
                bundle.writestr('LEIA-ME.txt', 'Backup privado do EGIDIUS. Contém dados, contas e arquivos do SSW.\n'
                                'Guarde fora do Mac, em local privado. Não publique este ZIP.\n'
                                'Para restaurar, pare o EGIDIUS e use o procedimento do GUIA_SSW.md.\n'
                                'O JSON de registros não substitui este backup completo.\n')
            archive.chmod(0o600)
            snapshot.unlink()
            return FileResponse(archive, media_type='application/zip',
                                filename='EGIDIUS_BACKUP_COMPLETO_'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.zip',
                                headers={'Cache-Control':'private, no-store'},
                                background=BackgroundTask(shutil.rmtree, folder, ignore_errors=True))
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise

    return router
