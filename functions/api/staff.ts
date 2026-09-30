/**
 * Cloudflare Pages Function — create a staff account (admins only)
 * URL: POST /api/staff   { fullName, email, password }
 *
 * The caller's Supabase access token (Authorization: Bearer …) must belong to an admin.
 * The account is created confirmed; the handle_new_user trigger (security-hardening-migration.sql)
 * always gives it the role 'staff'. Roles are only changed in Supabase itself.
 *
 * Required Cloudflare Pages environment variables:
 *   SUPABASE_URL              — e.g. https://xxxxx.supabase.co (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY         — the anon/public key (or VITE_SUPABASE_ANON_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY — the service_role key, stored as an encrypted secret
 */

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const fail = (error: string, status: number) => json({ error }, status);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return fail('Account creation is not set up on the server (missing Supabase keys).', 500);
  }

  // --- Who is asking? --------------------------------------------------------
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail('Please sign in again.', 401);

  const meRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!meRes.ok) return fail('Your session has expired. Please sign in again.', 401);
  const me = (await meRes.json()) as { id?: string };
  if (!me.id) return fail('Please sign in again.', 401);

  const profileRes = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(me.id)}&select=role`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as Array<{ role?: string }>)[0] : undefined;
  if (profile?.role !== 'admin') return fail('Only admins can create accounts.', 403);

  // --- Validate --------------------------------------------------------------
  let body: { fullName?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request.', 400);
  }
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!fullName) return fail('Please enter a display name.', 400);
  if (fullName.length > 120) return fail('The display name is too long.', 400);
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.', 400);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);

  // --- Create ----------------------------------------------------------------
  // No role is sent: the database trigger sets 'staff' regardless of what the request says
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
  });
  if (!createRes.ok) {
    const detail = (await createRes.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string };
    const message = detail.msg || detail.message || '';
    if (createRes.status === 422 && /already|exists|registered/i.test(message + (detail.error_code || ''))) {
      return fail('An account with this email already exists.', 409);
    }
    if (/password/i.test(message)) return fail(message, 400);
    return fail(message ? `Could not create the account: ${message}` : 'Could not create the account.', 502);
  }
  const created = (await createRes.json()) as { id?: string; email?: string };
  return json({ id: created.id, email: created.email ?? email, fullName, role: 'staff' }, 201);
};
