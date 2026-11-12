/**
 * The live calendar feed: recurring events expanded on Europe/Dublin wall-clock time, and the
 * iCalendar text calendar apps subscribe to. Pure functions, so they can be tested.
 */
import { foldICSLine } from '../utils/icsFold.ts';
import { categoryFromKey, categoryKey } from '../constants/categories.ts';

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
    updated_at?: string | null;
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

        // (recurrence_days_of_week is not used: the app has no way to set it and ignores it,
        // and the feed must list exactly what the calendar shows)
        for (let k = 0; k < MAX_INSTANCES_PER_EVENT && k < maxOccurrences; k++) {
            const start = nthOccurrence(base, type, k * interval);
            if (start > endLimit) break;
            pushInstance(start);
        }
    }

    return result;
}

// ─── ICS generation ───────────────────────────────────────────────────

/** Text value: escapes per RFC 5545 §3.3.11, any line break as \n, other control characters dropped */
function escapeICS(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\r\n|\r|\n/g, '\\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

function formatDateUTC(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// SEQUENCE counts in minutes from this day, so it only goes up as an event is edited
const SEQUENCE_EPOCH = Date.UTC(2024, 0, 1);

export interface ICSOptions {
    /** The calendar's name in the app that subscribes (default "CCP Events") */
    name?: string;
    /** A line about the calendar (X-WR-CALDESC) */
    description?: string;
    /**
     * Subscription feed: events show as free time, so a calendar of everything on at CCP doesn't
     * fill the subscriber's day with busy blocks. A single invite (added to go to it) stays busy.
     */
    showAsFree?: boolean;
    /** When nothing in the event says when it was last changed (default: now) */
    now?: Date;
}

export const DEFAULT_CALENDAR_NAME = 'CCP Events';

/**
 * The iCalendar text. Each event's DTSTAMP, LAST-MODIFIED and SEQUENCE come from when it was
 * last changed, so the same events give the same text (the feed can answer "not modified") and
 * an edited event is newer than the copy a calendar app holds.
 */
export function buildICS(events: FeedEvent[], options: ICSOptions = {}): string {
    const now = options.now ?? new Date();
    const name = options.name ?? DEFAULT_CALENDAR_NAME;
    const lines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Cork City Partnership//CCP Events//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `NAME:${escapeICS(name)}`,
        `X-WR-CALNAME:${escapeICS(name)}`,
        ...(options.description ? [`DESCRIPTION:${escapeICS(options.description)}`, `X-WR-CALDESC:${escapeICS(options.description)}`] : []),
        'X-WR-TIMEZONE:Europe/Dublin',
        // The calendar's colour where the app takes one from the feed (Apple): CCP raspberry
        'X-APPLE-CALENDAR-COLOR:#B90B4F',
        // How often to check for changes, for the apps that listen (Apple; Outlook and Google keep their own pace)
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ];

    for (const ev of events) {
        const start = new Date(ev.date);
        if (isNaN(start.getTime())) continue;
        const ownEnd = ev.end_date ? new Date(ev.end_date) : null;
        // No end, or one that isn't after the start: an hour
        const end = ownEnd && ownEnd.getTime() > start.getTime() ? ownEnd : new Date(start.getTime() + 60 * 60 * 1000);
        const changedRaw = ev.updated_at || ev.created_at;
        const changed = changedRaw && !isNaN(new Date(changedRaw).getTime()) ? new Date(changedRaw) : now;
        const sequence = Math.max(0, Math.floor((changed.getTime() - SEQUENCE_EPOCH) / 60000));

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${ev.id}@ccp-events`);
        lines.push(`DTSTAMP:${formatDateUTC(changed)}`);
        lines.push(`LAST-MODIFIED:${formatDateUTC(changed)}`);
        lines.push(`DTSTART:${formatDateUTC(start)}`);
        lines.push(`DTEND:${formatDateUTC(end)}`);
        lines.push(`SUMMARY:${escapeICS(ev.title || 'CCP event')}`);
        if (ev.description?.trim()) {
            lines.push(`DESCRIPTION:${escapeICS(ev.description.trim())}`);
        }
        if (ev.location?.trim()) {
            lines.push(`LOCATION:${escapeICS(ev.location.trim())}`);
        }
        if (ev.category?.trim()) {
            lines.push(`CATEGORIES:${escapeICS(ev.category.trim())}`);
        }
        lines.push(`SEQUENCE:${sequence}`);
        lines.push('STATUS:CONFIRMED');
        lines.push('CLASS:PUBLIC');
        if (options.showAsFree) {
            lines.push('TRANSP:TRANSPARENT');
            lines.push('X-MICROSOFT-CDO-BUSYSTATUS:FREE');
        }
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(foldICSLine).join('\r\n') + '\r\n';
}

/** The subscribed calendar's name: "CCP Events", or with the categories it is limited to */
export function calendarName(categories: string[]): string {
    if (categories.length === 0) return DEFAULT_CALENDAR_NAME;
    if (categories.length <= 2) return `${DEFAULT_CALENDAR_NAME}: ${categories.join(', ')}`;
    return `${DEFAULT_CALENDAR_NAME} (${categories.length} categories)`;
}


// ─── Feed queries ─────────────────────────────────────────────────────

/** Columns the feed reads (never the submitter's details) */
export const FEED_COLUMNS = [
    'id', 'title', 'description', 'date', 'end_date', 'location', 'status', 'category',
    'recurrence_type', 'recurrence_interval', 'recurrence_end_date', 'recurrence_occurrences',
    'recurrence_days_of_week', 'recurrence_custom_dates', 'recurrence_custom_end_dates',
    'recurrence_custom_locations', 'created_at', 'updated_at',
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

/**
 * Category names from `?category=health-wellbeing,other` (also `?category=A&category=B`, and the
 * full names older addresses carry): official names in their proper spelling, others as given,
 * no repeats
 */
export function categoryNames(params: URLSearchParams): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of params.getAll('category').flatMap((v) => v.split(','))) {
        const key = categoryKey(raw);
        if (key && !seen.has(key)) {
            seen.add(key);
            names.push(categoryFromKey(raw) ?? raw.trim());
        }
    }
    return names;
}

/** The keys of the categories asked for (see categoryKey), or null for all */
export function requestedCategories(params: URLSearchParams): Set<string> | null {
    const keys = categoryNames(params).map(categoryKey);
    return keys.length > 0 ? new Set(keys) : null;
}

export function inCategories(ev: Pick<FeedEvent, 'category'>, categories: Set<string> | null): boolean {
    return !categories || categories.has(categoryKey(ev.category ?? ''));
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
