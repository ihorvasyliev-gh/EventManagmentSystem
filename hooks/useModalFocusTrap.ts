import { useEffect, useRef, RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Traps focus inside the modal and closes on Escape.
 * Call with the ref of the modal content container (the inner panel, not the overlay).
 */
export function useModalFocusTrap(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>
): void {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const focusables = getFocusableElements(container);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (first) {
      (first as HTMLElement).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;

      const active = document.activeElement as HTMLElement;
      if (!container.contains(active)) return;

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus?.();
    };
  }, [isOpen, onClose, containerRef]);
}
