import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as calendarGet } from '../functions/api/calendar.ts';
import { onRequestGet as publishedEventsGet } from '../functions/api/published-events.ts';
import { onRequestPost as clientErrorPost } from '../functions/api/client-error.ts';
import { onRequestGet as fileGet, onRequestHead as fileHead, onRequestDelete as fileDelete } from '../functions/api/file/[[key]].ts';
import { onRequest as apiMiddleware } from '../functions/api/_middleware.ts';
import { onRequestGet as submitPageGet, withSubmitMeta, SUBMIT_TITLE } from '../functions/submit.ts';
import { onRequestGet as digestPageGet, withDigestMeta, digestPeriodFromPath } from '../functions/digest/[[slug]].ts';
import { onRequestPost as submissionsPost } from '../functions/api/submissions.ts';
import { onRequestPost as editEventPost } from '../functions/api/edit-event.ts';
import { onRequestPost as digestPost } from '../functions/api/digest.ts';
import { onRequestGet as digestVersionsGet } from '../functions/api/digest-versions.ts';
import { selectAll, getCaller } from '../server/supabase.ts';
import { expandRecurring, type FeedEvent } from '../server/feed.ts';
import { normalizeFileName, deleteUnreferencedFiles, type FileBucket } from '../server/files.ts';
import { ISSUES_KEY, readIssues, recordIssue, type IssueBucket, type IssuePutOptions } from '../server/digestIssues.ts';
import { hashIp } from '../server/rateLimit.ts';
import { sendEmailBatch } from '../server/email.ts';
import { mockFetch, authRoutes, json, env } from './support/mockFetch.ts';

const ID1 = '10000000-0000-0000-0000-000000000001';
const ID2 = '10000000-0000-0000-0000-000000000002';
const KEY1 = '0f8fad5b-d9cb-469f-a165-70867728950e-one.png';
const KEY2 = '1f8fad5b-d9cb-469f-a165-70867728950e-two.png';
const KEY3 = '2f8fad5b-d9cb-469f-a165-70867728950e-three.png';

const noServiceEnv = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon' };
const page = (rows: unknown[]) => json(rows, 200, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });

const baseFeedEvent: Omit<FeedEvent, 'id' | 'date' | 'recurrence_type'> = {
  title: 'Daily Standup',
  description: null,
  end_date: null,
  location: 'Heron House',
  status: 'published',
  category: 'Community & Family',
  recurrence_interval: null,
  recurrence_end_date: null,
  recurrence_occurrences: null,
  recurrence_days_of_week: null,
  recurrence_custom_dates: null,
  recurrence_custom_end_dates: null,
  recurrence_custom_locations: null,
  created_at: '2020-01-01T00:00:00.000Z'
};

