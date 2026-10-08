import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPosterFile, isPdfFile, pdfRenderScale, posterNameFromPdf } from '../utils/posterFile.ts';

const MB = 1024 * 1024;

test('PDFs are recognised by type or, when the browser gives none, by extension', () => {
  assert.equal(isPdfFile({ type: 'application/pdf', name: 'flyer' }), true);
  assert.equal(isPdfFile({ type: 'application/x-pdf', name: 'flyer' }), true);
  assert.equal(isPdfFile({ type: '', name: 'Flyer.PDF' }), true);
  assert.equal(isPdfFile({ type: 'image/png', name: 'flyer.png' }), false);
});

test('images and PDFs are accepted within their size limits', () => {
  assert.equal(checkPosterFile({ type: 'image/jpeg', name: 'a.jpg', size: 2 * MB }), null);
  assert.equal(checkPosterFile({ type: 'application/pdf', name: 'a.pdf', size: 20 * MB }), null);
  assert.match(checkPosterFile({ type: 'image/png', name: 'a.png', size: 11 * MB })!, /over 10MB/);
  assert.match(checkPosterFile({ type: 'application/pdf', name: 'a.pdf', size: 26 * MB })!, /PDF is over 25MB/);
});

test('other file types are refused', () => {
  assert.match(checkPosterFile({ type: 'image/svg+xml', name: 'a.svg', size: 1000 })!, /PNG, JPG, GIF or WEBP\) or a PDF/);
  assert.match(checkPosterFile({ type: 'application/msword', name: 'a.doc', size: 1000 })!, /or a PDF/);
});

test('a page renders with its longest side at the target size', () => {
  // A4 portrait and landscape, in PDF points
  assert.equal(Math.round(842 * pdfRenderScale(595, 842)), 2000);
  assert.equal(Math.round(842 * pdfRenderScale(842, 595)), 2000);
  // A0 is scaled down, a small card up
  assert.ok(pdfRenderScale(2384, 3370) < 1);
  assert.ok(pdfRenderScale(252, 144) > 1);
  assert.equal(pdfRenderScale(0, 0), 1);
});

test('the JPG keeps the PDF name', () => {
  assert.equal(posterNameFromPdf('Summer Fair.pdf'), 'Summer Fair.jpg');
  assert.equal(posterNameFromPdf('FLYER.PDF'), 'FLYER.jpg');
  assert.equal(posterNameFromPdf('.pdf'), 'poster.jpg');
});
