import { useCallback, useRef, useState } from 'react';
import { type Event } from '../types';

/** Which event the event window shows (its details; editing happens in the event form) */
export const useEventModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);

  // Clears the event after the close animation — unless the window was reopened meanwhile
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;
  const resetLater = useCallback(() => {
    setTimeout(() => {
      if (!isOpenRef.current) setEvent(null);
    }, 200);
  }, []);

  const open = useCallback((ev: Event) => {
    setEvent(ev);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetLater();
  }, [resetLater]);

  return { isOpen, event, open, close };
};

export type EventModalControls = ReturnType<typeof useEventModal>;
