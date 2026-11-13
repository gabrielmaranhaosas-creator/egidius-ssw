import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ChangeEvent } from 'react';
import {
  CalendarDays, Check, CheckCircle2, ClipboardList, Download, Film, Image as ImageIcon,
  ChevronRight, LockKeyhole, Plus, Save, Shield, Trash2, UsersRound, Undo2, Redo2, Copy, CheckSquare, Square, Minus, X,
} from 'lucide-react';
import {
  atualizarDados, dataFormatada, ehSabado, exportarBackup, novoId, proximoSabado,
  historicoAcoes, desfazerAcao, refazerAcao,
  situacaoArmazenamento, useDadosSSW,
} from './SSWStore';
import type { DadosSSW, Partida } from './SSWStore';
import { TeamBoard } from './TeamBoard';
import { aplicarEquipes, confrontoSugerido, jogoDasEquipes } from './RoundRules';
import { JOGADORES_POR_TIME, validarDoisTimes } from './TimeRules';
import { atualizarPartidaDaRodada, encerrarPartida, reabrirPartidaDaRodada } from './ExpressRules';
import { ConferenciaPartida } from './components/ConferenciaPartida';
import { ajustarGol, atletaEmUso, podeExcluirAtleta, duplicarJogo, limparPresencasLivres, marcarTodos } from './QuickActions';
import { excluirRascunhosParaLixeira, restaurarDaLixeira } from './LixeiraRules';
import { cadastrarJogador, normalizarNomeCadastro } from './CadastroRules';
import { statusRodada } from './CampoRules';
import type { CampoDestino } from './CampoRules';
import './styles/ssw-trash-09e.css';
import './styles/ssw-sabado-completo.css';
import { podeSairDaMontagem } from './MontagemDrafts';
import { mostrarConferencia } from './components/ConferenciaPartida';

function atualizarRodada(dados: DadosSSW, id: string, aplicar: (jogos: DadosSSW['rodadas'][number]) => DadosSSW['rodadas'][number]): DadosSSW {
  return { ...dados, rodadas: dados.rodadas.map(rodada => rodada.id === id ? aplicar(rodada) : rodada) };
}
function somaGols(jogo: Partida, side: 'A' | 'B'): number {
  return (side === 'A' ? jogo.atletasA : jogo.atletasB).reduce((n, id) => n + (jogo.golsPorAtleta[id] ?? 0), 0);
}

