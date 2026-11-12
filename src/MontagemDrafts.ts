import { useSyncExternalStore } from 'react';
import type { EquipeRodada } from './SSWStore';
import type { RascunhoTimes } from './TeamBoardRules';
import { assinaturaEquipes } from './TeamBoardRules';

// Rascunhos são privados deste navegador; nunca entram na formação oficial sem confirmação.
let operador = 'local';
const prefixo = () => `egidius.montagem.v1:${encodeURIComponent(operador)}:`;
type Entrada = { draft: RascunhoTimes; texto: string | null; erro: string };
const memoria = new Map<string, Entrada>();
const listeners = new Set<() => void>();
let quantidade = 0;
function avisar() { quantidade = memoria.size; for (const fn of listeners) fn(); }
function valido(v: unknown): v is RascunhoTimes {
  if (!v || typeof v !== 'object') return false;
  const d = v as RascunhoTimes;
  return d.editado === true && typeof d.origem === 'string' && d.origem.length <= 64000 &&
    Array.isArray(d.equipes) && d.equipes.length >= 2 && d.equipes.length <= 16 &&
    d.equipes.every(e => typeof e.id === 'string' && e.id.length <= 140 &&
      typeof e.nome === 'string' && e.nome.length <= 40 && Array.isArray(e.atletas) &&
      e.atletas.length <= 7 && e.atletas.every(id => typeof id === 'string' && id.length <= 140));
}
function copiar(d: RascunhoTimes): RascunhoTimes {
  return { ...d, equipes: d.equipes.map(e => ({ ...e, atletas: [...e.atletas] })) };
}
export function definirOperadorMontagem(nome: string) {
  if (operador === nome) return;
  operador = nome; memoria.clear();
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefixo())) continue;
      const texto = storage.getItem(key);
      try {
        const draft: unknown = texto && texto.length <= 100000 ? JSON.parse(texto) : null;
        if (valido(draft)) memoria.set(key.slice(prefixo().length), { draft, texto, erro: '' });
      } catch { /* Um arquivo local inválido não é aplicado à formação oficial. */ }
    }
  } catch { /* A montagem em memória continua utilizável. */ }
  avisar();
}
export function lerMontagem(id: string): RascunhoTimes | null {
  const anterior = memoria.get(id);
  if (anterior) return copiar(anterior.draft);
  try {
    const texto = window.localStorage.getItem(prefixo() + id);
    const d: unknown = texto && texto.length <= 100000 ? JSON.parse(texto) : null;
    if (valido(d)) { memoria.set(id, { draft: d, texto, erro: '' }); return copiar(d); }
  } catch { /* Não substitui dados oficiais por rascunho ilegível. */ }
  return null;
}
export function guardarMontagem(id: string, draft: RascunhoTimes): string {
  if (!draft.editado || assinaturaEquipes(draft.equipes) === draft.origem) {
    return limparMontagem(id);
  }
  const anterior = memoria.get(id);
  const entrada: Entrada = { draft: copiar(draft), texto: anterior?.texto ?? null, erro: '' };
  memoria.set(id, entrada);
  try {
    const atual = window.localStorage.getItem(prefixo() + id);
    if (atual !== entrada.texto) throw new Error('Outra aba alterou este rascunho. Seus ajustes permanecem nesta aba; mantenha-a aberta e confirme os times antes de sair.');
    const texto = JSON.stringify(draft);
    window.localStorage.setItem(prefixo() + id, texto);
    entrada.texto = texto;
  } catch (e) {
    entrada.erro = e instanceof Error && e.message.startsWith('Outra aba') ? e.message :
      'Não foi possível guardar o rascunho neste navegador. Mantenha esta aba aberta e salve os times antes de sair.';
  }
  avisar(); return entrada.erro;
}
export function limparMontagem(id: string): string {
  const anterior = memoria.get(id);
  try {
    const atual = window.localStorage.getItem(prefixo() + id);
    // Não apaga uma edição posterior feita em outra aba.
    if (anterior && atual === anterior.texto) window.localStorage.removeItem(prefixo() + id);
    memoria.delete(id); avisar(); return '';
  } catch {
    if (anterior) anterior.erro = 'A limpeza do rascunho falhou. Confira a formação oficial ao reabrir.';
    avisar(); return anterior?.erro ?? '';
  }
}
export function montagemPersistidaNoServidor(draft: RascunhoTimes, salvas: EquipeRodada[]) {
  return assinaturaEquipes(draft.equipes) === assinaturaEquipes(salvas);
}
export function podeSairDaMontagem() {
  return ![...memoria.values()].some(e => e.erro) ||
    window.confirm('O rascunho não foi guardado no navegador. Sair agora pode perder a montagem. Deseja sair mesmo assim?');
}
export function primeiraMontagemPendente() { return memoria.keys().next().value as string | undefined; }
export function useMontagensPendentes() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => quantidade, () => 0);
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if ([...memoria.values()].some(e => e.erro)) { event.preventDefault(); (event as BeforeUnloadEvent).returnValue = ''; }
});
