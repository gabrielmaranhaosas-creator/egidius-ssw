import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarDays, CheckCircle2, MapPin, Plus, RefreshCcw,
  Shield, Trash2, UsersRound, Clock3, BusFront, Save, Info, Goal, ArrowLeftRight, LockKeyhole,
} from 'lucide-react';
import { novoId, useDadosSSW } from './SSWStore';
import './ViagemPage.css';
import './styles/ssw-viagem-sumula-09h2c.css';

type Pessoa = { id: string; nome: string; origem: 'cadastro' | 'convidado' };
type Equipe = { nome: string; atletas: string[]; goleiro: string | null };
type GolEvento = { tipo:'gol'; id:string; time:'timeA'|'timeB'; jogador_id:string; minuto:number|null };
type TrocaEvento = { tipo:'substituicao'; id:string; time:'timeA'|'timeB'; saiu:string; entrou:string; minuto:number|null };
type AnularEvento = { tipo:'anular_gol'; id:string; gol_id:string };
type Evento = GolEvento|TrocaEvento|AnularEvento;
type Sumula = {
  status:'preparacao'|'em_andamento'|'encerrada';
  titularesA:string[]; titularesB:string[]; movimentos:Evento[];
  iniciadoEm:string; encerradoEm:string;
};
const SUMULA_VAZIA:Sumula = {status:'preparacao',titularesA:[],titularesB:[],movimentos:[],iniciadoEm:'',encerradoEm:''};
function minutoInformado(texto:string):number|null|undefined {
  if (!texto.trim()) return null;
  const n=Number(texto);
  return Number.isInteger(n) && n>=0 && n<=180 ? n : undefined;
}
type Viagem = {
  titulo: 'VIAGEM - SSW'; data: '2026-10-24'; cidade: 'Goiânia'; uf: 'GO';
  modalidade: 'futebol-de-campo'; jogadoresPorTime: 11;
  horario: string; local: string; observacoes: string; pessoas: Pessoa[];
  timeA: Equipe; timeB: Equipe; sumula?: Sumula;
};
type Doc = { revision: number; data: Viagem };
type Details = { horario: string; local: string; observacoes: string; nomeA: string; nomeB: string };

function details(d: Viagem): Details {
  return { horario: d.horario, local: d.local, observacoes: d.observacoes, nomeA: d.timeA.nome, nomeB: d.timeB.nome };
}
function parseError(raw: unknown, fallback: string): string {
  if (raw && typeof raw === 'object' && 'detail' in raw) {
    const value = (raw as { detail: unknown }).detail;
    if (typeof value === 'string') return value;
  }
  return fallback;
}
function fullname(d: Viagem, id: string): string {
  return d.pessoas.find(p => p.id === id)?.nome ?? 'Jogador não encontrado';
}

