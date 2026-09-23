import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurringEvents } from '../utils/recurrence.ts';
import type { Event } from '../types.ts';

test('expandRecurringEvents preserves duration and calculates endDate for custom recurring events', () => {
  const baseStart = new Date(2026, 9, 1, 10, 0, 0); // Oct 1, 2026 10:00
  const baseEnd = new Date(2026, 9, 1, 11, 30, 0); // Oct 1, 2026 11:30 (90 min)

  const customDates = [
    new Date(2026, 9, 1),
    new Date(2026, 9, 5),
    new Date(2026, 9, 10)
  ];

  const event: Event = {
    id: 'test-event-1',
    title: 'Custom Multi-Date Event',
    description: 'Testing custom recurrence duration',
    date: baseStart,
    endDate: baseEnd,
    location: 'Room A',
    status: 'published',
    createdAt: new Date(),
    recurrence: {
      type: 'custom',
      customDates
    }
  };

  const rangeStart = new Date(2026, 9, 1, 0, 0, 0);
  const rangeEnd = new Date(2026, 9, 30, 23, 59, 59);

  const instances = expandRecurringEvents([event], rangeStart, rangeEnd);

  assert.strictEqual(instances.length, 3, 'Should expand 3 custom date instances');

  instances.forEach((inst, index) => {
    assert.strictEqual(inst.date.getHours(), 10, `Instance ${index} start hour should be 10`);
    assert.strictEqual(inst.date.getMinutes(), 0, `Instance ${index} start minute should be 0`);
    assert.ok(inst.endDate, `Instance ${index} should have an endDate`);
    assert.strictEqual(inst.endDate.getFullYear(), inst.date.getFullYear(), `Instance ${index} endDate year matches date`);
    assert.strictEqual(inst.endDate.getMonth(), inst.date.getMonth(), `Instance ${index} endDate month matches date`);
    assert.strictEqual(inst.endDate.getDate(), inst.date.getDate(), `Instance ${index} endDate day matches date`);
    assert.strictEqual(inst.endDate.getHours(), 11, `Instance ${index} end hour should be 11`);
    assert.strictEqual(inst.endDate.getMinutes(), 30, `Instance ${index} end minute should be 30`);

    const durationMs = inst.endDate.getTime() - inst.date.getTime();
    assert.strictEqual(durationMs, 90 * 60 * 1000, `Instance ${index} duration should be 90 minutes`);
  });
});

test('expandRecurringEvents handles custom recurring events without endDate', () => {
  const baseStart = new Date(2026, 9, 1, 10, 0, 0);
  const customDates = [
    new Date(2026, 9, 1),
    new Date(2026, 9, 5)
  ];

  const event: Event = {
    id: 'test-event-no-end',
    title: 'Custom Event without End Date',
    description: 'Testing custom recurrence without endDate',
    date: baseStart,
    location: 'Room B',
    status: 'published',
    createdAt: new Date(),
    recurrence: {
      type: 'custom',
      customDates
    }
  };

  const rangeStart = new Date(2026, 9, 1, 0, 0, 0);
  const rangeEnd = new Date(2026, 9, 30, 23, 59, 59);

  const instances = expandRecurringEvents([event], rangeStart, rangeEnd);
  assert.strictEqual(instances.length, 2);
  instances.forEach((inst, index) => {
    assert.strictEqual(inst.date.getHours(), 10);
    assert.strictEqual(inst.date.getMinutes(), 0);
    assert.strictEqual(inst.endDate, undefined, `Instance ${index} endDate should be undefined`);
  });
});
