import type React from 'react';
import { useRef, useState } from 'react';

const MIN_SWIPE_DISTANCE = 60;

/**
 * Horizontal swipes on an element (vertical scrolling is left alone): a swipe to the left
 * calls `onSwipeLeft`, to the right `onSwipeRight`. `hint` is the direction for a brief nudge
 * animation. Areas with their own swipe handling opt out with a `data-own-swipe` attribute.
 */
export const useHorizontalSwipe = (onSwipeLeft: () => void, onSwipeRight: () => void) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const [hint, setHint] = useState<'left' | 'right' | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-own-swipe]')) {
      touchStartRef.current = null;
      return;
    }
    touchEndRef.current = null;
    touchStartRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchEndRef.current;
    touchStartRef.current = null;
    if (!start || !end) return;
    const distance = start.x - end.x;
    const verticalDistance = Math.abs(start.y - end.y);
    if (Math.abs(distance) < verticalDistance * 1.5) return;

    if (distance > MIN_SWIPE_DISTANCE) {
      setHint('left');
      onSwipeLeft();
      setTimeout(() => setHint(null), 180);
    }
    if (distance < -MIN_SWIPE_DISTANCE) {
      setHint('right');
      onSwipeRight();
      setTimeout(() => setHint(null), 180);
    }
  };

  return { hint, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
};
