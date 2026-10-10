import { useCallback, useRef, useState } from 'react';
import { type Event } from '../types';

export type EventInput = Omit<Event, 'id' | 'createdAt'>;

/** Which event the event window shows, and how (details, or the form; a draft after a failed save) */
export const useEventModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [initialMode, setInitialMode] = useState<'view' | 'edit'>('view');
  // Saving publishes it (editing a submission from the inbox)
  const [autoApprove, setAutoApprove] = useState(false);
  // Unsaved form data to restore after a failed save
  const [draft, setDraft] = useState<EventInput | null>(null);

  // Clears the state after the close animation — unless the window was reopened meanwhile
  // (e.g. a fast save failure reopens the form with the user's draft).
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;
  const resetLater = useCallback(() => {
    setTimeout(() => {
      if (isOpenRef.current) return;
      setEvent(null);
      setInitialMode('view');
      setAutoApprove(false);
      setDraft(null);
    }, 200);
  }, []);

  const open = useCallback((ev: Event) => {
    setDraft(null);
    setEvent(ev);
    setInitialMode('view');
    setAutoApprove(false);
    setIsOpen(true);
  }, []);

  const openToEdit = useCallback((ev: Event, options: { autoApprove?: boolean; draft?: EventInput | null } = {}) => {
    setDraft(options.draft ?? null);
    setEvent(ev);
    setInitialMode('edit');
    setAutoApprove(options.autoApprove ?? false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetLater();
  }, [resetLater]);

  /** Shows the saved (or restored) version of the event if it's the one open */
  const replaceEvent = useCallback((id: string, ev: Event) => {
    setEvent((prev) => (prev?.id === id ? ev : prev));
  }, []);

  return { isOpen, event, initialMode, autoApprove, draft, open, openToEdit, close, replaceEvent };
};

export type EventModalControls = ReturnType<typeof useEventModal>;
