import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateChipLabel,
  parseDateKey,
  isSameLocalDay,
  getCalendarDays,
  toggleDateSelection,
  removeDateSelection,
  parseTimeToMinutes,
  minutesToTimeString,
  calculateTimeDurationMinutes,
  addMinutesToTime,
  calculatePreservedEndTime,
  DURATION_PRESETS,
} from '../utils/multiDateUtils.ts';
import { formatLocalDate } from '../utils/date.ts';

test('formatDateChipLabel formats Date to "Mon, 12 Oct" style', () => {
  // Oct 12, 2026 is a Monday (month index 9)
  const d = new Date(2026, 9, 12, 10, 0, 0);
  assert.equal(formatDateChipLabel(d), 'Mon, 12 Oct');

  // Oct 13, 2026 is a Tuesday
  const d2 = new Date(2026, 9, 13, 15, 30, 0);
  assert.equal(formatDateChipLabel(d2), 'Tue, 13 Oct');
});

test('parseDateKey creates local date at midnight without timezone shift', () => {
  const d = parseDateKey('2026-10-12');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9); // October
  assert.equal(d.getDate(), 12);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.equal(formatLocalDate(d), '2026-10-12');
});

test('isSameLocalDay compares dates by calendar day', () => {
  const d1 = new Date(2026, 9, 12, 9, 0, 0);
  const d2 = new Date(2026, 9, 12, 17, 30, 0);
  const d3 = new Date(2026, 9, 13, 9, 0, 0);

  assert.equal(isSameLocalDay(d1, d2), true);
  assert.equal(isSameLocalDay(d1, d3), false);
});

test('getCalendarDays builds Monday-first grid with proper padding', () => {
  // October 2026: Oct 1 is Thursday. Monday-first means Mon(28), Tue(29), Wed(30) Sep are padding (3 days).
  // Days in Oct: 31 days. Total so far: 34 days.
  // Next month padding to reach multiple of 7: 35 cells (1 day in Nov).
  const cells = getCalendarDays(2026, 9); // October 2026

  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0].inMonth, false); // Padding from Sep
  assert.equal(cells[0].date.getMonth(), 8); // September

  const inMonthCells = cells.filter(c => c.inMonth);
  assert.equal(inMonthCells.length, 31);
  assert.equal(inMonthCells[0].date.getDate(), 1);
  assert.equal(inMonthCells[30].date.getDate(), 31);
});

test('toggleDateSelection adds date and keeps list sorted ascending', () => {
  const oct15 = new Date(2026, 9, 15, 0, 0, 0);
  const oct10 = new Date(2026, 9, 10, 0, 0, 0);
  const oct12 = new Date(2026, 9, 12, 0, 0, 0);

  let selected: Date[] = [];

  // Add 15th
  selected = toggleDateSelection(selected, oct15, '09:00');
  assert.equal(selected.length, 1);
  assert.equal(formatLocalDate(selected[0]), '2026-10-15');
  assert.equal(selected[0].getHours(), 9);
  assert.equal(selected[0].getMinutes(), 0);

  // Add 10th - should sort before 15th
  selected = toggleDateSelection(selected, oct10, '09:00');
  assert.equal(selected.length, 2);
  assert.equal(formatLocalDate(selected[0]), '2026-10-10');
  assert.equal(formatLocalDate(selected[1]), '2026-10-15');

  // Add 12th - should insert in middle
  selected = toggleDateSelection(selected, oct12, '14:30');
  assert.equal(selected.length, 3);
  assert.equal(formatLocalDate(selected[0]), '2026-10-10');
  assert.equal(formatLocalDate(selected[1]), '2026-10-12');
  assert.equal(formatLocalDate(selected[2]), '2026-10-15');
  assert.equal(selected[1].getHours(), 14);
  assert.equal(selected[1].getMinutes(), 30);
});

