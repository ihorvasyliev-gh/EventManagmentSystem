import { test } from 'node:test';
import assert from 'node:assert';

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('indexEventsByDay indexes single-day and multi-day events correctly', () => {
  const singleDay = {
    id: '1',
    date: new Date('2026-09-17T10:00:00Z'),
    endDate: new Date('2026-09-17T12:00:00Z')
  };
  const multiDay = {
    id: '2',
    date: new Date('2026-09-18T10:00:00Z'),
    endDate: new Date('2026-09-20T18:00:00Z')
  };

  const map = new Map<string, typeof singleDay[]>();

  const indexEvent = (ev: typeof singleDay) => {
    const s = new Date(ev.date);
    s.setHours(0, 0, 0, 0);
    const e = new Date(ev.endDate);
    e.setHours(0, 0, 0, 0);

    const curr = new Date(s);
    while (curr <= e) {
      const k = toDateKey(curr);
      const list = map.get(k) || [];
      list.push(ev);
      map.set(k, list);
      curr.setDate(curr.getDate() + 1);
    }
  };

  indexEvent(singleDay);
  indexEvent(multiDay);

  assert.strictEqual(map.get('2026-09-17')?.length, 1);
  assert.strictEqual(map.get('2026-09-18')?.length, 1);
  assert.strictEqual(map.get('2026-09-19')?.length, 1);
  assert.strictEqual(map.get('2026-09-20')?.length, 1);
  assert.strictEqual(map.get('2026-09-21'), undefined);
});
