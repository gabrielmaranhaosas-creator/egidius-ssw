import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera, CheckCheck, Film, ImagePlus, Images, LoaderCircle, RefreshCcw, Save, Trash2, Upload, Video, X, FileText, Download } from 'lucide-react';
import { useDadosSSW, dataFormatada } from './SSWStore';
import { captionMedia, getCsrf, listMedia, mediaIsImage, mediaSize, removeMedia, uploadMedia } from './mediaClient';
import type { MediaItem } from './mediaClient';
import './MediaPage.css';

export function MediaPage({documentsOnly=false}:{documentsOnly?:boolean}){
  const dados=useDadosSSW();
  const rounds=useMemo(()=>[...dados.rodadas].sort((a,b)=>b.data.localeCompare(a.data)),[dados.rodadas]);
  const [roundId,setRoundId]=useState('');
  const [matchId,setMatchId]=useState('');
  const [kind,setKind]=useState<'photo'|'video'|'document'>(documentsOnly?'document':'photo');
  const [files,setFiles]=useState<File[]>([]);
  const [items,setItems]=useState<MediaItem[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [caption,setCaption]=useState('');
  const picker=useRef<HTMLInputElement>(null);
  const loading=useRef(0);
  const currentRound=rounds.find(r=>r.id===roundId);
  const selectedCount=selected.length;
  useEffect(()=>{if(!roundId&&rounds.length)setRoundId(rounds[0].id);},[roundId,rounds]);
  useEffect(()=>{setMatchId('');setSelected([]);},[roundId]);
  async function reload(){
    const serial=++loading.current;
    if(!roundId){setItems([]);return;}
    try{setError('');const result=await listMedia({scope:'round',round_id:roundId});if(serial===loading.current)setItems(documentsOnly?result.filter(i=>i.kind==='document'):result);}
    catch(e){if(serial===loading.current)setError((e as Error).message);}
  }
  useEffect(()=>{void reload();},[roundId]);
  function updateFiles(e:ChangeEvent<HTMLInputElement>){
    const next=Array.from(e.target.files||[]);
    setFiles(next);setMessage('');setError('');
  }
  async function upload(){
    if(!roundId||!files.length||busy)return;
    if(files.length>12){setError('Envie no máximo 12 arquivos por vez.');return;}
    setBusy(true);setMessage('');setError('');
    let success=0;
    try{
      const csrf=await getCsrf();
      for(const file of files){
        const video=file.type.startsWith('video/')||/\.(mp4|mov|webm)$/i.test(file.name);
        const document=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
        if((kind==='video')!==video||(kind==='document')!==document)throw new Error(`${file.name}: escolha o tipo correto de arquivo.`);
        const limit=kind==='video'?100:kind==='document'?20:12;
        if(file.size>limit*1024*1024)throw new Error(`${file.name}: limite de ${limit} MB.`);
      }
      for(const [i,file] of files.entries()){ 
        setProgress(`Enviando ${i+1}/${files.length}: ${file.name}`);
        await uploadMedia(file,{scope:'round',kind,round_id:roundId,match_id:matchId||undefined,caption},csrf);
        success++;
      }
      setMessage(`${success} arquivo(s) salvo(s) no servidor.`);
      setFiles([]);setCaption('');if(picker.current)picker.current.value='';
    }catch(e){if(success){setFiles(files.slice(success));if(picker.current)picker.current.value='';}setError(`${(e as Error).message} ${success?`${success} arquivo(s) salvo(s). Os restantes continuam na lista para nova tentativa.`:''}`);}
    finally{setBusy(false);setProgress('');await reload();}
  }
  async function updateCaption(item:MediaItem){
    const next=window.prompt('Legenda da mídia (máximo de 250 caracteres):',item.caption);
    if(next===null||next===item.caption)return;
    if(next.length>250){setError('Legenda muito longa.');return;}
    try{const csrf=await getCsrf();await captionMedia(item.id,next,csrf);setMessage('Legenda salva.');await reload();}
    catch(e){setError((e as Error).message);}
  }
  async function deleteSelection(ids:string[]){
    if(!ids.length||busy)return;
    const approved=window.confirm(`Excluir definitivamente ${ids.length} arquivo(s) do servidor? Esta ação não pode ser desfeita.`);
    if(!approved)return;
    setBusy(true);setError('');setMessage('');
    let removed=0;
    try{
      const csrf=await getCsrf();
      for(const id of ids){await removeMedia(id,csrf);removed++;}
      setMessage(`${removed} arquivo(s) excluído(s).`);setSelected([]);
    }catch(e){setError(`${(e as Error).message}. ${removed} arquivo(s) já excluído(s).`);}
    finally{setBusy(false);await reload();}
  }
  const checked=(id:string)=>selected.includes(id);
  const toggle=(id:string)=>setSelected(p=>p.includes(id)?p.filter(v=>v!==id):[...p,id]);
  const chooseAll=()=>setSelected(selectedCount===items.length?[]:items.map(x=>x.id));
  return <section className="media-page">
    <header className="media-banner">
      <div><p className="media-kicker">MEMÓRIA AUDIOVISUAL · SÁBADO SHOW</p><h1>{documentsOnly?'Documentos PDF':'Central de mídia'}<span>.</span></h1><p>{documentsOnly?'Guarde os documentos do grupo por sábado e faça o download quando precisar.':'Fotos, vídeos e PDFs de cada sábado, organizados por partida.'}</p></div>
      <div className="media-banner-icon"><Images size={52}/></div>
    </header>
    <div className="media-status-row"><span><Camera size={20}/>{items.filter(i=>i.kind==='photo').length} fotos</span><span><Film size={20}/>{items.filter(i=>i.kind==='video').length} vídeos</span><span><FileText size={20}/>{items.filter(i=>i.kind==='document').length} PDFs</span><span><Save size={20}/>Arquivos salvos no servidor</span></div>
    {error&&<p className="media-alert media-alert--error" role="alert">{error}</p>}
    {message&&<p className="media-alert" role="status">{message}</p>}
    <section className="media-panel">
      <div className="media-heading"><h2>Enviar arquivos</h2><p>Escolha o sábado e, se desejar, a partida. A galeria poderá receber novas imagens a qualquer momento.</p></div>
      {rounds.length===0?<p className="media-empty">Crie um sábado em Sábado completo para organizar os arquivos.</p>:<>
        <div className="media-input-grid">
          <label>Sábado<select value={roundId} onChange={e=>setRoundId(e.target.value)} disabled={busy}>{rounds.map(r=><option key={r.id} value={r.id}>{dataFormatada(r.data)}</option>)}</select></label>
          <label>Partida<select value={matchId} onChange={e=>setMatchId(e.target.value)} disabled={busy}><option value="">Galeria geral do sábado</option>{currentRound?.jogos.map(j=><option key={j.id} value={j.id}>Jogo {j.numero} · {j.timeA} × {j.timeB}</option>)}</select></label>
          <label>Tipo de mídia<select value={kind} onChange={e=>{setKind(e.target.value as 'photo'|'video'|'document');setFiles([]);if(picker.current)picker.current.value='';}} disabled={busy}>{!documentsOnly&&<><option value="photo">Fotografias</option><option value="video">Vídeos</option></>}<option value="document">Documentos PDF</option></select></label>
          <label>Legenda opcional<input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={250} placeholder="Ex.: jogo histórico, sábado animado" disabled={busy}/></label>
        </div>
        <label className="media-file-zone"><ImagePlus size={26}/><span><strong>Escolher {kind==='video'?'vídeos':kind==='document'?'PDFs':'fotografias'}</strong><small>{kind==='video'?'MP4, MOV ou WebM · até 100 MB cada':kind==='document'?'PDF sem senha · até 20 MB e 300 páginas':'JPG, PNG ou WebP · até 12 MB cada'} · até 12 de cada vez</small></span><input ref={picker} type="file" multiple accept={kind==='video'?'.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm':kind==='document'?'.pdf,application/pdf':'.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'} onChange={updateFiles} disabled={busy}/></label>
        {files.length>0&&<p className="media-selected-files">{files.length} selecionado(s) · {files.map(f=>f.name).join(', ')}</p>}
        <button type="button" className="media-primary" onClick={()=>void upload()} disabled={!roundId||!files.length||busy}>{busy?<LoaderCircle size={22}/>:<Upload size={22}/>} {progress||`Enviar ${files.length?files.length+' arquivo(s)':'mídia'} ao servidor`}</button>
      </>}
    </section>
    <section className="media-panel">
      <div className="media-gallery-heading"><div className="media-heading"><h2>{documentsOnly?'Documentos do sábado':'Galeria do sábado'}</h2><p>{currentRound?`Rodada de ${dataFormatada(currentRound.data)} · ${items.length} arquivo(s) exibido(s)`:'Selecione uma rodada'}</p></div><button className="media-secondary" type="button" onClick={()=>void reload()} disabled={busy||!roundId}><RefreshCcw size={19}/> Atualizar</button></div>
      {items.length>0&&<div className="media-toolbar"><button type="button" className="media-secondary" onClick={chooseAll} disabled={busy}><CheckCheck size={19}/>{selectedCount===items.length?'Desmarcar todos':'Selecionar todos'}</button><button type="button" className="media-delete" disabled={!selectedCount||busy} onClick={()=>void deleteSelection(selected)}><Trash2 size={19}/>Excluir ({selectedCount})</button></div>}
      {items.length===0?<div className="media-empty"><Images size={36}/><h3>Nenhum arquivo nesta rodada</h3><p>Faça upload acima. Os arquivos aparecerão aqui, inclusive após reiniciar o Mac.</p></div>:<div className="media-grid">{items.map(item=><article className={`media-tile ${checked(item.id)?'media-tile--checked':''}`} key={item.id}>
        <div className="media-thumb">{item.kind==='document'?<a className="ssw-pdf-download" href={item.url} download><FileText size={55}/><span>Baixar PDF</span></a>:mediaIsImage(item)?<img src={item.url} alt={item.caption||item.filename} loading="lazy"/>:<video src={item.url} controls preload="metadata" playsInline aria-label={item.caption||item.filename}/>}<label className="media-check"><input type="checkbox" checked={checked(item.id)} onChange={()=>toggle(item.id)}/><span>Selecionar</span></label></div>
        <div className="media-tile-body"><strong>{item.caption||item.filename}</strong><small>{item.match_id?`Partida ${currentRound?.jogos.find(j=>j.id===item.match_id)?.numero??'vinculada'}`:'Galeria geral'} · {mediaSize(item.size)}</small><div className="media-tile-actions"><a className="media-secondary" href={item.url} download><Download size={17}/> Baixar</a><button type="button" onClick={()=>void updateCaption(item)} disabled={busy}><Save size={17}/> Legenda</button><button type="button" className="media-tile-remove" onClick={()=>void deleteSelection([item.id])} disabled={busy}><X size={17}/> Excluir</button></div></div>
      </article>)}</div>}
      <p className="media-footer-note"><Video size={19}/> Para guardar registros e arquivos juntos, baixe o backup completo em Importar e arquivos → Guia e backup.</p>
    </section>
  </section>;
}
