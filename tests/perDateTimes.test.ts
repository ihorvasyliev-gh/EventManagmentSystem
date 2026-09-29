import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOccurrences,
  buildSchedule,
  validateOccurrenceTimes,
  readScheduleFromEvent,
  formatTimeRange,
  materializeCustomSchedule,
  makeSlot,
} from '../utils/multiDateUtils.ts';
import { expandRecurringEvents, hasPerDateTimes } from '../utils/recurrence.ts';
import { detectMultiDateConflicts } from '../utils/conflictDetection.ts';
import type { Event } from '../types.ts';

const oct1 = new Date(2026, 9, 1);
const oct2 = new Date(2026, 9, 2);
const shared = [makeSlot('10:00', '11:30', 't1')];

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
  const schedule = buildSchedule(occ);
  assert.equal(schedule.recurrence?.type, 'custom');
  assert.equal(schedule.recurrence?.customEndDates, undefined);
  assert.equal(schedule.date.getTime(), new Date(2026, 9, 1, 10, 0).getTime());
});

test('per-date times: each date keeps its own start and end', () => {
  const perDate = { '2026-10-02': [makeSlot('14:00', '16:00', 't1')] };
  const occ = buildOccurrences([oct1, oct2], shared, perDate);
  const schedule = buildSchedule(occ, { ownTimes: true });
  assert.deepEqual(schedule.recurrence?.customDates?.map(d => d.getHours()), [10, 14]);
  assert.deepEqual(schedule.recurrence?.customEndDates?.map(d => d.getHours()), [11, 16]);
  assert.ok(hasPerDateTimes(schedule.recurrence));
});

test('single date builds a plain event without a series', () => {
  const schedule = buildSchedule(buildOccurrences([oct1], shared, null));
  assert.equal(schedule.recurrence, undefined);
  assert.equal(schedule.endDate?.getHours(), 11);
});

test('validation names the date whose end is before its start', () => {
  const perDate = { '2026-10-02': [makeSlot('14:00', '13:00', 't1')] };
  assert.match(validateOccurrenceTimes([oct1, oct2], shared, perDate) ?? '', /before the start time for Fri, 2 Oct/);
  assert.equal(validateOccurrenceTimes([oct1, oct2], shared, null), null);
  assert.match(validateOccurrenceTimes([oct1], [makeSlot('', '')], null) ?? '', /start time/);
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
  const occ = buildOccurrences([oct1, oct2], shared, { '2026-10-02': [makeSlot('14:00', '', 't1')] });
  const schedule = buildSchedule(occ, { ownTimes: true });
  const event = makeEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  const [, second] = expandRecurringEvents([event], new Date(2026, 9, 1), new Date(2026, 9, 3));
  assert.equal(second.endDate, undefined);
});

test('readScheduleFromEvent round-trips per-date times', () => {
  const perDate = { '2026-10-01': [makeSlot('09:00', '10:00', 't1')], '2026-10-02': [makeSlot('14:00', '16:00', 't1')] };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], shared, perDate), { ownTimes: true });
  const read = readScheduleFromEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  assert.equal(read.sameTime, false);
  assert.deepEqual(read.perDate, perDate);
  assert.equal(read.dates.length, 2);
});

test('readScheduleFromEvent collapses identical per-date times to "same time"', () => {
  const perDate = { '2026-10-01': [makeSlot('14:00', '15:00', 't1')], '2026-10-02': [makeSlot('14:00', '15:00', 't1')] };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], shared, perDate), { ownTimes: true });
  const read = readScheduleFromEvent({ date: schedule.date, endDate: schedule.endDate, recurrence: schedule.recurrence });
  assert.equal(read.sameTime, true);
  assert.deepEqual(read.shared, [makeSlot('14:00', '15:00', 't1')]);
});

test('readScheduleFromEvent for a plain event defaults the end to 90 minutes', () => {
  const read = readScheduleFromEvent({ date: new Date(2026, 9, 1, 9, 0) });
  assert.deepEqual(read.shared, [makeSlot('09:00', '10:30', 't1')]);
  assert.equal(read.sameTime, true);
});

