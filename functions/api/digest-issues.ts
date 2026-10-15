/**
 * Cloudflare Pages Function — the last digest shared before a given day (signed-in users)
 * URL: GET /api/digest-issues?before=YYYY-MM-DD   →   { issue: { issued, ids } | null }
 *
 * The digest marks NEW the events that weren't in it, so staff and admins see the same marks.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../server/supabase.ts';
import { type IssueBucket, isIssueDay, readIssues, previousIssue } from '../../server/digestIssues.ts';

interface Env extends SupabaseEnv {
  BUCKET?: IssueBucket;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('The digest is not set up on the server (missing Supabase keys).', 500);
  if (!(await getCaller(cfg, bearerToken(request)))) return fail('Your session has expired. Please sign in again.', 401);

  const before = new URL(request.url).searchParams.get('before');
  if (!isIssueDay(before)) return fail('Which day? (before=YYYY-MM-DD)', 400);
  try {
    return json({ issue: previousIssue(await readIssues(env.BUCKET), before) });
  } catch (err) {
    console.error('Reading the digest issues failed:', err);
    return fail('The last digest could not be looked up.', 502);
  }
};
