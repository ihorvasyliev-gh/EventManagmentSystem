import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOccurrences,
  buildSchedule,
  listSessions,
  makeSlot,
  materializeCustomSchedule,
  readScheduleFromEvent,
  sessionKey,
  validateOccurrenceTimes,
  validateSessionPlaces,
  addSlotAfter,
  updateSlot,
  removeSlot,
} from '../utils/multiDateUtils.ts';
import { expandRecurringEvents, getEventLocations, hasPerSessionPlaces } from '../utils/recurrence.ts';
import { detectOccurrenceConflicts } from '../utils/conflictDetection.ts';
import type { Event } from '../types.ts';

const oct1 = new Date(2026, 9, 1);
const oct2 = new Date(2026, 9, 2);
const morning = makeSlot('10:00', '12:00', 'am');
const evening = makeSlot('18:00', '20:00', 'pm');

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

const hours = (dates?: Date[]) => dates?.map(d => [d.getDate(), d.getHours()]);

test('two shared times run on every picked day', () => {
  const occ = buildOccurrences([oct2, oct1], [evening, morning], null);
  assert.deepEqual(occ.map(o => [o.start.getDate(), o.start.getHours(), o.end?.getHours()]), [
    [1, 10, 12], [1, 18, 20], [2, 10, 12], [2, 18, 20],
  ]);
  // The series can't be described by one time of day, so each date keeps its own times
  const schedule = buildSchedule(occ);
  assert.deepEqual(hours(schedule.recurrence?.customDates), [[1, 10], [1, 18], [2, 10], [2, 18]]);
  assert.deepEqual(hours(schedule.recurrence?.customEndDates), [[1, 12], [1, 20], [2, 12], [2, 20]]);
});

test('one day with a morning and an evening session is a series of two', () => {
  const schedule = buildSchedule(buildOccurrences([oct1], [morning, evening], null));
  assert.equal(schedule.recurrence?.type, 'custom');
  assert.deepEqual(hours(schedule.recurrence?.customDates), [[1, 10], [1, 18]]);

  const instances = expandRecurringEvents([makeEvent(schedule)], new Date(2026, 9, 1), new Date(2026, 9, 2));
  assert.equal(instances.length, 2);
  assert.notEqual(instances[0].instanceKey, instances[1].instanceKey);
});

test('per-date sessions: only one day runs twice', () => {
  const perDate = { '2026-10-01': [morning], '2026-10-02': [evening, morning] };
  const sessions = listSessions([oct1, oct2], [morning], perDate);
  assert.deepEqual(sessions.map(s => [s.day.getDate(), s.slot.start, s.multiple]), [
    [1, '10:00', false], [2, '10:00', true], [2, '18:00', true],
  ]);
});

test('validation: duplicate start times and naming of the session', () => {
  assert.match(validateOccurrenceTimes([oct1], [morning, makeSlot('10:00', '11:00')], null) ?? '', /Two of the times start at 10:00/);
  assert.match(validateOccurrenceTimes([oct1], [morning, makeSlot('', '')], null) ?? '', /start time for time 2/);
  const perDate = { '2026-10-02': [morning, makeSlot('19:00', '18:00', 'x')] };
  assert.match(validateOccurrenceTimes([oct1, oct2], [morning], perDate) ?? '', /before the start time for Fri, 2 Oct, 19:00/);
  const twice = { '2026-10-02': [morning, makeSlot('10:00', '11:00', 'x')] };
  assert.match(validateOccurrenceTimes([oct1, oct2], [morning], twice) ?? '', /Two times on Fri, 2 Oct start at 10:00/);
});

test('each session keeps its own address', () => {
  const places = {
    [sessionKey(oct1, 'am')]: 'Heron House',
    [sessionKey(oct1, 'pm')]: 'Mahon Community Centre',
    [sessionKey(oct2, 'am')]: 'Heron House',
    [sessionKey(oct2, 'pm')]: '  Library  ',
  };
  const occ = buildOccurrences([oct1, oct2], [morning, evening], null, places);
  const schedule = buildSchedule(occ, { ownPlaces: true });
  assert.equal(schedule.location, 'Heron House');
  assert.deepEqual(schedule.recurrence?.customLocations, ['Heron House', 'Mahon Community Centre', 'Heron House', 'Library']);
  assert.ok(hasPerSessionPlaces(schedule.recurrence));

  const event = makeEvent({ ...schedule, location: schedule.location! });
  const instances = expandRecurringEvents([event], new Date(2026, 9, 1), new Date(2026, 9, 3));
  assert.deepEqual(instances.map(i => i.location), ['Heron House', 'Mahon Community Centre', 'Heron House', 'Library']);
  assert.deepEqual(getEventLocations(event), ['Heron House', 'Mahon Community Centre', 'Library']);
});

