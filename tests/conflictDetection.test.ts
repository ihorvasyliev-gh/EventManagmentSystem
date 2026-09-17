import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts, formatConflictMessage, type ConflictEvent } from '../utils/conflictDetection.ts';

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
