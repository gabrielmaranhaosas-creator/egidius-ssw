import { useEffect,useState } from 'react';
import { apiError,getCsrf } from './mediaClient';
import type { MediaItem } from './mediaClient';
import { usePapel } from './Permissoes';
import { useTrabalhoPendente } from './TrabalhoPendente';
export function LixeiraArquivos({atualizar}:{atualizar?:()=>void}){
 const [items,setItems]=useState<(MediaItem&{deleted_at:string})[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const papel=usePapel();useTrabalhoPendente('lixeira-media',busy,'Restauração ou exclusão em andamento',busy);
 async function load(){const r=await fetch('/api/media/trash',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error(await apiError(r));setItems((await r.json()).items);}
 useEffect(()=>{if(open)void load().catch(e=>setError(e.message));},[open]);
 async function action(item:MediaItem,purge=false){
  if(purge&&!window.confirm(`Excluir definitivamente “${item.filename}”? Esta ação elimina o arquivo e não pode ser desfeita. Faça backup antes.`))return;
  setBusy(true);setError('');setNotice('');try{const csrf=await getCsrf();const r=await fetch(`/api/media/${encodeURIComponent(item.id)}/${purge?'purge':'restore'}`,{method:purge?'DELETE':'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf}});if(!r.ok)throw Error(await apiError(r));await load();atualizar?.();setNotice(purge?'Arquivo excluído definitivamente.':'Arquivo restaurado à sua galeria de origem.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <details className="ux-maintenance" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Lixeira de arquivos — restaurar fotos, vídeos e PDFs</summary><div className="ux-trash-content"><p>Arquivos removidos ficam aqui até exclusão definitiva por um administrador. Continuam ocupando espaço e fazem parte do backup completo.</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{items.length===0?<p>Nenhum arquivo na lixeira.</p>:items.map(item=><article key={item.id}><strong>{item.filename}</strong><p>Removido em {new Date(item.deleted_at).toLocaleString('pt-BR')} · {item.scope==='athlete'?'Retrato de jogador':'Galeria do sábado'}</p><button type="button" disabled={busy||papel==='viewer'} onClick={()=>void action(item)}>Restaurar arquivo</button>{papel==='admin'&&<button type="button" disabled={busy} onClick={()=>void action(item,true)}>Excluir definitivamente</button>}</article>)}<button type="button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Atualizar lixeira</button></div></details>;
}
