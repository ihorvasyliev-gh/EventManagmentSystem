import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setRememberMe } from '../utils/authStorage.ts';
import { cacheEvents, getCachedEvents, cacheExceptions, getCachedExceptions, clearEventsCache } from '../utils/eventsCache.ts';
import type { Event } from '../types.ts';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  keys() { return [...this.store.keys()]; }
}

const local = new MockStorage();
const session = new MockStorage();
(globalThis as any).localStorage = local;
(globalThis as any).sessionStorage = session;

const event = {
  id: 'e1',
  title: 'Coffee morning',
  date: new Date('2026-11-05T10:00:00Z'),
  status: 'draft',
  submitterEmail: 'sam@x.ie',
  createdAt: new Date('2026-10-01T00:00:00Z')
} as Event;

const cacheKeys = (storage: MockStorage) => storage.keys().filter((k) => k.startsWith('ccp_events') || k.startsWith('ccp_exceptions'));

beforeEach(() => {
  local.clear();
  session.clear();
});

test('after a one-time sign-in the calendar is kept for this tab only, never on the device', () => {
  setRememberMe(false);
  cacheEvents([event]);
  cacheExceptions(new Map([['e1', [new Date('2026-11-12T00:00:00Z')]]]));
  assert.deepEqual(cacheKeys(local), []);
  assert.equal(getCachedEvents()?.[0].submitterEmail, 'sam@x.ie');
  assert.equal(getCachedExceptions()?.get('e1')?.length, 1);

  // Browser closed: the tab's storage is gone, and nothing is left on the device
  session.clear();
  assert.equal(getCachedEvents(), null);
});

test('a copy an older version left on the device is removed after a one-time sign-in', () => {
  local.setItem('ccp_events_cache', JSON.stringify([{ ...event, date: event.date.toISOString(), createdAt: event.createdAt.toISOString() }]));
  local.setItem('ccp_events_cache_timestamp', String(Date.now()));
  local.setItem('ccp_exceptions_cache', '{}');
  setRememberMe(false);
  assert.equal(getCachedEvents(), null);
  assert.deepEqual(cacheKeys(local), []);
});

test('with "Remember me" the calendar is kept on the device, and signing out clears it everywhere', () => {
  setRememberMe(true);
  cacheEvents([event]);
  assert.ok(cacheKeys(local).includes('ccp_events_cache'));
  assert.deepEqual(cacheKeys(session), []);
  assert.equal(getCachedEvents()?.[0].date.toISOString(), '2026-11-05T10:00:00.000Z');

  clearEventsCache();
  assert.deepEqual([...cacheKeys(local), ...cacheKeys(session)], []);
});
