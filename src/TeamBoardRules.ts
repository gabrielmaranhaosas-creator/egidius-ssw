import type { DadosSSW, EquipeRodada } from './SSWStore';
import { atualizarRascunhosVinculados, validarEquipes } from './RoundRules';
import { JOGADORES_POR_TIME } from './TimeRules';

export function copiarEquipes(equipes: EquipeRodada[]): EquipeRodada[] {
  return equipes.map(e => ({ ...e, atletas: [...e.atletas] }));
}

/** Compara a formação sem depender da ordem das propriedades dos objetos. */
export function assinaturaEquipes(equipes: EquipeRodada[]): string {
  return JSON.stringify(equipes.map(e => [e.id, e.nome, e.atletas]));
}

export type RascunhoTimes = { equipes: EquipeRodada[]; origem: string; editado: boolean };

export function criarRascunhoTimes(salvas: EquipeRodada[], criarId: () => string): RascunhoTimes {
  return { origem: assinaturaEquipes(salvas), editado: false, equipes: salvas.length ? copiarEquipes(salvas) : [
    { id: criarId(), nome: 'Time Branco', atletas: [] },
    { id: criarId(), nome: 'Time Colorido', atletas: [] },
  ] };
}

/** Atualização externa só substitui o formulário quando não existem ajustes do usuário. */
export function reconciliarRascunhoTimes(rascunho: RascunhoTimes, salvas: EquipeRodada[], criarId: () => string): RascunhoTimes {
  if (rascunho.origem === assinaturaEquipes(salvas) ||
      rascunho.editado && assinaturaEquipes(rascunho.equipes) !== rascunho.origem) return rascunho;
  return criarRascunhoTimes(salvas, criarId);
}

export function resumoMontagem(equipes: EquipeRodada[], presentes: string[]) {
  const presencas = new Set(presentes);
  const escalados = new Set(equipes.flatMap(e => e.atletas));
  const disponiveis = [...presencas].filter(id => !escalados.has(id));
  const semPresenca = [...escalados].filter(id => !presencas.has(id));
  const completos = equipes.filter(e => e.atletas.length === JOGADORES_POR_TIME &&
    new Set(e.atletas).size === JOGADORES_POR_TIME && e.atletas.every(id => presencas.has(id))).length;
  return { disponiveis, semPresenca, completos,
    escalados: [...escalados].filter(id => presencas.has(id)).length };
}

/** Atribuição local: uma vaga por jogador, sem escrever no estado compartilhado. */
export function atribuirJogador(equipes: EquipeRodada[], presentes: string[], jogadorId: string, equipeId: string): EquipeRodada[] {
  if (equipeId && !presentes.includes(jogadorId)) throw new Error('Confirme a chegada deste jogador antes de escalá-lo.');
  const destino = equipes.find(e => e.id === equipeId);
  if (equipeId && !destino) throw new Error('O time escolhido não existe mais. Confira a formação.');
  if (destino?.atletas.includes(jogadorId)) return equipes;
  if (destino && destino.atletas.length >= JOGADORES_POR_TIME) {
    throw new Error(`${destino.nome} já tem 7 jogadores. Libere uma vaga antes de transferir outro jogador.`);
  }
  return equipes.map(e => ({ ...e, atletas: [...e.atletas.filter(id => id !== jogadorId),
    ...(e.id === equipeId ? [jogadorId] : [])] }));
}

export function proximoNomeTime(equipes: EquipeRodada[]): string {
  const nomes = new Set(equipes.map(e => e.nome.trim().toLocaleLowerCase('pt-BR')));
  let numero = 3;
  while (nomes.has(`time ${numero}`)) numero++;
  return `Time ${numero}`;
}

/** Confere a formação atual, a presença e o cadastro dentro da transação do store. */
export function salvarMontagem(dados: DadosSSW, rodadaId: string, origem: string, equipes: EquipeRodada[]): DadosSSW {
  const rodada = dados.rodadas.find(r => r.id === rodadaId);
  if (!rodada) throw new Error('O sábado não existe mais. Seus ajustes não foram gravados.');
  if (assinaturaEquipes(rodada.equipes) !== origem) {
    throw new Error('A formação salva mudou. Seus ajustes locais foram mantidos. Carregue a formação atual antes de salvar.');
  }
  if (equipes.length > 16) throw new Error('O limite é de 16 times por sábado.');
  const limpas = equipes.map(e => ({ ...e, nome: e.nome.trim(), atletas: [...e.atletas] }));
  const problema = validarEquipes(limpas, rodada.presencas);
  if (problema) throw new Error(problema);
  const cadastro = new Set(dados.jogadores.map(j => j.id));
  if (limpas.some(e => e.atletas.some(id => !cadastro.has(id)))) {
    throw new Error('Um jogador não está mais no cadastro. Confira a lista antes de salvar os times.');
  }
  const atualizada = atualizarRascunhosVinculados(rodada, limpas);
  return { ...dados, rodadas: dados.rodadas.map(r => r.id === rodadaId ? atualizada : r) };
}

export function filtrarDistribuicao<T extends { id: string; nome: string }>(jogadores: T[], equipes: EquipeRodada[], busca: string, filtro: string): T[] {
  const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const termo = normalizar(busca);
  const escalados = new Set(equipes.flatMap(e => e.atletas));
  const time = filtro.startsWith('time:') ? equipes.find(e => e.id === filtro.slice(5)) : undefined;
  return jogadores.filter(j => normalizar(j.nome).includes(termo) &&
    (filtro === 'disponiveis' ? !escalados.has(j.id) : time ? time.atletas.includes(j.id) : true));
}