test('missing serviceKey: /api/calendar returns 503 Retry-After, /api/published-events returns 500, selectAll throws', async () => {
  const calRes = await calendarGet({ request: new Request('https://app.test/api/calendar'), env: noServiceEnv });
  assert.equal(calRes.status, 503);
  assert.equal(calRes.headers.get('Retry-After'), '300');
  assert.equal(calRes.headers.get('Cache-Control'), 'no-store');
  assert.equal(calRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(calRes.headers.get('Referrer-Policy'), 'no-referrer');

  const pubRes = await publishedEventsGet({ request: new Request('https://app.test/api/published-events'), env: noServiceEnv });
  assert.equal(pubRes.status, 500);
  assert.equal(pubRes.headers.get('Content-Type'), 'application/json');

  await assert.rejects(
    () => selectAll({ url: 'https://sb.test', anonKey: 'anon' }, 'events?select=id'),
    /SUPABASE_SERVICE_ROLE_KEY/
  );
});

test('/api/calendar skips recurrence_exceptions when no recurring events exist and filters by recurring IDs otherwise', async () => {
  const nonRecurring = {
    ...baseFeedEvent,
    id: ID1,
    date: new Date(Date.now() + 86400_000).toISOString(),
    recurrence_type: 'none'
  };
  const calls1 = mockFetch([
    ({ url }) => (url.includes('/rest/v1/events?') ? page([nonRecurring]) : undefined)
  ]);
  const res1 = await calendarGet({ request: new Request('https://app.test/api/calendar'), env });
  assert.equal(res1.status, 200);
  assert.ok(!calls1.some((c) => c.url.includes('recurrence_exceptions')), 'no exceptions query without recurring events');

  const recurring = {
    ...baseFeedEvent,
    id: ID2,
    date: new Date(Date.now() + 86400_000).toISOString(),
    recurrence_type: 'weekly'
  };
  const calls2 = mockFetch([
    ({ url }) => (url.includes('/rest/v1/events?') ? page([nonRecurring, recurring]) : undefined),
    ({ url }) => (url.includes('/rest/v1/recurrence_exceptions?') ? page([]) : undefined)
  ]);
  const res2 = await calendarGet({ request: new Request('https://app.test/api/calendar'), env });
  assert.equal(res2.status, 200);
  const excCall = calls2.find((c) => c.url.includes('recurrence_exceptions'));
  assert.ok(excCall, 'exceptions queried when recurring events exist');
  assert.ok(excCall!.url.includes(`event_id=in.(${ID2})`), 'filtered to recurring event IDs only');
  assert.ok(!excCall!.url.includes(ID1), 'non-recurring ID excluded');
});

test('POST /api/client-error enforces rate limit and actual 16 KB body size cap', async () => {
  // Rate limited before reading or inserting
  const limitedCalls = mockFetch([
    ({ url, method }) => (method === 'POST' && url.endsWith('/rpc/hit_rate_limit') ? json(false) : undefined)
  ]);
  const limited = await clientErrorPost({
    request: new Request('https://app.test/api/client-error', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.5' },
      body: JSON.stringify({ message: 'boom' })
    }),
    env
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '900');
  const limitReq = limitedCalls.find((c) => c.url.endsWith('/rpc/hit_rate_limit'));
  assert.ok(limitReq);
  assert.match(JSON.parse(limitReq!.body!).p_bucket, /^client_error:[0-9a-f]{32}$/);
  assert.ok(!limitedCalls.some((c) => c.url.endsWith('/rpc/log_client_error')));

  // Actual body > 16 KB rejected even without Content-Length header
  const bigStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: 'x'.repeat(20_000) })));
      controller.close();
    }
  });
  const bigCalls = mockFetch([
    ({ url, method }) => (method === 'POST' && url.endsWith('/rpc/hit_rate_limit') ? json(true) : undefined)
  ]);
  const tooBig = await clientErrorPost({
    request: new Request('https://app.test/api/client-error', {
      method: 'POST',
      body: bigStream,
      // @ts-expect-error duplex is required by Node fetch for streaming Request bodies
      duplex: 'half'
    }),
    env
  });
  assert.equal(tooBig.status, 413);
  assert.ok(!bigCalls.some((c) => c.url.endsWith('/rpc/log_client_error')));

  // Valid report succeeds
  const okCalls = mockFetch([
    ({ url, method }) => (method === 'POST' && url.endsWith('/rpc/hit_rate_limit') ? json(true) : undefined),
    ({ url, method }) => (method === 'POST' && url.endsWith('/rpc/log_client_error') ? new Response(null, { status: 204 }) : undefined)
  ]);
  const okRes = await clientErrorPost({
    request: new Request('https://app.test/api/client-error', {
      method: 'POST',
      body: JSON.stringify({ message: 'Real error', stack: 'Error: x\n at fn (a.js:1:2)' })
    }),
    env
  });
  assert.equal(okRes.status, 204);
  assert.ok(okCalls.some((c) => c.url.endsWith('/rpc/log_client_error')));
});

