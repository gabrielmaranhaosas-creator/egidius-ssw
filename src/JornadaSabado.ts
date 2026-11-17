import type { DadosSSW, Rodada } from './SSWStore';
import { statusRodada } from './CampoRules';

/** Orientação de uso; consultar a jornada nunca cria ou modifica registros. */
export function jornadaSabado(rodada: Rodada | undefined, dados: DadosSSW) {
  const resumo = statusRodada(rodada, dados.jogadores);
  const emEdicao = [...(rodada?.jogos ?? [])].filter(j => j.status !== 'encerrada').sort((a,b) => a.numero-b.numero)[0];
  if (!rodada) return { etapa: 0, titulo: 'Seu sábado começa aqui.', texto: 'Crie a data, registre as chegadas e escolha os times do seu jeito.', acao: 'Criar o primeiro sábado', tipo: 'rodada' as const, destino: 'rodadas' as const };
  if (emEdicao) return { etapa: 2, titulo: 'Tem jogo para concluir.', texto: `O jogo ${emEdicao.numero} está em edição. Confira os goleiros, o placar e os gols antes de encerrar.`, acao: `Continuar jogo ${emEdicao.numero}`, tipo: 'sumula' as const, jogoId: emEdicao.id };
  if (!dados.jogadores.length) return { etapa: 0, titulo: 'Vamos conhecer o elenco.', texto: 'Cadastre os jogadores para registrar quem chegou. O cadastro pode crescer a qualquer momento.', acao: 'Cadastrar jogadores', tipo: 'rodada' as const, destino: 'cadastro' as const };
  if (resumo.presentes < 14 && !resumo.confrontoPronto) return { etapa: 0, titulo: resumo.presentes ? 'A turma está chegando.' : 'Quem já está no campo?', texto: `${resumo.presentes} presenças registradas. Para dois times de 7, faltam ${14-resumo.presentes} ${14-resumo.presentes===1?'jogador':'jogadores'}. Você já pode começar a montar.`, acao: 'Registrar chegadas', tipo: 'chegadas' as const };
  const disponiveis=rodada.presencas.filter(id=>!rodada.indisponiveis?.includes(id)).length;
  if(disponiveis<14) return { etapa: 0, titulo: 'Quem pode seguir no jogo?', texto: `${disponiveis} jogadores estão disponíveis. Confira quem saiu ou voltou antes de preparar a próxima partida.`, acao: 'Revisar disponibilidade', tipo: 'rodada' as const, destino: 'presencas' as const };
  if (!resumo.confrontoPronto) return { etapa: 1, titulo: 'Os times são do seu jeito.', texto: 'Escolha os jogadores de cada time. Complete duas formações de 7 para começar a partida.', acao: 'Montar times manualmente', tipo: 'rodada' as const, destino: 'times' as const };
  return { etapa: 2, titulo: resumo.jogos ? 'Prontos para mais um jogo?' : 'Pode chamar para o jogo.', texto: resumo.jogos ? `${resumo.encerrados} ${resumo.encerrados===1?'partida encerrada':'partidas encerradas'}. Os resultados estão preservados; confira o próximo confronto.` : 'Os times estão completos. Escolha o confronto e registre os goleiros na súmula.', acao: resumo.jogos ? 'Preparar próxima partida' : 'Preparar primeira partida', tipo: 'sumula' as const, jogoId: '__novo_jogo__' };
}
