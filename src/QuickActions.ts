import type { DadosSSW, Jogador, Partida, Rodada } from './SSWStore';

/** A ordem de chegada já registrada nunca é reordenada. */
export function marcarTodos(rodada: Rodada, jogadores: Jogador[]): Rodada {
  const presentes = new Set(rodada.presencas);
  const novos = jogadores.map(j => j.id).filter(id => !presentes.has(id));
  return { ...rodada, presencas: [...rodada.presencas, ...novos] };
}
export function atletaEmUso(rodada: Rodada, id: string): boolean {
  return rodada.equipes.some(e => e.atletas.includes(id)) || rodada.jogos.some(j =>
    j.atletasA.includes(id) || j.atletasB.includes(id) || j.goleiroA === id || j.goleiroB === id ||
    Object.prototype.hasOwnProperty.call(j.golsPorAtleta, id));
}
/** Apenas quem não está escalado pode perder o check-in. */
export function limparPresencasLivres(rodada: Rodada): Rodada {
  return { ...rodada, presencas: rodada.presencas.filter(id => atletaEmUso(rodada, id)) };
}
export function podeExcluirAtleta(dados: DadosSSW, id: string): boolean {
  return dados.rodadas.every(r => !r.presencas.includes(id) && !atletaEmUso(r, id));
}
/** Protege partidas encerradas e faz a exclusão atômica de rascunhos selecionados. */
export function excluirRascunhos(rodada: Rodada, ids: string[]): Rodada {
  const unicos = new Set(ids);
  if (!unicos.size) return rodada;
  if (rodada.jogos.some(j => unicos.has(j.id) && j.status === 'encerrada')) {
    throw new Error('Há jogo encerrado na seleção. Reabra-o individualmente antes de excluir.');
  }
  return { ...rodada, jogos: rodada.jogos.filter(j => !unicos.has(j.id)) };
}
/** Repete escalação e confronto, mas sempre inicia com placar e gols zerados. */
export function duplicarJogo(j: Partida, id: string, numero: number): Partida {
  return { ...j, id, numero, status:'rascunho', golsA:0, golsB:0,
    observacoes:'', golsPorAtleta:{}, goleiroA:null, goleiroB:null, permitirGolsSemAutor:false,
    atletasA:[...j.atletasA], atletasB:[...j.atletasB] };
}
/** Um toque de gol registra autoria e completa o placar somente se necessário. */
export function ajustarGol(j: Partida, id: string, lado:'A'|'B', delta:1|-1): Partida {
  if (j.status === 'encerrada') throw new Error('Reabra a súmula antes de alterar gols.');
  const atletas = lado === 'A' ? j.atletasA : j.atletasB;
  if (!atletas.includes(id)) throw new Error('Este atleta não participa da equipe escolhida.');
  const campo = lado === 'A' ? 'golsA' : 'golsB';
  const soma = atletas.reduce((s,a) => s + (j.golsPorAtleta[a] ?? 0), 0);
  const atual = j.golsPorAtleta[id] ?? 0;
  const proximo = Math.max(0, atual + delta);
  if (proximo === atual) return j;
  const somaNova = soma - atual + proximo;
  if (somaNova > 99) throw new Error('O limite do placar é 99 gols.');
  const placar = j[campo];
  const placarNovo = delta === 1 ? Math.max(placar, somaNova)
    : soma === placar ? Math.max(0, placar - 1) : placar;
  return { ...j, [campo]:placarNovo,
    golsPorAtleta: { ...j.golsPorAtleta, [id]:proximo } };
}
