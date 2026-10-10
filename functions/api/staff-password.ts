/**
 * Cloudflare Pages Function — reset a member of staff's password (admins only)
 * URL: POST /api/staff-password   { userId }
 *
 * For someone who forgot their password: it is replaced with a temporary one, returned once
 * to the admin to pass on. At their next sign-in (with the temporary password) the app makes
 * them choose a new one, so the admin doesn't keep knowing it.
 */
import { json, fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, authAdmin, type SupabaseEnv } from '../../server/supabase.ts';
import { generateTempPassword } from '../../server/password.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async ({ request, env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('Account management is not set up on the server (missing Supabase keys).', 500);
  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can reset passwords.', 403);

  const body = await readJson<{ userId?: unknown }>(request);
  const userId = typeof body?.userId === 'string' && UUID_RE.test(body.userId) ? body.userId : null;
  if (!userId) return fail('Invalid request.', 400);
  if (userId === caller.id) return fail('To change your own password, use “Change password” in your account menu.', 400);

  const tempPassword = generateTempPassword();
  const res = await authAdmin(cfg, `users/${userId}`, { method: 'PUT', body: JSON.stringify({ password: tempPassword }) });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { msg?: string; message?: string };
    if (res.status === 404) return fail('That account no longer exists.', 404);
    return fail(`Could not reset the password${detail.msg || detail.message ? `: ${detail.msg || detail.message}` : '.'}`, 502);
  }

  const flag = await serviceRest(cfg, `users?id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ must_change_password: true }) });
  if (!flag.ok) {
    // The password works either way; without the flag they just aren't asked to change it
    console.error('Setting must_change_password failed:', flag.status, await flag.text());
  }
  return json({ tempPassword, mustChangePassword: flag.ok });
};
