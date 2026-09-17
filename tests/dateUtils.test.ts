import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLocalDate,
  getStartOfToday,
  calculatePresetDateRange
} from '../utils/date.ts';

test('formatLocalDate formats date using local year, month, and day without UTC offset shifting', () => {
  // Construct a date at 00:05 local time
  const d = new Date(2026, 8, 17, 0, 5, 0); // Month is 0-indexed: 8 is September
  assert.equal(formatLocalDate(d), '2026-09-17');

  // Construct a date at 23:55 local time
  const dLate = new Date(2026, 8, 17, 23, 55, 0);
  assert.equal(formatLocalDate(dLate), '2026-09-17');
});

test('getStartOfToday returns midnight of current local day', () => {
  const start = getStartOfToday();
  const now = new Date();
  assert.equal(start.getFullYear(), now.getFullYear());
  assert.equal(start.getMonth(), now.getMonth());
  assert.equal(start.getDate(), now.getDate());
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
});

test('calculatePresetDateRange for 2weeks defaults to 14 days from reference', () => {
  const ref = new Date(2026, 8, 17, 14, 30, 0); // Sep 17, 2026
  const result = calculatePresetDateRange('2weeks', { referenceDate: ref });

  assert.equal(result.startDateStr, '2026-09-17');
  assert.equal(result.endDateStr, '2026-10-01');
  assert.equal(result.startDate.getHours(), 0);
  assert.equal(result.endDate.getHours(), 23);
  assert.equal(result.endDate.getMinutes(), 59);
});

test('calculatePresetDateRange for 1week produces 7 days from reference', () => {
  const ref = new Date(2026, 8, 17, 10, 0, 0);
  const result = calculatePresetDateRange('1week', { referenceDate: ref });

  assert.equal(result.startDateStr, '2026-09-17');
  assert.equal(result.endDateStr, '2026-09-24');
});

test('calculatePresetDateRange for 1month produces 1 calendar month ahead', () => {
  const ref = new Date(2026, 8, 17, 10, 0, 0);
  const result = calculatePresetDateRange('1month', { referenceDate: ref });

  assert.equal(result.startDateStr, '2026-09-17');
  assert.equal(result.endDateStr, '2026-10-17');
});

test('calculatePresetDateRange for all extends to the furthest future event', () => {
  const ref = new Date(2026, 8, 17, 10, 0, 0);
  const events = [
    { date: new Date(2026, 8, 20) },
    { date: new Date(2026, 11, 25) } // Dec 25, 2026
  ];
  const result = calculatePresetDateRange('all', { referenceDate: ref, events });

  assert.equal(result.startDateStr, '2026-09-17');
  assert.equal(result.endDateStr, '2026-12-25');
});

test('calculatePresetDateRange for all with no future events defaults to +1 year', () => {
  const ref = new Date(2026, 8, 17, 10, 0, 0);
  const events = [
    { date: new Date(2026, 7, 1) } // Past event in August
  ];
  const result = calculatePresetDateRange('all', { referenceDate: ref, events });

  assert.equal(result.startDateStr, '2026-09-17');
  assert.equal(result.endDateStr, '2027-09-17');
});
