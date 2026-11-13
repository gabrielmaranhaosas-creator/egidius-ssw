import { RecuperarTela,ConteudoComFoco } from './ConteudoTela';
import { podeAbandonarEdicao } from './TrabalhoPendente';
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { CampoPage } from './CampoPage';
import { ExpressPage } from './ExpressPage';
import type { CampoDestino } from './CampoPage';
import type { ElementType, ReactNode } from 'react';
import { RoundsManager } from './RoundsManager';
const AthletesPage=lazy(()=>import('./AthletesPage').then(module=>({default:module.AthletesPage})));
const MediaPage=lazy(()=>import('./MediaPage').then(module=>({default:module.MediaPage})));
const AlbumPage=lazy(()=>import('./AlbumPage').then(module=>({default:module.AlbumPage})));
const ImportPage=lazy(()=>import('./ImportPage').then(module=>({default:module.ImportPage})));
const ViagemPage=lazy(()=>import('./ViagemPage').then(module=>({default:module.ViagemPage})));
import { classificar, dataFormatada, resumoSSW, useDadosSSW } from './SSWStore';
import type { Estatistica } from './SSWStore';
import { escolherSabadoAtivo, guardarSabadoAtivo, lerSabadoAtivo } from './ActiveRound';
import { podeSairDaMontagem, primeiraMontagemPendente } from './MontagemDrafts';
import './styles/ssw-fluxo-sabado.css';
import './RoundsManager.css';
import './styles/ssw-lancamento-09f2.css';
import {
  ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, CircleDot,
  Crown, Flame, Home, Medal, Shield, Target, Trophy, UsersRound,
  BookOpen, ClipboardList, Images, Menu, X, FileUp, ArrowUp, BusFront,
} from 'lucide-react';

type Screen = 'expressa' | 'campo' | 'inicio' | 'rodada' | 'atletas' | 'album' | 'midia' | 'rankings' | 'historia' | 'importar' | 'viagem';
type RankingMode = 'pontos' | 'gols' | 'presencas' | 'goleiros';
const sections: { id: Screen; label: string; Icon: ElementType }[] = [
  { id: 'campo', label: 'Início', Icon: Home },
  { id: 'expressa', label: 'Súmula', Icon: Target },
  { id: 'inicio', label: 'Visão geral', Icon: Home },
  { id: 'rodada', label: 'Organizar sábado', Icon: CircleDot },
  { id: 'viagem', label: 'VIAGEM - SSW', Icon: BusFront },
  { id: 'atletas', label: 'Jogadores', Icon: UsersRound },
  { id: 'importar', label: 'Importar e arquivos', Icon: FileUp },
  { id: 'midia', label: 'Mídia', Icon: Images },
  { id: 'rankings', label: 'Rankings', Icon: Trophy },
  { id: 'historia', label: 'Nossa história', Icon: BookOpen },
];

