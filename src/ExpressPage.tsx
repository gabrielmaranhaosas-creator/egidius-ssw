import { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  CircleAlert, Plus, RotateCcw, Shield, Trash2, Trophy,
} from 'lucide-react';
import {
  atualizarDados, dataFormatada, desfazerAcao, refazerAcao, historicoAcoes, novoId, useDadosSSW,
} from './SSWStore';
import type { DadosSSW, Partida, Rodada } from './SSWStore';
import { confrontoSugerido, jogoDasEquipes } from './RoundRules';
import { validarDoisTimes } from './TimeRules';
import { excluirRascunhosParaLixeira } from './LixeiraRules';
import { alterarPlacar, atualizarPartidaDaRodada, encerrarPartida, golsAtribuidos, lancarGol, reabrirPartidaDaRodada, validarEncerramento } from './ExpressRules';
import type { Lado } from './ExpressRules';
import { SSWConfirmDialog, SSWUndoRedo } from './components/SSWInteractionKit';
import { SSWGoalPad } from './components/SSWGoalPad';
import { ConferenciaPartida } from './components/ConferenciaPartida';
import './ExpressPage.css';
import './styles/ssw-goals-09d.css';

function editarRodada(dados: DadosSSW, rodadaId: string, fn: (r: Rodada) => Rodada): DadosSSW {
  if (!dados.rodadas.some(r => r.id === rodadaId)) throw new Error('Sábado não encontrado.');
  return { ...dados, rodadas: dados.rodadas.map(r => r.id === rodadaId ? fn(r) : r) };
}

