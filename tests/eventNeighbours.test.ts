import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventNeighbours } from '../utils/eventNeighbours.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event> = {}): Event => ({
  id: 'a', title: 'Coffee morning', description: '', date: new Date(2026, 10, 5, 10), location: 'Mahon',
  status: 'published', createdAt: new Date(2026, 0, 1), ...over
});

test('previous and next are the events just before and after by date, whatever order they come in', () => {
  const a = event({ id: 'a', title: 'A', date: new Date(2026, 10, 2, 10) });
  const b = event({ id: 'b', title: 'B', date: new Date(2026, 10, 5, 10) });
  const c = event({ id: 'c', title: 'C', date: new Date(2026, 11, 20, 10) });
  const { previous, next } = eventNeighbours([c, a, b], b);
  assert.equal(previous?.id, 'a');
  assert.equal(next?.id, 'c');
  assert.equal(eventNeighbours([c, a, b], a).previous, null);
  assert.equal(eventNeighbours([c, a, b], c).next, null);
});

test('events at the same hour keep one order, so going forward and back passes each of them', () => {
  const at = new Date(2026, 10, 5, 10);
  const x = event({ id: 'x', title: 'Yoga', date: at });
  const y = event({ id: 'y', title: 'Art club', date: at });
  const z = event({ id: 'z', title: 'Art club', date: at });
  const all = [x, y, z];
  assert.equal(eventNeighbours(all, y).next?.id, 'z');
  assert.equal(eventNeighbours(all, z).next?.id, 'x');
  assert.equal(eventNeighbours(all, x).previous?.id, 'z');
  assert.equal(eventNeighbours(all, y).previous, null);
});

test('each date of a repeating event counts: next from one week may be the week after', () => {
  const weekly = event({ id: 'w', title: 'Coding club', date: new Date(2026, 10, 5, 16), recurrence: { type: 'weekly', interval: 1 } });
  const between = event({ id: 'b', title: 'Fair', date: new Date(2026, 10, 14, 12) });
  const second = { ...weekly, date: new Date(2026, 10, 12, 16) };
  const { previous, next } = eventNeighbours([weekly, between], second);
  assert.equal(previous?.id, 'w');
  assert.equal(previous?.date.getTime(), new Date(2026, 10, 5, 16).getTime());
  assert.equal(next?.id, 'b');
  assert.equal(eventNeighbours([weekly], second).next?.date.getTime(), new Date(2026, 10, 19, 16).getTime());
});

test('a deleted date of a series, and dates outside the date or place filter, are skipped', () => {
  const weekly = event({ id: 'w', title: 'Coding club', date: new Date(2026, 10, 5, 16), recurrence: { type: 'weekly', interval: 1 } });
  const exceptions = new Map([['w', [new Date(2026, 10, 12)]]]);
  assert.equal(eventNeighbours([weekly], weekly, { exceptions }).next?.date.getTime(), new Date(2026, 10, 19, 16).getTime());

  const elsewhere = event({ id: 'e', title: 'Fair', date: new Date(2026, 10, 6, 12), location: 'Togher' });
  const later = event({ id: 'l', title: 'Quiz', date: new Date(2026, 10, 30, 19) });
  const one = event({ id: 'o', title: 'Talk', date: new Date(2026, 10, 5, 9) });
  assert.equal(eventNeighbours([one, elsewhere, later], one, { location: 'Mahon' }).next?.id, 'l');
  assert.equal(eventNeighbours([one, elsewhere, later], one, { dateRange: { end: new Date(2026, 10, 7) } }).next?.id, 'e');
  assert.equal(eventNeighbours([one, later], one, { dateRange: { end: new Date(2026, 10, 7) } }).next, null);
});
