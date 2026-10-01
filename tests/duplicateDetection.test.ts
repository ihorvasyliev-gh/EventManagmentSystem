import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateReason, groupOverlaps, titleSimilarity } from '../utils/duplicateDetection.ts';

test('slightly renamed events count as the same title', () => {
  assert.ok(titleSimilarity('Test coffee morning', 'Coffee Morning') >= 0.6);
  assert.ok(titleSimilarity('Local Development Week 2026', 'LOCAL DEVELOPMENT WEEK, Cork City Partnership Friendly Call Volunteer Drive') >= 0.6);
  assert.ok(titleSimilarity('Coffee morning', 'Yoga for beginners') < 0.6);
});

test('the same venue is a duplicate hint, a different one is not', () => {
  assert.equal(duplicateReason({ title: 'A', location: 'Cork City Partnership, Knocknaheeny Community Building' }, { title: 'B', location: 'cork city partnership knocknaheeny community building' }), 'venue');
  assert.equal(duplicateReason({ title: 'Coffee morning', location: 'Hall A' }, { title: 'Yoga', location: 'Hall B' }), null);
  assert.equal(duplicateReason({ title: 'Coffee morning', location: '' }, { title: 'Yoga', location: '' }), null);
});

test('overlaps are listed once per event, duplicates first', () => {
  const d1 = new Date(2026, 9, 2, 10, 30);
  const d2 = new Date(2026, 9, 9, 10, 30);
  const yoga = { id: 'y', title: 'Yoga', date: d1, location: 'Gym' };
  const coffee = { id: 'c', title: 'Coffee morning', date: d1, location: 'Hall' };
  const list = groupOverlaps(
    [{ date: d1, conflictingEvents: [yoga, coffee], message: '' }, { date: d2, conflictingEvents: [coffee], message: '' }],
    { title: 'Test coffee morning', location: 'Somewhere' }
  );
  assert.deepEqual(list.map((e) => e.event.id), ['c', 'y']);
  assert.equal(list[0].duplicate, 'title');
  assert.equal(list[0].when.length, 2);
  assert.equal(list[1].duplicate, null);
});

test('a shared organisation name alone is not the same venue', () => {
  assert.equal(duplicateReason({ title: 'A', location: 'Cork City Partnership, Knocknaheeny' }, { title: 'B', location: 'Cork City Partnership, Blackpool' }), null);
});
