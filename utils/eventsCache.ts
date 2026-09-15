import { Event } from '../types';

const EVENTS_CACHE_KEY = 'ccp_events_cache';
const EVENTS_CACHE_TIMESTAMP_KEY = 'ccp_events_cache_timestamp';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 минут — «свежий» кеш для мгновенного отображения

interface CachedEvents {
  events: Event[];
  timestamp: number;
}

/** Сериализуем события для localStorage (Date → ISO string) */
function serialize(events: Event[]): string {
  const raw = events.map((e) => ({
    ...e,
    date: e.date.toISOString(),
    createdAt: e.createdAt.toISOString(),
    attachments: e.attachments?.map((a) => ({ ...a, uploadedAt: (a.uploadedAt as Date).toISOString() })),
    comments: e.comments?.map((c) => ({
      ...c,
      createdAt: (c.createdAt as Date).toISOString(),
      occurrenceDate: (c.occurrenceDate as Date).toISOString()
    })),
    history: e.history?.map((h) => ({ ...h, timestamp: (h.timestamp as Date).toISOString() })),
    recurrence: e.recurrence
      ? {
        ...e.recurrence,
        endDate: e.recurrence.endDate ? (e.recurrence.endDate as Date).toISOString() : undefined
      }
      : undefined
  }));
  return JSON.stringify(raw);
}

/** Восстанавливаем Date из ISO строк */
function deserialize(json: string): Event[] {
  const raw = JSON.parse(json) as any[];
  return raw.map((e) => ({
    ...e,
    date: new Date(e.date),
    createdAt: new Date(e.createdAt),
    attachments: e.attachments?.map((a: any) => ({ ...a, uploadedAt: new Date(a.uploadedAt) })),
    comments: e.comments?.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      occurrenceDate: c.occurrenceDate ? new Date(c.occurrenceDate) : new Date(c.createdAt)
    })),
    history: e.history?.map((h: any) => ({ ...h, timestamp: new Date(h.timestamp) })),
    recurrence: e.recurrence
      ? {
        ...e.recurrence,
        endDate: e.recurrence.endDate ? new Date(e.recurrence.endDate) : undefined
      }
      : undefined
  }));
}

export function cacheEvents(events: Event[]): void {
  try {
    const cached: CachedEvents = { events, timestamp: Date.now() };
    localStorage.setItem(EVENTS_CACHE_KEY, serialize(events));
    localStorage.setItem(EVENTS_CACHE_TIMESTAMP_KEY, cached.timestamp.toString());
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to cache events:', err);
  }
}

/** Возвращает кеш только если он ещё «свежий» (в пределах TTL). */
export function getCachedEvents(): Event[] | null {
  try {
    const json = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!json) return null;

    const ts = localStorage.getItem(EVENTS_CACHE_TIMESTAMP_KEY);
    const age = ts ? Date.now() - parseInt(ts, 10) : Infinity;
    if (age > CACHE_DURATION_MS) return null;

    return deserialize(json);
  } catch {
    clearEventsCache();
    return null;
  }
}

/** Возвращает кеш даже если он устарел (stale-while-revalidate: сразу показываем, потом обновляем). */
export function getCachedEventsStale(): Event[] | null {
  try {
    const json = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!json) return null;
    return deserialize(json);
  } catch {
    return null;
  }
}

export function clearEventsCache(): void {
  try {
    localStorage.removeItem(EVENTS_CACHE_KEY);
    localStorage.removeItem(EVENTS_CACHE_TIMESTAMP_KEY);
    localStorage.removeItem(EXCEPTIONS_CACHE_KEY);
    localStorage.removeItem(CREATOR_NAMES_CACHE_KEY);
    localStorage.removeItem(CREATOR_NAMES_CACHE_TIMESTAMP_KEY);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to clear events cache:', err);
  }
}

// --- Exceptions Cache ---

const EXCEPTIONS_CACHE_KEY = 'ccp_exceptions_cache';

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
    localStorage.setItem(EXCEPTIONS_CACHE_KEY, serializeExceptions(exceptions));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to cache exceptions:', err);
  }
}

export function getCachedExceptions(): Map<string, Date[]> | null {
  try {
    const json = localStorage.getItem(EXCEPTIONS_CACHE_KEY);
    if (!json) return null;
    return deserializeExceptions(json);
  } catch {
    return null;
  }
}
// --- RSVPs Cache ---

const RSVPS_CACHE_KEY = 'ccp_rsvps_cache';

export function cacheRsvps(eventIds: string[]): void {
  try {
    localStorage.setItem(RSVPS_CACHE_KEY, JSON.stringify(eventIds));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to cache RSVPs:', err);
  }
}

export function getCachedRsvps(): string[] | null {
  try {
    const json = localStorage.getItem(RSVPS_CACHE_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function clearRsvpsCache(): void {
  try {
    localStorage.removeItem(RSVPS_CACHE_KEY);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to clear RSVPs cache:', err);
  }
}

// --- Creator names cache ---

const CREATOR_NAMES_CACHE_KEY = 'ccp_creator_names_cache';
const CREATOR_NAMES_CACHE_TIMESTAMP_KEY = 'ccp_creator_names_cache_timestamp';
const CREATOR_NAMES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export function cacheCreatorNames(names: Record<string, string>): void {
  try {
    localStorage.setItem(CREATOR_NAMES_CACHE_KEY, JSON.stringify(names));
    localStorage.setItem(CREATOR_NAMES_CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to cache creator names:', err);
  }
}

export function getCachedCreatorNames(): Record<string, string> | null {
  try {
    const json = localStorage.getItem(CREATOR_NAMES_CACHE_KEY);
    if (!json) return null;
    const ts = localStorage.getItem(CREATOR_NAMES_CACHE_TIMESTAMP_KEY);
    const age = ts ? Date.now() - parseInt(ts, 10) : Infinity;
    if (age > CREATOR_NAMES_CACHE_TTL_MS) return null;
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Stale cache for creator names (show immediately, revalidate in background) */
export function getCachedCreatorNamesStale(): Record<string, string> | null {
  try {
    const json = localStorage.getItem(CREATOR_NAMES_CACHE_KEY);
    if (!json) return null;
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}
