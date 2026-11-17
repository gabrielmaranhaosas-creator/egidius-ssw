import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, RefreshCw, Shield, Trophy, UsersRound, LockKeyhole } from 'lucide-react';
import './FutebolPublico.css';

export type PlacarPublico = {id:string;numero:number;timeA:string;timeB:string;golsA:number;golsB:number;status:'rascunho'|'encerrada';atletasA:string[];atletasB:string[];goleiroA:string|null;goleiroB:string|null;golsPorAtleta:Record<string,number>};
export type RankingPublico = {id:string;nome:string;presencas:number;jogos:number;pontos:number;gols:number;vitorias:number;empates:number;derrotas:number;jogosGoleiro:number;golsSofridos:number};
export type DadosPublicos = {jogadores:{id:string;nome:string}[];rodadas:{id:string;data:string;presencas:string[];equipes:{id:string;nome:string;atletas:string[]}[];jogos:PlacarPublico[]}[];rankings:RankingPublico[]};
type Criterio = 'pontos'|'gols'|'presencas'|'jogosGoleiro';
export function ordenarRankingPublico(items:RankingPublico[], criterio:Criterio) {
  return [...items].sort((a,b)=>b[criterio]-a[criterio] || (criterio==='jogosGoleiro' ? a.golsSofridos-b.golsSofridos : b.pontos-a.pontos) || a.nome.localeCompare(b.nome,'pt-BR'));
}
function dataSabado(value:string) {
  return new Date(value+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
}

export function PainelFutebolPublico({dados,entrar,atualizar,carregando=false,erro='',atualizado=''}:{dados:DadosPublicos|null;entrar:()=>void;atualizar:()=>void;carregando?:boolean;erro?:string;atualizado?:string}) {
  const [id,setId]=useState('');
  const [aba,setAba]=useState<'jogos'|'times'|'rankings'>('jogos');
  const [criterio,setCriterio]=useState<Criterio>('pontos');
  const rodadas=[...(dados?.rodadas??[])].sort((a,b)=>b.data.localeCompare(a.data));
  const rodada=rodadas.find(r=>r.id===id)??rodadas[0];
  const nomes=new Map(dados?.jogadores.map(p=>[p.id,p.nome])??[]);
  const ranking=ordenarRankingPublico(dados?.rankings??[],criterio);
  const rotulos:Record<Criterio,string>={pontos:'Pontos',gols:'Gols',presencas:'Presenças',jogosGoleiro:'Goleiros'};
  return <div className="futebol-publico">
    <header className="fp-top"><a href="/" className="fp-brand" aria-label="EGIDIUS início"><img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/><span><strong>EGIDIUS<span>.</span></strong><small>SÁBADO SHOW</small></span></a><button className="fp-login" type="button" onClick={entrar}><LockKeyhole size={18}/>Entrar para organizar</button></header>
    <main id="futebol-publico">
      <section className="fp-hero"><p className="fp-kicker">NOSSO FUTEBOL DE TODO SÁBADO</p><h1>O Sábado Show<br/>em campo<span>.</span></h1><p>Confira os times, acompanhe os placares e veja os destaques do grupo.</p><span className="fp-access"><Shield size={16}/>Consulta livre · sem convite</span></section>
      <section className="fp-toolbar" aria-label="Escolha do sábado e atualização"><label><CalendarDays size={19}/>Qual sábado?<select value={rodada?.id??''} onChange={e=>setId(e.target.value)} disabled={!rodadas.length}>{rodadas.length?rodadas.map(r=><option key={r.id} value={r.id}>{dataSabado(r.data)}</option>):<option value="">Nenhum sábado publicado</option>}</select></label><div><button type="button" onClick={atualizar} disabled={carregando}><RefreshCw size={17}/>{carregando?'Atualizando…':'Atualizar resultados'}</button><small role="status">{atualizado?`Atualizado às ${atualizado}`:carregando?'Carregando o futebol…':'Aguardando os registros'}</small></div></section>
      {erro&&<p className="fp-error" role="alert">{erro}{dados?' Os últimos dados carregados continuam abaixo.':''}</p>}
      {rodada&&<div className="fp-metrics"><span><UsersRound size={20}/><strong>{rodada.presencas.length}</strong> presentes</span><span><Shield size={20}/><strong>{rodada.equipes.length}</strong> times</span><span><ClipboardList size={20}/><strong>{rodada.jogos.filter(g=>g.status==='encerrada').length}</strong> jogos encerrados</span></div>}
      <nav className="fp-tabs" aria-label="Consultar futebol">{([['jogos','Placares',ClipboardList],['times','Times',UsersRound],['rankings','Rankings',Trophy]] as const).map(([value,label,Icon])=><button key={value} type="button" aria-current={aba===value?'page':undefined} onClick={()=>setAba(value)}><Icon size={19}/>{label}</button>)}</nav>
      <section className="fp-content" aria-label={aba==='jogos'?'Placares do sábado':aba==='times'?'Times do sábado':'Rankings do grupo'}>
        <h2>{aba==='jogos'?'Placares do sábado':aba==='times'?'Quem joga junto':'Destaques do Sábado Show'}</h2>
        {aba==='jogos'&&<><p>Partidas em edição têm placar provisório. Os rankings consideram os jogos encerrados.</p><div className="fp-games">{rodada?.jogos.length?rodada.jogos.map(g=><article key={g.id} className="fp-game"><header><span>Jogo {g.numero}</span><span className={g.status==='encerrada'?'fp-closed':'fp-draft'}>{g.status==='encerrada'?'Encerrado':'Em edição · provisório'}</span></header><div className="fp-score"><strong>{g.timeA}</strong><b>{g.golsA} <small>×</small> {g.golsB}</b><strong>{g.timeB}</strong></div><details><summary>Ver escalações e autores dos gols</summary>{(['A','B'] as const).map(side=><div key={side}><h3>{side==='A'?g.timeA:g.timeB}</h3><ul>{(side==='A'?g.atletasA:g.atletasB).map(p=><li key={p}>{nomes.get(p)??'Atleta'}{p===(side==='A'?g.goleiroA:g.goleiroB)?' · goleiro':''}{g.golsPorAtleta[p]?` · ${g.golsPorAtleta[p]} gol(s)`:''}</li>)}</ul></div>)}</details></article>):<p className="fp-empty">{carregando&&!dados?'Carregando os resultados…':'Ainda não há partidas publicadas neste sábado.'}</p>}</div></>}
        {aba==='times'&&<><p>A escalação de cada partida pode ser diferente da montagem atual do sábado.</p><div className="fp-teams">{rodada?.equipes.length?rodada.equipes.map(t=><article key={t.id}><header><h3>{t.nome}</h3><span>{t.atletas.length}/7</span></header><ol>{t.atletas.map(p=><li key={p}>{nomes.get(p)??'Atleta'}</li>)}</ol>{!t.atletas.length&&<p>Montagem ainda não preenchida.</p>}</article>):<p className="fp-empty">Os times deste sábado ainda não foram publicados.</p>}</div></>}
        {aba==='rankings'&&<><p>Acumulado dos sábados registrados. Vitória: 3 pontos · empate: 1 · derrota: 0. Presenças são contadas por sábado.</p><div className="fp-criteria" role="group" aria-label="Critério do ranking">{(Object.keys(rotulos) as Criterio[]).map(c=><button key={c} type="button" aria-pressed={c===criterio} onClick={()=>setCriterio(c)}>{rotulos[c]}</button>)}</div><ol className="fp-ranking">{ranking.length?ranking.map((p,i)=><li key={p.id}><span className="fp-place">{String(i+1).padStart(2,'0')}</span><div><strong>{p.nome}</strong><small>{criterio==='jogosGoleiro'?`${p.golsSofridos} gol(s) sofridos · jogos encerrados`:`${p.jogos} jogos encerrados · ${p.vitorias} V · ${p.empates} E · ${p.derrotas} D`}</small></div><b>{p[criterio]}<small>{criterio==='jogosGoleiro'?'jogos no gol':rotulos[criterio].toLocaleLowerCase('pt-BR')}</small></b></li>):<p className="fp-empty">Os destaques aparecerão quando houver jogadores cadastrados.</p>}</ol></>}
      </section>
      <aside className="fp-organize"><div><h2>Vai organizar o sábado?</h2><p>Entre com sua conta ou abra o convite recebido para montar os times e registrar as partidas.</p></div><button type="button" onClick={entrar}>Acesso de organização</button></aside>
    </main><footer className="fp-footer">EGIDIUS · Sábado Show<span>Resultados do futebol abertos para acompanhar. A organização cuida dos registros.</span></footer>
  </div>;
}

export function FutebolPublico({entrar}:{entrar:()=>void}) {
  const [dados,setDados]=useState<DadosPublicos|null>(null);
  const [erro,setErro]=useState('');
  const [carregando,setCarregando]=useState(true);
  const [atualizado,setAtualizado]=useState('');
  const request=useRef<AbortController|null>(null);
  async function atualizar() {
    request.current?.abort();
    const controller=new AbortController();request.current=controller;setCarregando(true);
    try {
      const response=await fetch('/api/public/football',{method:'GET',credentials:'omit',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Não foi possível atualizar os resultados. Tente novamente em instantes.');
      const value=await response.json() as DadosPublicos;
      if(!Array.isArray(value.jogadores)||!Array.isArray(value.rodadas)||!Array.isArray(value.rankings))throw Error('Os resultados estão temporariamente indisponíveis.');
      if(controller.signal.aborted)return;
      setDados(value);setErro('');setAtualizado(new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    } catch(e) {
      if(!controller.signal.aborted)setErro(e instanceof Error?e.message:'Confira sua conexão e tente novamente.');
    } finally {if(!controller.signal.aborted)setCarregando(false);}
  }
  useEffect(()=>{
    void atualizar();
    const visible=()=>{if(document.visibilityState!=='hidden')void atualizar();};
    const timer=window.setInterval(visible,30_000);
    window.addEventListener('focus',visible);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',visible);request.current?.abort();};
  },[]);
  return <PainelFutebolPublico dados={dados} entrar={entrar} atualizar={()=>void atualizar()} carregando={carregando} erro={erro} atualizado={atualizado}/>;
}
