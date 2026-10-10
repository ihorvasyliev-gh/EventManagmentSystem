import React, { useState, useEffect, useCallback } from 'react';
import { Event } from '../types';
import { supabase } from '../lib/supabase';
import { getEvents, getAllRecurrenceExceptions } from '../services/eventService';
import { getCachedEvents, cacheEvents, getCachedExceptions, cacheExceptions, touchEventsCache } from '../utils/eventsCache';
import { areEventsEqual, areExceptionsEqual } from '../utils/eventsEqual';
import { applyEventChanges, touchesSeries, EventChange } from '../utils/realtimeEvents';

export const REALTIME_ENABLED = import.meta.env.VITE_SUPABASE_REALTIME !== 'false';

interface Options {
  userId: string | null;
  onError: (message: string) => void;
  /** Called for each new draft that arrives live (admins get a toast) */
  onNewDraft?: (title: string) => void;
}

/**
 * The calendar's events and deleted dates: shown from the local cache at once, loaded in full,
 * kept live with Supabase Realtime (changes are applied one by one, not by reloading), and
 * checked again when the tab comes back into view.
 */
export function useEventsSync({ userId, onError, onNewDraft }: Options) {
  const [events, setEvents] = useState<Event[]>([]);
  const [recurrenceExceptions, setRecurrenceExceptions] = useState<Map<string, Date[]>>(new Map());
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Latest values for the refresh logic, which compares before it sets state
  const eventsRef = React.useRef(events);
  eventsRef.current = events;
  const exceptionsRef = React.useRef(recurrenceExceptions);
  exceptionsRef.current = recurrenceExceptions;
  // The array restored from the local cache: written back unchanged, it would look freshly fetched
  const restoredFromCacheRef = React.useRef<Event[] | null>(null);
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onNewDraftRef = React.useRef(onNewDraft);
  onNewDraftRef.current = onNewDraft;

  const setExceptionsIfChanged = useCallback((next: Map<string, Date[]>) => {
    if (!areExceptionsEqual(exceptionsRef.current, next)) {
      setRecurrenceExceptions(next);
      cacheExceptions(next);
    }
  }, []);

  // Fetches events and deleted occurrences together. When nothing changed the current state is
  // kept, so a background sync doesn't re-render the whole calendar.
  const fetchEventsNow = useCallback(async (isManual: boolean) => {
    setIsRefreshing(true);
    try {
      const [data, exceptionsMap] = await Promise.all([
        getEvents(),
        getAllRecurrenceExceptions().catch((err) => {
          console.error('Error loading recurrence exceptions:', err);
          return null;
        })
      ]);
      if (areEventsEqual(eventsRef.current, data)) {
        touchEventsCache();
      } else {
        setEvents(data);
      }
      if (exceptionsMap) setExceptionsIfChanged(exceptionsMap);
    } catch (error) {
      console.error('Error loading events:', error);
      if (isManual) {
        onErrorRef.current('Failed to refresh events');
      } else {
        const cached = getCachedEvents();
        if (!cached || cached.length === 0) onErrorRef.current('Failed to load events');
      }
    } finally {
      setLoadingEvents(false);
      setIsRefreshing(false);
    }
  }, [setExceptionsIfChanged]);

  // One fetch at a time. A refresh asked for meanwhile runs once more afterwards: the running
  // fetch may have started before the change it is meant to pick up.
  const refreshStateRef = React.useRef<{ running: Promise<void> | null; again: boolean; manualAgain: boolean }>({
    running: null, again: false, manualAgain: false
  });
  const refreshEvents = useCallback((isManual = false): Promise<void> => {
    if (!userId) return Promise.resolve();
    const st = refreshStateRef.current;
    if (st.running) {
      st.again = true;
      st.manualAgain = st.manualAgain || isManual;
      return st.running;
    }
    const run = async (manual: boolean): Promise<void> => {
      await fetchEventsNow(manual);
      if (st.again) {
        const nextManual = st.manualAgain;
        st.again = false;
        st.manualAgain = false;
        await run(nextManual);
      }
    };
    st.running = run(isManual).finally(() => {
      st.running = null;
    });
    return st.running;
  }, [userId, fetchEventsNow]);

  /** After this user's own change: realtime brings it to other screens; without it, reload */
  const syncAfterChange = useCallback(() => {
    if (!REALTIME_ENABLED) void refreshEvents(true);
  }, [refreshEvents]);

  // Initial load (by id: the profile is re-read after a cached sign-in, which must not refetch)
  useEffect(() => {
    if (!userId) {
      setEvents([]);
      setRecurrenceExceptions(new Map());
      return;
    }
    const cached = getCachedEvents();
    if (cached && cached.length > 0) {
      // Show the last known calendar at once; the fetch below brings it up to date
      restoredFromCacheRef.current = cached;
      setEvents(cached);
      setLoadingEvents(false);
      const cachedExceptions = getCachedExceptions();
      if (cachedExceptions) setRecurrenceExceptions(cachedExceptions);
    } else {
      setLoadingEvents(true);
    }
    void refreshEvents(false);
  }, [userId, refreshEvents]);

  // Keep the local cache in step with every change (not the copy just restored from it)
  useEffect(() => {
    if (userId && events !== restoredFromCacheRef.current) cacheEvents(events);
  }, [userId, events]);

  // Live changes from other people (and echoes of our own)
  useEffect(() => {
    if (!userId || !REALTIME_ENABLED) return;

    let queue: EventChange[] = [];
    // A burst of changes (e.g. "Approve all") is applied in one go
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      const changes = queue;
      queue = [];
      // A change that can't be applied from its message (e.g. a partial row): reload instead
      if (!applyEventChanges([], changes)) {
        void refreshEvents(false);
        return;
      }
      setEvents((prev) => applyEventChanges(prev, changes) ?? prev);
      if (touchesSeries(changes)) {
        getAllRecurrenceExceptions().then(setExceptionsIfChanged).catch(() => undefined);
      }
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('events-realtime-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => {
          if (import.meta.env.DEV) console.log('[Realtime] Events table change:', payload.eventType, payload);
          const row = payload.new as { status?: string; title?: string } | undefined;
          if (payload.eventType === 'INSERT' && row?.status === 'draft') {
            onNewDraftRef.current?.(row.title || 'Untitled Event');
          }
          queue.push(payload as unknown as EventChange);
          clearTimeout(debounce);
          debounce = setTimeout(flush, 300);
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && import.meta.env.DEV) {
            console.warn('[Realtime] Subscription error; set VITE_SUPABASE_REALTIME=false to poll instead.');
          }
        });
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Realtime] Could not subscribe to channel:', err);
    }

    return () => {
      clearTimeout(debounce);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, refreshEvents, setExceptionsIfChanged]);

  // Fallback sync on tab focus / visibility; a 30s poll only when realtime is switched off
  useEffect(() => {
    if (!userId) return;
    let lastSync = 0;
    const handleSyncOnVisible = () => {
      // "focus" and "visibilitychange" both fire on returning to the tab: one sync is enough
      if (Date.now() - lastSync < 10_000) return;
      if (document.visibilityState === 'visible') {
        lastSync = Date.now();
        void refreshEvents(false);
      }
    };
    window.addEventListener('focus', handleSyncOnVisible);
    document.addEventListener('visibilitychange', handleSyncOnVisible);
    const poll = REALTIME_ENABLED ? undefined : setInterval(handleSyncOnVisible, 30 * 1000);
    return () => {
      window.removeEventListener('focus', handleSyncOnVisible);
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
      clearInterval(poll);
    };
  }, [userId, refreshEvents]);

  return {
    events,
    setEvents,
    recurrenceExceptions,
    setRecurrenceExceptions,
    loadingEvents,
    isRefreshing,
    refreshEvents,
    syncAfterChange
  };
}