test('the same address everywhere is stored once', () => {
  const places = { [sessionKey(oct1, 'am')]: 'Hall', [sessionKey(oct2, 'am')]: 'Hall' };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], [morning], null, places), { ownPlaces: true });
  assert.equal(schedule.location, 'Hall');
  assert.equal(schedule.recurrence?.customLocations, undefined);
});

test('missing addresses are named', () => {
  const sessions = listSessions([oct1], [morning, evening], null);
  assert.match(validateSessionPlaces(sessions, { [sessionKey(oct1, 'am')]: 'Hall' }) ?? '', /address for Thu, 1 Oct, 18:00/);
  assert.equal(validateSessionPlaces(sessions, { [sessionKey(oct1, 'am')]: 'Hall', [sessionKey(oct1, 'pm')]: 'Hall' }), null);
});

test('readScheduleFromEvent round-trips sessions and places', () => {
  const places = {
    [sessionKey(oct1, 'am')]: 'A', [sessionKey(oct1, 'pm')]: 'B',
    [sessionKey(oct2, 'am')]: 'A', [sessionKey(oct2, 'pm')]: 'B',
  };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], [morning, evening], null, places), { ownPlaces: true });
  const read = readScheduleFromEvent({ ...schedule, location: schedule.location });
  assert.equal(read.sameTime, true);
  assert.deepEqual(read.shared.map(s => [s.start, s.end]), [['10:00', '12:00'], ['18:00', '20:00']]);
  assert.equal(read.dates.length, 2);
  assert.equal(read.samePlace, false);
  // Rebuilding from what was read gives the same occurrences
  const again = buildOccurrences(read.dates, read.shared, read.sameTime ? null : read.perDate, read.places);
  assert.deepEqual(again.map(o => [o.start.getTime(), o.location]), buildOccurrences([oct1, oct2], [morning, evening], null, places).map(o => [o.start.getTime(), o.location]));
});

test('readScheduleFromEvent: different sessions per day read back as per-date times', () => {
  const perDate = { '2026-10-01': [morning], '2026-10-02': [morning, evening] };
  const schedule = buildSchedule(buildOccurrences([oct1, oct2], [morning], perDate), { ownTimes: true });
  const read = readScheduleFromEvent(schedule);
  assert.equal(read.sameTime, false);
  assert.deepEqual(read.perDate['2026-10-02'].map(s => s.start), ['10:00', '18:00']);
  assert.equal(read.samePlace, true);
});

test('deleting one session keeps the other session of that day', () => {
  const places = { [sessionKey(oct1, 'am')]: 'A', [sessionKey(oct1, 'pm')]: 'B' };
  const schedule = buildSchedule(buildOccurrences([oct1], [morning, evening], null, places), { ownPlaces: true });
  const event = makeEvent({ ...schedule, location: schedule.location! });
  const left = materializeCustomSchedule(event, [], new Date(2026, 9, 1, 10, 0))!;
  // One occurrence left: a plain event at the evening time and place
  assert.equal(left.recurrence, undefined);
  assert.equal(left.date.getHours(), 18);
  assert.equal(left.location, 'B');
});

test('conflicts are checked for every session', () => {
  const existing = [{ id: 'x', title: 'Evening talk', date: new Date(2026, 9, 1, 19, 0), endDate: new Date(2026, 9, 1, 19, 30) }];
  const result = detectOccurrenceConflicts(buildOccurrences([oct1], [morning, evening], null), existing);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date.getHours(), 18);
  assert.match(result.summaryMessage, /Thu, 1 Oct, 18:00: At this time: "Evening talk"/);
});

test('an event in one place lists just that address', () => {
  assert.deepEqual(getEventLocations(makeEvent({ location: ' Hall ' })), ['Hall']);
  assert.deepEqual(getEventLocations(makeEvent({ location: '' })), []);
});

test('editing sessions: add after the latest, move keeps duration, keep at least one', () => {
  const added = addSlotAfter([morning]);
  assert.deepEqual(added.slice(1).map(s => [s.start, s.end]), [['13:00', '15:00']]);
  const moved = updateSlot([morning], 'am', { start: '09:00' });
  assert.deepEqual([moved[0].start, moved[0].end], ['09:00', '11:00']);
  assert.equal(removeSlot([morning], 'am').length, 1);
  assert.deepEqual(removeSlot([morning, evening], 'am').map(s => s.id), ['pm']);
});
