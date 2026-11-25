/**
 * Ref-counted body scroll lock for stacked dialogs and drawers.
 * Captures the original overflow only when the first lock is acquired and
 * restores it only when the final lock is released, preventing nested overlays
 * from leaving `document.body.style.overflow = 'hidden'` stuck after closing.
 */
let scrollLocks = 0;
let previousOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
