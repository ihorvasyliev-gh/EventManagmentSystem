import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupDigestOccurrences,
  formatAlsoOnDates,
  formatOccurrenceLabel,
  formatGroupOccurrence,
  summarizeSeries,
  newSince,
  isNewEvent,
  digestNewEvents,
  digestWeekStart,
} from '../utils/digestGrouping.ts';
import type { Event } from '../types.ts';

const makeEvent = (id: string, date: Date, extra: Partial<Event> = {}): Event => ({
  id,
  title: id,
  description: '',
  location: '',
  status: 'published',
  createdAt: new Date(2026, 0, 1),
  date,
  ...extra,
});

test('groupDigestOccurrences merges instances sharing an id onto the first date', () => {
  const groups = groupDigestOccurrences([
    makeEvent('a', new Date(2026, 8, 26, 10, 0)),
    makeEvent('b', new Date(2026, 8, 25, 9, 0)),
    makeEvent('a', new Date(2026, 8, 24, 10, 0)),
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].event.id, 'a');
  assert.equal(groups[0].event.date.getDate(), 24);
  assert.deepEqual(groups[0].occurrences.map((o) => o.date.getDate()), [24, 26]);
  assert.equal(groups[1].event.id, 'b');
  assert.equal(groups[1].occurrences.length, 1);
});

test('groupDigestOccurrences drops duplicate starts and invalid dates', () => {
  const groups = groupDigestOccurrences([
    makeEvent('a', new Date(2026, 8, 24, 10, 0)),
    makeEvent('a', new Date(2026, 8, 24, 10, 0)),
    makeEvent('x', new Date('not a date')),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].occurrences.length, 1);
});

test('formatOccurrenceLabel uses "Sat 26 Sep" and adds time only when it differs', () => {
  const first = new Date(2026, 8, 24, 10, 0);
  assert.equal(formatOccurrenceLabel(new Date(2026, 8, 26, 10, 0), first), 'Sat 26 Sep');
  assert.equal(formatOccurrenceLabel(new Date(2026, 8, 26, 14, 5), first), 'Sat 26 Sep, 14:05');
});

test('formatAlsoOnDates lists the remaining dates, empty for a single occurrence', () => {
  const [multi, single] = groupDigestOccurrences([
    makeEvent('a', new Date(2026, 8, 24, 10, 0)),
    makeEvent('a', new Date(2026, 8, 26, 10, 0)),
    makeEvent('a', new Date(2026, 9, 1, 10, 0)),
    makeEvent('b', new Date(2026, 9, 2, 10, 0)),
  ]);
  assert.equal(formatAlsoOnDates(multi), 'Sat 26 Sep  ·  Thu 1 Oct');
  assert.equal(formatAlsoOnDates(single), '');
});

test('formatAlsoOnDates accepts a custom separator', () => {
  const [group] = groupDigestOccurrences([
    makeEvent('a', new Date(2026, 8, 24, 10, 0)),
    makeEvent('a', new Date(2026, 8, 26, 14, 0)),
    makeEvent('a', new Date(2026, 9, 1, 10, 0)),
  ]);
  assert.equal(formatAlsoOnDates(group, '; '), 'Sat 26 Sep, 14:00; Thu 1 Oct');
});

test('"Also on" names the place when a series moves between venues', () => {
  const [group] = groupDigestOccurrences([
    makeEvent('a', new Date(2026, 9, 1, 10, 0), { location: 'Heron House' }),
    makeEvent('a', new Date(2026, 9, 1, 18, 0), { location: 'Mahon Community Centre' }),
    makeEvent('a', new Date(2026, 9, 2, 10, 0), { location: 'Heron House' }),
  ]);
  assert.equal(formatAlsoOnDates(group, '; '), 'Thu 1 Oct, 18:00 at Mahon Community Centre; Fri 2 Oct');
  assert.equal(formatGroupOccurrence(group.occurrences[1], group.event, 10), 'Thu 1 Oct, 18:00 at Mahon Com…');
});

/** Instances of event `id` on the given [month, day] dates of 2026 at `hour` */
const seriesOf = (dates: Array<[number, number]>, hour = 12, extra: Partial<Event> = {}): Event[] =>
  dates.map(([m, d]) => makeEvent('s', new Date(2026, m, d, hour, 30), { location: 'Outreach Office', ...extra }));

/** Every 7th day from 15 Oct 2026, `count` times, leaving out the given week indexes */
const thursdays = (count: number, skip: number[] = []): Array<[number, number]> =>
  Array.from({ length: count }, (_, i) => i)
    .filter((i) => !skip.includes(i))
    .map((i) => {
      const d = new Date(2026, 9, 15 + 7 * i);
      return [d.getMonth(), d.getDate()];
    });

test('a series with up to 3 other dates is still listed date by date', () => {
  const [group] = groupDigestOccurrences(seriesOf(thursdays(4), 12, { recurrence: { type: 'weekly' } }));
  assert.equal(summarizeSeries(group), null);
  assert.equal(formatAlsoOnDates(group, ', '), 'Thu 22 Oct, Thu 29 Oct, Thu 5 Nov');
});

test('a long weekly series is summed up, without "until" while it carries on', () => {
  const [group] = groupDigestOccurrences(seriesOf(thursdays(10), 12, { recurrence: { type: 'weekly' } }));
  assert.equal(formatAlsoOnDates(group), 'every Thursday: 22, 29 Oct · 5, 12, 19, 26 Nov · 3, 10, 17 Dec');
});

test('a series that ends in the period says until when, and names a skipped week', () => {
  const recurrence = { type: 'weekly' as const, endDate: new Date(2026, 11, 3) };
  const [group] = groupDigestOccurrences(seriesOf(thursdays(8, [5]), 12, { recurrence }));
  assert.equal(summarizeSeries(group)?.pattern, 'every Thursday until 3 Dec, except 19 Nov');
});

