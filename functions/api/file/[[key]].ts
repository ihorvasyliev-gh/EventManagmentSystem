
interface Env {
    BUCKET: R2Bucket;
}

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

        return new Response(object.body, {
            headers,
        });
    } catch (err: any) {
        return new Response(`Error retrieving file: ${err.message}`, { status: 500 });
    }
}
