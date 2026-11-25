/**
 * Supabase access for the Pages Functions: who is calling, and service-role REST requests.
 *
 * Environment variables (Cloudflare Pages → Settings → Variables and Secrets):
 *   SUPABASE_URL / SUPABASE_ANON_KEY    (or the VITE_ ones the app is built with)
 *   SUPABASE_SERVICE_ROLE_KEY            encrypted secret; needed by every function that writes
 */

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

export type Role = 'admin' | 'staff';

export interface Caller {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export const supabaseConfig = (env: SupabaseEnv): SupabaseConfig | null => {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined };
};

const keyHeaders = (key: string): Record<string, string> => ({ apikey: key, Authorization: `Bearer ${key}` });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user id written in an access token, unverified (the auth server checks the token itself) */
export const tokenSubject = (token: string): string | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const sub = (JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { sub?: unknown }).sub;
    return typeof sub === 'string' && UUID_RE.test(sub) ? sub : null;
  } catch {
    return null;
  }
};

const FETCH_TIMEOUT_MS = 10_000;

const fetchWithTimeout = async (url: string, init: RequestInit, context: string): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`${context}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
};

/**
 * The signed-in user behind an access token, with their role, or null. The token is checked by
 * the auth server; the profile is read at the same time for the id the token names (instead of
 * one request after the other, which every function call waited for), and used only if that is
 * the id the auth server confirms.
 */
export const getCaller = async (cfg: SupabaseConfig, token: string | null): Promise<Caller | null> => {
  if (!token) return null;
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${token}` };
  // Read with the caller's own token: row-level security lets signed-in users read their own profile
  const readProfile = (id: string) =>
    fetchWithTimeout(
      `${cfg.url}/rest/v1/users?id=eq.${encodeURIComponent(id)}&select=role,full_name,email`,
      { headers },
      'Supabase profile request failed'
    );
  const claimed = tokenSubject(token);
  const [meRes, early] = await Promise.all([
    fetchWithTimeout(`${cfg.url}/auth/v1/user`, { headers }, 'Supabase auth request failed'),
    claimed ? readProfile(claimed).catch(() => null) : Promise.resolve(null)
  ]);
  if (!meRes.ok) {
    void meRes.body?.cancel().catch(() => {});
    void early?.body?.cancel().catch(() => {});
    return null;
  }
  const me = (await meRes.json()) as { id?: string; email?: string };
  if (!me.id) {
    void early?.body?.cancel().catch(() => {});
    return null;
  }
  let profileRes: Response;
  if (early && claimed === me.id) {
    profileRes = early;
  } else {
    void early?.body?.cancel().catch(() => {});
    profileRes = await readProfile(me.id);
  }
  const profile = profileRes.ok ? ((await profileRes.json()) as Array<{ role?: string; full_name?: string; email?: string }>)[0] : undefined;
  if (!profile) {
    if (!profileRes.ok) void profileRes.body?.cancel().catch(() => {});
    return null;
  }
  return {
    id: me.id,
    email: profile.email || me.email || '',
    fullName: profile.full_name || profile.email || me.email || '',
    role: profile.role === 'admin' ? 'admin' : 'staff'
  };
};

/** A PostgREST request made with the service-role key (bypasses row-level security) */
export const serviceRest = (cfg: SupabaseConfig, path: string, init: RequestInit = {}): Promise<Response> => {
  if (!cfg.serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return fetchWithTimeout(
    `${cfg.url}/rest/v1/${path}`,
    {
      ...init,
      headers: { ...keyHeaders(cfg.serviceKey), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
    },
    'Supabase REST request failed'
  );
};

/** Supabase auth admin API (service role) */
export const authAdmin = (cfg: SupabaseConfig, path: string, init: RequestInit = {}): Promise<Response> => {
  if (!cfg.serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return fetchWithTimeout(
    `${cfg.url}/auth/v1/admin/${path}`,
    {
      ...init,
      headers: { ...keyHeaders(cfg.serviceKey), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
    },
    'Supabase auth admin request failed'
  );
};

const PAGE_SIZE = 1000;

/**
 * Every row of a select, page by page. The API returns at most `max_rows` (1000 by default) per
 * request, so a single request silently drops the rest. Pages advance by what actually came back,
 * so a lower server limit still reads everything. Always requires the service-role key so missing
 * secrets fail loudly instead of silently returning empty results under anon RLS.
 */
export const selectAll = async <T>(cfg: SupabaseConfig, path: string): Promise<T[]> => {
  if (!cfg.serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  const key = cfg.serviceKey;
  const rows: T[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const res = await fetchWithTimeout(
      `${cfg.url}/rest/v1/${path}`,
      {
        headers: { ...keyHeaders(key), Range: `${rows.length}-${rows.length + PAGE_SIZE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' }
      },
      'Supabase query failed'
    );
    if (!res.ok && res.status !== 206) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    const count = Number(res.headers.get('Content-Range')?.split('/')[1]);
    total = Number.isFinite(count) ? count : rows.length + page.length + (page.length === PAGE_SIZE ? 1 : 0);
    if (page.length === 0) break;
    rows.push(...page);
  }
  return rows;
};
