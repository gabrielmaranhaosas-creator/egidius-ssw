import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Check, LockKeyhole, Plus, Save, ShieldCheck, Trash2, UsersRound, RotateCcw, Shuffle, X, Search, ChevronDown } from 'lucide-react';
import type { EquipeRodada, Jogador, Rodada } from './SSWStore';
import { atualizarDados, novoId } from './SSWStore';
import { equipesBloqueadas } from './RoundRules';
import { distribuirPorChegadaAteSete, JOGADORES_POR_TIME } from './TimeRules';
import { jogadoresPorChegada } from './CampoRules';
import { assinaturaEquipes, atribuirJogador, copiarEquipes, criarRascunhoTimes, filtrarDistribuicao, proximoNomeTime, reconciliarRascunhoTimes, resumoMontagem, salvarMontagem } from './TeamBoardRules';
import './styles/ssw-montagem-times.css';
import { guardarMontagem, lerMontagem, limparMontagem, montagemPersistidaNoServidor } from './MontagemDrafts';
import { trocarJogadores } from './TeamBoardRules';

export function TeamBoard({ rodada, jogadores, continuar }: { rodada: Rodada; jogadores: Jogador[]; continuar?: () => void }) {
  const [rascunho, setRascunho] = useState(() => {
    const guardado = lerMontagem(rodada.id);
    return guardado && !montagemPersistidaNoServidor(guardado, rodada.equipes) ? guardado : criarRascunhoTimes(rodada.equipes, novoId);
  });
  const [erroRascunho, setErroRascunho] = useState('');
  const [trocaA, setTrocaA] = useState('');
  const [trocaB, setTrocaB] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [formacaoAnterior, setFormacaoAnterior] = useState<EquipeRodada[] | null>(null);
  const equipes = rascunho.equipes;
  const assinaturaAtual = assinaturaEquipes(rodada.equipes);
  const alterado = assinaturaEquipes(equipes) !== rascunho.origem;
  const ajustesLocais = rascunho.editado && alterado;
  const divergiu = rascunho.origem !== assinaturaAtual;
  const bloqueadas = equipesBloqueadas(rodada);
  const podeEditar = !bloqueadas && !divergiu;
  const presente = jogadoresPorChegada(rodada, jogadores);
  const presentesIds = presente.map(j => j.id);
  const nomePorId = new Map(jogadores.map(j => [j.id, j.nome]));
  const resumo = resumoMontagem(equipes, presentesIds);
  const filtroAtivo = filtro.startsWith('time:') && !equipes.some(e => e.id === filtro.slice(5)) ? 'todos' : filtro;
  const visiveis = filtrarDistribuicao(presente, equipes, busca, filtroAtivo);
  const pronta = resumo.completos >= 2 && !resumo.semPresenca.length;
  useEffect(() => { setErroRascunho(guardarMontagem(rodada.id, rascunho)); }, [rodada.id, rascunho]);

  useEffect(() => {
    if (rascunho.origem !== assinaturaAtual && !ajustesLocais) {
      setFormacaoAnterior(null); setErro(''); setAviso('');
    }
    setRascunho(atual => reconciliarRascunhoTimes(atual, rodada.equipes, novoId));
  }, [assinaturaAtual, rodada.equipes, rascunho.origem, ajustesLocais]);

  function alterarEquipes(proxima: EquipeRodada[] | ((anteriores: EquipeRodada[]) => EquipeRodada[])) {
    setRascunho(atual => ({ ...atual, editado: true,
      equipes: typeof proxima === 'function' ? proxima(atual.equipes) : proxima }));
  }
  function carregarFormacaoAtual() {
    if (ajustesLocais && !window.confirm('Descartar os ajustes deste formulário e carregar a formação salva atualmente? Nenhuma súmula será modificada.')) return;
    setRascunho(criarRascunhoTimes(rodada.equipes, novoId));
    setFormacaoAnterior(null); setErro(''); setBusca(''); setFiltro('todos');
    setAviso('Formação atual carregada. Os ajustes locais anteriores foram descartados.');
  }
  function distribuirPorChegada() {
    if (!podeEditar || !presente.length || !equipes.length) return;
    if (presente.length < equipes.length) { setErro('Há mais times do que jogadores presentes.'); return; }
    if (equipes.some(e => e.atletas.length) && !window.confirm('Redistribuir os presentes em rodízio por ordem de chegada? A formação só será aplicada após salvar.')) return;
    setFormacaoAnterior(copiarEquipes(equipes));
    const grupos = distribuirPorChegadaAteSete(presentesIds, equipes.length);
    alterarEquipes(equipes.map((e, i) => ({ ...e, atletas: grupos[i] })));
    const disponiveis = Math.max(0, presente.length - equipes.length * JOGADORES_POR_TIME);
    setAviso(`Distribuição preparada. ${disponiveis} jogador(es) disponível(is) fora dos times. Confira e confirme os times para continuar.`); setErro('');
  }
  function liberarTodos() {
    if (!podeEditar || !equipes.some(e => e.atletas.length)) return;
    if (!window.confirm('Retirar todos os jogadores dos times neste formulário? A formação só será aplicada após salvar.')) return;
    setFormacaoAnterior(copiarEquipes(equipes));
    alterarEquipes(equipes.map(e => ({ ...e, atletas: [] })));
    setAviso('Alocação limpa apenas no formulário. Use Desfazer organização para recuperar.'); setErro('');
  }
  function desfazerOrganizacao() {
    if (!podeEditar || !formacaoAnterior) return;
    alterarEquipes(copiarEquipes(formacaoAnterior)); setFormacaoAnterior(null);
    setAviso('Última organização local restaurada. Confira e confirme para aplicar.'); setErro('');
  }
  function adicionarEquipe() {
    if (!podeEditar) return;
    if (equipes.length >= 16) { setErro('O limite é de 16 times por sábado.'); return; }
    alterarEquipes(prev => [...prev, { id: novoId(), nome: proximoNomeTime(prev), atletas: [] }]);
    setErro(''); setAviso('');
  }
  function removerEquipe(id: string) {
    if (!podeEditar || equipes.length <= 2) return;
    alterarEquipes(prev => prev.filter(e => e.id !== id));
    setErro(''); setAviso('');
  }
  function atribuir(id: string, equipeId: string) {
    if (!podeEditar) return;
    try {
      const proxima = atribuirJogador(equipes, presentesIds, id, equipeId);
      if (proxima !== equipes) alterarEquipes(proxima);
      setErro(''); setAviso('');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível alterar o time.'); }
  }
  function renomear(equipeId: string, nome: string) {
    if (!podeEditar) return;
    alterarEquipes(prev => prev.map(e => e.id === equipeId ? { ...e, nome } : e));
    setErro(''); setAviso('');
  }
  function trocar() {
    if (!podeEditar) return;
    try {
      const proxima = trocarJogadores(equipes, presentesIds, trocaA, trocaB);
      setFormacaoAnterior(copiarEquipes(equipes)); alterarEquipes(proxima);
      setAviso('Jogadores trocados. Confira os times e confirme para aplicar.'); setErro(''); setTrocaA(''); setTrocaB('');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível trocar os jogadores.'); }
  }
  function salvar(avancar = false) {
    if (!podeEditar) { setErro('Confira e carregue a formação salva antes de aplicar novos ajustes.'); return; }
    try {
      let salvas: EquipeRodada[] = [];
      atualizarDados(d => {
        const novo = salvarMontagem(d, rodada.id, rascunho.origem, equipes);
        salvas = novo.rodadas.find(r => r.id === rodada.id)!.equipes;
        return novo;
      }, 'salvamento dos times do sábado');
      setRascunho({ equipes: copiarEquipes(salvas), origem: assinaturaEquipes(salvas), editado: false });
      setFormacaoAnterior(null); setErro('');
      limparMontagem(rodada.id);
      const completos = salvas.filter(e => e.atletas.length === JOGADORES_POR_TIME).length;
      setAviso(`${salvas.length} times salvos; ${completos} completos. Confira “Salvo no servidor”.`);
      if (avancar && completos >= 2) continuar?.();
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
  }

  return <section className="team-board" aria-labelledby="team-board-title">
    <div className="team-board-heading"><div className="team-board-heading-text">
      <span className="team-board-kicker"><ShieldCheck size={18}/> EQUIPES FIXAS DA RODADA</span>
      <h3 id="team-board-title">Times do sábado</h3>
      <p>Distribua os presentes em times de <strong>7 jogadores</strong>. Confira a formação e confirme para continuar às partidas.</p>
    </div><span className={`team-board-status ${bloqueadas ? 'team-board-status--locked' : !ajustesLocais && rodada.equipes.length ? 'team-board-status--saved' : ''}`}>
      {bloqueadas ? <><LockKeyhole size={15}/> Protegidas</> : divergiu ? 'Revisão necessária' : ajustesLocais ? 'Ajustes por salvar' : rodada.equipes.length ? <><Check size={15}/> Salvas</> : 'Não definidas'}
    </span></div>
    {bloqueadas && <p className="team-board-help team-board-help--locked"><LockKeyhole size={18}/> A formação salva está protegida por jogos com resultados. Ajustes deste formulário não serão aplicados a esses jogos.</p>}
    {divergiu && <div className="ssw-times-conflito" role="alert">
      <strong>A formação salva mudou enquanto você montava os times.</strong>
      <p>Seus ajustes locais foram mantidos neste formulário. Confira a formação atual antes de continuar.</p>
      <button type="button" onClick={carregarFormacaoAtual}><RotateCcw size={18}/> Carregar formação atual</button>
      <details><summary>Ver formação salva</summary><ul>{rodada.equipes.map(e => <li key={e.id}><strong>{e.nome}</strong>: {e.atletas.map(id => nomePorId.get(id) ?? 'Jogador não localizado').join(' · ') || 'Sem jogadores'}</li>)}</ul></details>
    </div>}
    {resumo.semPresenca.length > 0 && <p className="rounds-validation" role="alert">Há {resumo.semPresenca.length} jogador(es) nesta montagem sem presença válida no sábado. Confira a lista antes de salvar ou descarte os ajustes para carregar a formação atual.</p>}
    {erro && <p className="rounds-validation" role="alert">{erro}</p>}
    {erroRascunho && <p className="rounds-validation" role="alert">{erroRascunho}</p>}
    {ajustesLocais && !erroRascunho && <p className="ux-draft-note" role="status">Rascunho guardado neste navegador. Os times ainda precisam ser confirmados.</p>}
    {aviso && <p className="rounds-notice" role="status">{aviso}</p>}
    <div className="team-board-count"><UsersRound size={19}/> {presente.length} presentes · {equipes.length} times · {resumo.escalados} escalados · {resumo.disponiveis.length} disponíveis</div>
    <div className="multi-team-grid">
      {equipes.map((e, i) => {
        const presencasValidas = e.atletas.every(id => presentesIds.includes(id));
        const completo = e.atletas.length === JOGADORES_POR_TIME && presencasValidas;
        return <div key={e.id} className="multi-team-card">
          <div className="multi-team-head"><span className="multi-team-index">TIME {String(i+1).padStart(2,'0')}</span>
            {podeEditar && equipes.length > 2 && <button type="button" className="multi-team-remove" onClick={() => removerEquipe(e.id)} aria-label={`Remover ${e.nome}`}><Trash2 size={18}/></button>}
          </div>
          <label className="multi-team-name">Nome do time<input value={e.nome} maxLength={40} disabled={!podeEditar} onChange={(ev: ChangeEvent<HTMLInputElement>) => renomear(e.id, ev.target.value)}/></label>
          <div className="multi-team-roster"><strong className={completo ? 'egc8-ready' : 'egc8-pending'}>{e.atletas.length}/7 jogadores · {!presencasValidas ? 'Confira as presenças' : completo ? 'Time completo' : e.atletas.length > 7 ? 'Acima do limite' : `Faltam ${Math.max(0, 7 - e.atletas.length)}`}</strong><p>{e.atletas.length ? e.atletas.map(id => nomePorId.get(id) ?? 'Jogador não localizado').join(' · ') : 'Nenhum jogador escalado'}</p><small>O goleiro será escolhido entre esses 7 na súmula.</small></div>
        </div>;
      })}
      {podeEditar && <button type="button" className="multi-team-add" onClick={adicionarEquipe}><Plus size={25}/><strong>Adicionar time</strong><small>Até 16 equipes por sábado</small></button>}
    </div>
    {podeEditar && presente.length > 0 && <div className="quick-team-tools" role="group" aria-label="Ferramentas rápidas para montagem dos times">
      <div><strong>Montagem inteligente</strong><small>Até 7 por time, seguindo a chegada. Confira e confirme para aplicar.</small></div>
      <button type="button" onClick={distribuirPorChegada} disabled={presente.length < equipes.length}><Shuffle size={19}/> Distribuir automaticamente</button>
      <button type="button" onClick={liberarTodos} disabled={!equipes.some(e => e.atletas.length)}><X size={19}/> Limpar escalação</button>
      <button type="button" onClick={desfazerOrganizacao} disabled={!formacaoAnterior}><RotateCcw size={19}/> Desfazer organização</button>
    </div>}
    {presente.length > equipes.length * 7 && podeEditar && <p className="ux-draft-note">Com {equipes.length} times, {presente.length - equipes.length * 7} presentes ficarão disponíveis. <button type="button" onClick={adicionarEquipe} disabled={equipes.length >= 16}>Adicionar mais um time</button> Depois, distribua novamente.</p>}
    {!presente.length ? <p className="team-board-empty">Volte à etapa Presentes para confirmar quem chegou.</p> : <details open className="multi-assignment ssw-times-distribuicao">
      <summary><span><strong>Escolher jogadores e fazer trocas</strong><small>{resumo.disponiveis.length} disponíveis · {resumo.completos} times completos</small></span><ChevronDown size={21} aria-hidden="true"/></summary>
      <div className="ssw-times-distribuicao-conteudo">
        {podeEditar && resumo.escalados >= 2 && <fieldset className="ux-player-swap"><legend>Trocar jogadores entre dois times</legend>
          <label>Primeiro jogador<select aria-label="Primeiro jogador da troca" value={trocaA} onChange={e => { setTrocaA(e.target.value); setTrocaB(''); }}><option value="">Escolha um jogador</option>{equipes.map(e => <optgroup key={e.id} label={e.nome}>{e.atletas.map(id => <option key={id} value={id}>{nomePorId.get(id)}</option>)}</optgroup>)}</select></label>
          <label>Trocar com<select aria-label="Segundo jogador da troca" value={trocaB} onChange={e => setTrocaB(e.target.value)}><option value="">Escolha o outro jogador</option>{equipes.filter(e => !e.atletas.includes(trocaA)).map(e => <optgroup key={e.id} label={e.nome}>{e.atletas.map(id => <option key={id} value={id}>{nomePorId.get(id)}</option>)}</optgroup>)}</select></label>
          {trocaA && trocaB && <p>{nomePorId.get(trocaA)} ↔ {nomePorId.get(trocaB)}. Os demais jogadores permanecem nos mesmos times.</p>}
          <button type="button" disabled={!trocaA || !trocaB} onClick={trocar}>Trocar estes jogadores</button>
        </fieldset>}
        <p>Busque um nome ou filtre a lista. Os números mostram a posição real de chegada.</p>
        <div className="ssw-times-filtros">
          <label><span>Buscar jogador</span><div><Search size={19} aria-hidden="true"/><input type="search" aria-label="Buscar jogador na distribuição" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome do jogador"/></div></label>
          <label><span>Mostrar</span><select aria-label="Filtrar distribuição" value={filtroAtivo} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos os presentes ({presente.length})</option><option value="disponiveis">Disponíveis ({resumo.disponiveis.length})</option>{equipes.map(e => <option key={e.id} value={`time:${e.id}`}>{e.nome} ({e.atletas.length}/7)</option>)}</select></label>
          {(busca || filtroAtivo !== 'todos') && <button type="button" onClick={() => { setBusca(''); setFiltro('todos'); }}><X size={18}/> Limpar filtros</button>}
        </div>
        <p className="ssw-times-total-filtrado">{visiveis.length} de {presente.length} jogadores</p>
        <div className="multi-assignment-grid">{visiveis.map(j => {
          const associado = equipes.find(e => e.atletas.includes(j.id))?.id ?? '';
          return <label key={j.id} className="multi-assignment-person"><span><small>#{String(rodada.presencas.indexOf(j.id)+1).padStart(2,'0')}</small><strong>{j.nome}</strong></span>
            <select disabled={!podeEditar} value={associado} onChange={(ev: ChangeEvent<HTMLSelectElement>) => atribuir(j.id, ev.target.value)} aria-label={`Time de ${j.nome}`}>
              <option value="">Disponível / sem time</option>{equipes.map(e => <option key={e.id} value={e.id} disabled={e.atletas.length >= JOGADORES_POR_TIME && associado !== e.id}>{e.nome} · {e.atletas.length}/7{e.atletas.length >= JOGADORES_POR_TIME ? ' · Completo' : ''}</option>)}
            </select></label>;
        })}</div>
        {!visiveis.length && <p className="ssw-times-sem-resultado">{filtroAtivo === 'disponiveis' && !busca ? 'Todos os presentes estão escalados. Use Todos os presentes para consultar a distribuição.' : 'Nenhum jogador corresponde à busca e ao filtro selecionados.'}</p>}
      </div>
    </details>}
    <div className="team-board-footer"><p>{pronta ? `${resumo.completos} times completos. ${resumo.disponiveis.length} jogadores disponíveis fora da formação.` : `Complete pelo menos dois times de 7 para criar uma partida. Há ${presente.length} presentes.`}</p>
      <div className="team-board-buttons">{ajustesLocais && <button type="button" className="team-board-secondary" onClick={carregarFormacaoAtual}><RotateCcw size={18}/> Descartar ajustes</button>}
        {podeEditar && <button type="button" className="team-board-secondary" disabled={!alterado && !!rodada.equipes.length} onClick={() => salvar(false)}><Save size={18}/> {pronta ? 'Salvar sem continuar' : 'Guardar montagem incompleta'}</button>}
        {pronta && <button type="button" className="team-board-primary" disabled={divergiu || bloqueadas && ajustesLocais} onClick={() => alterado && podeEditar ? salvar(true) : continuar?.()}><Check size={18}/> {bloqueadas ? 'Continuar para partidas' : 'Confirmar times e continuar'}</button>}
      </div>
    </div>
  </section>;
}
