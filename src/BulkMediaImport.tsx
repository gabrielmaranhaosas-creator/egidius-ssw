import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertTriangle, CheckCheck, FileArchive, ImagePlus, ShieldCheck, XCircle } from 'lucide-react';
import { apiError, getCsrf } from './mediaClient';
import './BulkMediaImport.css';

type Item = {item_id:string;filename:string;size:number;mime_type:string;kind:'photo'|'caricature';
  athlete_id:string|null;status:'exato'|'ambiguo'|'manual'};
type Preview={batch_id:string;revision:number;athletes:Record<string,string>;items:Item[];expires_in_minutes:number};
export function BulkMediaImport(){
  const [preview,setPreview]=useState<Preview|null>(null);
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const [types,setTypes]=useState<Record<string,'photo'|'caricature'>>({});
  const [enabled,setEnabled]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const selected=useMemo(()=>preview?.items.filter(i=>enabled[i.item_id] && !!chosen[i.item_id]) || [],[preview,enabled,chosen]);
  const knownIds=preview?.athletes||{};
  const valid=selected.length>0 && selected.every(i=>!!knownIds[chosen[i.item_id]]) && confirm && !busy && !done;
  const invalidate=()=>{setConfirm(false);setNotice('');};
  async function pickFile(ev:ChangeEvent<HTMLInputElement>){
    const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
    if(!file.name.toLowerCase().endsWith('.zip')){setError('Selecione um ZIP contendo somente imagens.');return;}
    if(file.size>80*1024*1024){setError('O ZIP deve ter no máximo 80 MB.');return;}
    setBusy(true);setError('');setNotice('');setPreview(null);setDone(false);setConfirm(false);
    try{
      const csrf=await getCsrf();
      const response=await fetch(`/api/import-media/preview?filename=${encodeURIComponent(file.name)}`,
        {method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf,'Content-Type':'application/zip'},body:file});
      if(!response.ok)throw new Error(await apiError(response));
      const result=await response.json() as Preview;
      setPreview(result);
      setChosen(Object.fromEntries(result.items.map(i=>[i.item_id,i.athlete_id||''])));
      setTypes(Object.fromEntries(result.items.map(i=>[i.item_id,i.kind])));
      setEnabled(Object.fromEntries(result.items.map(i=>[i.item_id,i.status==='exato'])));
    }catch(ex){setError((ex as Error).message);}finally{setBusy(false);}
  }
  function all(){if(!preview)return;setEnabled(Object.fromEntries(preview.items.map(i=>[i.item_id,!!chosen[i.item_id]])));invalidate();}
  function none(){setEnabled({});invalidate();}
  async function apply(){if(!preview || !valid)return;
    setBusy(true);setError('');setNotice('');
    try{
      const csrf=await getCsrf();
      const response=await fetch('/api/import-media/apply',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({batch_id:preview.batch_id,expected_state_revision:preview.revision,confirm:true,
          items:selected.map(i=>({item_id:i.item_id,athlete_id:chosen[i.item_id],kind:types[i.item_id]}))})});
      if(!response.ok)throw new Error(await apiError(response));
      const data=await response.json() as {created:number};setDone(true);setPreview(null);setNotice(`${data.created} imagem(ns) enviada(s) ao servidor. Consulte Atletas e Álbum para visualizar.`);
    }catch(ex){setError((ex as Error).message+' Os arquivos deste lote não foram gravados; revise e tente novamente.');}
    finally{setBusy(false);}
  }
  return <div className="bulk-media">
    <div className="bulk-intro"><FileArchive size={32}/><div><h2>Fotos e caricaturas em lote</h2><p>Envie um ZIP de imagens. Confira a prévia e associe cada imagem ao atleta correto antes de gravar.</p></div></div>
    <div className="bulk-tips"><strong>Como nomear:</strong> <code>Joaozinho_foto.jpg</code> e <code>Joaozinho_caricatura.png</code>.
      Usamos apenas correspondência exata com o nome ou apelido cadastrado; nunca associamos nomes parecidos por suposição.</div>
    <label className="bulk-file"><ImagePlus size={24}/><span>{busy?'Aguarde, processando o lote…':'Selecionar ZIP de imagens'}</span>
      <input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>void pickFile(e)}/></label>
    <p className="bulk-caption">Até 60 fotos/caricaturas; ZIP de até 80 MB; cada imagem até 12 MB. Somente JPG, PNG ou WebP. Nenhuma imagem existente será apagada ou substituída.</p>
    {error&&<div className="bulk-alert" role="alert"><AlertTriangle size={21}/>{error}</div>}
    {notice&&<div className="bulk-done" role="status"><ShieldCheck size={21}/>{notice}</div>}
    {preview&&<section className="bulk-results">
      <div className="bulk-heading"><h2>Conferir {preview.items.length} imagem(ns)</h2><strong>{selected.length} selecionada(s)</strong></div>
      <p>Prévia válida por {preview.expires_in_minutes} minutos. Os arquivos ainda não foram adicionados ao álbum.</p>
      <div className="bulk-actions"><button type="button" disabled={busy||done} onClick={all}><CheckCheck size={19}/> Selecionar vinculadas</button>
        <button type="button" disabled={busy||done} onClick={none}><XCircle size={19}/> Limpar seleção</button>
        <button type="button" disabled={busy} onClick={()=>{setPreview(null);setConfirm(false);setDone(false);}}>Trocar ZIP</button></div>
      <div className="bulk-grid">{preview.items.map(item=><article className="bulk-card" key={item.item_id}>
        <img alt={`Prévia: ${item.filename}`} loading="lazy" src={`/api/import-media/preview/${preview.batch_id}/${item.item_id}/image`}/>
        <div className="bulk-card-body"><strong title={item.filename}>{item.filename}</strong><small>{(item.size/1024/1024).toFixed(2)} MB · {item.status==='exato'?'Correspondência exata':item.status==='ambiguo'?'Nome ambíguo':'Vínculo manual'}</small>
          <label>Atleta
            <select disabled={busy||done} value={chosen[item.item_id]||''} onChange={e=>{const aid=e.target.value;setChosen(p=>({...p,[item.item_id]:aid}));setEnabled(p=>({...p,[item.item_id]:!!aid}));invalidate();}}>
              <option value="">Selecione o atleta</option>
              {Object.entries(knownIds).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([id,name])=><option value={id} key={id}>{name}</option>)}
            </select></label>
          <label>Tipo de imagem
            <select disabled={busy||done} value={types[item.item_id]||'photo'} onChange={e=>{setTypes(p=>({...p,[item.item_id]:e.target.value as 'photo'|'caricature'}));invalidate();}}>
              <option value="photo">Fotografia</option><option value="caricature">Caricatura</option>
            </select></label>
          <label className="bulk-check"><input type="checkbox" disabled={!chosen[item.item_id]||busy||done} checked={!!enabled[item.item_id]} onChange={e=>{setEnabled(p=>({...p,[item.item_id]:e.target.checked}));invalidate();}}/> Importar esta imagem</label>
        </div></article>)}</div>
      {!done&&<><label className="bulk-confirm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>
        <span>Tenho um backup completo e conferi o atleta e o tipo de cada imagem selecionada. Autorizo gravar somente as imagens selecionadas.</span></label>
        <button className="bulk-submit" type="button" disabled={!valid} onClick={()=>void apply()}>{busy?'Salvando…':`Importar ${selected.length} imagem(ns) confirmada(s)`}</button></>}
    </section>}
    <p className="bulk-footer"><ShieldCheck size={20}/> O cadastro, as escalações, os placares e os rankings não serão modificados. Fotos antigas permanecem disponíveis na Central de Mídia.</p>
  </div>;
}
