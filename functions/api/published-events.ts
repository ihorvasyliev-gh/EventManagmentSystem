/**
 * Cloudflare Pages Function — what's already on the calendar, for the public /submit form
 * URL: GET /api/published-events
 *
 * People submitting without an account can't read the events table, but the form warns them
 * about events at the same time (likely duplicates). This returns published events from a
 * month ago onwards with only what that check needs: no submitter details, tags or history.
 */
import { json, fail } from '../../server/http.ts';
import { supabaseConfig, selectAll, type SupabaseEnv } from '../../server/supabase.ts';
import { FEED_COLUMNS, feedFilter } from '../../server/feed.ts';

const LOOKBACK_DAYS = 31;

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('Not set up on the server (missing Supabase keys).', 500);
  try {
    const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const events = await selectAll<Record<string, unknown>>(cfg, `events?select=${FEED_COLUMNS}&${feedFilter(from)}&order=date.asc,id.asc`);
    return json({ events }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    console.error('Listing published events failed:', err);
    return fail('Could not load the calendar.', 502);
  }
};
