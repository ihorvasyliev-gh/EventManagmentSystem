// The app expands repeating events in the browser's time zone, the calendar feed on Europe/Dublin
// wall-clock time. For people in Ireland both must list the same dates: compare them directly.
process.env.TZ = 'Europe/Dublin';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringEvents } from '../utils/recurrence.ts';
import { expandRecurring, exceptionsFromRows, type FeedEvent } from '../server/feed.ts';
import { mapEventRow, type EventRow } from '../services/eventMapper.ts';

const base: Omit<FeedEvent, 'id' | 'date' | 'recurrence_type'> = {
  title: 'Event', description: null, end_date: null, location: 'Heron House', status: 'published', category: null,
  recurrence_interval: null, recurrence_end_date: null, recurrence_occurrences: null, recurrence_days_of_week: null,
  recurrence_custom_dates: null, recurrence_custom_end_dates: null, recurrence_custom_locations: null, created_at: '2026-01-01T00:00:00Z'
};

const rows: FeedEvent[] = [
  // Weekly at 10:00 Irish time across the clocks going back (25 Oct 2026)
  { ...base, id: 'weekly', date: '2026-10-08T09:00:00.000Z', end_date: '2026-10-08T10:30:00.000Z', recurrence_type: 'weekly', recurrence_end_date: '2026-11-30T00:00:00.000Z' },
  // Every 3 days, a fixed number of times
  { ...base, id: 'daily', date: '2026-03-20T18:00:00.000Z', recurrence_type: 'daily', recurrence_interval: 3, recurrence_occurrences: 6 },
  // Monthly on the 31st (short months use their last day)
  { ...base, id: 'monthly', date: '2026-01-31T12:00:00.000Z', recurrence_type: 'monthly', recurrence_end_date: '2026-07-01T00:00:00.000Z' },
  { ...base, id: 'yearly', date: '2024-02-29T09:00:00.000Z', recurrence_type: 'yearly' },
  // Tuesdays and Thursdays, every other week
  { ...base, id: 'weekdays', date: '2026-09-01T08:30:00.000Z', recurrence_type: 'weekly', recurrence_interval: 2, recurrence_days_of_week: [2, 4], recurrence_occurrences: 7 },
  // Hand-picked dates, each with its own times and places
  {
    ...base, id: 'custom', date: '2026-10-20T09:00:00.000Z', end_date: '2026-10-20T10:00:00.000Z', recurrence_type: 'custom',
    recurrence_custom_dates: ['2026-10-20T09:00:00.000Z', '2026-10-27T15:00:00.000Z', '2026-11-03T15:00:00.000Z'],
    recurrence_custom_end_dates: ['2026-10-20T10:00:00.000Z', '2026-10-27T16:30:00.000Z', '2026-11-03T15:00:00.000Z'],
    recurrence_custom_locations: ['', 'Mahon CC', null]
  },
  // Hand-picked dates at the series time
  { ...base, id: 'custom-same', date: '2026-10-21T13:00:00.000Z', recurrence_type: 'custom', recurrence_custom_dates: ['2026-10-21T13:00:00.000Z', '2026-11-04T14:00:00.000Z'] },
  { ...base, id: 'single', date: '2026-10-26T09:00:00.000Z', end_date: '2026-10-26T12:00:00.000Z', recurrence_type: 'none' }
];

const exceptionRows = [{ event_id: 'weekly', exception_date: '2026-10-29T00:00:00.000Z' }];

const rangeStart = new Date('2026-01-01T00:00:00Z');
const rangeEnd = new Date('2027-12-31T23:00:00Z');

const describe = (list: Array<{ id: string; date: Date; end?: Date | null; location?: string | null }>) =>
  list
    .map((o) => `${o.id.split('_')[0]} ${o.date.toISOString()} → ${o.end ? o.end.toISOString() : '-'} @ ${o.location || ''}`)
    .sort();

test('the calendar feed lists the same dates, times and places as the app', () => {
  const appExceptions = new Map<string, Date[]>();
  for (const r of exceptionRows) {
    const d = new Date(r.exception_date);
    appExceptions.set(r.event_id, [...(appExceptions.get(r.event_id) ?? []), new Date(d.getFullYear(), d.getMonth(), d.getDate())]);
  }
  const app = expandRecurringEvents(rows.map((r) => mapEventRow(r as unknown as EventRow)), rangeStart, rangeEnd, appExceptions)
    .map((e) => ({ id: e.id, date: e.date, end: e.endDate ?? null, location: e.location }));
  const feed = expandRecurring(rows, rangeStart, rangeEnd, exceptionsFromRows(exceptionRows))
    .map((e) => ({ id: e.id, date: new Date(e.date), end: e.end_date ? new Date(e.end_date) : null, location: e.location }));

  assert.deepEqual(describe(feed), describe(app));
  // And the clocks changing doesn't move the weekly event off 10:00 Irish time
  const weekly = feed.filter((o) => o.id.startsWith('weekly'));
  assert.ok(weekly.length > 4);
  for (const o of weekly) assert.equal(o.date.getHours(), 10, o.date.toISOString());
  assert.ok(!weekly.some((o) => o.date.toISOString().startsWith('2026-10-29')), 'the deleted date is left out');
});