test('toggleDateSelection removes date if already selected', () => {
  const oct10 = new Date(2026, 9, 10, 9, 0, 0);
  const oct12 = new Date(2026, 9, 12, 9, 0, 0);
  const oct15 = new Date(2026, 9, 15, 9, 0, 0);

  let selected = [oct10, oct12, oct15];

  // Toggle 12th again (even with different hours on clicked date)
  const clicked12 = new Date(2026, 9, 12, 0, 0, 0);
  selected = toggleDateSelection(selected, clicked12);

  assert.equal(selected.length, 2);
  assert.equal(formatLocalDate(selected[0]), '2026-10-10');
  assert.equal(formatLocalDate(selected[1]), '2026-10-15');
});

test('removeDateSelection removes target date', () => {
  const oct10 = new Date(2026, 9, 10);
  const oct12 = new Date(2026, 9, 12);
  const result = removeDateSelection([oct10, oct12], oct10);

  assert.equal(result.length, 1);
  assert.equal(formatLocalDate(result[0]), '2026-10-12');
});

test('parseTimeToMinutes and minutesToTimeString convert back and forth', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('14:45'), 885);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
  assert.equal(parseTimeToMinutes('invalid'), null);
  assert.equal(parseTimeToMinutes(''), null);

  assert.equal(minutesToTimeString(0), '00:00');
  assert.equal(minutesToTimeString(570), '09:30');
  assert.equal(minutesToTimeString(885), '14:45');
  assert.equal(minutesToTimeString(1439), '23:59');
  assert.equal(minutesToTimeString(1600), '23:59'); // clamped
});

test('calculateTimeDurationMinutes calculates difference or null', () => {
  assert.equal(calculateTimeDurationMinutes('09:00', '10:30'), 90);
  assert.equal(calculateTimeDurationMinutes('10:00', '12:00'), 120);
  assert.equal(calculateTimeDurationMinutes('14:00', '14:30'), 30);
  // End before start or equal
  assert.equal(calculateTimeDurationMinutes('10:00', '09:00'), null);
  assert.equal(calculateTimeDurationMinutes('10:00', '10:00'), null);
  // Invalid
  assert.equal(calculateTimeDurationMinutes('', '10:00'), null);
});

test('addMinutesToTime adds duration and respects boundary', () => {
  assert.equal(addMinutesToTime('09:00', 30), '09:30');
  assert.equal(addMinutesToTime('09:00', 60), '10:00');
  assert.equal(addMinutesToTime('09:00', 90), '10:30');
  assert.equal(addMinutesToTime('09:00', 120), '11:00');
  assert.equal(addMinutesToTime('23:00', 90), '23:59'); // clamped
});

test('DURATION_PRESETS contains +30m, +1h, +1.5h, +2h', () => {
  assert.deepEqual(DURATION_PRESETS, [
    { label: '+30m', minutes: 30 },
    { label: '+1h', minutes: 60 },
    { label: '+1.5h', minutes: 90 },
    { label: '+2h', minutes: 120 },
  ]);
});

test('calculatePreservedEndTime shifts end time maintaining duration when start changes', () => {
  // Start was 09:00, End was 10:30 (90 min duration)
  // New start is 11:00 -> New end should be 12:30
  const adjusted = calculatePreservedEndTime('11:00', '09:00', '10:30');
  assert.equal(adjusted, '12:30');

  // Start was 14:00, End was 15:00 (60 min duration)
  // New start is 15:30 -> New end should be 16:30
  const adjusted2 = calculatePreservedEndTime('15:30', '14:00', '15:00');
  assert.equal(adjusted2, '16:30');

  // If old duration was not positive or missing, leaves currentEndTime untouched
  const noChange = calculatePreservedEndTime('11:00', '12:00', '10:00');
  assert.equal(noChange, '10:00');

  const emptyChange = calculatePreservedEndTime('11:00', '', '10:00');
  assert.equal(emptyChange, '10:00');
});
