import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayLayer } from './overlay';

interface ModalProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  closeDisabled?: boolean;
  className?: string;
}

/**
 * Modal único: portal a body (escapa del containing block del header),
 * scroll lock, foco inicial, trap de Tab, Escape y click en el backdrop.
 */
export function Modal({
  label,
  onClose,
  children,
  initialFocusRef,
  restoreFocusRef,
  closeLabel = 'Cerrar',
  closeDisabled = false,
  className = '',
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<Element | null>(document.activeElement);
  const isTop = useOverlayLayer();

  useEffect(() => {
    const opener = openerRef.current;
    const target = initialFocusRef?.current ?? closeRef.current ?? cardRef.current;
    target?.focus({ preventScroll: true });
    document.documentElement.classList.add('modal-lock');

    return () => {
      document.documentElement.classList.remove('modal-lock');
      if (opener instanceof HTMLElement || opener instanceof SVGElement) {
        opener.focus({ preventScroll: true });

        if (document.activeElement === opener) return;
      }
      restoreFocusRef?.current?.focus({ preventScroll: true });
    };
  }, [initialFocusRef, restoreFocusRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !cardRef.current) return;

      const focusables = [
        ...cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('disabled'));

      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (!cardRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTop, onClose]);

  return createPortal(
    <div className="modal">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Cerrar modal"
        onClick={onClose}
      />
      <div
        className={`modal-card${className ? ` ${className}` : ''}`}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-lenis-prevent
      >
        <button
          className="modal-close"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          disabled={closeDisabled}
          ref={closeRef}
        >
          ✕
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
