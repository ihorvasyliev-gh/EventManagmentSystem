/**
 * Cloudflare Pages Function — the Upcoming Events Digest as a link (admins only)
 * URL: POST /api/digest   multipart: file (the digest PDF, made in the browser)
 *
 * The PDF is kept in R2 under digests/ and served by /api/file/<key>, so anyone with the link
 * can open it (Board members have no accounts; the key holds a random UUID, so it can't be
 * guessed). Links work for six months: each new digest deletes the ones older than that.
 *
 * Optional fields `issued` (YYYY-MM-DD) and `eventIds` (a JSON array) record which events the
 * digest carried, so next week's digest marks NEW only the events this one didn't have, and
 * that the PDF is that day's issue: every link to the week's digest shows its newest PDF
 * (server/digestVersions.ts). `update=1` makes it an update of the issue `issued` names, after
 * its events changed; `layout` and `flyers` let a later update look the same.
 * An optional `list` (JSON, see utils/digestList.ts) is kept beside the PDF as <name>.json:
 * the digest's page shows it as a list that reads well on a phone.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../server/supabase.ts';
import { contentMatchesType } from '../../server/files.ts';
import { parseIssue, recordIssue, isDigestLayout } from '../../server/digestIssues.ts';
import { type DigestBucket, DIGEST_PREFIX, listDigestObjects } from '../../server/digestVersions.ts';
import { parseDigestList } from '../../utils/digestList.ts';

export { type DigestBucket, DIGEST_PREFIX };

interface Env extends SupabaseEnv {
  BUCKET?: DigestBucket;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** How long a digest link works (about six months) */
export const DIGEST_KEEP_DAYS = 183;
/** Flyers make a digest large; R2 and the Workers request limit allow far more */
export const DIGEST_MAX_BYTES = 40 * 1024 * 1024;
/** The events as a list: text only, far below this */
const LIST_MAX_CHARS = 1024 * 1024;

/** Where a digest's list is kept: beside its PDF, as .json */
export const digestListKey = (pdfKey: string): string => `${pdfKey.replace(/\.pdf$/i, '')}.json`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes digests uploaded more than DIGEST_KEEP_DAYS ago; returns their keys */
export const deleteOldDigests = async (bucket: DigestBucket, now = new Date()): Promise<string[]> => {
  const cutoff = now.getTime() - DIGEST_KEEP_DAYS * DAY_MS;
  const old = (await listDigestObjects(bucket)).filter((o) => new Date(o.uploaded).getTime() < cutoff).map((o) => o.key);
  for (const key of old) await bucket.delete(key);
  return old;
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('Sharing the digest is not set up on the server (missing Supabase keys).', 500);

  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can share the digest as a link.', 403);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > DIGEST_MAX_BYTES + 64 * 1024) return fail('The digest PDF is too large to share as a link.', 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Invalid request.', 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail('No PDF found in the request.', 400);
  // An update names the issue it updates
  const update = form.get('update') === '1';
  let ids: unknown = null;
  try {
    const eventIds = form.get('eventIds');
    ids = typeof eventIds === 'string' ? JSON.parse(eventIds) : null;
  } catch { /* not recorded */ }
  const issue = parseIssue(form.get('issued'), ids);
  if (update && !issue) return fail('Which digest is being updated? (issued and eventIds)', 400);
  if ((file.type || '').toLowerCase() !== 'application/pdf' || !(await contentMatchesType(file, 'application/pdf'))) {
    return fail('The digest must be a PDF.', 415);
  }
  if (file.size > DIGEST_MAX_BYTES) return fail('The digest PDF is too large to share as a link.', 413);

  const name = (file.name || 'events-digest.pdf').replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${DIGEST_PREFIX}${crypto.randomUUID()}-${name}`;
  try {
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: 'application/pdf' } });
  } catch (err) {
    console.error('Storing the digest failed:', err);
    return fail('The digest could not be uploaded. Please try again.', 502);
  }

  // The events as a list for the page; without it the page shows the PDF alone
  const listField = form.get('list');
  if (typeof listField === 'string' && listField.length <= LIST_MAX_CHARS) {
    let list = null;
    try {
      list = parseDigestList(JSON.parse(listField));
    } catch { /* not stored */ }
    if (list) {
      try {
        await env.BUCKET.put(digestListKey(key), new Blob([JSON.stringify(list)]), { httpMetadata: { contentType: 'application/json' } });
      } catch (err) {
        console.error('Storing the digest list failed:', err);
      }
    }
  }

  // Remember what this digest carried and that it is the issue's newest PDF; a failure only means
  // next week's marks everything NEW, and this PDF counts as shared the day it was uploaded
  if (issue) {
    const layout = form.get('layout');
    const flyers = form.get('flyers');
    try {
      await recordIssue(env.BUCKET, issue, {
        key,
        ...(update ? { update: true as const } : {}),
        ...(isDigestLayout(layout) ? { layout } : {}),
        ...(flyers === '1' || flyers === '0' ? { flyers: flyers === '1' } : {})
      });
    } catch (err) {
      console.error('Recording the digest issue failed:', err);
    }
  }

  // Tidy up after answering; a failure here only leaves old files for next time
  const cleanup = deleteOldDigests(env.BUCKET).catch((err) => console.error('Removing old digests failed:', err));
  if (context.waitUntil) context.waitUntil(cleanup);
  else await cleanup;

  const expiresAt = new Date(Date.now() + DIGEST_KEEP_DAYS * DAY_MS).toISOString();
  return json({ url: `/api/file/${key}`, expiresAt }, 201);
};