test('conflicts are checked at each date\'s own time', () => {
  const existing = [{ id: 'x', title: 'Afternoon talk', date: new Date(2026, 9, 2, 14, 30), endDate: new Date(2026, 9, 2, 15, 30) }];
  // Shared morning time: no clash
  assert.equal(detectMultiDateConflicts([oct1, oct2], '10:00', '11:30', existing).hasConflict, false);
  // Oct 2 moved to the afternoon: clash on that day only
  const result = detectMultiDateConflicts([oct1, oct2], '10:00', '11:30', existing, undefined, {
    '2026-10-02': [makeSlot('14:00', '16:00', 't1')],
  });
  assert.equal(result.conflicts.length, 1);
  assert.match(result.summaryMessage, /Fri, 2 Oct: At this time: "Afternoon talk"/);
});

test('formatTimeRange', () => {
  assert.equal(formatTimeRange({ start: '10:00', end: '11:30' }), '10:00 – 11:30');
  assert.equal(formatTimeRange({ start: '10:00', end: '' }), '10:00');
});

test('removing a date from a per-date series keeps the other dates and times', () => {
  const series = makeEvent({
    date: new Date(2026, 8, 30, 12, 30),
    endDate: new Date(2026, 8, 30, 14, 0),
    recurrence: {
      type: 'custom',
      customDates: [new Date(2026, 8, 30, 12, 30), new Date(2026, 9, 1, 8, 0), new Date(2026, 9, 2, 16, 30), new Date(2026, 9, 3, 23, 30)],
      customEndDates: [new Date(2026, 8, 30, 14, 0), new Date(2026, 9, 1, 9, 30), new Date(2026, 9, 2, 18, 0), new Date(2026, 9, 3, 23, 59)],
    },
  });
  // Oct 2 was deleted earlier (exception); now delete Sep 30 (the first date)
  const result = materializeCustomSchedule(series, [new Date(2026, 9, 2)], new Date(2026, 8, 30, 12, 30))!;
  assert.deepEqual(result.recurrence?.customDates?.map(d => [d.getDate(), d.getHours()]), [[1, 8], [3, 23]]);
  assert.deepEqual(result.recurrence?.customEndDates?.map(d => [d.getHours(), d.getMinutes()]), [[9, 30], [23, 59]]);
  // The event now starts on its new first date
  assert.equal(result.date.getDate(), 1);
  assert.equal(result.endDate?.getHours(), 9);
});

test('removing a date from an older series keeps the series time', () => {
  const series = makeEvent({
    date: new Date(2026, 9, 1, 10, 0),
    endDate: new Date(2026, 9, 1, 11, 30),
    recurrence: { type: 'custom', customDates: [new Date(2026, 9, 1), new Date(2026, 9, 2), new Date(2026, 9, 3)] },
  });
  const result = materializeCustomSchedule(series, [], new Date(2026, 9, 1))!;
  assert.deepEqual(result.recurrence?.customDates?.map(d => [d.getDate(), d.getHours()]), [[2, 10], [3, 10]]);
  assert.equal(result.recurrence?.customEndDates, undefined);
  assert.equal(result.date.getDate(), 2);
  assert.equal(result.endDate?.getMinutes(), 30);
});

test('one date left becomes a plain event; none left returns null', () => {
  const series = makeEvent({
    date: new Date(2026, 9, 1, 10, 0),
    recurrence: { type: 'custom', customDates: [new Date(2026, 9, 1), new Date(2026, 9, 2)] },
  });
  const one = materializeCustomSchedule(series, [], new Date(2026, 9, 1))!;
  assert.equal(one.recurrence, undefined);
  assert.equal(one.date.getDate(), 2);
  assert.equal(materializeCustomSchedule(series, [new Date(2026, 9, 2)], new Date(2026, 9, 1)), null);
});

test('non-custom events pass through unchanged', () => {
  const weekly = makeEvent({ recurrence: { type: 'weekly', interval: 1 } });
  assert.equal(materializeCustomSchedule(weekly, [new Date(2026, 9, 8)])?.recurrence?.type, 'weekly');
});
