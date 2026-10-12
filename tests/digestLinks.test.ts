import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestKeyOf, rememberedDigestLink, rememberDigestLink } from '../utils/digestLinks.ts';
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
const key = (events: Event[], over: { format?: string; today?: Date; end?: string } = {}) =>
  digestKeyOf({ start: '2026-10-10', end: over.end ?? '2026-10-20', format: over.format ?? 'executive', events, today: over.today ?? today });

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
  store.set('ccp_shared_digests', 'not json');
  assert.equal(rememberedDigestLink('n11'), null);
});
