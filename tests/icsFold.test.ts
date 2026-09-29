import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldICSLine } from '../utils/icsFold.ts';

const octets = (s: string) => new TextEncoder().encode(s).length;
const unfold = (s: string) => s.replace(/\r\n /g, '');

test('short lines are left as they are', () => {
  assert.equal(foldICSLine('SUMMARY:Culture Night'), 'SUMMARY:Culture Night');
  const exact = 'X'.repeat(75);
  assert.equal(foldICSLine(exact), exact);
});

test('long lines fold to 75 octets and unfold back to the original', () => {
  const line = 'DESCRIPTION:' + 'Culture Night is an evening dedicated to celebrating cultural diversity. '.repeat(4);
  const folded = foldICSLine(line);
  const physical = folded.split('\r\n');
  assert.ok(physical.length > 1);
  physical.forEach((l, i) => {
    assert.ok(octets(l) <= 75, `line ${i} is ${octets(l)} octets`);
    if (i > 0) assert.ok(l.startsWith(' '));
  });
  assert.equal(unfold(folded), line);
});

test('multi-byte characters are never split', () => {
  const line = 'LOCATION:' + 'Café Ó Súilleabháin 🎉 '.repeat(8);
  const folded = foldICSLine(line);
  for (const l of folded.split('\r\n')) {
    assert.ok(octets(l) <= 75);
    assert.ok(!l.includes('�'));
  }
  assert.equal(unfold(folded), line);
});
