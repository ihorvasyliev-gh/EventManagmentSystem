import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pickLayout, type LayoutBlock } from '../utils/pdfLayout.ts';

const metrics = { firstTop: 100, pageTop: 20, pageBottom: 280 };
const header = (dayKey: string, h = 15): LayoutBlock => ({ h, keepWithNext: true, isDayHeader: true, dayKey });
const card = (dayKey: string, h: number): LayoutBlock => ({ h, dayKey });

test('a header moves to the next page together with its first card', () => {
  const { pages, gaps } = paginate([header('a'), card('a', 100), header('b'), card('b', 60)], metrics);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].map((p) => p.y), [20, 35]);
  assert.equal(gaps[0], 280 - 215);
});

test('a day that carries over gets its header repeated', () => {
  const continued = (dayKey: string): LayoutBlock => ({ h: 9, dayKey });
  const { pages } = paginate([header('a'), card('a', 100), card('a', 100)], { ...metrics, continued });
  assert.equal(pages.length, 2);
  assert.equal(pages[1][0].block.h, 9);
  assert.equal(pages[1][1].y, 29);
});

test('a block taller than a page does not push itself onto blank pages', () => {
  const { pages } = paginate([card('a', 50), card('a', 400), card('a', 20)], metrics);
  assert.equal(pages.length, 3);
  assert.equal(pages[1].length, 1);
});

test('the roomy layout is kept unless a tighter one closes a large gap or saves a page', () => {
  const roomy = paginate([header('a'), card('a', 100), header('b'), card('b', 70)], metrics);
  const tight = paginate([header('a', 13), card('a', 95), header('b', 13), card('b', 55)], metrics);
  assert.equal(roomy.pages.length, 2);
  assert.equal(tight.pages.length, 1);
  assert.equal(pickLayout([roomy, tight]), 1);

  // Both end a page with only a small gap: nothing to fix
  const small = paginate([card('a', 170), card('a', 20)], metrics);
  const smaller = paginate([card('a', 165), card('a', 20)], metrics);
  assert.equal(pickLayout([small, smaller]), 0);

  // Same page count, but the gap left on page 1 closes up
  const gappy = paginate([card('a', 100), card('a', 90), card('a', 150)], metrics);
  const filled = paginate([card('a', 95), card('a', 80), card('a', 150)], metrics);
  assert.equal(gappy.pages.length, filled.pages.length);
  assert.equal(pickLayout([gappy, filled]), 1);
});
