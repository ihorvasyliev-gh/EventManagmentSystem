import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as submissions } from '../functions/api/submissions.ts';
import { onRequestPost as resetPassword } from '../functions/api/staff-password.ts';
import { onRequestGet as listStaff, onRequestPost as createStaff } from '../functions/api/staff.ts';
import { onRequestPut as upload } from '../functions/api/upload.ts';
import { mockFetch, authRoutes, json, env, fakeBucket } from './support/mockFetch.ts';

const ID = '10000000-0000-0000-0000-000000000001';
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e-flyer.png';
const draft = {
  id: ID, title: 'Coffee morning', date: '2026-11-05T10:00:00.000Z', location: 'Mahon', status: 'draft',
  tags: ['staff-submission'], poster_url: `/api/file/${KEY}`, recurrence_custom_dates: null,
  submitter_name: 'Sam', submitter_email: 'sam@x.ie'
};
const mailEnv = { ...env, RESEND_API_KEY: 'k', NOTIFY_FROM: 'CCP <c@x.ie>' };
const post = (url: string, body: unknown, token = 'admin-token') =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const mails = (calls: Array<{ url: string; body: string | null }>) =>
  calls.filter((c) => c.url.startsWith('https://api.resend.com/')).map((c) => JSON.parse(c.body!));

test('approving publishes the submission and emails the submitter', async () => {
  const calls = mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'PATCH' && url.includes('/rest/v1/events?id=in.') ? json([{ ...draft, status: 'published' }]) : undefined),
    ({ url }) => (url.startsWith('https://api.resend.com/') ? json({ id: 'm' }) : undefined)
  ]);
  const res = await submissions({ request: post('https://app.test/api/submissions', { action: 'approve', ids: [ID] }), env: mailEnv });
  assert.equal(res.status, 200);
  const patch = calls.find((c) => c.method === 'PATCH')!;
  assert.equal(JSON.parse(patch.body!).status, 'published');
  const [mail] = mails(calls);
  assert.deepEqual(mail.to, ['sam@x.ie']);
  assert.match(mail.subject, /on the CCP calendar/);
  assert.equal(mail.reply_to, 'admin@x.ie');
});

test('declining emails the reason, deletes the draft and its flyer', async () => {
  const calls = mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'GET' && url.includes('/rest/v1/events?id=in.') ? json([draft]) : undefined),
    ({ url }) => (url.includes('/rest/v1/event_attachments?event_id=in.') ? json([]) : undefined),
    ({ url, method }) => (method === 'DELETE' && url.includes('/rest/v1/events?id=in.') ? new Response(null, { status: 204 }) : undefined),
    // Nothing else uses the flyer any more
    ({ url }) => (url.includes('select=id&poster_url=eq.') || url.includes('select=id&url=eq.') ? json([]) : undefined),
    ({ url }) => (url.startsWith('https://api.resend.com/') ? json({ id: 'm' }) : undefined)
  ]);
  const bucket = fakeBucket();
  const res = await submissions({ request: post('https://app.test/api/submissions', { action: 'decline', ids: [ID], reason: 'Not a CCP event' }), env: { ...mailEnv, BUCKET: bucket } });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).declined, [ID]);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('status=eq.draft')), 'only drafts are deleted');
  assert.deepEqual(bucket.deleted, [KEY]);
  const [mail] = mails(calls);
  assert.match(mail.text, /Reason:\nNot a CCP event/);
});

test('a flyer another event still uses is kept when a submission is declined', async () => {
  mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'GET' && url.includes('/rest/v1/events?id=in.') ? json([draft]) : undefined),
    ({ url }) => (url.includes('/rest/v1/event_attachments?event_id=in.') ? json([]) : undefined),
    ({ method }) => (method === 'DELETE' ? new Response(null, { status: 204 }) : undefined),
    ({ url }) => (url.includes('select=id&poster_url=eq.') ? json([{ id: 'other' }]) : undefined),
    ({ url }) => (url.includes('select=id&url=eq.') ? json([]) : undefined)
  ]);
  const bucket = fakeBucket();
  await submissions({ request: post('https://app.test/api/submissions', { action: 'decline', ids: [ID] }), env: { ...env, BUCKET: bucket } });
  assert.deepEqual(bucket.deleted, []);
});

