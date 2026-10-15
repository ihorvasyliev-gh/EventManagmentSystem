import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultInstances, hasEventsAfter } from '../utils/agenda.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event> = {}): Event => ({
  id: 'a', title: 'Coffee morning', description: '', date: new Date(2026, 10, 5, 10), location: 'Mahon',
  status: 'published', createdAt: new Date(2026, 0, 1), ...over
});

const today = new Date(2026, 9, 15);
const titles = (list: Event[]) => list.map((e) => e.title);

test('search results list every date: next month’s events too, soonest first, past ones latest first', () => {
  const { upcoming, past } = resultInstances([
    event({ id: '1', title: 'Awards night', date: new Date(2026, 10, 20, 19) }),
    event({ id: '2', title: 'Coffee morning', date: new Date(2026, 9, 16, 10) }),
    event({ id: '3', title: 'Old quiz', date: new Date(2026, 8, 1, 19) }),
    event({ id: '4', title: 'Older quiz', date: new Date(2026, 7, 1, 19) })
  ], { today });
  assert.deepEqual(titles(upcoming), ['Coffee morning', 'Awards night']);
  assert.deepEqual(titles(past), ['Old quiz', 'Older quiz']);
});

test('an event still on today counts as upcoming', () => {
  const { upcoming } = resultInstances([
    event({ title: 'Festival', date: new Date(2026, 9, 12, 10), endDate: new Date(2026, 9, 18, 17) })
  ], { today });
  assert.deepEqual(titles(upcoming), ['Festival']);
});

test('a repeating event is listed once, at its next date, or at its last one when it is over', () => {
  const weekly = event({ id: 'w', title: 'Coding club', date: new Date(2026, 8, 3, 16), recurrence: { type: 'weekly', interval: 1 } });
  const over = event({
    id: 'o', title: 'Summer camp', date: new Date(2026, 6, 6, 10),
    recurrence: { type: 'weekly', interval: 1, endDate: new Date(2026, 7, 31) }
  });
  const { upcoming, past } = resultInstances([weekly, over], { today });
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].date.getTime(), new Date(2026, 9, 15, 16).getTime());
  assert.equal(past.length, 1);
  assert.equal(past[0].date.getTime(), new Date(2026, 7, 31, 10).getTime());
});

test('within a date filter, each date of a series in the period is listed', () => {
  const weekly = event({ title: 'Coding club', date: new Date(2026, 8, 3, 16), recurrence: { type: 'weekly', interval: 1 } });
  const { upcoming } = resultInstances([weekly], {
    today, dateRange: { start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) }
  });
  assert.deepEqual(upcoming.map((e) => e.date.getDate()), [5, 12, 19, 26]);
});

test('a place filter keeps only the dates a series is held there', () => {
  const series = event({
    title: 'Roadshow', date: new Date(2026, 10, 2, 10), location: 'Mahon',
    recurrence: {
      type: 'custom',
      customDates: [new Date(2026, 10, 2, 10), new Date(2026, 10, 9, 10)],
      customLocations: ['Mahon', 'Knocknaheeny']
    }
  });
  const { upcoming } = resultInstances([series], { today, location: 'Knocknaheeny' });
  assert.deepEqual(upcoming.map((e) => e.date.getDate()), [9]);
});

test('days deleted from a series are skipped for its next date', () => {
  const weekly = event({ id: 'w', title: 'Coding club', date: new Date(2026, 8, 3, 16), recurrence: { type: 'weekly', interval: 1 } });
  const { upcoming } = resultInstances([weekly], { today, exceptions: new Map([['w', [new Date(2026, 9, 15)]]]) });
  assert.equal(upcoming[0].date.getDate(), 22);
});

test('the Agenda can load further while something is still planned after it', () => {
  const end = new Date(2026, 11, 31, 23, 59);
  assert.equal(hasEventsAfter([event({ date: new Date(2026, 10, 5) })], end), false);
  assert.equal(hasEventsAfter([event({ date: new Date(2027, 0, 5) })], end), true);
  assert.equal(hasEventsAfter([event({ date: new Date(2026, 0, 5), recurrence: { type: 'monthly', interval: 1 } })], end), true);
  assert.equal(hasEventsAfter([event({ date: new Date(2026, 0, 5), recurrence: { type: 'monthly', interval: 1, endDate: new Date(2026, 5, 1) } })], end), false);
  assert.equal(hasEventsAfter([event({
    date: new Date(2026, 10, 5),
    recurrence: { type: 'custom', customDates: [new Date(2026, 10, 5), new Date(2027, 1, 5)] }
  })], end), true);
});
