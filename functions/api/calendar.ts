/**
 * Cloudflare Pages Function — Live ICS Calendar Feed
 * URL: /api/calendar.ics
 *
 * Outlook / Google Calendar / Apple Calendar can subscribe to this URL
 * and auto-refresh events periodically.
 *
 * Required Cloudflare Pages environment variables:
 *   SUPABASE_URL      — e.g. https://xxxxx.supabase.co
 *   SUPABASE_ANON_KEY — the anon/public key
 */

interface Env {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
}

interface SupabaseEvent {
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
const wallDayKey = (date: Date) => { const w = toWall(date); return `${w.y}-${w.m}-${w.d}`; };

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

function expandRecurring(
    events: SupabaseEvent[],
    rangeStart: Date,
    rangeEnd: Date,
    exceptions: Map<string, Set<string>> = new Map()
): SupabaseEvent[] {
    const result: SupabaseEvent[] = [];

    for (const ev of events) {
        const baseStart = new Date(ev.date);
        if (isNaN(baseStart.getTime())) continue;
        const baseEnd = ev.end_date ? new Date(ev.end_date) : null;
        const durationMs = baseEnd && baseEnd >= baseStart ? baseEnd.getTime() - baseStart.getTime() : null;
        const type = ev.recurrence_type;

        const pushInstance = (start: Date) => {
            if (start < rangeStart || start > rangeEnd) return;
            if (exceptions.get(ev.id)?.has(wallDayKey(start))) return;
            result.push({
                ...ev,
                id: `${ev.id}_${start.getTime()}`,
                date: start.toISOString(),
                end_date: durationMs !== null ? new Date(start.getTime() + durationMs).toISOString() : null,
            });
        };

        if (!type || type === 'none') {
            if (baseStart >= rangeStart && baseStart <= rangeEnd) result.push(ev);
            continue;
        }

        const base = toWall(baseStart);

        // Custom dates: each picked day at the original time of day
        if (type === 'custom') {
            const dates = ev.recurrence_custom_dates && ev.recurrence_custom_dates.length > 0
                ? ev.recurrence_custom_dates
                : [ev.date];
            for (const iso of dates) {
                const day = new Date(iso);
                if (isNaN(day.getTime())) continue;
                const w = toWall(day);
                pushInstance(fromWall(w.y, w.m, w.d, base.h, base.mi, base.s));
            }
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

async function fetchExceptions(supabaseUrl: string, anonKey: string): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/recurrence_exceptions?select=event_id,exception_date`, {
            headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        });
        if (!res.ok) return map;
        const rows: { event_id: string; exception_date: string }[] = await res.json();
        for (const row of rows) {
            const set = map.get(row.event_id) ?? new Set<string>();
            set.add(wallDayKey(new Date(row.exception_date)));
            map.set(row.event_id, set);
        }
    } catch {
        // Exceptions are best-effort: without them the feed still lists the full series
    }
    return map;
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

function buildICS(events: SupabaseEvent[]): string {
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
    return lines.join('\r\n') + '\r\n';
}

// ─── Request handler ──────────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { env } = context;
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

    try {
        const reqUrl = new URL(context.request.url);
        const eventId = reqUrl.searchParams.get('event_id');
        const specificDate = reqUrl.searchParams.get('date');
        const titleParam = reqUrl.searchParams.get('title');

        // Mode 1: Event details provided directly in query parameters (Self-contained / offline-safe from PDF)
        if (titleParam) {
            const start = specificDate ? new Date(specificDate) : new Date();
            const validStart = isNaN(start.getTime()) ? new Date() : start;
            const endDateParam = reqUrl.searchParams.get('end_date');
            const parsedEnd = endDateParam ? new Date(endDateParam) : null;
            const validEnd = parsedEnd && !isNaN(parsedEnd.getTime())
                ? parsedEnd
                : new Date(validStart.getTime() + 60 * 60 * 1000);

            const ev: SupabaseEvent = {
                id: eventId || `ev_${validStart.getTime()}`,
                title: titleParam,
                description: reqUrl.searchParams.get('description') || null,
                date: validStart.toISOString(),
                end_date: validEnd.toISOString(),
                location: reqUrl.searchParams.get('location') || null,
                category: reqUrl.searchParams.get('category') || null,
                status: 'published',
                recurrence_type: null,
                recurrence_interval: null,
                recurrence_end_date: null,
                recurrence_occurrences: null,
                recurrence_days_of_week: null,
                recurrence_custom_dates: null,
                created_at: new Date().toISOString(),
            };

            const ics = buildICS([ev]);
            const slug = titleParam
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40) || 'ccp-event';

            return new Response(ics, {
                status: 200,
                headers: {
                    'Content-Type': 'text/calendar; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${slug}.ics"`,
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // Mode 2: Single event requested by ID (e.g. from previously generated PDF bulletins)
        if (eventId) {
            if (supabaseUrl && supabaseAnonKey) {
                const url = `${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=*`;
                const res = await fetch(url, {
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Authorization': `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (res.ok) {
                    const events: SupabaseEvent[] = await res.json();
                    if (events && events.length > 0) {
                        const ev = { ...events[0] };
                        if (specificDate) {
                            const parsed = new Date(specificDate);
                            if (!isNaN(parsed.getTime())) {
                                if (ev.end_date) {
                                    const originalStart = new Date(ev.date).getTime();
                                    const originalEnd = new Date(ev.end_date).getTime();
                                    const duration = Math.max(30 * 60 * 1000, originalEnd - originalStart);
                                    ev.end_date = new Date(parsed.getTime() + duration).toISOString();
                                }
                                ev.date = parsed.toISOString();
                            }
                        }

                        const ics = buildICS([ev]);
                        const rawTitle = ev.title || 'event';
                        const slug = rawTitle
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-|-$/g, '')
                            .slice(0, 40) || 'ccp-event';

                        return new Response(ics, {
                            status: 200,
                            headers: {
                                'Content-Type': 'text/calendar; charset=utf-8',
                                'Content-Disposition': `attachment; filename="${slug}.ics"`,
                                'Cache-Control': 'public, max-age=3600',
                                'Access-Control-Allow-Origin': '*',
                            },
                        });
                    }
                }
            }

            // Fallback: If Supabase credentials are missing or record not found, generate a valid calendar invite
            // from the available event metadata instead of failing with a 500 error screen.
            const start = specificDate ? new Date(specificDate) : new Date();
            const validStart = isNaN(start.getTime()) ? new Date() : start;
            const validEnd = new Date(validStart.getTime() + 60 * 60 * 1000);

            const fallbackEv: SupabaseEvent = {
                id: eventId,
                title: 'CCP Calendar Event',
                description: 'Please visit the CCP Calendar portal for full event details.',
                date: validStart.toISOString(),
                end_date: validEnd.toISOString(),
                location: null,
                category: null,
                status: 'published',
                recurrence_type: null,
                recurrence_interval: null,
                recurrence_end_date: null,
                recurrence_occurrences: null,
                recurrence_days_of_week: null,
                recurrence_custom_dates: null,
                created_at: new Date().toISOString(),
            };

            const ics = buildICS([fallbackEv]);
            return new Response(ics, {
                status: 200,
                headers: {
                    'Content-Type': 'text/calendar; charset=utf-8',
                    'Content-Disposition': `attachment; filename="ccp-event.ics"`,
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // Mode 3: Live calendar feed subscription (/api/calendar)
        if (!supabaseUrl || !supabaseAnonKey) {
            return new Response(
                'Server misconfiguration: missing Supabase credentials. Ensure SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) are configured in Cloudflare Pages.',
                { status: 500 }
            );
        }

        const url = `${supabaseUrl}/rest/v1/events?status=eq.published&order=date.asc`;
        const res = await fetch(url, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            const body = await res.text();
            console.error('Supabase error:', res.status, body);
            return new Response('Failed to fetch events.', { status: 502 });
        }

        const events: SupabaseEvent[] = await res.json();

        // Expand recurring events for the next 2 years
        const now = new Date();
        const rangeStart = events.length > 0
            ? new Date(Math.min(now.getTime(), ...events.map(e => new Date(e.date).getTime())))
            : now;
        const rangeEnd = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

        const exceptions = await fetchExceptions(supabaseUrl, supabaseAnonKey);
        const expanded = expandRecurring(events, rangeStart, rangeEnd, exceptions);

        const ics = buildICS(expanded);

        return new Response(ics, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="ccp-events.ics"',
                'Cache-Control': 'public, max-age=3600', // 1 hour cache
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err: any) {
        console.error('Calendar feed error:', err);
        return new Response('Internal error generating calendar feed.', { status: 500 });
    }
};
