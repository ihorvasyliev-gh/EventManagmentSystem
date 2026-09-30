import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/staff.ts';

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };

const run = async (role: string | null, body: unknown, token: string | null = 'tok') => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(token ? { id: 'u1' } : {}), { status: token ? 200 : 401 });
    if (url.includes('/rest/v1/users')) return new Response(JSON.stringify(role ? [{ role }] : []));
    if (url.endsWith('/auth/v1/admin/users')) return new Response(JSON.stringify({ id: 'new', email: 'a@b.ie' }), { status: 200 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request('https://app.test/api/staff', { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await onRequestPost({ request, env });
  return { res, calls, json: await res.json() };
};

const valid = { fullName: 'Brenda Barry', email: 'A@B.ie', password: 'longenough' };

test('an admin creates a confirmed account without sending a role', async () => {
  const { res, calls, json } = await run('admin', valid);
  assert.equal(res.status, 201);
  assert.equal(json.role, 'staff');
  const create = calls.find((c) => c.url.endsWith('/auth/v1/admin/users'))!;
  const sent = JSON.parse(String(create.init!.body));
  assert.deepEqual(sent, { email: 'a@b.ie', password: 'longenough', email_confirm: true, user_metadata: { full_name: 'Brenda Barry' } });
});

test('staff and signed-out callers are refused', async () => {
  const staff = await run('staff', valid);
  assert.equal(staff.res.status, 403);
  assert.ok(!staff.calls.some((c) => c.url.endsWith('/auth/v1/admin/users')));
  const anon = await run(null, valid, null);
  assert.equal(anon.res.status, 401);
});

test('bad input is rejected before anything is created', async () => {
  for (const body of [{ ...valid, fullName: ' ' }, { ...valid, email: 'nope' }, { ...valid, password: 'short' }]) {
    const { res, calls } = await run('admin', body);
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => c.url.endsWith('/auth/v1/admin/users')));
  }
});
