interface Env {
  BUCKET: R2Bucket;
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

// Files are served back from the app's own origin, so only allow types that browsers
// can't execute as a page (no HTML/SVG/JS) — otherwise an upload becomes stored XSS.
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.BUCKET) {
    return new Response("R2 Bucket binding 'BUCKET' not found.", { status: 500 });
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return new Response('File is too large (max 15 MB).', { status: 413 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return new Response("No file found in request.", { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return new Response('File is too large (max 15 MB).', { status: 413 });
    }

    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return new Response('This file type is not allowed.', { status: 415 });
    }

    // Generate a unique key
    const uniqueId = crypto.randomUUID();
    const key = `${uniqueId}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType,
      },
    });

    // Files are served through the proxy at /api/file/[key]
    const url = `/api/file/${key}`;

    return new Response(JSON.stringify({
      key: key,
      url: url,
      name: file.name,
      type: contentType,
      size: file.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(`Upload failed: ${err.message}`, { status: 500 });
  }
}
