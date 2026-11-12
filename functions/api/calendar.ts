/**
 * Cloudflare Pages Function — Live ICS Calendar Feed
 *
 *   GET /api/calendar                      every published event (past year, recurrences expanded)
 *   GET /api/calendar?category=health-wellbeing,other   only some categories (keys or full names)
 *   GET /api/calendar?preview=5            the next few events of that feed as JSON (the /subscribe page)
 *   GET /api/calendar?event_id=…&date=…    one event (one occurrence of a series) as an invite
 *
 * Outlook / Google Calendar / Apple Calendar subscribe to this URL and refresh it. Public, no
 * account: it has published events only, and of each only the title, start and end, description,
 * venue and category (never contacts, submitters, flyers or tags).
 * Reads with SUPABASE_SERVICE_ROLE_KEY (published events only): the public key can't read events.
 */
import { supabaseConfig, selectAll, type SupabaseEnv } from '../../server/supabase.ts';
import {
    type FeedEvent, FEED_COLUMNS, FEED_HISTORY_DAYS, FEED_FUTURE_YEARS, feedFilter, exceptionsFromRows, expandRecurring,
    buildICS, requestedCategories, categoryNames, calendarName, inCategories, occurrenceOf,
} from '../../server/feed.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PREVIEW = 10;

const CALENDAR_DESCRIPTION = 'Events published on the Cork City Partnership calendar. Updates by itself; to change an event, use the CCP calendar.';

const textResponse = (text: string, status: number, headers: Record<string, string> = {}): Response =>
    new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/** A short fingerprint of the feed, so a calendar app asking again gets "not modified" */
async function etagOf(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `"${hex}"`;
}

const matchesEtag = (header: string | null, etag: string): boolean =>
    !!header && header.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag || tag.trim() === '*');

async function icsResponse(request: Request, ics: string, disposition: string, maxAge: number): Promise<Response> {
    const etag = await etagOf(ics);
    const headers: Record<string, string> = {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': disposition,
        'Cache-Control': `public, max-age=${maxAge}`,
        'ETag': etag,
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex',
    };
    if (matchesEtag(request.headers.get('If-None-Match'), etag)) {
        return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === 'HEAD' ? null : ics, { status: 200, headers });
}

const slugOf = (title: string): string =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ccp-event';

interface Context { request: Request; env: SupabaseEnv }

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
    const cfg = supabaseConfig(env);
    if (!cfg) {
        return textResponse('Server misconfiguration: missing Supabase credentials (SUPABASE_URL and SUPABASE_ANON_KEY).', 500);
    }

    try {
        const params = new URL(request.url).searchParams;
        const eventId = params.get('event_id');

        // One event, e.g. from the "add to calendar" link in an older digest PDF. Only the id is
        // trusted: the title and other details in such links are ignored and read from the calendar.
        if (eventId !== null) {
            const [ev] = UUID_RE.test(eventId)
                ? await selectAll<FeedEvent>(cfg, `events?select=${FEED_COLUMNS}&id=eq.${eventId}&status=eq.published`)
                : [];
            if (!ev) {
                return textResponse('This event is no longer on the CCP calendar.', 404);
            }
            const at = params.get('date');
            const invite = occurrenceOf(ev, at ? new Date(at) : null);
            return icsResponse(request, buildICS([invite]), `attachment; filename="${slugOf(ev.title || 'event')}.ics"`, 3600);
        }

        // The subscription feed
        const now = new Date();
        const from = new Date(now.getTime() - FEED_HISTORY_DAYS * 24 * 60 * 60 * 1000);
        const until = new Date(now.getFullYear() + FEED_FUTURE_YEARS, now.getMonth(), now.getDate());
        const categories = requestedCategories(params);

        const [events, exceptionRows] = await Promise.all([
            selectAll<FeedEvent>(cfg, `events?select=${FEED_COLUMNS}&${feedFilter(from)}&order=date.asc,id.asc`),
            selectAll<{ event_id: string; exception_date: string }>(cfg, 'recurrence_exceptions?select=event_id,exception_date&order=id.asc')
                .catch(() => []), // best-effort: without them the feed still lists the full series
        ]);
        const expanded = expandRecurring(events.filter((ev) => inCategories(ev, categories)), from, until, exceptionsFromRows(exceptionRows))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id));

        // The next few, for the subscribe page to show what the calendar holds
        const preview = params.get('preview');
        if (preview !== null) {
            const count = Math.min(MAX_PREVIEW, Math.max(1, Number.parseInt(preview, 10) || 5));
            const upcoming = expanded
                .filter((ev) => new Date(ev.end_date || ev.date).getTime() >= now.getTime())
                .slice(0, count)
                .map((ev) => ({ title: ev.title, start: ev.date, end: ev.end_date ?? null, location: ev.location ?? null, category: ev.category ?? null }));
            return new Response(JSON.stringify({ events: upcoming }), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
            });
        }

        const ics = buildICS(expanded, {
            name: calendarName(categoryNames(params)),
            description: CALENDAR_DESCRIPTION,
            showAsFree: true,
            now,
        });
        // Short browser/proxy cache: a new subscriber sees changes within minutes
        return icsResponse(request, ics, 'inline; filename="ccp-events.ics"', 900);
    } catch (err) {
        console.error('Calendar feed error:', err);
        // Temporary: calendar apps keep the events they have and try again later
        return textResponse('The CCP calendar is briefly unavailable. Please try again in a few minutes.', 503, { 'Retry-After': '600' });
    }
};

// Some calendar apps check the address with HEAD before subscribing
export const onRequestHead = onRequestGet;
