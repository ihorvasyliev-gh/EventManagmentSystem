import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/submit.ts';
import { mockFetch, authRoutes, json, env, fakeBucket } from './support/mockFetch.ts';

const event = {
  title: 'Coffee morning',
  description: 'Tea and chats',
  date: '2026-11-05T10:00:00.000Z',
  end_date: '2026-11-05T11:30:00.000Z',
  location: 'Mahon CC',
  category: 'Community & Family',
  submitter_name: 'Sam',
  submitter_email: 'sam@x.ie'
};

const send = (fields: { event?: unknown; poster?: File; token?: string; auth?: string }) => {
  const form = new FormData();
  if (fields.event !== undefined) form.append('event', JSON.stringify(fields.event));
  if (fields.poster) form.append('poster', fields.poster);
  if (fields.token) form.append('turnstileToken', fields.token);
  return new Request('https://app.test/api/submit', {
    method: 'POST',
    body: form,
    headers: fields.auth ? { Authorization: `Bearer ${fields.auth}` } : {}
  });
};

const dbRoutes = (inserted: unknown[]) => [
  ...authRoutes,
  ({ url, method, body }: { url: string; method: string; body: string | null }) => {
    if (method === 'POST' && url.includes('/rest/v1/events')) {
      inserted.push(JSON.parse(body!));
      return json([{ id: 'new-id' }], 201);
    }
    if (url.includes('/rest/v1/users?select=email&role=eq.admin')) return json([{ email: 'admin@x.ie' }]);
    if (url.startsWith('https://api.resend.com/')) return json({ id: 'mail' });
    if (url.includes('turnstile/v0/siteverify')) return json({ success: false });
    return undefined;
  }
];

test('anyone can submit with a flyer; it is saved as a draft with the flyer, in one request', async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const calls = mockFetch(dbRoutes(inserted));
  const bucket = fakeBucket();
  const poster = new File([new Uint8Array([1, 2, 3])], 'flyer.png', { type: 'image/png' });
  const res = await onRequestPost({ request: send({ event: { ...event, publish: true }, poster }), env: { ...env, BUCKET: bucket, RESEND_API_KEY: 'k', NOTIFY_FROM: 'CCP <c@x.ie>' } });
  assert.equal(res.status, 201);
  assert.equal(inserted.length, 1);
  const row = inserted[0];
  assert.equal(row.status, 'draft', 'anonymous people cannot publish');
  assert.equal(row.creator_id, null);
  assert.deepEqual(row.tags, ['staff-submission']);
  assert.match(String(row.poster_url), /^\/api\/file\/[0-9a-f-]{36}-flyer\.png$/);
  assert.equal(bucket.stored.size, 1);
  const mail = calls.find((c) => c.url.startsWith('https://api.resend.com/'));
  assert.ok(mail, 'admins are told about the new submission');
  assert.deepEqual(JSON.parse(mail!.body!).to, ['admin@x.ie']);
  assert.equal(JSON.parse(mail!.body!).reply_to, 'sam@x.ie');
});

test('the flyer must be an image', async () => {
  mockFetch(dbRoutes([]));
  const res = await onRequestPost({ request: send({ event, poster: new File(['<html>'], 'x.html', { type: 'text/html' }) }), env: { ...env, BUCKET: fakeBucket() } });
  assert.equal(res.status, 415);
});

test('with Turnstile switched on, a submission without a valid check is refused', async () => {
  const inserted: unknown[] = [];
  mockFetch(dbRoutes(inserted));
  const res = await onRequestPost({ request: send({ event, token: 'bad' }), env: { ...env, TURNSTILE_SECRET_KEY: 'secret' } });
  assert.equal(res.status, 403);
  assert.equal(inserted.length, 0);
});

test('signed-in admins publish straight away and skip the bot check', async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const calls = mockFetch(dbRoutes(inserted));
  const res = await onRequestPost({ request: send({ event: { ...event, publish: true }, auth: 'admin-token' }), env: { ...env, TURNSTILE_SECRET_KEY: 'secret' } });
  assert.equal(res.status, 201);
  assert.equal(inserted[0].status, 'published');
  assert.equal(inserted[0].creator_id, '00000000-0000-0000-0000-00000000000a');
  assert.ok(!calls.some((c) => c.url.includes('siteverify')));
  assert.ok(!calls.some((c) => c.url.startsWith('https://api.resend.com/')), 'no "new submission" email for a published event');
});

test('staff with an account can only send drafts', async () => {
  const inserted: Array<Record<string, unknown>> = [];
  mockFetch(dbRoutes(inserted));
  await onRequestPost({ request: send({ event: { ...event, publish: true }, auth: 'staff-token' }), env });
  assert.equal(inserted[0].status, 'draft');
});

test('an invalid submission is refused with the reason', async () => {
  mockFetch(dbRoutes([]));
  const res = await onRequestPost({ request: send({ event: { ...event, submitter_email: 'nope' } }), env });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /email/);
});

test('when the event cannot be saved, the uploaded flyer is removed again', async () => {
  mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'POST' && url.includes('/rest/v1/events') ? json({ message: 'boom' }, 500) : undefined)
  ]);
  const bucket = fakeBucket();
  const res = await onRequestPost({ request: send({ event, poster: new File(['x'], 'f.jpg', { type: 'image/jpeg' }) }), env: { ...env, BUCKET: bucket } });
  assert.equal(res.status, 502);
  assert.equal(bucket.stored.size, 0);
  assert.equal(bucket.deleted.length, 1);
});

test('more contact people are saved with the event; a database without them yet still takes the event', async () => {
  const inserted: Array<Record<string, unknown>> = [];
  mockFetch(dbRoutes(inserted));
  const extra = [{ name: 'Ann', email: 'Ann@x.ie' }];
  const res = await onRequestPost({ request: send({ event: { ...event, extra_contacts: extra } }), env });
  assert.equal(res.status, 201);
  assert.deepEqual(inserted[0].extra_contacts, [{ name: 'Ann', email: 'ann@x.ie' }]);

  // Before migration 013 the column doesn't exist: the insert is refused naming it, then retried without it
  const retried: Array<Record<string, unknown>> = [];
  mockFetch([
    ({ url, method, body }: { url: string; method: string; body: string | null }) => {
      if (method !== 'POST' || !url.includes('/rest/v1/events')) return undefined;
      const row = JSON.parse(body!);
      retried.push(row);
      return 'extra_contacts' in row
        ? json({ code: 'PGRST204', message: "Could not find the 'extra_contacts' column of 'events' in the schema cache" }, 400)
        : json([{ id: 'new-id' }], 201);
    },
    ...dbRoutes([])
  ]);
  const old = await onRequestPost({ request: send({ event: { ...event, extra_contacts: extra } }), env });
  assert.equal(old.status, 201);
  assert.equal(retried.length, 2);
  assert.ok(!('extra_contacts' in retried[1]));
});
