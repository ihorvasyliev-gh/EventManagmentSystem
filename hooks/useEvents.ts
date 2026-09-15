import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '../types';
import { Event } from '../types';
import { getEvents, getRecurrenceExceptions } from '../services/eventService';
import { getUserRsvps } from '../services/rsvpService';
import { checkTomorrowRSVPEvents } from '../services/notificationService';
import { getUsersByIds } from '../services/authService';
import { supabase } from '../lib/supabase';
import { getCachedEvents, getCachedEventsStale, cacheEvents, clearEventsCache, getCachedExceptions, cacheExceptions, getCachedRsvps, cacheRsvps, clearRsvpsCache, getCachedCreatorNamesStale, cacheCreatorNames } from '../utils/eventsCache';

function getInitialEventsFromCache(): Event[] {
  if (typeof window === 'undefined') return [];
  const cached = getCachedEventsStale();
  return cached && cached.length > 0 ? cached : [];
}

function getInitialLoadingFromCache(): boolean {
  if (typeof window === 'undefined') return true;
  const cached = getCachedEventsStale();
  return !(cached && cached.length > 0);
}

export function useEvents(user: User | null, showToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [events, setEvents] = useState<Event[]>(getInitialEventsFromCache);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(getInitialLoadingFromCache);
  const [userRsvpEventIds, setUserRsvpEventIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const r = getCachedRsvps();
    return r ? new Set(r) : new Set();
  });
  const [recurrenceExceptions, setRecurrenceExceptions] = useState<Map<string, Date[]>>(() => {
    if (typeof window === 'undefined') return new Map();
    const ex = getCachedExceptions();
    return ex ?? new Map();
  });
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    const cached = getCachedCreatorNamesStale();
    return cached && Object.keys(cached).length > 0 ? cached : {};
  });

  // Сбрасываем состояние при выходе (кеш очищается в handleLogout, чтобы не чистить его при F5 до восстановления сессии)
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setUserRsvpEventIds(new Set());
      setRecurrenceExceptions(new Map());
    }
  }, [user]);

  const refreshEvents = useCallback(async (isManual = false) => {
    if (!user) return;
    try {
      const data = await getEvents();
      setEvents((prev) => {
        const prevIds = prev.map(e => e.id).sort().join(',');
        const newIds = data.map(e => e.id).sort().join(',');
        const prevDates = prev.map(e => e.createdAt.getTime()).sort().join(',');
        const newDates = data.map(e => e.createdAt.getTime()).sort().join(',');
        if (prevIds !== newIds || prevDates !== newDates) {
          cacheEvents(data);
          return data;
        }
        return prev;
      });
      cacheEvents(data);

      const recurringEventIds = data
        .filter(e => e.recurrence && e.recurrence.type !== 'none')
        .map(e => e.id);
      if (recurringEventIds.length > 0) {
        const exceptionsMap = new Map<string, Date[]>();
        await Promise.all(
          recurringEventIds.map(async (eventId) => {
            try {
              const exceptions = await getRecurrenceExceptions(eventId);
              if (exceptions.length > 0) exceptionsMap.set(eventId, exceptions);
            } catch (err) {
              console.error(`Error loading exceptions for event ${eventId}:`, err);
            }
          })
        );
        setRecurrenceExceptions(exceptionsMap);
        cacheExceptions(exceptionsMap);
      }

      try {
        const rsvps = await getUserRsvps(user.id);
        setUserRsvpEventIds(new Set(rsvps));
        cacheRsvps(rsvps);
      } catch (err) {
        console.error('Error loading RSVPs:', err);
      }

    } catch (error) {
      console.error('Error loading events:', error);
      if (isManual) {
        showToast('Failed to refresh events', 'error');
      } else {
        const cached = getCachedEvents();
        if (!cached || cached.length === 0) showToast('Failed to load events', 'error');
      }
    } finally {
      setLoadingEvents(false);
    }
  }, [user, showToast]);

  // Initial load: показываем кеш сразу (свежий или stale), затем обновляем в фоне
  useEffect(() => {
    if (!user) return;
    checkTomorrowRSVPEvents(user.id).catch(console.error);
    const cached = getCachedEvents() ?? getCachedEventsStale();
    const cachedRsvps = getCachedRsvps();
    if (cached && cached.length > 0) {
      setEvents(cached);
      if (cachedRsvps) setUserRsvpEventIds(new Set(cachedRsvps));
      setLoadingEvents(false);
      const cachedExceptions = getCachedExceptions();
      if (cachedExceptions) setRecurrenceExceptions(cachedExceptions);
    } else {
      setLoadingEvents(true);
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => refreshEvents(false), { timeout: 2000 });
    } else {
      setTimeout(() => refreshEvents(false), 100);
    }
  }, [user, refreshEvents]);

  // Periodic sync
  useEffect(() => {
    if (!user) return;
    const syncInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const syncEvents = async () => {
        try {
          const data = await getEvents();
          setEvents((prev) => {
            const prevIds = prev.map(e => e.id).sort().join(',');
            const newIds = data.map(e => e.id).sort().join(',');
            if (prevIds !== newIds) {
              cacheEvents(data);
              return data;
            }
            return prev;
          });
          const recurringEventIds = data
            .filter(e => e.recurrence && e.recurrence.type !== 'none')
            .map(e => e.id);
          if (recurringEventIds.length > 0) {
            const exceptionsMap = new Map<string, Date[]>();
            await Promise.all(
              recurringEventIds.map(async (eventId) => {
                try {
                  const exceptions = await getRecurrenceExceptions(eventId);
                  if (exceptions.length > 0) exceptionsMap.set(eventId, exceptions);
                } catch (err) {
                  console.error(`Error loading exceptions for event ${eventId}:`, err);
                }
              })
            );
            setRecurrenceExceptions(exceptionsMap);
            cacheExceptions(exceptionsMap);
          }
        } catch (error) {
          console.error('Background sync error:', error);
        }
      };
      if ('requestIdleCallback' in window) {
        requestIdleCallback(syncEvents, { timeout: 5000 });
      } else {
        setTimeout(syncEvents, 100);
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, [user]);

  // Realtime (optional: set VITE_SUPABASE_REALTIME=false to disable and avoid WebSocket errors in strict networks)
  useEffect(() => {
    if (!user) return;
    if (import.meta.env.VITE_SUPABASE_REALTIME === 'false') return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('events-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
          refreshEvents(false);
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && import.meta.env.DEV) {
            console.warn('[Realtime] Subscription error; events will still refresh on interval.');
          }
        });
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Realtime] Could not subscribe; events will still refresh on interval.', err);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, refreshEvents]);

  // Creator names
  useEffect(() => {
    if (events.length === 0) return;
    const loadCreatorNames = async () => {
      const uniqueCreatorIds = Array.from(new Set(events.map(e => e.creatorId)));
      const unknownIds = uniqueCreatorIds.filter(id => !creatorNames[id]);
      if (unknownIds.length === 0) return;
      try {
        const users = await getUsersByIds(unknownIds);
        const newNames: Record<string, string> = {};
        users.forEach(u => { newNames[u.id] = u.fullName; });
        if (Object.keys(newNames).length > 0) {
          setCreatorNames(prev => {
            const merged = { ...prev, ...newNames };
            cacheCreatorNames(merged);
            return merged;
          });
        }
      } catch (err) {
        console.error('Failed to load creator names', err);
      }
    };
    loadCreatorNames();
  }, [events, creatorNames]);

  const availableLocations = useMemo(
    () => Array.from(new Set(events.map(e => e.location))).sort(),
    [events]
  );
  const availableCreators = useMemo(() => {
    const creatorMap = new Map<string, string>();
    events.forEach(e => {
      if (!creatorMap.has(e.creatorId)) {
        creatorMap.set(e.creatorId, creatorNames[e.creatorId] || `Creator ${e.creatorId.substring(0, 8)}...`);
      }
    });
    return Array.from(creatorMap.entries()).map(([id, name]) => ({ id, name }));
  }, [events, creatorNames]);

  return {
    events,
    setEvents,
    loadingEvents,
    refreshEvents,
    recurrenceExceptions,
    setRecurrenceExceptions,
    userRsvpEventIds,
    setUserRsvpEventIds,
    creatorNames,
    availableLocations,
    availableCreators,
  };
}
