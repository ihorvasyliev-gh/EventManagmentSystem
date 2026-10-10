/**
 * Cloudflare Pages Function — upload a poster or attachment to R2 (admins only)
 * URL: PUT /api/upload   multipart: file
 *
 * The public /submit form doesn't use this: it sends its flyer with the event to /api/submit.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, type SupabaseEnv } from '../../server/supabase.ts';
import { type FileBucket, ALLOWED_TYPES, MAX_UPLOAD_BYTES, storeFile } from '../../server/files.ts';

interface Env extends SupabaseEnv {
  BUCKET?: FileBucket;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPut = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('Uploads are not set up on the server (missing Supabase keys).', 500);

  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Please sign in again to upload files.', 401);
  if (caller.role !== 'admin') return fail('Only admins can upload files here.', 403);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) return fail('File is too large (max 15 MB).', 413);

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') return fail('No file found in request.', 400);
    if (file.size > MAX_UPLOAD_BYTES) return fail('File is too large (max 15 MB).', 413);
    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return fail('This file type is not allowed.', 415);

    return json(await storeFile(env.BUCKET, file, contentType));
  } catch (err) {
    console.error('Upload failed:', err);
    return fail('Upload failed. Please try again.', 500);
  }
};
