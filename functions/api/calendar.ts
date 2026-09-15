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
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}

interface SupabaseEvent {
    id: string;
    title: string;
    description: string | null;
    date: string;
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

function expandRecurring(events: SupabaseEvent[], rangeStart: Date, rangeEnd: Date): SupabaseEvent[] {
    const result: SupabaseEvent[] = [];

    for (const ev of events) {
        const type = ev.recurrence_type;
        if (!type || type === 'none') {
            // Non-recurring: include if within range
            const d = new Date(ev.date);
            if (d >= rangeStart && d <= rangeEnd) {
                result.push(ev);
            }
            continue;
        }

        // Custom dates recurrence
        if (type === 'custom' && ev.recurrence_custom_dates) {
            for (const iso of ev.recurrence_custom_dates) {
                const d = new Date(iso);
                if (d >= rangeStart && d <= rangeEnd) {
                    result.push({ ...ev, date: iso, id: `${ev.id}_${d.getTime()}` });
                }
            }
            continue;
        }

        // Standard recurrence (daily/weekly/monthly/yearly)
        const interval = ev.recurrence_interval || 1;
        const endDate = ev.recurrence_end_date ? new Date(ev.recurrence_end_date) : rangeEnd;
        const maxOccurrences = ev.recurrence_occurrences || 730; // safety cap
        const baseDate = new Date(ev.date);
        let count = 0;

        // For weekly with specific days
        if (type === 'weekly' && ev.recurrence_days_of_week && ev.recurrence_days_of_week.length > 0) {
            const cursor = new Date(baseDate);
            cursor.setHours(0, 0, 0, 0);
            // Start from the beginning of the week
            const startDay = cursor.getDay();
            cursor.setDate(cursor.getDate() - startDay);

            while (cursor <= endDate && cursor <= rangeEnd && count < maxOccurrences) {
                for (const dow of ev.recurrence_days_of_week) {
                    const d = new Date(cursor);
                    d.setDate(d.getDate() + dow);
                    d.setHours(baseDate.getHours(), baseDate.getMinutes(), baseDate.getSeconds());
                    if (d >= baseDate && d >= rangeStart && d <= endDate && d <= rangeEnd && count < maxOccurrences) {
                        result.push({ ...ev, date: d.toISOString(), id: `${ev.id}_${d.getTime()}` });
                        count++;
                    }
                }
                cursor.setDate(cursor.getDate() + 7 * interval);
            }
            continue;
        }

        // Simple recurrence
        const cursor = new Date(baseDate);
        while (cursor <= endDate && cursor <= rangeEnd && count < maxOccurrences) {
            if (cursor >= rangeStart) {
                result.push({ ...ev, date: cursor.toISOString(), id: `${ev.id}_${cursor.getTime()}` });
                count++;
            }
            switch (type) {
                case 'daily':
                    cursor.setDate(cursor.getDate() + interval);
                    break;
                case 'weekly':
                    cursor.setDate(cursor.getDate() + 7 * interval);
                    break;
                case 'monthly':
                    cursor.setMonth(cursor.getMonth() + interval);
                    break;
                case 'yearly':
                    cursor.setFullYear(cursor.getFullYear() + interval);
                    break;
                default:
                    cursor.setDate(cursor.getDate() + 1);
            }
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
        const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour default

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

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return new Response('Server misconfiguration: missing Supabase credentials.', { status: 500 });
    }

    try {
        // Fetch published events from Supabase REST API
        const url = `${env.SUPABASE_URL}/rest/v1/events?status=eq.published&order=date.asc`;
        const res = await fetch(url, {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
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

        const expanded = expandRecurring(events, rangeStart, rangeEnd);

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
