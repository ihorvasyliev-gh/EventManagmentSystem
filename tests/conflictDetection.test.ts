import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts, formatConflictMessage, detectMultiDateConflicts, type ConflictEvent } from '../utils/conflictDetection.ts';

const createMockEvent = (id: string, title: string, start: Date, end?: Date): ConflictEvent => ({
  id,
  title,
  date: start,
  endDate: end,
  location: 'Parochial Hall',
  status: 'published',
  category: 'Community & Culture',
  createdAt: new Date()
});

test('detectConflicts detects time overlap between candidate and existing event', () => {
  const existing = [
    createMockEvent('1', 'Culture Night', new Date('2026-09-18T16:00:00'), new Date('2026-09-18T18:00:00'))
  ];

  const candidate: Partial<ConflictEvent> = {
    date: new Date('2026-09-18T16:30:00'),
    endDate: new Date('2026-09-18T17:30:00')
  };

  const result = detectConflicts(candidate, existing);
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflictingEvents.length, 1);
  assert.equal(result.conflictingEvents[0].title, 'Culture Night');
});

test('detectConflicts returns false when events do not overlap in time', () => {
  const existing = [
    createMockEvent('1', 'Culture Night', new Date('2026-09-18T16:00:00'), new Date('2026-09-18T18:00:00'))
  ];

  const candidate: Partial<ConflictEvent> = {
    date: new Date('2026-09-18T19:00:00'),
    endDate: new Date('2026-09-18T20:00:00')
  };

  const result = detectConflicts(candidate, existing);
  assert.equal(result.hasConflict, false);
  assert.equal(result.conflictingEvents.length, 0);
});

test('detectConflicts excludes the event itself when excludeEventId is provided', () => {
  const existing = [
    createMockEvent('1', 'Culture Night', new Date('2026-09-18T16:00:00'), new Date('2026-09-18T18:00:00'))
  ];

  const candidate: Partial<ConflictEvent> = {
    date: new Date('2026-09-18T16:00:00'),
    endDate: new Date('2026-09-18T18:00:00')
  };

  const result = detectConflicts(candidate, existing, '1');
  assert.equal(result.hasConflict, false);
  assert.equal(result.conflictingEvents.length, 0);
});

test('formatConflictMessage formats single and multi-event conflict strings', () => {
  const e1 = createMockEvent('1', 'Culture Night in Parochial Hall', new Date('2026-09-18T16:00:00'));
  const e2 = createMockEvent('2', 'Music Workshop', new Date('2026-09-18T16:30:00'));

  const msg1 = formatConflictMessage([e1]);
  assert.match(msg1, /This event conflicts with "Culture Night in Parochial Hall"/);

  const msg2 = formatConflictMessage([e1, e2]);
  assert.equal(msg2, 'This event conflicts with 2 other events');

  assert.equal(formatConflictMessage([]), '');
});

test('detectMultiDateConflicts detects conflicts on specific dates in a multi-date series', () => {
  const existing = [
    createMockEvent('1', 'Digital Skills', new Date('2026-10-14T10:00:00'), new Date('2026-10-14T11:00:00'))
  ];

  const dates = [
    new Date('2026-10-12'),
    new Date('2026-10-14'),
    new Date('2026-10-16')
  ];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing);
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].date.getDate(), 14);
  assert.match(result.conflicts[0].message, /At this time: "Digital Skills"/);
  assert.match(result.summaryMessage, /Conflict on .*: At this time: "Digital Skills"/);
});

test('detectMultiDateConflicts returns hasConflict=false when there are no conflicts across dates', () => {
  const existing = [
    createMockEvent('1', 'Digital Skills', new Date('2026-10-14T14:00:00'), new Date('2026-10-14T15:00:00'))
  ];

  const dates = [
    new Date('2026-10-12'),
    new Date('2026-10-14'),
    new Date('2026-10-16')
  ];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing);
  assert.equal(result.hasConflict, false);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.summaryMessage, '');
});

test('detectMultiDateConflicts formats multiple conflicting events on the same date', () => {
  const existing = [
    createMockEvent('1', 'Art Workshop', new Date('2026-10-14T10:00:00'), new Date('2026-10-14T11:00:00')),
    createMockEvent('2', 'Music Practice', new Date('2026-10-14T10:15:00'), new Date('2026-10-14T11:15:00'))
  ];

  const dates = [new Date('2026-10-14')];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing);
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].message, 'At this time: 2 events (e.g. "Art Workshop")');
  assert.match(result.summaryMessage, /Conflict on .*: At this time: 2 events \(e\.g\. "Art Workshop"\)/);
});

test('detectMultiDateConflicts handles multiple conflicting dates in a series', () => {
  const existing = [
    createMockEvent('1', 'Monday Yoga', new Date('2026-10-12T10:00:00'), new Date('2026-10-12T11:00:00')),
    createMockEvent('2', 'Friday Social', new Date('2026-10-16T10:00:00'), new Date('2026-10-16T11:00:00'))
  ];

  const dates = [
    new Date('2026-10-12'),
    new Date('2026-10-14'),
    new Date('2026-10-16')
  ];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing);
  assert.equal(result.hasConflict, true);
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.conflicts[0].date.getDate(), 12);
  assert.match(result.conflicts[0].message, /At this time: "Monday Yoga"/);
  assert.equal(result.conflicts[1].date.getDate(), 16);
  assert.match(result.conflicts[1].message, /At this time: "Friday Social"/);
  assert.match(result.summaryMessage, /Monday Yoga/);
  assert.match(result.summaryMessage, /Friday Social/);
});

test('detectMultiDateConflicts respects excludeEventId', () => {
  const existing = [
    createMockEvent('edit-1', 'Digital Skills', new Date('2026-10-14T10:00:00'), new Date('2026-10-14T11:00:00'))
  ];

  const dates = [new Date('2026-10-14')];

  const result = detectMultiDateConflicts(dates, '10:30', '11:30', existing, 'edit-1');
  assert.equal(result.hasConflict, false);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.summaryMessage, '');
});

test('detectMultiDateConflicts handles empty dates array or invalid time strings gracefully', () => {
  const existing = [
    createMockEvent('1', 'Digital Skills', new Date('2026-10-14T10:00:00'), new Date('2026-10-14T11:00:00'))
  ];

  assert.deepEqual(detectMultiDateConflicts([], '10:30', '11:30', existing), {
    hasConflict: false,
    conflicts: [],
    summaryMessage: ''
  });

  assert.deepEqual(detectMultiDateConflicts([new Date('2026-10-14')], '', '11:30', existing), {
    hasConflict: false,
    conflicts: [],
    summaryMessage: ''
  });

  assert.deepEqual(detectMultiDateConflicts([new Date('2026-10-14')], 'invalid', '11:30', existing), {
    hasConflict: false,
    conflicts: [],
    summaryMessage: ''
  });
});
