"""Importação em lote de retratos, em duas fases e sem modificar o elenco."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import secrets
import shutil
import unicodedata
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db import AthleteProfile, MediaAsset, State, utcnow
from .media import IMAGE_LIMIT, STORAGE_QUOTA, root_dir, sniff_mime
from .storage import get_storage, reserve_quota

ZIP_MAX = 80 * 1024 * 1024
EXPANDED_MAX = 180 * 1024 * 1024
MAX_FILES = 60
STAGE_TTL = timedelta(minutes=45)
VALID_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
TOKEN_RE = re.compile(r'^[0-9a-f]{40}$')
ITEM_RE = re.compile(r'^[0-9a-f]{32}$')


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', '', s.casefold())


def suggested_kind(stem: str) -> str:
    return 'caricature' if re.search(r'(?i)(caricatura|caricature|cartoon|charge)', stem) else 'photo'


def athlete_key(stem: str) -> str:
    cleaned = re.sub(r'(?i)(?:^|[\s_.-])(foto|photo|imagem|retrato|avatar|caricatura|caricature|cartoon|charge)(?=$|[\s_.-])', ' ', stem)
    return norm(cleaned)


def stage_root() -> Path:
    folder = root_dir() / '.import-staging'
    folder.mkdir(mode=0o700, exist_ok=True)
    return folder


def prune_stages() -> None:
    now = datetime.now(timezone.utc).timestamp()
    for p in stage_root().iterdir():
        if p.is_dir() and TOKEN_RE.fullmatch(p.name) and now - p.stat().st_mtime > STAGE_TTL.total_seconds():
            shutil.rmtree(p, ignore_errors=True)


def stage(token: str) -> Path:
    if not TOKEN_RE.fullmatch(token):
        raise HTTPException(404, 'Prévia inexistente.')
    p = stage_root() / token
    if not p.is_dir():
        raise HTTPException(404, 'Prévia expirada ou inexistente. Reenvie o ZIP.')
    if datetime.now(timezone.utc).timestamp() - p.stat().st_mtime > STAGE_TTL.total_seconds():
        shutil.rmtree(p, ignore_errors=True)
        raise HTTPException(410, 'Prévia expirada. Envie o ZIP novamente.')
    return p


def manifest_for(token: str, username: str) -> tuple[Path, dict]:
    p = stage(token)
    try:
        meta = json.loads((p / 'manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise HTTPException(404, 'Prévia não disponível.')
    if meta.get('username') != username:
        raise HTTPException(403, 'Prévia pertencente a outra sessão de usuário.')
    return p, meta


def roster(db: DbSession) -> tuple[State, dict[str, str], dict[str, list[str]]]:
    state = db.get(State, 1)
    athletes = json.loads(state.payload).get('jogadores', [])
    names = {a['id']: a['nome'] for a in athletes}
    keys: dict[str, set[str]] = {}
    for aid, name in names.items():
        keys.setdefault(norm(name), set()).add(aid)
    for profile in db.scalars(select(AthleteProfile)).all():
        if profile.athlete_id not in names:
            continue
        p = json.loads(profile.payload)
        for prop in ('apelido', 'nomeExibicao'):
            if p.get(prop):
                keys.setdefault(norm(p[prop]), set()).add(profile.athlete_id)
    return state, names, {key: sorted(aids) for key, aids in keys.items()}


class Selection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    item_id: str = Field(pattern=r'^[0-9a-f]{32}$')
    athlete_id: str = Field(min_length=1, max_length=140)
    kind: Literal['photo', 'caricature']


class Confirm(BaseModel):
    model_config = ConfigDict(extra='forbid')
    batch_id: str = Field(pattern=r'^[0-9a-f]{40}$')
    confirm: bool
    expected_state_revision: int = Field(ge=0)
    items: list[Selection] = Field(min_length=1, max_length=MAX_FILES)


def bulk_media_router(session_auth, check_csrf, get_db):
    router = APIRouter(prefix='/api/import-media', tags=['import-media'])

    @router.post('/preview')
    async def preview(request: Request, filename: str = Query(..., max_length=160),
                      sess=Depends(check_csrf), db: DbSession = Depends(get_db)):
        if Path(filename).suffix.casefold() != '.zip':
            raise HTTPException(415, 'Selecione um arquivo ZIP de imagens.')
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > ZIP_MAX:
                raise HTTPException(413, 'ZIP maior que 80 MB. Divida em lotes menores.')
        if not body:
            raise HTTPException(422, 'Arquivo ZIP vazio.')
        try:
            package = zipfile.ZipFile(io.BytesIO(body))
        except (ValueError, zipfile.BadZipFile):
            raise HTTPException(422, 'ZIP inválido ou danificado.')
        with package:
            entries = [e for e in package.infolist() if not e.is_dir() and not e.filename.startswith('__MACOSX/') and not Path(e.filename).name.startswith('.')]
            if not entries or len(entries) > MAX_FILES:
                raise HTTPException(422, f'O ZIP deve conter entre 1 e {MAX_FILES} imagens.')
            if sum(e.file_size for e in entries) > EXPANDED_MAX:
                raise HTTPException(413, 'ZIP expande para mais de 180 MB.')
            if any(e.flag_bits & 1 for e in entries):
                raise HTTPException(422, 'ZIP protegido por senha não é aceito.')
            if any(e.filename.startswith('/') or '\\' in e.filename or '..' in Path(e.filename).parts for e in entries):
                raise HTTPException(422, 'O ZIP contém caminhos não permitidos.')
            if any((e.external_attr >> 16) & 0o170000 == 0o120000 for e in entries):
                raise HTTPException(422, 'O ZIP contém links simbólicos, não permitidos.')
            if any(e.file_size > IMAGE_LIMIT for e in entries):
                raise HTTPException(413, 'Imagem acima de 12 MB; comprima antes do envio.')
            if any(Path(e.filename).suffix.casefold() not in VALID_EXT for e in entries):
                raise HTTPException(415, 'ZIP deve conter apenas JPG, PNG ou WebP.')
            state, names, lookup = roster(db)
            prune_stages()
            token = secrets.token_hex(20)
            directory = stage_root() / token
            directory.mkdir(mode=0o700)
            output = []
            seen_stems: set[str] = set()
            try:
                for ent in entries:
                    original = Path(ent.filename).name
                    if norm(original) in seen_stems:
                        raise HTTPException(422, 'O ZIP contém nomes de arquivo repetidos.')
                    seen_stems.add(norm(original))
                    item_id = uuid.uuid4().hex
                    extension = Path(original).suffix.lower()
                    target = directory / f'{item_id}{extension}'
                    digest = hashlib.sha256()
                    length = 0
                    head = b''
                    with package.open(ent) as source, target.open('xb') as sink:
                        os.chmod(target, 0o600)
                        while block := source.read(64 * 1024):
                            length += len(block)
                            if length > IMAGE_LIMIT:
                                raise HTTPException(413, 'Imagem acima de 12 MB.')
                            if len(head) < 64: head += block[:64 - len(head)]
                            digest.update(block)
                            sink.write(block)
                    sniff = sniff_mime(head)
                    if not sniff or not sniff[0].startswith('image/'):
                        raise HTTPException(415, f'O conteúdo de {original} não é uma imagem suportada.')
                    expected = {'image/jpeg': {'.jpg', '.jpeg'}, 'image/png': {'.png'}, 'image/webp': {'.webp'}}[sniff[0]]
                    if extension not in expected:
                        raise HTTPException(415, f'Extensão e conteúdo divergentes: {original}.')
                    # Pillow rejeita imagens truncadas, inválidas e cargas excessivamente grandes.
                    try:
                        from PIL import Image, UnidentifiedImageError
                        with Image.open(target) as img:
                            img.verify()
                        with Image.open(target) as img:
                            if img.width * img.height > 45_000_000:
                                raise ValueError('Dimensões excessivas')
                    except Exception:
                        raise HTTPException(415, f'Imagem inválida ou excessivamente grande: {original}.')
                    key = athlete_key(Path(original).stem)
                    candidates = lookup.get(key, [])
                    exact_id = original.split('.')[0]
                    if exact_id in names: candidates = [exact_id]
                    kind = suggested_kind(Path(original).stem)
                    output.append({'item_id': item_id, 'filename': original[:120], 'size': length,
                                   'mime_type': sniff[0], 'digest': digest.hexdigest(), 'stored_stage':target.name,
                                   'kind': kind, 'athlete_id': candidates[0] if len(candidates) == 1 else None,
                                   'status': 'exato' if len(candidates) == 1 else 'ambiguo' if len(candidates) > 1 else 'manual'})
                data = {'username': sess.username, 'state_revision': state.revision, 'items': output}
                (directory / 'manifest.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
                os.chmod(directory / 'manifest.json', 0o600)
            except Exception:
                shutil.rmtree(directory, ignore_errors=True)
                raise
        public_items = [{k:v for k,v in row.items() if k not in ('digest','stored_stage')} for row in output]
        return JSONResponse({'batch_id':token,'revision':state.revision,'athletes':names,
                             'items':public_items, 'expires_in_minutes':45}, headers={'Cache-Control':'no-store'})

    @router.get('/preview/{token}/{item_id}/image')
    def preview_image(token: str, item_id: str, sess=Depends(session_auth)):
        folder, meta = manifest_for(token, sess.username)
        row = next((x for x in meta['items'] if x['item_id'] == item_id), None)
        if not row:
            raise HTTPException(404, 'Imagem não encontrada.')
        p = folder / row['stored_stage']
        if not p.is_file(): raise HTTPException(404, 'Imagem não encontrada.')
        return FileResponse(p, media_type=row['mime_type'], headers={'Cache-Control':'private, no-store',
                               'X-Content-Type-Options':'nosniff'})

    @router.post('/apply')
    def apply(req: Confirm, sess=Depends(check_csrf), db: DbSession=Depends(get_db)):
        if not req.confirm: raise HTTPException(422, 'Confirme expressamente a importação.')
        folder, meta = manifest_for(req.batch_id, sess.username)
        lock = folder / '.processing'
        try: lock.mkdir(mode=0o700)
        except FileExistsError: raise HTTPException(409, 'Lote já está em processamento.')
        moved: list[str] = []
        storage = get_storage()
        committed = False
        try:
            state, names, _ = roster(db)
            if state.revision != req.expected_state_revision or meta['state_revision'] != state.revision:
                raise HTTPException(409, 'O cadastro foi alterado. Gere uma nova prévia.')
            rows = {r['item_id']:r for r in meta['items']}
            ids = [item.item_id for item in req.items]
            if len(ids) != len(set(ids)):
                raise HTTPException(409, 'Imagem selecionada mais de uma vez.')
            if any(item.item_id not in rows or item.athlete_id not in names for item in req.items):
                raise HTTPException(409, 'Atleta ou imagem inexistente. Reveja o vínculo.')
            total = sum(rows[item.item_id]['size'] for item in req.items)
            reserve_quota(db, total, STORAGE_QUOTA)
            for selected in req.items:
                info = rows[selected.item_id]
                src = folder / info['stored_stage']
                if not src.is_file() or src.stat().st_size != info['size']:
                    raise HTTPException(409, 'Arquivo temporário alterado ou indisponível.')
                with src.open('rb') as f:
                    digest = hashlib.file_digest(f, 'sha256').hexdigest()
                if digest != info['digest']:
                    raise HTTPException(409, 'Arquivo alterado. Envie um novo ZIP.')
                uid = uuid.uuid4().hex
                extension = Path(info['stored_stage']).suffix
                name = f'{uid}{extension}'
                storage.put_file(name, src, info['mime_type'])
                moved.append(name)
                db.add(MediaAsset(id=uid, scope='athlete', kind=selected.kind,
                    athlete_id=selected.athlete_id, round_id=None, match_id=None,
                    caption='', original_name=info['filename'], stored_name=name,
                    mime_type=info['mime_type'], size=info['size'], actor=sess.username,
                    created_at=utcnow()))
            db.commit()
            committed = True
            return {'ok':True,'created':len(moved),'message':'Fotos/caricaturas importadas. Fichas e súmulas não modificadas.'}
        finally:
            if not committed:
                db.rollback()
                for name in moved:
                    try: storage.remove(name)
                    except Exception: pass
                shutil.rmtree(lock, ignore_errors=True)
            else:
                shutil.rmtree(folder, ignore_errors=True)

    return router
