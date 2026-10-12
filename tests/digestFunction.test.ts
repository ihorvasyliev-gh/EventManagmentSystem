import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, deleteOldDigests, DIGEST_KEEP_DAYS, type DigestBucket } from '../functions/api/digest.ts';
import { mockFetch, authRoutes, env } from './support/mockFetch.ts';
import { contentDisposition } from '../server/files.ts';

const DAY = 24 * 60 * 60 * 1000;

/** An R2 bucket that remembers what was stored and when */
const digestBucket = (existing: Record<string, Date> = {}) => {
  const uploaded = new Map(Object.entries(existing));
  const deleted: string[] = [];
  const bucket: DigestBucket = {
    put: async (key: string) => {
      uploaded.set(key, new Date());
      return {};
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
  return { bucket, uploaded, deleted };
};

const send = (file: File | null, token?: string) => {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('https://app.test/api/digest', { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
};

const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf', { type: 'application/pdf' });

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
