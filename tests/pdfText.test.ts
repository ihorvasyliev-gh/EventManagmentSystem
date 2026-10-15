import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPdfText, cleanUnicodeText, outlineText } from '../utils/pdf/text.ts';

test('a space typed before a comma or full stop is dropped in the PDF', () => {
  for (const clean of [cleanUnicodeText, cleanPdfText]) {
    assert.equal(clean('Outreach Office , 79 Glenamoy Lawn'), 'Outreach Office, 79 Glenamoy Lawn');
    assert.equal(clean('in the Mayfield area . The aim'), 'in the Mayfield area. The aim');
    assert.equal(clean('our community , our homes ; and more !'), 'our community, our homes; and more!');
    assert.equal(clean('also on hand with information .'), 'also on hand with information.');
    assert.equal(clean('Lunch .\nDo book', true), 'Lunch.\nDo book');
  }
  // Marks that don't end a word stay as typed
  assert.equal(cleanUnicodeText('wait ... and see'), 'wait ... and see');
  assert.equal(cleanUnicodeText('see you :)'), 'see you :)');
  assert.equal(cleanUnicodeText('a .NET course'), 'a .NET course');
  assert.equal(cleanUnicodeText('6.30pm, 11:00'), '6.30pm, 11:00');
});

test('bookmark text keeps to characters the PDF outline can hold', () => {
  assert.equal(outlineText('Thu 15 Oct · Ceol agus Craic – Sibín'), 'Thu 15 Oct · Ceol agus Craic - Sibín');
  assert.equal(outlineText('“Men’s” club…'), '"Men\'s" club...');
  assert.equal(outlineText('Coffee ☕ morning'), 'Coffee morning');
  assert.equal(outlineText('Добро пожаловать'), '');
});
