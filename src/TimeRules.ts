import type { EquipeRodada, Partida } from './SSWStore';

/** Regra SSW: sete pessoas em campo, sendo um goleiro entre elas. */
export const JOGADORES_POR_TIME = 7 as const;

/** Times incompletos podem ser salvos durante a montagem; jamais exceder sete. */
export function validarCapacidadeDosTimes(equipes: EquipeRodada[]): string | null {
  const acima = equipes.find(e => e.atletas.length > JOGADORES_POR_TIME);
  return acima ? `${acima.nome}: o limite é de 7 jogadores, incluindo o goleiro.` : null;
}

export function validarDoisTimes(a?: EquipeRodada, b?: EquipeRodada): string | null {
  if (!a || !b || a.id === b.id) return 'Escolha dois times diferentes.';
  if (a.atletas.length !== JOGADORES_POR_TIME || b.atletas.length !== JOGADORES_POR_TIME) {
    return `Para criar o jogo, cada time precisa ter 7 jogadores (6 de linha + 1 goleiro). ${a.nome}: ${a.atletas.length}/7; ${b.nome}: ${b.atletas.length}/7. Complete os times em Sábado completo → Times.`;
  }
  const todos = [...a.atletas, ...b.atletas];
  if (new Set(todos).size !== 14) return 'Um jogador não pode ocupar duas vagas no mesmo confronto.';
  return null;
}

/** Exigido só em novos encerramentos. Súmulas antigas já encerradas não são alteradas. */
export function validarSeteEUmGoleiro(jogo: Partida): string | null {
  if (jogo.atletasA.length !== 7 || jogo.atletasB.length !== 7) {
    return `Cada time deve ter 7 jogadores, incluindo o goleiro. ${jogo.timeA}: ${jogo.atletasA.length}/7; ${jogo.timeB}: ${jogo.atletasB.length}/7.`;
  }
  if (new Set([...jogo.atletasA, ...jogo.atletasB]).size !== 14) {
    return 'Os dois times precisam reunir 14 jogadores diferentes.';
  }
  if (!jogo.goleiroA || !jogo.atletasA.includes(jogo.goleiroA)) return `Escolha o goleiro de ${jogo.timeA} entre seus 7 jogadores.`;
  if (!jogo.goleiroB || !jogo.atletasB.includes(jogo.goleiroB)) return `Escolha o goleiro de ${jogo.timeB} entre seus 7 jogadores.`;
  return null;
}

/** Equipes distribuídas em rodízio de chegada, até sete em cada. Excedentes ficam disponíveis. */
export function distribuirPorChegadaAteSete(idsEmOrdem: string[], numeroTimes: number): string[][] {
  if (!Number.isInteger(numeroTimes) || numeroTimes < 1) return [];
  const grupos = Array.from({ length: numeroTimes }, () => [] as string[]);
  idsEmOrdem.slice(0, numeroTimes * JOGADORES_POR_TIME).forEach((id, indice) => {
    grupos[indice % numeroTimes].push(id);
  });
  return grupos;
}
