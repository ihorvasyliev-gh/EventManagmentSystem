/**
 * Cloudflare Pages Function — the Upcoming Events Digest as a link (admins only)
 * URL: POST /api/digest   multipart: file (the digest PDF, made in the browser)
 *
 * The PDF is kept in R2 under digests/ and served by /api/file/<key>, so anyone with the link
 * can open it (Board members have no accounts; the key holds a random UUID, so it can't be
 * guessed). Links work for six months: each new digest deletes the ones older than that.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../server/supabase.ts';
import { type FileBucket, contentMatchesType } from '../../server/files.ts';

/** Listing as well as storing: old digests are found by their upload date */
export interface DigestBucket extends FileBucket {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: Array<{ key: string; uploaded: Date }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

interface Env extends SupabaseEnv {
  BUCKET?: DigestBucket;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const DIGEST_PREFIX = 'digests/';
/** How long a digest link works (about six months) */
export const DIGEST_KEEP_DAYS = 183;
/** Flyers make a digest large; R2 and the Workers request limit allow far more */
export const DIGEST_MAX_BYTES = 40 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes digests uploaded more than DIGEST_KEEP_DAYS ago; returns their keys */
export const deleteOldDigests = async (bucket: DigestBucket, now = new Date()): Promise<string[]> => {
  const cutoff = now.getTime() - DIGEST_KEEP_DAYS * DAY_MS;
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: DIGEST_PREFIX, cursor });
    page.objects.forEach((o) => {
      if (new Date(o.uploaded).getTime() < cutoff) old.push(o.key);
    });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
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

  let file: File | string | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return fail('Invalid request.', 400);
  }
  if (!file || typeof file === 'string') return fail('No PDF found in the request.', 400);
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

  // Tidy up after answering; a failure here only leaves old files for next time
  const cleanup = deleteOldDigests(env.BUCKET).catch((err) => console.error('Removing old digests failed:', err));
  if (context.waitUntil) context.waitUntil(cleanup);
  else await cleanup;

  const expiresAt = new Date(Date.now() + DIGEST_KEEP_DAYS * DAY_MS).toISOString();
  return json({ url: `/api/file/${key}`, expiresAt }, 201);
};
