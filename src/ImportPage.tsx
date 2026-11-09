import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertTriangle, CheckCheck, FileSpreadsheet, FileUp, RefreshCw, ShieldCheck, UsersRound, XCircle } from 'lucide-react';
import { apiError, getCsrf } from './mediaClient';
import './ImportPage.css';
import { BulkMediaImport } from './BulkMediaImport';
import { ElencoImport } from './ElencoImport';
import { MediaPage } from './MediaPage';
import { GestaoSSW } from './GestaoSSW';

type ImportRow = {
  row_number:number; nome:string; fields:Record<string,string|number>;
  status:'pronto'|'revisar'|'ambiguo'|'erro'; athlete_id:string|null;
  expected_revision:number; candidates:string[]; error:string|null;
};
type Preview = {revision:number;athletes:Record<string,string>;profiles_revisions:Record<string,number>;
  rows:ImportRow[];summary:{total:number;ready:number;review:number;errors:number}};
const FIELD_LABELS:Record<string,string>={apelido:'Apelido',nomeExibicao:'Nome de exibição',posicao:'Posição',
  peDominante:'Pé dominante',situacao:'Situação',numeroFigurinha:'Nº figurinha',
  entradaGrupo:'Entrada',miniBio:'Biografia',bordao:'Bordão',retratoPreferido:'Imagem preferida'};
