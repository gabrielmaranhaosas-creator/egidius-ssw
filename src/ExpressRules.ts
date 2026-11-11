import type { Partida, Rodada } from './SSWStore';
import { ajustarGol } from './QuickActions';
import { JOGADORES_POR_TIME } from './TimeRules';

export type Lado = 'A' | 'B';
export function golsAtribuidos(jogo: Partida, lado: Lado): number {
  return (lado === 'A' ? jogo.atletasA : jogo.atletasB)
    .reduce((total, atletaId) => total + (jogo.golsPorAtleta[atletaId] ?? 0), 0);
}

export type PendenciaPartida = { codigo: string; mensagem: string };

/** Conferência compartilhada pelas duas súmulas. Apenas lê o jogo; não altera o histórico. */
export function pendenciasEncerramento(jogo: Partida): PendenciaPartida[] {
  if (jogo.status !== 'rascunho') return [{ codigo: 'encerrada', mensagem: 'Esta partida já está encerrada.' }];
  const pendencias: PendenciaPartida[] = [];
  if (!jogo.timeA.trim() || !jogo.timeB.trim()) {
    pendencias.push({ codigo: 'nomes', mensagem: 'Informe os nomes dos dois times.' });
  }
  if (jogo.atletasA.length !== JOGADORES_POR_TIME || jogo.atletasB.length !== JOGADORES_POR_TIME) {
    pendencias.push({ codigo: 'escalacao', mensagem: `Cada time deve ter 7 jogadores, incluindo o goleiro. ${jogo.timeA}: ${jogo.atletasA.length}/7; ${jogo.timeB}: ${jogo.atletasB.length}/7.` });
  }
  const todos = [...jogo.atletasA, ...jogo.atletasB];
  if (new Set(todos).size !== todos.length) {
    pendencias.push({ codigo: 'duplicidade', mensagem: 'Os dois times precisam reunir 14 jogadores diferentes, sem duplicidade.' });
  }
  for (const lado of ['A', 'B'] as const) {
    const atletas = lado === 'A' ? jogo.atletasA : jogo.atletasB;
    const goleiro = lado === 'A' ? jogo.goleiroA : jogo.goleiroB;
    const nome = lado === 'A' ? jogo.timeA : jogo.timeB;
    if (!goleiro || !atletas.includes(goleiro)) {
      pendencias.push({ codigo: `goleiro-${lado}`, mensagem: `Escolha o goleiro de ${nome || `Time ${lado}`} entre seus 7 jogadores.` });
    }
  }
  const golValido = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;
  const placarValido = golValido(jogo.golsA) && golValido(jogo.golsB);
  const autoresValidos = Object.entries(jogo.golsPorAtleta).every(([id, gols]) =>
    golValido(gols) && (gols === 0 || todos.includes(id)));
  if (!placarValido) {
    pendencias.push({ codigo: 'placar', mensagem: 'O placar deve conter números inteiros entre 0 e 99.' });
  }
  if (!autoresValidos) {
    pendencias.push({ codigo: 'autores', mensagem: 'Confira os gols individuais: use números inteiros entre 0 e 99 e somente atletas escalados neste jogo.' });
  }
  const somaA = golsAtribuidos(jogo, 'A');
  const somaB = golsAtribuidos(jogo, 'B');
  if (placarValido && autoresValidos) {
    if (somaA > jogo.golsA || somaB > jogo.golsB) {
      pendencias.push({ codigo: 'excesso', mensagem: 'A autoria dos gols ultrapassa o placar. Confira os lançamentos.' });
    } else if ((somaA < jogo.golsA || somaB < jogo.golsB) && !jogo.permitirGolsSemAutor) {
      pendencias.push({ codigo: 'sem-autoria', mensagem: 'Existem gols sem autor. Complete os lançamentos ou autorize expressamente gols sem autoria.' });
    }
  }
  return pendencias;
}

export function validarEncerramento(jogo: Partida): string | null {
  return pendenciasEncerramento(jogo)[0]?.mensagem ?? null;
}

/** Executada dentro da atualização do estado para conferir a versão atual do jogo. */
export function encerrarPartida(jogo: Partida): Partida {
  const problema = validarEncerramento(jogo);
  if (problema) throw new Error(problema);
  return { ...jogo, status: 'encerrada' };
}

/** Ajuste do placar sem apagar autoria individual e sem permitir resultados negativos. */
export function alterarPlacar(jogo: Partida, lado: Lado, delta: 1 | -1): Partida {
  if (jogo.status !== 'rascunho') throw new Error('Reabra a súmula para corrigir o placar.');
  const campo = lado === 'A' ? 'golsA' : 'golsB';
  const proximo = jogo[campo] + delta;
  if (proximo < 0 || proximo > 99) throw new Error('O placar deve ficar entre 0 e 99.');
  if (proximo < golsAtribuidos(jogo, lado)) {
    throw new Error('Retire primeiro um gol do atleta correspondente para diminuir o placar.');
  }
  return { ...jogo, [campo]: proximo };
}

export function lancarGol(jogo: Partida, lado: Lado, atletaId: string, delta: 1 | -1): Partida {
  return ajustarGol(jogo, atletaId, lado, delta);
}

/** Proíbe alterações expressas em partidas encerradas ou de outra rodada. */
export function atualizarPartidaDaRodada(rodada: Rodada, partidaId: string, atualizar: (jogo: Partida) => Partida): Rodada {
  const encontrada = rodada.jogos.find(j => j.id === partidaId);
  if (!encontrada) throw new Error('Partida não encontrada neste sábado.');
  if (encontrada.status !== 'rascunho') throw new Error('A partida está encerrada. Reabra a súmula para editar.');
  return { ...rodada, jogos: rodada.jogos.map(j => j.id === partidaId ? atualizar(j) : j) };
}

/** Reabertura explícita: preserva placar e autoria; só muda a situação da partida escolhida. */
export function reabrirPartidaDaRodada(rodada: Rodada, partidaId: string): Rodada {
  const encontrada = rodada.jogos.find(j => j.id === partidaId);
  if (!encontrada) throw new Error('Partida não encontrada neste sábado.');
  if (encontrada.status !== 'encerrada') throw new Error('Esta partida já está em edição.');
  return { ...rodada, jogos: rodada.jogos.map(j => j.id === partidaId ? { ...j, status: 'rascunho' } : j) };
}
