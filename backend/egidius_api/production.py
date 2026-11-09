"""EGIDIUS produção: uma origem HTTP para React compilado e toda a API.
Usar apenas atrás de um terminador HTTPS (Render ou proxy equivalente).
"""
import os
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse
from .bootstrap import preparar_volume
preparar_volume()
from .main import app

DIST = Path(os.environ.get('EGIDIUS_STATIC_DIR', '/app/dist')).resolve()

@app.get('/{path:path}', include_in_schema=False)
def serve_spa(path: str):
    if path == 'api' or path.startswith('api/') or not DIST.is_dir():
        raise HTTPException(404)
    requested = (DIST / path).resolve()
    if requested != DIST and DIST not in requested.parents:
        raise HTTPException(404)
    if requested.is_file():
        return FileResponse(requested)
    response = FileResponse(DIST / 'index.html')
    response.headers['Cache-Control'] = 'no-store'
    return response
