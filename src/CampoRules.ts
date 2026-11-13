import type { DadosSSW, Jogador, Rodada, Partida } from './SSWStore';
import { atletaEmUso } from './QuickActions';
import { JOGADORES_POR_TIME, validarDoisTimes } from './TimeRules';

export type CampoDestino = 'rodadas' | 'cadastro' | 'presencas' | 'times' | 'confronto' | 'partidas';

/** Escolhe uma rodada existente sem criar registros ou alterar datas históricas. */
export function rodadaCentral(dados: DadosSSW, preferida = ''): Rodada | undefined {
  const preferidaEncontrada = dados.rodadas.find(r => r.id === preferida);
  return preferidaEncontrada ?? [...dados.rodadas].sort((a, b) => b.data.localeCompare(a.data))[0];
}

export function statusRodada(rodada: Rodada | undefined, jogadores?: Jogador[]) {
  const presentes = rodada?.presencas.length ?? 0;
  const equipes = rodada?.equipes.filter(e => e.atletas.length > 0).length ?? 0;
  const jogos = rodada?.jogos.length ?? 0;
  const encerrados = rodada?.jogos.filter(j => j.status === 'encerrada').length ?? 0;
  const rascunhos = jogos - encerrados;
  const prontos = (rodada?.equipes ?? []).filter(e =>
    e.atletas.length === JOGADORES_POR_TIME && new Set(e.atletas).size === JOGADORES_POR_TIME &&
    e.atletas.every(id => rodada?.presencas.includes(id) && !rodada.indisponiveis?.includes(id) && (!jogadores || jogadores.some(j => j.id === id))));
  const timesCompletos = prontos.length;
  const confrontoPronto = prontos.some((a, i) => prontos.slice(i + 1).some(b => !validarDoisTimes(a, b)));
  let passo: string;
  let destino: CampoDestino;
  if (!rodada) { passo = 'Criar o sábado'; destino = 'rodadas'; }
  else if (rascunhos > 0) { passo = 'Conferir e encerrar súmulas'; destino = 'partidas'; }
  else if (jogadores?.length === 0) { passo = 'Cadastrar jogadores'; destino = 'cadastro'; }
  else if (presentes === 0) { passo = 'Registrar chegadas'; destino = 'presencas'; }
  else if (!confrontoPronto) { passo = 'Completar dois times de 7 jogadores'; destino = 'times'; }
  else { passo = jogos === 0 ? 'Criar a primeira súmula' : 'Preparar o próximo confronto'; destino = 'confronto'; }
  return { presentes, equipes, timesCompletos, confrontoPronto, jogos, encerrados, rascunhos, passo, destino };
}

/** Lista a formação na ordem das chegadas, independentemente da ordem do cadastro. */
export function jogadoresPorChegada(rodada: Rodada, jogadores: Jogador[]): Jogador[] {
  const cadastro = new Map(jogadores.map(j => [j.id, j]));
  return [...new Set(rodada.presencas)].filter(id=>!rodada.indisponiveis?.includes(id)).map(id => cadastro.get(id)).filter((j): j is Jogador => j !== undefined);
}

/** Check-in exclusivamente aditivo, preservando a ordem cronológica das chegadas. */
export function checkInCentral(dados: DadosSSW, rodadaId: string, jogadorId: string): DadosSSW {
  if (!dados.jogadores.some(j => j.id === jogadorId)) throw new Error('Atleta não encontrado no cadastro.');
  if (!dados.rodadas.some(r => r.id === rodadaId)) throw new Error('Rodada inexistente.');
  return {
    ...dados,
    rodadas: dados.rodadas.map(r => {
      if (r.id !== rodadaId || r.presencas.includes(jogadorId)) return r;
      return { ...r, presencas: [...r.presencas, jogadorId] };
    }),
  };
}

export function ultimosJogos(rodada: Rodada | undefined): Partida[] {
  return [...(rodada?.jogos ?? [])].sort((a,b) => b.numero - a.numero);
}

/** Corrige um check-in indevido sem modificar súmulas, times nem a ordem dos demais. */
export function retirarChegada(dados: DadosSSW, rodadaId: string, jogadorId: string): DadosSSW {
  const rodada = dados.rodadas.find(r => r.id === rodadaId);
  if (!rodada) throw new Error('Sábado não encontrado.');
  if (!dados.jogadores.some(j => j.id === jogadorId)) throw new Error('Jogador não encontrado.');
  if (!rodada.presencas.includes(jogadorId)) return dados;
  if (atletaEmUso(rodada, jogadorId)) {
    throw new Error('Este jogador já participa de um time ou jogo. Ajuste a escalação antes de retirar a presença.');
  }
  return { ...dados, rodadas: dados.rodadas.map(r => r.id === rodadaId
    ? { ...r, presencas: r.presencas.filter(id => id !== jogadorId),indisponiveis:r.indisponiveis?.filter(id=>id!==jogadorId) } : r) };
}
