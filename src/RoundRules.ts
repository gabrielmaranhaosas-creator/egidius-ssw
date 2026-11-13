import type { EquipeRodada, Partida, Rodada } from './SSWStore';
import { validarCapacidadeDosTimes, validarDoisTimes } from './TimeRules';

/** Cada partida é um snapshot: equipe do sábado fixa; resultado e goleiro por jogo. */
export function jogoDasEquipes(numero: number, id: string, equipeA: EquipeRodada, equipeB: EquipeRodada): Partida {
  const erro = validarDoisTimes(equipeA, equipeB);
  if (erro) throw new Error(erro);
  return {
    id, numero, equipeIdA: equipeA.id, equipeIdB: equipeB.id,
    timeA: equipeA.nome, timeB: equipeB.nome,
    golsA: 0, golsB: 0, observacoes: '', status: 'rascunho',
    atletasA: [...equipeA.atletas], atletasB: [...equipeB.atletas], golsPorAtleta: {},
    goleiroA: null, goleiroB: null, permitirGolsSemAutor: false, vinculoFormacao: true,
  };
}

/** Vinculação expressa: preserva placar e observações; nunca altera súmula encerrada. */
export function aplicarEquipes(jogo: Partida, equipeA: EquipeRodada, equipeB: EquipeRodada): Partida {
  if (jogo.golsA || jogo.golsB || Object.values(jogo.golsPorAtleta).some(Boolean)) throw new Error('Este jogo já tem gols. Corrija os registros da própria súmula; a montagem atual vale para novos jogos.');
  if (jogo.status !== 'rascunho') throw new Error('Reabra a súmula antes de escolher as equipes deste jogo.');
  if (equipeA.id === equipeB.id) throw new Error('Selecione duas equipes diferentes.');
  const golsPorAtleta = Object.fromEntries(Object.entries(jogo.golsPorAtleta).filter(([id]) =>
    (jogo.atletasA.includes(id) && equipeA.atletas.includes(id)) ||
    (jogo.atletasB.includes(id) && equipeB.atletas.includes(id))));
  return { ...jogo,
    equipeIdA: equipeA.id, equipeIdB: equipeB.id,
    timeA: equipeA.nome, timeB: equipeB.nome,
    atletasA: [...equipeA.atletas], atletasB: [...equipeB.atletas], golsPorAtleta,
    goleiroA: jogo.goleiroA && equipeA.atletas.includes(jogo.goleiroA) ? jogo.goleiroA : null,
    goleiroB: jogo.goleiroB && equipeB.atletas.includes(jogo.goleiroB) ? jogo.goleiroB : null,
    vinculoFormacao: true,
  };
}

/** A montagem atual prepara jogos futuros; cada súmula guarda sua própria escalação. */
export function equipesBloqueadas(_rodada: Rodada): boolean { return false; }

export function validarEquipes(equipes: EquipeRodada[], presencas: string[]): string | null {
  if (equipes.length < 2) return 'Cadastre pelo menos dois times para o sábado.';
  if (equipes.some(e => !e.nome.trim() || e.nome.trim().length > 40)) return 'Informe nomes de até 40 caracteres para todos os times.';
  const nomes = equipes.map(e => e.nome.trim().toLocaleLowerCase('pt-BR'));
  if (new Set(nomes).size !== nomes.length) return 'Os times precisam ter nomes diferentes.';
  if (new Set(equipes.map(e => e.id)).size !== equipes.length) return 'Há identificadores de equipes repetidos.';
  const excesso = validarCapacidadeDosTimes(equipes);
  if (excesso) return excesso;
  // Pode salvar a montagem incompleta. O limite exato de sete é exigido ao criar um jogo.
  const todos = equipes.flatMap(e => e.atletas);
  if (new Set(todos).size !== todos.length) return 'O mesmo atleta não pode jogar por dois times no sábado.';
  if (todos.some(id => !presencas.includes(id))) return 'Todos os atletas escalados precisam ter presença confirmada.';
  return null;
}

/** Salvar novos times jamais reescreve súmulas, inclusive rascunhos já criados. */
export function atualizarRascunhosVinculados(rodada: Rodada, equipes: EquipeRodada[]): Rodada {
  return { ...rodada, equipes, jogos: rodada.jogos };
}

/** Confronto padrão: repete o último duelo do sábado, se os dois times ainda existem. */
export function confrontoSugerido(rodada: Rodada): { a: string; b: string } {
  const ultimo = [...rodada.jogos].reverse().find(j =>
    j.equipeIdA && j.equipeIdB && rodada.equipes.some(e => e.id === j.equipeIdA) &&
    rodada.equipes.some(e => e.id === j.equipeIdB));
  return ultimo?.equipeIdA && ultimo?.equipeIdB
    ? { a: ultimo.equipeIdA, b: ultimo.equipeIdB }
    : { a: rodada.equipes[0]?.id ?? '', b: rodada.equipes[1]?.id ?? '' };
}
