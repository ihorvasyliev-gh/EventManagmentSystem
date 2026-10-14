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

interface CachedEvents {
  events: Event[];
  timestamp: number;
}

/** Events as JSON for Web Storage (dates as ISO strings) */
function serialize(events: Event[]): string {
  const raw = events.map((e) => ({
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
  return JSON.stringify(raw);
}

/** Events back from JSON, with their dates */
function deserialize(json: string): Event[] {
  const raw = JSON.parse(json) as any[];
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

export function cacheEvents(events: Event[]): void {
  try {
    const cached: CachedEvents = { events, timestamp: Date.now() };
    const storage = cacheStorage();
    storage?.setItem(EVENTS_CACHE_KEY, serialize(events));
    storage?.setItem(EVENTS_CACHE_TIMESTAMP_KEY, cached.timestamp.toString());
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

/** The cached events, while they are recent enough (CACHE_DURATION_MS) */
export function getCachedEvents(): Event[] | null {
  try {
    dropPersistentCopy();
    const storage = cacheStorage();
    const json = storage?.getItem(EVENTS_CACHE_KEY);
    if (!json) return null;

    const ts = storage?.getItem(EVENTS_CACHE_TIMESTAMP_KEY);
    const age = ts ? Date.now() - parseInt(ts, 10) : Infinity;
    if (age > CACHE_DURATION_MS) return null;

    return deserialize(json);
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

/** Serialize Map<string, Date[]> to JSON */
function serializeExceptions(map: Map<string, Date[]>): string {
  const obj: Record<string, string[]> = {};
  for (const [key, dates] of map.entries()) {
    obj[key] = dates.map(d => d.toISOString());
  }
  return JSON.stringify(obj);
}

/** Deserialize JSON to Map<string, Date[]> */
function deserializeExceptions(json: string): Map<string, Date[]> {
  const obj = JSON.parse(json) as Record<string, string[]>;
  const map = new Map<string, Date[]>();
  for (const [key, dateStrings] of Object.entries(obj)) {
    map.set(key, dateStrings.map(d => new Date(d)));
  }
  return map;
}

export function cacheExceptions(exceptions: Map<string, Date[]>): void {
  try {
    cacheStorage()?.setItem(EXCEPTIONS_CACHE_KEY, serializeExceptions(exceptions));
    dropPersistentCopy();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('Failed to cache exceptions:', err);
  }
}

export function getCachedExceptions(): Map<string, Date[]> | null {
  try {
    const json = cacheStorage()?.getItem(EXCEPTIONS_CACHE_KEY);
    if (!json) return null;
    return deserializeExceptions(json);
  } catch {
    return null;
  }
}
