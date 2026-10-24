/**
 * Cloudflare Pages Function — the digests already shared (signed-in users)
 * URL: GET /api/digest-issues?before=YYYY-MM-DD
 *   →   { issue: { issued, ids } | null, latest: { issued, key, base, layout?, flyers? } | null }
 *
 * `issue`: the last digest shared before that day. The digest marks NEW the events that weren't
 * in it, so staff and admins see the same marks.
 * `latest`: the latest issue (server/digestVersions.ts), so an admin can update it once its
 * events change: `key` is what its links show, `base` the PDF that went out.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../server/supabase.ts';
import { isIssueDay, readIssues, previousIssue } from '../../server/digestIssues.ts';
import { type DigestBucket, type SentDigest, listDigestObjects, digestVersions, digestWeeks, sentDigestOf } from '../../server/digestVersions.ts';

interface Env extends SupabaseEnv {
  BUCKET?: DigestBucket;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('The digest is not set up on the server (missing Supabase keys).', 500);
  if (!(await getCaller(cfg, bearerToken(request)))) return fail('Your session has expired. Please sign in again.', 401);

  const before = new URL(request.url).searchParams.get('before');
  if (!isIssueDay(before)) return fail('Which day? (before=YYYY-MM-DD)', 400);
  let issues;
  try {
    issues = await readIssues(env.BUCKET);
  } catch (err) {
    console.error('Reading the digest issues failed:', err);
    return fail('The last digest could not be looked up.', 502);
  }
  // Without it the digest can't be updated from here, but the NEW marks still work
  let latest: SentDigest | null = null;
  try {
    const [week] = digestWeeks(digestVersions(await listDigestObjects(env.BUCKET), issues));
    latest = week ? sentDigestOf(week) : null;
  } catch (err) {
    console.error('Listing the shared digests failed:', err);
  }
  return json({ issue: previousIssue(issues, before), latest });
};
