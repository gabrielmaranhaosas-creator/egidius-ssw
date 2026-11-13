import { useTrabalhoPendente } from './TrabalhoPendente';
import { useState } from 'react';
import { aplicarEscolhas } from './MesclarEstados';
import type { Mescla } from './MesclarEstados';
import type { DadosSSW } from './SSWStore';
function resumir(value:unknown):string{
 if(value===undefined)return 'Registro removido nesta versão';
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const v=value as Record<string,unknown>;
  if('timeA'in v)return `Jogo ${v.numero}: ${v.timeA} ${v.golsA} × ${v.golsB} ${v.timeB} · ${v.status}`;
  if('nome'in v)return String(v.nome);
 }
 return JSON.stringify(value);
}
export function RevisarConflitos({mescla,salvar,cancelar}:{mescla:Mescla;salvar:(dados:DadosSSW)=>Promise<void>;cancelar:()=>void}){
 const [escolhas,setEscolhas]=useState<Record<number,'local'|'remoto'>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useTrabalhoPendente('revisao',busy||Object.keys(escolhas).length>0,'Revisão de alterações ainda não confirmada',busy);
 return <main className="surface ux-organization"><h1>Conferir alterações simultâneas</h1><p>Alterações em registros diferentes já foram reunidas. Escolha a versão de cada registro abaixo. Nenhuma escolha será enviada até confirmar. O backup local já foi solicitado; confira seus downloads.</p>{mescla.divergencias.map((d,i)=><fieldset key={i}><legend>Registro em conflito {i+1}</legend><label><input type="radio" name={`conflito-${i}`} checked={escolhas[i]==='local'} disabled={busy} onChange={()=>setEscolhas(e=>({...e,[i]:'local'}))}/>Minha edição — {resumir(d.local)}</label><label><input type="radio" name={`conflito-${i}`} checked={escolhas[i]==='remoto'} disabled={busy} onChange={()=>setEscolhas(e=>({...e,[i]:'remoto'}))}/>No servidor — {resumir(d.remoto)}</label><details><summary>Conferir todos os campos deste registro</summary><p>{d.rotulo}</p><h3>Minha edição</h3><pre>{JSON.stringify(d.local,null,2)??'Removido'}</pre><h3>No servidor</h3><pre>{JSON.stringify(d.remoto,null,2)??'Removido'}</pre></details></fieldset>)}{error&&<p role="alert">{error}</p>}<button type="button" disabled={busy||Object.keys(escolhas).length!==mescla.divergencias.length} onClick={async()=>{if(!window.confirm('Aplicar somente as versões escolhidas e manter as demais alterações reunidas?'))return;setBusy(true);try{await salvar(aplicarEscolhas(mescla,escolhas));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Salvando…':'Confirmar versões escolhidas'}</button><button type="button" disabled={busy} onClick={cancelar}>Voltar sem enviar escolhas</button></main>;
}
