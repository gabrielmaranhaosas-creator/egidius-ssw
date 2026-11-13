"""Mídia privada do EGIDIUS: upload em streaming, metadados no SQL e arquivos fora do Git."""
from __future__ import annotations

import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session as DbSession

from .db import MediaAsset, State, PendingMediaDeletion, MediaTrash, utcnow
from .storage import get_storage, reserve_quota, cleanup_deletions

MEDIA_ROOT = Path(__file__).resolve().parents[1] / 'var' / 'media'
IMAGE_LIMIT = 12 * 1024 * 1024
VIDEO_LIMIT = 100 * 1024 * 1024
DOCUMENT_LIMIT = 20 * 1024 * 1024
STORAGE_QUOTA = 2 * 1024 * 1024 * 1024


def root_dir() -> Path:
    path = Path(os.environ.get('EGIDIUS_MEDIA_DIR') or MEDIA_ROOT).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass
    return path


def sniff_mime(first: bytes) -> tuple[str, str] | None:
    if first.startswith(b'%PDF-'):
        return 'application/pdf', '.pdf'
    if first.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg', '.jpg'
    if first.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png', '.png'
    if first.startswith(b'RIFF') and first[8:12] == b'WEBP':
        return 'image/webp', '.webp'
    if len(first) >= 12 and first[4:8] == b'ftyp':
        brand = first[8:12]
        if brand in (b'qt  ',):
            return 'video/quicktime', '.mov'
        if brand in (b'isom', b'iso2', b'mp41', b'mp42', b'avc1', b'M4V ', b'iso5', b'iso6') or brand.startswith(b'msf'):
            return 'video/mp4', '.mp4'
    if first.startswith(b'\x1a\x45\xdf\xa3'):
        return 'video/webm', '.webm'
    return None


def serialize(row: MediaAsset) -> dict:
    return {
        'id': row.id, 'scope': row.scope, 'kind': row.kind, 'athlete_id': row.athlete_id,
        'round_id': row.round_id, 'match_id': row.match_id, 'caption': row.caption,
        'filename': row.original_name, 'mime_type': row.mime_type, 'size': row.size,
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'url': f'/api/media/{row.id}/content',
    }


def newest_portraits(db: DbSession, athlete_id: str) -> dict:
    recent = db.scalars(select(MediaAsset).where(
        MediaAsset.scope == 'athlete', MediaAsset.athlete_id == athlete_id,
        MediaAsset.kind.in_(['photo', 'caricature']), ~MediaAsset.id.in_(select(MediaTrash.media_id))
    ).order_by(desc(MediaAsset.created_at), desc(MediaAsset.id))).all()
    latest: dict[str, str | None] = {'fotoMediaId': None, 'caricaturaMediaId': None}
    for row in recent:
        key = 'fotoMediaId' if row.kind == 'photo' else 'caricaturaMediaId'
        if latest[key] is None:
            latest[key] = row.id
    return latest


class CaptionEdit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    caption: str = Field(max_length=250)


