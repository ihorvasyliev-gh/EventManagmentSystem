import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, deleteOldDigests, digestListKey, DIGEST_KEEP_DAYS, type DigestBucket } from '../functions/api/digest.ts';
import { onRequestGet as getIssues } from '../functions/api/digest-issues.ts';
import { ISSUES_KEY, MAX_ISSUES, readIssues } from '../server/digestIssues.ts';
import { mockFetch, authRoutes, env } from './support/mockFetch.ts';
import { contentDisposition, digestPageRedirect } from '../server/files.ts';

const DAY = 24 * 60 * 60 * 1000;

/** An R2 bucket that remembers what was stored and when */
const digestBucket = (existing: Record<string, Date> = {}) => {
  const uploaded = new Map(Object.entries(existing));
  const contents = new Map<string, unknown>();
  const deleted: string[] = [];
  const bucket: DigestBucket = {
    put: async (key: string, value: unknown) => {
      uploaded.set(key, new Date());
      contents.set(key, value);
      return {};
    },
    get: async (key: string) => {
      const value = contents.get(key);
      return value instanceof Blob ? { text: () => value.text() } : null;
    },
    delete: async (key: string) => {
      deleted.push(key);
      uploaded.delete(key);
    },
    // Two objects per page, so paging is exercised
    list: async ({ prefix, cursor }) => {
      const keys = [...uploaded.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = Number(cursor ?? 0);
      const page = keys.slice(from, from + 2);
      const truncated = from + 2 < keys.length;
      return { objects: page.map((key) => ({ key, uploaded: uploaded.get(key)! })), truncated, cursor: truncated ? String(from + 2) : undefined };
    }
  };
  return { bucket, uploaded, deleted, contents };
};

const send = (file: File | null, token?: string, fields: Record<string, string> = {}) => {
  const form = new FormData();
  if (file) form.append('file', file);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  return new Request('https://app.test/api/digest', { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
};

const pdf = new File(['%PDF-1.3\n'], 'CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf', { type: 'application/pdf' });

test('an admin shares the digest: it is stored under digests/ and the link to it comes back', async () => {
  mockFetch(authRoutes);
  const { bucket, uploaded } = digestBucket();
  const res = await onRequestPost({ request: send(pdf, 'admin-token'), env: { ...env, BUCKET: bucket } });
  assert.equal(res.status, 201);
  const body = await res.json() as { url: string; expiresAt: string };
  assert.match(body.url, /^\/api\/file\/digests\/[0-9a-f-]{36}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26\.pdf$/);
  assert.ok(uploaded.has(body.url.slice('/api/file/'.length)));
  const days = (new Date(body.expiresAt).getTime() - Date.now()) / DAY;
  assert.ok(Math.abs(days - DIGEST_KEEP_DAYS) < 1, 'the link works for about six months');
});

test('only admins can share the digest, and only as a PDF', async () => {
  mockFetch(authRoutes);
  const { bucket, uploaded } = digestBucket();
  assert.equal((await onRequestPost({ request: send(pdf), env: { ...env, BUCKET: bucket } })).status, 401);
  assert.equal((await onRequestPost({ request: send(pdf, 'staff-token'), env: { ...env, BUCKET: bucket } })).status, 403);
  const page = new File(['<html>'], 'digest.html', { type: 'text/html' });
  assert.equal((await onRequestPost({ request: send(page, 'admin-token'), env: { ...env, BUCKET: bucket } })).status, 415);
  const renamed = new File(['<html>'], 'digest.pdf', { type: 'application/pdf' });
  assert.equal((await onRequestPost({ request: send(renamed, 'admin-token'), env: { ...env, BUCKET: bucket } })).status, 415);
  assert.equal((await onRequestPost({ request: send(null, 'admin-token'), env: { ...env, BUCKET: bucket } })).status, 400);
  assert.equal(uploaded.size, 0);
});

test('digests older than six months are deleted; newer ones and other files stay', async () => {
  const now = new Date('2026-10-12T10:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const { bucket, uploaded, deleted } = digestBucket({
    'digests/a-old.pdf': ago(DIGEST_KEEP_DAYS + 1),
    'digests/b-old.pdf': ago(400),
    'digests/c-recent.pdf': ago(DIGEST_KEEP_DAYS - 1),
    'digests/d-new.pdf': ago(0),
    '0f0f0f0f-0000-0000-0000-000000000000-flyer.png': ago(900)
  });
  assert.deepEqual((await deleteOldDigests(bucket, now)).sort(), ['digests/a-old.pdf', 'digests/b-old.pdf']);
  assert.deepEqual(deleted.sort(), ['digests/a-old.pdf', 'digests/b-old.pdf']);
  assert.deepEqual([...uploaded.keys()].sort(), ['0f0f0f0f-0000-0000-0000-000000000000-flyer.png', 'digests/c-recent.pdf', 'digests/d-new.pdf']);
});

test('a shared digest downloads under its own name; posters still open in the browser', () => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000';
  assert.equal(contentDisposition(`digests/${id}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf`, true), 'attachment; filename="CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf"');
  assert.equal(contentDisposition(`${id}-flyer.png`, true), 'inline; filename="flyer.png"');
  assert.equal(contentDisposition(`${id}-agenda.pdf`, true), 'inline; filename="agenda.pdf"');
  assert.equal(contentDisposition(`${id}-notes.docx`, false), 'attachment; filename="notes.docx"');
});

test('a digest link opened as a page goes to the digest page; the viewer and Download still get the file', () => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events-2026-10-12-to-2026-10-26';
  const key = `digests/${id}.pdf`;
  const req = (query: string, headers: Record<string, string>) => new Request(`https://ccp.test/api/file/${key}${query}`, { headers });
  const page = `https://ccp.test/digest/${id}`;
  assert.equal(digestPageRedirect(key, req('', { 'Sec-Fetch-Dest': 'document' })), page, 'a tapped link');
  assert.equal(digestPageRedirect(key, req('', { Accept: 'text/html,application/xhtml+xml,*/*' })), page, 'older browsers, by Accept');
  assert.equal(digestPageRedirect(key, req('', { 'Sec-Fetch-Dest': 'empty', Accept: '*/*' })), null, 'the viewer fetching the PDF');
  assert.equal(digestPageRedirect(key, req('?download=1', { 'Sec-Fetch-Dest': 'document' })), null, 'the Download button');
  assert.equal(digestPageRedirect('0f0f0f0f-0000-0000-0000-000000000000-flyer.png', req('', { 'Sec-Fetch-Dest': 'document' })), null, 'other files');
});

