import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOccurrences,
  buildSchedule,
  validateOccurrenceTimes,
  readScheduleFromEvent,
  formatTimeRange,
} from '../utils/multiDateUtils.ts';
import { expandRecurringEvents, hasPerDateTimes } from '../utils/recurrence.ts';
import { detectMultiDateConflicts } from '../utils/conflictDetection.ts';
import type { Event } from '../types.ts';

const oct1 = new Date(2026, 9, 1);
const oct2 = new Date(2026, 9, 2);
const shared = { start: '10:00', end: '11:30' };

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: 'ev1',
  title: 'Series',
  description: '',
  location: 'Room 1',
  status: 'published',
  createdAt: new Date(2026, 0, 1),
  date: new Date(2026, 9, 1, 10, 0),
  ...overrides,
});

test('shared times: every date gets the same start and end', () => {
  const occ = buildOccurrences([oct2, oct1], shared, null);
  assert.deepEqual(occ.map(o => [o.start.getDate(), o.start.getHours(), o.end?.getHours(), o.end?.getMinutes()]), [
    [1, 10, 11, 30],
    [2, 10, 11, 30],
  ]);
  const schedule = buildSchedule(occ, false);
  assert.equal(schedule.recurrence?.type, 'custom');
  assert.equal(schedule.recurrence?.customEndDates, undefined);
  assert.equal(schedule.date.getTime(), new Date(2026, 9, 1, 10, 0).getTime());
});

test('per-date times: each date keeps its own start and end', () => {
  const perDate = { '2026-10-02': { start: '14:00', end: '16:00' } };
  const occ = buildOccurrences([oct1, oct2], shared, perDate);
  const schedule = buildSchedule(occ, true);
  assert.deepEqual(schedule.recurrence?.customDates?.map(d => d.getHours()), [10, 14]);
  assert.deepEqual(schedule.recurrence?.customEndDates?.map(d => d.getHours()), [11, 16]);
  assert.ok(hasPerDateTimes(schedule.recurrence));
});

test('single date builds a plain event without a series', () => {
  const schedule = buildSchedule(buildOccurrences([oct1], shared, null), false);
  assert.equal(schedule.recurrence, undefined);
  assert.equal(schedule.endDate?.getHours(), 11);
});

test('validation names the date whose end is before its start', () => {
  const perDate = { '2026-10-02': { start: '14:00', end: '13:00' } };
  assert.match(validateOccurrenceTimes([oct1, oct2], shared, perDate) ?? '', /before the start time for Fri, 2 Oct/);
  assert.equal(validateOccurrenceTimes([oct1, oct2], shared, null), null);
  assert.match(validateOccurrenceTimes([oct1], { start: '', end: '' }, null) ?? '', /start time/);
});

test('expansion uses per-date times, and the series time for legacy custom dates', () => {
  const perDateEvent = makeEvent({
    date: new Date(2026, 9, 1, 10, 0),
    endDate: new Date(2026, 9, 1, 11, 30),
    recurrence: {
      type: 'custom',
      customDates: [new Date(2026, 9, 1, 10, 0), new Date(2026, 9, 2, 14, 0)],
      customEndDates: [new Date(2026, 9, 1, 11, 30), new Date(2026, 9, 2, 16, 0)],
    },
  });
  const [a, b] = expandRecurringEvents([perDateEvent], new Date(2026, 9, 1), new Date(2026, 9, 3));
  assert.equal(a.date.getHours(), 10);
  assert.equal(a.endDate?.getMinutes(), 30);
  assert.equal(b.date.getHours(), 14);
  assert.equal(b.endDate?.getHours(), 16);

  // Legacy: stored custom dates carry arbitrary times; the series time wins
  const legacy = makeEvent({
    date: new Date(2026, 9, 1, 10, 0),
    endDate: new Date(2026, 9, 1, 11, 30),
    recurrence: { type: 'custom', customDates: [new Date(2026, 9, 1, 0, 0), new Date(2026, 9, 2, 9, 15)] },
  });
  const legacyInstances = expandRecurringEvents([legacy], new Date(2026, 9, 1), new Date(2026, 9, 3));
  assert.deepEqual(legacyInstances.map(i => [i.date.getHours(), i.endDate?.getHours(), i.endDate?.getMinutes()]), [
    [10, 11, 30],
    [10, 11, 30],
  ]);
});

test('a per-date day without an end time has no end', () => {
  const occ = buildOccurrences([oct1, oct2], shared, { '2026-10-02': { start: '14:00', end: '' } });
  const schedule = buildSchedule(occ, true);
  const event = makeEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  const [, second] = expandRecurringEvents([event], new Date(2026, 9, 1), new Date(2026, 9, 3));
  assert.equal(second.endDate, undefined);
});

test('readScheduleFromEvent round-trips per-date times', () => {
  const perDate = { '2026-10-01': { start: '09:00', end: '10:00' }, '2026-10-02': { start: '14:00', end: '16:00' } };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], shared, perDate), true);
  const read = readScheduleFromEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  assert.equal(read.sameTime, false);
  assert.deepEqual(read.perDate, perDate);
  assert.equal(read.dates.length, 2);
});

test('readScheduleFromEvent collapses identical per-date times to "same time"', () => {
  const perDate = { '2026-10-01': { start: '14:00', end: '15:00' }, '2026-10-02': { start: '14:00', end: '15:00' } };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], shared, perDate), true);
  const read = readScheduleFromEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  assert.equal(read.sameTime, true);
  assert.deepEqual(read.shared, { start: '14:00', end: '15:00' });
});

test('readScheduleFromEvent for a plain event defaults the end to 90 minutes', () => {
  const read = readScheduleFromEvent({ date: new Date(2026, 9, 1, 9, 0) });
  assert.deepEqual(read.shared, { start: '09:00', end: '10:30' });
  assert.equal(read.sameTime, true);
});

test('conflicts are checked at each date\'s own time', () => {
  const existing = [{ id: 'x', title: 'Afternoon talk', date: new Date(2026, 9, 2, 14, 30), endDate: new Date(2026, 9, 2, 15, 30) }];
  // Shared morning time: no clash
  assert.equal(detectMultiDateConflicts([oct1, oct2], '10:00', '11:30', existing).hasConflict, false);
  // Oct 2 moved to the afternoon: clash on that day only
  const result = detectMultiDateConflicts([oct1, oct2], '10:00', '11:30', existing, undefined, {
    '2026-10-02': { start: '14:00', end: '16:00' },
  });
  assert.equal(result.conflicts.length, 1);
  assert.match(result.summaryMessage, /Fri, 2 Oct: At this time: "Afternoon talk"/);
});

test('formatTimeRange', () => {
  assert.equal(formatTimeRange({ start: '10:00', end: '11:30' }), '10:00 – 11:30');
  assert.equal(formatTimeRange({ start: '10:00', end: '' }), '10:00');
});
