import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents } from '../utils/filterEvents.ts';
import { setRememberMe } from '../utils/authStorage.ts';
import { cacheEvents, getCachedEvents, cacheExceptions, getCachedExceptions, clearEventsCache } from '../utils/eventsCache.ts';
import { reportError, toReportableError } from '../utils/errorReporting.ts';
import { loadOrReload } from '../utils/staleChunk.ts';
import { mapWithConcurrency } from '../utils/pdf/images.ts';
import type { Event, UserRole } from '../types.ts';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

const local = new MockStorage();
const session = new MockStorage();
(globalThis as any).localStorage = local;
(globalThis as any).sessionStorage = session;

const STAFF_ROLE = 'staff' as UserRole;
const ADMIN_ROLE = 'admin' as UserRole;

const makeEvent = (over: Partial<Event> = {}): Event => ({
  id: 'e1',
  title: 'Community Workshop',
  description: '',
  date: new Date('2026-11-05T10:00:00Z'),
  location: 'Mahon',
  status: 'published',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  ...over
});

beforeEach(() => {
  local.clear();
  session.clear();
  setRememberMe(true);
});

// --- filterEvents ---

test('filterEvents: status=published includes events with undefined status', () => {
  const list = [
    makeEvent({ id: 'pub', status: 'published' }),
    makeEvent({ id: 'undef', status: undefined as unknown as Event['status'] }),
    makeEvent({ id: 'draft', status: 'draft', creatorId: 'u1' })
  ];
  assert.deepEqual(
    filterEvents(list, { status: 'published' }, STAFF_ROLE, 'u1').map((e) => e.id),
    ['pub', 'undef']
  );
});

test('filterEvents: status=draft preserves non-admin ownership guard', () => {
  const list = [
    makeEvent({ id: 'mine', status: 'draft', creatorId: 'u1' }),
    makeEvent({ id: 'theirs', status: 'draft', creatorId: 'u2' }),
    makeEvent({ id: 'contact', status: 'draft', submitterEmail: 'u1@example.ie' })
  ];
  assert.deepEqual(
    filterEvents(list, { status: 'draft' }, STAFF_ROLE, 'u1', 'u1@example.ie').map((e) => e.id),
    ['mine', 'contact']
  );
  assert.deepEqual(
    filterEvents(list, { status: 'draft' }, ADMIN_ROLE, 'u1').map((e) => e.id),
    ['mine', 'theirs', 'contact']
  );
});

test('filterEvents: multi-day non-recurring events overlap dateRange properly', () => {
  const dayStart = new Date('2026-11-10T00:00:00Z');
  const dayEnd = new Date('2026-11-11T00:00:00Z');
  const list = [
    // Ongoing across Today (Nov 9 -> Nov 12)
    makeEvent({ id: 'spanning', date: new Date('2026-11-09T09:00:00Z'), endDate: new Date('2026-11-12T17:00:00Z') }),
    // Starts yesterday, ends Today afternoon
    makeEvent({ id: 'ends-today', date: new Date('2026-11-09T09:00:00Z'), endDate: new Date('2026-11-10T15:00:00Z') }),
    // Ends before Today starts
    makeEvent({ id: 'ended-before', date: new Date('2026-11-08T09:00:00Z'), endDate: new Date('2026-11-09T23:59:59Z') }),
    // Starts exactly at dayEnd (exclusive)
    makeEvent({ id: 'starts-at-end', date: new Date('2026-11-11T00:00:00Z'), endDate: new Date('2026-11-12T10:00:00Z') })
  ];
  assert.deepEqual(
    filterEvents(list, { dateRange: { start: dayStart, end: dayEnd } }, ADMIN_ROLE).map((e) => e.id),
    ['spanning', 'ends-today']
  );
});

// --- eventsCache ---

test('eventsCache: isolates cached events and exceptions by userId', () => {
  const e = makeEvent({ id: 'secret-draft', status: 'draft' });
  cacheEvents([e], 'admin-1');
  cacheExceptions(new Map([['secret-draft', [new Date('2026-11-12T00:00:00Z')]]]), 'admin-1');

  assert.equal(getCachedEvents('admin-1')?.[0].id, 'secret-draft');
  assert.equal(getCachedExceptions('admin-1')?.get('secret-draft')?.length, 1);

  // Different user sees nothing
  assert.equal(getCachedEvents('staff-2'), null);
  assert.equal(getCachedExceptions('staff-2'), null);
  assert.equal(getCachedEvents(null), null);

  clearEventsCache();
  assert.equal(getCachedEvents('admin-1'), null);
});

// --- errorReporting ---

test('errorReporting: circular objects, BigInts, and null-prototype objects never throw', async () => {
  const circular: Record<string, unknown> = { name: 'loop' };
  circular.self = circular;
  const big = { id: 123456789012345678901234567890n };
  const nullProto = Object.create(null);
  nullProto.a = 1;

  assert.ok(toReportableError(circular) instanceof Error);
  assert.ok(toReportableError(big) instanceof Error);
  assert.ok(toReportableError(nullProto) instanceof Error);

  await assert.doesNotReject(reportError(circular, 'Circular test'));
  await assert.doesNotReject(reportError(big, 'BigInt test'));
  await assert.doesNotReject(reportError(nullProto, 'Null-proto test'));
});

// --- staleChunk ---

test('staleChunk: does not reload when offline or on non-chunk errors', async () => {
  let reloads = 0;
  const storage = new MockStorage();
  const baseDeps = { storage, repair: async () => undefined, reload: () => reloads++, now: () => 100_000 };

  // Offline: even a genuine chunk load error must not trigger reload
  await assert.rejects(
    loadOrReload(
      () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://app.test/assets/a.js')),
      { ...baseDeps, isOnline: () => false }
    ),
    /dynamically imported module/
  );
  assert.equal(reloads, 0);

  // Online, but non-chunk runtime error: must not trigger reload
  await assert.rejects(
    loadOrReload(
      () => Promise.reject(new ReferenceError('foo is not defined')),
      { ...baseDeps, isOnline: () => true }
    ),
    /foo is not defined/
  );
  assert.equal(reloads, 0);
});

// --- mapWithConcurrency ---

test('mapWithConcurrency: caps in-flight tasks at limit and preserves result order', async () => {
  let active = 0;
  let peak = 0;
  const items = Array.from({ length: 12 }, (_, i) => i + 1);
  const out = await mapWithConcurrency(items, 5, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, (n % 3) * 5));
    active--;
    return n * 10;
  });
  assert.ok(peak <= 5, `expected peak concurrency <= 5, got ${peak}`);
  assert.deepEqual(out, items.map((n) => n * 10));
});