test('/api/file/[[key]]: HEAD, GET 304, meta/ block, X-Robots-Tag: noindex, 302 Vary/Cache-Control, and DELETE', async () => {
  let headCalls = 0;
  let getCalls = 0;
  const deletedKeys: string[] = [];
  const makeBucket = () => ({
    put: async () => ({}),
    delete: async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) deletedKeys.push(k);
    },
    head: async (key: string) => {
      headCalls++;
      if (key !== KEY1) return null;
      return {
        httpEtag: '"etag-1"',
        size: 1234,
        writeHttpMetadata: (h: Headers) => h.set('content-type', 'image/png')
      };
    },
    get: async (key: string) => {
      getCalls++;
      if (key !== KEY1) return null;
      return {
        body: new Blob(['png-bytes']).stream(),
        httpEtag: '"etag-1"',
        size: 9,
        writeHttpMetadata: (h: Headers) => h.set('content-type', 'image/png')
      };
    }
  });

  // HEAD uses bucket.head, returns metadata and no body
  const headRes = await fileHead({
    params: { key: [KEY1] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${KEY1}`, { method: 'HEAD' })
  });
  assert.equal(headRes.status, 200);
  assert.equal(headCalls, 1);
  assert.equal(getCalls, 0);
  assert.equal(headRes.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(headRes.headers.get('Content-Length'), '1234');
  assert.equal(await headRes.text(), '');

  // HEAD with matching If-None-Match returns 304
  const head304 = await fileHead({
    params: { key: [KEY1] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${KEY1}`, { method: 'HEAD', headers: { 'If-None-Match': '"etag-1"' } })
  });
  assert.equal(head304.status, 304);

  // GET returns X-Robots-Tag: noindex
  const get200 = await fileGet({
    params: { key: [KEY1] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${KEY1}`)
  });
  assert.equal(get200.status, 200);
  assert.equal(get200.headers.get('X-Robots-Tag'), 'noindex');
  assert.equal(get200.headers.get('Referrer-Policy'), 'no-referrer');

  // GET with matching If-None-Match returns 304 without body
  const get304 = await fileGet({
    params: { key: [KEY1] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${KEY1}`, { headers: { 'If-None-Match': '"etag-1"' } })
  });
  assert.equal(get304.status, 304);
  assert.equal(await get304.text(), '');

  // meta/ blocked on GET, HEAD, DELETE
  assert.equal((await fileGet({
    params: { key: ['meta', 'digest-issues.json'] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request('https://app.test/api/file/meta/digest-issues.json')
  })).status, 404);
  assert.equal((await fileHead({
    params: { key: ['meta', 'digest-issues.json'] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request('https://app.test/api/file/meta/digest-issues.json', { method: 'HEAD' })
  })).status, 404);

  mockFetch(authRoutes);
  assert.equal((await fileDelete({
    params: { key: ['meta', 'digest-issues.json'] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request('https://app.test/api/file/meta/digest-issues.json', { method: 'DELETE', headers: { Authorization: 'Bearer admin-token' } })
  })).status, 404);

  // Digest 302 redirect includes Vary + Cache-Control: private, no-store
  const digestKey = `digests/${ID1}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf`;
  const redir = await fileGet({
    params: { key: digestKey.split('/') },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${digestKey}`, { headers: { 'Sec-Fetch-Dest': 'document' } })
  });
  assert.equal(redir.status, 302);
  assert.equal(redir.headers.get('Vary'), 'Sec-Fetch-Dest, Accept');
  assert.equal(redir.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(redir.headers.get('X-Robots-Tag'), 'noindex');

  // DELETE by admin removes unreferenced file and its poster variants
  mockFetch([
    ...authRoutes,
    ({ url }) => (url.includes('select=poster_url&poster_url=in.') || url.includes('select=url&url=in.') ? json([]) : undefined)
  ]);
  const delRes = await fileDelete({
    params: { key: [KEY1] },
    env: { ...env, BUCKET: makeBucket() },
    request: new Request(`https://app.test/api/file/${KEY1}`, { method: 'DELETE', headers: { Authorization: 'Bearer admin-token' } })
  });
  assert.equal(delRes.status, 200);
  assert.deepEqual(await delRes.json(), { deleted: true });
  assert.deepEqual(deletedKeys, [KEY1, `${KEY1}.screen.jpg`, `${KEY1}.thumb.jpg`]);
});

test('functions/api/_middleware.ts catches errors as JSON and enforces security headers', async () => {
  const upstreamErr = await apiMiddleware({
    next: async () => { throw new Error('Supabase REST request failed: fetch timeout'); }
  });
  assert.equal(upstreamErr.status, 502);
  assert.equal(upstreamErr.headers.get('Content-Type'), 'application/json');
  assert.equal(upstreamErr.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(upstreamErr.headers.get('Referrer-Policy'), 'no-referrer');

  const runtimeErr = await apiMiddleware({
    next: async () => { throw new Error('unexpected bug'); }
  });
  assert.equal(runtimeErr.status, 500);
  assert.equal(runtimeErr.headers.get('Content-Type'), 'application/json');

  const plain = await apiMiddleware({
    next: async () => new Response('ok', { status: 200 })
  });
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(plain.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(await plain.text(), 'ok');
});

test('server/feed.ts expands daily series >1000 days old and includes multi-day events overlapping rangeStart', () => {
  const rangeStart = new Date('2026-06-01T00:00:00.000Z');
  const rangeEnd = new Date('2026-06-10T23:59:59.000Z');

  // Started >2000 days before rangeStart
  const oldDaily: FeedEvent = {
    ...baseFeedEvent,
    id: 'old-daily',
    date: '2020-01-01T10:00:00.000Z',
    end_date: '2020-01-01T11:00:00.000Z',
    recurrence_type: 'daily',
    recurrence_interval: 1
  };
  // Multi-day one-off starting 2 days before rangeStart and ending 2 days after rangeStart
  const multiDayOneOff: FeedEvent = {
    ...baseFeedEvent,
    id: 'multi-one',
    date: '2026-05-30T09:00:00.000Z',
    end_date: '2026-06-03T17:00:00.000Z',
    recurrence_type: 'none'
  };
  // Weekly 3-day event whose occurrence starts May 30 and ends June 2 (overlapping June 1 rangeStart)
  const multiDayWeekly: FeedEvent = {
    ...baseFeedEvent,
    id: 'multi-weekly',
    date: '2026-05-16T09:00:00.000Z',
    end_date: '2026-05-19T17:00:00.000Z',
    recurrence_type: 'weekly',
    recurrence_interval: 1
  };

  const expanded = expandRecurring([oldDaily, multiDayOneOff, multiDayWeekly], rangeStart, rangeEnd);
  const dailyHits = expanded.filter((e) => e.id.startsWith('old-daily_'));
  assert.equal(dailyHits.length, 10, 'all 10 days in June 1..10 emitted despite >2300 days since series start');

  assert.ok(expanded.some((e) => e.id === 'multi-one'), 'multi-day one-off overlapping rangeStart is included');

  const weeklyHits = expanded.filter((e) => e.id.startsWith('multi-weekly_'));
  assert.ok(
    weeklyHits.some((e) => e.date.startsWith('2026-05-30')),
    'multi-day recurring occurrence starting before rangeStart and ending inside range is included'
  );
});

test('functions/submit.ts and functions/digest/[[slug]].ts inject OG/Twitter metadata', async () => {
  const HTML = '<html><head><meta name="description" content="Default" /><title>CCP Event Calendar</title></head><body></body></html>';

  const submitHtml = withSubmitMeta(HTML, 'https://cal.test');
  assert.match(submitHtml, new RegExp(`<title>${SUBMIT_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
  assert.match(submitHtml, /<meta property="og:url" content="https:\/\/cal\.test\/submit" \/>/);
  assert.match(submitHtml, /<meta name="twitter:card" content="summary" \/>/);

  const submitRes = await submitPageGet({
    request: new Request('https://cal.test/submit'),
    next: async () => new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '99' } })
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.headers.get('Content-Length'), null);
  assert.match(await submitRes.text(), /Submit an event · Cork City Partnership/);

  const digestPath = `/digest/${ID1}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26`;
  assert.equal(digestPeriodFromPath(digestPath), '12 – 26 October 2026');
  assert.equal(digestPeriodFromPath('/digest/not-a-valid-slug'), null);

  const digestHtml = withDigestMeta(HTML, new URL(`https://cal.test${digestPath}`));
  assert.match(digestHtml, /<title>Upcoming Events Digest \(12 – 26 October 2026\) · Cork City Partnership<\/title>/);
  assert.match(digestHtml, /<meta property="og:title" content="Upcoming Events Digest \(12 – 26 October 2026\) · Cork City Partnership" \/>/);
  assert.match(digestHtml, /<meta property="og:description" content="Cork City Partnership upcoming community events for 12 – 26 October 2026/);
  assert.match(digestHtml, /<meta name="twitter:card" content="summary" \/>/);

  const digestRes = await digestPageGet({
    request: new Request(`https://cal.test${digestPath}`),
    next: async () => new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  });
  assert.equal(digestRes.status, 200);
  assert.equal(digestRes.headers.get('X-Robots-Tag'), 'noindex');
  assert.match(await digestRes.text(), /12 – 26 October 2026/);

  // Non-HTML passthrough
  const asset = new Response('js', { headers: { 'Content-Type': 'application/javascript' } });
  assert.equal(await submitPageGet({ request: new Request('https://cal.test/submit'), next: async () => asset }), asset);
  assert.equal(await digestPageGet({ request: new Request(`https://cal.test${digestPath}`), next: async () => asset }), asset);
});

test('server/files.ts: normalizeFileName and batched deleteUnreferencedFiles (2 queries total + batch R2 delete)', async () => {
  assert.equal(normalizeFileName(''), 'file');
  assert.equal(normalizeFileName('...'), 'file');
  assert.equal(normalizeFileName('___'), 'file');
  const longName = `${'a'.repeat(200)}.png`;
  const normalized = normalizeFileName(longName);
  assert.equal(normalized.length, 120);
  assert.ok(normalized.endsWith('.png'));

  // 3 candidate URLs: KEY2 is referenced in events, KEY1 and KEY3 are unreferenced
  const calls = mockFetch([
    ({ url }) => (url.includes('events?select=poster_url&poster_url=in.') ? json([{ poster_url: `/api/file/${KEY2}` }]) : undefined),
    ({ url }) => (url.includes('event_attachments?select=url&url=in.') ? json([]) : undefined)
  ]);
  const deleteCalls: Array<string | string[]> = [];
  const bucket: FileBucket = {
    put: async () => ({}),
    delete: async (k) => { deleteCalls.push(k); }
  };

  const deleted = await deleteUnreferencedFiles(
    bucket,
    { url: 'https://sb.test', anonKey: 'anon', serviceKey: 'service' },
    [`/api/file/${KEY1}`, `/api/file/${KEY2}`, `/api/file/${KEY3}`, 'https://external.example/x.png', null]
  );

  assert.deepEqual(deleted, [KEY1, KEY3]);
  assert.equal(calls.length, 2, 'only 2 batched Supabase queries total regardless of URL count');
  assert.equal(deleteCalls.length, 1, 'single batch R2 delete call');
  assert.deepEqual(deleteCalls[0], [
    KEY1, `${KEY1}.screen.jpg`, `${KEY1}.thumb.jpg`,
    KEY3, `${KEY3}.screen.jpg`, `${KEY3}.thumb.jpg`
  ]);

  // Fallback when bucket throws on array delete
  mockFetch([
    ({ url }) => (url.includes('events?select=poster_url&poster_url=in.') ? json([]) : undefined),
    ({ url }) => (url.includes('event_attachments?select=url&url=in.') ? json([]) : undefined)
  ]);
  const singleDeletes: string[] = [];
  const stringOnlyBucket: FileBucket = {
    put: async () => ({}),
    delete: async (k) => {
      if (Array.isArray(k)) throw new TypeError('arrays not supported');
      singleDeletes.push(k);
    }
  };
  await deleteUnreferencedFiles(
    stringOnlyBucket,
    { url: 'https://sb.test', anonKey: 'anon', serviceKey: 'service' },
    [`/api/file/${KEY1}`]
  );
  assert.deepEqual(singleDeletes, [KEY1, `${KEY1}.screen.jpg`, `${KEY1}.thumb.jpg`]);
});

test('server/digestIssues.ts: corrupt JSON throws instead of wiping history, and recordIssue retries conditional put conflicts', async () => {
  let raw: string | null = '{corrupt json';
  const etag = 'v1';
  let putCount = 0;
  const corruptBucket: IssueBucket = {
    get: async (key) => (key === ISSUES_KEY && raw !== null ? { text: async () => raw!, etag } : null),
    put: async (_key, value) => {
      putCount++;
      raw = await (value as Blob).text();
      return {};
    },
    delete: async () => {}
  };

  await assert.rejects(() => readIssues(corruptBucket));
  await assert.rejects(() => recordIssue(corruptBucket, { issued: '2026-10-16', ids: ['a'] }));
  assert.equal(putCount, 0, 'corrupt file must never be overwritten');

  // Conditional put conflict retry: attempt 1 sees conflict (returns null), attempt 2 merges concurrent write and succeeds
  let stored = JSON.stringify([{ issued: '2026-10-09', ids: ['old'] }]);
  let version = 1;
  const seenOnlyIf: Array<IssuePutOptions['onlyIf']> = [];
  let simulatedConflict = true;
  const concurrentBucket: IssueBucket = {
    get: async (key) => (key === ISSUES_KEY ? { text: async () => stored, etag: `v${version}` } : null),
    put: async (_key, value, options) => {
      seenOnlyIf.push(options?.onlyIf);
      if (simulatedConflict) {
        simulatedConflict = false;
        // Another writer updated the object before our put landed
        stored = JSON.stringify([
          { issued: '2026-10-09', ids: ['old'] },
          { issued: '2026-10-16', ids: ['concurrent'] }
        ]);
        version++;
        return null; // R2 precondition failure
      }
      if (options?.onlyIf?.etagMatches !== `v${version}`) return null;
      stored = await (value as Blob).text();
      version++;
      return { etag: `v${version}` };
    },
    delete: async () => {}
  };

  await recordIssue(concurrentBucket, { issued: '2026-10-16', ids: ['mine'] });
  assert.deepEqual(seenOnlyIf, [{ etagMatches: 'v1' }, { etagMatches: 'v2' }]);
  const finalIssues = await readIssues(concurrentBucket);
  assert.deepEqual(finalIssues, [
    { issued: '2026-10-09', ids: ['old'] },
    { issued: '2026-10-16', ids: ['concurrent', 'mine'] }
  ]);
});

test('server/rateLimit.ts uses keyed HMAC-SHA256 instead of unsalted SHA-256', async () => {
  const h1 = await hashIp('203.0.113.7', 'secret-a');
  const h2 = await hashIp('203.0.113.7', 'secret-b');
  assert.match(h1, /^[0-9a-f]{32}$/);
  assert.notEqual(h1, h2, 'different secrets yield different hashes for the same IP');
  const unsalted = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('203.0.113.7'))).slice(0, 16),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
  assert.notEqual(h1, unsalted);
});

test('sendEmailBatch uses /emails/batch for multiple messages and submissions.ts schedules cleanup via waitUntil', async () => {
  const calls = mockFetch([
    ({ url }) => (url === 'https://api.resend.com/emails/batch' ? json({ data: [{ id: '1' }, { id: '2' }] }) : undefined)
  ]);
  const mailEnv = { RESEND_API_KEY: 'k', NOTIFY_FROM: 'CCP <c@x.ie>' };
  const ok = await sendEmailBatch(mailEnv, [
    { to: ['a@x.ie'], subject: 'One', text: 'Hi A' },
    { to: ['b@x.ie'], subject: 'Two', text: 'Hi B' }
  ]);
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails/batch');
  assert.equal((JSON.parse(calls[0].body!) as unknown[]).length, 2);

  // submissions.ts decline schedules deleteUnreferencedFiles via waitUntil
  const waitTasks: Promise<unknown>[] = [];
  mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'GET' && url.includes('/rest/v1/events?id=in.') ? json([
      { id: ID1, title: 'A', date: '2026-11-05T10:00:00Z', location: 'M', status: 'draft', tags: ['staff-submission'], poster_url: `/api/file/${KEY1}`, recurrence_custom_dates: null, submitter_name: 'A', submitter_email: 'a@x.ie' }
    ]) : undefined),
    ({ url }) => (url.includes('/rest/v1/event_attachments?event_id=in.') ? json([]) : undefined),
    ({ method }) => (method === 'DELETE' ? new Response(null, { status: 204 }) : undefined),
    ({ url }) => (url.includes('select=poster_url&poster_url=in.') || url.includes('select=url&url=in.') ? json([]) : undefined)
  ]);
  const deleted: string[] = [];
  const res = await submissionsPost({
    request: new Request('https://app.test/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ action: 'decline', ids: [ID1] })
    }),
    env: {
      ...env,
      BUCKET: {
        put: async () => ({}),
        delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) deleted.push(x); }
      }
    },
    waitUntil: (p) => { waitTasks.push(p); }
  });
  assert.equal(res.status, 200);
  assert.ok(waitTasks.length >= 1, 'background cleanup scheduled via waitUntil');
  await Promise.all(waitTasks);
  assert.deepEqual(deleted, [KEY1, `${KEY1}.screen.jpg`, `${KEY1}.thumb.jpg`]);
});

