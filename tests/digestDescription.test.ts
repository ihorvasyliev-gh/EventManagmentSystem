import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionBlocks, layoutDescription } from '../utils/pdf/digest/description.ts';

// Wraps at whole words to `width` characters, like jsPDF's splitTextToSize does to millimetres
const wrap = (text: string, width: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const SAMPLE = [
  'On Nov 25th, a coalition of over 60 organisations invites you to join this event.',
  '',
  'Worrying new research highlights the urgent need for action:',
  '',
  '· 15% of adults believe a person who is raped while drunk is partially responsible.',
  '',
  '·Among men under 25, this rises to 37%.',
  '',
  'HOW TO JOIN SAFER - Cork City.',
  '- Booking gemma.oleary@hse.ie',
  '-5 degrees is cold'
].join('\n');

test('paragraphs and list items: "·" with or without a space, "- " but not "-5"', () => {
  assert.deepEqual(descriptionBlocks(SAMPLE), [
    { text: 'On Nov 25th, a coalition of over 60 organisations invites you to join this event.', bullet: false, gap: false },
    { text: 'Worrying new research highlights the urgent need for action:', bullet: false, gap: true },
    { text: '15% of adults believe a person who is raped while drunk is partially responsible.', bullet: true, gap: true },
    { text: 'Among men under 25, this rises to 37%.', bullet: true, gap: true },
    { text: 'HOW TO JOIN SAFER - Cork City.', bullet: false, gap: true },
    { text: 'Booking gemma.oleary@hse.ie', bullet: true, gap: false },
    { text: '-5 degrees is cold', bullet: false, gap: false }
  ]);
});

test('a description that fits is printed in full, a blank line costing half a line', () => {
  const layout = layoutDescription(SAMPLE, wrap, 60, 2, 30);
  assert.equal(layout.shortened, false);
  assert.equal(layout.lines.at(-1)?.text, '-5 degrees is cold');
  // 2 + 1 + 2 + 1 + 1 + 1 + 1 lines, and four gaps of half a line
  assert.equal(layout.lines.length, 9);
  assert.equal(layout.height, 9 + 4 * 0.5);
  const item = layout.lines.filter((l) => l.block === 2);
  assert.deepEqual(item.map((l) => [l.bullet, l.indent, l.gap]), [[true, true, true], [false, true, false]]);
  // List items wrap to the narrower width past the bullet
  assert.ok(item.every((l) => l.text.length <= 58));
});

test('a long description ends at a sentence, never in the middle of a word', () => {
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} says a little more about the event.`).join(' ');
  const layout = layoutDescription(long, wrap, 50, 2, 5);
  assert.equal(layout.shortened, true);
  assert.ok(layout.height <= 5);
  const text = layout.lines.map((l) => l.text).join(' ');
  assert.match(text, /event\. …$/);
  assert.ok(long.startsWith(text.slice(0, -2)));
});

test('without a sentence end in reach, it stops after a whole word with "…"', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const layout = layoutDescription(words, wrap, 30, 2, 3);
  assert.equal(layout.lines.length, 3);
  const last = layout.lines[2].text;
  assert.match(last, /word\d+…$/);
  assert.ok(words.includes(last.slice(0, -1)));
  assert.ok(last.length <= 30);
});

test('paragraphs that no longer fit are left out, the last one shown ending in "…"', () => {
  const text = 'First paragraph, short.\n\nSecond one, also short.\n\nA third paragraph that is much longer and would wrap onto several lines here.';
  const layout = layoutDescription(text, wrap, 30, 2, 3);
  assert.equal(layout.shortened, true);
  assert.deepEqual(layout.lines.map((l) => l.text), ['First paragraph, short.', 'Second one, also short. …']);
});
