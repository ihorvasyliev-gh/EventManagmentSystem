/** Small response helpers shared by the Pages Functions */

export const API_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...API_SECURITY_HEADERS,
      ...headers
    }
  });

export const textResponse = (text: string, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...API_SECURITY_HEADERS,
      ...headers
    }
  });

export const fail = (error: string, status: number): Response => json({ error }, status);

/** Cloudflare Workers default edge cache when running on Cloudflare, or null in Node tests */
export const edgeCache = (): { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } | null => {
  const globalCaches = (globalThis as { caches?: { default?: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } } }).caches;
  return globalCaches?.default ?? null;
};

/** The access token from an `Authorization: Bearer …` header */
export const bearerToken = (request: Request): string | null =>
  request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

/** Reads a JSON body, or null when it isn't valid JSON */
export const readJson = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};
