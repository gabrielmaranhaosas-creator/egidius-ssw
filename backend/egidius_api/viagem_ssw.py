"""Evento autônomo VIAGEM – SSW: futebol de campo 11×11, 24/10/2026, Goiânia.

Não integra súmulas de sábado, pontuação ou a regra dos sete. Os dados ficam
no MESMO banco SQLite, em tabela separada, incluída no backup completo.
"""
from __future__ import annotations

import json
from typing import Annotated, Literal, Union
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Integer, Text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session as DbSession, mapped_column

from .db import Base


class ViagemState(Base):
    __tablename__ = "viagem_ssw_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PessoaViagem(_Strict):
    id: str = Field(min_length=1, max_length=140)
    nome: str = Field(min_length=1, max_length=140)
    origem: Literal["cadastro", "convidado"]


class EquipeViagem(_Strict):
    nome: str = Field(min_length=1, max_length=80)
    atletas: list[str] = Field(default_factory=list, max_length=11)
    goleiro: str | None = None

    @model_validator(mode="after")
    def validar(self):
        if len(self.atletas) != len(set(self.atletas)):
            raise ValueError("Jogador repetido dentro do time")
        if self.goleiro is not None and self.goleiro not in self.atletas:
            raise ValueError("Goleiro deve fazer parte dos onze jogadores")
        return self




# Os acontecimentos são imutáveis e ordenados. Anular um gol adiciona um registro,
# sem apagar a ocorrência original, para preservar o histórico da partida.
class Gol(_Strict):
    tipo: Literal["gol"] = "gol"
    id: str = Field(min_length=1, max_length=90)
    time: Literal["timeA", "timeB"]
    jogador_id: str = Field(min_length=1, max_length=140)
    minuto: int | None = Field(default=None, ge=0, le=180)

class Substituicao(_Strict):
    tipo: Literal["substituicao"] = "substituicao"
    id: str = Field(min_length=1, max_length=90)
    time: Literal["timeA", "timeB"]
    saiu: str = Field(min_length=1, max_length=140)
    entrou: str = Field(min_length=1, max_length=140)
    minuto: int | None = Field(default=None, ge=0, le=180)

class AnulacaoGol(_Strict):
    tipo: Literal["anular_gol"] = "anular_gol"
    id: str = Field(min_length=1, max_length=90)
    gol_id: str = Field(min_length=1, max_length=90)

Movimento = Annotated[Union[Gol, Substituicao, AnulacaoGol], Field(discriminator="tipo")]

class SumulaViagem(_Strict):
    status: Literal["preparacao", "em_andamento", "encerrada"] = "preparacao"
    titularesA: list[str] = Field(default_factory=list, max_length=11)
    titularesB: list[str] = Field(default_factory=list, max_length=11)
    movimentos: list[Movimento] = Field(default_factory=list, max_length=350)
    iniciadoEm: str = Field(default="", max_length=60)
    encerradoEm: str = Field(default="", max_length=60)


def placar_sumula(s: SumulaViagem) -> tuple[int, int]:
    anulados = {m.gol_id for m in s.movimentos if isinstance(m, AnulacaoGol)}
    return (
        sum(isinstance(m, Gol) and m.id not in anulados and m.time == "timeA" for m in s.movimentos),
        sum(isinstance(m, Gol) and m.id not in anulados and m.time == "timeB" for m in s.movimentos),
    )