test('POST /api/edit-event rejects missing or invalid base_updated_at with 400 when stored.updated_at is present', async () => {
  const stored = {
    id: ID1,
    title: 'Coffee',
    description: 'Tea',
    date: '2026-11-05T10:00:00.000Z',
    end_date: '2026-11-05T11:00:00.000Z',
    location: 'Mahon',
    poster_url: null,
    status: 'published',
    category: 'Community & Family',
    tags: ['staff-submission'],
    recurrence_type: 'none',
    recurrence_interval: null,
    recurrence_end_date: null,
    recurrence_occurrences: null,
    recurrence_days_of_week: null,
    recurrence_custom_dates: null,
    recurrence_custom_end_dates: null,
    recurrence_custom_locations: null,
    submitter_name: 'Sam',
    submitter_email: 'sam@x.ie',
    extra_contacts: [],
    creator_id: '00000000-0000-0000-0000-00000000000b',
    updated_at: '2026-10-14T12:00:00.000Z'
  };
  mockFetch([
    ...authRoutes,
    ({ url, method }) => (method === 'GET' && url.includes(`/rest/v1/events?id=eq.${ID1}`) ? json([stored]) : undefined)
  ]);
  const makeReq = (base_updated_at?: unknown) => {
    const fd = new FormData();
    fd.append('event', JSON.stringify({
      id: ID1,
      title: 'Coffee updated',
      description: 'Tea',
      date: stored.date,
      end_date: stored.end_date,
      location: stored.location,
      category: stored.category,
      recurrence_type: 'none',
      submitter_name: 'Sam',
      submitter_email: 'sam@x.ie',
      keep_poster: false,
      ...(base_updated_at !== undefined ? { base_updated_at } : {})
    }));
    return new Request('https://app.test/api/edit-event', {
      method: 'POST',
      body: fd,
      headers: { Authorization: 'Bearer staff-token' }
    });
  };
  assert.equal((await editEventPost({ request: makeReq(), env })).status, 400);
  assert.equal((await editEventPost({ request: makeReq('not-a-date'), env })).status, 400);
});

