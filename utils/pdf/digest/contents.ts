/**
 * "In this digest": for periods too long for "At a glance", page 1 lists every event
 * with the page its card is on (one or two columns; the rest summed up as "and N more").
 */
import { monthShort } from '../../digestGrouping';
import { toDate, WEEKDAYS_LONG, clock, isAllDay } from '../../digestText.ts';
import { INK, MUTED, FAINT, BORDER } from '../theme';
import type { DigestContext } from './context';

export interface ContentsPlan {
  show: boolean;
  cols: number;
  /** Events listed by name */
  shown: number;
  /** Events summed up in the last row */
  more: number;
  rows: number;
  height: number;
}

const HEAD_H = 7;
const ROW_H = 5.2;

export const planContents = (ctx: DigestContext, glanceShown: boolean): ContentsPlan => {
  const { isExecutive, groups, geo: { PAGE_BOTTOM, HERO_BOTTOM } } = ctx;
  const show = isExecutive && !glanceShown && groups.length > 1;
  const maxRows = Math.floor((PAGE_BOTTOM - 8 - HERO_BOTTOM - HEAD_H) / ROW_H);
  const cols = groups.length > maxRows ? 2 : 1;
  const capacity = maxRows * cols;
  const shown = show ? (groups.length > capacity ? capacity - 1 : groups.length) : 0;
  const more = show ? groups.length - shown : 0;
  const rows = Math.ceil((shown + (more ? 1 : 0)) / cols);
  const height = show ? HEAD_H + rows * ROW_H + 6 : 0;
  return { show, cols, shown, more, rows, height };
};

export const drawContents = (
  ctx: DigestContext,
  plan: ContentsPlan,
  top: number,
  cardAt: Map<number, { page: number; y: number }>
) => {
  const { doc, groups, periodStart, geo: { W, M, CW }, kit: { font, color, stroke, spaced, truncate, txt, eyebrow, categoryMark } } = ctx;
  const { cols: indexCols, shown: indexShown, more: indexMore, rows: indexRows } = plan;
  const gutter = 6;
  const colW = indexCols === 2 ? (CW - gutter) / 2 : CW;
  eyebrow('IN THIS DIGEST', M, top + 3, indexCols === 2 ? M + colW - 12 : W - M - 12);
  for (let c = 0; c < indexCols; c++) {
    font('semibold', 6.3);
    color(FAINT);
    spaced('PAGE', M + c * (colW + gutter) + colW, top + 3, 0.4, 'right');
  }
  const rowsTop = top + HEAD_H - 1.5;
  stroke(BORDER, 0.3);
  doc.line(M, rowsTop, M + CW, rowsTop);

  const cell = (i: number) => {
    const col = Math.floor(i / indexRows);
    const row = i % indexRows;
    return { x: M + col * (colW + gutter), y: rowsTop + row * ROW_H };
  };

  for (let i = 0; i < indexShown; i++) {
    const g = groups[i];
    const { x, y } = cell(i);
    const base = y + 3.6;
    if (i % indexRows > 0) {
      stroke(BORDER, 0.15);
      doc.line(x, y, x + colW, y);
    }
    const s = toDate(g.event.date) || periodStart;
    font('semibold', 7.3);
    color(INK);
    doc.text(`${WEEKDAYS_LONG[s.getDay()].slice(0, 3)} ${s.getDate()} ${monthShort(s)}`, x, base);
    font('medium', 7.3);
    color(MUTED);
    doc.text(isAllDay(s, toDate(g.event.endDate)) ? 'All day' : clock(s), x + 19, base);
    categoryMark(g.event.category, x + 32, base - 1.05, 0.95, false);

    const at = cardAt.get(i);
    const pageLabel = at ? String(at.page) : '';
    font('semibold', 7.3);
    const pageW = doc.getTextWidth(pageLabel);
    const extraCount = g.occurrences.length - 1;
    const extra = extraCount > 0 ? `+${extraCount} more ${extraCount === 1 ? 'date' : 'dates'}` : '';
    font('regular', 6.8);
    const extraW = extra ? doc.getTextWidth(extra) + 2 : 0;
    font('medium', 7.6);
    const title = truncate(txt(g.event.title) || 'Untitled event', colW - 34.5 - pageW - 4 - extraW);
    color(INK);
    doc.text(title, x + 34.5, base);
    if (extra) {
      const tx = x + 34.5 + doc.getTextWidth(title) + 2;
      font('regular', 6.8);
      color(MUTED);
      doc.text(extra, tx, base);
    }
    font('semibold', 7.3);
    color(MUTED);
    doc.text(pageLabel, x + colW, base, { align: 'right' });
    if (at) doc.link(x, y, colW, ROW_H, { pageNumber: at.page, top: Math.max(0, at.y - 4) });
  }
  if (indexMore) {
    const { x, y } = cell(indexShown);
    stroke(BORDER, 0.15);
    doc.line(x, y, x + colW, y);
    font('medium', 7.3);
    color(MUTED);
    doc.text(`and ${indexMore} more ${indexMore === 1 ? 'event' : 'events'} on the following pages`, x, y + 3.6);
  }
  stroke(BORDER, 0.3);
  doc.line(M, rowsTop + indexRows * ROW_H, M + CW, rowsTop + indexRows * ROW_H);
};
