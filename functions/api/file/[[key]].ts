/**
 * Cloudflare Pages Function — files stored in R2
 *   GET    /api/file/<key>   serve a poster or attachment (or a poster's lighter copy: utils/posterVariants.ts)
 *   HEAD   /api/file/<key>   metadata/existence check without streaming the object body
 *   DELETE /api/file/<key>   remove it (admins only; kept while any event still uses it)
 */
import { json, fail, bearerToken } from '../../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../../server/supabase.ts';
import { type FileBucket, deleteUnreferencedFiles, contentDisposition, digestPageRedirect } from '../../../server/files.ts';
import { posterOfVariant } from '../../../utils/posterVariants.ts';

/** Metadata shared by R2 head() and get() results */
interface StoredHead {
  httpEtag: string;
  size?: number;
  writeHttpMetadata(headers: Headers): void;
}

/** What a stored file comes back as (the part of R2's object this function uses) */
interface StoredObject extends StoredHead {
  body?: ReadableStream;
}

/** Typed by hand (not R2Bucket and PagesFunction) so the app's type check and tests can import it */
interface Env extends SupabaseEnv {
  BUCKET: FileBucket & {
    get(key: string, options?: { onlyIf?: Headers }): Promise<StoredObject | null>;
    head?(key: string): Promise<StoredHead | null>;
  };
}

interface Context {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
}

// Types that are safe to render inline; everything else is forced to download.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

const keyOf = (params: Record<string, string | string[]>): string => {
  const key = params.key;
  return Array.isArray(key) ? key.join('/') : key ?? '';
};

const matchesEtag = (header: string | null, etag: string | undefined): boolean => {
  if (!header || !etag) return false;
  const clean = etag.replace(/^W\//, '');
  return header.split(',').some((tag) => {
    const t = tag.trim();
    return t === '*' || t.replace(/^W\//, '') === clean;
  });
};

const digestRedirectResponse = (location: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      Vary: 'Sec-Fetch-Dest, Accept',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex'
    }
  });

const buildFileHeaders = (key: string, object: StoredHead): Headers => {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (typeof object.size === 'number') headers.set('Content-Length', String(object.size));

  // Older uploads were not type-checked: never let a stored file run as a page on this origin.
  const contentType = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex');
  if (!INLINE_TYPES.has(contentType)) {
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  }
  headers.set('Content-Disposition', contentDisposition(key, INLINE_TYPES.has(contentType)));
  // The same digest URL answers a page visit with a redirect: keep the two apart in caches
  if (key.startsWith('digests/')) headers.set('Vary', 'Sec-Fetch-Dest, Accept');

  // Keys contain a random UUID, so the content behind a URL never changes
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return headers;
};

const missingFileResponse = (key: string): Response => {
  // A poster's lighter copy that was never made (sent before copies existed, or the browser
  // couldn't make one): the poster itself. Not kept for long, in case the copy is added later.
  const poster = posterOfVariant(key);
  if (poster) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/api/file/${poster}`,
        'Cache-Control': 'public, max-age=86400',
        'X-Robots-Tag': 'noindex'
      }
    });
  }
  return new Response('File not found', { status: 404 });
};

export const onRequestGet = async ({ params, env, request }: Context): Promise<Response> => {
  const key = keyOf(params);

  // A digest link tapped in an email opens the digest's page (phone email apps can't show the file)
  const page = digestPageRedirect(key, request);
  if (page) return digestRedirectResponse(page);

  if (!env.BUCKET) {
    return new Response("R2 Bucket binding 'BUCKET' not found.", { status: 500 });
  }

  if (!key) {
    return new Response('File key missing.', { status: 400 });
  }
  // The app's own records (which events each digest carried) are not files to hand out
  if (key.startsWith('meta/')) return new Response('File not found', { status: 404 });

  try {
    const ifNoneMatch = request.headers.get('If-None-Match');
    const object = ifNoneMatch
      ? await env.BUCKET.get(key, { onlyIf: request.headers })
      : await env.BUCKET.get(key);

    if (object === null) {
      return missingFileResponse(key);
    }

    const headers = buildFileHeaders(key, object);
    if (!object.body || matchesEtag(ifNoneMatch, object.httpEtag)) {
      void object.body?.cancel().catch(() => {});
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { headers });
  } catch (err) {
    // The details stay in the logs: they can name the bucket or the storage error
    console.error('Serving a file failed:', key, err);
    return new Response('The file could not be loaded. Please try again.', { status: 500 });
  }
};

export const onRequestHead = async ({ params, env, request }: Context): Promise<Response> => {
  const key = keyOf(params);

  const page = digestPageRedirect(key, request);
  if (page) return digestRedirectResponse(page);

  if (!env.BUCKET) {
    return new Response(null, { status: 500 });
  }

  if (!key) {
    return new Response(null, { status: 400 });
  }
  if (key.startsWith('meta/')) return new Response(null, { status: 404 });

  try {
    const object = env.BUCKET.head
      ? await env.BUCKET.head(key)
      : await env.BUCKET.get(key);

    if (object === null) {
      return missingFileResponse(key);
    }
    const body = 'body' in object ? (object as StoredObject).body : undefined;
    if (body) {
      void body.cancel().catch(() => {});
    }

    const headers = buildFileHeaders(key, object);
    if (matchesEtag(request.headers.get('If-None-Match'), object.httpEtag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(null, { status: 200, headers });
  } catch (err) {
    console.error('Checking a file failed:', key, err);
    return new Response(null, { status: 500 });
  }
};

export const onRequestDelete = async ({ request, params, env }: Context): Promise<Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('File management is not set up on the server (missing Supabase keys).', 500);
  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can delete files.', 403);

  const key = keyOf(params);
  if (!key) return fail('File key missing.', 400);
  if (key.startsWith('meta/')) return fail('File not found.', 404);
  const bucket: FileBucket = env.BUCKET;
  const deleted = await deleteUnreferencedFiles(bucket, cfg, [`/api/file/${key}`]);
  return json({ deleted: deleted.length > 0 });
};
