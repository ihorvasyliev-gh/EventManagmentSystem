interface Env {
    BUCKET: R2Bucket;
}

// Types that are safe to render inline; everything else is forced to download.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { params, env } = context;
    const key = Array.isArray(params.key) ? params.key.join('/') : params.key;

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
}
