import { useMemo, useState } from 'react';
import { Download, FileUp, UsersRound } from 'lucide-react';
import { apiError, getCsrf } from './mediaClient';

type Row = {row:number; nome:string; status:'novo'|'existente'|'repetido'|'erro'; error:string|null};
type Preview = {revision:number; columns:string[]; name_column:string|null; rows:Row[]};

export function ElencoImport(){
  const [file,setFile]=useState<File|null>(null);
  const [text,setText]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [column,setColumn]=useState('');
  const [enabled,setEnabled]=useState<Record<number,boolean>>({});
  const [names,setNames]=useState<Record<number,string>>({});
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const chosen=useMemo(()=>preview?.rows.filter(r=>enabled[r.row] && r.status!=='existente' && r.status!=='repetido')||[],[preview,enabled]);
  function reset(){setPreview(null);setConfirm(false);setDone(false);setError('');setMessage('');}
  async function load(nextColumn?:string){
    if(busy||(!file&&!text.trim()))return;
    setBusy(true);setError('');setMessage('');setConfirm(false);setDone(false);
    try{
      const source=file||new File([text],'tabela.txt',{type:'text/plain'});
      if(source.size>3*1024*1024)throw new Error('Use um arquivo ou tabela de até 3 MB.');
      const csrf=await getCsrf();
      const query=new URLSearchParams({filename:source.name});
      if(nextColumn)query.set('name_column',nextColumn);
      const response=await fetch('/api/intake/preview?'+query,{method:'POST',credentials:'same-origin',
        headers:{'X-CSRF-Token':csrf,'Content-Type':'application/octet-stream'},body:source});
      if(!response.ok)throw new Error(await apiError(response));
      const data=await response.json() as Preview;
      setPreview(data);setColumn(data.name_column||'');
      setNames(Object.fromEntries(data.rows.map(r=>[r.row,r.nome])));
      setEnabled(Object.fromEntries(data.rows.map(r=>[r.row,r.status==='novo'])));
    }catch(e){setError((e as Error).message);setPreview(null);}finally{setBusy(false);}
  }
  async function apply(){
    if(!preview||!confirm||!chosen.length||busy||done)return;
    setBusy(true);setError('');setMessage('');
    try{
      const csrf=await getCsrf();
      const response=await fetch('/api/intake/apply',{method:'POST',credentials:'same-origin',
        headers:{'X-CSRF-Token':csrf,'Content-Type':'application/json'},
        body:JSON.stringify({expected_revision:preview.revision,confirm:true,names:chosen.map(r=>names[r.row])})});
      if(!response.ok)throw new Error(await apiError(response));
      const result=await response.json() as {created:number};
      setDone(true);setMessage(`${result.created} jogador(es) cadastrado(s). As presenças continuam como estavam. Abra Jogadores para consultar o elenco.`);
      window.dispatchEvent(new Event('focus'));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="import-page">
    <div className="import-hero"><p>GESTÃO DO SSW</p><h1>Importar elenco<span>.</span></h1><div>Traga os nomes de uma planilha ou tabela. Confira a prévia e escolha o que cadastrar.</div></div>
    <section className="import-panel"><h2>1. Preparar os nomes</h2>
      <p>CSV, XLSX e JSON, até 3 MB e 300 jogadores por lote. Para XLSX, use a aba ativa da planilha. A primeira linha da tabela deve conter os títulos das colunas.</p>
      <div className="import-actions"><a className="ssw-download-link" href="/api/intake/template?format=xlsx" download><Download size={18}/> Modelo Excel</a><a className="ssw-download-link" href="/api/intake/template?format=csv" download><Download size={18}/> Modelo CSV</a></div>
      <label className="import-file"><FileUp size={23}/><span>{file?file.name:'Selecionar planilha ou JSON'}</span><input aria-label="Arquivo do elenco" type="file" accept=".csv,.xlsx,.json,.tsv,.txt" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f){setFile(f);setText('');reset();}e.target.value='';}}/></label>
      <label className="ssw-table-paste">Ou cole uma tabela do Excel, Google Sheets ou uma lista de nomes<textarea aria-label="Tabela ou lista de jogadores" rows={6} value={text} disabled={busy} placeholder="Uma lista simples também pode ter um nome por linha." onChange={e=>{setText(e.target.value);setFile(null);reset();}}/></label>
      <button className="import-submit" type="button" disabled={busy||(!file&&!text.trim())} onClick={()=>void load()}>{busy?'Lendo…':'Gerar prévia do elenco'}</button>
    </section>
    {error&&<div className="import-error" role="alert">{error}</div>}
    {message&&<div className="import-success" role="status">{message}</div>}
    {preview&&<section className="import-panel"><h2>2. Conferir a seleção</h2>
      <label className="import-target">Coluna dos nomes<select aria-label="Coluna dos nomes" value={column} disabled={busy||done} onChange={e=>void load(e.target.value)}><option value="">Escolha uma coluna</option>{preview.columns.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <p>{preview.rows.length} registros na prévia · {chosen.length} selecionados. Nomes já cadastrados ou repetidos não serão criados novamente. Nomes com e sem acento continuam distintos.</p>
      <div className="import-rows">{preview.rows.map(row=><article className="import-row" key={row.row}>
        <div className="import-row-top"><label><input type="checkbox" aria-label={`Importar linha ${row.row}`} checked={!!enabled[row.row]} disabled={busy||done||!column||row.status==='existente'||row.status==='repetido'} onChange={e=>{setEnabled(p=>({...p,[row.row]:e.target.checked}));setConfirm(false);}}/><strong>Linha {row.row}</strong></label><span className="import-row-status">{row.status==='novo'?'Novo jogador':row.status==='existente'?'Já cadastrado':row.status==='repetido'?'Repetido no arquivo':'Revisar nome'}</span></div>
        <label className="ssw-import-name">Nome<input aria-label={`Nome da linha ${row.row}`} maxLength={70} value={names[row.row]||''} disabled={busy||done||row.status==='existente'||row.status==='repetido'} onChange={e=>{setNames(p=>({...p,[row.row]:e.target.value}));setConfirm(false);}}/></label>
        {row.error&&names[row.row]===row.nome&&<p className="import-line-error">{row.error}</p>}
      </article>)}</div>
      {!done&&<><label className="import-confirm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/><span>Conferi os nomes selecionados e autorizo cadastrar esse elenco.</span></label><button className="import-submit" type="button" disabled={busy||!confirm||!chosen.length||!column} onClick={()=>void apply()}>{busy?'Cadastrando…':`Cadastrar ${chosen.length} jogador(es) selecionado(s)`}</button></>}
    </section>}
    <div className="import-note"><UsersRound size={22}/> Cadastrar o elenco não registra chegadas, não monta times e não altera os integrantes da viagem. O SSW registra as presenças no dia do jogo.</div>
  </section>;
}