test('only admins review submissions', async () => {
  mockFetch(authRoutes);
  const staff = await submissions({ request: post('https://app.test/api/submissions', { action: 'approve', ids: [ID] }, 'staff-token'), env });
  assert.equal(staff.status, 403);
  const anon = await submissions({ request: post('https://app.test/api/submissions', { action: 'approve', ids: [ID] }, 'nope'), env });
  assert.equal(anon.status, 401);
  const bad = await submissions({ request: post('https://app.test/api/submissions', { action: 'approve', ids: ['not-a-uuid'] }), env });
  assert.equal(bad.status, 400);
});

test('an admin resets a password: a temporary one is set and the person must change it', async () => {
  const calls = mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'PUT' && url.endsWith(`/auth/v1/admin/users/${ID}`) ? json({ id: ID }) : undefined),
    ({ url, method }) => (method === 'PATCH' && url.includes(`/rest/v1/users?id=eq.${ID}`) ? new Response(null, { status: 204 }) : undefined)
  ]);
  const res = await resetPassword({ request: post('https://app.test/api/staff-password', { userId: ID }), env });
  assert.equal(res.status, 200);
  const { tempPassword, mustChangePassword } = await res.json();
  assert.equal(mustChangePassword, true);
  assert.equal(JSON.parse(calls.find((c) => c.method === 'PUT')!.body!).password, tempPassword);
  assert.deepEqual(JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!), { must_change_password: true });
});

test('staff cannot reset passwords, and admins use Change password for their own', async () => {
  mockFetch(authRoutes);
  assert.equal((await resetPassword({ request: post('https://app.test/api/staff-password', { userId: ID }, 'staff-token'), env })).status, 403);
  const own = await resetPassword({ request: post('https://app.test/api/staff-password', { userId: '00000000-0000-0000-0000-00000000000a' }), env });
  assert.equal(own.status, 400);
});

test('a new staff account is flagged to choose its own password', async () => {
  const calls = mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'POST' && url.endsWith('/auth/v1/admin/users') ? json({ id: ID, email: 'new@x.ie' }) : undefined),
    ({ url, method }) => (method === 'PATCH' && url.includes('/rest/v1/users?id=eq.') ? new Response(null, { status: 204 }) : undefined)
  ]);
  const res = await createStaff({ request: post('https://app.test/api/staff', { fullName: 'New Person', email: 'new@x.ie', password: 'longenough' }), env });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).mustChangePassword, true);
  assert.ok(calls.some((c) => c.method === 'PATCH'));
});

test('admins list every account; staff cannot', async () => {
  mockFetch([
    ...authRoutes,
    ({ url }) => (url.includes('/rest/v1/users?select=*') ? json([{ id: ID, email: 'a@x.ie', full_name: 'A', role: 'staff', must_change_password: true, created_at: 'x' }], 200, { 'Content-Range': '0-0/1' }) : undefined)
  ]);
  const res = await listStaff({ request: new Request('https://app.test/api/staff', { headers: { Authorization: 'Bearer admin-token' } }), env });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).staff, [{ id: ID, email: 'a@x.ie', fullName: 'A', role: 'staff', mustChangePassword: true, createdAt: 'x' }]);
  const staff = await listStaff({ request: new Request('https://app.test/api/staff', { headers: { Authorization: 'Bearer staff-token' } }), env });
  assert.equal(staff.status, 403);
});

test('/api/upload is for signed-in admins only', async () => {
  mockFetch(authRoutes);
  const form = () => {
    const f = new FormData();
    f.append('file', new File(['x'], 'a.png', { type: 'image/png' }));
    return f;
  };
  const anon = await upload({ request: new Request('https://app.test/api/upload', { method: 'PUT', body: form() }), env: { ...env, BUCKET: fakeBucket() } });
  assert.equal(anon.status, 401);
  const staff = await upload({ request: new Request('https://app.test/api/upload', { method: 'PUT', body: form(), headers: { Authorization: 'Bearer staff-token' } }), env: { ...env, BUCKET: fakeBucket() } });
  assert.equal(staff.status, 403);
  const bucket = fakeBucket();
  const admin = await upload({ request: new Request('https://app.test/api/upload', { method: 'PUT', body: form(), headers: { Authorization: 'Bearer admin-token' } }), env: { ...env, BUCKET: bucket } });
  assert.equal(admin.status, 200);
  assert.match((await admin.json()).url, /^\/api\/file\/[0-9a-f-]{36}-a\.png$/);
  assert.equal(bucket.stored.size, 1);
});
