import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { createScreenOnlyLayer } from '../utils/pdfScreenOnly.ts';

// 1×1 PNG, so the /XObject resource dictionary has an image to list
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const build = (useLayer: boolean) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false });
  const screenOnly = createScreenOnlyLayer(doc);
  doc.text('Always printed', 10, 20);
  if (useLayer) screenOnly(() => doc.text('+ Google', 10, 30));
  doc.addImage(PNG, 'PNG', 10, 40, 10, 10);
  return doc.output();
};

test('screen-only content is wrapped in a view-on / print-off optional content group', () => {
  const pdf = build(true);
  assert.match(pdf, /\/OC \/OCScreen BDC[\s\S]*\(\+ Google\)[\s\S]*EMC/);
  const ocg = pdf.match(/(\d+) 0 obj\s*<< \/Type \/OCG[^]*?endobj/);
  assert.ok(ocg, 'OCG object is written');
  assert.match(ocg[0], /\/View << \/ViewState \/ON >>/);
  assert.match(ocg[0], /\/Print << \/PrintState \/OFF >>/);
  const ref = `${ocg[1]} 0 R`;
  assert.ok(pdf.includes(`/Properties << /OCScreen ${ref}`), 'page resources name the group');
  assert.ok(pdf.includes(`/OCProperties << /OCGs [${ref}]`), 'catalog declares the group');
  assert.ok(pdf.includes(`<< /Event /Print /OCGs [${ref}] /Category [/Print] >>`), 'print usage is applied automatically');
});

test('images stay in the /XObject dictionary, not in /Properties', () => {
  const pdf = build(true);
  assert.match(pdf, /\/XObject <<\s*\/I0 \d+ 0 R\s*>> \/Properties << \/OCScreen \d+ 0 R\s*>>/);
});

test('documents without screen-only content are left untouched', () => {
  const pdf = build(false);
  assert.ok(!pdf.includes('/OCProperties'));
  assert.ok(!pdf.includes('/Properties'));
  assert.ok(!pdf.includes('/Type /OCG'));
});
