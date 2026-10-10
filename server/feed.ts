/**
 * The live calendar feed: recurring events expanded on Europe/Dublin wall-clock time, and the
 * iCalendar text calendar apps subscribe to. Pure functions, so they can be tested.
 */
import { foldICSLine } from '../utils/icsFold.ts';

export interface FeedEvent {
    id: string;
    title: string;
    description: string | null;
    date: string;
    end_date?: string | null;
    location: string | null;
    status: string;
    category: string | null;
    recurrence_type: string | null;
    recurrence_interval: number | null;
    recurrence_end_date: string | null;
    recurrence_occurrences: number | null;
    recurrence_days_of_week: number[] | null;
    recurrence_custom_dates: string[] | null;
    recurrence_custom_end_dates?: string[] | null;
    recurrence_custom_locations?: (string | null)[] | null;
    created_at: string;
}

// ─── Recurrence expansion (server-side, standalone) ───────────────────
//
// Workers run in UTC, but events are scheduled in Irish local time. All recurrence
// arithmetic is done on Europe/Dublin wall-clock time so a weekly 10:00 event stays at
// 10:00 after the clocks change, and every instance keeps the original duration.

const FEED_TIMEZONE = 'Europe/Dublin';
const MAX_INSTANCES_PER_EVENT = 1000;

interface WallTime { y: number; m: number; d: number; h: number; mi: number; s: number }

const wallFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: FEED_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function toWall(date: Date): WallTime {
    const parts: Record<string, number> = {};
    for (const p of wallFormatter.formatToParts(date)) {
        if (p.type !== 'literal') parts[p.type] = Number(p.value);
    }
    return { y: parts.year, m: parts.month - 1, d: parts.day, h: parts.hour % 24, mi: parts.minute, s: parts.second };
}