test('picked dates with no later date say until when', () => {
  const dates = thursdays(6);
  const customDates = dates.map(([m, d]) => new Date(2026, m, d));
  const [group] = groupDigestOccurrences(seriesOf(dates, 12, { recurrence: { type: 'custom', customDates } }));
  assert.equal(summarizeSeries(group)?.pattern, 'every Thursday until 19 Nov');
  const [ongoing] = groupDigestOccurrences(seriesOf(dates, 12, {
    recurrence: { type: 'custom', customDates: [...customDates, new Date(2027, 0, 7)] }
  }));
  assert.equal(summarizeSeries(ongoing)?.pattern, 'every Thursday');
});

test('days in a row become a range, and several weekdays read as one pattern', () => {
  const weekdays: Array<[number, number]> = [];
  for (let d = 2; d <= 20; d++) if (new Date(2026, 10, d).getDay() % 6) weekdays.push([10, d]);
  const [group] = groupDigestOccurrences(seriesOf(weekdays));
  assert.equal(formatAlsoOnDates(group), 'every weekday: 3–6, 9–13, 16–20 Nov');

  const tueThu: Array<[number, number]> = [[9, 13], [9, 15], [9, 20], [9, 22], [9, 27], [9, 29]];
  const [twice] = groupDigestOccurrences(seriesOf(tueThu));
  assert.equal(summarizeSeries(twice)?.pattern, 'every Tuesday and Thursday');
});

test('every other week, and dates with no pattern', () => {
  const [fortnightly] = groupDigestOccurrences(seriesOf(thursdays(10).filter((_, i) => i % 2 === 0)));
  assert.equal(formatAlsoOnDates(fortnightly), 'every other Thursday: 29 Oct · 12, 26 Nov · 10 Dec');
  const [irregular] = groupDigestOccurrences(seriesOf([[9, 1], [9, 3], [9, 9], [9, 20], [9, 22], [9, 30]]));
  assert.equal(formatAlsoOnDates(irregular), '3, 9, 20, 22, 30 Oct');
});

test('a long series lists other venues apart and flags a different time', () => {
  const events = seriesOf(thursdays(8));
  events[3].location = 'Mahon Library';
  events[4].location = 'Mahon Library';
  events[5].date = new Date(2026, 10, 19, 18, 0);
  const [group] = groupDigestOccurrences(events);
  assert.deepEqual(summarizeSeries(group)?.venues.map((v) => v.place), ['', 'Mahon Library']);
  assert.equal(formatAlsoOnDates(group), 'every Thursday: 22, 29 Oct · 19 (18:00), 26 Nov · 3 Dec; at Mahon Library: 5, 12 Nov');
});

test('without last week\'s digest to go by, events added in the week before are new', () => {
  const issued = new Date(2026, 9, 15, 11, 40);
  const since = newSince(issued);
  assert.deepEqual([since.getFullYear(), since.getMonth(), since.getDate(), since.getHours()], [2026, 9, 8, 0]);
  const added = (d: Date) => ({ createdAt: d });
  assert.equal(isNewEvent(added(new Date(2026, 9, 8, 0, 0)), since, issued), true, 'on the first day');
  assert.equal(isNewEvent(added(new Date(2026, 9, 15, 9)), since, issued), true, 'that morning');
  assert.equal(isNewEvent(added(new Date(2026, 9, 7, 23, 59)), since, issued), false, 'the day before');
  // An event loaded without its creation time gets its own date instead: not new
  assert.equal(isNewEvent(added(new Date(2026, 10, 4, 11)), since, issued), false, 'in the future');
  assert.equal(isNewEvent({ createdAt: new Date(NaN) }, since, issued), false);
});

test('NEW marks what last week\'s digest didn\'t have; the first digest marks everything', () => {
  const groups = groupDigestOccurrences([
    makeEvent('dinner', new Date(2026, 9, 22, 12, 30)),
    makeEvent('dance', new Date(2026, 9, 25, 15)),
    makeEvent('fair', new Date(2026, 10, 4, 10))
  ]);
  const first = digestNewEvents(groups, null);
  assert.equal(first.since, null);
  assert.deepEqual([...first.newIds].sort(), ['dance', 'dinner', 'fair']);

  // Sent on 16 Oct with the dinner and the dance (the fair was beyond its two weeks)
  const next = digestNewEvents(groups, { issued: new Date(2026, 9, 16, 0, 0), ids: ['dinner', 'dance', 'gone'] });
  assert.deepEqual([next.since!.getMonth(), next.since!.getDate()], [9, 16]);
  assert.deepEqual([...next.newIds], ['fair']);

  // Not known: added in the last week (all made on 1 January here)
  assert.equal(digestNewEvents(groups, undefined, new Date(2026, 9, 23)).newIds.size, 0);
});

test('a digest compares itself with the last one shared before its week began (Monday)', () => {
  const day = (d: Date) => [d.getMonth(), d.getDate(), d.getHours()];
  assert.deepEqual(day(digestWeekStart(new Date(2026, 9, 15, 16, 20))), [9, 12, 0], 'Thursday');
  assert.deepEqual(day(digestWeekStart(new Date(2026, 9, 16, 9))), [9, 12, 0], 'Friday, same week');
  assert.deepEqual(day(digestWeekStart(new Date(2026, 9, 18, 23))), [9, 12, 0], 'Sunday');
  assert.deepEqual(day(digestWeekStart(new Date(2026, 9, 19, 0, 30))), [9, 19, 0], 'Monday starts a new week');
  assert.deepEqual(day(digestWeekStart(new Date(2026, 10, 1))), [9, 26, 0], 'across a month');
});
