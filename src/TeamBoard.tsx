import { historicoMontagemVazio, registrarMontagem, moverHistoricoMontagem, montagemFoiEditada } from './HistoricoMontagem';
import { usePapel } from './Permissoes';
import { normalizarBusca } from './Busca';
import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, RotateCcw, RotateCw } from 'lucide-react';
import type { EquipeRodada, Jogador, Rodada } from './SSWStore';
import { atualizarDados, novoId } from './SSWStore';
import { equipesBloqueadas } from './RoundRules';
import { distribuirPorChegadaAteSete, JOGADORES_POR_TIME } from './TimeRules';
import { jogadoresPorChegada } from './CampoRules';
import { assinaturaEquipes, atribuirJogador, copiarEquipes, criarRascunhoTimes, filtrarDistribuicao, proximoNomeTime, reconciliarRascunhoTimes, resumoMontagem, salvarMontagem } from './TeamBoardRules';
import './styles/ssw-montagem-times.css';
import './styles/ssw-operacao-direta.css';
import { guardarMontagem, lerMontagem, limparMontagem, montagemPersistidaNoServidor } from './MontagemDrafts';
import { trocarJogadores } from './TeamBoardRules';

export function TeamBoard({ rodada, jogadores, continuar }: { rodada: Rodada; jogadores: Jogador[]; continuar?: () => void }) {
  const [rascunho, setRascunho] = useState(() => {
    const guardado = lerMontagem(rodada.id);
    return guardado && !montagemPersistidaNoServidor(guardado, rodada.equipes) ? guardado : criarRascunhoTimes(rodada.equipes, novoId);
  });
  const montagemInicial = useRef(rascunho);
  const [erroRascunho, setErroRascunho] = useState('');
  const [timeEmMontagem, setTimeEmMontagem] = useState('');
  const [buscaManual, setBuscaManual] = useState('');
  const [trocaA, setTrocaA] = useState('');
  const [trocaB, setTrocaB] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('disponiveis');
  const [historico, setHistorico] = useState(historicoMontagemVazio);
  const equipes = rascunho.equipes;
  const assinaturaAtual = assinaturaEquipes(rodada.equipes);
  const alterado = assinaturaEquipes(equipes) !== rascunho.origem;
  const ajustesLocais = rascunho.editado && alterado;
  const divergiu = rascunho.origem !== assinaturaAtual;
  const bloqueadas = equipesBloqueadas(rodada);
  const papel=usePapel();
  const podeEditar = papel!=='viewer' && !bloqueadas && !divergiu;
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
      setHistorico(historicoMontagemVazio()); setErro(''); setAviso('');
    }
    const proximo = reconciliarRascunhoTimes(rascunho, rodada.equipes, novoId);
    if(proximo !== rascunho) { montagemInicial.current = proximo; setRascunho(proximo); }
  }, [assinaturaAtual, rodada.equipes, rascunho.origem, ajustesLocais]);

  function alterarEquipes(proxima: EquipeRodada[] | ((anteriores: EquipeRodada[]) => EquipeRodada[]), grupo?: string) {
    const novas = typeof proxima === 'function' ? proxima(equipes) : proxima;
    setHistorico(h => registrarMontagem(h, equipes, novas, grupo));
    setRascunho(atual => ({ ...atual, editado: montagemFoiEditada(montagemInicial.current, novas), equipes: novas }));
  }
  function carregarFormacaoAtual() {
    if (ajustesLocais && !window.confirm('Descartar os ajustes deste formulário e carregar a formação salva atualmente? Nenhuma súmula será modificada.')) return;
    const inicial = criarRascunhoTimes(rodada.equipes, novoId);
    montagemInicial.current = inicial; setRascunho(inicial);
    setHistorico(historicoMontagemVazio()); setErro(''); setBusca(''); setFiltro('todos');
    setAviso('Formação atual carregada. Os ajustes locais anteriores foram descartados.');
  }
  function distribuirPorChegada() {
    if (!podeEditar || !presente.length || !equipes.length) return;
    if (presente.length < equipes.length) { setErro('Há mais times do que jogadores presentes.'); return; }
    if (!window.confirm('Distribuir por ordem de chegada? Isso substituirá a montagem deste formulário. Não é sorteio. Você poderá desfazer e revisar antes de confirmar os times.')) return;
    const grupos = distribuirPorChegadaAteSete(presentesIds, equipes.length);
    alterarEquipes(equipes.map((e, i) => ({ ...e, atletas: grupos[i] })));
    const disponiveis = Math.max(0, presente.length - equipes.length * JOGADORES_POR_TIME);
    setAviso(`Distribuição preparada. ${disponiveis} jogador(es) disponível(is) fora dos times. Confira e confirme os times para continuar.`); setErro('');
  }
  function liberarTodos() {
    if (!podeEditar || !equipes.some(e => e.atletas.length)) return;
    if (!window.confirm('Retirar todos os jogadores dos times neste formulário? A formação só será aplicada após salvar.')) return;
    alterarEquipes(equipes.map(e => ({ ...e, atletas: [] })));
    setAviso('Alocação limpa apenas no formulário. Use Desfazer última alteração para recuperar.'); setErro('');
  }
  function executarHistorico(refazer = false) {
    if (!podeEditar) return;
    const resultado = moverHistoricoMontagem(historico, equipes, refazer);
    if (!resultado) return;
    setHistorico(resultado.historico);
    setRascunho(atual => ({...atual, editado:montagemFoiEditada(montagemInicial.current, resultado.equipes), equipes:resultado.equipes}));
    setAviso(`${refazer ? 'Alteração refeita' : 'Última alteração desfeita'} apenas nesta montagem. Confira os times antes de confirmar.`); setErro('');
  }
  function adicionarEquipe() {
    if (!podeEditar) return;
    if (equipes.length >= 16) { setErro('O limite é de 16 times por sábado.'); return; }
    alterarEquipes(prev => [...prev, { id: novoId(), nome: proximoNomeTime(prev), atletas: [] }]);
    setErro(''); setAviso('');
  }
  function removerEquipe(id: string) {
    if (!podeEditar || equipes.length <= 2) return;
    const equipe = equipes.find(e => e.id === id);
    if (equipe?.atletas.length && !window.confirm(`Remover ${equipe.nome}? Seus jogadores ficarão disponíveis. A alteração só será aplicada após salvar.`)) return;
    alterarEquipes(prev => prev.filter(e => e.id !== id));
    setErro(''); setAviso('');
  }
  function atribuir(id: string, equipeId: string) {
    if (!podeEditar) return;
    try {
      const proxima = atribuirJogador(equipes, presentesIds, id, equipeId);
      if (proxima !== equipes) { alterarEquipes(proxima); }
      setErro(''); setAviso('');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível alterar o time.'); }
  }
  function renomear(equipeId: string, nome: string) {
    if (!podeEditar) return;
    alterarEquipes(prev => prev.map(e => e.id === equipeId ? { ...e, nome } : e), `nome:${equipeId}`);
    setErro(''); setAviso('');
  }
  function trocar() {
    if (!podeEditar) return;
    try {
      const proxima = trocarJogadores(equipes, presentesIds, trocaA, trocaB);
      alterarEquipes(proxima);
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
      const inicial = { equipes: copiarEquipes(salvas), origem: assinaturaEquipes(salvas), editado: false };
      montagemInicial.current = inicial; setRascunho(inicial);
      setHistorico(historicoMontagemVazio()); setErro('');
      limparMontagem(rodada.id);
      const completos = salvas.filter(e => e.atletas.length === JOGADORES_POR_TIME).length;
      setAviso(`${salvas.length} times salvos; ${completos} completos. Confira “Salvo no servidor”.`);
      if (avancar && completos >= 2) continuar?.();
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
  }

  return <section className="team-board montagem-direta" aria-labelledby="team-board-title">
    <header className="montagem-topo"><h3 id="team-board-title">Montar times</h3><span>{ajustesLocais ? 'Alterações por salvar' : 'Formação do sábado'}</span>
    {podeEditar && <div><button type="button" onClick={()=>executarHistorico()} disabled={!historico.anteriores.length} aria-label="Desfazer última alteração"><RotateCcw size={18}/></button><button type="button" onClick={()=>executarHistorico(true)} disabled={!historico.posteriores.length} aria-label="Refazer alteração"><RotateCw size={18}/></button></div>}</header>
    {divergiu && <p role="alert">A formação mudou em outro dispositivo. <button type="button" onClick={carregarFormacaoAtual}>Carregar formação atual</button></p>}
    {(erro || erroRascunho) && <p className="rounds-validation" role="alert">{erro || erroRascunho}</p>}
    {bloqueadas && <p role="status">Esta formação está protegida. Edite a escalação dentro da partida.</p>}
    {aviso && <p className="rounds-notice" role="status">{aviso}</p>}
    <div className="montagem-colunas">
      <aside className="montagem-presentes" aria-label="Lista de presentes para montar os times">
        <header><h4>Presentes</h4><strong>{presente.length}</strong></header>
        <label>Buscar jogador<input type="search" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Nome do jogador"/></label>
        <div className="montagem-filtros"><button type="button" aria-pressed={filtro==='disponiveis'} onClick={()=>setFiltro('disponiveis')}>Disponíveis ({resumo.disponiveis.length})</button><button type="button" aria-pressed={filtro==='todos'} onClick={()=>setFiltro('todos')}>Todos</button></div>
        <div className="montagem-lista">{visiveis.map(j=>{const associado=equipes.find(e=>e.atletas.includes(j.id));return <label key={j.id}><span><small>{rodada.presencas.indexOf(j.id)+1}</small><strong>{j.nome}</strong></span><select aria-label={`Time de ${j.nome}`} disabled={!podeEditar} value={associado?.id??''} onChange={e=>atribuir(j.id,e.target.value)}><option value="">Escolher time</option>{equipes.map(e=><option key={e.id} value={e.id} disabled={e.atletas.length>=7&&e.id!==associado?.id}>{e.nome} · {e.atletas.length}/7</option>)}</select></label>;})}</div>
        {!visiveis.length&&<p>{busca?'Nenhum nome encontrado.':'Todos os presentes estão nos times.'}</p>}
      </aside>
      <div className="montagem-equipes"><div className="multi-team-grid">{equipes.map((e,i)=><article key={e.id} className="multi-team-card">
        <header className="montagem-time-topo"><label>Time {i+1}<input value={e.nome} maxLength={40} disabled={!podeEditar} onBlur={()=>setHistorico(h=>({...h,grupo:undefined}))} onChange={ev=>renomear(e.id,ev.target.value)}/></label><strong>{e.atletas.length}/7</strong>{podeEditar&&equipes.length>2&&<button type="button" onClick={()=>removerEquipe(e.id)} aria-label={`Remover ${e.nome}`}><Trash2 size={17}/></button>}</header>
        <ul className="montagem-escalados">{e.atletas.map(id=><li key={id}><strong>{nomePorId.get(id)??'Jogador'}</strong>{podeEditar&&<select aria-label={`Remanejar ${nomePorId.get(id)}`} value={e.id} onChange={ev=>atribuir(id,ev.target.value)}><option value="">Deixar disponível</option>{equipes.map(t=><option key={t.id} value={t.id} disabled={t.atletas.length>=7&&t.id!==e.id}>{t.nome}</option>)}</select>}</li>)}</ul>
        {podeEditar&&e.atletas.length<7&&<><button type="button" className="ux-manual-open" onClick={()=>{setTimeEmMontagem(timeEmMontagem===e.id?'':e.id);setBuscaManual('');}} aria-expanded={timeEmMontagem===e.id}>{timeEmMontagem===e.id?'Fechar seleção':'+ Escolher jogadores'}</button>{timeEmMontagem===e.id&&<div className="ux-manual-picker"><input aria-label={`Buscar para ${e.nome}`} placeholder="Buscar disponível" value={buscaManual} onChange={ev=>setBuscaManual(ev.target.value)}/>{presente.filter(j=>!equipes.some(t=>t.atletas.includes(j.id))&&normalizarBusca(j.nome).includes(normalizarBusca(buscaManual))).map(j=><button type="button" key={j.id} onClick={()=>atribuir(j.id,e.id)}>{j.nome}<Plus size={16}/></button>)}{!resumo.disponiveis.length&&<p>Nenhum jogador disponível.</p>}</div>}</>}
      </article>)}</div>
      {podeEditar&&<button type="button" className="montagem-adicionar" onClick={adicionarEquipe}><Plus size={18}/>Adicionar time</button>}
      {podeEditar&&<details className="montagem-opcoes"><summary>Trocar jogadores e outras ações</summary><div className="ux-player-swap"><label>Primeiro jogador<select value={trocaA} onChange={ev=>setTrocaA(ev.target.value)}><option value="">Escolha</option>{equipes.map(e=><optgroup key={e.id} label={e.nome}>{e.atletas.map(id=><option key={id} value={id}>{nomePorId.get(id)}</option>)}</optgroup>)}</select></label><label>Segundo jogador<select value={trocaB} onChange={ev=>setTrocaB(ev.target.value)}><option value="">Escolha</option>{equipes.filter(e=>!e.atletas.includes(trocaA)).map(e=><optgroup key={e.id} label={e.nome}>{e.atletas.map(id=><option key={id} value={id}>{nomePorId.get(id)}</option>)}</optgroup>)}</select></label><button type="button" disabled={!trocaA||!trocaB} onClick={trocar}>Trocar jogadores</button></div><button type="button" onClick={liberarTodos}>Limpar escalação</button><button type="button" onClick={distribuirPorChegada}>Distribuir por chegada</button></details>}
      </div>
    </div>
    <footer className="team-board-footer"><span>{resumo.completos} times completos · {resumo.disponiveis.length} disponíveis</span><div className="team-board-buttons">{ajustesLocais&&<button type="button" onClick={carregarFormacaoAtual}>Descartar ajustes</button>}{podeEditar&&<button type="button" onClick={()=>salvar(false)} disabled={!alterado&&!!rodada.equipes.length}>Salvar times</button>}{pronta&&<button type="button" className="team-board-primary" onClick={()=>alterado&&podeEditar?salvar(true):continuar?.()} disabled={divergiu}>Continuar para partidas</button>}</div></footer>
  </section>;
}
