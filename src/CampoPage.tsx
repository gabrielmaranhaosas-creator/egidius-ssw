import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowRight, CalendarDays, ChevronDown, ChevronRight, ClipboardList,
  Plus, Search, Shield, Target, Trophy, Trash2, Undo2, UsersRound, X,
} from 'lucide-react';
import { atualizarDados, dataFormatada, desfazerAcao, historicoAcoes, useDadosSSW } from './SSWStore';
import { checkInCentral, retirarChegada, rodadaCentral, statusRodada, ultimosJogos } from './CampoRules';
import { atletaEmUso } from './QuickActions';
import './CampoPage.css';

import type { CampoDestino } from './CampoRules';
export type { CampoDestino } from './CampoRules';

export function CampoPage({ abrir, abrirExpressa, rodadaId, onRodadaChange }: {
  abrir: (destino: CampoDestino, rodadaId?: string, partidaId?: string) => void;
  abrirExpressa: (rodadaId?: string, partidaId?: string) => void;
  rodadaId: string;
  onRodadaChange: (id: string) => void;
}) {
  const dados = useDadosSSW();
  const [busca, setBusca] = useState('');
  const [abaChegada, setAbaChegada] = useState<'faltam' | 'presentes'>('faltam');
  const [mostraPresencas, setMostraPresencas] = useState(false);
  const [mostraTodos, setMostraTodos] = useState(false);
  const [mostraResultados, setMostraResultados] = useState(false);
  const [mostraOpcoes, setMostraOpcoes] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const rodada = rodadaCentral(dados, rodadaId);
  const progresso = statusRodada(rodada, dados.jogadores);
  const precisaCadastro = dados.jogadores.length === 0;
  const jogos = ultimosJogos(rodada);
  const historico = historicoAcoes();

  // Busca atravessa as duas listas; a ordem de chegada oficial não é recalculada.
  const presentes = rodada?.presencas ?? [];
  const buscaAtiva = busca.trim().length > 0;
  const jogadores = dados.jogadores.filter(j =>
    j.nome.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))
    && (buscaAtiva || (abaChegada === 'presentes' ? presentes.includes(j.id) : !presentes.includes(j.id)))
  ).sort((a, b) => {
    const posA = presentes.indexOf(a.id), posB = presentes.indexOf(b.id);
    if (abaChegada === 'presentes' && !buscaAtiva) return posA - posB;
    if (posA === -1 && posB !== -1) return -1;
    if (posB === -1 && posA !== -1) return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  const visiveis = mostraTodos || buscaAtiva ? jogadores : jogadores.slice(0, 8);
  const faltam = dados.jogadores.length - presentes.length;

  function trocarRodada(evento: ChangeEvent<HTMLSelectElement>) {
    onRodadaChange(evento.target.value);
    setBusca('');
    setMostraTodos(false);
    setAbaChegada('faltam');
    setMostraPresencas(false);
    setMostraResultados(false);
    setMensagem('');
    setErro('');
  }
  function ir(destino: CampoDestino, partidaId?: string) {
    abrir(destino, rodada?.id, partidaId);
  }
  function checkin(jogadorId: string) {
    if (!rodada || rodada.presencas.includes(jogadorId)) return;
    try {
      atualizarDados(d => checkInCentral(d, rodada.id, jogadorId), 'chegada registrada na Central');
      const nome = dados.jogadores.find(j => j.id === jogadorId)?.nome ?? 'Jogador';
      setMensagem(`${nome}: presença registrada. Confira “Salvo no servidor”.`);
      setErro('');
      setBusca('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a chegada.');
    }
  }
  function retirar(jogadorId: string) {
    if (!rodada || !rodada.presencas.includes(jogadorId)) return;
    const nome = dados.jogadores.find(j => j.id === jogadorId)?.nome ?? 'Jogador';
    if (atletaEmUso(rodada, jogadorId)) {
      setErro(`${nome} está em um time ou jogo. Para corrigir, ajuste primeiro a escalação.`);
      return;
    }
    if (!window.confirm(`Retirar a presença de ${nome} deste sábado?\n\nAs outras chegadas manterão sua ordem. Você poderá desfazer a ação nesta aba.`)) return;
    try {
      atualizarDados(d => retirarChegada(d, rodada.id, jogadorId), 'correção de presença na Central');
      setMensagem(`${nome}: presença retirada. As outras chegadas foram preservadas.`);
      setErro('');
      setBusca('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível retirar a presença.');
    }
  }
  function alternarChegadas() {
    const abrir = !mostraPresencas;
    setMostraPresencas(abrir);
    setErro('');
    if (abrir) window.requestAnimationFrame(() =>
      document.getElementById('ssw-chegadas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function desfazer() {
    try {
      const acao = desfazerAcao();
      setMensagem(`Ação desfeita: ${acao}.`);
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desfazer.');
    }
  }
  function verResultados() {
    setMostraResultados(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => document.getElementById('ssw-resultados')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    });
  }

  return <div className="campo-page campo-page--simples">
    <header className="campo-simple-brand">
      <img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/>
      <div><span>SÁBADO SHOW</span><h1>Nosso futebol</h1></div>
    </header>

    <section className="campo-simple-round" aria-label="Sábado selecionado">
      <div className="campo-simple-round-title"><CalendarDays size={22} aria-hidden="true"/><strong>Qual sábado?</strong></div>
      {dados.rodadas.length ? <select aria-label="Selecionar sábado" value={rodada?.id ?? ''} onChange={trocarRodada}>
        {[...dados.rodadas].sort((a,b) => b.data.localeCompare(a.data)).map(r =>
          <option key={r.id} value={r.id}>{dataFormatada(r.data)}</option>)}
      </select> : <p>Não há sábados cadastrados. Crie o primeiro para começar.</p>}
      <div className="campo-simple-summary" aria-label="Resumo do sábado">
        <span><strong>{progresso.presentes}</strong> presentes</span>
        <span><strong>{progresso.timesCompletos}</strong> times completos</span>
        <span><strong>{progresso.jogos}</strong> jogos</span>
      </div>
    </section>

    <button type="button" className="campo-simple-main-action" onClick={() => !rodada ? ir('rodadas') : precisaCadastro ? ir('cadastro') : alternarChegadas()} aria-expanded={rodada && !precisaCadastro ? mostraPresencas : undefined} aria-controls={rodada && !precisaCadastro ? 'ssw-chegadas' : undefined}>
      <UsersRound size={30} aria-hidden="true"/>
      <span><strong>{!rodada ? 'Criar sábado' : precisaCadastro ? 'Cadastrar jogadores' : 'Marcar chegada'}</strong><small>{!rodada ? 'Cadastre o primeiro sábado' : precisaCadastro ? 'Adicione os nomes para começar' : 'Escolha o nome do jogador'}</small></span>
      {mostraPresencas ? <ChevronDown size={26} aria-hidden="true"/> : <ChevronRight size={26} aria-hidden="true"/>}
    </button>

    {mostraPresencas && <section id="ssw-chegadas" className="campo-simple-panel" aria-label="Marcar chegada de jogadores">
      <h2>Quem chegou?</h2>
      <p>Toque em <strong>Chegou</strong> para marcar. Se errar, abra <strong>Já chegaram</strong> e use <strong>Retirar</strong>.</p>
      <div className="campo-chegada-tabs" role="group" aria-label="Filtrar jogadores por chegada">
        <button type="button" className={abaChegada === 'faltam' ? 'is-active' : ''} aria-pressed={abaChegada === 'faltam'} onClick={() => {setAbaChegada('faltam');setBusca('');setMostraTodos(false);}}>Faltam chegar <span>{faltam}</span></button>
        <button type="button" className={abaChegada === 'presentes' ? 'is-active' : ''} aria-pressed={abaChegada === 'presentes'} onClick={() => {setAbaChegada('presentes');setBusca('');setMostraTodos(false);}}>Já chegaram <span>{presentes.length}</span></button>
      </div>
      {erro && <div className="campo-error" role="alert">{erro}</div>}
      {mensagem && <div className="campo-message" role="status">{mensagem}</div>}
      <div className="campo-chegada-search-wrap">
        <label className="campo-search"><Search size={22} aria-hidden="true"/>
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar jogador pelo nome" aria-label="Buscar jogador pelo nome"/>
        </label>
        {busca && <button type="button" className="campo-chegada-clear" onClick={() => setBusca('')}><X size={18}/> Limpar</button>}
      </div>
      <div className="campo-player-list campo-chegada-list" aria-live="polite">
        {visiveis.map(j => {
          const posicao = presentes.indexOf(j.id);
          const protegido = posicao >= 0 && rodada ? atletaEmUso(rodada, j.id) : false;
          return <div key={j.id} className={`campo-player campo-chegada-item ${posicao >= 0 ? 'campo-player--present' : ''}`}>
            <span className="campo-player-avatar" aria-hidden="true">{j.nome.trim().slice(0, 1).toUpperCase()}</span>
            <span className="campo-chegada-name"><strong>{j.nome}</strong>
              {posicao >= 0 && <small>Chegada #{posicao + 1}{protegido ? ' · Já está escalado' : ''}</small>}
            </span>
            {posicao < 0
              ? <button type="button" className="campo-chegada-add" onClick={() => checkin(j.id)} aria-label={`Marcar chegada de ${j.nome}`}><Plus size={19}/> Chegou</button>
              : <button type="button" className="campo-chegada-remove" disabled={protegido} title={protegido ? 'Remova primeiro dos times e súmulas para alterar a chegada' : undefined} onClick={() => retirar(j.id)} aria-label={protegido ? `${j.nome}: presença protegida porque já está escalado` : `Retirar presença de ${j.nome}`}>
                {protegido ? <><Shield size={18}/> Escalado</> : <><Trash2 size={18}/> Retirar</>}
                </button>}
          </div>;
        })}
        {!visiveis.length && <p className="campo-empty">{precisaCadastro ? 'Cadastre o primeiro jogador em Organizar sábado para começar.' : buscaAtiva ? 'Nenhum jogador encontrado. Tente outro nome.' : abaChegada === 'faltam' ? 'Todos os jogadores cadastrados já chegaram.' : 'Ainda não há chegadas registradas.'}</p>}
      </div>
      {!mostraTodos && !buscaAtiva && jogadores.length > 8 &&
        <button type="button" className="campo-inline-action" onClick={() => setMostraTodos(true)}>Mostrar todos ({jogadores.length}) <ChevronDown size={19}/></button>}
      {abaChegada === 'presentes' && <p className="campo-chegada-help">A opção <strong>Retirar</strong> só aparece para quem ainda não está escalado. As outras presenças ficam protegidas.</p>}
      <div className="campo-simple-checkin-actions">
        <button type="button" className="campo-undo" disabled={!historico.desfazer} onClick={desfazer}><Undo2 size={20}/> Desfazer</button>
        <button type="button" className="campo-inline-action" onClick={() => ir('presencas')}>Lista completa <ArrowRight size={19}/></button>
      </div>
    </section>}

    <section className="campo-simple-actions" aria-label="O que você quer fazer?">
      <h2>O que vamos fazer?</h2>
      <div className="campo-simple-action-grid">
        <button type="button" onClick={() => ir('times')}><Shield size={27}/><strong>Montar ou revisar times</strong><ChevronRight size={21}/></button>
        <button type="button" onClick={() => progresso.confrontoPronto ? abrirExpressa(rodada?.id) : ir(progresso.presentes ? 'times' : 'presencas')}><Target size={27}/><strong>{rodada?.jogos.length ? 'Abrir súmula' : 'Criar partida'}</strong><ChevronRight size={21}/></button>
        <button type="button" onClick={verResultados}><Trophy size={27}/><strong>Resultados</strong><ChevronRight size={21}/></button>
        {rodada && rodada.jogos.length > 0 && <button type="button" onClick={() => progresso.confrontoPronto ? abrirExpressa(rodada.id, '__novo_jogo__') : ir('times')}><Plus size={27}/><strong>Criar próxima partida</strong><ChevronRight size={21}/></button>}
      </div>
    </section>

    <section id="ssw-resultados" className="campo-simple-details">
      <button type="button" className="campo-simple-details-toggle" aria-expanded={mostraResultados} aria-controls="ssw-lista-jogos" onClick={() => setMostraResultados(v => !v)}>
        <span><ClipboardList size={23}/><strong>Placares do sábado</strong></span><ChevronDown size={22} className={mostraResultados ? 'is-open' : ''}/>
      </button>
      {mostraResultados && <div id="ssw-lista-jogos" className="campo-simple-results">
        {jogos.length ? jogos.map(j => <button type="button" key={j.id} className="campo-simple-game" onClick={() => ir('partidas', j.id)}>
          <span className="campo-simple-game-number">Jogo {j.numero} · {j.status === 'encerrada' ? 'Encerrado' : 'Em edição'}</span>
          <span className="campo-simple-game-score"><span>{j.timeA}</span><strong>{j.golsA} × {j.golsB}</strong><span>{j.timeB}</span></span>
          <span className="campo-simple-game-link">Abrir detalhes <ArrowRight size={18}/></span>
        </button>) : <p className="campo-empty">Ainda não há jogos neste sábado.</p>}
        <button type="button" className="campo-outline-action" onClick={() => ir('partidas')}>Ver todas as súmulas <ArrowRight size={19}/></button>
      </div>}
    </section>

    <section className="campo-simple-details">
      <button type="button" className="campo-simple-details-toggle" aria-expanded={mostraOpcoes} aria-controls="ssw-opcoes-sabado" onClick={() => setMostraOpcoes(v => !v)}>
        <span><CalendarDays size={23}/><strong>Organizar sábado</strong></span><ChevronDown size={22} className={mostraOpcoes ? 'is-open' : ''}/>
      </button>
      {mostraOpcoes && <div id="ssw-opcoes-sabado" className="campo-simple-extra">
        <div className="campo-operacao-proximo">
          <small>PRÓXIMO PASSO</small><strong>{progresso.passo}</strong>
          <button type="button" onClick={() => ir(progresso.destino)}>Continuar <ArrowRight size={19}/></button>
        </div>
        <ul className="campo-operacao-etapas" aria-label="Conferência das etapas do sábado">
          <li><button type="button" onClick={() => ir('cadastro')}><span><strong>Jogadores</strong><small>{dados.jogadores.length} cadastrados · adicionar um jogador</small></span><Plus size={20}/></button></li>
          <li><button type="button" onClick={() => ir('presencas')}><span><strong>Presenças</strong><small>{progresso.presentes} jogadores com chegada registrada</small></span><UsersRound size={20}/></button></li>
          <li><button type="button" onClick={() => ir('times')}><span><strong>Times</strong><small>{progresso.timesCompletos} completos, com 7 jogadores presentes cada</small></span><Shield size={20}/></button></li>
          <li><button type="button" onClick={() => ir('partidas')}><span><strong>Súmulas</strong><small>{progresso.rascunhos} em edição · {progresso.encerrados} encerradas</small></span><ClipboardList size={20}/></button></li>
          <li><button type="button" onClick={verResultados}><span><strong>Resultados</strong><small>{progresso.encerrados ? 'Confira os placares e a situação de cada jogo' : 'Encerre uma partida para consolidar seu resultado'}</small></span><Trophy size={20}/></button></li>
        </ul>
        <button type="button" onClick={() => ir('rodadas')}>Criar ou escolher outro sábado <ArrowRight size={19}/></button>
      </div>}
    </section>
    <p className="campo-simple-save-note">Confira “Salvo no servidor” antes de fechar o aplicativo.</p>
  </div>;
}
