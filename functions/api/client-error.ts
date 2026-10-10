/**
 * Cloudflare Pages Function — errors from people's browsers
 * URL: POST /api/client-error   { message, stack?, url?, release? }
 *
 * The production build strips console output, so without this nobody hears about an error
 * unless the person emails. Reports go to the client_errors table (Supabase → Table Editor),
 * grouped: the same error on the same day only increases its count. The database function caps
 * the table's size, so a flood of fake reports can't fill it.
 */
import { fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type SupabaseEnv } from '../../server/supabase.ts';

const clip = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** Same message and first stack line = same error (numbers and ids don't make it a new one) */
export const errorFingerprint = async (message: string, stack: string | null): Promise<string> => {
  const firstFrame = stack?.split('\n').find((line) => /\bat\b|@/.test(line))?.trim() ?? '';
  const normalised = `${message}\n${firstFrame}`.replace(/\d+/g, '#');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async ({ request, env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return new Response(null, { status: 204 });
  if (Number(request.headers.get('content-length') || 0) > 16 * 1024) return fail('Too large.', 413);

  const body = await readJson<{ message?: unknown; stack?: unknown; url?: unknown; release?: unknown }>(request);
  const message = clip(body?.message, 500);
  if (!message) return fail('Invalid request.', 400);
  const stack = clip(body?.stack, 4000);
  const caller = await getCaller(cfg, bearerToken(request)).catch(() => null);

  const res = await serviceRest(cfg, 'rpc/log_client_error', {
    method: 'POST',
    body: JSON.stringify({
      p_fingerprint: await errorFingerprint(message, stack),
      p_message: message,
      p_stack: stack,
      p_url: clip(body?.url, 500),
      p_release: clip(body?.release, 40),
      p_user_agent: clip(request.headers.get('User-Agent'), 300),
      p_user_email: caller?.email ?? null
    })
  });
  if (!res.ok) console.error('Client error (not stored):', message, res.status, await res.text());
  return new Response(null, { status: 204 });
};
