import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringEvents } from '../utils/recurrence.ts';
import type { Event } from '../types.ts';

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: 'ev',
  title: 'Series',
  description: '',
  location: '',
  status: 'published',
  createdAt: new Date(),
  date: new Date(2026, 0, 5, 10, 0),
  endDate: new Date(2026, 0, 5, 11, 30),
  ...overrides
});

test('weekly instances get their own endDate (same duration, same day)', () => {
  const ev = baseEvent({ recurrence: { type: 'weekly', interval: 1 } });
  const out = expandRecurringEvents([ev], new Date(2026, 1, 1), new Date(2026, 1, 28, 23, 59, 59));

  assert.equal(out.length, 4);
  for (const inst of out) {
    assert.ok(inst.endDate, 'instance should have an endDate');
    assert.equal(inst.endDate!.getTime() - inst.date.getTime(), 90 * 60 * 1000);
    assert.equal(inst.endDate!.getDate(), inst.date.getDate());
    assert.equal(inst.instanceKey, `ev_${inst.date.getTime()}`);
  }
});

test('monthly series on the 31st clamps to month end without drifting', () => {
  const ev = baseEvent({
    date: new Date(2026, 0, 31, 10, 0),
    endDate: undefined,
    recurrence: { type: 'monthly', interval: 1 }
  });
  const out = expandRecurringEvents([ev], new Date(2026, 0, 1), new Date(2026, 4, 31, 23, 59, 59));
  assert.deepEqual(
    out.map(e => [e.date.getMonth(), e.date.getDate()]),
    [[0, 31], [1, 28], [2, 31], [3, 30], [4, 31]]
  );
});

test('recurrence end date is inclusive for the whole day', () => {
  const ev = baseEvent({
    recurrence: { type: 'daily', interval: 1, endDate: new Date(2026, 0, 7) }
  });
  const out = expandRecurringEvents([ev], new Date(2026, 0, 1), new Date(2026, 0, 31));
  assert.deepEqual(out.map(e => e.date.getDate()), [5, 6, 7]);
});

test('occurrences limit is respected even when the range starts later', () => {
  const ev = baseEvent({ recurrence: { type: 'daily', interval: 1, occurrences: 10 } });
  // Occurrences are Jan 5..Jan 14; range starts Jan 12
  const out = expandRecurringEvents([ev], new Date(2026, 0, 12), new Date(2026, 0, 31));
  assert.deepEqual(out.map(e => e.date.getDate()), [12, 13, 14]);
});

test('deleted occurrences (exceptions) are skipped', () => {
  const ev = baseEvent({ recurrence: { type: 'weekly', interval: 1 } });
  const exceptions = new Map([['ev', [new Date(2026, 0, 12)]]]);
  const out = expandRecurringEvents([ev], new Date(2026, 0, 1), new Date(2026, 0, 20), exceptions);
  assert.deepEqual(out.map(e => e.date.getDate()), [5, 19]);
});

test('multi-day event that started before the range is still included', () => {
  const ev = baseEvent({
    date: new Date(2026, 0, 30, 9, 0),
    endDate: new Date(2026, 1, 2, 17, 0)
  });
  const out = expandRecurringEvents([ev], new Date(2026, 1, 1), new Date(2026, 1, 28, 23, 59, 59));
  assert.equal(out.length, 1);
});

test('results are not served from a stale cache after an edit', () => {
  const ev = baseEvent({ recurrence: { type: 'weekly', interval: 1 } });
  const range: [Date, Date] = [new Date(2026, 0, 1), new Date(2026, 0, 31)];
  const before = expandRecurringEvents([ev], ...range);
  const edited = { ...ev, date: new Date(2026, 0, 6, 10, 0), endDate: new Date(2026, 0, 6, 11, 0) };
  const after = expandRecurringEvents([edited], ...range);
  assert.equal(before[0].date.getDate(), 5);
  assert.equal(after[0].date.getDate(), 6);
});