export function ViagemPage() {
  const { jogadores } = useDadosSSW();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [csrf, setCsrf] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editDetails, setEditDetails] = useState(false);
  const [form, setForm] = useState<Details>({ horario:'', local:'', observacoes:'', nomeA:'SSW — Time 1', nomeB:'SSW — Time 2' });
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [guestName, setGuestName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<'timeA'|'timeB'>('timeA');
  const [minute, setMinute] = useState('');
  const [swapTeam, setSwapTeam] = useState<'timeA'|'timeB'>('timeA');
  const [swapOut, setSwapOut] = useState('');
  const [swapIn, setSwapIn] = useState('');

  async function refresh() {
    setError(''); setMessage('');
    setLoading(true);
    try {
      const authR = await fetch('/api/auth/status', { credentials:'same-origin', cache:'no-store' });
      if (!authR.ok) throw new Error('Não foi possível verificar o acesso à viagem.');
      const auth = await authR.json() as { authenticated?: boolean; csrf?: string };
      if (!auth.authenticated || !auth.csrf) throw new Error('Sua sessão expirou. Entre novamente no EGIDIUS.');
      const response = await fetch('/api/viagem-ssw', { credentials:'same-origin', cache:'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar a viagem no servidor.');
      const latest = await response.json() as Doc;
      setCsrf(auth.csrf); setDoc(latest); setForm(details(latest.data));
      setEditDetails(false);
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const sumula = doc?.data.sumula ?? SUMULA_VAZIA;
  const anulados = useMemo(() => new Set(sumula.movimentos.filter((m):m is AnularEvento=>m.tipo==='anular_gol').map(m=>m.gol_id)), [sumula]);
  const gols = useMemo(() => sumula.movimentos.filter((m):m is GolEvento=>m.tipo==='gol' && !anulados.has(m.id)), [sumula,anulados]);
  const placarA = gols.filter(m=>m.time==='timeA').length;
  const placarB = gols.filter(m=>m.time==='timeB').length;
  const emJogo = sumula.status==='em_andamento';
  const emPreparacao = sumula.status==='preparacao';
  const used = useMemo(() => new Set([...(doc?.data.timeA.atletas ?? []), ...(doc?.data.timeB.atletas ?? [])]), [doc]);
  const candidates = useMemo(() => {
    const choices = new Map<string,string>();
    for (const j of jogadores) if (!used.has(j.id)) choices.set(j.id, j.nome);
    for (const p of doc?.data.pessoas ?? []) if (!used.has(p.id)) choices.set(p.id, p.nome);
    return [...choices.entries()].sort((a,b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [jogadores, doc, used]);

  async function save(next: Viagem, confirmMessage: string): Promise<boolean> {
    if (!doc || busy || !csrf) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/viagem-ssw', {
        method: 'PUT', credentials:'same-origin',
        headers: { 'Content-Type':'application/json', 'X-CSRF-Token':csrf },
        body: JSON.stringify({ expected_revision:doc.revision, data:next }),
      });
      if (!response.ok) {
        let raw: unknown = null;
        try { raw = await response.json(); } catch { /* resposta sem JSON */ }
        throw new Error(parseError(raw, `Não foi possível salvar (HTTP ${response.status}).`));
      }
      const result = await response.json() as { revision:number };
      setDoc({ revision:result.revision, data:next });
      setMessage(confirmMessage);
      setSelectedPlayer(''); setGuestName('');
      return true;
    } catch(e) { setError((e as Error).message + ' Se outra pessoa alterou a viagem, use Atualizar.'); return false; }
    finally { setBusy(false); }
  }

  async function iniciarPartida() {
    if (!doc || !window.confirm('Iniciar a partida SSW × SSW? As escalações iniciais serão registradas.')) return;
    const v=doc.data;
    if (v.timeA.atletas.length!==11 || v.timeB.atletas.length!==11 || !v.timeA.goleiro || !v.timeB.goleiro) {
      setError('Complete os 11 jogadores e defina um goleiro por time antes de iniciar.'); return;
    }
    await save({...v, sumula:{status:'em_andamento',titularesA:[...v.timeA.atletas],titularesB:[...v.timeB.atletas],movimentos:[],iniciadoEm:new Date().toISOString(),encerradoEm:''}}, 'Partida iniciada. Súmula aberta.');
  }

  async function registrarGol(time:'timeA'|'timeB',jogador_id:string) {
    if (!doc || !emJogo) return;
    const m=minutoInformado(minute);
    if (m===undefined) {setError('Informe um minuto inteiro entre 0 e 180, ou deixe vazio.');return;}
    const evento:GolEvento={tipo:'gol',id:novoId(),time,jogador_id,minuto:m};
    if (!window.confirm(`Confirmar gol de ${fullname(doc.data,jogador_id)} pelo ${doc.data[time].nome}?`)) return;
    await save({...doc.data,sumula:{...sumula,movimentos:[...sumula.movimentos,evento]}}, 'Gol registrado no placar.');
  }

  async function anularGol(gol:GolEvento) {
    if (!doc || !emJogo || !window.confirm(`Anular o gol de ${fullname(doc.data,gol.jogador_id)}? O histórico ficará preservado.`)) return;
    const evento:AnularEvento={tipo:'anular_gol',id:novoId(),gol_id:gol.id};
    await save({...doc.data,sumula:{...sumula,movimentos:[...sumula.movimentos,evento]}}, 'Gol anulado. O histórico da correção foi mantido.');
  }

  async function fazerSubstituicao() {
    if (!doc || !emJogo || !swapOut || !swapIn) return;
    const m=minutoInformado(minute);
    if (m===undefined) {setError('Minuto inválido. Use 0 a 180 ou deixe vazio.');return;}
    const atual=doc.data[swapTeam];
    if (!atual.atletas.includes(swapOut) || used.has(swapIn) || !doc.data.pessoas.some(p=>p.id===swapIn)) {
      setError('Selecione alguém em campo para sair e um integrante disponível para entrar.');return;
    }
    if (!window.confirm(`Substituir ${fullname(doc.data,swapOut)} por ${fullname(doc.data,swapIn)}?`)) return;
    const titulares=atual.atletas.map(id=>id===swapOut?swapIn:id);
    const goleiro=atual.goleiro===swapOut?swapIn:atual.goleiro;
    const evento:TrocaEvento={tipo:'substituicao',id:novoId(),time:swapTeam,saiu:swapOut,entrou:swapIn,minuto:m};
    const ok=await save({...doc.data,[swapTeam]:{...atual,atletas:titulares,goleiro},sumula:{...sumula,movimentos:[...sumula.movimentos,evento]}}, 'Substituição registrada.');
    if (ok) {setSwapOut('');setSwapIn('');}
  }

  async function encerrarPartida() {
    if (!doc || !emJogo || !window.confirm(`Encerrar a partida com o placar ${placarA} × ${placarB}? Será possível reabrir com confirmação.`)) return;
    await save({...doc.data,sumula:{...sumula,status:'encerrada',encerradoEm:new Date().toISOString()}}, 'Partida encerrada e resultado preservado.');
  }

  async function reabrirPartida() {
    if (!doc || sumula.status!=='encerrada' || !window.confirm('Reabrir a súmula encerrada para corrigir registros?')) return;
    await save({...doc.data,sumula:{...sumula,status:'em_andamento',encerradoEm:''}}, 'Partida reaberta para correções.');
  }

  async function assign() {
    if (!doc || !selectedPlayer || !emPreparacao) return;
    const team = doc.data[selectedTeam];
    if (team.atletas.length >= 11) { setError('Este time já tem 11 jogadores.'); return; }
    if (used.has(selectedPlayer)) { setError('Esse jogador já foi escalado.'); return; }
    const existing = doc.data.pessoas.find(p => p.id === selectedPlayer);
    const registered = jogadores.find(p => p.id === selectedPlayer);
    if (!existing && !registered) { setError('Jogador não encontrado.'); return; }
    const next: Viagem = {
      ...doc.data,
      pessoas: existing ? doc.data.pessoas : [...doc.data.pessoas, { id:registered!.id, nome:registered!.nome, origem:'cadastro' }],
      [selectedTeam]: { ...team, atletas:[...team.atletas, selectedPlayer] },
    };
    await save(next, 'Jogador adicionado ao time.');
  }

  async function addGuest() {
    if (!doc || !emPreparacao) return;
    const name = guestName.trim();
    if (!name || name.length > 140) { setError('Informe o nome do integrante (até 140 caracteres).'); return; }
    if (doc.data[selectedTeam].atletas.length >= 11) { setError('Este time já está completo.'); return; }
    if (doc.data.pessoas.some(p => p.nome.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')) || jogadores.some(p=>p.nome.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))) {
      setError('Já existe um jogador com esse nome. Escolha-o na lista acima.');return;
    }
    const id = `convidado-${novoId()}`;
    await save({ ...doc.data,
      pessoas:[...doc.data.pessoas,{id,nome:name,origem:'convidado'}],
      [selectedTeam]:{...doc.data[selectedTeam],atletas:[...doc.data[selectedTeam].atletas,id]},
    }, 'Integrante adicionado ao time e à relação.');
  }

  async function remove(teamId: 'timeA' | 'timeB', playerId:string) {
    if (!doc || !emPreparacao || !window.confirm(`Retirar ${fullname(doc.data,playerId)} deste time? Ele poderá ser escolhido novamente.`)) return;
    const team = doc.data[teamId];
    await save({ ...doc.data, [teamId]:{...team,atletas:team.atletas.filter(x=>x!==playerId),goleiro:team.goleiro===playerId?null:team.goleiro} }, 'Jogador retirado da escalação.');
  }

  async function saveDetails() {
    if (!doc || !emPreparacao) return;
    const nomeA = form.nomeA.trim(), nomeB=form.nomeB.trim();
    if (!nomeA || !nomeB || nomeA.toLocaleLowerCase('pt-BR') === nomeB.toLocaleLowerCase('pt-BR')) {
      setError('Informe dois nomes diferentes para os times.'); return;
    }
    const saved = await save({ ...doc.data, local:form.local.trim(), horario:form.horario.trim(), observacoes:form.observacoes.trim(),
      timeA:{...doc.data.timeA,nome:nomeA},timeB:{...doc.data.timeB,nome:nomeB}},'Detalhes da viagem salvos.');
    if (saved) setEditDetails(false);
  }

  const travel = doc?.data;
  return <div className="ssw-trip" aria-label="Viagem SSW">
    <section className="ssw-trip-hero">
      <div className="ssw-trip-eyebrow"><BusFront size={19}/> EVENTO ESPECIAL · SÁBADO SHOW</div>
      <div className="ssw-trip-hero-row">
        <div><h1>VIAGEM <span>– SSW</span></h1><p>Futebol de campo · Partida interna · SSW × SSW</p></div>
        <img src="/ssw-escudo-real.jpg" alt="Escudo original do Sábado Show"/>
      </div>
      <div className="ssw-trip-info">
        <div><CalendarDays size={21}/><strong>Sábado, 24 de outubro de 2026</strong></div>
        <div><MapPin size={21}/><strong>Goiânia – GO</strong></div>
        <div><UsersRound size={21}/><strong>Dois times do SSW · 11 × 11</strong></div>
      </div>
    </section>

    {error && <div role="alert" className="ssw-trip-alert ssw-trip-alert--error">{error}</div>}
    {message && <div role="status" className="ssw-trip-alert ssw-trip-alert--ok"><CheckCircle2 size={19}/>{message}</div>}
    {loading && <section className="ssw-trip-panel">Carregando informações da viagem…</section>}
    {!loading && !travel && <section className="ssw-trip-panel"><p>Os dados da viagem não foram carregados.</p><button type="button" onClick={()=>void refresh()}>Tentar novamente</button></section>}
    {travel && <>
      <section className="ssw-trip-panel">
        <div className="ssw-trip-panel-head"><h2>Informações da viagem</h2><button type="button" className="ssw-trip-outline" disabled={busy} onClick={()=>void refresh()}><RefreshCcw size={18}/> Atualizar</button></div>
        <div className="ssw-trip-fields">
          <div><Clock3 size={19}/><span><small>Horário</small><strong>{travel.horario || 'A definir'}</strong></span></div>
          <div><MapPin size={19}/><span><small>Campo / local</small><strong>{travel.local || 'A definir'}</strong></span></div>
        </div>
        {travel.observacoes && <p className="ssw-trip-note">{travel.observacoes}</p>}
        <button type="button" className="ssw-trip-link" disabled={!emPreparacao} onClick={()=>{setForm(details(travel));setEditDetails(v=>!v)}} aria-expanded={editDetails}>
          {editDetails?'Fechar edição':'Editar horário, local e nomes dos times'} <ArrowRight size={18}/>
        </button>
        {editDetails && <div className="ssw-trip-edit">
          <label>Horário (quando definido)<input value={form.horario} maxLength={40} onChange={(e: { target: { value: string } })=>setForm(x=>({...x,horario:e.target.value}))} placeholder="Ex.: 9h"/></label>
          <label>Campo / local<input value={form.local} maxLength={160} onChange={(e: { target: { value: string } })=>setForm(x=>({...x,local:e.target.value}))} placeholder="A definir"/></label>
          <label>Nome do primeiro time do SSW<input value={form.nomeA} maxLength={80} onChange={(e: { target: { value: string } })=>setForm(x=>({...x,nomeA:e.target.value}))}/></label>
          <label>Nome do segundo time do SSW<input value={form.nomeB} maxLength={80} onChange={(e: { target: { value: string } })=>setForm(x=>({...x,nomeB:e.target.value}))}/></label>
          <label>Recado para os participantes<textarea rows={3} maxLength={1200} value={form.observacoes} onChange={(e: { target: { value: string } })=>setForm(x=>({...x,observacoes:e.target.value}))}/></label>
          <button type="button" className="ssw-trip-primary" disabled={busy} onClick={()=>void saveDetails()}><Save size={19}/> Salvar informações</button>
        </div>}
      </section>

      <section className="ssw-trip-panel">
        <div className="ssw-trip-panel-head"><div><h2>Escalar integrantes do SSW</h2><p>Divida os integrantes da viagem em dois times do próprio SSW. São 11 jogadores por equipe, incluindo o goleiro.</p></div></div>
        <div className="ssw-trip-counts"><span><strong>{travel.timeA.atletas.length}/11</strong> {travel.timeA.nome}</span><span><strong>{travel.timeB.atletas.length}/11</strong> {travel.timeB.nome}</span></div>
        <details className="ssw-trip-guest">
          <summary>Conferir integrantes da viagem ({travel.pessoas.length})</summary>
          <div className="ssw-trip-list" aria-label="Relação de integrantes do SSW">
            {[...travel.pessoas].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map((p,i)=><div className="ssw-trip-player" key={p.id}>
              <span className="ssw-trip-player-num">{i+1}</span>
              <span className="ssw-trip-player-name">{p.nome}</span>
              <span>{used.has(p.id) ? 'Escalado' : 'Não escalado'}</span>
            </div>)}
          </div>
        </details>
        {!emPreparacao && <p className="ssw-trip-lock-hint"><LockKeyhole size={18}/> Escalações iniciais bloqueadas. Faça alterações pela área de substituições da súmula.</p>}
        <div className="ssw-trip-form">
          <label>Qual time do SSW?
            <select value={selectedTeam} onChange={(e: { target: { value: string } })=>setSelectedTeam(e.target.value as 'timeA'|'timeB')}>
              <option value="timeA">{travel.timeA.nome}</option><option value="timeB">{travel.timeB.nome}</option>
            </select>
          </label>
          <label>Integrante do SSW
            <select value={selectedPlayer} onChange={(e: { target: { value: string } })=>setSelectedPlayer(e.target.value)}>
              <option value="">Selecione um jogador</option>
              {candidates.map(([id,name])=><option value={id} key={id}>{name}</option>)}
            </select>
          </label>
          <button type="button" className="ssw-trip-primary" disabled={busy||!emPreparacao||!selectedPlayer||travel[selectedTeam].atletas.length>=11} onClick={()=>void assign()}><Plus size={19}/> Adicionar ao time</button>
        </div>
        <details className="ssw-trip-guest">
          <summary>Adicionar outro integrante do SSW à relação</summary>
          <div className="ssw-trip-guest-row"><label>Nome do integrante<input value={guestName} maxLength={140} onChange={(e: { target: { value: string } })=>setGuestName(e.target.value)} placeholder="Nome ou apelido"/></label>
            <button type="button" disabled={busy||!emPreparacao||!guestName.trim()||travel[selectedTeam].atletas.length>=11} onClick={()=>void addGuest()}>Adicionar</button></div>
        </details>
      </section>

      <div className="ssw-trip-teams">
        {(['timeA','timeB'] as const).map((key,index)=>{
          const team = travel[key];
          return <section className="ssw-trip-panel ssw-trip-team" key={key}>
            <div className="ssw-trip-panel-head"><div><div className="ssw-trip-team-tag"><Shield size={18}/> TIME {index+1}</div><h2>{team.nome}</h2></div><strong className="ssw-trip-indicator">{team.atletas.length}/11</strong></div>
            <details className="ssw-release-roster"><summary>Ver jogadores e escolher goleiro <span>{team.atletas.length}/11</span></summary>
            <div className="ssw-trip-progress" role="progressbar" aria-valuemin={0} aria-valuemax={11} aria-valuenow={team.atletas.length} aria-label={`Jogadores no ${team.nome}`}><span style={{width:`${team.atletas.length/11*100}%`}}/></div>
            {team.atletas.length===0 ? <p className="ssw-trip-empty">Nenhum jogador escalado. Utilize o formulário acima.</p> : <div className="ssw-trip-list">{team.atletas.map((id,i)=><div className="ssw-trip-player" key={id}>
              <span className="ssw-trip-player-num">{i+1}</span><span className="ssw-trip-player-name">{fullname(travel,id)} {team.goleiro===id && <small>· Goleiro</small>}</span>
              <button type="button" title={`Retirar ${fullname(travel,id)} do time`} aria-label={`Retirar ${fullname(travel,id)} do time`} disabled={busy||!emPreparacao} onClick={()=>void remove(key,id)}><Trash2 size={19}/><span>Retirar</span></button>
            </div>)}</div>}
            <label className="ssw-trip-goalie">Goleiro (um dos 11 jogadores)
              <select disabled={busy || !emPreparacao || team.atletas.length===0} value={team.goleiro ?? ''} onChange={(e: { target: { value: string } })=>void save({...travel,[key]:{...team,goleiro:e.target.value||null}},'Goleiro atualizado.') }>
                <option value="">Ainda não escolhido</option>
                {team.atletas.map(id=><option key={id} value={id}>{fullname(travel,id)}</option>)}
              </select>
            </label>
            </details>
          </section>;
        })}
      </div>
      <section className="ssw-trip-panel ssw-match-panel" aria-label="Súmula especial da viagem">
        <div className="ssw-trip-panel-head"><div><h2>Súmula da partida de Goiânia</h2><p>Dois times do SSW · Futebol de campo · Registro independente do futebol de sete</p></div></div>
        <div className="ssw-match-score" role="status" aria-label={`Placar ${travel.timeA.nome} ${placarA}, ${travel.timeB.nome} ${placarB}`}>
          <div><span>{travel.timeA.nome}</span><strong>{placarA}</strong></div>
          <b>×</b>
          <div><span>{travel.timeB.nome}</span><strong>{placarB}</strong></div>
        </div>
        <div className="ssw-match-status"><span className={`ssw-match-state ssw-match-state--${sumula.status}`}>{sumula.status==='preparacao'?'Aguardando escalação':sumula.status==='em_andamento'?'Partida em andamento':'Partida encerrada'}</span><span>{gols.length} {gols.length===1?'gol registrado':'gols registrados'} · {sumula.movimentos.filter(m=>m.tipo==='substituicao').length} substituições</span></div>
        {emPreparacao && <div className="ssw-match-actions"><button type="button" className="ssw-trip-primary" disabled={busy||travel.timeA.atletas.length!==11||travel.timeB.atletas.length!==11||!travel.timeA.goleiro||!travel.timeB.goleiro} onClick={()=>void iniciarPartida()}><Goal size={20}/> Iniciar partida</button><span>Para iniciar, complete os dois times de 11 e escolha os goleiros.</span></div>}
        {emJogo && <>
          <label className="ssw-match-minute">Minuto do lance (opcional)<input inputMode="numeric" type="number" min={0} max={180} value={minute} onChange={(e: { target: { value: string } })=>setMinute(e.target.value)} placeholder="Ex.: 32"/></label>
          <div className="ssw-match-goal-grids">
          {(['timeA','timeB'] as const).map(teamKey=><div key={teamKey} className="ssw-match-goal-team"><h3>{travel[teamKey].nome}</h3>
            {travel[teamKey].atletas.map(playerId=><div className="ssw-match-goal-player" key={playerId}>
              <span>{fullname(travel,playerId)} <small>{gols.filter(g=>g.jogador_id===playerId).length} gols</small></span>
              <button type="button" disabled={busy} onClick={()=>void registrarGol(teamKey,playerId)} aria-label={`Registrar gol de ${fullname(travel,playerId)}`}><Plus size={17}/> Gol</button>
            </div>)}
          </div>)}
          </div>
          <details className="ssw-match-expand"><summary><ArrowLeftRight size={18}/> Registrar substituição <span>Expandir</span></summary>
            <div className="ssw-match-swap-form">
              <label>Time<select value={swapTeam} onChange={(e: { target: { value: string } })=>{setSwapTeam(e.target.value as 'timeA'|'timeB');setSwapOut('');setSwapIn('')}}><option value="timeA">{travel.timeA.nome}</option><option value="timeB">{travel.timeB.nome}</option></select></label>
              <label>Jogador que sai<select value={swapOut} onChange={(e: { target: { value: string } })=>setSwapOut(e.target.value)}><option value="">Selecione</option>{travel[swapTeam].atletas.map(id=><option key={id} value={id}>{fullname(travel,id)}</option>)}</select></label>
              <label>Integrante que entra<select value={swapIn} onChange={(e: { target: { value: string } })=>setSwapIn(e.target.value)}><option value="">Selecione</option>{travel.pessoas.filter(p=>!used.has(p.id)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              <button type="button" className="ssw-trip-primary" disabled={busy||!swapOut||!swapIn} onClick={()=>void fazerSubstituicao()}>Confirmar substituição</button>
            </div>
            <p className="ssw-trip-footnote">Se o goleiro sair, o substituto será definido como novo goleiro.</p>
          </details>
          <div className="ssw-match-actions"><button type="button" className="ssw-trip-outline" disabled={busy} onClick={()=>void encerrarPartida()}><CheckCircle2 size={20}/> Encerrar partida</button></div>
        </>}
        {sumula.status==='encerrada' && <div className="ssw-match-actions"><button type="button" className="ssw-trip-outline" disabled={busy} onClick={()=>void reabrirPartida()}><RefreshCcw size={19}/> Reabrir para correção</button><span>O placar encerrado está protegido contra alterações.</span></div>}
        <details className="ssw-match-expand"><summary><Info size={18}/> Histórico de gols e substituições ({sumula.movimentos.length}) <span>Expandir</span></summary>
          {sumula.movimentos.length===0?<p>Nenhum lance registrado.</p>:<div className="ssw-match-history">{sumula.movimentos.map(m=><div className="ssw-match-history-line" key={m.id}>
            <span>{m.tipo==='gol'?`Gol · ${travel[m.time].nome} · ${fullname(travel,m.jogador_id)}${m.minuto!==null?` · ${m.minuto}’`:''}${anulados.has(m.id)?' · ANULADO':''}`:m.tipo==='substituicao'?`Substituição · ${fullname(travel,m.saiu)} por ${fullname(travel,m.entrou)}${m.minuto!==null?` · ${m.minuto}’`:''}`:`Anulação de gol · registro ${m.gol_id}`}</span>
            {m.tipo==='gol' && !anulados.has(m.id) && emJogo && <button type="button" disabled={busy} onClick={()=>void anularGol(m)}>Anular gol</button>}
          </div>)}</div>}
        </details>
      </section>
      <div className="ssw-trip-conclusion" role="status">
        {travel.timeA.atletas.length===11 && travel.timeB.atletas.length===11 && !!travel.timeA.goleiro && !!travel.timeB.goleiro
          ? <><CheckCircle2 size={22}/> Escalações completas: 22 atletas e dois goleiros definidos.</>
          : <><Info size={22}/> Escalações em preparação: faltam {22-travel.timeA.atletas.length-travel.timeB.atletas.length} atletas para completar os dois times. {(!travel.timeA.goleiro || !travel.timeB.goleiro) && 'Defina também os goleiros.'}</>}
      </div>
      <p className="ssw-trip-footnote">A partida de Goiânia será disputada entre dois times do próprio SSW (11 contra 11). Não há adversário externo. Este evento não altera os times de sete, as rodadas nem os rankings habituais. As alterações são compartilhadas pelo servidor após a confirmação de salvamento.</p>
    </>}
  </div>;
}
