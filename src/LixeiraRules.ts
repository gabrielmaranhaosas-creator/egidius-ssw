/** EGIDIUS 09E: lixeira sincronizada no estado versionado do SQLite. */
import type { DadosSSW, ItemLixeira, Partida, Rodada } from './SSWStore';

export function excluirRascunhosParaLixeira(
  dados: DadosSSW, rodadaId: string, ids: string[],
  idFactory: () => string = () => crypto.randomUUID(),
  agora: string = new Date().toISOString(),
): DadosSSW {
  const rodada = dados.rodadas.find(r => r.id === rodadaId);
  if (!rodada) throw new Error('O sábado selecionado não existe.');
  const escolhidos = new Set(ids);
  if (!escolhidos.size || escolhidos.size !== ids.length) throw new Error('Selecione jogos diferentes para excluir.');
  const jogos = rodada.jogos.filter(j => escolhidos.has(j.id));
  if (jogos.length !== ids.length) throw new Error('Um dos jogos já foi alterado ou excluído. Atualize a tela.');
  if (jogos.some(j => j.status !== 'rascunho')) throw new Error('Jogos encerrados não podem ser enviados à Lixeira.');
  if ((dados.lixeira?.length ?? 0) + jogos.length > 200) throw new Error('A Lixeira atingiu o limite de segurança de 200 jogos. Exporte um backup e solicite manutenção.');
  const novos: ItemLixeira[] = jogos.map(jogo => ({
    id: idFactory(), rodadaId, excluidoEm: agora,
    jogo: JSON.parse(JSON.stringify(jogo)) as Partida,
  }));
  if (novos.some(x => !x.id) || new Set(novos.map(x=>x.id)).size !== novos.length ||
      novos.some(x => dados.lixeira?.some(y=>y.id===x.id))) throw new Error('Identificador da Lixeira duplicado. Tente novamente.');
  return {
    ...dados,
    rodadas: dados.rodadas.map(r => r.id === rodadaId ? {...r, jogos: r.jogos.filter(j => !escolhidos.has(j.id))} : r),
    lixeira: [...(dados.lixeira ?? []), ...novos],
  };
}

export function restaurarDaLixeira(dados: DadosSSW, itemId: string): DadosSSW {
  const item = dados.lixeira?.find(x => x.id === itemId);
  if (!item) throw new Error('O jogo não está mais na Lixeira. Atualize a tela.');
  const rodada = dados.rodadas.find(r => r.id === item.rodadaId);
  if (!rodada) throw new Error('Este sábado foi removido. A restauração foi bloqueada.');
  const jogo = item.jogo;
  if (jogo.status !== 'rascunho') throw new Error('A Lixeira só pode restaurar rascunhos.');
  if (dados.rodadas.some(r => r.jogos.some(j => j.id === jogo.id))) throw new Error('Já existe uma partida com este identificador.');
  const jogadorIds = new Set(dados.jogadores.map(j => j.id));
  if ([...jogo.atletasA, ...jogo.atletasB].some(id => !jogadorIds.has(id)))
    throw new Error('O cadastro de um jogador mudou. A restauração foi bloqueada para proteger a súmula.');
  for (const [equipeId, atletas] of [[jogo.equipeIdA,jogo.atletasA],[jogo.equipeIdB,jogo.atletasB]] as const) {
    if (!equipeId) continue;
    const equipe = rodada.equipes.find(e => e.id === equipeId);
    if (!equipe || (jogo.vinculoFormacao && JSON.stringify(equipe.atletas) !== JSON.stringify(atletas)))
      throw new Error('A escalação do sábado mudou. Confira os times antes de restaurar esta partida.');
  }
  const numeros = new Set(rodada.jogos.map(j => j.numero));
  const numero = numeros.has(jogo.numero) ? Math.max(0,...numeros)+1 : jogo.numero;
  const restaurado: Partida = {...jogo, numero, golsPorAtleta:{...jogo.golsPorAtleta},
    atletasA:[...jogo.atletasA], atletasB:[...jogo.atletasB]};
  return {
    ...dados,
    rodadas: dados.rodadas.map((r:Rodada) => r.id === rodada.id ? {...r, jogos:[...r.jogos,restaurado]} : r),
    lixeira: (dados.lixeira ?? []).filter(x => x.id !== itemId),
  };
}
