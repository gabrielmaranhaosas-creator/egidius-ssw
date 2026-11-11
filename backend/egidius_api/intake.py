"""Entrada revisada do elenco: cria jogadores, sem alterar presenças ou partidas."""
from __future__ import annotations
import csv
import io
import json
import re
import unicodedata
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import update
from .db import History, State, utcnow
from .importer import decode_rows, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, norm
from .schema import DadosSSW


def nome_normalizado(value):
    if not isinstance(value, str):
        raise ValueError('O nome deve ser um texto, sem listas ou campos agrupados.')
    name = re.sub(r'[\s\ufeff]+', ' ', unicodedata.normalize('NFC', str(value or ''))).strip()
    if not 2 <= len(name.encode('utf-16-le')) // 2 <= 70:
        raise ValueError('Nome deve ter entre 2 e 70 caracteres.')
    if any(unicodedata.category(c) == 'Cc' for c in name):
        raise ValueError('O nome contém caracteres de controle.')
    return name


def ler_tabela(filename, data):
    if filename.lower().endswith(('.txt', '.tsv')):
        try: text = data.decode('utf-8-sig').strip()
        except UnicodeDecodeError: raise HTTPException(422, 'Use texto em UTF-8.')
        if not text: raise HTTPException(422, 'A lista está vazia.')
        lines = text.splitlines()
        if len(lines) > MAX_IMPORT_ROWS + 1:
            raise HTTPException(413, 'Máximo de 300 registros por importação.')
        if any(separator in lines[0] for separator in ('\t', ';', ',')):
            return decode_rows('tabela.csv', data)
        if norm(lines[0]) in ('nome', 'jogador', 'atleta', 'nome_completo'):
            lines = lines[1:]
        return [{'nome': line} for line in lines if line.strip()]
    return decode_rows(filename, data)


class EntradaElenco(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=0)
    confirm: bool
    names: list[str] = Field(min_length=1, max_length=MAX_IMPORT_ROWS)


def intake_router(session_auth, check_csrf, get_db):
    router = APIRouter(prefix='/api/intake', tags=['elenco'])

    @router.get('/template')
    def template(format: str = Query('csv'), _=Depends(session_auth)):
        if format == 'xlsx':
            from openpyxl import Workbook
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = 'Elenco'
            sheet.append(['nome'])
            sheet.column_dimensions['A'].width = 45
            sheet.freeze_panes = 'A2'
            guide = workbook.create_sheet('Como preencher')
            for line in ['Preencha a aba Elenco, com um jogador por linha.',
                         'Use o nome habitual de identificação; entre 2 e 70 caracteres.',
                         'A importação apresenta uma prévia e não marca presenças.',
                         'Fichas, fotos, vídeos e PDFs têm áreas próprias no EGIDIUS.']:
                guide.append([line])
            guide.column_dimensions['A'].width = 90
            output = io.BytesIO()
            workbook.save(output)
            workbook.close()
            return Response(output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            headers={'Content-Disposition':'attachment; filename="SSW_MODELO_ELENCO.xlsx"'})
        if format != 'csv': raise HTTPException(422, 'Escolha CSV ou XLSX.')
        return Response('\ufeffnome\r\n'.encode('utf-8'), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition':'attachment; filename="SSW_MODELO_ELENCO.csv"'})

    @router.post('/preview')
    async def preview(request: Request, filename: str = Query(..., max_length=160),
                      name_column: str | None = Query(None, max_length=160),
                      _=Depends(check_csrf), db=Depends(get_db)):
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > MAX_IMPORT_BYTES: raise HTTPException(413, 'Arquivo acima de 3 MB.')
        rows = ler_tabela(filename, bytes(content))
        if not rows: raise HTTPException(422, 'Não encontrei registros na tabela.')
        columns = list(dict.fromkeys(str(k) for row in rows for k in row if k is not None))
        if len(columns) > 60: raise HTTPException(422, 'Use uma tabela com até 60 colunas.')
        column = name_column or next((c for c in columns if norm(c) in
                                     ('nome', 'jogador', 'atleta', 'nome_completo', 'nome_oficial')), None)
        if name_column and name_column not in columns:
            raise HTTPException(422, 'A coluna escolhida não existe no arquivo.')
        state = db.get(State, 1)
        registered = {re.sub(r'[\s\ufeff]+', ' ', unicodedata.normalize('NFC', j['nome'])).strip().lower() for j in json.loads(state.payload)['jogadores']}
        seen = set()
        output = []
        for number, row in enumerate(rows, 2):
            value = row.get(column, '') if column else ''
            try:
                name = nome_normalizado(value)
                key = name.lower()
                status = 'existente' if key in registered else 'repetido' if key in seen else 'novo'
                seen.add(key)
                output.append({'row':number, 'nome':name, 'status':status, 'error':None})
            except ValueError as error:
                output.append({'row':number, 'nome':str(value or '')[:140], 'status':'erro',
                               'error':str(error) if column else 'Escolha a coluna que contém os nomes.'})
        return {'revision':state.revision, 'columns':columns, 'name_column':column, 'rows':output}

    @router.post('/apply')
    def apply(body: EntradaElenco, sess=Depends(check_csrf), db=Depends(get_db)):
        if not body.confirm: raise HTTPException(422, 'Confira e confirme a seleção antes de importar.')
        state = db.get(State, 1)
        if state.revision != body.expected_revision:
            raise HTTPException(409, 'A base mudou. Gere uma nova prévia; nenhum jogador foi importado.')
        try: names = [nome_normalizado(name) for name in body.names]
        except ValueError as error: raise HTTPException(422, str(error))
        keys = [name.lower() for name in names]
        current = json.loads(state.payload)
        existing = {re.sub(r'[\s\ufeff]+', ' ', unicodedata.normalize('NFC', j['nome'])).strip().lower() for j in current['jogadores']}
        if len(keys) != len(set(keys)) or existing.intersection(keys):
            raise HTTPException(409, 'Há nomes repetidos ou já cadastrados. Gere uma nova prévia.')
        new = [{'id':'jogador-' + str(uuid.uuid4()), 'nome':name} for name in names]
        data = DadosSSW.model_validate({**current, 'jogadores':current['jogadores'] + new})
        payload = data.model_dump_json()
        try:
            result = db.execute(update(State).where(State.id == 1, State.revision == body.expected_revision)
                                .values(revision=body.expected_revision+1, payload=payload, updated_at=utcnow()))
            if result.rowcount != 1:
                raise HTTPException(409, 'Outra sessão gravou antes. Gere uma nova prévia.')
            db.add(History(revision=body.expected_revision+1, actor=sess.username, payload=payload))
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {'created':len(new), 'revision':body.expected_revision+1}

    return router
