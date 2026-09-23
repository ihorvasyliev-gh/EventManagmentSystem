import { useEffect, useRef, RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

// Open modals, innermost last. Only the top one reacts to Escape/Tab, so stacked
// modals (e.g. Export → Digest) close one at a time.
const modalStack: symbol[] = [];

/** True while any modal using this hook is open (used by global keyboard shortcuts). */
export const isAnyModalOpen = (): boolean => modalStack.length > 0;

/**
 * Traps focus inside the modal and closes on Escape.
 * Call with the ref of the modal content container (the inner panel, not the overlay).
 */
export function useModalFocusTrap(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>
): void {
  // Keep the latest onClose without re-running the effect: callers often pass inline
  // arrows, and re-running would steal focus back to the first element on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    const id = Symbol('modal');
    modalStack.push(id);
    const previousActiveElement = document.activeElement as HTMLElement | null;

    if (!container.contains(document.activeElement)) {
      getFocusableElements(container)[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;

      if (e.key === 'Escape') {
        // Inner widgets (dropdowns, pickers) may consume Escape first
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement;

      if (!container.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = modalStack.indexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus?.();
      }
    };
  }, [isOpen, containerRef]);
}
