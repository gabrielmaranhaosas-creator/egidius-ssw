import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpenText, Camera, Check, CircleHelp, Download, Filter, Images, Plus, RefreshCw, Save, Search, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { classificar, useDadosSSW } from './SSWStore';
import { getCsrf, listMedia, mediaUrl, removeMedia, uploadMedia } from './mediaClient';
import type { MediaItem } from './mediaClient';
import './AthletesPage.css';

type Posicao = 'nao-informada'|'goleiro'|'zagueiro'|'lateral'|'meio-campo'|'atacante'|'coringa';
type Pe = 'nao-informado'|'direito'|'esquerdo'|'ambos';
type Situacao = 'ativo'|'convidado'|'afastado'|'lenda';
export type AthleteProfile = {
  nomeExibicao:string; apelido:string; posicao:Posicao; peDominante:Pe; situacao:Situacao;
  numeroFigurinha:number|null; entradaGrupo:string|null; miniBio:string; bordao:string; retratoPreferido:'foto'|'caricatura';
};
type ProfileRecord={athlete_id:string;revision:number;updated_at:string|null;profile:AthleteProfile;fotoMediaId:string|null;caricaturaMediaId:string|null};
type ResponseProfiles={profiles:ProfileRecord[]};
const EMPTY:AthleteProfile={nomeExibicao:'',apelido:'',posicao:'nao-informada',peDominante:'nao-informado',situacao:'ativo',numeroFigurinha:null,entradaGrupo:null,miniBio:'',bordao:'',retratoPreferido:'foto'};
const POSICOES:[Posicao,string][]=[['nao-informada','Não informada'],['goleiro','Goleiro'],['zagueiro','Zagueiro'],['lateral','Lateral'],['meio-campo','Meio-campo'],['atacante','Atacante'],['coringa','Coringa']];
const PÉS:[Pe,string][]=[['nao-informado','Não informado'],['direito','Direito'],['esquerdo','Esquerdo'],['ambos','Ambos']];
const STATUS:[Situacao,string][]=[['ativo','Ativo'],['convidado','Convidado'],['afastado','Afastado'],['lenda','Lenda']];
const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()||'SS';
const errorMessage=async(r:Response)=>{const e=await r.json().catch(()=>null) as {detail?:string}|null;return e?.detail||`Erro HTTP ${r.status}`;};
const title=(nome:string,p:AthleteProfile)=>p.nomeExibicao.trim()||p.apelido.trim()||nome;
export function AthletesPage({ abrirCadastro }: { abrirCadastro: () => void }){
  const dados=useDadosSSW();
  const stats=useMemo(()=>classificar(dados),[dados]);
  const [list,setList]=useState<ProfileRecord[]>([]);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'todos'|Situacao>('todos');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [draft,setDraft]=useState<AthleteProfile>({...EMPTY});
  const [baseline,setBaseline]=useState<AthleteProfile>({...EMPTY});
  const [revision,setRevision]=useState(0);
  const [pending,setPending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [athleteImages,setAthleteImages]=useState<MediaItem[]>([]);
  const [uploadingImage,setUploadingImage]=useState(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  const records=useMemo(()=>new Map(list.map(p=>[p.athlete_id,p])),[list]);
  const athlete=dados.jogadores.find(a=>a.id===selectedId);
  const athStats=stats.find(s=>s.id===selectedId);
  const mostRecent=(kind:'photo'|'caricature')=>athleteImages.find(i=>i.kind===kind);
  const foto=mostRecent('photo');
  const caricatura=mostRecent('caricature');
  const activePortrait=draft.retratoPreferido==='caricatura'?(caricatura||foto):(foto||caricatura);
  const visible=dados.jogadores.filter(j=>{
    const p=records.get(j.id)?.profile||EMPTY;
    const text=`${j.nome} ${p.apelido} ${p.nomeExibicao}`.toLocaleLowerCase('pt-BR');
    return text.includes(query.trim().toLocaleLowerCase('pt-BR')) && (filter==='todos'||p.situacao===filter);
  }).sort((a,b)=>title(a.nome,records.get(a.id)?.profile||EMPTY).localeCompare(title(b.nome,records.get(b.id)?.profile||EMPTY),'pt-BR'));
  async function reload(){
    setError('');
    try{
      const r=await fetch('/api/athletes/profiles',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw new Error(await errorMessage(r));
      const result=await r.json() as ResponseProfiles;
      setList(result.profiles);
    }catch(e){setError(`Não foi possível carregar os perfis: ${(e as Error).message}`);}finally{setLoading(false);}
  }
  useEffect(()=>{void reload();},[]);
  useEffect(()=>{
    let active=true;
    if(!selectedId){setAthleteImages([]);return;}
    void listMedia({scope:'athlete',athlete_id:selectedId}).then(items=>{if(active)setAthleteImages(items);})
      .catch(e=>{if(active)setError(`Galeria do atleta: ${(e as Error).message}`);});
    return()=>{active=false;};
  },[selectedId]);
  async function refreshImages(id:string){
    setAthleteImages(await listMedia({scope:'athlete',athlete_id:id}));
    await reload();
  }
  async function uploadPortrait(file:File|undefined,kind:'photo'|'caricature'){
    if(!file||!selectedId||uploadingImage)return;
    setUploadingImage(true);setError('');setNotice('');
    try{
      if(file.size>12*1024*1024)throw new Error('O arquivo não pode ultrapassar 12 MB.');
      const csrf=await getCsrf();
      await uploadMedia(file,{scope:'athlete',kind,athlete_id:selectedId},csrf);
      await refreshImages(selectedId);
      setNotice(`${kind==='photo'?'Foto':'Caricatura'} salva no servidor e vinculada ao atleta.`);
    }catch(e){setError((e as Error).message);}finally{setUploadingImage(false);}
  }
  async function deletePortrait(item:MediaItem){
    if(!selectedId||uploadingImage)return;
    if(!window.confirm(`Excluir definitivamente ${item.kind==='photo'?'esta foto':'esta caricatura'}? A ação não pode ser desfeita.`))return;
    setUploadingImage(true);setError('');
    try{const csrf=await getCsrf();await removeMedia(item.id,csrf);await refreshImages(selectedId);setNotice('Imagem removida.');}
    catch(e){setError((e as Error).message);}finally{setUploadingImage(false);}
  }
  function selectAthlete(id:string|null){
    if(dirty && !window.confirm('Há alterações não salvas. Descartar e continuar?'))return;
    setSelectedId(id);setNotice('');setError('');
    const current=id?records.get(id):undefined;
    const p=current?.profile||EMPTY;
    setDraft({...p});setBaseline({...p});setRevision(current?.revision??0);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function update<K extends keyof AthleteProfile>(key:K,value:AthleteProfile[K]){setDraft(prev=>({...prev,[key]:value}));setNotice('');}
  async function save(e:FormEvent){
    e.preventDefault();
    if(!athlete||pending)return;
    setPending(true);setError('');setNotice('');
    try{
      const auth=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
      if(!auth.ok)throw new Error(await errorMessage(auth));
      const session=await auth.json() as {authenticated:boolean;csrf?:string};
      if(!session.authenticated||!session.csrf)throw new Error('Sessão expirada. Atualize a página e faça login novamente.');
      const r=await fetch(`/api/athletes/profiles/${encodeURIComponent(athlete.id)}`,{
        method:'PUT',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},
        body:JSON.stringify({expected_revision:revision,profile:draft}),
      });
      if(!r.ok)throw new Error(await errorMessage(r));
      const updated=await r.json() as ProfileRecord;
      setList(prev=>[...prev.filter(p=>p.athlete_id!==athlete.id),updated]);
      setRevision(updated.revision);setBaseline({...updated.profile});setDraft({...updated.profile});
      setNotice('Perfil salvo no servidor. Os resultados das partidas permaneceram intactos.');
    }catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  function exportProfiles(){
    const blob=new Blob([JSON.stringify({versao:1,exportadoEm:new Date().toISOString(),profiles:list},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;
    a.download=`egidius-perfis-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  return <section className="athletes-screen">
    <div className="athletes-heading"><div><span className="athletes-eyebrow">ELENCO OFICIAL · SÁBADO SHOW</span><h1>Nosso elenco<span>.</span></h1><p>Perfis, história e as futuras figurinhas dos atletas. Dados esportivos calculados pelas súmulas.</p></div><span className="athletes-count"><UserRound size={20}/>{dados.jogadores.length} atletas</span></div>
    {error && <div className="athletes-warning" role="alert">{error}</div>}
    {notice && <div className="athletes-notice" role="status"><Check size={19}/>{notice}</div>}
    {selectedId && athlete ? <>
      <button type="button" className="athletes-back" onClick={()=>selectAthlete(null)}><ArrowLeft size={21}/> Voltar ao elenco</button>
      <div className="athletes-detail">
        <section className="athletes-identification">
          <div className="athletes-sticker athletes-sticker--feature"><div className="athletes-sticker-top"><img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/><span>{draft.numeroFigurinha?`Nº ${String(draft.numeroFigurinha).padStart(3,'0')}`:'EDIÇÃO SSW'}</span></div><div className="athletes-portrait">{activePortrait?<img className="athletes-portrait-photo" src={activePortrait.url} alt={`Retrato de ${title(athlete.nome,draft)}`}/>:<span aria-hidden="true">{initials(title(athlete.nome,draft))}</span>}{!activePortrait&&<div className="athletes-portrait-hint"><Camera size={19}/> Escolha uma foto ou caricatura</div>}</div><div className="athletes-sticker-bottom"><strong>{title(athlete.nome,draft)}</strong><small>{draft.apelido?`APELIDO: ${draft.apelido}`:draft.posicao==='nao-informada'?'FUTURO ÁLBUM DE FIGURINHAS':POSICOES.find(([key])=>key===draft.posicao)?.[1].toUpperCase()}</small></div></div>
          <div className="athlete-media-tools"><h3><Images size={21}/> Foto e caricatura</h3><p>Envie imagens agora ou depois. Aceita JPG, PNG e WebP (até 12 MB).</p><div className="athlete-media-uploads"><label><Camera size={18}/> Enviar foto<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={uploadingImage} onChange={e=>{void uploadPortrait(e.target.files?.[0],'photo');e.target.value='';}}/></label><label><Images size={18}/> Enviar caricatura<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={uploadingImage} onChange={e=>{void uploadPortrait(e.target.files?.[0],'caricature');e.target.value='';}}/></label></div><div className="athlete-media-previews">{[foto,caricatura].map((item,i)=>item?<div key={item.id} className="athlete-mini-media"><img src={item.url} alt={i===0?'Foto':'Caricatura'}/><span>{i===0?'Foto':'Caricatura'}</span><button type="button" onClick={()=>void deletePortrait(item)} disabled={uploadingImage} aria-label={`Excluir ${i===0?'foto':'caricatura'}`}>Excluir</button></div>:null)}</div><p className="athlete-media-help">{uploadingImage?'Transferindo imagem para o servidor…':'A figurinha usa o retrato preferido cadastrado na ficha. As imagens ficam no servidor.'}</p></div>
          <div className="athletes-mini-stats"><div><strong>{athStats?.presencas??0}</strong><small>Presenças</small></div><div><strong>{athStats?.jogos??0}</strong><small>Jogos</small></div><div><strong>{athStats?.gols??0}</strong><small>Gols</small></div><div><strong>{athStats?.pontos??0}</strong><small>Pontos</small></div></div>
        </section>
        <form className="athletes-form" onSubmit={e=>void save(e)}>
          <div className="athletes-form-header"><BookOpenText size={23}/><div><h2>Ficha do atleta</h2><p>Nome oficial: <strong>{athlete.nome}</strong>. A ficha visual não altera as súmulas.</p></div></div>
          <div className="athletes-fields">
            <label>Nome de exibição<input maxLength={80} value={draft.nomeExibicao} onChange={e=>update('nomeExibicao',e.target.value)} placeholder={athlete.nome}/></label>
            <label>Apelido<input maxLength={60} value={draft.apelido} onChange={e=>update('apelido',e.target.value)} placeholder="Como é chamado no campo"/></label>
            <label>Posição<select value={draft.posicao} onChange={e=>update('posicao',e.target.value as Posicao)}>{POSICOES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label>Pé dominante<select value={draft.peDominante} onChange={e=>update('peDominante',e.target.value as Pe)}>{PÉS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label>Retrato preferido na figurinha<select value={draft.retratoPreferido} onChange={e=>update('retratoPreferido',e.target.value as 'foto'|'caricatura')}><option value="foto">Foto (preferência)</option><option value="caricatura">Caricatura (preferência)</option></select></label>
            <label>Situação<select value={draft.situacao} onChange={e=>update('situacao',e.target.value as Situacao)}>{STATUS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label>Número da figurinha<input min={1} max={9999} type="number" value={draft.numeroFigurinha??''} onChange={e=>update('numeroFigurinha',e.target.value===''?null:Number(e.target.value))} placeholder="A definir"/></label>
            <label>Entrada no grupo<input type="date" value={draft.entradaGrupo??''} onChange={e=>update('entradaGrupo',e.target.value||null)}/></label>
            <label className="athletes-fields--wide">Bordão ou frase marcante<input maxLength={180} value={draft.bordao} onChange={e=>update('bordao',e.target.value)} placeholder="Uma frase que todo mundo conhece"/></label>
            <label className="athletes-fields--wide">Mini biografia<textarea maxLength={600} rows={5} value={draft.miniBio} onChange={e=>update('miniBio',e.target.value)} placeholder="Histórias, características e curiosidades do atleta"/><small>{draft.miniBio.length}/600 caracteres</small></label>
          </div>
          <div className="athletes-form-actions"><span><ShieldCheck size={18}/> Revisão {revision} · gravação individual no servidor</span><button type="submit" className="athletes-save" disabled={pending||!dirty}><Save size={21}/>{pending?'Salvando…':'Salvar ficha'}</button></div>
        </form>
      </div>
    </> : <>
      <div className="athletes-tools"><label className="athletes-search"><Search size={22}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nome ou apelido" aria-label="Buscar atleta"/></label><label className="athletes-filter"><Filter size={19}/><select value={filter} onChange={e=>setFilter(e.target.value as 'todos'|Situacao)} aria-label="Filtrar por situação"><option value="todos">Todos os atletas</option>{STATUS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button type="button" className="athletes-refresh" onClick={()=>void reload()}><RefreshCw size={19}/> Atualizar</button><button type="button" className="athletes-refresh" onClick={exportProfiles} disabled={!list.length}><Download size={19}/> Exportar fichas</button></div>
      <button type="button" className="ssw-cadastro-atalho" onClick={abrirCadastro}><Plus size={20}/> Cadastrar jogador</button>
      {loading ? <p className="athletes-placeholder">Carregando fichas do servidor…</p> : visible.length===0 ? <div className="athletes-placeholder"><CircleHelp size={28}/><p>{dados.jogadores.length === 0 ? 'O elenco ainda está vazio. Use Cadastrar jogador para adicionar o primeiro nome.' : 'Nenhum jogador corresponde aos filtros. Ajuste a busca ou a situação selecionada.'}</p></div> : <div className="athletes-grid">{visible.map(j=>{
        const p=records.get(j.id)?.profile||EMPTY;
        const s=stats.find(x=>x.id===j.id);
        return <button key={j.id} type="button" className="athletes-card" onClick={()=>selectAthlete(j.id)}><span className="athletes-card-top"><img src="/ssw-escudo-real.jpg" alt=""/><small>{p.numeroFigurinha?`#${String(p.numeroFigurinha).padStart(3,'0')}`:'SSW'}</small></span><span className="athletes-card-avatar">{(p.retratoPreferido==='caricatura'?(records.get(j.id)?.caricaturaMediaId||records.get(j.id)?.fotoMediaId):(records.get(j.id)?.fotoMediaId||records.get(j.id)?.caricaturaMediaId)) ? <img className="athletes-card-photo" src={mediaUrl((p.retratoPreferido==='caricatura'?(records.get(j.id)?.caricaturaMediaId||records.get(j.id)?.fotoMediaId):(records.get(j.id)?.fotoMediaId||records.get(j.id)?.caricaturaMediaId))!)} alt={`Retrato de ${j.nome}`}/> : initials(title(j.nome,p))}</span><strong>{title(j.nome,p)}</strong><small className="athletes-card-meta">{p.posicao==='nao-informada'?'Atleta SSW':POSICOES.find(([key])=>key===p.posicao)?.[1]} · {STATUS.find(([key])=>key===p.situacao)?.[1]}</small><span className="athletes-card-stats"><span><Trophy size={16}/>{s?.pontos??0} pts</span><span>{s?.gols??0} gols</span></span><span className="athletes-card-action">Abrir ficha <ArrowRight size={18}/></span></button>})}</div>}
      <p className="athletes-footnote"><Camera size={18}/> Fotos e caricaturas continuam vinculadas ao atleta. Quando não houver imagem, mostramos suas iniciais.</p>
    </>}
  </section>;
}
