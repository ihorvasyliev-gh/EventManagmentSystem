/**
 * Cloudflare Pages Function — errors from people's browsers
 * URL: POST /api/client-error   { message, stack?, url?, release? }
 *
 * The production build strips console output, so without this nobody hears about an error
 * unless the person emails. Reports go to the client_errors table (Supabase → Table Editor),
 * grouped: the same error on the same day only increases its count. The database function caps
 * the table's size, so a flood of fake reports can't fill it.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type SupabaseEnv } from '../../server/supabase.ts';
import { CLIENT_ERROR_LIMIT, withinRateLimit } from '../../server/rateLimit.ts';

const MAX_BODY_BYTES = 16 * 1024;

const clip = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** Reads request body text enforcing an actual byte cap even when Content-Length is missing or spoofed */
const readLimitedText = async (request: Request, maxBytes: number): Promise<string | null> => {
  if (!request.body) {
    const text = await request.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
};

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

  if (!(await withinRateLimit(cfg, CLIENT_ERROR_LIMIT, request.headers.get('CF-Connecting-IP')))) {
    return json(
      { error: 'Too many error reports.' },
      429,
      { 'Retry-After': String(CLIENT_ERROR_LIMIT.windowSeconds) }
    );
  }

  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return fail('Too large.', 413);

  const raw = await readLimitedText(request, MAX_BODY_BYTES);
  if (raw === null) return fail('Too large.', 413);

  let body: { message?: unknown; stack?: unknown; url?: unknown; release?: unknown } | null;
  try {
    body = JSON.parse(raw) as { message?: unknown; stack?: unknown; url?: unknown; release?: unknown };
  } catch {
    return fail('Invalid request.', 400);
  }

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
