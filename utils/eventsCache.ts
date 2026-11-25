import type { Event } from '../types.ts';
import { getActiveAuthStorage, isRememberMeEnabled, safeGetStorage } from './authStorage.ts';

const EVENTS_CACHE_KEY = 'ccp_events_cache';
const EVENTS_CACHE_TIMESTAMP_KEY = 'ccp_events_cache_timestamp';
const EXCEPTIONS_CACHE_KEY = 'ccp_exceptions_cache';
const CACHE_KEYS = [EVENTS_CACHE_KEY, EVENTS_CACHE_TIMESTAMP_KEY, EXCEPTIONS_CACHE_KEY];

/**
 * The calendar (drafts and submitters' emails included) is kept where the session is: on the
 * device with "Remember me", otherwise only for this tab. Before, it stayed in localStorage for
 * a week even after a one-time sign-in on a shared computer.
 */
const cacheStorage = (): Storage | null => getActiveAuthStorage();

/** Without "Remember me", removes any copy left in localStorage (e.g. by an older version) */
const dropPersistentCopy = (): void => {
  if (isRememberMeEnabled()) return;
  const ls = safeGetStorage('local');
  CACHE_KEYS.forEach((key) => ls?.removeItem(key));
};
// The cache is shown straight away and refreshed in the background (stale-while-revalidate), so it
// only has to be recent enough to be a fair first picture. 30 minutes meant a skeleton on most visits.
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedEventsEnvelope {
  userId: string | null;
  events: unknown[];
}

interface CachedExceptionsEnvelope {
  userId: string | null;
  exceptions: Record<string, string[]>;
}

/** Events as plain objects with ISO date strings */
function serializeRaw(events: Event[]): unknown[] {
  return events.map((e) => ({
    ...e,
    date: e.date instanceof Date ? e.date.toISOString() : new Date(e.date).toISOString(),
    endDate: e.endDate
      ? (e.endDate instanceof Date ? e.endDate.toISOString() : new Date(e.endDate).toISOString())
      : undefined,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : new Date(e.createdAt).toISOString(),
    updatedAt: e.updatedAt
      ? (e.updatedAt instanceof Date ? e.updatedAt.toISOString() : new Date(e.updatedAt).toISOString())
      : undefined,
    attachments: e.attachments?.map((a) => ({
      ...a,
      uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : new Date(a.uploadedAt).toISOString()
    })),
    history: e.history?.map((h) => ({
      ...h,
      timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : new Date(h.timestamp).toISOString()
    })),
    recurrence: e.recurrence
      ? {
        ...e.recurrence,
        endDate: e.recurrence.endDate
          ? (e.recurrence.endDate instanceof Date ? e.recurrence.endDate.toISOString() : new Date(e.recurrence.endDate).toISOString())
          : undefined
      }
      : undefined
  }));
}

/** Events back from plain JSON objects, with their dates */
function deserializeList(raw: any[]): Event[] {
  return raw.map((e) => ({
    ...e,
    date: new Date(e.date),
    endDate: e.endDate ? new Date(e.endDate) : undefined,
    createdAt: new Date(e.createdAt),
    updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined,
    attachments: e.attachments?.map((a: any) => ({ ...a, uploadedAt: new Date(a.uploadedAt) })),
    history: e.history?.map((h: any) => ({ ...h, timestamp: new Date(h.timestamp) })),
    recurrence: e.recurrence
      ? {
        ...e.recurrence,
        endDate: e.recurrence.endDate ? new Date(e.recurrence.endDate) : undefined,
        customDates: Array.isArray(e.recurrence.customDates)
          ? e.recurrence.customDates.map((d: string) => new Date(d))
          : undefined,
        customEndDates: Array.isArray(e.recurrence.customEndDates)
          ? e.recurrence.customEndDates.map((d: string) => new Date(d))
          : undefined
      }
      : undefined
  }));
}

export function cacheEvents(events: Event[], userId?: string | null): void {
  try {
    const envelope: CachedEventsEnvelope = { userId: userId ?? null, events: serializeRaw(events) };
    const storage = cacheStorage();
    storage?.setItem(EVENTS_CACHE_KEY, JSON.stringify(envelope));
    storage?.setItem(EVENTS_CACHE_TIMESTAMP_KEY, Date.now().toString());
    dropPersistentCopy();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('Failed to cache events:', err);
  }
}