def media_router(session_auth, check_csrf, get_db):
    router = APIRouter(prefix='/api/media', tags=['media'])

    def validate_target(db: DbSession, scope: str, kind: str, athlete_id: str | None,
                        round_id: str | None, match_id: str | None):
        data = json.loads(db.get(State, 1).payload)
        if scope == 'athlete':
            if kind not in ('photo', 'caricature') or not athlete_id or round_id or match_id:
                raise HTTPException(422, 'Selecione um atleta e o tipo foto/caricatura.')
            if not any(a['id'] == athlete_id for a in data['jogadores']):
                raise HTTPException(404, 'Atleta inexistente.')
        elif scope == 'round':
            if kind not in ('photo', 'video', 'document') or not round_id or athlete_id:
                raise HTTPException(422, 'Selecione o sábado e o tipo de arquivo.')
            rodada = next((r for r in data['rodadas'] if r['id'] == round_id), None)
            if not rodada:
                raise HTTPException(404, 'Rodada inexistente.')
            if match_id and not any(j['id'] == match_id for j in rodada['jogos']):
                raise HTTPException(404, 'A partida não pertence à rodada selecionada.')
        else:
            raise HTTPException(422, 'Categoria inválida.')

    @router.get('')
    def list_media(scope: Literal['all', 'athlete', 'round'] = 'all',
                   athlete_id: str | None = Query(None, max_length=140),
                   round_id: str | None = Query(None, max_length=140),
                   match_id: str | None = Query(None, max_length=140),
                   _session=Depends(session_auth), db: DbSession = Depends(get_db)):
        query = select(MediaAsset).where(~MediaAsset.id.in_(select(MediaTrash.media_id)))
        if scope == 'athlete':
            if not athlete_id:
                raise HTTPException(422, 'Informe o atleta.')
            query = query.where(MediaAsset.scope == 'athlete', MediaAsset.athlete_id == athlete_id)
        elif scope == 'round':
            if not round_id:
                raise HTTPException(422, 'Informe a rodada.')
            query = query.where(MediaAsset.scope == 'round', MediaAsset.round_id == round_id)
            if match_id:
                query = query.where(MediaAsset.match_id == match_id)
        query = query.order_by(desc(MediaAsset.created_at), desc(MediaAsset.id)).limit(300)
        items = db.scalars(query).all()
        return JSONResponse({'items': [serialize(r) for r in items], 'limit': 300}, headers={'Cache-Control': 'no-store'})

    @router.post('/upload', status_code=201)
    async def upload(request: Request,
                     scope: Literal['athlete', 'round'],
                     kind: Literal['photo', 'caricature', 'video', 'document'],
                     athlete_id: str | None = Query(None, max_length=140),
                     round_id: str | None = Query(None, max_length=140),
                     match_id: str | None = Query(None, max_length=140),
                     caption: str = Query('', max_length=250),
                     _session=Depends(check_csrf), db: DbSession = Depends(get_db)):
        validate_target(db, scope, kind, athlete_id, round_id, match_id)
        limit = VIDEO_LIMIT if kind == 'video' else DOCUMENT_LIMIT if kind == 'document' else IMAGE_LIMIT
        length = request.headers.get('content-length')
        if length is not None:
            try:
                if int(length) > limit: raise HTTPException(413, 'Arquivo acima do limite permitido.')
            except ValueError:
                raise HTTPException(400, 'Tamanho inválido.')
        source_name = unquote(request.headers.get('x-egidius-filename', 'arquivo'))
        source_name = source_name.replace('\\', '/').split('/')[-1]
        source_name = ''.join(c for c in source_name if c.isprintable())[:120] or 'arquivo'
        target_dir = root_dir()
        # Guarda os arquivos com nomes independentes dos nomes enviados pelo usuário.
        tmp_path = target_dir / f'.{uuid.uuid4().hex}.upload'
        total, first = 0, bytearray()
        try:
            with tmp_path.open('xb') as output:
                os.chmod(tmp_path, 0o600)
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > limit:
                        raise HTTPException(413, 'Arquivo excede o limite. Envie arquivo menor.')
                    if len(first) < 64:
                        first.extend(chunk[:64 - len(first)])
                    output.write(chunk)
            if total == 0:
                raise HTTPException(422, 'Arquivo vazio.')
            detected = sniff_mime(bytes(first))
            if not detected:
                raise HTTPException(415, 'Formato incompatível. Use JPG, PNG, WebP, MP4, MOV, WebM ou PDF.')
            mime, extension = detected
            if (kind == 'video') != mime.startswith('video/') or (kind == 'document') != (mime == 'application/pdf'):
                raise HTTPException(415, 'Tipo de arquivo não corresponde à categoria escolhida.')
            if kind == 'document':
                try:
                    from pypdf import PdfReader
                    with tmp_path.open('rb') as document:
                        pdf = PdfReader(document, strict=True)
                        if pdf.is_encrypted:
                            raise HTTPException(422, 'Envie uma cópia do PDF sem senha.')
                        if not 1 <= len(pdf.pages) <= 300:
                            raise HTTPException(422, 'Envie um PDF com 1 a 300 páginas.')
                except HTTPException:
                    raise
                except Exception:
                    raise HTTPException(422, 'O arquivo não é um PDF válido ou está danificado.')
            reserve_quota(db, total, STORAGE_QUOTA)
            identifier = uuid.uuid4().hex
            stored_name = identifier + extension
            storage = get_storage()
            storage.put_file(stored_name, tmp_path, mime)
            db.add(MediaAsset(id=identifier, scope=scope, kind=kind, athlete_id=athlete_id,
                              round_id=round_id, match_id=match_id, caption=caption.strip(),
                              original_name=source_name, stored_name=stored_name, mime_type=mime,
                              size=total, actor=_session.username, created_at=utcnow()))
            try:
                db.commit()
            except Exception:
                db.rollback()
                try: storage.remove(stored_name)
                except Exception: pass
                raise
            item = db.get(MediaAsset, identifier)
            return JSONResponse(serialize(item), status_code=201, headers={'Cache-Control': 'no-store'})
        finally:
            tmp_path.unlink(missing_ok=True)

    @router.get('/{media_id}/content')
    def content(media_id: str, _session=Depends(session_auth), db: DbSession = Depends(get_db)):
        row = db.get(MediaAsset, media_id)
        if not row:
            raise HTTPException(404, 'Arquivo não encontrado.')
        if db.get(MediaTrash, media_id):raise HTTPException(404, 'Arquivo na lixeira. Restaure antes de abrir.')
        storage = get_storage()
        if storage.remote:
            return RedirectResponse(storage.signed_url(row.stored_name, row.mime_type, row.original_name,
                                     document=row.kind == 'document'), status_code=307,
                                    headers={'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer'})
        path = root_dir() / row.stored_name
        if path.name != row.stored_name or not path.is_file():
            raise HTTPException(404, 'Arquivo indisponível no servidor.')
        return FileResponse(path, media_type=row.mime_type, content_disposition_type='attachment' if row.kind == 'document' else 'inline',
                            filename=row.original_name, headers={
                                'Cache-Control': 'private, no-store',
                                'X-Content-Type-Options': 'nosniff',
                            })

    @router.patch('/{media_id}')
    async def change_caption(media_id: str, request: Request,
                             _session=Depends(check_csrf), db: DbSession = Depends(get_db)):
        row = db.get(MediaAsset, media_id)
        if not row: raise HTTPException(404, 'Arquivo não encontrado.')
        try:
            body = CaptionEdit.model_validate(await request.json())
        except Exception:
            raise HTTPException(422, 'Legenda inválida.')
        row.caption = body.caption.strip()
        db.commit()
        return serialize(row)

    @router.get('/trash')
    def list_trash(_session=Depends(session_auth),db:DbSession=Depends(get_db)):
        rows=db.execute(select(MediaAsset,MediaTrash).join(MediaTrash,MediaTrash.media_id==MediaAsset.id).order_by(MediaTrash.deleted_at.desc()).limit(300)).all()
        return {'items':[{**serialize(row),'deleted_at':trash.deleted_at.isoformat(),'deleted_by':trash.actor} for row,trash in rows]}

    @router.post('/{media_id}/restore')
    def restore_media(media_id:str,_session=Depends(check_csrf),db:DbSession=Depends(get_db)):
        row=db.get(MediaAsset,media_id);trash=db.get(MediaTrash,media_id)
        if not row or not trash:raise HTTPException(404,'Arquivo não está na lixeira.')
        validate_target(db,row.scope,row.kind,row.athlete_id,row.round_id,row.match_id)
        db.delete(trash);db.commit()
        return serialize(row)

    @router.delete('/{media_id}/purge')
    def purge_media(media_id:str,_session=Depends(check_csrf),db:DbSession=Depends(get_db)):
        from .permissions import require_admin
        require_admin(db,_session.username)
        row=db.get(MediaAsset,media_id);trash=db.get(MediaTrash,media_id)
        if not row or not trash:raise HTTPException(409,'Envie o arquivo à lixeira antes de excluir definitivamente.')
        db.add(PendingMediaDeletion(stored_name=row.stored_name,size=row.size))
        db.delete(trash);db.flush();db.delete(row);db.commit();cleanup_deletions(db);db.commit()
        return {'ok':True}

    @router.delete('/{media_id}')
    def delete_media(media_id: str, _session=Depends(check_csrf), db: DbSession = Depends(get_db)):
        row=db.get(MediaAsset,media_id)
        if not row:raise HTTPException(404,'Arquivo não encontrado.')
        if not db.get(MediaTrash,media_id):db.add(MediaTrash(media_id=media_id,actor=_session.username))
        db.commit()
        return {'ok':True,'recoverable':True}

    return router