function tzOffsetMs(date: Date): number {
    const w = toWall(date);
    return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a Europe/Dublin wall-clock time (fields may overflow, like Date.UTC) to an instant. */
function fromWall(y: number, m: number, d: number, h: number, mi: number, s: number): Date {
    const guess = Date.UTC(y, m, d, h, mi, s);
    const firstOffset = tzOffsetMs(new Date(guess));
    let t = guess - firstOffset;
    const secondOffset = tzOffsetMs(new Date(t));
    if (secondOffset !== firstOffset) t = guess - secondOffset;
    return new Date(t);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const wallDayKey = (date: Date) => { const w = toWall(date); return `${w.y}-${w.m}-${w.d}`; };

function nthOccurrence(base: WallTime, type: string, steps: number): Date {
    switch (type) {
        case 'daily':
            return fromWall(base.y, base.m, base.d + steps, base.h, base.mi, base.s);
        case 'weekly':
            return fromWall(base.y, base.m, base.d + steps * 7, base.h, base.mi, base.s);
        case 'monthly': {
            const first = new Date(Date.UTC(base.y, base.m + steps, 1));
            const y = first.getUTCFullYear();
            const m = first.getUTCMonth();
            return fromWall(y, m, Math.min(base.d, daysInMonth(y, m)), base.h, base.mi, base.s);
        }
        case 'yearly':
            return fromWall(base.y + steps, base.m, Math.min(base.d, daysInMonth(base.y + steps, base.m)), base.h, base.mi, base.s);
        default:
            return fromWall(base.y, base.m, base.d + steps, base.h, base.mi, base.s);
    }
}

export function expandRecurring(
    events: FeedEvent[],
    rangeStart: Date,
    rangeEnd: Date,
    exceptions: Map<string, Set<string>> = new Map()
): FeedEvent[] {
    const result: FeedEvent[] = [];

    for (const ev of events) {
        const baseStart = new Date(ev.date);
        if (isNaN(baseStart.getTime())) continue;
        const baseEnd = ev.end_date ? new Date(ev.end_date) : null;
        const durationMs = baseEnd && baseEnd >= baseStart ? baseEnd.getTime() - baseStart.getTime() : null;
        const type = ev.recurrence_type;

        const pushInstance = (start: Date, ownEnd?: Date | null, location: string | null = ev.location) => {
            if (start < rangeStart || start > rangeEnd) return;
            if (exceptions.get(ev.id)?.has(wallDayKey(start))) return;
            const end = ownEnd !== undefined
                ? ownEnd
                : durationMs !== null ? new Date(start.getTime() + durationMs) : null;
            result.push({
                ...ev,
                id: `${ev.id}_${start.getTime()}`,
                date: start.toISOString(),
                end_date: end ? end.toISOString() : null,
                location,
            });
        };

        if (!type || type === 'none') {
            if (baseStart >= rangeStart && baseStart <= rangeEnd) result.push(ev);
            continue;
        }

        const base = toWall(baseStart);

        // Custom dates: each picked day at the original time of day, or at its own
        // start/end when the series stores per-date times, and at its own address when
        // the series is held in different places
        if (type === 'custom') {
            const dates = ev.recurrence_custom_dates && ev.recurrence_custom_dates.length > 0
                ? ev.recurrence_custom_dates
                : [ev.date];
            const ends = ev.recurrence_custom_end_dates;
            const perDate = !!ends && ends.length === dates.length;
            const places = ev.recurrence_custom_locations;
            const perPlace = !!places && places.length === dates.length;
            dates.forEach((iso, i) => {
                const day = new Date(iso);
                if (isNaN(day.getTime())) return;
                const location = (perPlace && places![i]?.trim()) || ev.location;
                if (perDate) {
                    const end = new Date(ends![i]);
                    pushInstance(day, end.getTime() > day.getTime() ? end : null, location);
                } else {
                    const w = toWall(day);
                    pushInstance(fromWall(w.y, w.m, w.d, base.h, base.mi, base.s), undefined, location);
                }
            });
            continue;
        }

        const interval = ev.recurrence_interval && ev.recurrence_interval > 0 ? ev.recurrence_interval : 1;
        const maxOccurrences = ev.recurrence_occurrences || Infinity;
        let endLimit = rangeEnd;
        if (ev.recurrence_end_date) {
            const w = toWall(new Date(ev.recurrence_end_date));
            const inclusiveEnd = fromWall(w.y, w.m, w.d, 23, 59, 59);
            if (inclusiveEnd < endLimit) endLimit = inclusiveEnd;
        }

        // Weekly on specific days of the week
        if (type === 'weekly' && ev.recurrence_days_of_week && ev.recurrence_days_of_week.length > 0) {
            const days = [...ev.recurrence_days_of_week].sort((a, b) => a - b);
            const weekday = new Date(Date.UTC(base.y, base.m, base.d)).getUTCDay();
            let count = 0;
            for (let week = 0; week < MAX_INSTANCES_PER_EVENT && count < maxOccurrences; week++) {
                const weekStartDay = base.d - weekday + week * 7 * interval;
                let passedEnd = false;
                for (const dow of days) {
                    const start = fromWall(base.y, base.m, weekStartDay + dow, base.h, base.mi, base.s);
                    if (start < baseStart) continue;
                    if (start > endLimit) { passedEnd = true; break; }
                    if (count >= maxOccurrences) break;
                    count++;
                    pushInstance(start);
                }
                if (passedEnd) break;
            }
            continue;
        }

        for (let k = 0; k < MAX_INSTANCES_PER_EVENT && k < maxOccurrences; k++) {
            const start = nthOccurrence(base, type, k * interval);
            if (start > endLimit) break;
            pushInstance(start);
        }
    }

    return result;
}

// ─── ICS generation ───────────────────────────────────────────────────

function escapeICS(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\r?\n/g, '\\n');
}

function formatDateUTC(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildICS(events: FeedEvent[]): string {
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//CCP Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:CCP Events',
        'X-WR-TIMEZONE:Europe/Dublin',
        'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
        'X-PUBLISHED-TTL:PT6H',
    ];

    for (const ev of events) {
        const start = new Date(ev.date);
        const end = ev.end_date ? new Date(ev.end_date) : new Date(start.getTime() + 60 * 60 * 1000); // +1 hour default

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${ev.id}@ccp-events`);
        lines.push(`DTSTAMP:${formatDateUTC(new Date())}`);
        lines.push(`DTSTART:${formatDateUTC(start)}`);
        lines.push(`DTEND:${formatDateUTC(end)}`);
        lines.push(`SUMMARY:${escapeICS(ev.title)}`);
        if (ev.description) {
            lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
        }
        if (ev.location) {
            lines.push(`LOCATION:${escapeICS(ev.location)}`);
        }
        if (ev.category) {
            lines.push(`CATEGORIES:${escapeICS(ev.category)}`);
        }
        lines.push('SEQUENCE:0');
        lines.push('STATUS:CONFIRMED');
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(foldICSLine).join('\r\n') + '\r\n';
}


// ─── Feed queries ─────────────────────────────────────────────────────

/** Columns the feed reads (never the submitter's details) */
export const FEED_COLUMNS = [
    'id', 'title', 'description', 'date', 'end_date', 'location', 'status', 'category',
    'recurrence_type', 'recurrence_interval', 'recurrence_end_date', 'recurrence_occurrences',
    'recurrence_days_of_week', 'recurrence_custom_dates', 'recurrence_custom_end_dates',
    'recurrence_custom_locations', 'created_at',
].join(',');

/** How far back the subscription feed goes; older events only bloat every calendar's refresh */
export const FEED_HISTORY_DAYS = 365;
/** How far ahead recurring events are expanded */
export const FEED_FUTURE_YEARS = 2;

/**
 * PostgREST filter for the published events the feed needs: everything that starts or ends
 * after `from`, plus every repeating series (an old series can still have dates to come).
 */
export const feedFilter = (from: Date): string =>
    `status=eq.published&or=(date.gte.${from.toISOString()},end_date.gte.${from.toISOString()},recurrence_type.neq.none)`;

/** Deleted occurrences as event id → set of Dublin calendar days */
export function exceptionsFromRows(rows: Array<{ event_id: string; exception_date: string }>): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
        const set = map.get(row.event_id) ?? new Set<string>();
        set.add(wallDayKey(new Date(row.exception_date)));
        map.set(row.event_id, set);
    }
    return map;
}

/** Category names from `?category=A&category=B` or `?category=A,B` (lower-cased), or null for all */
export function requestedCategories(params: URLSearchParams): Set<string> | null {
    const names = params.getAll('category')
        .flatMap((v) => v.split(','))
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    return names.length > 0 ? new Set(names) : null;
}

export function inCategories(ev: Pick<FeedEvent, 'category'>, categories: Set<string> | null): boolean {
    return !categories || categories.has((ev.category ?? '').trim().toLowerCase());
}

/** One occurrence of an event as a single-event invite (per-date end and address for a series) */
export function occurrenceOf(ev: FeedEvent, at: Date | null): FeedEvent {
    const one = { ...ev, recurrence_type: 'none' };
    if (!at || isNaN(at.getTime())) return one;
    const dates = ev.recurrence_custom_dates;
    const idx = dates ? dates.findIndex((d) => new Date(d).getTime() === at.getTime()) : -1;
    const ends = ev.recurrence_custom_end_dates;
    if (idx >= 0 && ends && ends.length === dates!.length) {
        const ownEnd = new Date(ends[idx]);
        one.end_date = ownEnd.getTime() > at.getTime() ? ownEnd.toISOString() : null;
    } else if (ev.end_date) {
        const duration = Math.max(30 * 60 * 1000, new Date(ev.end_date).getTime() - new Date(ev.date).getTime());
        one.end_date = new Date(at.getTime() + duration).toISOString();
    }
    const places = ev.recurrence_custom_locations;
    if (idx >= 0 && places && places.length === dates!.length && places[idx]?.trim()) {
        one.location = places[idx]!.trim();
    }
    one.date = at.toISOString();
    return one;
}