const issueOf = (issued: string, ids: string[]) => ({ issued, eventIds: JSON.stringify(ids) });
const askIssue = (before: string, token = 'staff-token') =>
  new Request(`https://app.test/api/digest-issues?before=${before}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('a shared digest records its events; next week asks for the last one shared before its Monday', async () => {
  mockFetch(authRoutes);
  const { bucket } = digestBucket();
  const share = (fields: Record<string, string>) => onRequestPost({ request: send(pdf, 'admin-token', fields), env: { ...env, BUCKET: bucket } });
  // Before anything was shared: none, so the first digest marks everything NEW
  let res = await getIssues({ request: askIssue('2026-10-12'), env: { ...env, BUCKET: bucket } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { issue: null });

  assert.equal((await share(issueOf('2026-10-15', ['a', 'b']))).status, 201, 'a Thursday share');
  assert.equal((await share(issueOf('2026-10-16', ['a', 'c']))).status, 201, 'Friday');
  assert.equal((await share(issueOf('2026-10-16', ['d']))).status, 201, 'Friday again, after a change');

  // The same week's Friday still compares with the week before (nothing then)
  res = await getIssues({ request: askIssue('2026-10-12'), env: { ...env, BUCKET: bucket } });
  assert.deepEqual(await res.json(), { issue: null });
  // The next week: Friday's issue, with everything shared that day
  res = await getIssues({ request: askIssue('2026-10-19'), env: { ...env, BUCKET: bucket } });
  assert.deepEqual(await res.json(), { issue: { issued: '2026-10-16', ids: ['a', 'c', 'd'] } });
});

test('a share without (or with broken) issue fields still works and records nothing', async () => {
  mockFetch(authRoutes);
  const { bucket, contents } = digestBucket();
  const share = (fields: Record<string, string>) => onRequestPost({ request: send(pdf, 'admin-token', fields), env: { ...env, BUCKET: bucket } });
  assert.equal((await share({})).status, 201);
  assert.equal((await share({ issued: 'Friday', eventIds: '["a"]' })).status, 201);
  assert.equal((await share({ issued: '2026-10-16', eventIds: 'not json' })).status, 201);
  assert.equal(contents.has(ISSUES_KEY), false);
  // Ids that aren't ids are dropped
  assert.equal((await share({ issued: '2026-10-16', eventIds: JSON.stringify(['ok-1', '<script>', 7]) })).status, 201);
  assert.deepEqual(await readIssues(bucket), [{ issued: '2026-10-16', ids: ['ok-1'] }]);
});

test('about half a year of digests is kept', async () => {
  mockFetch(authRoutes);
  const { bucket } = digestBucket();
  for (let i = 0; i < MAX_ISSUES + 3; i++) {
    const day = new Date(Date.UTC(2026, 0, 2 + i * 7)).toISOString().slice(0, 10);
    await onRequestPost({ request: send(pdf, 'admin-token', issueOf(day, [`e${i}`])), env: { ...env, BUCKET: bucket } });
  }
  const issues = await readIssues(bucket);
  assert.equal(issues.length, MAX_ISSUES);
  assert.equal(issues.at(-1)!.ids[0], `e${MAX_ISSUES + 2}`);
});

test('looking up the last digest needs a signed-in user and a day', async () => {
  mockFetch(authRoutes);
  const { bucket } = digestBucket();
  assert.equal((await getIssues({ request: askIssue('2026-10-19', ''), env: { ...env, BUCKET: bucket } })).status, 401);
  assert.equal((await getIssues({ request: askIssue('next-week'), env: { ...env, BUCKET: bucket } })).status, 400);
  assert.equal((await getIssues({ request: askIssue('2026-10-19', 'admin-token'), env: { ...env, BUCKET: bucket } })).status, 200);
});

test('the events as a list are kept beside the PDF, read back field by field; a broken list is skipped', async () => {
  mockFetch(authRoutes);
  const { bucket, contents } = digestBucket();
  const list = { version: 1, period: '12 – 26 October 2026', entries: [{ day: 'Thursday 15 October', title: 'Coffee morning', extra: 'dropped' }] };
  const res = await onRequestPost({ request: send(pdf, 'admin-token', { list: JSON.stringify(list) }), env: { ...env, BUCKET: bucket } });
  const { url } = await res.json() as { url: string };
  const stored = contents.get(digestListKey(url.slice('/api/file/'.length)));
  assert.ok(stored instanceof Blob);
  const saved = JSON.parse(await stored.text());
  assert.equal(saved.entries[0].title, 'Coffee morning');
  assert.equal('extra' in saved.entries[0], false);
  assert.match(digestListKey(url.slice('/api/file/'.length)), /^digests\/[0-9a-f-]{36}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26\.json$/);

  const before = contents.size;
  assert.equal((await onRequestPost({ request: send(pdf, 'admin-token', { list: '{"version":2}' }), env: { ...env, BUCKET: bucket } })).status, 201);
  assert.equal((await onRequestPost({ request: send(pdf, 'admin-token', { list: 'not json' }), env: { ...env, BUCKET: bucket } })).status, 201);
  assert.equal(contents.size, before + 2, 'only the two PDFs');
});
