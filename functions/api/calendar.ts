/**
 * Cloudflare Pages Function — Live ICS Calendar Feed
 *
 *   GET /api/calendar                      every published event (past year, recurrences expanded)
 *   GET /api/calendar?category=Training    only some categories (repeat the parameter or use commas)
 *   GET /api/calendar?event_id=…&date=…    one event (one occurrence of a series) as an invite
 *
 * Outlook / Google Calendar / Apple Calendar can subscribe to this URL and refresh it.
 * Reads with SUPABASE_SERVICE_ROLE_KEY (published events only): the public key can't read events.
 */
import { supabaseConfig, selectAll, type SupabaseEnv } from '../../server/supabase.ts';
import { type FeedEvent, FEED_COLUMNS, FEED_HISTORY_DAYS, FEED_FUTURE_YEARS, feedFilter, exceptionsFromRows, expandRecurring, buildICS, requestedCategories, inCategories, occurrenceOf } from '../../server/feed.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const icsResponse = (ics: string, disposition: string): Response =>
    new Response(ics, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': disposition,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
        },
    });

const slugOf = (title: string): string =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ccp-event';

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
    const cfg = supabaseConfig(env);
    if (!cfg) {
        return new Response('Server misconfiguration: missing Supabase credentials (SUPABASE_URL and SUPABASE_ANON_KEY).', { status: 500 });
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
                return new Response('This event is no longer on the CCP calendar.', {
                    status: 404,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }
            const at = params.get('date');
            const invite = occurrenceOf(ev, at ? new Date(at) : null);
            return icsResponse(buildICS([invite]), `attachment; filename="${slugOf(ev.title || 'event')}.ics"`);
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
        const expanded = expandRecurring(events.filter((ev) => inCategories(ev, categories)), from, until, exceptionsFromRows(exceptionRows));
        return icsResponse(buildICS(expanded), 'inline; filename="ccp-events.ics"');
    } catch (err) {
        console.error('Calendar feed error:', err);
        return new Response('Internal error generating calendar feed.', { status: 500 });
    }
};
