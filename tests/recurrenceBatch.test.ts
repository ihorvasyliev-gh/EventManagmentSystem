import { test } from 'node:test';
import assert from 'node:assert';

test('groupRecurrenceExceptions groups rows by event_id correctly', () => {
  const rows = [
    { event_id: 'ev-1', exception_date: '2026-09-20T10:00:00.000Z' },
    { event_id: 'ev-1', exception_date: '2026-09-27T10:00:00.000Z' },
    { event_id: 'ev-2', exception_date: '2026-10-04T10:00:00.000Z' }
  ];

  const map = new Map<string, Date[]>();
  for (const row of rows) {
    const dates = map.get(row.event_id) || [];
    dates.push(new Date(row.exception_date));
    map.set(row.event_id, dates);
  }

  assert.strictEqual(map.size, 2);
  assert.strictEqual(map.get('ev-1')?.length, 2);
  assert.strictEqual(map.get('ev-2')?.length, 1);
  assert.strictEqual(map.get('ev-1')?.[0].toISOString(), '2026-09-20T10:00:00.000Z');
});
