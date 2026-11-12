import { ChevronDown, ClipboardList } from 'lucide-react';
import type { Partida } from '../SSWStore';
import { pendenciasEncerramento } from '../ExpressRules';
import './ConferenciaPartida.css';

export function mostrarConferencia(jogo: Partida): boolean {
  if (!pendenciasEncerramento(jogo).length) return false;
  window.requestAnimationFrame(() => {
    const painel = document.getElementById(`conferencia-${jogo.id}`) as HTMLDetailsElement | null;
    if (!painel) return;
    painel.open = true;
    painel.scrollIntoView({ block: 'center', behavior: 'instant' });
    painel.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  });
  return true;
}

function corrigir(jogo: Partida, codigo: string) {
  const painel = document.getElementById(`conferencia-${jogo.id}`);
  const area = painel?.closest('.match-editor, .express-board');
  const seletor = codigo.startsWith('goleiro-') || codigo === 'sem-autoria' ? `[data-conferencia="${codigo}"]` :
    codigo === 'placar' ? 'input[type="number"]' : '[data-conferencia="escalacao"]';
  const campo = area?.querySelector<HTMLElement>(seletor) ?? area?.querySelector<HTMLElement>('input,select,button');
  if (!campo) return;
  let ancestral = campo.parentElement;
  while (ancestral && ancestral !== area) { if (ancestral instanceof HTMLDetailsElement) ancestral.open = true; ancestral = ancestral.parentElement; }
  campo.scrollIntoView({ block: 'center', behavior: 'instant' });
  campo.focus({ preventScroll: true });
}

export function ConferenciaPartida({ jogo }: { jogo: Partida }) {
  if (jogo.status !== 'rascunho') return null;
  const pendencias = pendenciasEncerramento(jogo);
  return <details id={`conferencia-${jogo.id}`} open={pendencias.length > 0} className="ssw-conferencia" data-pendente={pendencias.length > 0} aria-label={`Conferência do Jogo ${jogo.numero}`}>
    <summary>
      <ClipboardList size={20} aria-hidden="true"/>
      <strong>Conferência para encerrar</strong>
      <span>{pendencias.length ? `${pendencias.length} ${pendencias.length === 1 ? 'pendência' : 'pendências'}` : 'Tudo conferido'}</span>
      <ChevronDown size={18} className="ssw-conferencia-chevron" aria-hidden="true"/>
    </summary>
    <div className="ssw-conferencia-conteudo">
      {pendencias.length ? <>
        <p>Resolva os pontos abaixo antes de encerrar a partida.</p>
        <ul>{pendencias.map(item => <li key={item.codigo}><span>{item.mensagem}</span><button type="button" onClick={() => corrigir(jogo,item.codigo)}>Corrigir agora</button></li>)}</ul>
      </> : <p>Escalação, goleiros, placar e autoria conferidos. Você já pode encerrar esta partida.</p>}
    </div>
  </details>;
}
