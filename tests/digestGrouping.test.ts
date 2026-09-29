import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupDigestOccurrences,
  formatAlsoOnDates,
  formatOccurrenceLabel,
  formatGroupOccurrence,
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