test('/api/digest enforces .pdf suffix & length cap; /api/digest-versions sets SWR Cache-Control and tolerates corrupt issues file', async () => {
  mockFetch(authRoutes);
  const storedKeys: string[] = [];
  const bucket = {
    put: async (key: string) => { storedKeys.push(key); return {}; },
    get: async () => ({ text: async () => '{corrupt' }),
    delete: async () => {},
    list: async () => ({ objects: [{ key: `digests/${ID1}-ok.pdf`, uploaded: new Date('2026-10-16T10:00:00Z') }], truncated: false })
  };

  const form = new FormData();
  form.append('file', new File(['%PDF-1.4\n'], 'a'.repeat(160), { type: 'application/pdf' }));
  const res = await digestPost({
    request: new Request('https://app.test/api/digest', { method: 'POST', body: form, headers: { Authorization: 'Bearer admin-token' } }),
    env: { ...env, BUCKET: bucket }
  });
  assert.equal(res.status, 201);
  const { url } = (await res.json()) as { url: string };
  assert.ok(url.endsWith('.pdf'));
  const filePart = url.slice(`/api/file/digests/${'0'.repeat(36)}-`.length);
  assert.ok(filePart.length <= 120);

  const verRes = await digestVersionsGet({
    request: new Request(`https://app.test/api/digest-versions?key=${encodeURIComponent(`digests/${ID1}-ok.pdf`)}`),
    env: { BUCKET: bucket }
  });
  assert.equal(verRes.status, 200);
  assert.equal(verRes.headers.get('Cache-Control'), 'public, max-age=60, stale-while-revalidate=300');
});

