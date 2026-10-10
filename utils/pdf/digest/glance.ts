/**
 * "At a glance": page 1's month grid with a marker for each event, and the legend of
 * category markers under it. Executive layout only, for periods of up to six weeks.
 */
import { monthShortUpper } from '../../digestGrouping';
import { startOfLocalDay } from '../../digestText.ts';
import { WEEKDAY_HEADERS, addDays, dayKeyOf } from '../dates';
import { INK, BODY, MUTED, FAINT, BORDER, BG, WHITE, BRAND, DAY_WITH_EVENTS, type Density } from '../theme';
import type { DigestContext } from './context';

/** The compact table is about density, so it skips the mini calendar */
export const showsGlance = ({ isExecutive, groups, gridRows }: DigestContext): boolean =>
  isExecutive && groups.length > 0 && gridRows <= 6;

/** Longer periods get shorter rows so the first cards still fit on page 1 */
export const glanceCellH = ({ gridRows }: DigestContext, d: Density): number => d.glanceCellH ?? (gridRows >= 5 ? 11 : 12.5);

export const glanceHeight = (ctx: DigestContext, d: Density): number =>
  showsGlance(ctx) ? 7 + 5 + ctx.gridRows * glanceCellH(ctx, d) : 0;

export const drawGlance = (ctx: DigestContext, top: number, cellH: number) => {
  const { doc, periodStart, periodEnd, today, eventsByDay, gridStart, gridRows, geo: { W, M, CW } } = ctx;
  const { font, color, fill, stroke, spaced, leaf, eyebrow, categoryMark } = ctx.kit;
  eyebrow('AT A GLANCE', M, top + 3, W - M);

  const gy = top + 7;
  const cellW = CW / 7;
  font('semibold', 6.3);
  color(FAINT);
  WEEKDAY_HEADERS.forEach((d, i) => spaced(d, M + i * cellW + cellW / 2, gy + 3, 0.3, 'center'));

  const rowsTop = gy + 5;
  const gridH = gridRows * cellH;
  const GRID_R = 4;
  // A leaf-shaped grid: the cell shading is clipped to its outline
  doc.saveGraphicsState();
  leaf(M, rowsTop, CW, gridH, GRID_R, null);
  doc.clip();
  doc.discardPath();
  fill(WHITE);
  doc.rect(M, rowsTop, CW, gridH, 'F');

  for (let i = 0; i < gridRows * 7; i++) {
    const d = addDays(gridStart, i);
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x = M + col * cellW;
    const y = rowsTop + row * cellH;
    const inRange = d >= startOfLocalDay(periodStart) && d <= startOfLocalDay(periodEnd);
    const key = dayKeyOf(d);
    const dayEvents = inRange ? eventsByDay.get(key) || [] : [];
    const isToday = d.getTime() === today.getTime();

    if (!inRange) {
      fill(BG);
      doc.rect(x, y, cellW, cellH, 'F');
    } else if (dayEvents.length > 0) {
      fill(DAY_WITH_EVENTS);
      doc.rect(x, y, cellW, cellH, 'F');
    }

    // Day number (with month on the 1st and on the first cell)
    const showMonth = d.getDate() === 1 || i === 0;
    if (isToday) {
      // A smaller, higher circle in short rows keeps clear of the event dots
      const short = cellH < 11;
      fill(BRAND);
      doc.circle(x + 4.3, y + (short ? 3.5 : 3.9), short ? 2.3 : 2.55, 'F');
      font('bold', 7.5);
      color(WHITE);
      doc.text(String(d.getDate()), x + 4.3, y + (short ? 4.55 : 4.95), { align: 'center' });
    } else {
      font(dayEvents.length ? 'bold' : 'medium', 7.5);
      color(inRange ? (dayEvents.length ? INK : MUTED) : FAINT);
      doc.text(String(d.getDate()), x + 2.3, y + 5);
    }
    if (showMonth) {
      const numW = isToday ? 7 : doc.getTextWidth(String(d.getDate())) + 3.2;
      font('semibold', 5.8);
      color(inRange ? INK : FAINT);
      doc.text(monthShortUpper(d), x + (isToday ? 1.8 : 2.3) + numW, y + 4.9);
    }

    if (dayEvents.length > 0) {
      // One marker per event (category shape and colour), then a count
      const maxDots = 4;
      dayEvents.slice(0, maxDots).forEach((ev, idx) => {
        categoryMark(ev.category, x + 3.3 + idx * 3.3, y + cellH - 3, 1.3);
      });
      font('semibold', 6);
      color(MUTED);
      const label = dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`;
      doc.text(label, x + cellW - 2, y + cellH - 2.3, { align: 'right' });
    }
  }

  // Grid lines
  stroke(BORDER, 0.2);
  for (let c = 1; c < 7; c++) doc.line(M + c * cellW, rowsTop, M + c * cellW, rowsTop + gridH);
  for (let r = 1; r < gridRows; r++) doc.line(M, rowsTop + r * cellH, M + CW, rowsTop + r * cellH);
  doc.restoreGraphicsState();
  stroke(BORDER, 0.3);
  leaf(M, rowsTop, CW, gridH, GRID_R, 'S');
};

export const legendHeight = ({ categories }: DigestContext): number => (categories.length > 0 ? 8 : 0);

export const drawLegend = ({ doc, categories, geo: { M, CW }, kit: { font, color, txt, categoryMark } }: DigestContext, top: number) => {
  let x = M;
  let y = top + 4.5;
  font('medium', 7);
  categories.forEach((cat) => {
    const label = txt(cat);
    const w = doc.getTextWidth(label) + 6.5;
    if (x + w > M + CW) {
      x = M;
      y += 4.5;
    }
    categoryMark(cat, x + 1.3, y - 1.05, 1.25);
    color(BODY);
    doc.text(label, x + 3.2, y);
    x += w;
  });
};
