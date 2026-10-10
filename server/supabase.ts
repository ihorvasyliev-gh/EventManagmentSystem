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

/** The signed-in user behind an access token, with their role, or null */
export const getCaller = async (cfg: SupabaseConfig, token: string | null): Promise<Caller | null> => {
  if (!token) return null;
  const meRes = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` } });
  if (!meRes.ok) return null;
  const me = (await meRes.json()) as { id?: string; email?: string };
  if (!me.id) return null;
  // Read with the caller's own token: row-level security lets signed-in users read profiles
  const profileRes = await fetch(`${cfg.url}/rest/v1/users?id=eq.${encodeURIComponent(me.id)}&select=role,full_name,email`, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}` }
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as Array<{ role?: string; full_name?: string; email?: string }>)[0] : undefined;
  if (!profile) return null;
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
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...keyHeaders(cfg.serviceKey), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
  });
};

/** Supabase auth admin API (service role) */
export const authAdmin = (cfg: SupabaseConfig, path: string, init: RequestInit = {}): Promise<Response> => {
  if (!cfg.serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return fetch(`${cfg.url}/auth/v1/admin/${path}`, {
    ...init,
    headers: { ...keyHeaders(cfg.serviceKey), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
  });
};

const PAGE_SIZE = 1000;

/**
 * Every row of a select, page by page. The API returns at most `max_rows` (1000 by default) per
 * request, so a single request silently drops the rest. Pages advance by what actually came back,
 * so a lower server limit still reads everything.
 */
export const selectAll = async <T>(cfg: SupabaseConfig, path: string): Promise<T[]> => {
  // Without the service key (not set up yet) reads fall back to what the public key may see
  const key = cfg.serviceKey || cfg.anonKey;
  const rows: T[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: { ...keyHeaders(key), Range: `${rows.length}-${rows.length + PAGE_SIZE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' }
    });
    if (!res.ok && res.status !== 206) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    const count = Number(res.headers.get('Content-Range')?.split('/')[1]);
    total = Number.isFinite(count) ? count : rows.length + page.length + (page.length === PAGE_SIZE ? 1 : 0);
    if (page.length === 0) break;
    rows.push(...page);
  }
  return rows;
};
