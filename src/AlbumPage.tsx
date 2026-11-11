import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Camera, ChevronLeft, ChevronRight, Filter, Image as ImageIcon, Printer, RefreshCw, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import { classificar, useDadosSSW } from './SSWStore';
import type { Estatistica } from './SSWStore';
import { apiError, mediaUrl } from './mediaClient';
import './AlbumPage.css';

type Perfil = {
  nomeExibicao: string; apelido: string; posicao: string; situacao: string;
  numeroFigurinha: number | null; miniBio: string; bordao: string;
  peDominante: string; entradaGrupo: string | null; retratoPreferido: 'foto' | 'caricatura';
};
type PerfilServidor = {
  athlete_id: string; profile: Perfil; fotoMediaId: string | null; caricaturaMediaId: string | null;
};
type Ordenacao = 'numero' | 'nome' | 'pontos' | 'gols';
type FiltroImagem = 'todas' | 'com' | 'sem';
const POSICOES: Record<string,string> = {
  'nao-informada':'Posição não informada', goleiro:'Goleiro', zagueiro:'Zagueiro', lateral:'Lateral',
  'meio-campo':'Meio-campo', atacante:'Atacante', coringa:'Coringa',
};
const SITUACOES: Record<string,string> = { ativo:'Ativo', convidado:'Convidado', afastado:'Afastado', lenda:'Lenda' };
const PE: Record<string,string> = { 'nao-informado':'Não informado', direito:'Direito', esquerdo:'Esquerdo', ambos:'Ambos' };
const inicias = (name:string) => name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase() || 'SS';
const exibicao = (original:string,p?:Perfil) => p?.nomeExibicao?.trim() || p?.apelido?.trim() || original;
const dataBR = (value:string | null | undefined) => {
  if(!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Não informada';
  const [ano,mes,dia] = value.split('-'); return `${dia}/${mes}/${ano}`;
};

type AlbumItem = {id:string;nome:string;original:string;perfil?:Perfil;imagem:string|null|undefined;stats?:Estatistica};
function Figurinha({item,grande=false,artilharia}:{item:AlbumItem;grande?:boolean;artilharia:number}){
    const apelido=item.perfil?.apelido?.trim();
    const destaque=artilharia>0 && item.stats?.gols===artilharia;
    const numero=item.perfil?.numeroFigurinha;
    return <div className={`album-sticker ${grande?'album-sticker--large':''}`}>
      <div className="album-sticker__top"><img src="/ssw-escudo-real.jpg" alt=""/><span>{numero ? `Nº ${String(numero).padStart(3,'0')}` : 'SEM NÚMERO'}</span></div>
      <div className="album-sticker__portrait">{item.imagem?<img src={mediaUrl(item.imagem)} alt={`Retrato de ${item.nome}`} loading="lazy"/>:<div className="album-sticker__initials" aria-label="Foto ainda não cadastrada">{inicias(item.nome)}<small><Camera size={15}/> Imagem pendente</small></div>}</div>
      <div className="album-sticker__name"><strong>{item.nome}</strong><span>{POSICOES[item.perfil?.posicao||'nao-informada']||'Atleta SSW'}</span></div>
      <div className="album-sticker__badges">{item.perfil?.situacao==='lenda'&&<span className="album-sticker__honor">Lenda cadastrada</span>}{destaque&&<span className="album-sticker__honor">Artilharia atual</span>}{apelido&&apelido!==item.nome&&<span>{apelido}</span>}</div>
      <div className="album-sticker__stats"><span><strong>{item.stats?.pontos??0}</strong> pontos</span><span><strong>{item.stats?.gols??0}</strong> gols</span><span><strong>{item.stats?.jogos??0}</strong> jogos</span></div>
    </div>;
  }

export function AlbumPage(){
  const dados=useDadosSSW();
  const estatisticas=useMemo(()=>classificar(dados),[dados]);
  const mapaStats=useMemo(()=>new Map(estatisticas.map(s=>[s.id,s])),[estatisticas]);
  const [perfis,setPerfis]=useState<PerfilServidor[]>([]);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState('');
  const [pesquisa,setPesquisa]=useState('');
  const [filtroImagem,setFiltroImagem]=useState<FiltroImagem>('todas');
  const [filtroPosicao,setFiltroPosicao]=useState('todas');
  const [ordem,setOrdem]=useState<Ordenacao>('numero');
  const [atual,setAtual]=useState<string|null>(null);
  const [verso,setVerso]=useState(false);
  const toqueInicio=useRef<number|null>(null);
  const fecharRef=useRef<HTMLButtonElement|null>(null);
  const ultimoAcionador=useRef<HTMLElement|null>(null);

  const atualizar=useCallback(async()=>{
    setErro(''); setCarregando(true);
    try{
      const res=await fetch('/api/athletes/profiles',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)throw new Error(await apiError(res));
      const json=await res.json() as {profiles:PerfilServidor[]};
      setPerfis(json.profiles);
    }catch(e){setErro(`Não foi possível carregar o álbum: ${(e as Error).message}`);}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{void atualizar();},[atualizar]);

  const mapaPerfis=useMemo(()=>new Map(perfis.map(p=>[p.athlete_id,p])),[perfis]);
  const todos=useMemo(()=>dados.jogadores.map(j=>{
    const item=mapaPerfis.get(j.id);
    const p=item?.profile;
    const foto=p?.retratoPreferido==='caricatura' ? (item?.caricaturaMediaId||item?.fotoMediaId) : (item?.fotoMediaId||item?.caricaturaMediaId);
    return {id:j.id,nome:exibicao(j.nome,p),original:j.nome,perfil:p,imagem:foto,stats:mapaStats.get(j.id)};
  }),[dados.jogadores,mapaPerfis,mapaStats]);
  const filtrados=useMemo(()=>todos.filter(j=>{
    const busca=`${j.nome} ${j.original} ${j.perfil?.apelido||''}`.toLocaleLowerCase('pt-BR');
    if(!busca.includes(pesquisa.trim().toLocaleLowerCase('pt-BR')))return false;
    if(filtroImagem==='com'&&!j.imagem)return false;
    if(filtroImagem==='sem'&&!!j.imagem)return false;
    if(filtroPosicao!=='todas'&&(j.perfil?.posicao||'nao-informada')!==filtroPosicao)return false;
    return true;
  }).sort((a,b)=>{
    if(ordem==='numero')return (a.perfil?.numeroFigurinha??100000)-(b.perfil?.numeroFigurinha??100000)||a.nome.localeCompare(b.nome,'pt-BR');
    if(ordem==='pontos')return (b.stats?.pontos??0)-(a.stats?.pontos??0)||a.nome.localeCompare(b.nome,'pt-BR');
    if(ordem==='gols')return (b.stats?.gols??0)-(a.stats?.gols??0)||a.nome.localeCompare(b.nome,'pt-BR');
    return a.nome.localeCompare(b.nome,'pt-BR');
  }),[todos,pesquisa,filtroImagem,filtroPosicao,ordem]);
  const indice=filtrados.findIndex(j=>j.id===atual);
  const selecionado=indice>=0 ? filtrados[indice] : todos.find(j=>j.id===atual);
  const totalFotos=todos.filter(j=>!!j.imagem).length;
  const artilharia=Math.max(0,...estatisticas.map(s=>s.gols));

  const fechar=useCallback(()=>{setAtual(null);setVerso(false);window.setTimeout(()=>ultimoAcionador.current?.focus(),0);},[]);
  const abrir=(id:string,elemento:HTMLElement)=>{ultimoAcionador.current=elemento;setVerso(false);setAtual(id);};
  const mover=useCallback((direcao:number)=>{
    if(indice<0||!filtrados.length)return;
    setAtual(filtrados[(indice+direcao+filtrados.length)%filtrados.length].id);
    setVerso(false);
  },[indice,filtrados]);
  useEffect(()=>{
    if(!atual)return;
    fecharRef.current?.focus();
    const key=(event:KeyboardEvent)=>{
      const element=event.target as HTMLElement;
      if(['INPUT','TEXTAREA','SELECT'].includes(element?.tagName))return;
      if(event.key==='Escape'){event.preventDefault();fechar();}
      if(event.key==='ArrowLeft'){event.preventDefault();mover(-1);}
      if(event.key==='ArrowRight'){event.preventDefault();mover(1);}
    };
    document.addEventListener('keydown',key);
    return()=>document.removeEventListener('keydown',key);
  },[atual,fechar,mover]);

  return <section className="album-page">
    <div className="album-hero"><span className="album-eyebrow">COLEÇÃO OFICIAL · SÁBADO SHOW</span><h1>Álbum de <em>figurinhas.</em></h1><p>O elenco, as histórias e os números reais do sábado. Cada jogador tem seu lugar nesta coleção.</p><div className="album-summary"><span><strong>{todos.length}</strong> atletas</span><span><strong>{totalFotos}</strong> com imagem</span><span><strong>{todos.length-totalFotos}</strong> aguardando retrato</span></div></div>
    <div className="album-controls"><label className="album-search"><Search size={21}/><input type="search" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} placeholder="Buscar jogador ou apelido" aria-label="Buscar jogador no álbum"/></label><label><Filter size={18}/><select aria-label="Filtrar por imagem" value={filtroImagem} onChange={e=>setFiltroImagem(e.target.value as FiltroImagem)}><option value="todas">Todas as figurinhas</option><option value="com">Com retrato</option><option value="sem">Sem retrato</option></select></label><label><select aria-label="Filtrar por posição" value={filtroPosicao} onChange={e=>setFiltroPosicao(e.target.value)}><option value="todas">Todas as posições</option>{Object.entries(POSICOES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label><select aria-label="Ordenar figurinhas" value={ordem} onChange={e=>setOrdem(e.target.value as Ordenacao)}><option value="numero">Número da figurinha</option><option value="nome">Nome</option><option value="pontos">Mais pontos</option><option value="gols">Mais gols</option></select></label><button className="album-refresh" type="button" disabled={carregando} onClick={()=>void atualizar()}><RefreshCw size={19}/> Atualizar</button></div>
    {erro&&<div role="alert" className="album-error">{erro}</div>}
    {carregando&&<p role="status" className="album-help">Carregando perfis e fotografias do servidor…</p>}
    {!carregando&&filtrados.length===0&&<div className="album-empty"><ImageIcon size={30}/><p>Nenhuma figurinha encontrada. Altere os filtros ou cadastre os atletas em Dia de jogo.</p></div>}
    <div className="album-grid">{filtrados.map(item=><button className="album-card-button" key={item.id} type="button" onClick={e=>abrir(item.id,e.currentTarget)} aria-label={`Abrir figurinha de ${item.nome}`}><Figurinha item={item} artilharia={artilharia}/><span className="album-card-cta">Ver figurinha <ArrowRight size={19}/></span></button>)}</div>
    <p className="album-help"><ShieldCheck size={20}/> Os números e conquistas mostrados aqui vêm dos cadastros e das súmulas encerradas. Nenhuma imagem ou conquista é gerada automaticamente.</p>
    {selecionado&&atual&&<div className="album-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)fechar();}}>
      <section role="dialog" aria-modal="true" aria-label={`Figurinha de ${selecionado.nome}`} className="album-dialog" onTouchStart={e=>{toqueInicio.current=e.touches[0]?.clientX??null;}} onTouchEnd={e=>{const fim=e.changedTouches[0]?.clientX;if(toqueInicio.current!==null&&fim!==undefined&&Math.abs(fim-toqueInicio.current)>70)mover(fim<toqueInicio.current?1:-1);toqueInicio.current=null;}}>
        <div className="album-dialog__top"><span><BookOpen size={19}/> FIGURINHA {indice>=0?`${indice+1} DE ${filtrados.length}`:'SSW'}</span><button type="button" ref={fecharRef} onClick={fechar} aria-label="Fechar figurinha"><X size={25}/></button></div>
        <div className="album-dialog__content">{verso?<div className="album-verso"><div className="album-verso__mark"><img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/> SÁBADO SHOW</div><h2>{selecionado.nome}</h2><p className="album-verso__alias">{selecionado.perfil?.apelido||'Atleta SSW'}</p><dl><div><dt>Situação</dt><dd>{SITUACOES[selecionado.perfil?.situacao||'ativo']||'Ativo'}</dd></div><div><dt>Pé dominante</dt><dd>{PE[selecionado.perfil?.peDominante||'nao-informado']||'Não informado'}</dd></div><div><dt>Entrou no grupo</dt><dd>{dataBR(selecionado.perfil?.entradaGrupo)}</dd></div><div><dt>Presenças</dt><dd>{selecionado.stats?.presencas??0}</dd></div><div><dt>Vitórias / Empates / Derrotas</dt><dd>{selecionado.stats?.vitorias??0} / {selecionado.stats?.empates??0} / {selecionado.stats?.derrotas??0}</dd></div></dl>{selecionado.perfil?.bordao&&<blockquote>“{selecionado.perfil.bordao}”</blockquote>}<p className="album-verso__bio">{selecionado.perfil?.miniBio||'A história deste jogador ainda será registrada.'}</p></div>:<Figurinha item={selecionado} grande artilharia={artilharia}/>}</div>
        <div className="album-dialog__actions"><button type="button" onClick={()=>mover(-1)} disabled={indice<0||filtrados.length<=1} aria-label="Figurinha anterior"><ChevronLeft size={24}/> Anterior</button><button type="button" className="album-flip" onClick={()=>setVerso(v=>!v)}><RotateCcw size={20}/>{verso?'Ver frente':'Ver verso'}</button><button type="button" onClick={()=>mover(1)} disabled={indice<0||filtrados.length<=1}>Próxima <ChevronRight size={24}/></button></div>
        <button type="button" className="album-print" onClick={()=>window.print()}><Printer size={19}/> Imprimir ou salvar em PDF</button>
      </section>
    </div>}
  </section>;
}
