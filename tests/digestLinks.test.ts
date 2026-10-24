import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  digestKeyOf, rememberedDigestLink, rememberDigestLink, digestPageUrl, digestFromPagePath, digestFromKey, digestListUrl, parseDigestVersions
} from '../utils/digestLinks.ts';
import type { Event } from '../types.ts';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0
} as Storage;

const ev = (over: Partial<Event> = {}): Event => ({
  id: 'a', title: 'Coffee morning', description: 'Tea', date: new Date('2026-10-14T10:00:00Z'), location: 'Mahon',
  status: 'published', createdAt: new Date('2026-01-01T00:00:00Z'), ...over
});
const today = new Date(2026, 9, 12, 9);
const key = (events: Event[], over: { format?: string; today?: Date; end?: string; flyers?: boolean } = {}) =>
  digestKeyOf({
    start: '2026-10-10', end: over.end ?? '2026-10-20', format: over.format ?? 'executive', flyers: over.flyers, events,
    today: over.today ?? today
  });

test('the same digest has the same key; any change to what the PDF shows gives a new one', () => {
  const base = key([ev()]);
  assert.equal(key([ev()]), base);
  assert.equal(key([ev()], { today: new Date(2026, 9, 12, 18) }), base, 'later the same day');
  assert.notEqual(key([ev(), ev({ id: 'b', title: 'Job fair' })]), base, 'an event added');
  assert.notEqual(key([]), base, 'an event removed');
  assert.notEqual(key([ev({ title: 'Coffee morning!' })]), base, 'renamed');
  assert.notEqual(key([ev({ date: new Date('2026-10-14T11:00:00Z') })]), base, 'moved');
  assert.notEqual(key([ev({ extraContacts: [{ name: 'Ann', email: 'ann@x.ie' }] })]), base, 'a contact added');
  assert.notEqual(key([ev()], { format: 'compact' }), base, 'other layout');
  assert.notEqual(key([ev()], { end: '2026-10-21' }), base, 'other period');
  assert.notEqual(key([ev()], { today: new Date(2026, 9, 13, 9) }), base, 'issued the next day');
  assert.equal(key([ev()], { flyers: true }), base, 'flyers to print are on unless turned off');
  assert.notEqual(key([ev()], { flyers: false }), base, 'without the flyers to print');
  assert.notEqual(key([ev({ createdAt: new Date('2026-10-05T00:00:00Z') })]), base, 'added later: now marked NEW');
});

test('a shared link is remembered for its digest, newest first, and forgotten once expired', () => {
  store.clear();
  const later = new Date(Date.now() + 183 * 86400000).toISOString();
  assert.equal(rememberedDigestLink('k1'), null);
  rememberDigestLink('k1', { url: 'https://x/1.pdf', expiresAt: later });
  assert.equal(rememberedDigestLink('k1'), 'https://x/1.pdf');
  rememberDigestLink('k2', { url: 'https://x/2.pdf', expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(rememberedDigestLink('k2'), null);
  for (let i = 0; i < 12; i++) rememberDigestLink(`n${i}`, { url: `https://x/n${i}.pdf`, expiresAt: later });
  assert.equal(rememberedDigestLink('n11'), 'https://x/n11.pdf');
  assert.equal(rememberedDigestLink('k1'), null, 'only the last ten are kept');
  store.set('ccp_shared_digest_pages', 'not json');
  assert.equal(rememberedDigestLink('n11'), null);
});

test('a shared digest is linked to its page, which finds the file and the period again', () => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000';
  const page = digestPageUrl(`/api/file/digests/${id}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf`, 'https://ccp.test');
  assert.equal(page, `https://ccp.test/digest/${id}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26`);
  assert.deepEqual(digestFromPagePath(new URL(page).pathname), {
    key: `digests/${id}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf`,
    fileUrl: `/api/file/digests/${id}-CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf`,
    fileName: 'CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf',
    period: '12 – 26 October 2026',
    start: '2026-10-12',
    end: '2026-10-26'
  });
  assert.equal(digestFromPagePath(`/digest/${id}-notes`)?.period, null);
  assert.equal(digestFromPagePath('/digest/../api/staff'), null);
  assert.equal(digestFromPagePath('/digest/not-an-id-name'), null);
});

test('a digest found by its key in storage, and the answer naming what a link shows and the other weeks', () => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000';
  const key = `digests/${id}-CCP-Upcoming-Events-2026-10-23-to-2026-11-06.pdf`;
  const digest = digestFromKey(key)!;
  assert.equal(digest.fileUrl, `/api/file/${key}`);
  assert.equal(digest.period, '23 October – 6 November 2026');
  assert.deepEqual([digest.start, digest.end], ['2026-10-23', '2026-11-06']);
  assert.equal(digestListUrl(digest), `/api/file/digests/${id}-CCP-Upcoming-Events-2026-10-23-to-2026-11-06.json`);
  assert.equal(digestFromKey('meta/digest-issues.json'), null);
  assert.equal(digestFromKey(`digests/../${id}-x.pdf`), null);

  const older = `digests/${id.replace(/0$/, '1')}-CCP-Upcoming-Events-2026-10-16-to-2026-10-30.pdf`;
  const versions = parseDigestVersions({
    latest: { key, issued: '2026-10-23', updatedAt: '2026-10-26T10:00:00.000Z' },
    archive: [{ key, issued: '2026-10-23', updatedAt: '2026-10-26T10:00:00.000Z' }, { key: older, issued: '2026-10-16', updatedAt: null }, { key: 'nope', issued: 'x' }]
  })!;
  assert.equal(versions.latest.digest.key, key);
  assert.equal(versions.latest.updatedAt?.toISOString(), '2026-10-26T10:00:00.000Z');
  assert.deepEqual(versions.archive.map((r) => [r.digest.key, r.updatedAt]), [[key, versions.latest.updatedAt], [older, null]]);
  assert.equal(parseDigestVersions({ error: 'This digest is no longer available.' }), null);
  assert.equal(parseDigestVersions(null), null);
});