type Etapa = 'presencas' | 'times' | 'partidas';
const etapaDestino = (destino?: CampoDestino): Etapa => destino === 'times' ? 'times' : destino === 'confronto' || destino === 'partidas' ? 'partidas' : 'presencas';
export function RoundsManager({ initialRoundId, initialGameId, initialStage, onRoundChange, abrirExpressa }: { initialRoundId?: string; initialGameId?: string; initialStage?: CampoDestino; onRoundChange?: (id: string) => void; abrirExpressa?: (id: string, jogo?: string) => void }) {
  const dados = useDadosSSW();
  const [etapa, setEtapa] = useState<Etapa>(() => etapaDestino(initialStage));
  useEffect(() => {
    if (initialRoundId) setRodadaSelecionada(initialRoundId);
    setEtapa(etapaDestino(initialStage));
    if (initialGameId) setJogoAberto(initialGameId);
  }, [initialRoundId, initialStage, initialGameId]);
  const [dataDesejada, setDataDesejada] = useState(proximoSabado);
  const [rodadaSelecionada, setRodadaSelecionada] = useState(initialRoundId ?? '');
  const [nomeJogador, setNomeJogador] = useState('');
  const [marcarChegadaNoCadastro, setMarcarChegadaNoCadastro] = useState(false);
  const [avisoCadastro, setAvisoCadastro] = useState('');
  const [erroCadastro, setErroCadastro] = useState('');
  const [novaEscalacao, setNovaEscalacao] = useState<Record<string, string>>({});
  const [confrontos, setConfrontos] = useState<Record<string, {a:string; b:string}>>({});
  const [aviso, setAviso] = useState('');
  const [selecionando, setSelecionando] = useState(false);
  const [jogosSelecionados, setJogosSelecionados] = useState<string[]>([]);
  const [jogoAberto, setJogoAberto] = useState<string | null>(initialGameId ?? null);
  const [atletaParaExcluir, setAtletaParaExcluir] = useState('');
  const [erro, setErro] = useState('');
  const armazenamento = situacaoArmazenamento();
  const historico = historicoAcoes();
  const rodadas = [...dados.rodadas].sort((a, b) => b.data.localeCompare(a.data));
  const rodada = rodadas.find(r => r.id === rodadaSelecionada) ?? rodadas[0];
  const progresso = statusRodada(rodada, dados.jogadores);
  useEffect(() => {
    setMarcarChegadaNoCadastro(false);
    setAvisoCadastro('');
    setErroCadastro('');
  }, [rodada?.id]);
  const rascunhos = rodada?.jogos.filter(j => j.status === 'rascunho') ?? [];
  const itensLixeira = (dados.lixeira ?? []).filter(item => item.rodadaId === rodada?.id)
    .slice().sort((a,b) => b.excluidoEm.localeCompare(a.excluidoEm));
  const selecionadosValidos = rascunhos.filter(j => jogosSelecionados.includes(j.id));
  const nomePorId = new Map(dados.jogadores.map(j => [j.id, j.nome]));
  const confrontoPadrao = rodada ? confrontoSugerido(rodada) : {a:'',b:''};
  const escolha = rodada ? confrontos[rodada.id] ?? confrontoPadrao : confrontoPadrao;
  const equipeEscolhidaA = rodada?.equipes.find(e => e.id === escolha.a) ?? rodada?.equipes[0];
  const equipeEscolhidaB = rodada?.equipes.find(e => e.id === escolha.b) ?? rodada?.equipes.find(e => e.id !== equipeEscolhidaA?.id);
  useEffect(() => {
    function atalhos(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      try {
        const descricao = event.shiftKey ? refazerAcao() : desfazerAcao();
        setAviso(`${event.shiftKey ? 'Refeito' : 'Desfeito'}: ${descricao}.`); setErro('');
      } catch (error) { setErro(error instanceof Error ? error.message : 'Histórico indisponível.'); }
    }
    window.addEventListener('keydown', atalhos);
    return () => window.removeEventListener('keydown', atalhos);
  }, []);
  function mudarRodada(id:string) {
    if (!podeSairDaMontagem()) return;
    onRoundChange?.(id); setEtapa('presencas');
    setRodadaSelecionada(id); setAviso(''); setJogosSelecionados([]); setSelecionando(false); setJogoAberto(null);
  }
  function executarHistorico(refazer:boolean) {
    salvar(() => {
      const descricao = refazer ? refazerAcao() : desfazerAcao();
      setAviso(`${refazer ? 'Refeito' : 'Desfeito'}: ${descricao}.`);
      setJogosSelecionados([]);
    });
  }
  function marcarTodosNoSabado() {
    if (!rodada || !dados.jogadores.length) return;
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id, r => marcarTodos(r,d.jogadores)), 'check-in de todos os atletas'))) {
      setAviso('Todos os atletas cadastrados estão presentes. Os novos foram adicionados ao final da ordem de chegada.');
    }
  }
  function limparLivres() {
    if (!rodada) return;
    const quantidade = rodada.presencas.filter(id => !atletaEmUso(rodada,id)).length;
    if (!quantidade) { setAviso('Nenhuma presença livre para remover: os presentes estão vinculados a times ou partidas.'); return; }
    if (!window.confirm(`Remover o check-in de ${quantidade} atleta(s) não escalado(s)? A ação poderá ser desfeita nesta aba.`)) return;
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id, limparPresencasLivres), 'limpeza de presenças livres'))) {
      setAviso(`${quantidade} check-in(s) removido(s); atletas escalados foram preservados.`);
    }
  }
  function excluirAtleta() {
    const j = dados.jogadores.find(a => a.id === atletaParaExcluir);
    if (!j) return;
    if (!podeExcluirAtleta(dados,j.id)) { setErro('Não é possível excluir um atleta com presença, equipe ou súmula registrada.');return; }
    if (!window.confirm(`Excluir o cadastro de ${j.nome}? A exclusão poderá ser desfeita nesta aba.`)) return;
    if (salvar(() => atualizarDados(d => ({ ...d,jogadores:d.jogadores.filter(a=>a.id!==j.id) }), 'exclusão de atleta sem histórico'))) {
      setAtletaParaExcluir(''); setAviso(`Cadastro de ${j.nome} excluído.`);
    }
  }
  function selecionarTodosRascunhos() { setJogosSelecionados(rascunhos.map(j=>j.id)); }
  function alternarJogoSelecionado(id:string) { setJogosSelecionados(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]); }
  function excluirSelecionados() {
    if (!rodada || !selecionadosValidos.length) return;
    const ids = selecionadosValidos.map(j=>j.id);
    if (!window.confirm(`Excluir ${ids.length} súmula(s) em rascunho deste sábado? Partidas encerradas não serão excluídas. Você poderá restaurar esses rascunhos na Lixeira deste sábado.`)) return;
    if (salvar(() => atualizarDados(d => excluirRascunhosParaLixeira(d,rodada.id,ids),`envio de ${ids.length} rascunho(s) à lixeira`))) {
      setJogosSelecionados([]);setSelecionando(false);
      setAviso(`${ids.length} rascunho(s) enviado(s) à Lixeira. Para recuperar depois, abra a Lixeira deste sábado.`);
    }
  }
  function duplicar(game:Partida) {
    if (!rodada) return;
    if (game.atletasA.length !== 7 || game.atletasB.length !== 7 ||
        new Set([...game.atletasA, ...game.atletasB]).size !== 14) {
      setErro('Para duplicar um confronto, os dois times precisam ter 7 jogadores cada. As súmulas antigas ficam preservadas.');
      return;
    }
    const numero = Math.max(0,...rodada.jogos.map(j=>j.numero))+1;
    const nova = duplicarJogo(game,novoId(),numero);
    if (salvar(()=>atualizarDados(d => atualizarRodada(d,rodada.id,r=>({...r,jogos:[...r.jogos,nova]})),`duplicação do Jogo ${game.numero}`))) {
      setJogoAberto(nova.id);
      setAviso(`Jogo ${String(numero).padStart(2,'0')} criado com os mesmos atletas e times, mas sem resultados.`);
    }
  }
  function ajustarGolUmToque(game:Partida,side:'A'|'B',id:string,delta:1|-1) {
    if (!rodada || game.status!=='rascunho') return;
    const atleta = nomePorId.get(id) ?? 'Atleta';
    if (salvar(() => atualizarDados(d => atualizarRodada(d,rodada.id,r=>({
      ...r,jogos:r.jogos.map(j=>j.id===game.id && j.status==='rascunho' ? ajustarGol(j,id,side,delta) : j),
    })),`${delta>0?'gol registrado':'gol corrigido'} — ${atleta}`))) {
      setAviso(`${delta>0?'Gol lançado':'Gol corrigido'}: ${atleta} · Jogo ${game.numero}.`);
    }
  }
  function selecionarEquipe(lado:'a'|'b', id:string) {
    if (!rodada) return;
    setConfrontos(prev => ({ ...prev, [rodada.id]: { ...escolha, [lado]:id } }));
  }

  function salvar(acao: () => void): boolean {
    try { acao(); setErro(''); return true; } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível executar esta operação.');
      return false;
    }
  }
  function criarRodada() {
    if (!ehSabado(dataDesejada)) { setErro('A data escolhida não é um sábado.'); return; }
    const existente = dados.rodadas.find(r => r.data === dataDesejada);
    if (existente) {
      mudarRodada(existente.id);
      setAviso('Sábado existente selecionado. Nenhum registro foi duplicado.');
      setErro('');
      return;
    }
    const id = novoId();
    if (salvar(() => atualizarDados(d => ({ ...d, rodadas: [...d.rodadas, { id, data: dataDesejada, presencas: [], equipes: [], jogos: [] }] }), 'criação de sábado'))) {
      mudarRodada(id);
      setAviso(`Rodada de ${dataFormatada(dataDesejada)} criada. A sincronização está indicada na barra superior.`);
    }
  }
  function cadastrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAvisoCadastro(''); setErroCadastro('');
    try {
      if (marcarChegadaNoCadastro && !rodada) throw new Error('Crie ou selecione um sábado antes de marcar a chegada.');
      const nome = normalizarNomeCadastro(nomeJogador);
      const id = novoId();
      atualizarDados(d => cadastrarJogador(d, nome, id, marcarChegadaNoCadastro ? rodada?.id : undefined),
        marcarChegadaNoCadastro ? 'cadastro e chegada do jogador' : 'cadastro de jogador');
      setNomeJogador(''); setMarcarChegadaNoCadastro(false); setErro('');
      setAvisoCadastro(`${nome} cadastrado${marcarChegadaNoCadastro && rodada ? ` e com chegada registrada em ${dataFormatada(rodada.data)}` : ', sem marcar presença'}. Confira “Salvo no servidor”.`);
    } catch (error) {
      setErroCadastro(error instanceof Error ? error.message : 'Não foi possível cadastrar o jogador.');
    }
  }
  function irParaEtapa(destino: CampoDestino) {
    setEtapa(etapaDestino(destino));
    window.requestAnimationFrame(() => {
    const ids: Record<CampoDestino, string> = {
      rodadas: 'rounds-title', cadastro: 'eg-cadastro', presencas: 'eg-checkin',
      times: 'eg-team-board', confronto: 'eg-next-game', partidas: 'eg-game-list',
    };
    const target = document.getElementById(ids[destino]);
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (destino === 'cadastro') target?.querySelector<HTMLInputElement>('#ssw-player-name')?.focus({ preventScroll: true });
    });
  }
  function alternarPresenca(id: string) {
    if (!rodada) { setErro('Crie ou selecione uma rodada antes do check-in.'); return; }
    const presente = rodada.presencas.includes(id);
    const escalado = rodada.jogos.some(j => j.atletasA.includes(id) || j.atletasB.includes(id)) ||
      rodada.equipes.some(e => e.atletas.includes(id));
    if (presente && escalado) {
      setErro('Esse atleta está escalado no sábado ou em uma súmula. Remova-o da formação e das partidas correspondentes antes de desfazer o check-in.'); return;
    }
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id, r => ({ ...r,
      presencas: presente ? r.presencas.filter(x => x !== id) : [...r.presencas, id],
    })), presente ? 'check-in removido' : 'check-in realizado'))) setAviso(presente ? 'Check-in desfeito.' : 'Check-in realizado; a ordem de chegada foi registrada.');
  }
  function criarJogo() {
    if (!rodada) return;
    const a = equipeEscolhidaA, b = equipeEscolhidaB;
    if (!a || !b || rodada.equipes.length < 2) { setErro('Salve pelo menos dois times antes de criar a súmula.'); return; }
    if (a.id === b.id) { setErro('Selecione dois times diferentes para o confronto.'); return; }
    const validacao = validarDoisTimes(a, b);
    if (validacao) { setErro(validacao); document.getElementById('eg-next-game')?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const numero = Math.max(0, ...rodada.jogos.map(j => j.numero)) + 1;
    const partida = jogoDasEquipes(numero, novoId(), a, b);
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id, r => ({ ...r, jogos: [...r.jogos, partida] })), 'criação de súmula'))) {
      setConfrontos(prev => ({ ...prev, [rodada.id]: { a:a.id, b:b.id } }));
      setJogoAberto(partida.id);
      setAviso(`Jogo ${String(numero).padStart(2,'0')} criado! Você já pode editar a súmula abaixo.`);
      abrirEditor(partida.id);
    }
  }
  function vincularJogo(game: Partida) {
    if (!rodada || game.status !== 'rascunho') return;
    const a = equipeEscolhidaA, b = equipeEscolhidaB;
    if (!a || !b || a.id === b.id) { setErro('Selecione dois times diferentes no painel Próximo confronto.'); return; }
    const alerta = `Vincular o Jogo ${game.numero} a ${a.nome} × ${b.nome}? O placar e as observações serão preservados. A escalação será substituída; gols de atletas removidos ou transferidos de lado serão descartados. Exporte backup antes.`;
    if (!window.confirm(alerta)) return;
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id, r => ({
      ...r, jogos: r.jogos.map(j => j.id === game.id && j.status === 'rascunho'
        ? aplicarEquipes(j, a, b) : j),
    })), 'vinculação de escalação'))) setAviso(`Jogo ${String(game.numero).padStart(2,'0')} associado a ${a.nome} × ${b.nome}.`);
  }
  function modificarJogo(id: string, fn: (jogo: Partida) => Partida, descricaoHistorico?:string): boolean {
    if (!rodada) return false;
    return salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id,
      r => atualizarPartidaDaRodada(r, id, fn)), descricaoHistorico));
  }
  function alterarGoleiro(id: string, side: 'A' | 'B', atleta: string) {
    modificarJogo(id, jogo => ({ ...jogo, [side === 'A' ? 'goleiroA' : 'goleiroB']: atleta || null }));
  }
  function adicionarAtleta(game: Partida, side: 'A' | 'B') {
    const chave = `${game.id}-${side}`;
    const id = novaEscalacao[chave];
    if (game.vinculoFormacao) { setErro('Esse jogo segue os times fixos. Ajuste a formação do sábado, se ainda estiver liberada.'); return; }
    if ((side === 'A' ? game.atletasA : game.atletasB).length >= JOGADORES_POR_TIME) {
      setErro('Este time já tem 7 jogadores, incluindo o goleiro.'); return;
    }
    if (!rodada || !id || !rodada.presencas.includes(id) || game.atletasA.includes(id) || game.atletasB.includes(id)) {
      setErro('Selecione um atleta presente e ainda não escalado neste jogo.'); return;
    }
    modificarJogo(game.id, j => ({ ...j, [side === 'A' ? 'atletasA' : 'atletasB']: [...(side === 'A' ? j.atletasA : j.atletasB), id] }));
    setNovaEscalacao(prev => ({ ...prev, [chave]: '' }));
  }
  function removerAtleta(game: Partida, side: 'A' | 'B', id: string) {
    if (game.vinculoFormacao) { setErro('Este jogo usa a formação fixa da rodada.'); return; }
    modificarJogo(game.id, j => {
      const golsPorAtleta = { ...j.golsPorAtleta };
      delete golsPorAtleta[id];
      return {
        ...j, [side === 'A' ? 'atletasA' : 'atletasB']: (side === 'A' ? j.atletasA : j.atletasB).filter(x => x !== id),
        golsPorAtleta, goleiroA: j.goleiroA === id ? null : j.goleiroA,
        goleiroB: j.goleiroB === id ? null : j.goleiroB,
      };
    });
  }
  function encerrar(game: Partida) {
    if (mostrarConferencia(game)) return;
    if (!window.confirm(`Encerrar o Jogo ${String(game.numero).padStart(2,'0')} (${game.timeA} ${game.golsA} × ${game.golsB} ${game.timeB})? Os rankings serão atualizados.`)) return;
    if (modificarJogo(game.id, encerrarPartida, 'encerramento do jogo')) {
      setAviso(`Jogo ${String(game.numero).padStart(2, '0')} encerrado. Pontos e estatísticas recalculados.`);
    }
  }
  function reabrir(game: Partida) {
    if (!rodada || !window.confirm('Reabrir esta súmula? Os rankings serão recalculados enquanto o jogo estiver em rascunho.')) return;
    if (salvar(() => atualizarDados(d => atualizarRodada(d, rodada.id,
      r => reabrirPartidaDaRodada(r, game.id)), 'reabertura de súmula'))) setAviso(`Jogo ${String(game.numero).padStart(2, '0')} reaberto para edição.`);
  }
  function excluir(game: Partida) {
    if (!rodada || game.status!=='rascunho') return;
    const avisoExclusao = `Excluir Jogo ${String(game.numero).padStart(2,'0')} (${game.timeA} ${game.golsA} × ${game.golsB} ${game.timeB})?\n\nSomente este rascunho será retirado. O jogo ficará na Lixeira e poderá ser restaurado depois.`;
    if (!window.confirm(avisoExclusao)) return;
    if (salvar(() => atualizarDados(d => excluirRascunhosParaLixeira(d,rodada.id,[game.id]),`envio do Jogo ${game.numero} à lixeira`))) {
      setJogoAberto(atual => atual === game.id ? null : atual);
      setAviso(`Jogo ${game.numero} enviado à Lixeira. Você poderá restaurá-lo depois.`);
    }
  }
  function restaurarJogo(id:string) {
    const item = itensLixeira.find(arquivo => arquivo.id === id);
    if (!item || !rodada) return;
    if (salvar(() => atualizarDados(d => restaurarDaLixeira(d,id),`restauração do Jogo ${item.jogo.numero}`))) {
      setJogoAberto(item.jogo.id);
      setAviso(`Jogo restaurado! Confira a súmula e aguarde “Salvo no servidor” antes de sair.`);
    }
  }
  function abrirEditor(id: string) {
    setJogoAberto(id);
    window.requestAnimationFrame(() => {
      document.getElementById(`eg-game-${id}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }

  function renderEquipe(game: Partida, side: 'A' | 'B') {
    const escalados = side === 'A' ? game.atletasA : game.atletasB;
    const nomes = side === 'A' ? game.timeA : game.timeB;
    const golEquipe = side === 'A' ? game.golsA : game.golsB;
    const goleiro = side === 'A' ? game.goleiroA : game.goleiroB;
    const livres = (rodada?.presencas ?? []).filter(id => !game.atletasA.includes(id) && !game.atletasB.includes(id));
    const chave = `${game.id}-${side}`;
    const golsAtribuidos = somaGols(game, side);
    return <div className="squad-card">
      <div className="squad-heading"><strong>{nomes || `Equipe ${side}`}</strong><small>{escalados.length}/7 jogadores</small></div>
      {game.status === 'rascunho' && !game.vinculoFormacao && <div className="squad-add">
        <select aria-label={`Adicionar atleta à equipe ${side} do jogo ${game.numero}`} value={novaEscalacao[chave] ?? ''} onChange={(e: ChangeEvent<HTMLSelectElement>) => setNovaEscalacao(prev => ({ ...prev, [chave]: e.target.value }))}>
          <option value="">Selecionar presente...</option>
          {livres.map(id => <option value={id} key={id}>{nomePorId.get(id)}</option>)}
        </select>
        <button type="button" aria-label={`Confirmar atleta na equipe ${side}`} onClick={() => adicionarAtleta(game, side)} disabled={!novaEscalacao[chave]}><Plus size={17}/></button>
      </div>}
      {!escalados.length && <p className="squad-empty">Nenhum atleta vinculado.</p>}
      {escalados.map(id => <div className="squad-player" key={id}>
        <span className="squad-player-name">{nomePorId.get(id) ?? 'Atleta não localizado'} {goleiro === id && <Shield size={13} aria-label="Goleiro"/>}</span>
        <div className="quick-goals" role="group" aria-label={`Gols de ${nomePorId.get(id) ?? 'atleta'}`}>
          <button type="button" disabled={game.status === 'encerrada' || !(game.golsPorAtleta[id] ?? 0)} onClick={()=>ajustarGolUmToque(game,side,id,-1)} aria-label={`Retirar um gol de ${nomePorId.get(id)}`}><Minus size={20}/></button>
          <label className="squad-player-goals">Gols
            <input aria-label={`Gols de ${nomePorId.get(id) ?? 'atleta'} no jogo ${game.numero}`} type="number" min={0} max={99} inputMode="numeric" value={game.golsPorAtleta[id] ?? 0}
              disabled={game.status === 'encerrada'} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, golsPorAtleta: { ...j.golsPorAtleta, [id]: Math.min(99, Math.max(0, Number(e.target.value) || 0)) } }))}/>
          </label>
          <button type="button" disabled={game.status === 'encerrada'} onClick={()=>ajustarGolUmToque(game,side,id,1)} aria-label={`Adicionar um gol a ${nomePorId.get(id)}`}><Plus size={20}/></button>
        </div>
        {game.status === 'rascunho' && !game.vinculoFormacao && <button type="button" className="squad-remove" title="Remover da escalação" aria-label={`Remover ${nomePorId.get(id)} da equipe ${side}`} onClick={() => removerAtleta(game, side, id)}><Trash2 size={15}/></button>}
      </div>)}
      <label className="squad-keeper">Goleiro da equipe (1 dos 7)
        <select data-conferencia={`goleiro-${side}`} disabled={game.status === 'encerrada'} value={goleiro ?? ''} onChange={(e: ChangeEvent<HTMLSelectElement>) => alterarGoleiro(game.id, side, e.target.value)}>
          <option value="">Não informado</option>
          {escalados.map(id => <option key={id} value={id}>{nomePorId.get(id)}</option>)}
        </select>
      </label>
      <div className={`squad-goal-total ${golsAtribuidos > golEquipe ? 'squad-goal-total--error' : ''}`}><span>Autoria registrada</span><strong>{golsAtribuidos} / {golEquipe}</strong></div>
      {golsAtribuidos < golEquipe && <small className="squad-unknown">{golEquipe - golsAtribuidos} gol(s) ainda sem autor</small>}
    </div>;
  }

  return <section className="rounds-system ux-organizar" aria-labelledby="rounds-title" data-etapa={etapa}>
    <div className="rounds-head"><div><p className="eyebrow">LIVRO DIGITAL DO SÁBADO</p><h2 id="rounds-title">Preparar o sábado<span className="title-dot">.</span></h2><p>Siga as três etapas. O sábado selecionado permanece o mesmo durante a operação.</p></div><span className="rounds-counter">{rodadas.length} {rodadas.length === 1 ? 'SÁBADO' : 'SÁBADOS'} NO EGIDIUS</span></div>
    <div className="rounds-toolbar">
      <details className="ux-create-round" open={!rodadas.length}><summary>{rodadas.length ? 'Criar outro sábado' : 'Criar o primeiro sábado'}</summary><div>
      <label className="rounds-date-label">Data do novo sábado<input type="date" value={dataDesejada} onChange={(e: ChangeEvent<HTMLInputElement>) => setDataDesejada(e.target.value)}/></label>
      <button type="button" className="rounds-add-button" onClick={criarRodada}><Plus size={18}/> Criar ou abrir esta data</button></div></details>
      {rodadas.length > 0 && <label className="rounds-select-label">Selecionar rodada<select value={rodada?.id ?? ''} onChange={(e: ChangeEvent<HTMLSelectElement>) => mudarRodada(e.target.value)}>
        {rodadas.map(r => <option key={r.id} value={r.id}>{dataFormatada(r.data)} · {r.jogos.length} jogos</option>)}
      </select></label>}
    </div>
    <nav className="ux-etapas" aria-label="Etapas para organizar o sábado">
      {([['presencas','1. Presentes'],['times','2. Times'],['partidas','3. Partidas']] as [Etapa,string][]).map(([id,titulo]) => <button type="button" key={id} aria-current={etapa===id?'step':undefined} onClick={() => irParaEtapa(id === 'partidas' ? 'confronto' : id)}>{titulo}</button>)}
    </nav>
    {rodada && <p className="ux-active-date"><CalendarDays size={18}/> {dataFormatada(rodada.data)} · {rodada.presencas.length} presentes · {progresso.timesCompletos} times confirmados completos</p>}
    <div className="ssw-sabado-proximo" hidden={etapa==='times'} aria-label="Próximo passo do Sábado completo">
      <div><small>PRÓXIMO PASSO</small><strong>{progresso.passo}</strong><span>{dados.jogadores.length} jogadores cadastrados · {progresso.presentes} presentes · {progresso.timesCompletos} times completos</span></div>
      <button type="button" onClick={() => irParaEtapa(progresso.destino)}>Continuar <ChevronRight size={20}/></button>
    </div>
    {!ehSabado(dataDesejada) && <p className="rounds-validation">A data escolhida não é um sábado.</p>}
    {erro && <p className="rounds-validation" role="alert">{erro}</p>}
    {aviso && <p className="rounds-notice" role="status">{aviso}</p>}
    {armazenamento.erro && <p className="rounds-validation" role="alert">ATENÇÃO: {armazenamento.erro}</p>}
    {rodada && <section id="eg-next-game" hidden={etapa!=='partidas'} className="egc7-control" aria-labelledby="egc7-title">
      <div className="egc7-title"><div><span>SÁBADO EM CAMPO</span><h3 id="egc7-title">Jogos deste sábado</h3><p>{rodada.jogos.length} jogo(s) · {rodada.equipes.length} time(s) · {rodada.presencas.length} presente(s)</p></div><ClipboardList size={28} aria-hidden="true"/></div>
      <div className="egc7-create">
        <h4>Nova partida</h4>
        {rodada.equipes.length < 2 ? <div className="egc7-empty"><p>Primeiro, monte pelo menos dois times para o sábado.</p><button type="button" onClick={() => document.getElementById('eg-team-board')?.scrollIntoView({behavior:'smooth',block:'start'})}>Ir para os times <ChevronRight size={19}/></button></div> : <>
          <div className="egc7-team-fields">
            <label>Primeiro time<select value={equipeEscolhidaA?.id ?? ''} onChange={e => selecionarEquipe('a', e.target.value)}>{rodada.equipes.map(e => <option key={e.id} value={e.id}>{e.nome} · {e.atletas.length}/7</option>)}</select></label>
            <span aria-hidden="true">×</span>
            <label>Segundo time<select value={equipeEscolhidaB?.id ?? ''} onChange={e => selecionarEquipe('b', e.target.value)}>{rodada.equipes.map(e => <option key={e.id} value={e.id}>{e.nome} · {e.atletas.length}/7</option>)}</select></label>
          </div>
          <button type="button" className="egc7-new-button" disabled={!!validarDoisTimes(equipeEscolhidaA, equipeEscolhidaB)} onClick={criarJogo}><Plus size={24}/> Criar partida e abrir súmula</button>
          {equipeEscolhidaA && equipeEscolhidaB && validarDoisTimes(equipeEscolhidaA, equipeEscolhidaB) && <p className="egc7-error" role="status">{validarDoisTimes(equipeEscolhidaA, equipeEscolhidaB)}</p>}
        </>}
      </div>
      <div className="egc7-list" id="egc7-jogos-rapidos" aria-label="Partidas deste sábado">
        {!rodada.jogos.length && <p className="egc7-no-games">Nenhum jogo criado. Escolha os times acima para começar.</p>}
        {[...rodada.jogos].sort((a,b) => a.numero-b.numero).map(game => <div className="egc7-game" key={game.id}>
          <div className="egc7-game-info"><span className="egc7-game-caption">JOGO {String(game.numero).padStart(2,'0')} · {game.status==='encerrada' ? 'Encerrado' : 'Em edição'}</span><strong>{game.timeA} <span>{game.golsA} × {game.golsB}</span> {game.timeB}</strong></div>
          <div className="egc7-game-actions">
            <button type="button" className="egc7-edit" onClick={() => abrirEditor(game.id)} aria-label={`Abrir súmula do jogo ${game.numero}`}><ClipboardList size={19}/> {game.status === 'encerrada' ? 'Ver jogo' : 'Editar'}</button>
            {game.status === 'rascunho' ? <button type="button" className="egc7-delete" onClick={() => excluir(game)} aria-label={`Excluir rascunho do jogo ${game.numero}`}><Trash2 size={19}/> Excluir</button> : <span className="egc7-closed">Encerrado: reabra para alterar</span>}
          </div>
        </div>)}
      </div>
    </section>}
    <details className="ux-maintenance" hidden={etapa!=='partidas'}><summary>Ferramentas: lixeira, desfazer e backup</summary>
    {rodada && <section className="eg09e-trash" aria-label="Lixeira de partidas deste sábado">
      <details>
        <summary><Trash2 size={21} aria-hidden="true"/> <span>Lixeira de jogos</span>
          <strong>{itensLixeira.length}</strong></summary>
        <div className="eg09e-trash-content">
          <p>Os rascunhos excluídos ficam guardados no servidor. É possível restaurá-los após fechar o aplicativo.</p>
          {!itensLixeira.length && <p className="eg09e-trash-empty">Nenhum rascunho excluído neste sábado.</p>}
          {itensLixeira.map(item => <div className="eg09e-trash-item" key={item.id}>
            <div><strong>Jogo {String(item.jogo.numero).padStart(2,'0')} · {item.jogo.timeA} × {item.jogo.timeB}</strong>
              <small>Excluído em {new Date(item.excluidoEm).toLocaleString('pt-BR')}</small></div>
            <button type="button" onClick={() => restaurarJogo(item.id)}><Undo2 size={19}/> Restaurar jogo</button>
          </div>)}
        </div>
      </details>
    </section>}
    <div className="quick-history" role="group" aria-label="Ações recentes">
      <span><Undo2 size={19}/> Ações rápidas <small>Até 12 operações por aba</small></span>
      <button type="button" disabled={!historico.desfazer} onClick={()=>executarHistorico(false)}><Undo2 size={19}/> Desfazer</button>
      <button type="button" disabled={!historico.refazer} onClick={()=>executarHistorico(true)}><Redo2 size={19}/> Refazer</button>
    </div>
    <div className="eg-data-actions"><span><LockKeyhole size={16}/> Dados mantidos neste navegador como cópia local e enviados à API. Confira o status acima.</span><button type="button" onClick={exportarBackup}><Download size={16}/> Exportar backup JSON</button></div>

    </details>
    <div className="roster-section" hidden={etapa!=='presencas'}>
      <details id="eg-cadastro" className="roster-panel ssw-release-disclosure ssw-release-registration">
        <summary><span>Cadastro de jogadores ({dados.jogadores.length})</span><ChevronRight size={20} aria-hidden="true"/></summary>
        <form onSubmit={cadastrar} className="roster-form">
          <label htmlFor="ssw-player-name">Nome do jogador</label>
          <div><input id="ssw-player-name" value={nomeJogador} maxLength={70} placeholder="Ex.: João Silva" onChange={(e: ChangeEvent<HTMLInputElement>) => {setNomeJogador(e.target.value);setAvisoCadastro('');setErroCadastro('');}}/><button type="submit"><Plus size={15}/>{marcarChegadaNoCadastro ? 'Cadastrar e marcar chegada' : 'Cadastrar'}</button></div>
          {rodada && <label className="ssw-cadastro-presenca"><input type="checkbox" checked={marcarChegadaNoCadastro} onChange={e => setMarcarChegadaNoCadastro(e.target.checked)}/><span>Também marcar chegada em <strong>{dataFormatada(rodada.data)}</strong></span></label>}
          <p className="ssw-cadastro-hint">O cadastro fica disponível em todos os sábados. A presença só será marcada se você selecionar a opção acima.</p>
          {erroCadastro && <p className="rounds-validation" role="alert">{erroCadastro}</p>}
          {avisoCadastro && <p className="rounds-notice" role="status">{avisoCadastro}</p>}
        </form>
        <details className="quick-roster-manage"><summary>Gerenciar / excluir cadastro de atleta</summary>
          <div><label htmlFor="quick-delete-person">Atleta sem participação registrada</label>
            <select id="quick-delete-person" value={atletaParaExcluir} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setAtletaParaExcluir(e.target.value)}>
              <option value="">Selecionar atleta...</option>
              {dados.jogadores.map(j=><option key={j.id} value={j.id} disabled={!podeExcluirAtleta(dados,j.id)}>{j.nome}{podeExcluirAtleta(dados,j.id)?'':' · possui histórico'}</option>)}
            </select>
            <button type="button" className="quick-danger" disabled={!atletaParaExcluir} onClick={excluirAtleta}><Trash2 size={18}/> Excluir cadastro</button>
          </div><p>Atletas com presença, gols ou escalação não podem ser excluídos: o histórico permanece protegido.</p>
        </details>
        <p>Um cadastro vale para todos os sábados. Cadastre antes de marcar a chegada.</p>
      </details>
      <div className="roster-panel" id="eg-checkin">
        <div className="roster-panel-title"><UsersRound size={19}/><strong>Chegadas do sábado</strong><span>{rodada?.presencas.length ?? 0} presentes</span></div>
        {!rodada ? <p>Crie um sábado para registrar a ordem de chegada.</p> : <>
          {dados.jogadores.length === 0 ? <p>Cadastre atletas para habilitar o check-in.</p> : <>
          <div className="quick-attendance-actions">
            <button type="button" onClick={marcarTodosNoSabado} disabled={rodada.presencas.length===dados.jogadores.length}><CheckSquare size={18}/> Marcar todos</button>
            <button type="button" onClick={limparLivres} disabled={!rodada.presencas.some(id=>!atletaEmUso(rodada,id))}><X size={18}/> Limpar livres</button>
          </div><p className="quick-attendance-hint">Atenção: “Marcar todos” adiciona os novos na ordem do cadastro, não na ordem real de chegada.</p><div className="attendance-grid">
            {dados.jogadores.map(j => {
              const presente = rodada.presencas.includes(j.id);
              return <button key={j.id} type="button" className={`attendance-button ${presente ? 'attendance-button--present' : ''}`} onClick={() => alternarPresenca(j.id)}>
                <span>{j.nome}</span>{presente ? <span><Check size={14}/> #{rodada.presencas.indexOf(j.id) + 1}</span> : <Plus size={15}/>}
              </button>;
            })}
          </div></>}
          {!!rodada.presencas.length && <div className="arrival-order"><strong>Ordem de chegada:</strong> {rodada.presencas.map(id => nomePorId.get(id) ?? 'Atleta não localizado').join(' → ')}</div>}
        </>}
      </div>
    </div>

    {etapa==='presencas' && rodada && <div className="ux-stage-actions"><p>{rodada.presencas.length < 14 ? `Há ${rodada.presencas.length} presentes. Para uma partida, são necessários 14 jogadores.` : 'Presenças registradas. Agora distribua os jogadores nos times.'}</p><button type="button" disabled={!rodada.presencas.length} onClick={() => irParaEtapa('times')}>Continuar para os times <ChevronRight size={20}/></button></div>}
    {!rodada ? <div className="rounds-empty"><CalendarDays size={33}/><strong>Nenhum sábado registrado</strong><p>Crie a primeira rodada para organizar as súmulas.</p></div> : <>
      <div id="eg-team-board" key={rodada.id} hidden={etapa!=='times'}><TeamBoard rodada={rodada} jogadores={dados.jogadores} continuar={() => {setAviso('Times confirmados. Escolha o confronto para criar a partida.');irParaEtapa('confronto');}}/></div>
      <div hidden={etapa!=='partidas'} className="ux-match-area"><div className="rounds-selected"><div><span>RODADA SELECIONADA</span><h3>{dataFormatada(rodada.data)}</h3><p>{rodada.jogos.length} partidas · {rodada.presencas.length} presentes · {rodada.equipes.length} times</p></div></div>
      <div id="eg-game-list" className="quick-matches-heading"><div><strong>Súmulas do sábado</strong><p>Duplique confrontos ou gerencie vários rascunhos em lote.</p></div>
        <button type="button" onClick={()=>{setSelecionando(v=>!v);setJogosSelecionados([]);}} aria-pressed={selecionando}><CheckSquare size={20}/> {selecionando?'Sair da seleção':'Selecionar súmulas'}</button>
      </div>
      {selecionando && <div className="quick-bulk-bar" role="group" aria-label="Ações em lote das súmulas">
        <strong>{selecionadosValidos.length} de {rascunhos.length} rascunhos selecionados</strong>
        <button type="button" onClick={selecionarTodosRascunhos} disabled={!rascunhos.length}><CheckSquare size={18}/> Selecionar todos</button>
        <button type="button" onClick={()=>setJogosSelecionados([])} disabled={!selecionadosValidos.length}><Square size={18}/> Limpar seleção</button>
        <button type="button" className="quick-danger" onClick={excluirSelecionados} disabled={!selecionadosValidos.length}><Trash2 size={18}/> Excluir {selecionadosValidos.length}</button>
        <small>Somente rascunhos podem ser excluídos em lote. Dados encerrados ficam protegidos.</small>
      </div>}
      <div className="match-cards">
        {!rodada.jogos.length && <div className="rounds-no-games"><ClipboardList size={24}/><span>Nenhuma súmula neste sábado. Use <strong>Criar partida</strong> nesta etapa.</span></div>}
        {rodada.jogos.map(game => <article id={`eg-game-${game.id}`} className={`match-editor ${jogoAberto === game.id ? 'match-editor--expanded' : 'match-editor--collapsed'}`} key={game.id}>
          <div className="match-editor-header"><div className="quick-match-title">{selecionando && <label className="quick-match-check"><input type="checkbox" disabled={game.status === 'encerrada'} checked={jogosSelecionados.includes(game.id) && game.status === 'rascunho'} onChange={()=>alternarJogoSelecionado(game.id)} aria-label={`Selecionar rascunho do Jogo ${game.numero}`}/></label>}<span className="match-number">JOGO {String(game.numero).padStart(2, '0')}</span></div><div className="match-editor-labels">{game.vinculoFormacao && <span className="linked-badge"><Shield size={13}/> TIMES FIXOS</span>}<span className={`match-status match-status--${game.status}`}>{game.status === 'encerrada' ? 'ENCERRADO' : 'RASCUNHO'}</span></div><button type="button" className="mobile-match-toggle" onClick={()=>setJogoAberto(prev=>prev===game.id?null:game.id)} aria-expanded={jogoAberto===game.id} aria-controls={`match-details-${game.id}`}>
            {jogoAberto===game.id?'Recolher súmula':'Abrir súmula'} <span>{game.golsA} × {game.golsB}</span>
          </button></div>
          <div className="match-editor-details" id={`match-details-${game.id}`}>
          {!game.vinculoFormacao && rodada.equipes.length >= 2 && <div className="legacy-link-panel"><span>Esta súmula ainda não está vinculada às equipes fixas do sábado.</span>{game.status === 'rascunho' ? <button type="button" onClick={() => vincularJogo(game)}>Vincular times escolhidos acima</button> : <small>Para vincular sem alterar o placar, reabra o jogo e confirme a associação.</small>}</div>}
          <div className="match-editor-score">
            <label>Equipe A<input value={game.timeA} maxLength={40} disabled={game.status === 'encerrada' || game.vinculoFormacao} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, timeA: e.target.value }))}/></label>
            <input type="number" min={0} max={99} inputMode="numeric" aria-label={`Placar equipe A do jogo ${game.numero}`} disabled={game.status === 'encerrada'} value={game.golsA} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, golsA: Math.min(99, Math.max(0, Number(e.target.value) || 0)) }))}/>
            <b>×</b>
            <input type="number" min={0} max={99} inputMode="numeric" aria-label={`Placar equipe B do jogo ${game.numero}`} disabled={game.status === 'encerrada'} value={game.golsB} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, golsB: Math.min(99, Math.max(0, Number(e.target.value) || 0)) }))}/>
            <label>Equipe B<input value={game.timeB} maxLength={40} disabled={game.status === 'encerrada' || game.vinculoFormacao} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, timeB: e.target.value }))}/></label>
          </div>
          <div className="squad-grid" data-conferencia="escalacao">{renderEquipe(game, 'A')}{renderEquipe(game, 'B')}</div>
          {game.status === 'encerrada' && (!game.atletasA.length || !game.atletasB.length) && <p className="legacy-warning">Súmula importada de registros antigos: o placar está preservado, mas ainda não existe escalação. Reabra e complete os atletas para calcular pontuação individual.</p>}
          <label className="match-notes">Anotações da súmula<textarea rows={2} maxLength={1500} placeholder="Ocorrências, arbitragem, anotações..." disabled={game.status === 'encerrada'} value={game.observacoes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => modificarJogo(game.id, j => ({ ...j, observacoes: e.target.value }))}/></label>
          {game.status === 'rascunho' && <label className="unknown-check"><input data-conferencia="sem-autoria" type="checkbox" checked={game.permitirGolsSemAutor} onChange={(e: ChangeEvent<HTMLInputElement>) => modificarJogo(game.id, j => ({ ...j, permitirGolsSemAutor: e.target.checked }))}/><span>Permitir encerrar com gol(s) sem autoria identificada (não contabilizados na artilharia)</span></label>}
          <ConferenciaPartida jogo={game}/>
          {game.status==='encerrada' && <p className="ux-completed" role="status">Partida encerrada. Confira a sincronização no topo. {abrirExpressa && <button type="button" onClick={() => abrirExpressa(rodada.id,'__novo_jogo__')}>Criar próxima partida</button>}</p>}
          <div className="match-editor-actions"><span className="local-save"><Save size={15}/> {armazenamento.persistiu ? 'Cópia local automática' : 'Falha na cópia local'}</span><div className="match-editor-buttons"><button type="button" className="quick-duplicate" onClick={()=>duplicar(game)} title="Repetir confronto e jogadores, zerando placar e gols"><Copy size={17}/> Duplicar</button>{game.status === 'rascunho' ? <>
            <button type="button" className="rounds-trash" onClick={() => excluir(game)} aria-label={`Excluir jogo ${game.numero}`}><Trash2 size={17}/></button>
            <button type="button" className="rounds-finish" onClick={() => encerrar(game)}><CheckCircle2 size={16}/> Encerrar jogo</button>
          </> : <button type="button" className="rounds-reopen" onClick={() => reabrir(game)}>Reabrir para edição</button>}</div></div>
          </div>
        </article>)}
      </div>
      <div className="media-next"><div className="media-icons"><ImageIcon size={23}/><Film size={23}/></div><div><strong>Fotos e vídeos já disponíveis</strong><p>Use a área Mídia para vincular arquivos às rodadas e aos jogos.</p></div></div>
      </div>
    </>}
    <p className="rounds-disclaimer"><LockKeyhole size={14}/> Confira Salvo no servidor antes de sair. Em Importar e arquivos → Guia e backup, baixe uma cópia completa do grupo.</p>
  </section>;
}
