import { ChevronDown, ClipboardList } from 'lucide-react';
import type { Partida } from '../SSWStore';
import { pendenciasEncerramento } from '../ExpressRules';
import './ConferenciaPartida.css';

export function ConferenciaPartida({ jogo }: { jogo: Partida }) {
  if (jogo.status !== 'rascunho') return null;
  const pendencias = pendenciasEncerramento(jogo);
  return <details className="ssw-conferencia" data-pendente={pendencias.length > 0} aria-label={`Conferência do Jogo ${jogo.numero}`}>
    <summary>
      <ClipboardList size={20} aria-hidden="true"/>
      <strong>Conferência para encerrar</strong>
      <span>{pendencias.length ? `${pendencias.length} ${pendencias.length === 1 ? 'pendência' : 'pendências'}` : 'Tudo conferido'}</span>
      <ChevronDown size={18} className="ssw-conferencia-chevron" aria-hidden="true"/>
    </summary>
    <div className="ssw-conferencia-conteudo">
      {pendencias.length ? <>
        <p>Resolva os pontos abaixo antes de encerrar a partida.</p>
        <ul>{pendencias.map(item => <li key={item.codigo}>{item.mensagem}</li>)}</ul>
      </> : <p>Escalação, goleiros, placar e autoria conferidos. Você já pode encerrar esta partida.</p>}
    </div>
  </details>;
}
