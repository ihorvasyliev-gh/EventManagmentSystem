/**
 * Cloudflare Pages Function — what a digest link shows, and the digests before it (anyone with a link)
 * URL: GET /api/digest-versions?key=digests/<id>-<name>.pdf
 *   →   { latest: { key, issued, updatedAt }, archive: [{ key, issued, updatedAt }, …] }
 *
 * An event that changes after the digest went out is fixed by updating the digest: a new PDF
 * for the same week. `latest` is the newest PDF of the link's week, so the email already sent
 * shows the fix; `updatedAt` says when it was updated (null: as it went out). `archive` is each
 * week's newest, newest week first. Board members have no accounts, so a link to any digest kept
 * opens the others; without one (the key holds a random UUID) nothing is listed.
 */
import { json, fail } from '../../server/http.ts';
import { DIGEST_KEY_RE, readIssues } from '../../server/digestIssues.ts';
import { type DigestBucket, listDigestObjects, digestVersions, digestWeeks, refOf } from '../../server/digestVersions.ts';

interface Env {
  BUCKET?: DigestBucket;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!DIGEST_KEY_RE.test(key)) return fail('Which digest? (key=digests/<id>-<name>.pdf)', 400);
  try {
    const [objects, issues] = await Promise.all([listDigestObjects(env.BUCKET), readIssues(env.BUCKET)]);
    const weeks = digestWeeks(digestVersions(objects, issues));
    const own = weeks.find((w) => w.versions.some((v) => v.key === key));
    if (!own) return fail('This digest is no longer available.', 404);
    return json({ latest: refOf(own), archive: weeks.map(refOf) });
  } catch (err) {
    console.error('Looking up the digest versions failed:', err);
    return fail('The digest could not be looked up.', 502);
  }
};
