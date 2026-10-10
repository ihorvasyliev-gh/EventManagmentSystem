import { useEffect, useRef } from 'react';
import { isAnyModalOpen } from './useModalFocusTrap';

/** Pull down at the top of the page (phones) to refresh */
export function usePullToRefresh(enabled: boolean, onRefresh: () => void) {
  const startYRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const handleTouchStart = (e: TouchEvent) => {
      startYRef.current = window.scrollY <= 10 && !isAnyModalOpen() ? e.touches[0].clientY : null;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const startY = startYRef.current;
      startYRef.current = null;
      if (startY == null || window.scrollY > 10) return;
      if (e.changedTouches[0].clientY - startY > 70) onRefreshRef.current();
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled]);
}
