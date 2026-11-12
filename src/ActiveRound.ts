import type { Rodada } from './SSWStore';
const KEY = 'egidius.sabado-ativo.v1';
export function lerSabadoAtivo(): string {
  try { return window.localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function guardarSabadoAtivo(id: string) {
  try { window.localStorage.setItem(KEY, id); } catch { /* A seleção segue válida na sessão. */ }
}
export function escolherSabadoAtivo(rodadas: Rodada[], id: string): string {
  return rodadas.some(r => r.id === id) ? id : [...rodadas].sort((a,b) => b.data.localeCompare(a.data))[0]?.id ?? '';
}
