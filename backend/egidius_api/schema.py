from __future__ import annotations
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class Base(BaseModel):
    model_config = ConfigDict(extra='ignore')  # ignora somente metadata de backup exportado

class Jogador(Base):
    id: str = Field(min_length=1, max_length=140)
    nome: str = Field(min_length=1, max_length=140)

class Equipe(Base):
    id: str = Field(min_length=1, max_length=140)
    nome: str = Field(min_length=1, max_length=140)
    atletas: list[str]

class Partida(Base):
    id: str
    numero: int = Field(ge=0)
    timeA: str
    timeB: str
    golsA: int = Field(ge=0)
    golsB: int = Field(ge=0)
    observacoes: str
    status: Literal['rascunho', 'encerrada']
    atletasA: list[str]
    atletasB: list[str]
    golsPorAtleta: dict[str, int]
    goleiroA: str | None
    goleiroB: str | None
    permitirGolsSemAutor: bool
    vinculoFormacao: bool
    equipeIdA: str | None
    equipeIdB: str | None

    @model_validator(mode='after')
    def validar(self):
        if any(v < 0 for v in self.golsPorAtleta.values()):
            raise ValueError('Gols por atleta não podem ser negativos')
        if len(set(self.atletasA + self.atletasB)) != len(self.atletasA) + len(self.atletasB):
            raise ValueError('Jogador repetido na súmula')
        return self

class Rodada(Base):
    id: str
    data: str
    presencas: list[str]
    equipes: list[Equipe]
    jogos: list[Partida]

    @model_validator(mode='after')
    def validar(self):
        try:
            d = date.fromisoformat(self.data)
        except ValueError as exc:
            raise ValueError('Data inválida') from exc
        if d.weekday() != 5:
            raise ValueError('A rodada deve acontecer em sábado')
        if len(set(self.presencas)) != len(self.presencas):
            raise ValueError('Presença repetida')
        ids = [e.id for e in self.equipes]
        if len(ids) != len(set(ids)):
            raise ValueError('ID de time repetido')
        jogadores = [a for e in self.equipes for a in e.atletas]
        if len(jogadores) != len(set(jogadores)):
            raise ValueError('Jogador escalado em mais de um time')
        for j in self.jogos:
            if j.equipeIdA is not None and j.equipeIdA not in ids:
                raise ValueError('Equipe A não existe na rodada')
            if j.equipeIdB is not None and j.equipeIdB not in ids:
                raise ValueError('Equipe B não existe na rodada')
        return self

class ItemLixeira(Base):
    id: str = Field(min_length=1, max_length=140)
    rodadaId: str = Field(min_length=1, max_length=140)
    excluidoEm: str = Field(min_length=1, max_length=60)
    jogo: Partida

    @model_validator(mode='after')
    def validar(self):
        if self.jogo.status != 'rascunho':
            raise ValueError('Somente jogos em rascunho podem ficar na lixeira')
        from datetime import datetime
        try:
            datetime.fromisoformat(self.excluidoEm.replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('Data da exclusão inválida') from exc
        return self

class DadosSSW(Base):
    versao: Literal[5]
    jogadores: list[Jogador]
    rodadas: list[Rodada]
    lixeira: list[ItemLixeira] = Field(default_factory=list, max_length=200)

    @model_validator(mode='after')
    def validar(self):
        ids = [j.id for j in self.jogadores]
        if len(set(ids)) != len(ids):
            raise ValueError('ID de jogador duplicado')
        rid = [r.id for r in self.rodadas]
        if len(set(rid)) != len(rid):
            raise ValueError('ID de rodada duplicado')
        arquivos = [item.id for item in self.lixeira]
        if len(set(arquivos)) != len(arquivos):
            raise ValueError('Identificador de exclusão duplicado')
        ids_jogos = [j.id for r in self.rodadas for j in r.jogos]
        ids_excluidos = [item.jogo.id for item in self.lixeira]
        if len(set(ids_jogos + ids_excluidos)) != len(ids_jogos + ids_excluidos):
            raise ValueError('Partida duplicada entre sábado e lixeira')
        for item in self.lixeira:
            if item.rodadaId not in rid:
                raise ValueError('O sábado do jogo excluído não existe')
        return self

class Atualizacao(Base):
    expected_revision: int = Field(ge=0)
    data: DadosSSW

Vazio = DadosSSW(versao=5, jogadores=[], rodadas=[])
