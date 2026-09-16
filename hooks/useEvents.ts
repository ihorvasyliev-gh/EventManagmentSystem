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

const toTime = (d: any): number => {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  if (d instanceof Date) return isNaN(d.getTime()) ? 0 : d.getTime();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const areEventsEqual = (a: Event[], b: Event[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bMap = new Map<string, Event>();
  for (const eb of b) {
    bMap.set(eb.id, eb);
  }
  for (const ea of a) {
    const eb = bMap.get(ea.id);
    if (!eb) return false;
    if (
      ea.status !== eb.status ||
      ea.title !== eb.title ||
      toTime(ea.date) !== toTime(eb.date) ||
      toTime(ea.endDate) !== toTime(eb.endDate) ||
      ea.location !== eb.location ||
      ea.category !== eb.category ||
      ea.description !== eb.description ||
      ea.posterUrl !== eb.posterUrl ||
      ea.submitterName !== eb.submitterName ||
      ea.submitterEmail !== eb.submitterEmail ||
      toTime(ea.updatedAt) !== toTime(eb.updatedAt) ||
      (ea.tags?.join(',') || '') !== (eb.tags?.join(',') || '') ||
      (ea.attendees?.length || 0) !== (eb.attendees?.length || 0)
    ) {
      return false;
    }
  }
  return true;
};

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
        if (isManual || !areEventsEqual(prev, data)) {
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

  // Periodic sync (every 30 seconds when visible)
  useEffect(() => {
    if (!user) return;
    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshEvents(false);
      }
    }, 30 * 1000);
    return () => clearInterval(syncInterval);
  }, [user, refreshEvents]);

  // Realtime (optional: set VITE_SUPABASE_REALTIME=false to disable and avoid WebSocket errors in strict networks)
  useEffect(() => {
    if (!user) return;
    if (import.meta.env.VITE_SUPABASE_REALTIME === 'false') return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('events-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
          refreshEvents(true);
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
      const uniqueCreatorIds = Array.from(
        new Set(
          events
            .map(e => e.creatorId)
            .filter((id): id is string => Boolean(id && typeof id === 'string' && id.trim() !== ''))
        )
      );
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
      if (e.creatorId && typeof e.creatorId === 'string' && !creatorMap.has(e.creatorId)) {
        const fallbackName = `Creator ${e.creatorId.substring(0, 8)}...`;
        creatorMap.set(e.creatorId, creatorNames[e.creatorId] || fallbackName);
      }
    });
    return Array.from(creatorMap.entries()).map(([id, name]) => ({ id, name }));
  }, [events, creatorNames]);

  const availableSubmitterEmails = useMemo(() => {
    const emails = new Set<string>();
    events.forEach(e => {
      if (e.submitterEmail && typeof e.submitterEmail === 'string' && e.submitterEmail.trim()) {
        emails.add(e.submitterEmail.trim());
      }
      e.tags?.forEach(tag => {
        if (tag.toLowerCase().startsWith('email:')) {
          const email = tag.slice(6).trim();
          if (email) emails.add(email);
        }
      });
    });
    return Array.from(emails).sort((a, b) => a.localeCompare(b));
  }, [events]);

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
    availableSubmitterEmails,
  };
}
