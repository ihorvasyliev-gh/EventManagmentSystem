import { useEffect, useRef } from 'react';
import { type Event, type User, UserRole } from '../types';
import { expandRecurringEvents, isRecurringEvent } from '../utils/recurrence';
import type { ShowToast } from './useEventActions';

/** Shareable link to an event: /?event=<id>, plus &at=<occurrence time> for a repeating one */
export const eventShareLink = (event: Event): string => {
  const url = new URL(window.location.origin);
  url.searchParams.set('event', event.id);
  if (isRecurringEvent(event)) {
    url.searchParams.set('at', String(event.date.getTime()));
  }
  return url.toString();
};

interface DeepLinkOptions {
  user: User | null;
  loadingEvents: boolean;
  events: Event[];
  recurrenceExceptions: Map<string, Date[]>;
  onOpenEvent: (event: Event) => void;
  onOpenInbox: () => void;
  showToast: ShowToast;
}

/**
 * Links into the app: /?event=<id>&at=<time> opens an event; /?inbox (from the "new submission"
 * email) opens the submissions inbox. Handled once, when the events have loaded; the address is
 * then cleaned so a reload doesn't open it again.
 */
export const useDeepLinks = ({ user, loadingEvents, events, recurrenceExceptions, onOpenEvent, onOpenInbox, showToast }: DeepLinkOptions) => {
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current || !user || loadingEvents) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    const wantsInbox = params.has('inbox');
    if (!eventId && !wantsInbox) {
      handledRef.current = true;
      return;
    }
    if (eventId && events.length === 0) return;
    handledRef.current = true;

    const at = Number(params.get('at'));
    params.delete('event');
    params.delete('at');
    params.delete('inbox');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

    if (wantsInbox) {
      if (user.role === UserRole.ADMIN) onOpenInbox();
      return;
    }

    const master = events.find(e => e.id === eventId);
    let target: Event | undefined = master;
    if (master && at && isRecurringEvent(master)) {
      const day = new Date(at);
      const instances = expandRecurringEvents(
        [master],
        new Date(day.getFullYear(), day.getMonth(), day.getDate()),
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999),
        recurrenceExceptions
      );
      target = instances.find(i => i.date.getTime() === at) ?? instances[0] ?? master;
    }

    if (target) {
      onOpenEvent(target);
    } else {
      showToast('That event could not be found — it may have been removed.', 'warning');
    }
  }, [user, loadingEvents, events, recurrenceExceptions, onOpenEvent, onOpenInbox, showToast]);
};
