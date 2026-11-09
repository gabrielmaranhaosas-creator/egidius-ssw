"""EGIDIUS 08D — Prévia e importação transacional de fichas; nunca altera súmulas.

Aceita CSV UTF-8, JSON de objetos e XLSX simples. Não cria novos atletas por engano.
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .db import AthleteProfile, State, utcnow
from .profiles import PerfilEntrada

MAX_IMPORT_BYTES = 3 * 1024 * 1024
MAX_IMPORT_ROWS = 300
FIELDS = set(PerfilEntrada.model_fields)
ALIAS = {
    'id':'athlete_id', 'athlete_id':'athlete_id', 'atleta_id':'athlete_id','jogador_id':'athlete_id',
    'nome':'nome','nome_oficial':'nome','jogador':'nome',
    'nome_exibicao':'nomeExibicao','nome_de_exibicao':'nomeExibicao',
    'apelido':'apelido','posicao':'posicao','pe_dominante':'peDominante',
    'situacao':'situacao','status':'situacao','numero':'numeroFigurinha',
    'numero_da_figurinha':'numeroFigurinha','numero_figurinha':'numeroFigurinha',
    'entrada_no_grupo':'entradaGrupo','data_de_entrada':'entradaGrupo',
    'mini_bio':'miniBio','biografia':'miniBio','bordao':'bordao',
    'retrato_preferido':'retratoPreferido',
}
VALUES = {
    'posicao': {'goleiro':'goleiro','zagueiro':'zagueiro','lateral':'lateral',
                'meio_campo':'meio-campo','meiocampo':'meio-campo','atacante':'atacante',
                'coringa':'coringa', 'nao_informada':'nao-informada'},
    'peDominante': {'direito':'direito','esquerdo':'esquerdo','ambos':'ambos',
                    'nao_informado':'nao-informado'},
    'situacao': {'ativo':'ativo','convidado':'convidado','afastado':'afastado','lenda':'lenda'},
    'retratoPreferido': {'foto':'foto','caricatura':'caricatura'},
}

def norm(value: Any) -> str:
    s = unicodedata.normalize('NFKD', str(value or '').strip())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '_', s.casefold()).strip('_')

def decode_rows(name: str, data: bytes) -> list[dict]:
    ext = Path(name).suffix.lower()
    if ext == '.csv':
        try: raw = data.decode('utf-8-sig')
        except UnicodeDecodeError as e: raise HTTPException(422,'CSV deve estar em UTF-8.') from e
        try: dialect = csv.Sniffer().sniff(raw[:8192], delimiters=',;\t')
        except csv.Error: dialect = csv.excel
        reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
        headers = [h for h in (reader.fieldnames or []) if h]
        if len(headers) != len(set(headers)):
            raise HTTPException(422, 'Há títulos de coluna repetidos. Renomeie-os antes de importar.')
        rows = []
        for row in reader:
            rows.append(row)
            if len(rows) > MAX_IMPORT_ROWS:
                raise HTTPException(413, 'Máximo de 300 linhas por operação.')
    elif ext == '.json':
        try: raw = json.loads(data)
        except (UnicodeDecodeError, ValueError) as e: raise HTTPException(422,'JSON inválido.') from e
        if isinstance(raw,dict):
            raw = raw.get('atletas',raw.get('jogadores',raw.get('profiles',raw.get('dados',None))))
        if not isinstance(raw,list): raise HTTPException(422,'JSON deve conter uma lista de atletas ou objeto com chave atletas.')
        rows = raw
    elif ext == '.xlsx':
        # Verificações simples contra planilhas ZIP com inflação maliciosa.
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries=archive.infolist()
                if len(entries)>500 or sum(x.file_size for x in entries)>25*1024*1024:
                    raise HTTPException(413,'Planilha XLSX excessivamente grande.')
            from openpyxl import load_workbook
            workbook=load_workbook(io.BytesIO(data),read_only=True,data_only=True)
            sheet=workbook.active
            if sheet.max_column > 60 or sheet.max_row > 10000:
                workbook.close()
                raise HTTPException(413, 'Use uma aba com até 60 colunas e 10.000 linhas, incluindo vazias.')
            iterator=sheet.iter_rows(values_only=True)
            header=next(iterator,None)
            if header is None: rows=[]
            else:
                columns=[str(x or '').strip() for x in header]
                headers=[c for c in columns if c]
                if len(headers) != len(set(headers)):
                    workbook.close()
                    raise HTTPException(422, 'Há títulos de coluna repetidos. Renomeie-os antes de importar.')
                rows=[]
                for line in iterator:
                    if not any(x is not None and str(x).strip() for x in line): continue
                    rows.append({k:v for k,v in zip(columns,line) if k})
                    if len(rows)>MAX_IMPORT_ROWS:
                        workbook.close()
                        raise HTTPException(413, 'Máximo de 300 linhas por operação.')
            workbook.close()
        except HTTPException: raise
        except Exception as e: raise HTTPException(422,'Não foi possível ler o XLSX.') from e
    else: raise HTTPException(415,'Formato não suportado. Use CSV, JSON ou XLSX.')
    if len(rows)>MAX_IMPORT_ROWS: raise HTTPException(413,f'Máximo de {MAX_IMPORT_ROWS} linhas por operação.')
    if not rows: raise HTTPException(422,'Nenhum atleta encontrado no arquivo.')
    if not all(isinstance(row,dict) for row in rows):
        raise HTTPException(422,'Cada linha precisa conter campos nomeados.')
    return rows

def cleaned_row(row: dict) -> tuple[str,str,dict]:
    if 'profile' in row and isinstance(row['profile'],dict):
        # Backup de fichas do próprio EGIDIUS.
        row = {**row['profile'], **{k:row[k] for k in ('athlete_id','nome') if k in row}}
    cleaned:dict[str,str|int]={}
    aid=''; nome=''
    for key,value in row.items():
        if value is None or str(value).strip()=='': continue
        dest=ALIAS.get(norm(key)) or (key if key in FIELDS else None)
        if dest=='athlete_id': aid=str(value).strip()
        elif dest=='nome': nome=str(value).strip()
        elif dest in FIELDS:
            if dest=='numeroFigurinha':
                try:
                    # Conservar zeros à esquerda somente na apresentação; ID numérico único.
                    number = int(value)
                    if str(value).strip() not in (str(number),str(number).zfill(len(str(value).strip()))): raise ValueError()
                    cleaned[dest] = number
                except (ValueError, TypeError):
                    raise ValueError('Número de figurinha inválido.')
            elif dest in VALUES:
                v = VALUES[dest].get(norm(value))
                if not v: raise ValueError(f'Valor desconhecido para {key}: {value}')
                cleaned[dest]=v
            elif dest=='entradaGrupo' and hasattr(value,'date'):
                cleaned[dest]=value.date().isoformat()
            elif dest=='entradaGrupo' and hasattr(value,'isoformat'):
                cleaned[dest]=value.isoformat()[:10]
            else: cleaned[dest]=str(value).strip()
    return aid,nome,cleaned

class ImportLine(BaseModel):
    model_config=ConfigDict(extra='forbid')
    row_number: int = Field(ge=2,le=10000)
    athlete_id: str = Field(min_length=1,max_length=140)
    expected_revision: int = Field(ge=0)
    fields: dict[str,Any]

class ApplyRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    expected_state_revision: int = Field(ge=0)
    confirm: bool
    lines: list[ImportLine] = Field(min_length=1,max_length=MAX_IMPORT_ROWS)


def importer_router(session_auth, check_csrf, get_db):
    router=APIRouter(prefix='/api/import',tags=['import'])
    @router.post('/preview')
    async def preview(request:Request,filename:str=Query(...,max_length=160),
                      _=Depends(check_csrf), db:DbSession=Depends(get_db)):
        data=b''
        async for chunk in request.stream():
            data+=chunk
            if len(data)>MAX_IMPORT_BYTES: raise HTTPException(413,'Arquivo maior que 3 MB.')
        if not data: raise HTTPException(422,'Selecione um arquivo não vazio.')
        incoming=decode_rows(filename,data)
        state=db.get(State,1)
        roster=json.loads(state.payload)['jogadores']
        existing={j['id']:j['nome'] for j in roster}
        profiles={p.athlete_id:p for p in db.scalars(select(AthleteProfile)).all()}
        names:dict[str,set[str]]=defaultdict(set)
        for aid,official in existing.items():
            names[norm(official)].add(aid)
            if aid in profiles:
                profile_data=json.loads(profiles[aid].payload)
                for alias in ('apelido','nomeExibicao'):
                    if profile_data.get(alias):names[norm(profile_data[alias])].add(aid)
        output=[]
        for idx,row in enumerate(incoming,start=2):
            try:
                aid,nome,fields=cleaned_row(row)
                if not fields: raise ValueError('Linha sem campos editáveis de perfil.')
                PerfilEntrada.model_validate({**PerfilEntrada().model_dump(),**fields})
                candidates=([aid] if aid in existing else []) if aid else sorted(names.get(norm(nome),[]))
                if aid and aid not in existing: raise ValueError('ID de atleta não existe no cadastro.')
                status='pronto' if len(candidates)==1 else 'ambiguo' if len(candidates)>1 else 'revisar'
                resolved=candidates[0] if len(candidates)==1 else None
                output.append({'row_number':idx,'nome':nome or existing.get(aid,''),
                    'fields':fields,'status':status,'athlete_id':resolved,
                    'expected_revision':profiles[resolved].revision if resolved in profiles else 0,
                    'candidates':candidates,'error':None})
            except (ValueError,ValidationError) as e:
                output.append({'row_number':idx,'nome':str(row.get('nome') or row.get('Nome') or ''),
                    'fields':{},'status':'erro','athlete_id':None,'expected_revision':0,
                    'candidates':[],'error':str(e)[:240]})
        return {'revision':state.revision,'athletes':existing,'profiles_revisions':{aid:p.revision for aid,p in profiles.items()},
                'rows':output,'summary':{'total':len(output),'ready':sum(r['status']=='pronto' for r in output),
                'review':sum(r['status']=='revisar' for r in output),
                'errors':sum(r['status']=='erro' for r in output)}}

    @router.post('/apply')
    def apply(request:ApplyRequest, sess=Depends(check_csrf),db:DbSession=Depends(get_db)):
        if not request.confirm:raise HTTPException(422,'Confirme expressamente a importação.')
        state=db.get(State,1)
        if state.revision!=request.expected_state_revision:
            raise HTTPException(409,'Cadastro de atletas modificado. Gere uma nova prévia antes de importar.')
        roster={j['id'] for j in json.loads(state.payload)['jogadores']}
        ids=[r.athlete_id for r in request.lines]
        if len(ids)!=len(set(ids)):
            raise HTTPException(409,'Duas linhas estão vinculadas ao mesmo atleta. Revise a seleção.')
        if any(aid not in roster for aid in ids):
            raise HTTPException(409,'Há atletas inexistentes na seleção.')
        updated=[]
        try:
            for item in request.lines:
                if not item.fields or any(k not in FIELDS for k in item.fields):
                    raise HTTPException(422,'Há campos não autorizados ou vazios.')
                row=db.get(AthleteProfile,item.athlete_id)
                current_revision=row.revision if row else 0
                if current_revision!=item.expected_revision:
                    raise HTTPException(409,'Uma ficha foi alterada. Recarregue a prévia.')
                initial=json.loads(row.payload) if row else PerfilEntrada().model_dump()
                profile=PerfilEntrada.model_validate({**initial,**item.fields})
                if row:
                    change=db.execute(update(AthleteProfile)
                        .where(AthleteProfile.athlete_id==item.athlete_id,AthleteProfile.revision==current_revision)
                        .values(revision=current_revision+1,payload=profile.model_dump_json(),
                                sticker_number=profile.numeroFigurinha,updated_at=utcnow()))
                    if change.rowcount!=1:raise HTTPException(409,'Conflito de edição detectado.')
                else:
                    db.add(AthleteProfile(athlete_id=item.athlete_id,revision=1,payload=profile.model_dump_json(),
                                          sticker_number=profile.numeroFigurinha,updated_at=utcnow()))
                updated.append(item.athlete_id)
            db.commit()
        except HTTPException:
            db.rollback();raise
        except (ValidationError,IntegrityError,ValueError) as e:
            db.rollback()
            raise HTTPException(409,'Dados inválidos ou número de figurinha duplicado. Nenhuma ficha foi alterada.') from e
        return {'ok':True,'updated':len(updated),'athlete_ids':updated,
                'message':'Fichas atualizadas. Rodadas, súmulas e placares preservados.'}
    return router
