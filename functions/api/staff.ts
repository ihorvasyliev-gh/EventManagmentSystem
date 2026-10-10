/**
 * Cloudflare Pages Function — staff accounts (admins only)
 *   GET  /api/staff                                    list every account
 *   POST /api/staff   { fullName, email, password }    create a staff account
 *
 * The caller's Supabase access token (Authorization: Bearer …) must belong to an admin.
 * New accounts are created confirmed; the handle_new_user trigger always gives them the role
 * 'staff' (roles are only changed in Supabase itself). They must choose their own password
 * the first time they sign in, so the admin never keeps knowing it.
 *
 * Required Cloudflare Pages environment variables:
 *   SUPABASE_URL              — e.g. https://xxxxx.supabase.co (or VITE_SUPABASE_URL)
 *   SUPABASE_ANON_KEY         — the anon/public key (or VITE_SUPABASE_ANON_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY — the service_role key, stored as an encrypted secret
 */
import { json, fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, authAdmin, selectAll, type SupabaseEnv, type SupabaseConfig, type Caller } from '../../server/supabase.ts';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Gate = { cfg: SupabaseConfig; caller: Caller } | { response: Response };

const adminOnly = async (request: Request, env: SupabaseEnv): Promise<Gate> => {
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return { response: fail('Account management is not set up on the server (missing Supabase keys).', 500) };
  const token = bearerToken(request);
  if (!token) return { response: fail('Please sign in again.', 401) };
  const caller = await getCaller(cfg, token);
  if (!caller) return { response: fail('Your session has expired. Please sign in again.', 401) };
  if (caller.role !== 'admin') return { response: fail('Only admins can manage accounts.', 403) };
  return { cfg, caller };
};

export interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  must_change_password?: boolean | null;
  created_at: string;
}

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async ({ request, env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
  const gate = await adminOnly(request, env);
  if ('response' in gate) return gate.response;
  try {
    const rows = await selectAll<StaffRow>(gate.cfg, 'users?select=*&order=full_name.asc');
    return json({
      staff: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        mustChangePassword: !!u.must_change_password,
        createdAt: u.created_at
      }))
    });
  } catch (err) {
    console.error('Listing staff failed:', err);
    return fail('Could not load the staff list.', 502);
  }
};

export const onRequestPost = async ({ request, env }: { request: Request; env: SupabaseEnv }): Promise<Response> => {
  const gate = await adminOnly(request, env);
  if ('response' in gate) return gate.response;
  const { cfg } = gate;

  // --- Validate --------------------------------------------------------------
  const body = await readJson<{ fullName?: unknown; email?: unknown; password?: unknown }>(request);
  if (!body) return fail('Invalid request.', 400);
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!fullName) return fail('Please enter a display name.', 400);
  if (fullName.length > 120) return fail('The display name is too long.', 400);
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.', 400);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);

  // --- Create ----------------------------------------------------------------
  // No role is sent: the database trigger sets 'staff' regardless of what the request says
  const createRes = await authAdmin(cfg, 'users', {
    method: 'POST',
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

  // The person picks their own password at their first sign-in
  let mustChangePassword = false;
  if (created.id) {
    const flag = await serviceRest(cfg, `users?id=eq.${encodeURIComponent(created.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ must_change_password: true })
    });
    mustChangePassword = flag.ok;
  }
  return json({ id: created.id, email: created.email ?? email, fullName, role: 'staff', mustChangePassword }, 201);
};