function Metric({ label, value, detail, Icon, accent }: { label: string; value: string; detail: string; Icon: ElementType; accent: string }) {
  return <div className="metric-card"><div className="metric-head"><span>{label}</span><span className={`metric-icon metric-icon--${accent}`}><Icon size={19} strokeWidth={2}/></span></div><div className="metric-value">{value}</div><div className="metric-detail"><ArrowUpRight size={15}/>{detail}</div></div>;
}
function SectionTop({ kicker, title, helper, action }: { kicker: string; title: string; helper: string; action?: ReactNode }) {
  return <div className="section-top"><div><p className="eyebrow">{kicker}</p><h2>{title}</h2><p className="section-subtitle">{helper}</p></div>{action}</div>;
}
function RankingList({ mode, stats, full = false }: { mode: RankingMode; stats: Estatistica[]; full?: boolean }) {
  const ordered = [...stats].sort((a,b) => mode === 'goleiros'
    ? b.jogosGoleiro - a.jogosGoleiro || a.golsSofridos - b.golsSofridos || a.nome.localeCompare(b.nome)
    : b[mode] - a[mode] || b.pontos - a.pontos || a.nome.localeCompare(b.nome));
  const suffix = mode === 'pontos' ? 'pts' : mode === 'gols' ? 'gols' : mode === 'goleiros' ? 'jogos no gol' : 'pres.';
  if (!ordered.length) return <p className="empty-state">Nenhum jogador cadastrado. Comece em Organizar sábado → Cadastro de jogadores.</p>;
  return <div className="ranking-list">{ordered.slice(0, full ? ordered.length : 4).map((atleta,i) => <div className="ranking-row" key={atleta.id}>
    <div className={`rank-place ${i === 0 ? 'rank-place--first' : ''}`}>{String(i + 1).padStart(2,'0')}</div>
    <div className={`avatar avatar--${(i % 4) + 1}`}>{atleta.nome.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()}</div>
    <div className="ranking-person"><strong>{atleta.nome}</strong><small>{mode === 'goleiros' ? `${atleta.golsSofridos} gol(s) sofridos · apenas jogos encerrados` : `${atleta.jogos} jogos encerrados · ${atleta.vitorias} V · ${atleta.empates} E · ${atleta.derrotas} D`}</small></div>
    <div className="ranking-score"><strong>{mode === 'goleiros' ? atleta.jogosGoleiro : atleta[mode]}</strong><small>{suffix}</small></div>
  </div>)}</div>;
}
function App() {
  const screens:Screen[]=['expressa','campo','inicio','rodada','atletas','album','midia','rankings','historia','importar','viagem'];
  const initial=new URL(window.location.href).searchParams.get('tela') as Screen;
  const [screen,setScreen]=useState<Screen>(screens.includes(initial)?initial:'campo');
  const screenAtual=useRef(screen); screenAtual.current=screen;
  useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get('tela')!==screen){url.searchParams.set('tela',screen);window.history.pushState(null,'',url);} const title=document.querySelector<HTMLElement>('main h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}},[screen]);
  useEffect(()=>{function back(){if(!podeAbandonarEdicao()||!podeSairDaMontagem()){const u=new URL(window.location.href);u.searchParams.set('tela',screenAtual.current);window.history.pushState(null,'',u);return;}const tela=new URL(window.location.href).searchParams.get('tela') as Screen;setScreen(screens.includes(tela)?tela:'campo');}window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
  const [campoRoundId, setCampoRoundId] = useState(lerSabadoAtivo);
  const [expressTarget, setExpressTarget] = useState<{rodadaId?: string; gameId?: string}>({});
  const [rodadaDestino, setRodadaDestino] = useState<{ rodadaId?: string; partidaId?: string; destino: CampoDestino } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const fecharNoEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', fecharNoEscape);
    return () => window.removeEventListener('keydown', fecharNoEscape);
  }, [moreOpen]);
  const [rankingMode, setRankingMode] = useState<RankingMode>('pontos');
  const dados = useDadosSSW();
  const sabadoAtivo = escolherSabadoAtivo(dados.rodadas, campoRoundId);
  function selecionarSabado(id: string) { setCampoRoundId(id); guardarSabadoAtivo(id); setRodadaDestino(null); setExpressTarget({rodadaId:id}); }
  useEffect(() => { if (sabadoAtivo) guardarSabadoAtivo(sabadoAtivo); }, [sabadoAtivo]);
  useEffect(() => {
    function abrirRascunho() { abrirRodada('times', primeiraMontagemPendente()); }
    window.addEventListener('egidius:abrir-montagem', abrirRascunho);
    return () => window.removeEventListener('egidius:abrir-montagem', abrirRascunho);
  });
  const stats = classificar(dados);
  const resumo = resumoSSW(dados);
  const ultimoSabado = [...dados.rodadas].sort((a,b)=>b.data.localeCompare(a.data))[0];
  const ultimoJogo = [...dados.rodadas].sort((a,b) => b.data.localeCompare(a.data))
    .flatMap(r => [...r.jogos].sort((a,b)=>b.numero-a.numero).map(j => ({ ...j, data: r.data })))
    .find(j => j.status === 'encerrada');
  const artilheiro = [...stats].filter(a=>a.gols>0).sort((a,b)=>b.gols-a.gols || a.nome.localeCompare(b.nome))[0];
  function navigate(target: Screen) {
    if (!podeAbandonarEdicao() || !podeSairDaMontagem()) return;
    setMoreOpen(false); setScreen(target); setRodadaDestino(null);
    if (target === 'expressa') setExpressTarget({ rodadaId: sabadoAtivo });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function abrirExpressa(rodadaId?: string, gameId?: string) {
    if (!podeAbandonarEdicao() || !podeSairDaMontagem()) return;
    const id = rodadaId || sabadoAtivo; if (id) selecionarSabado(id);
    setMoreOpen(false); setExpressTarget({rodadaId:id,gameId}); setScreen('expressa');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function abrirRodada(destino: CampoDestino, rodadaId?: string, partidaId?: string) {
    if (!podeAbandonarEdicao() || !podeSairDaMontagem()) return;
    const id = rodadaId || sabadoAtivo; if (id) selecionarSabado(id);
    setMoreOpen(false);
    setRodadaDestino({ destino, rodadaId:id, partidaId });
    setScreen('rodada');
  }
  useEffect(() => {
    if (screen !== 'rodada' || !rodadaDestino) return;
    const ids: Record<CampoDestino, string> = {
      rodadas: 'rounds-title', cadastro: 'eg-cadastro', presencas: 'eg-checkin', times: 'eg-team-board',
      confronto: 'eg-next-game', partidas: rodadaDestino.partidaId ? `eg-game-${rodadaDestino.partidaId}` : 'eg-game-list',
    };
    const id = window.requestAnimationFrame(() => {
      const target = document.getElementById(ids[rodadaDestino.destino]);
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (rodadaDestino.destino === 'cadastro') target?.querySelector<HTMLInputElement>('#ssw-player-name')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [screen, rodadaDestino]);

  return <div className="shell">
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => navigate('campo')} aria-label="Ir para a página inicial do EGIDIUS"><img className="brand-crest" src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/><span className="brand-wordmark"><strong>EGIDIUS<span>.</span></strong><small>SÁBADO SHOW</small></span></button>
      <div className="sidebar-label">PLATAFORMA SSW</div>
      <nav aria-label="Navegação principal" className="side-nav">
        {sections.filter(x => ['campo','expressa','rodada','viagem','atletas','rankings'].includes(x.id)).map(({ id, label, Icon }) =>
          <button aria-current={screen===id?'page':undefined} className={`side-link ${screen === id ? 'side-link--active' : ''}`} key={id} onClick={() => navigate(id)} type="button"><Icon size={18}/><span>{label}</span>{screen === id && <span className="side-active-dot"/>}</button>)}
        <button type="button" className="side-link side-link--extras" onClick={() => setExtrasOpen(v => !v)} aria-expanded={extrasOpen} aria-controls="ssw-desktop-extras"><Menu size={18}/><span>Outras opções</span><ChevronRight size={18}/></button>
        {extrasOpen && <div id="ssw-desktop-extras" className="ssw-desktop-extras">
          {sections.filter(x => ['inicio','importar','midia','historia'].includes(x.id)).map(({ id, label, Icon }) =>
            <button aria-current={screen===id?'page':undefined} className={`side-link ${screen === id ? 'side-link--active' : ''}`} key={id} onClick={() => navigate(id)} type="button"><Icon size={18}/><span>{label}</span></button>)}
        </div>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-badge"><div className="badge-stars">✦ ✦ ✦ ✦</div><strong>O futebol de todo sábado.</strong><p>Uma história que merece ser contada.</p></div><div className="sidebar-footer"><span className="online-dot"/> EGIDIUS · SÁBADO SHOW</div></div>
    </aside>

    <main className={`main ${screen === 'campo' ? 'main--campo' : ''}`}>
      <header className="topbar"><div className="breadcrumb"><span>SÁBADO SHOW</span><ChevronRight size={15}/><strong>{sections.find(x=>x.id===screen)?.label.toUpperCase()}</strong></div><div className="top-right"><div className="prototype-indicator"><span className="prototype-led"/> DADOS NO SERVIDOR</div><div className="top-avatar">SSW</div></div></header>
      <div className="page"><RecuperarTela key={screen}><Suspense fallback={<p role="status">Abrindo esta área do EGIDIUS…</p>}><ConteudoComFoco>
        {screen === 'campo' && <>
          <div className="ssw-trip-launch ssw-trip-archive"><div><strong>VIAGEM – SSW</strong><small>Memória do evento · 24/10/2026 · Goiânia/GO · 11 × 11</small></div><button type="button" onClick={()=>navigate('viagem')}>Abrir viagem</button></div>
          <CampoPage abrir={abrirRodada} abrirExpressa={abrirExpressa} rodadaId={sabadoAtivo} onRodadaChange={selecionarSabado}/>
        </>}
        {screen === 'expressa' && <ExpressPage initialRoundId={expressTarget.rodadaId || sabadoAtivo} initialGameId={expressTarget.gameId} onRoundChange={selecionarSabado} organizar={(id)=>abrirRodada('times',id)} abrirCompleta={(rodadaId,jogoId)=>abrirRodada('partidas',rodadaId,jogoId)}/>}
        {screen === 'inicio' && <>
          <div className="hero"><div className="hero-grain"/><div className="hero-copy"><div className="hero-kicker">CENTRAL ESPORTIVA · SÁBADO SHOW</div><h1>EGIDIUS<span className="hero-title-dot">.</span></h1><p className="hero-caption">Rodadas, partidas, súmulas e memória do grupo.</p><div className="hero-actions"><button type="button" className="button button--sun" onClick={() => navigate('rodada')}>Gerenciar sábados <ArrowUpRight size={19}/></button><button type="button" className="button button--ghost" onClick={() => navigate('rankings')}>Ver rankings <ArrowRight size={19}/></button></div></div><div className="hero-art"><img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show fotografado na camisa"/></div><div className="hero-index">IDENTIDADE ORIGINAL · SSW</div></div>
          <div className="overview-row"><div><p className="eyebrow">ESTATÍSTICAS DA BASE COMPARTILHADA</p><h2>Panorama do jogo<span className="title-dot">.</span></h2></div><div className="overview-tag"><span className="tag-mini"/> DADOS SINCRONIZADOS COM SERVIDOR</div></div>
          <details className="ssw-release-disclosure"><summary>Indicadores do grupo <ChevronRight size={20} aria-hidden="true"/></summary><div className="metrics-grid">
            <Metric label="PRESENTES" value={String(resumo.presentesUltimoSabado).padStart(2, '0')} detail={ultimoSabado ? `Último sábado: ${dataFormatada(ultimoSabado.data)}` : 'Nenhuma rodada ainda'} Icon={UsersRound} accent="red"/>
            <Metric label="PARTIDAS" value={String(resumo.partidas).padStart(2, '0')} detail={`${resumo.encerradas} encerrada(s) no servidor`} Icon={CircleDot} accent="orange"/>
            <Metric label="GOLS" value={String(resumo.gols).padStart(2, '0')} detail="Somente partidas encerradas" Icon={Target} accent="gold"/>
            <Metric label="ARTILHEIRO" value={String(artilheiro?.gols ?? 0)} detail={artilheiro ? artilheiro.nome : 'Sem gols individuais vinculados'} Icon={Flame} accent="charcoal"/>
          </div>
          </details>
          <div className="content-grid">
            <section className="surface match-surface"><SectionTop kicker="ACONTECEU EM CAMPO" title="Último confronto" helper={ultimoJogo ? `Partida encerrada em ${dataFormatada(ultimoJogo.data)}.` : 'Ainda não há partidas encerradas no servidor.'} action={<span className="surface-pill">{ultimoJogo ? `JOGO ${String(ultimoJogo.numero).padStart(2,'0')}` : 'AGUARDANDO'}</span>}/>
              {ultimoJogo ? <div className="match-layout"><div className="team"><div className="team-crest team-crest--light"><Shield size={31}/></div><strong>{ultimoJogo.timeA}</strong></div><div className="score-center"><div className="match-time"><span className="match-dot"/> ENCERRADO</div><div className="scoreline">{ultimoJogo.golsA} <span>:</span> {ultimoJogo.golsB}</div><span className="score-sub">SÚMULA DE {dataFormatada(ultimoJogo.data).toUpperCase()}</span></div><div className="team"><div className="team-crest team-crest--warm"><Shield size={31}/></div><strong>{ultimoJogo.timeB}</strong></div></div> : <p className="empty-state">Crie um sábado, escale os atletas e encerre uma súmula para aparecer aqui.</p>}
              <button type="button" className="text-action" onClick={() => navigate('rodada')}>Abrir controle da rodada <ArrowRight size={17}/></button>
            </section>
            <section className="surface leader-surface"><SectionTop kicker="QUEM TÁ NA FRENTE" title="Destaques do grupo" helper="Pontuação calculada pelas súmulas encerradas." action={<Trophy size={22} className="gold-icon"/>}/><RankingList mode="pontos" stats={stats}/><button type="button" className="text-action" onClick={() => navigate('rankings')}>Ranking completo <ArrowRight size={17}/></button></section>
          </div>
          <footer className="page-footer">EGIDIUS · SÁBADO SHOW <span>JOGOS, HISTÓRIAS E CONFRARIA</span></footer>
        </>}
        {screen === 'rodada' && <>
          <div className="inner-hero"><div><p className="eyebrow eyebrow--light">OPERAÇÃO EM CAMPO</p><h1>Organizar sábado<span>.</span></h1><p>Confirme os presentes, monte os times e continue para as partidas.</p></div><div className="inner-icon"><ClipboardList size={50}/></div></div>
          <RoundsManager initialRoundId={sabadoAtivo} initialGameId={rodadaDestino?.partidaId} initialStage={rodadaDestino?.destino} onRoundChange={selecionarSabado} abrirExpressa={abrirExpressa}/>
        </>}
        {screen === 'viagem' && <ViagemPage/>}
        {screen === 'atletas' && <AthletesPage abrirCadastro={() => abrirRodada('cadastro', campoRoundId || undefined)}/>}
        {screen === 'midia' && <MediaPage/>}
        {screen === 'album' && <AlbumPage/>}
        {screen === 'importar' && <ImportPage/>}
        {screen === 'rankings' && <>
          <div className="inner-hero inner-hero--rank"><div><p className="eyebrow eyebrow--light">ESTATÍSTICAS & CONQUISTAS</p><h1>Rankings do grupo<span>.</span></h1><p>Pontos e gols vêm de partidas encerradas; presenças vêm das chegadas registradas.</p></div><div className="inner-icon"><Trophy size={52}/></div></div>
          <section className="surface ranking-page"><SectionTop kicker="CLASSIFICAÇÃO DO SSW" title="Rankings acumulados" helper="Cada jogo encerrado gera 3 pontos pela vitória, 1 pelo empate e 0 pela derrota para os atletas que atuaram." action={<span className="surface-pill">{resumo.encerradas} JOGOS ENCERRADOS</span>}/>
            <div className="segment" role="group" aria-label="Tipo de ranking">{([['pontos','Pontos'],['gols','Artilharia'],['presencas','Presenças'],['goleiros','Goleiros']] as [RankingMode,string][]).map(([id,label]) => <button type="button" key={id} aria-pressed={rankingMode===id} className={rankingMode===id?'segment--active':''} onClick={()=>setRankingMode(id)}>{label}</button>)}</div>
            <RankingList mode={rankingMode} stats={stats} full/>
            <div className="ranking-note"><Medal size={18}/>{rankingMode === 'goleiros' ? 'Goleiros: ordenados pela quantidade de jogos como goleiro. Gols sofridos registrados pelo placar do time em cada jogo encerrado; não representa substituições durante a partida.' : 'Apenas súmulas encerradas contam pontos, jogos e gols; presenças são contadas pelo check-in de cada sábado. Súmulas antigas sem atletas vinculados não produzem pontos individuais.'}</div>
          </section>
        </>}
        {screen === 'historia' && <>
          <div className="inner-hero inner-hero--history"><div><p className="eyebrow eyebrow--light">A MEMÓRIA DO SSW</p><h1>Nossa história<span>.</span></h1><p>Um espaço para guardar o que acontece dentro e fora das quatro linhas.</p></div><div className="inner-icon"><BookOpen size={53}/></div></div>
          <div className="stories">
            <article className="story-card story-card--feature"><span className="story-icon"><Crown size={30}/></span><p className="eyebrow">REGISTROS DO GRUPO</p><h2>{resumo.encerradas} partidas<br/>encerradas.</h2><p>{resumo.gols} gols registrados nas súmulas encerradas. Os destaques são calculados a partir dos resultados do grupo.</p><button className="text-action" type="button" onClick={()=>navigate('rankings')}>Consultar rankings <ArrowUpRight size={17}/></button></article>
            {[...dados.rodadas].sort((a,b)=>b.data.localeCompare(a.data)).map(rodada=>{
              const jogos=rodada.jogos.filter(j=>j.status==='encerrada');
              return <article className="story-card" key={rodada.id}><span className="story-icon"><CalendarDays size={29}/></span><p className="eyebrow">SÁBADO SHOW</p><h2>{dataFormatada(rodada.data)}</h2><p>{rodada.presencas.length} presenças · {jogos.length} partidas encerradas · {jogos.reduce((sum,j)=>sum+j.golsA+j.golsB,0)} gols.</p><button type="button" className="text-action" onClick={()=>abrirRodada('partidas',rodada.id)}>Consultar este sábado <ArrowUpRight size={17}/></button></article>;
            })}
            {!dados.rodadas.length&&<article className="story-card"><p className="eyebrow">COMEÇAR A HISTÓRIA</p><h2>Os registros<br/>começam aqui.</h2><p>O histórico será preenchido pelos sábados e partidas do SSW.</p><button type="button" className="text-action" onClick={()=>navigate('rodada')}>Organizar sábado <ArrowUpRight size={17}/></button></article>}
          </div>
        </>}
      </ConteudoComFoco></Suspense></RecuperarTela></div>
      <footer className="ssw-new-footer" aria-label="Rodapé do Sábado Show">
        <div className="ssw-new-footer-inner">
          <img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/>
          <div><strong>Sábado Show</strong><span>O futebol de todo sábado.</span></div>
          <button type="button" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><ArrowUp size={18}/> Subir</button>
        </div>
      </footer>
      {moreOpen&&<>
        <button className="ssw-more-scrim" type="button" aria-label="Fechar menu Mais" onClick={()=>setMoreOpen(false)} />
        <div className="ssw-mobile-more" id="egidius-mobile-more" role="group" aria-label="Mais opções"><button type="button" onClick={()=>navigate('atletas')}><UsersRound size={21}/><span>Jogadores</span></button>
          <button type="button" onClick={()=>navigate('viagem')}><BusFront size={21}/><span>VIAGEM - SSW</span></button>
          <button type="button" onClick={()=>navigate('rodada')}><CircleDot size={21}/><span>Organizar sábado</span></button>
          <button type="button" onClick={()=>navigate('rankings')}><Trophy size={21}/><span>Ranking</span></button>
          <button type="button" onClick={()=>navigate('midia')}><Images size={21}/><span>Fotos</span></button>
          <button type="button" onClick={()=>navigate('importar')}><FileUp size={21}/><span>Importar</span></button>
          <details className="ssw-more-secondary">
            <summary>Outras opções <ChevronRight size={19} aria-hidden="true"/></summary>
            <div className="ssw-more-secondary-links">
              <button type="button" onClick={()=>navigate('inicio')}><Home size={21}/><span>Visão geral</span></button>
              <button type="button" onClick={()=>navigate('historia')}><BookOpen size={21}/><span>Nossa história</span></button>
            </div>
          </details>
        </div>
      </>}
      <nav className="mobile-nav" aria-label="Navegação inferior">
        {sections.filter(x=>['campo','rodada','expressa'].includes(x.id)).map(({id,Icon}) => <button type="button" onClick={()=>navigate(id)} key={id} aria-current={id===screen?'page':undefined} className={id===screen?'mobile-link mobile-link--active':'mobile-link'}><Icon size={24}/><small>{id==='campo'?'Início':id==='rodada'?'Organizar':'Súmula'}</small></button>)}
        <button type="button" className={`mobile-link ${(moreOpen||['atletas','viagem','midia','inicio','rankings','historia','importar'].includes(screen))?'mobile-link--active':''}`} onClick={()=>setMoreOpen(v=>!v)} aria-expanded={moreOpen} aria-controls="egidius-mobile-more">{moreOpen?<X size={24}/>:<Menu size={24}/>}<small>Mais</small></button>
      </nav>
    </main>
  </div>;
}
export default App;
