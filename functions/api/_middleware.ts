/**
 * Cloudflare Pages Middleware for all /api/* routes:
 *  - Catches unexpected upstream fetch / runtime errors and returns clean JSON (502/500)
 *    instead of Cloudflare HTML error pages.
 *  - Ensures X-Content-Type-Options: nosniff and Referrer-Policy: no-referrer are present
 *    on every /api/* response.
 */
import { API_SECURITY_HEADERS, fail } from '../../server/http.ts';

interface Context {
  next: () => Promise<Response>;
}

const isUpstreamError = (err: unknown): boolean =>
  err instanceof Error &&
  /supabase|fetch|timeout|network|aborted|econn|etimedout/i.test(`${err.name} ${err.message}`);

const withSecurityHeaders = (response: Response): Response => {
  const needsHeader = Object.entries(API_SECURITY_HEADERS).some(
    ([name, value]) => response.headers.get(name)?.toLowerCase() !== value.toLowerCase()
  );
  if (!needsHeader) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequest = async ({ next }: Context): Promise<Response> => {
  try {
    return withSecurityHeaders(await next());
  } catch (err) {
    console.error('Unhandled API error:', err);
    if (isUpstreamError(err)) {
      return fail('Upstream service is temporarily unavailable. Please try again.', 502);
    }
    return fail('An unexpected server error occurred. Please try again.', 500);
  }
};
