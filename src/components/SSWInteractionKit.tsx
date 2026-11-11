import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';

/** Ações com rótulos visíveis e informação contextual, sem exigir que o confrade reconheça só ícones. */
export function SSWUndoRedo({
  desfazer, refazer, descricaoDesfazer, descricaoRefazer,
}: {
  desfazer: () => void;
  refazer: () => void;
  descricaoDesfazer: string | null;
  descricaoRefazer: string | null;
}) {
  return <div className="ssw09-undo-redo" role="group" aria-label="Corrigir alterações recentes">
    <button type="button" onClick={desfazer} disabled={!descricaoDesfazer} title={descricaoDesfazer ? `Desfazer: ${descricaoDesfazer}` : 'Nada para desfazer nesta aba'}>
      <RotateCcw size={19} aria-hidden="true"/><span>Desfazer</span>
    </button>
    <button type="button" onClick={refazer} disabled={!descricaoRefazer} title={descricaoRefazer ? `Refazer: ${descricaoRefazer}` : 'Nada para refazer nesta aba'}>
      <RotateCw size={19} aria-hidden="true"/><span>Refazer</span>
    </button>
  </div>;
}

/** Confirmação acessível. A exclusão real só ocorre após a confirmação. */
export function SSWConfirmDialog({
  titulo, descricao, acao, confirmar, cancelar, destrutiva = false,
}: {
  titulo: string;
  descricao: ReactNode;
  acao: string;
  confirmar: () => void;
  cancelar: () => void;
  destrutiva?: boolean;
}) {
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    botaoCancelar.current?.focus();
    function tecla(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); cancelar(); return; }
      if (event.key !== 'Tab') return;
      const first = botaoFechar.current;
      const last = botaoConfirmar.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
    }
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = previousOverflow;
      anterior?.focus();
    };
  }, [cancelar]);

  return <div className="ssw09-dialog-backdrop" role="presentation">
    <section className="ssw09-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ssw09-confirm-title" aria-describedby="ssw09-confirm-description">
      <div className="ssw09-dialog-head"><h2 id="ssw09-confirm-title">{titulo}</h2>
        <button type="button" ref={botaoFechar} className="ssw09-dialog-close" aria-label="Cancelar e fechar" onClick={cancelar}><X size={22}/></button>
      </div>
      <div className="ssw09-dialog-description" id="ssw09-confirm-description">{descricao}</div>
      <div className="ssw09-dialog-buttons">
        <button type="button" ref={botaoCancelar} className="ssw09-cancel" onClick={cancelar}>Cancelar</button>
        <button type="button" ref={botaoConfirmar} className={destrutiva ? 'ssw09-danger' : 'ssw09-primary'} onClick={confirmar}>
          {destrutiva && <Trash2 size={19} aria-hidden="true"/>}{acao}
        </button>
      </div>
    </section>
  </div>;
}

/** Atalho global que não encobre a navegação inferior mobile. */
export function SSWToTop() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    function atualizar() { setVisivel(window.scrollY > 420); }
    atualizar();
    window.addEventListener('scroll', atualizar, { passive: true });
    return () => window.removeEventListener('scroll', atualizar);
  }, []);
  if (!visivel) return null;
  return <button type="button" className="ssw09-to-top" onClick={() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }} aria-label="Voltar ao início da página"><ArrowUp size={20} aria-hidden="true"/><span>Topo</span></button>;
}
