/**
 * Cloudflare Pages Function — what's already on the calendar, for the public /submit form
 * URL: GET /api/published-events
 *
 * People submitting without an account can't read the events table, but the form warns them
 * about events at the same time (likely duplicates). This returns published events from a
 * month ago onwards with only what that check needs: no submitter details, tags or history.
 */
import { json, fail, edgeCache } from '../../server/http.ts';
import { supabaseConfig, selectAll, type SupabaseEnv } from '../../server/supabase.ts';
import { FEED_COLUMNS, feedFilter } from '../../server/feed.ts';

const LOOKBACK_DAYS = 31;

interface Context {
  request: Request;
  env: SupabaseEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env, waitUntil }: Context): Promise<Response> => {
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('Not set up on the server (missing Supabase keys).', 500);

  const cache = edgeCache();
  const cacheKey = new Request(request.url, { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheKey).catch(() => undefined);
    if (cached) return cached;
  }

  try {
    const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const events = await selectAll<Record<string, unknown>>(cfg, `events?select=${FEED_COLUMNS}&${feedFilter(from)}&order=date.asc,id.asc`);
    const response = json({ events }, 200, { 'Cache-Control': 'public, max-age=300' });
    if (cache) {
      const store = cache.put(cacheKey, response.clone()).catch(() => undefined);
      if (waitUntil) waitUntil(store);
      else await store;
    }
    return response;
  } catch (err) {
    console.error('Listing published events failed:', err);
    return fail('Could not load the calendar.', 502);
  }
};
