/**
 * Page furniture: page 1's title and totals, the header of continuation pages, the
 * footers, and the box shown when the period has no events.
 */
import { monthShort } from '../../digestGrouping';
import { WEEKDAYS_LONG, formatLongRange } from '../../digestText.ts';
import { type Rgb } from '../../../constants/categoryColors';
import { formatDateRange } from '../dates';
import { BRAND, GREEN, GREEN_DARK, INK, BODY, MUTED, BORDER, BG } from '../theme';
import type { DigestContext } from './context';

/** The logo, or the name in type if it couldn't be loaded; returns the width used */
const drawLogo = (ctx: DigestContext, x: number, y: number, h: number): number => {
  const { doc, logo, kit: { font, color } } = ctx;
  if (logo) {
    try {
      const w = h * logo.aspectRatio;
      doc.addImage(logo.dataUrl, logo.format, x, y, w, h, 'ccp-logo', 'FAST');
      return w;
    } catch {
      // fall through to the wordmark
    }
  }
  font('bold', h * 0.9);
  color(BRAND);
  doc.text('CORK CITY PARTNERSHIP', x, y + h * 0.7);
  return doc.getTextWidth('CORK CITY PARTNERSHIP');
};

// Deliberately light: white paper, a thin raspberry and green stripe (the site's colours)
// and dark text, so the digest prints cheaply and doesn't shout on screen.
const drawBrandStripe = ({ doc, geo: { W }, kit: { fill } }: DigestContext) => {
  fill(BRAND);
  doc.rect(0, 0, W, 1.8, 'F');
  fill(GREEN);
  doc.rect(W * 0.72, 0, W * 0.28, 1.8, 'F');
};

/** Page 1: logo, "Upcoming Events" and the period */
export const drawHero = (ctx: DigestContext) => {
  const { doc, periodStart, periodEnd, geo: { W, M }, kit: { font, color, spaced, txt, stroke } } = ctx;
  drawBrandStripe(ctx);
  drawLogo(ctx, M, 10, 13);

  font('bold', 7);
  color(BRAND);
  spaced('EVENTS DIGEST', W - M, 14.5, 0.6, 'right');
  font('regular', 8);
  color(MUTED);
  const issued = new Date();
  doc.text(`Issued ${WEEKDAYS_LONG[issued.getDay()].slice(0, 3)} ${issued.getDate()} ${monthShort(issued)} ${issued.getFullYear()}`, W - M, 19.5, { align: 'right' });

  font('semibold', 25);
  color(INK);
  doc.text('Upcoming Events', M, 37, { charSpace: 0.15 });
  font('medium', 10.5);
  color(BODY);
  doc.text(txt(formatLongRange(periodStart, periodEnd)), M, 44);

  stroke(BORDER, 0.3);
  doc.line(M, 49, W - M, 49);
};

// Totals sit right-aligned beside the title, in the space the title leaves free
const STAT_Y = 31;
const STAT_H = 13;
const STAT_GAP = 5; // either side of the separators

export const drawStats = (ctx: DigestContext) => {
  const { doc, groups, eventDays, venues, geo: { W, M }, kit: { font, color, fill, stroke } } = ctx;
  const stats: Array<{ value: string; label: string; accent: Rgb }> = [
    { value: String(groups.length), label: groups.length === 1 ? 'Event' : 'Events', accent: BRAND },
    { value: String(eventDays.size), label: eventDays.size === 1 ? 'Day with events' : 'Days with events', accent: GREEN },
    { value: String(venues.size), label: venues.size === 1 ? 'Venue' : 'Venues', accent: MUTED }
  ];
  const widths = stats.map((s) => {
    font('bold', 15);
    const vw = doc.getTextWidth(s.value);
    font('medium', 7.5);
    return 3.5 + Math.max(vw, doc.getTextWidth(s.label));
  });
  let x = W - M - widths.reduce((a, b) => a + b, 0) - STAT_GAP * 2 * (stats.length - 1);
  stats.forEach((s, i) => {
    if (i > 0) {
      stroke(BORDER, 0.3);
      doc.line(x - STAT_GAP, STAT_Y + 1, x - STAT_GAP, STAT_Y + STAT_H - 1);
    }
    fill(s.accent);
    doc.roundedRect(x, STAT_Y + 2.2, 0.9, STAT_H - 4.4, 0.45, 0.45, 'F');
    font('bold', 15);
    color(INK);
    doc.text(s.value, x + 3.5, STAT_Y + 7.4);
    font('medium', 7.5);
    color(MUTED);
    doc.text(s.label, x + 3.5, STAT_Y + 11.4);
    x += widths[i] + STAT_GAP * 2;
  });
};

/** Continuation pages: a smaller logo, the title and the period */
export const drawPageHeader = (ctx: DigestContext) => {
  const { doc, periodStart, periodEnd, geo: { W, M }, kit: { font, color, txt, stroke } } = ctx;
  drawBrandStripe(ctx);
  drawLogo(ctx, M, 8, 7.5);
  font('semibold', 10);
  color(INK);
  doc.text('Upcoming Events', W - M, 11.2, { align: 'right' });
  font('regular', 7.5);
  color(MUTED);
  doc.text(txt(formatDateRange(periodStart, periodEnd)), W - M, 15.2, { align: 'right' });
  stroke(BORDER, 0.3);
  doc.line(M, 19.5, W - M, 19.5);
};

/** Every page: the organisation, its strapline and "Page n of N" */
export const drawFooters = ({ doc, geo: { W, H, M }, kit: { font, color, stroke } }: DigestContext) => {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const y = H - 9;
    stroke(BORDER, 0.3);
    doc.line(M, y - 4.5, W - M, y - 4.5);
    font('semibold', 7);
    color(INK);
    doc.text('Cork City Partnership CLG', M, y);
    let fx = M + doc.getTextWidth('Cork City Partnership CLG');
    // The logo's strapline: green words, raspberry bars
    font('regular', 7);
    color(MUTED);
    doc.text('  ·  ', fx, y);
    fx += doc.getTextWidth('  ·  ');
    ['Education', 'Employment', 'Empowerment'].forEach((word, i) => {
      if (i > 0) {
        color(BRAND);
        doc.text(' | ', fx, y);
        fx += doc.getTextWidth(' | ');
      }
      color(GREEN_DARK);
      doc.text(word, fx, y);
      fx += doc.getTextWidth(word);
    });
    font('medium', 7);
    color(MUTED);
    doc.text(`Page ${p} of ${total}`, W - M, y, { align: 'right' });
  }
};

/** A period with nothing on */
export const drawNoEvents = ({ doc, geo: { W, M, CW }, kit: { font, color, fill, stroke, leaf } }: DigestContext, top: number) => {
  const boxY = top + 4;
  fill(BG);
  stroke(BORDER, 0.3);
  doc.setLineDashPattern([1.2, 1.2], 0);
  leaf(M, boxY, CW, 34, 6, 'FD');
  doc.setLineDashPattern([], 0);
  font('bold', 12);
  color(INK);
  doc.text('No events scheduled for this period', W / 2, boxY + 15, { align: 'center' });
  font('regular', 8.5);
  color(MUTED);
  doc.text('New events added to the calendar will appear in the next digest.', W / 2, boxY + 21.5, { align: 'center' });
};
