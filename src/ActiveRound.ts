import { useSyncExternalStore } from 'react';
import type { Rodada } from './SSWStore';
const KEY = 'egidius.sabado-ativo.v1';
let memoria:string|null=null;
// Outra aba pode trocar o sábado compartilhado ou limpar o armazenamento.
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === KEY || event.key === null) {
    memoria = null;
    window.dispatchEvent(new Event('egidius:sabado-ativo'));
  }
});
export function lerSabadoAtivo(): string {
  if(memoria!==null)return memoria;
  try { return window.localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function guardarSabadoAtivo(id: string) {
  memoria=id;try { window.localStorage.setItem(KEY,id); } catch { /* A seleção segue válida na sessão. */ }
  window.dispatchEvent(new Event('egidius:sabado-ativo'));
}
export function escolherSabadoAtivo(rodadas: Rodada[], id: string): string {
  return rodadas.some(r => r.id === id) ? id : [...rodadas].sort((a,b) => b.data.localeCompare(a.data))[0]?.id ?? '';
}

export function useSabadoAtivo(rodadas:Rodada[]) {
  const id=useSyncExternalStore(fn=>{window.addEventListener('egidius:sabado-ativo',fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener('egidius:sabado-ativo',fn);window.removeEventListener('storage',fn);};},lerSabadoAtivo,()=> '');
  return escolherSabadoAtivo(rodadas,id);
}
