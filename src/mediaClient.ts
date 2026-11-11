export type MediaItem = {
  id:string; scope:'athlete'|'round'; kind:'photo'|'caricature'|'video'|'document';
  athlete_id:string|null; round_id:string|null; match_id:string|null;
  filename:string;caption:string;mime_type:string;size:number;url:string;created_at:string|null;
};
export async function apiError(r:Response){
  const body=await r.json().catch(()=>null) as {detail?:string}|null;
  return body?.detail || `Erro do servidor (HTTP ${r.status})`;
}
export async function getCsrf(){
  const r=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw new Error(await apiError(r));
  const a=await r.json() as {authenticated:boolean;csrf?:string};
  if(!a.authenticated||!a.csrf)throw new Error('Sessão expirada. Entre novamente no EGIDIUS.');
  return a.csrf;
}
export async function listMedia(params:{scope?:'all'|'round'|'athlete';athlete_id?:string;round_id?:string;match_id?:string}){
  const search=new URLSearchParams();
  Object.entries(params).forEach(([key,val])=>{if(val)search.set(key,val);});
  const r=await fetch(`/api/media?${search}`,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw new Error(await apiError(r));
  return (await r.json() as {items:MediaItem[]}).items;
}
export async function uploadMedia(file:File,params:{scope:'athlete'|'round';kind:'photo'|'caricature'|'video'|'document';athlete_id?:string;round_id?:string;match_id?:string;caption?:string},csrf:string){
  const search=new URLSearchParams();
  Object.entries(params).forEach(([key,val])=>{if(val)search.set(key,val);});
  const r=await fetch(`/api/media/upload?${search.toString()}`,{
    method:'POST',body:file,credentials:'same-origin',
    headers:{'X-CSRF-Token':csrf,'X-Egidius-Filename':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},
  });
  if(!r.ok)throw new Error(`${file.name}: ${await apiError(r)}`);
  return await r.json() as MediaItem;
}
export async function removeMedia(id:string,csrf:string){
  const r=await fetch(`/api/media/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'X-CSRF-Token':csrf},credentials:'same-origin'});
  if(!r.ok)throw new Error(await apiError(r));
}
export async function captionMedia(id:string,caption:string,csrf:string){
  const r=await fetch(`/api/media/${encodeURIComponent(id)}`,{
    method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},credentials:'same-origin',body:JSON.stringify({caption})
  });
  if(!r.ok)throw new Error(await apiError(r));
}
export const mediaUrl=(id:string)=>`/api/media/${encodeURIComponent(id)}/content`;
export const mediaSize=(size:number)=>`${(size/(1024*1024)).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB`;
export const mediaIsImage=(item:MediaItem)=>item.kind==='photo'||item.kind==='caricature';