class ViagemData(_Strict):
    titulo: Literal["VIAGEM - SSW"] = "VIAGEM - SSW"
    data: Literal["2026-10-24"] = "2026-10-24"
    cidade: Literal["Goiânia"] = "Goiânia"
    uf: Literal["GO"] = "GO"
    modalidade: Literal["futebol-de-campo"] = "futebol-de-campo"
    jogadoresPorTime: Literal[11] = 11
    horario: str = Field(default="", max_length=40)
    local: str = Field(default="", max_length=160)
    observacoes: str = Field(default="", max_length=1200)
    pessoas: list[PessoaViagem] = Field(default_factory=list, max_length=100)
    timeA: EquipeViagem = Field(default_factory=lambda: EquipeViagem(nome="SSW — Time 1"))
    timeB: EquipeViagem = Field(default_factory=lambda: EquipeViagem(nome="SSW — Time 2"))
    sumula: SumulaViagem = Field(default_factory=SumulaViagem)

    @model_validator(mode="after")
    def validar(self):
        cadastrados = [p.id for p in self.pessoas]
        if len(cadastrados) != len(set(cadastrados)):
            raise ValueError("Participante repetido na viagem")
        utilizados = self.timeA.atletas + self.timeB.atletas
        if len(utilizados) != len(set(utilizados)):
            raise ValueError("Participante repetido entre os dois times")
        if not set(utilizados).issubset(set(cadastrados)):
            raise ValueError("Participante escalado sem cadastro na viagem")
        if self.timeA.nome.strip().casefold() == self.timeB.nome.strip().casefold():
            raise ValueError("Os dois times precisam de nomes diferentes")
        s = self.sumula
        if s.status == "preparacao":
            if s.movimentos or s.titularesA or s.titularesB or s.encerradoEm:
                raise ValueError("Súmula em preparação não pode conter movimentos de jogo")
            return self
        if len(s.titularesA) != 11 or len(s.titularesB) != 11:
            raise ValueError("A partida precisa começar com 11 atletas por time")
        if len(set(s.titularesA + s.titularesB)) != 22:
            raise ValueError("Os jogadores iniciais precisam ser diferentes")
        if not set(s.titularesA + s.titularesB).issubset(set(cadastrados)):
            raise ValueError("Titulares devem estar cadastrados na viagem")
        if not s.iniciadoEm:
            raise ValueError("Início da partida não registrado")
        if s.status == "em_andamento" and s.encerradoEm:
            raise ValueError("Partida em andamento não pode estar encerrada")
        if s.status == "encerrada" and not s.encerradoEm:
            raise ValueError("Encerramento precisa de data de registro")
        campo = {"timeA": list(s.titularesA), "timeB": list(s.titularesB)}
        todos = set(cadastrados)
        ids = set()
        gols = set()
        anulados = set()
        for m in s.movimentos:
            if m.id in ids:
                raise ValueError("Movimento repetido na súmula")
            ids.add(m.id)
            if isinstance(m, Gol):
                if m.jogador_id not in campo[m.time]:
                    raise ValueError("Gol atribuído a jogador que não estava em campo")
                gols.add(m.id)
            elif isinstance(m, Substituicao):
                if m.saiu not in campo[m.time] or m.entrou not in todos:
                    raise ValueError("Substituição com atleta não autorizado")
                if m.entrou in campo["timeA"] or m.entrou in campo["timeB"]:
                    raise ValueError("Substituto já está em campo")
                i = campo[m.time].index(m.saiu)
                campo[m.time][i] = m.entrou
            else:
                if m.gol_id not in gols or m.gol_id in anulados:
                    raise ValueError("Anulação de gol inválida ou repetida")
                anulados.add(m.gol_id)
        if campo["timeA"] != self.timeA.atletas or campo["timeB"] != self.timeB.atletas:
            raise ValueError("Escalação não corresponde ao histórico das substituições")
        if not self.timeA.goleiro or not self.timeB.goleiro:
            raise ValueError("Defina um goleiro por equipe")
        return self


