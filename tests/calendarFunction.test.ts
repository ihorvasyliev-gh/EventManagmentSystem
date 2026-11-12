import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/calendar.ts';
import { onRequestGet as publishedEvents } from '../functions/api/published-events.ts';
import { feedFilter, requestedCategories, categoryNames } from '../server/feed.ts';
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
  // A category's key and its full name (as older addresses have it) are the same category
  assert.deepEqual([...requestedCategories(new URLSearchParams('category=health-wellbeing,Health%20%26%20Wellbeing,other'))!], ['health-wellbeing', 'other']);
  assert.deepEqual(categoryNames(new URLSearchParams('category=health-wellbeing,OTHER,Old%20name')), ['Health & Wellbeing', 'Other', 'Old name']);
});

test('a category key in the address gives the same feed as the full name', async () => {
  const rows = [row(), row({ id: '10000000-0000-0000-0000-000000000002', title: 'Job fair', category: 'Enterprise & Employment' }), row({ id: '10000000-0000-0000-0000-000000000003', title: 'No category', category: null })];
  const feed = async (query: string) => {
    feedCalls(rows);
    return (await onRequestGet({ request: new Request(`https://app.test/api/calendar?category=${query}`), env })).text();
  };
  const byKey = await feed('enterprise-employment');
  assert.match(byKey, /SUMMARY:Job fair/);
  assert.doesNotMatch(byKey, /Culture Night|No category/);
  assert.match(byKey, /X-WR-CALNAME:CCP Events: Enterprise & Employment/);
  assert.equal(byKey, await feed('Enterprise%20%26%20Employment'));
  // Two categories, by key
  const two = await feed('enterprise-employment,community-family');
  assert.match(two, /SUMMARY:Job fair/);
  assert.match(two, /SUMMARY:Culture Night/);
  assert.match(two, /X-WR-CALNAME:CCP Events: Enterprise & Employment\\, Community & Family/);
});

test('the public form gets published events without anyone\'s details', async () => {
  const calls = mockFetch([({ url }) => (url.includes('/rest/v1/events?') ? page([row()]) : undefined)]);
  const res = await publishedEvents({ request: new Request('https://app.test/api/published-events'), env });
  assert.equal(res.status, 200);
  const read = calls[0].url;
  assert.doesNotMatch(read, /submitter|tags|creator|poster/);
  assert.match(read, /status=eq\.published/);
});

const feedCalls = (rows: unknown[]) => mockFetch([
  ({ url }) => (url.includes('/rest/v1/events?') ? page(rows) : undefined),
  ({ url }) => (url.includes('/rest/v1/recurrence_exceptions?') ? page([]) : undefined)
]);

test('the feed is stable between refreshes, shows events as free, and answers "not modified"', async () => {
  feedCalls([row({ updated_at: '2026-03-01T10:00:00Z' })]);
  const first = await onRequestGet({ request: new Request('https://app.test/api/calendar'), env });
  const ics = await first.text();
  assert.equal(first.status, 200);
  assert.match(ics, /DTSTAMP:20260301T100000Z/);
  assert.match(ics, /LAST-MODIFIED:20260301T100000Z/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
  assert.match(ics, /X-MICROSOFT-CDO-BUSYSTATUS:FREE/);
  assert.match(ics, /X-WR-CALNAME:CCP Events\r\n/);
  const etag = first.headers.get('ETag')!;
  assert.ok(etag);

  feedCalls([row({ updated_at: '2026-03-01T10:00:00Z' })]);
  const again = await onRequestGet({ request: new Request('https://app.test/api/calendar'), env });
  assert.equal(await again.text(), ics, 'same events, same text');

  feedCalls([row({ updated_at: '2026-03-01T10:00:00Z' })]);
  const notModified = await onRequestGet({ request: new Request('https://app.test/api/calendar', { headers: { 'If-None-Match': etag } }), env });
  assert.equal(notModified.status, 304);

  // An edit makes it newer: a later SEQUENCE and a new ETag
  feedCalls([row({ title: 'Culture Night (moved)', updated_at: '2026-03-02T10:00:00Z' })]);
  const edited = await onRequestGet({ request: new Request('https://app.test/api/calendar', { headers: { 'If-None-Match': etag } }), env });
  assert.equal(edited.status, 200);
  const seq = (text: string) => Number(text.match(/SEQUENCE:(\d+)/)![1]);
  assert.ok(seq(await edited.clone().text()) > seq(ics));
  assert.notEqual(edited.headers.get('ETag'), etag);
});

test('the feed is named after its categories, and a single invite stays busy', async () => {
  feedCalls([row()]);
  const res = await onRequestGet({ request: new Request('https://app.test/api/calendar?category=Community%20%26%20Family'), env });
  const named = await res.text();
  assert.match(named, /X-WR-CALNAME:CCP Events: Community & Family/);
  assert.match(named, /X-APPLE-CALENDAR-COLOR:#B90B4F/, 'CCP raspberry where the app takes a colour from the feed');

  mockFetch([({ url }) => (url.includes('/rest/v1/events?') ? page([row()]) : undefined)]);
  const invite = await onRequestGet({ request: new Request(`https://app.test/api/calendar?event_id=${ID}`), env });
  assert.doesNotMatch(await invite.text(), /TRANSPARENT/);
});

test('text is escaped and line breaks of every kind become \\n', async () => {
  feedCalls([row({ title: 'Talk; Q&A, part 1', description: 'Line one\r\nLine two\rLine three\nEnd\u0007', location: 'Room 1, City Hall' })]);
  const ics = await (await onRequestGet({ request: new Request('https://app.test/api/calendar'), env })).text();
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:Talk\\; Q&A\\, part 1/);
  assert.match(unfolded, /DESCRIPTION:Line one\\nLine two\\nLine three\\nEnd\r\n/);
  assert.match(unfolded, /LOCATION:Room 1\\, City Hall/);
  // Every line ends in CRLF and none is longer than 75 octets
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.doesNotMatch(ics.replace(/\r\n/g, ''), /[\r\n]/);
});

test('HEAD answers like GET without a body', async () => {
  feedCalls([row()]);
  const res = await onRequestGet({ request: new Request('https://app.test/api/calendar', { method: 'HEAD' }), env });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/calendar; charset=utf-8');
  assert.equal(await res.text(), '');
});

test('the preview lists the next events of the feed, without past ones or anyone\'s details', async () => {
  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  const later = new Date(Date.now() + 5 * 86400000).toISOString();
  feedCalls([
    row({ id: '10000000-0000-0000-0000-000000000003', title: 'Later', date: later, end_date: null }),
    row({ title: 'Past', date: '2026-01-01T10:00:00Z', end_date: '2026-01-01T11:00:00Z' }),
    row({ id: '10000000-0000-0000-0000-000000000004', title: 'Soon', date: soon, end_date: null })
  ]);
  const res = await onRequestGet({ request: new Request('https://app.test/api/calendar?preview=5'), env });
  assert.equal(res.status, 200);
  const { events } = await res.json() as { events: Array<Record<string, unknown>> };
  assert.deepEqual(events.map((e) => e.title), ['Soon', 'Later']);
  assert.deepEqual(Object.keys(events[0]).sort(), ['category', 'end', 'location', 'start', 'title']);
});

test('when the database can\'t be reached the feed says "try later" instead of an empty calendar', async () => {
  mockFetch([() => json({ message: 'down' }, 500)]);
  const res = await onRequestGet({ request: new Request('https://app.test/api/calendar'), env });
  assert.equal(res.status, 503);
  assert.ok(res.headers.get('Retry-After'));
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