/** Marks the cached events as just confirmed by the server (nothing had changed) */
export function touchEventsCache(): void {
  try {
    const storage = cacheStorage();
    if (storage?.getItem(EVENTS_CACHE_KEY)) storage.setItem(EVENTS_CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // Storage unavailable: the cache just isn't kept
  }
}

/** When the cached events were last confirmed by the server, if there are any */
export function getEventsCacheTime(): Date | null {
  try {
    const ts = cacheStorage()?.getItem(EVENTS_CACHE_TIMESTAMP_KEY);
    const ms = ts ? parseInt(ts, 10) : NaN;
    return Number.isFinite(ms) ? new Date(ms) : null;
  } catch {
    return null;
  }
}

/** The cached events for `userId`, while they are recent enough (CACHE_DURATION_MS) */
export function getCachedEvents(userId?: string | null): Event[] | null {
  try {
    dropPersistentCopy();
    const storage = cacheStorage();
    const json = storage?.getItem(EVENTS_CACHE_KEY);
    if (!json) return null;

    const ts = storage?.getItem(EVENTS_CACHE_TIMESTAMP_KEY);
    const age = ts ? Date.now() - parseInt(ts, 10) : Infinity;
    if (age > CACHE_DURATION_MS) return null;

    const parsed: unknown = JSON.parse(json);
    // Legacy unscoped array format (from an older build) or corrupt shape: discard safely
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as CachedEventsEnvelope).events)) {
      clearEventsCache();
      return null;
    }

    const envelope = parsed as CachedEventsEnvelope;
    const expectedUser = userId ?? null;
    const cachedUser = envelope.userId ?? null;
    if (cachedUser !== expectedUser) {
      return null;
    }

    return deserializeList(envelope.events);
  } catch {
    clearEventsCache();
    return null;
  }
}

export function clearEventsCache(): void {
  try {
    for (const storage of [safeGetStorage('local'), safeGetStorage('session')]) {
      CACHE_KEYS.forEach((key) => storage?.removeItem(key));
    }
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('Failed to clear events cache:', err);
  }
}

// --- Exceptions Cache ---

/** Serialize Map<string, Date[]> to a plain Record<string, string[]> */
function serializeExceptionsRaw(map: Map<string, Date[]>): Record<string, string[]> {
  const obj: Record<string, string[]> = {};
  for (const [key, dates] of map.entries()) {
    obj[key] = dates.map(d => d.toISOString());
  }
  return obj;
}

/** Deserialize Record<string, string[]> to Map<string, Date[]> */
function deserializeExceptionsRecord(obj: Record<string, string[]>): Map<string, Date[]> {
  const map = new Map<string, Date[]>();
  for (const [key, dateStrings] of Object.entries(obj)) {
    if (Array.isArray(dateStrings)) {
      map.set(key, dateStrings.map(d => new Date(d)));
    }
  }
  return map;
}

export function cacheExceptions(exceptions: Map<string, Date[]>, userId?: string | null): void {
  try {
    const envelope: CachedExceptionsEnvelope = {
      userId: userId ?? null,
      exceptions: serializeExceptionsRaw(exceptions)
    };
    cacheStorage()?.setItem(EXCEPTIONS_CACHE_KEY, JSON.stringify(envelope));
    dropPersistentCopy();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('Failed to cache exceptions:', err);
  }
}

export function getCachedExceptions(userId?: string | null): Map<string, Date[]> | null {
  try {
    const json = cacheStorage()?.getItem(EXCEPTIONS_CACHE_KEY);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !('exceptions' in parsed) ||
      typeof (parsed as CachedExceptionsEnvelope).exceptions !== 'object' ||
      (parsed as CachedExceptionsEnvelope).exceptions === null
    ) {
      return null;
    }
    const envelope = parsed as CachedExceptionsEnvelope;
    if ((envelope.userId ?? null) !== (userId ?? null)) {
      return null;
    }
    return deserializeExceptionsRecord(envelope.exceptions);
  } catch {
    return null;
  }
}
