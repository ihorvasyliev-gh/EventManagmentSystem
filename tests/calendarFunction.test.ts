import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/calendar.ts';
import { onRequestGet as publishedEvents } from '../functions/api/published-events.ts';
import { feedFilter, requestedCategories } from '../server/feed.ts';
import { mockFetch, json, env } from './support/mockFetch.ts';

const ID = '10000000-0000-0000-0000-000000000001';
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, title: 'Culture Night', description: 'Music', date: '2026-09-18T17:00:00.000Z', end_date: '2026-09-18T20:00:00.000Z',
  location: 'City Hall', status: 'published', category: 'Community & Family', recurrence_type: 'none', recurrence_interval: null,
  recurrence_end_date: null, recurrence_occurrences: null, recurrence_days_of_week: null, recurrence_custom_dates: null,
  recurrence_custom_end_dates: null, recurrence_custom_locations: null, created_at: '2026-01-01T00:00:00Z', ...over
});
const page = (rows: unknown[]) => json(rows, 200, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });

test('a single invite reads the event by id, published only, and ignores text in the link', async () => {
  const calls = mockFetch([({ url }) => (url.includes(`/rest/v1/events?`) ? page([row()]) : undefined)]);
  const res = await onRequestGet({ request: new Request(`https://app.test/api/calendar?event_id=${ID}&title=Free%20money&description=click`), env });
  assert.equal(res.status, 200);
  const ics = await res.text();
  assert.match(ics, /SUMMARY:Culture Night/);
  assert.doesNotMatch(ics, /Free money/);
  const read = calls.find((c) => c.url.includes('/rest/v1/events?'))!;
  assert.match(read.url, /status=eq\.published/);
  assert.doesNotMatch(read.url, /submitter|select=\*/);
  assert.equal(read.headers.apikey, 'service', 'read with the service key');
});

test('a link to a removed or unpublished event says so instead of inventing an invite', async () => {
  mockFetch([({ url }) => (url.includes('/rest/v1/events?') ? page([]) : undefined)]);
  const gone = await onRequestGet({ request: new Request(`https://app.test/api/calendar?event_id=${ID}&title=Anything`), env });
  assert.equal(gone.status, 404);
  const notAnId = await onRequestGet({ request: new Request('https://app.test/api/calendar?event_id=abc&title=Anything'), env });
  assert.equal(notAnId.status, 404);
});

test('the feed covers the past year plus every series, and can be limited to categories', async () => {
  const calls = mockFetch([
    ({ url }) => (url.includes('/rest/v1/events?') ? page([row(), row({ id: '10000000-0000-0000-0000-000000000002', title: 'Job fair', category: 'Enterprise & Employment' })]) : undefined),
    ({ url }) => (url.includes('/rest/v1/recurrence_exceptions?') ? page([]) : undefined)
  ]);
  const now = Date.now();
  const res = await onRequestGet({ request: new Request('https://app.test/api/calendar?category=enterprise%20%26%20employment'), env });
  const ics = await res.text();
  assert.match(ics, /SUMMARY:Job fair/);
  assert.doesNotMatch(ics, /Culture Night/);
  const read = decodeURIComponent(calls.find((c) => c.url.includes('/rest/v1/events?'))!.url);
  const from = new Date(read.match(/date\.gte\.([^,)]+)/)![1]).getTime();
  assert.ok(Math.abs(now - from - 365 * 86400000) < 60000, 'one year back');
  assert.match(read, /recurrence_type\.neq\.none/);
});

test('feed helpers: filter text and category parsing', () => {
  assert.equal(feedFilter(new Date('2026-01-01T00:00:00Z')),
    'status=eq.published&or=(date.gte.2026-01-01T00:00:00.000Z,end_date.gte.2026-01-01T00:00:00.000Z,recurrence_type.neq.none)');
  assert.deepEqual([...requestedCategories(new URLSearchParams('category=A,%20B&category=c'))!], ['a', 'b', 'c']);
  assert.equal(requestedCategories(new URLSearchParams('')), null);
});

test('the public form gets published events without anyone\'s details', async () => {
  const calls = mockFetch([({ url }) => (url.includes('/rest/v1/events?') ? page([row()]) : undefined)]);
  const res = await publishedEvents({ request: new Request('https://app.test/api/published-events'), env });
  assert.equal(res.status, 200);
  const read = calls[0].url;
  assert.doesNotMatch(read, /submitter|tags|creator|poster/);
  assert.match(read, /status=eq\.published/);
});
