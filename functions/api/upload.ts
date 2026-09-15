
interface Env {
  BUCKET: R2Bucket;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.BUCKET) {
    return new Response("R2 Bucket binding 'BUCKET' not found.", { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response("No file found in request.", { status: 400 });
    }

    // Generate a unique key
    const uniqueId = crypto.randomUUID();
    const key = `${uniqueId}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Upload to R2
    // We store the Content-Type in custom metadata or relying on the put options
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Return the URL. Since We'll Implement a Proxy at /api/file/[key]
    const url = `/api/file/${key}`;

    return new Response(JSON.stringify({ 
      key: key,
      url: url,
      name: file.name,
      type: file.type,
      size: file.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(`Upload failed: ${err.message}`, { status: 500 });
  }
}
