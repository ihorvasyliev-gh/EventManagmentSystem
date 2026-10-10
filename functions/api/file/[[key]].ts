/**
 * Cloudflare Pages Function — files stored in R2
 *   GET    /api/file/<key>   serve a poster or attachment
 *   DELETE /api/file/<key>   remove it (admins only; kept while any event still uses it)
 */
import { json, fail, bearerToken } from '../../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../../server/supabase.ts';
import { type FileBucket, deleteUnreferencedFiles } from '../../../server/files.ts';

interface Env extends SupabaseEnv {
  BUCKET: R2Bucket;
}

// Types that are safe to render inline; everything else is forced to download.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

const keyOf = (params: Record<string, string | string[]>): string => {
  const key = params.key;
  return Array.isArray(key) ? key.join('/') : key ?? '';
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
  const key = keyOf(params);

  if (!env.BUCKET) {
    return new Response("R2 Bucket binding 'BUCKET' not found.", { status: 500 });
  }

  if (!key) {
    return new Response("File key missing.", { status: 400 });
  }

  try {
    const object = await env.BUCKET.get(key);

    if (object === null) {
      return new Response("File not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Older uploads were not type-checked: never let a stored file run as a page on this origin.
    const contentType = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    headers.set('X-Content-Type-Options', 'nosniff');
    if (!INLINE_TYPES.has(contentType)) {
      headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
      const fileName = key.replace(/^[0-9a-f-]{36}-/i, '');
      headers.set('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    }

    // Keys contain a random UUID, so the content behind a URL never changes
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(object.body, {
      headers,
    });
  } catch (err: any) {
    return new Response(`Error retrieving file: ${err.message}`, { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, params, env }) => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('File management is not set up on the server (missing Supabase keys).', 500);
  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can delete files.', 403);

  const key = keyOf(params);
  if (!key) return fail('File key missing.', 400);
  const bucket: FileBucket = env.BUCKET;
  const deleted = await deleteUnreferencedFiles(bucket, cfg, [`/api/file/${key}`]);
  return json({ deleted: deleted.length > 0 });
};