type Props = { initialRoundId?: string; initialGameId?: string; abrirCompleta: (rodadaId: string, jogoId: string) => void };
export function ExpressPage({ initialRoundId, initialGameId, abrirCompleta }: Props) {
  const dados = useDadosSSW();
  const [rodadaId, setRodadaId] = useState(initialRoundId ?? '');
  const [jogoId, setJogoId] = useState(initialGameId ?? '');
  const [timeAId, setTimeAId] = useState('');
  const [timeBId, setTimeBId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [ladoAtivo, setLadoAtivo] = useState<Lado>('A');
  const [excluirConfirmacaoId, setExcluirConfirmacaoId] = useState<string | null>(null);
  const [criarAberto, setCriarAberto] = useState(initialGameId === '__novo_jogo__');
  const sabados = [...dados.rodadas].sort((a,b) => b.data.localeCompare(a.data));
  const rodada = sabados.find(r => r.id === rodadaId) ?? sabados[0];
  const jogos = [...(rodada?.jogos ?? [])].sort((a,b) => a.numero-b.numero);
  const ultimoRascunho = [...jogos].reverse().find(j => j.status === 'rascunho');
  const jogo = jogos.find(j => j.id === jogoId) ?? ultimoRascunho ?? jogos.at(-1);
  const index = jogo ? jogos.findIndex(j => j.id === jogo.id) : -1;
  const sugerido = rodada ? confrontoSugerido(rodada) : { a: '', b: '' };
  const timeA = rodada?.equipes.find(e => e.id === timeAId) ?? rodada?.equipes.find(e => e.id === sugerido.a) ?? rodada?.equipes[0];
  const timeB = rodada?.equipes.find(e => e.id === timeBId) ?? rodada?.equipes.find(e => e.id === sugerido.b) ?? rodada?.equipes.find(e => e.id !== timeA?.id);
  const nomes = new Map(dados.jogadores.map(j => [j.id, j.nome]));
  const descricaoDesfazer = historicoAcoes().desfazer;
  const descricaoRefazer = historicoAcoes().refazer;
  const partidaAExcluir = jogos.find(j => j.id === excluirConfirmacaoId && j.status === 'rascunho');

  useEffect(() => {
    // Um link vindo da Central do Sábado pode solicitar outra partida.
    if (initialRoundId) setRodadaId(initialRoundId);
    if (initialGameId === '__novo_jogo__') {
      setCriarAberto(true);
      setJogoId('');
    } else if (initialGameId) setJogoId(initialGameId);
  }, [initialRoundId, initialGameId]);

  function acao(fn: () => void) {
    setErro('');setMensagem('');
    try { fn(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'A operação não foi concluída.'); }
  }
  function modificar(partida: Partida, descricao: string, change: (j: Partida) => Partida) {
    if (!rodada) return;
    acao(() => {
      atualizarDados(d => editarRodada(d, rodada.id, r => atualizarPartidaDaRodada(r, partida.id, change)), descricao);
      setMensagem(`${descricao}. Confira o indicador de sincronização antes de sair.`);
    });
  }
  function encerrar(partida: Partida) {
    const invalidacao = validarEncerramento(partida);
    if (invalidacao) { setErro(invalidacao);setMensagem('');return; }
    if (!window.confirm(`Encerrar o Jogo ${String(partida.numero).padStart(2,'0')} (${partida.timeA} ${partida.golsA} × ${partida.golsB} ${partida.timeB})? Os rankings serão atualizados.`)) return;
    modificar(partida, `Jogo ${partida.numero} encerrado`, encerrarPartida);
  }
  function novoConfronto() {
    if (!rodada || rodada.equipes.length < 2) {
      setErro('Ainda não há dois times formados. Vá em Mais → Sábado completo → Times para montar as equipes.');
      setCriarAberto(true);
      return;
    }
    // Além da validação esportiva, conferir a existência de ambos os times.
    // Isso protege a criação e permite ao TypeScript reconhecer os dois objetos.
    if (!timeA || !timeB) {
      setErro('Escolha dois times válidos para criar a partida.');
      setCriarAberto(true);
      return;
    }
    const erroTimes = validarDoisTimes(timeA, timeB);
    if (erroTimes) {
      setErro(erroTimes);
      setCriarAberto(true);
      return;
    }
    const numero = Math.max(0, ...rodada.jogos.map(j=>j.numero)) + 1;
    const nova = jogoDasEquipes(numero, novoId(), timeA, timeB);
    acao(() => {
      atualizarDados(d => editarRodada(d, rodada.id, r => ({ ...r, jogos:[...r.jogos, nova] })), `criação da súmula expressa ${numero}`);
      setJogoId(nova.id);
      setCriarAberto(false);
      setMensagem(`Jogo ${numero} criado! Você já pode registrar o placar e os gols.`);
      window.requestAnimationFrame(() => window.setTimeout(() =>
        document.getElementById('egidius-placar-express')?.scrollIntoView({block:'start',behavior:'smooth'}), 60));
    });
  }
  function excluirJogo(partida: Partida, confirmado = false) {
    if (!rodada) return;
    if (partida.status !== 'rascunho') {
      setErro('Este jogo está encerrado. Use “Reabrir para corrigir” antes de excluir.');
      return;
    }
    if (!confirmado) { setExcluirConfirmacaoId(partida.id); return; }
    acao(() => {
      atualizarDados(d => excluirRascunhosParaLixeira(d, rodada.id, [partida.id]), `envio do jogo ${partida.numero} à lixeira`);
      setJogoId('');
      setMensagem(`Jogo ${partida.numero} enviado à Lixeira. Restaure em Mais → Sábado completo → Lixeira de jogos.`);
    });
  }
  function reabrirJogo(partida: Partida) {
    if (!rodada || partida.status !== 'encerrada') return;
    if (!window.confirm(`Reabrir Jogo ${partida.numero}? Ele deixará de contar temporariamente nos rankings até ser encerrado novamente.`)) return;
    acao(() => {
      atualizarDados(d => editarRodada(d, rodada.id, r => reabrirPartidaDaRodada(r, partida.id)), `Jogo ${partida.numero} reaberto`);
      setMensagem(`Jogo ${partida.numero} reaberto. Placar e autoria preservados; confira “Salvo no servidor”.`);
    });
  }
  function desfazer() {
    acao(() => { const descricao = desfazerAcao();setMensagem(`Desfeito: ${descricao}. Aguarde o indicador Salvo no servidor.`); });
  }
  function refazer() {
    acao(() => { const descricao = refazerAcao();setMensagem(`Refeito: ${descricao}. Aguarde o indicador Salvo no servidor.`); });
  }
  function irPara(offset: number) { const outro = jogos[index+offset];if (outro) {setJogoId(outro.id);setErro('');setMensagem('');} }

  return <div className="express-page">
    <header className="express-hero"><div><span className="express-overline">SÁBADO SHOW</span><h1>Súmula<span>.</span></h1><p>Escolha um jogo, registre gols ou crie o próximo.</p></div><ClipboardList size={36} aria-hidden="true"/></header>
    {!sabados.length ? <section className="express-panel"><p>Crie um sábado e forme os times na Central do Sábado para começar.</p></section> : <>
      <section className="express-round express-panel"><label>Qual sábado?
        <select value={rodada?.id ?? ''} onChange={e => {setRodadaId(e.target.value);setJogoId('');setTimeAId('');setTimeBId('');setMensagem('');setErro('');}}>
          {sabados.map(r => <option key={r.id} value={r.id}>{dataFormatada(r.data)} · {r.jogos.length} jogos</option>)}
        </select></label>
        <span className="express-round-chip">{rodada?.equipes.length ?? 0} times · {jogos.length} partidas</span>
      </section>
      {erro && <div className="express-error" role="alert"><CircleAlert size={20}/>{erro}</div>}
      {mensagem && <div className="express-message" role="status">{mensagem}</div>}
      <section className="express-panel express-match-select">
        <div className="express-section-head"><div><span className="express-overline express-overline--dark">CONTROLE DO JOGO</span><h2>Partida em operação</h2></div><SSWUndoRedo desfazer={desfazer} refazer={refazer} descricaoDesfazer={descricaoDesfazer} descricaoRefazer={descricaoRefazer}/></div>
        {jogos.length ? <div className="express-pager"><button aria-label="Jogo anterior" type="button" disabled={index<=0} onClick={()=>irPara(-1)}><ChevronLeft size={24}/></button>
          <label>Selecionar súmula<select value={jogo?.id ?? ''} onChange={e => {setJogoId(e.target.value);setErro('');setMensagem('');}}>{jogos.map(j => <option key={j.id} value={j.id}>Jogo {String(j.numero).padStart(2,'0')} · {j.timeA} × {j.timeB} {j.status==='encerrada'?'✓':''}</option>)}</select></label>
          <button aria-label="Próximo jogo" type="button" disabled={index>=jogos.length-1} onClick={()=>irPara(1)}><ChevronRight size={24}/></button></div>
        : <p>Este sábado ainda não tem súmulas.</p>}
        <div className="express-new-game" id="egidius-nova-partida">
          <p className="express-new-game-preview">Próxima partida: <strong>{timeA?.nome ?? 'Time A'} ({timeA?.atletas.length ?? 0}/7) × {timeB?.nome ?? 'Time B'} ({timeB?.atletas.length ?? 0}/7)</strong></p>
          <p className="egc8-new-game-hint">Cada time precisa de 7 jogadores, com goleiro escolhido entre eles na súmula.</p>
          {validarDoisTimes(timeA, timeB) && <p className="egc8-unready" role="status">{validarDoisTimes(timeA,timeB)}</p>}
          <button type="button" className="express-create-button express-create-primary" onClick={novoConfronto}>
            <Plus size={24} aria-hidden="true"/> <span>Novo jogo — criar agora</span>
          </button>
          <button type="button" className="express-new-game-toggle express-select-teams" aria-expanded={criarAberto} aria-controls="express-new-game-form" onClick={() => setCriarAberto(v => !v)}>
            <Shield size={19} aria-hidden="true"/>
            <span>{criarAberto ? 'Ocultar escolha dos times' : 'Trocar os times do próximo jogo'}</span>
            <ChevronRight size={20} className={criarAberto ? 'is-open' : ''} aria-hidden="true"/>
          </button>
          {criarAberto && <div id="express-new-game-form" className="express-new-game-form">
            <p>Escolha dois times diferentes. O novo jogo começa com placar 0 × 0.</p>
            <div className="express-team-select">
              <label>Primeiro time<select value={timeA?.id ?? ''} onChange={e => setTimeAId(e.target.value)}>{rodada?.equipes.map(e => <option key={e.id} value={e.id}>{e.nome} · {e.atletas.length}/7</option>)}</select></label>
              <label>Segundo time<select value={timeB?.id ?? ''} onChange={e => setTimeBId(e.target.value)}>{rodada?.equipes.map(e => <option key={e.id} value={e.id}>{e.nome} · {e.atletas.length}/7</option>)}</select></label>
            </div>
            <button type="button" className="express-create-button" onClick={novoConfronto}><Plus size={21}/> Confirmar e abrir novo jogo</button>
          </div>}
        </div>
        {jogo && <div className="express-delete-row">
          {jogo.status === 'rascunho' ? <button type="button" className="express-delete-button" onClick={() => excluirJogo(jogo)}><Trash2 size={18}/> Excluir este jogo</button>
            : <button type="button" className="express-reopen-button" onClick={() => reabrirJogo(jogo)}><RotateCcw size={18}/> Reabrir para corrigir / excluir</button>}
        </div>}
      </section>
      {jogo && <section id="egidius-placar-express" className="express-board express-panel" aria-labelledby="express-board-heading"><div className="express-board-top"><span id="express-board-heading">JOGO {String(jogo.numero).padStart(2,'0')}</span><span className={jogo.status==='encerrada'?'express-status express-status--closed':'express-status'}>{jogo.status==='encerrada'?'ENCERRADO':'EM EDIÇÃO'}</span></div>
        <div className="express-score-grid">{(['A','B'] as const).map(lado => {const placar = lado==='A' ? jogo.golsA : jogo.golsB;const titulo = lado==='A'?jogo.timeA:jogo.timeB;return <div className="express-score-team" key={lado}><strong>{titulo}</strong><div className="express-score-value" aria-label={`${titulo}: ${placar} gols`}>{placar}</div><small>{golsAtribuidos(jogo,lado)} gols com autor identificado</small></div>;})}</div>
        {jogo.status === 'encerrada' && <p className="express-closed-note">Partida encerrada. Para registrar novos gols, escolha <strong>Criar nova partida</strong> acima.</p>}
        <p className="express-score-hint">Toque em <strong>+ Gol</strong> ao lado do jogador. O placar será atualizado automaticamente.</p>
        <SSWGoalPad
          jogo={jogo}
          nomes={nomes}
          lado={ladoAtivo}
          mudarLado={setLadoAtivo}
          adicionar={(l, id) => modificar(jogo, `Gol de ${nomes.get(id) ?? 'atleta'} registrado`, partida => lancarGol(partida, l, id, 1))}
          remover={(l, id) => modificar(jogo, `Gol de ${nomes.get(id) ?? 'atleta'} corrigido`, partida => lancarGol(partida, l, id, -1))}
        />
        <details className="eg09d-advanced">
          <summary>Goleiros e ajustes adicionais</summary>
          <p>Use os controles abaixo para escolher goleiros ou ajustar gols sem autoria. Prefira <strong>+ Gol</strong> no nome de cada jogador.</p>
          <div className="eg09d-score-corrections">
            {(['A','B'] as const).map(l => { const nome = l === 'A' ? jogo.timeA : jogo.timeB; const placar = l === 'A' ? jogo.golsA : jogo.golsB; return <div key={l}>
              <strong>{nome} — {placar} gol(s)</strong>
              <div className="eg09d-score-correction-buttons">
                <button type="button" disabled={jogo.status==='encerrada'||placar===0} onClick={()=>modificar(jogo, `placar de ${nome} corrigido`, j=>alterarPlacar(j,l,-1))}>− Retirar do placar</button>
                <button type="button" disabled={jogo.status==='encerrada'||placar>=99} onClick={()=>modificar(jogo, `placar de ${nome} atualizado`, j=>alterarPlacar(j,l,1))}>+ Gol sem autor</button>
              </div>
            </div>; })}
          </div>
          <div className="express-keepers">{(['A','B'] as const).map(lado => <label key={lado}><Shield size={17}/> Goleiro · {lado==='A'?jogo.timeA:jogo.timeB}<select disabled={jogo.status==='encerrada'} value={(lado==='A'?jogo.goleiroA:jogo.goleiroB)??''} onChange={e=>modificar(jogo,'goleiro alterado',j=>({...j,[lado==='A'?'goleiroA':'goleiroB']:e.target.value||null}))}><option value="">Não informado</option>{(lado==='A'?jogo.atletasA:jogo.atletasB).map(id=><option key={id} value={id}>{nomes.get(id)??'Atleta'}</option>)}</select></label>)}</div>
        {jogo.status==='rascunho'&&<label className="express-author"><input type="checkbox" checked={jogo.permitirGolsSemAutor} onChange={e=>modificar(jogo,'autoria de gols ajustada',j=>({...j,permitirGolsSemAutor:e.target.checked}))}/> Autorizar encerramento com gols sem autor identificado</label>}
        </details>
        {jogo.status === 'rascunho' && (!jogo.goleiroA || !jogo.goleiroB) && <p className="eg09d-keeper-reminder">Antes de encerrar: escolha os goleiros em <strong>Goleiros e ajustes adicionais</strong>.</p>}
        <ConferenciaPartida jogo={jogo}/>
        <div className="express-final-actions"><button type="button" className="express-secondary" onClick={()=>abrirCompleta(rodada!.id,jogo.id)}><ClipboardList size={19}/> Súmula completa <ArrowRight size={19}/></button>{jogo.status==='rascunho'?<button type="button" className="express-finish" onClick={()=>encerrar(jogo)}><CheckCircle2 size={21}/> Encerrar partida</button>:<span className="express-finished"><Trophy size={21}/> Jogo encerrado; use “Reabrir para corrigir” para editar.</span>}</div>
      </section>}
      {partidaAExcluir && <SSWConfirmDialog
        titulo={`Excluir jogo ${partidaAExcluir.numero}?`}
        descricao={<><p><strong>{partidaAExcluir.timeA} {partidaAExcluir.golsA} × {partidaAExcluir.golsB} {partidaAExcluir.timeB}</strong></p>
          <p>Este rascunho ficará na <strong>Lixeira de jogos</strong>, em Sábado completo, e poderá ser recuperado mesmo após fechar a aba.</p></>}
        acao="Excluir jogo"
        destrutiva
        cancelar={() => setExcluirConfirmacaoId(null)}
        confirmar={() => { setExcluirConfirmacaoId(null); excluirJogo(partidaAExcluir, true); }}
      />}
      <footer className="express-foot"><RotateCcw size={18}/> As ações ficam na memória da aba até serem sincronizadas. Confirme “Salvo no servidor” antes de sair.</footer>
    </>}
    <button type="button" className="express-mobile-back" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><ArrowLeft size={18}/> Voltar ao topo</button>
  </div>;
}
