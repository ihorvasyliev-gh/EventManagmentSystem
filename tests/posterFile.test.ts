import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPosterFile, isPdfFile, looksLikeWholePdf, sniffFileKind, pdfRenderScale, posterNameFromPdf, posterRenderScale, PDF_POSTER_MAX_PIXELS, PDF_POSTER_MAX_SIDE } from '../utils/posterFile.ts';

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

test('a page preview renders with its longest side at the target size', () => {
  // A4 portrait and landscape, in PDF points
  assert.equal(Math.round(842 * pdfRenderScale(595, 842, 320)), 320);
  assert.equal(Math.round(842 * pdfRenderScale(842, 595, 320)), 320);
  assert.equal(pdfRenderScale(0, 0, 320), 1);
});

const posterSize = (w: number, h: number) => [Math.floor(w * posterRenderScale(w, h)), Math.floor(h * posterRenderScale(w, h))];

test('a poster is drawn at 300 DPI', () => {
  // A4 (595.28 × 841.89 pt) and a business card (3.5 × 2 in)
  assert.deepEqual(posterSize(595.28, 841.89), [2480, 3507]);
  assert.deepEqual(posterSize(252, 144), [1050, 600]);
});

test('a big page is capped at what phones can draw', () => {
  // A3 and A0: longest side 4096 px
  assert.deepEqual(posterSize(841.89, 1190.55), [2896, 4096]);
  const [w, h] = posterSize(2383.94, 3370.39);
  assert.equal(h, PDF_POSTER_MAX_SIDE);
  assert.ok(w * h <= PDF_POSTER_MAX_PIXELS);
  // A square page hits the pixel cap before the side cap
  const [sw, sh] = posterSize(1000, 1000);
  assert.ok(sw * sh <= PDF_POSTER_MAX_PIXELS && sw === 4000 && sh === 4000);
  assert.equal(posterRenderScale(0, 0), 1);
});

test('the image keeps the PDF name', () => {
  assert.equal(posterNameFromPdf('Summer Fair.pdf'), 'Summer Fair.png');
  assert.equal(posterNameFromPdf('FLYER.PDF', 'jpg'), 'FLYER.jpg');
  assert.equal(posterNameFromPdf('.pdf'), 'poster.png');
});

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));
const wholePdf = bytes(`%PDF-1.7\n%\xe2\xe3\xcf\xd3\n${'1 0 obj << >> endobj\n'.repeat(200)}startxref\n12\n%%EOF\n`);

test('a whole PDF is told apart from a cut-off one', () => {
  assert.equal(looksLikeWholePdf(wholePdf), true);
  assert.equal(looksLikeWholePdf(wholePdf.subarray(0, wholePdf.length - 600)), false);
  assert.equal(looksLikeWholePdf(bytes('<!doctype html><html></html>')), false);
  // Junk after %%EOF is allowed
  assert.equal(looksLikeWholePdf(bytes('%PDF-1.4\n...\n%%EOF\r\n\0\0')), true);
});

test('a file is recognised by its first bytes', () => {
  const head = (...b: number[]) => new Uint8Array([...b, ...new Array(24).fill(0)]);
  assert.equal(sniffFileKind(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), 'png');
  assert.equal(sniffFileKind(head(0xff, 0xd8, 0xff, 0xe0)), 'jpeg');
  assert.equal(sniffFileKind(bytes('GIF89a' + '\0'.repeat(20))), 'gif');
  assert.equal(sniffFileKind(bytes('RIFF\x10\0\0\0WEBPVP8 ' + '\0'.repeat(16))), 'webp');
  assert.equal(sniffFileKind(wholePdf), 'pdf');
  assert.equal(sniffFileKind(bytes('<!doctype html>' + ' '.repeat(20))), 'unknown');
});

test('a file encrypted by a protected work app is recognised', () => {
  // A PDF attachment saved from work Outlook (Intune app protection) on a phone
  assert.equal(sniffFileKind(bytes('\x0eMSMAMARPC' + '\x01\x02'.repeat(20))), 'managed-encrypted');
});
