import type { EquipeRodada } from './SSWStore';
import { assinaturaEquipes, copiarEquipes } from './TeamBoardRules';
export type HistoricoMontagem = { anteriores: EquipeRodada[][]; posteriores: EquipeRodada[][]; grupo?: string };
const LIMITE = 20;
export function historicoMontagemVazio(): HistoricoMontagem { return { anteriores: [], posteriores: [] }; }
/** Cada alteração guarda uma cópia independente. Digitação no mesmo campo forma uma única ação. */
export function registrarMontagem(h: HistoricoMontagem, atual: EquipeRodada[], proxima: EquipeRodada[], grupo?: string): HistoricoMontagem {
  if (assinaturaEquipes(atual) === assinaturaEquipes(proxima)) return h;
  if (grupo && h.grupo === grupo && h.anteriores.length && assinaturaEquipes(h.anteriores.at(-1)!) === assinaturaEquipes(proxima)) return { anteriores:h.anteriores.slice(0,-1), posteriores:[] };
  const anteriores = grupo && h.grupo === grupo ? h.anteriores : [...h.anteriores, copiarEquipes(atual)].slice(-LIMITE);
  return { anteriores, posteriores: [], grupo };
}
export function moverHistoricoMontagem(h: HistoricoMontagem, atual: EquipeRodada[], refazer = false): { historico: HistoricoMontagem; equipes: EquipeRodada[] } | null {
  const origem = refazer ? h.posteriores : h.anteriores;
  const destino = origem.at(-1);
  if (!destino) return null;
  return { equipes: copiarEquipes(destino), historico: refazer
    ? { anteriores: [...h.anteriores, copiarEquipes(atual)].slice(-LIMITE), posteriores: h.posteriores.slice(0,-1) }
    : { anteriores: h.anteriores.slice(0,-1), posteriores: [...h.posteriores, copiarEquipes(atual)].slice(-LIMITE) } };
}
