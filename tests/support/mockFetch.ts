/** A fake network for the Pages Functions: Supabase auth/REST, Resend and Turnstile */

export interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
}

type Route = (call: Call) => Response | undefined;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Installs a fetch that answers the given routes (first match wins) and records every call */
export const mockFetch = (routes: Route[]): Call[] => {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = init.body === undefined || init.body === null ? null : typeof init.body === 'string' ? init.body : '[form]';
    const call: Call = { url, method: (init.method || 'GET').toUpperCase(), body, headers: { ...(init.headers as Record<string, string> | undefined) } };
    calls.push(call);
    for (const route of routes) {
      const res = route(call);
      if (res) return res;
    }
    throw new Error(`unexpected ${call.method} ${url}`);
  }) as typeof fetch;
  return calls;
};

/** Supabase answers for a caller: token "admin-token", "staff-token", or none */
export const authRoutes: Route[] = [
  ({ url, headers }) => {
    if (!url.endsWith('/auth/v1/user')) return undefined;
    const auth = headers.Authorization ?? '';
    if (auth === 'Bearer admin-token') return json({ id: '00000000-0000-0000-0000-00000000000a', email: 'admin@x.ie' });
    if (auth === 'Bearer staff-token') return json({ id: '00000000-0000-0000-0000-00000000000b', email: 'staff@x.ie' });
    return json({ msg: 'bad jwt' }, 401);
  },
  ({ url, method }) => {
    if (method !== 'GET' || !url.includes('/rest/v1/users?id=eq.')) return undefined;
    const admin = url.includes('00000000-0000-0000-0000-00000000000a');
    return json([{ role: admin ? 'admin' : 'staff', full_name: admin ? 'Ada Admin' : 'Sam Staff', email: admin ? 'admin@x.ie' : 'staff@x.ie' }]);
  }
];

export const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };

export const fakeBucket = () => {
  const stored = new Map<string, unknown>();
  const deleted: string[] = [];
  return {
    stored,
    deleted,
    put: async (key: string, value: unknown) => {
      stored.set(key, value);
      return {};
    },
    delete: async (key: string) => {
      deleted.push(key);
      stored.delete(key);
    }
  };
};