test('getCaller cancels discarded early profile response body when auth fails or claimed sub mismatches', async () => {
  const ADMIN = '00000000-0000-0000-0000-00000000000a';
  const OTHER = '00000000-0000-0000-0000-00000000000c';
  const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;
  let canceled = 0;
  const makeTrackedResponse = (body: unknown) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller.close();
      },
      cancel() {
        canceled++;
      }
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  mockFetch([
    ({ url }) => (url.endsWith('/auth/v1/user') ? json({ msg: 'expired' }, 401) : undefined),
    ({ url }) => (url.includes('/rest/v1/users?id=eq.') ? makeTrackedResponse([{ role: 'admin', full_name: 'Ada', email: 'a@x.ie' }]) : undefined)
  ]);
  assert.equal(await getCaller({ url: 'https://sb.test', anonKey: 'anon' }, jwt(ADMIN)), null);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(canceled, 1, 'early body canceled on 401');

  mockFetch([
    ({ url }) => (url.endsWith('/auth/v1/user') ? json({ id: OTHER, email: 'o@x.ie' }) : undefined),
    ({ url }) => (url.includes(ADMIN) ? makeTrackedResponse([{ role: 'admin', full_name: 'Ada', email: 'a@x.ie' }]) : json([{ role: 'staff', full_name: 'Other', email: 'o@x.ie' }]))
  ]);
  const caller = await getCaller({ url: 'https://sb.test', anonKey: 'anon' }, jwt(ADMIN));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(caller?.id, OTHER);
  assert.equal(canceled, 2, 'early body canceled on sub mismatch');
});
