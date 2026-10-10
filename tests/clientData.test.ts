import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEventChanges, touchesSeries, type EventChange } from '../utils/realtimeEvents.ts';
import { computePeriodStats, statsSummaryText } from '../utils/eventStats.ts';
import { fetchAllPages } from '../services/paging.ts';
import { mapEventRow, type EventRow } from '../services/eventMapper.ts';
import type { Event } from '../types.ts';

const row = (over: Partial<EventRow> = {}): EventRow => ({
  id: 'a', title: 'A', date: '2026-10-01T09:00:00.000Z', status: 'published', created_at: '2026-01-01T00:00:00Z', ...over
});

test('older submissions with the submitter only in tags still show who sent them', () => {
  const ev = mapEventRow(row({ tags: ['staff-submission', 'by:Ann', 'email:ann@x.ie'] }));
  assert.equal(ev.submitterName, 'Ann');
  assert.equal(ev.submitterEmail, 'ann@x.ie');
  assert.equal(mapEventRow(row({ submitter_email: 'b@x.ie', tags: ['email:old@x.ie'] })).submitterEmail, 'b@x.ie');
});

test('realtime changes are applied in place: insert, update (keeping loaded files), delete', () => {
  const events: Event[] = [
    { ...mapEventRow(row({ id: 'a', date: '2026-10-05T09:00:00.000Z' })), attachments: [{ id: 'f', name: 'f.pdf', url: '/api/file/x', type: 'pdf', size: 1, uploadedAt: new Date() }] },
    mapEventRow(row({ id: 'b' }))
  ];
  const changes: EventChange[] = [
    { eventType: 'INSERT', new: row({ id: 'c', title: 'New', date: '2026-09-01T09:00:00.000Z' }) as unknown as Record<string, unknown>, old: {} },
    { eventType: 'UPDATE', new: row({ id: 'a', title: 'Renamed', date: '2026-10-05T09:00:00.000Z' }) as unknown as Record<string, unknown>, old: { id: 'a' } },
    { eventType: 'DELETE', new: {}, old: { id: 'b' } }
  ];
  const next = applyEventChanges(events, changes)!;
  assert.deepEqual(next.map((e) => e.id), ['c', 'a'], 'sorted by date');
  assert.equal(next[1].title, 'Renamed');
  assert.equal(next[1].attachments?.length, 1);
});

test('a change without the whole row asks for a reload', () => {
  assert.equal(applyEventChanges([], [{ eventType: 'UPDATE', new: { id: 'a' }, old: {} }]), null);
  assert.equal(applyEventChanges([], [{ eventType: 'DELETE', new: {}, old: {} }]), null);
});

test('changes to a series refresh its deleted dates', () => {
  assert.equal(touchesSeries([{ eventType: 'UPDATE', new: { recurrence_type: 'custom' }, old: {} }]), true);
  assert.equal(touchesSeries([{ eventType: 'UPDATE', new: { recurrence_type: 'none' }, old: {} }]), false);
});

test('every page is read, even when the server returns fewer rows than asked', async () => {
  const total = 2500;
  const asked: Array<[number, number]> = [];
  const rows = await fetchAllPages<number>(async (from, to) => {
    asked.push([from, to]);
    const end = Math.min(to, from + 499, total - 1); // a server limit of 500
    return { data: Array.from({ length: end - from + 1 }, (_, i) => from + i), error: null, count: total };
  });
  assert.equal(rows.length, total);
  assert.equal(rows[total - 1], total - 1);
  assert.equal(asked[1][0], 500);
});

test('a failed page is an error, not a short calendar', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: { message: 'boom' }, count: null })), /boom/);
});

test('period statistics count dates, events, categories, months and venues (published only)', () => {
  const events = [
    mapEventRow(row({ id: 's', title: 'Series', date: '2026-01-05T10:00:00.000Z', category: 'Education & Training', location: 'Heron House', recurrence_type: 'weekly', recurrence_occurrences: 4, tags: ['staff-submission'] })),
    mapEventRow(row({ id: 'o', title: 'One-off', date: '2026-02-10T10:00:00.000Z', category: 'Community & Family', location: 'heron house ' })),
    mapEventRow(row({ id: 'd', title: 'Draft', date: '2026-02-11T10:00:00.000Z', status: 'draft' })),
    mapEventRow(row({ id: 'x', title: 'Next quarter', date: '2026-04-02T10:00:00.000Z' }))
  ];
  const stats = computePeriodStats(events, new Map([['s', [new Date(2026, 0, 12)]]]), new Date(2026, 0, 1), new Date(2026, 2, 31, 23, 59, 59));
  assert.equal(stats.occurrences, 4, '3 series dates (one deleted) + the one-off');
  assert.equal(stats.events, 2);
  assert.equal(stats.venues, 1, 'venue names compare without case and spaces');
  assert.equal(stats.submitted, 1);
  assert.deepEqual(stats.byCategory.map((c) => [c.name, c.occurrences, c.events]), [['Education & Training', 3, 1], ['Community & Family', 1, 1]]);
  assert.deepEqual(stats.byMonth.map((m) => m.occurrences), [3, 1, 0]);
  assert.match(statsSummaryText(stats, 'Q1 2026'), /2 events on 4 dates at 1 venue/);
});
