import { useEffect, useSyncExternalStore } from 'react';
const tarefas = new Map<string,{ texto:string; bloqueada:boolean }>();
const listeners = new Set<() => void>();
let resumo = '';
function avisar() { resumo=[...tarefas.values()].map(t=>t.texto).join(' · '); listeners.forEach(fn=>fn()); }
export function registrarPendencia(id:string,texto:string,bloqueada=false) {
  tarefas.set(id,{texto,bloqueada}); avisar();
  return () => { tarefas.delete(id); avisar(); };
}
export function podeAbandonarEdicao() {
  if (!tarefas.size) return true;
  if ([...tarefas.values()].some(t=>t.bloqueada)) { window.alert('Aguarde a operação em andamento antes de sair desta tela.'); return false; }
  return window.confirm(`${resumo}. Sair desta tela e descartar essas alterações ainda não salvas? Para guardar, cancele e use Salvar.`);
}
export function useTrabalhoPendente(id:string,ativo:boolean,texto:string,bloqueada=false) {
  useEffect(()=>{if(ativo)return registrarPendencia(id,texto,bloqueada);},[id,ativo,texto,bloqueada]);
}
export function useResumoPendencias() { return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>resumo,()=> ''); }
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(tarefas.size){event.preventDefault();(event as BeforeUnloadEvent).returnValue='';}});