def validar_transicao(anterior: ViagemData, nova: ViagemData) -> None:
    """Protege as movimentações oficiais e impede alterações silenciosas de súmula."""
    a, n = anterior.sumula, nova.sumula
    if a.status == "preparacao":
        if n.status == "encerrada":
            raise ValueError("Não é possível encerrar um jogo não iniciado")
        if n.status == "em_andamento":
            if not (len(anterior.timeA.atletas) == len(anterior.timeB.atletas) == 11):
                raise ValueError("Escalações incompletas; são necessários 11 por equipe")
            if not anterior.timeA.goleiro or not anterior.timeB.goleiro:
                raise ValueError("Escolha os dois goleiros antes de começar")
            if nova.timeA != anterior.timeA or nova.timeB != anterior.timeB or nova.pessoas != anterior.pessoas:
                raise ValueError("Não altere os times durante o início da partida")
            if n.titularesA != anterior.timeA.atletas or n.titularesB != anterior.timeB.atletas:
                raise ValueError("Os titulares não correspondem às escalações")
        return
    # Em jogos iniciados, a lista de participantes, os nomes e os titulares ficam congelados.
    if (nova.pessoas != anterior.pessoas or nova.horario != anterior.horario
        or nova.local != anterior.local or nova.observacoes != anterior.observacoes
        or nova.timeA.nome != anterior.timeA.nome or nova.timeB.nome != anterior.timeB.nome
        or n.titularesA != a.titularesA or n.titularesB != a.titularesB
        or n.iniciadoEm != a.iniciadoEm):
        raise ValueError("Dados do jogo iniciado não podem ser substituídos")
    if n.movimentos[:len(a.movimentos)] != a.movimentos:
        raise ValueError("Histórico imutável: use Anular gol para corrigir")
    acrescimos = n.movimentos[len(a.movimentos):]
    if a.status == "encerrada":
        if n.status != "em_andamento" or acrescimos or n.encerradoEm:
            raise ValueError("Partida encerrada: reabra antes de registrar alterações")
        if nova.timeA != anterior.timeA or nova.timeB != anterior.timeB:
            raise ValueError("Reabertura não deve alterar equipes")
        return
    if n.status == "preparacao" or len(acrescimos) > 1:
        raise ValueError("Transição de súmula inválida")
    if n.status == "encerrada":
        if acrescimos or nova.timeA != anterior.timeA or nova.timeB != anterior.timeB:
            raise ValueError("Encerramento não pode modificar placar ou escalações")
        return
    if not acrescimos:
        raise ValueError("Nenhuma ação de jogo recebida")
    movimento = acrescimos[0]
    if not isinstance(movimento, Substituicao):
        if nova.timeA != anterior.timeA or nova.timeB != anterior.timeB:
            raise ValueError("Gols não podem alterar escalações")
    else:
        outro = "timeB" if movimento.time == "timeA" else "timeA"
        if getattr(nova, outro) != getattr(anterior, outro):
            raise ValueError("Substituição alterou outro time")
        atual = getattr(anterior, movimento.time)
        proximo = getattr(nova, movimento.time)
        esperado = list(atual.atletas)
        if movimento.saiu not in esperado or movimento.entrou in (anterior.timeA.atletas + anterior.timeB.atletas):
            raise ValueError("Substituição inválida")
        esperado[esperado.index(movimento.saiu)] = movimento.entrou
        if proximo.atletas != esperado:
            raise ValueError("Escalação incorreta na substituição")
        goleiro_esperado = movimento.entrou if atual.goleiro == movimento.saiu else atual.goleiro
        if proximo.goleiro != goleiro_esperado:
            raise ValueError("Goleiro deve permanecer ou ser substituído pelo atleta que entrou")


class ViagemUpdate(_Strict):
    expected_revision: int = Field(ge=0)
    data: ViagemData


def viagem_router(session_auth, check_csrf, get_db):
    router = APIRouter()

    @router.get("/api/viagem-ssw")
    def obter(_sess=Depends(session_auth), db: DbSession = Depends(get_db)):
        item = db.get(ViagemState, 1)
        return JSONResponse(
            {"revision": item.revision if item else 0,
             "data": json.loads(item.payload) if item else ViagemData().model_dump()},
            headers={"Cache-Control": "no-store"},
        )

    @router.put("/api/viagem-ssw")
    def salvar(value: ViagemUpdate, _sess=Depends(check_csrf), db: DbSession = Depends(get_db)):
        payload = value.data.model_dump_json()
        existente = db.get(ViagemState, 1)
        try:
            if existente:
                validar_transicao(ViagemData.model_validate_json(existente.payload), value.data)
            elif value.data.sumula.status != "preparacao":
                raise ValueError("Cadastre a viagem antes de iniciar a partida")
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if value.expected_revision == 0:
            if db.get(ViagemState, 1) is not None:
                raise HTTPException(409, "A viagem foi alterada. Atualize antes de salvar.")
            db.add(ViagemState(id=1, revision=1, payload=payload))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, "A viagem foi alterada em outra sessão.")
            return {"revision": 1}
        resultado = db.execute(
            update(ViagemState)
            .where(ViagemState.id == 1, ViagemState.revision == value.expected_revision)
            .values(revision=value.expected_revision + 1, payload=payload)
        )
        if resultado.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Outra sessão modificou a viagem. Atualize antes de salvar.")
        db.commit()
        return {"revision": value.expected_revision + 1}

    return router
