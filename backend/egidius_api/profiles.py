from __future__ import annotations
import json
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class PerfilEntrada(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    nomeExibicao: str = Field(default='', max_length=80)
    apelido: str = Field(default='', max_length=60)
    posicao: Literal['nao-informada','goleiro','zagueiro','lateral','meio-campo','atacante','coringa'] = 'nao-informada'
    peDominante: Literal['nao-informado','direito','esquerdo','ambos'] = 'nao-informado'
    situacao: Literal['ativo','convidado','afastado','lenda'] = 'ativo'
    numeroFigurinha: int | None = Field(default=None, ge=1, le=9999)
    entradaGrupo: str | None = Field(default=None, max_length=10)
    miniBio: str = Field(default='', max_length=600)
    bordao: str = Field(default='', max_length=180)
    retratoPreferido: Literal['foto', 'caricatura'] = 'foto'

    @field_validator('entradaGrupo')
    @classmethod
    def validar_data(cls, value: str | None) -> str | None:
        if value == '': return None
        if value is not None:
            if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
                raise ValueError('Data de entrada inválida')
        return value

class AtualizacaoPerfil(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=0)
    profile: PerfilEntrada


def perfil_serializado(row):
    dados = PerfilEntrada.model_validate(json.loads(row.payload))
    return {'athlete_id':row.athlete_id, 'revision':row.revision,
            'updated_at':row.updated_at.isoformat() if row.updated_at else None,
            'profile':dados.model_dump(),
            'fotoMediaId':None, 'caricaturaMediaId':None}