function ProfileImportPage(){
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selected,setSelected]=useState<Record<number,string>>({});
  const [enabled,setEnabled]=useState<Record<number,boolean>>({});
  const [filename,setFilename]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [complete,setComplete]=useState(false);

  async function load(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; e.target.value='';
    if(!file)return;
    setError('');setSuccess('');setComplete(false);setConfirm(false);setPreview(null);
    if(file.size>3*1024*1024){setError('O arquivo deve ter até 3 MB. Divida bases maiores.');return;}
    setBusy(true);
    try{
      const csrf=await getCsrf();
      const response=await fetch(`/api/import/preview?filename=${encodeURIComponent(file.name)}`,{
        method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf,'Content-Type':'application/octet-stream'},body:file
      });
      if(!response.ok)throw new Error(await apiError(response));
      const result=await response.json() as Preview;
      setFilename(file.name);setPreview(result);
      setSelected(Object.fromEntries(result.rows.map(r=>[r.row_number,r.athlete_id||''])));
      setEnabled(Object.fromEntries(result.rows.map(r=>[r.row_number,r.status==='pronto'])));
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }

  const chosen=useMemo(()=>preview?.rows.filter(r=>enabled[r.row_number] && !!selected[r.row_number] && r.status!=='erro')||[],[preview,enabled,selected]);
  const dupe=useMemo(()=>{const ids=chosen.map(r=>selected[r.row_number]);return ids.length!==new Set(ids).size;},[chosen,selected]);
  const hasInvalid=chosen.some(r=>!preview?.athletes[selected[r.row_number]]);
  const readyToApply=chosen.length>0 && !dupe && !hasInvalid && confirm && !busy && !complete;
  function pick(row:number,value:string){setSelected(p=>({...p,[row]:value}));setEnabled(p=>({...p,[row]:!!value}));setConfirm(false);}
  function toggle(row:number,value:boolean){setEnabled(p=>({...p,[row]:value}));setConfirm(false);}
  async function apply(){
    if(!preview||!readyToApply)return;
    setBusy(true);setError('');setSuccess('');
    try{
      const csrf=await getCsrf();
      const response=await fetch('/api/import/apply',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({expected_state_revision:preview.revision,confirm:true,
          lines:chosen.map(r=>({row_number:r.row_number,athlete_id:selected[r.row_number],
            expected_revision:preview.profiles_revisions[selected[r.row_number]]||0,fields:r.fields}))})});
      if(!response.ok)throw new Error(await apiError(response));
      const result=await response.json() as {updated:number};
      setComplete(true);setSuccess(`${result.updated} ficha(s) salva(s). Nenhuma súmula foi modificada. Abra Atletas ou Álbum para visualizar.`);
    }catch(err){setError((err as Error).message+' Nenhuma operação foi confirmada. Gere nova prévia se necessário.');}
    finally{setBusy(false);}
  }
  return <section className="import-page">
    <div className="import-hero"><p>GESTÃO DO SSW</p><h1>Importador inteligente<span>.</span></h1>
      <div>Atualize as figurinhas com dados em lote, sem duplicar jogadores nem alterar partidas.</div></div>
    <div className="import-feature-grid"><div><FileSpreadsheet size={25}/><strong>CSV, JSON e XLSX</strong><span>Até 3 MB ou 300 registros por importação.</span></div><div><UsersRound size={25}/><strong>IDs preservados</strong><span>Correspondência exata por ID, nome ou apelido.</span></div><div><ShieldCheck size={25}/><strong>Prévia obrigatória</strong><span>Somente as fichas escolhidas serão atualizadas.</span></div></div>
    <section className="import-panel"><h2>1. Escolher arquivo</h2><p>Use o nome oficial do atleta ou, de preferência, seu ID. Colunas vazias não substituem informações existentes. Cadastre os jogadores novos na aba Importar elenco antes de atualizar as fichas.</p>
      <label className="import-file"><FileUp size={24}/><span>{busy?'Processando…':'Selecionar planilha ou JSON'}</span><input type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>void load(e)}/></label>
      <p className="import-hint">Colunas suportadas: nome, athlete_id, apelido, nome_exibicao, posicao, pe_dominante, situacao, numero_figurinha, entrada_grupo, mini_bio, bordao, retrato_preferido. Valores não reconhecidos serão sinalizados.</p>
    </section>
    {error&&<div className="import-error" role="alert"><AlertTriangle size={21}/>{error}</div>}
    {success&&<div className="import-success" role="status"><ShieldCheck size={21}/>{success}</div>}
    {preview&&<section className="import-panel">
      <header className="import-panel-head"><div><h2>2. Conferir correspondências</h2><p>Arquivo: <strong>{filename}</strong> · {preview.summary.total} linhas</p></div><span className="import-count">{chosen.length} selecionada(s)</span></header>
      <div className="import-summary">{preview.summary.ready} vínculos encontrados · {preview.summary.review} sem correspondência · {preview.summary.errors} linhas inválidas</div>
      <div className="import-actions"><button type="button" onClick={()=>{setEnabled(Object.fromEntries(preview.rows.map(r=>[r.row_number,!!selected[r.row_number]&&r.status!=='erro'])));setConfirm(false);}}><CheckCheck size={18}/> Selecionar válidos</button>
        <button type="button" onClick={()=>{setEnabled({});setConfirm(false);}}><XCircle size={18}/> Limpar seleção</button>
        <button type="button" onClick={()=>{setPreview(null);setConfirm(false);setComplete(false);}}><RefreshCw size={18}/> Trocar arquivo</button></div>
      <div className="import-rows">{preview.rows.map(row=>{
        const id=selected[row.row_number]||'';
        return <article className={`import-row ${row.status==='erro'?'import-row--error':''}`} key={row.row_number}>
          <div className="import-row-top"><label><input type="checkbox" checked={!!enabled[row.row_number]} disabled={!id||row.status==='erro'||complete} onChange={e=>toggle(row.row_number,e.target.checked)}/><strong>Linha {row.row_number}</strong></label>
          <span className="import-source-name">{row.nome||'Nome não informado'}</span><span className="import-row-status">{row.status==='pronto'?'Vínculo encontrado':row.status==='ambiguo'?'Ambíguo':row.status==='erro'?'Linha inválida':'Vínculo manual'}</span></div>
          {row.error?<p className="import-line-error">{row.error}</p>:<><label className="import-target">Associar ao atleta cadastrado
            <select aria-label={`Atleta correspondente à linha ${row.row_number}`} disabled={complete} value={id} onChange={e=>pick(row.row_number,e.target.value)}><option value="">Não importar esta linha</option>
              {Object.entries(preview.athletes).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([aid,n])=><option key={aid} value={aid}>{n}</option>)}</select>
          </label><div className="import-fields">{Object.entries(row.fields).map(([key,val])=><span key={key}><b>{FIELD_LABELS[key]||key}:</b> {String(val)}</span>)}</div></>}
        </article>;
      })}</div>
      {dupe&&<div className="import-error">Dois registros selecionados apontam para o mesmo atleta. Desmarque ou revise os vínculos antes de importar.</div>}
      {!complete&&<><label className="import-confirm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/><span>Tenho backup atualizado e conferi todos os vínculos acima. Autorizo atualizar apenas as fichas selecionadas.</span></label>
        <button className="import-submit" type="button" disabled={!readyToApply} onClick={()=>void apply()}>{busy?'Salvando…':`3. Importar ${chosen.length} ficha(s) selecionada(s)`}</button></>}
    </section>}
    <div className="import-note"><ShieldCheck size={22}/> As rodadas, escalações, gols e rankings não são reescritos por este importador. Para enviar imagens em lote, use a aba Fotos e caricaturas acima.</div>
  </section>;
}

export function ImportPage(){
  const [tab,setTab]=useState<'elenco'|'profiles'|'photos'|'documents'|'guide'>('elenco');
  const tabs=[['elenco','Importar elenco'],['profiles','Atualizar fichas'],['photos','Fotos e caricaturas'],['documents','Documentos PDF'],['guide','Guia e backup']] as const;
  return <div className="import-mode-container">
    <div className="import-mode-tabs" role="group" aria-label="Tipo de importação">
      {tabs.map(([id,label])=><button type="button" key={id} className={tab===id?'import-mode-active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    {tab==='elenco'?<ElencoImport/>:tab==='profiles'?<ProfileImportPage/>:tab==='photos'?<BulkMediaImport/>:tab==='documents'?<MediaPage documentsOnly/>:<GestaoSSW/>}
  </div>;
}
