/** Small response helpers shared by the Pages Functions */

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });

export const fail = (error: string, status: number): Response => json({ error }, status);

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
