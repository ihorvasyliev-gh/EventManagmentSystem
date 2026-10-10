/**
 * Headings between the events: a banner per week (periods over a week), and in the
 * compact table a shaded row per day, repeated as "(continued)" after a page break.
 */
import { monthShort } from '../../digestGrouping';
import { MONTHS_LONG, WEEKDAYS_LONG, startOfLocalDay } from '../../digestText.ts';
import { addDays, dayKeyOf, dayCountInclusive } from '../dates';
import { BRAND, INK, MUTED, BG, WHITE, BRAND_LIGHT } from '../theme';
import type { Block, DigestContext } from './context';

export const showsWeekBanners = ({ periodStart, periodEnd }: DigestContext): boolean =>
  dayCountInclusive(periodStart, periodEnd) > 7;

/** Weeks run Monday to Sunday, like the rows of "At a glance" (the first and last are cut to the period) */
export const weekIndexOf = ({ gridStart }: DigestContext, d: Date): number =>
  Math.floor(Math.round((startOfLocalDay(d).getTime() - gridStart.getTime()) / 86400000) / 7);

/** "TODAY" / "TOMORROW" relative to the issue date */
export const relativeDayLabel = ({ today }: DigestContext, d: Date): string | null => {
  const diff = Math.round((startOfLocalDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return null;
};

// Weeks relative to the issue date: the old "WEEK 2" counted from the period start, so a
// digest whose first days were empty opened on "Week 2"
const relativeWeekLabel = ({ today }: DigestContext, monday: Date): string | null => {
  const thisMonday = addDays(today, -((today.getDay() + 6) % 7));
  const diff = Math.round((monday.getTime() - thisMonday.getTime()) / (7 * 86400000));
  if (diff === 0) return 'THIS WEEK';
  if (diff === 1) return 'NEXT WEEK';
  return null;
};

export const weekBanner = (ctx: DigestContext, weekIndex: number, h: number): Block => {
  const { doc, periodStart, periodEnd, gridStart, geo: { W, M }, kit: { font, color, stroke, spaced, pill } } = ctx;
  const periodDayStart = startOfLocalDay(periodStart);
  const monday = addDays(gridStart, weekIndex * 7);
  const wStart = monday < periodDayStart ? periodDayStart : monday;
  const sunday = addDays(monday, 6);
  const lastDay = startOfLocalDay(periodEnd);
  const wEnd = sunday > lastDay ? lastDay : sunday;
  const range = wStart.getTime() === wEnd.getTime()
    ? `${WEEKDAYS_LONG[wStart.getDay()]} ${wStart.getDate()} ${MONTHS_LONG[wStart.getMonth()]}`
    : wStart.getMonth() === wEnd.getMonth()
      ? `${wStart.getDate()} – ${wEnd.getDate()} ${MONTHS_LONG[wEnd.getMonth()]}`
      : `${wStart.getDate()} ${monthShort(wStart)} – ${wEnd.getDate()} ${monthShort(wEnd)}`;
  const label = relativeWeekLabel(ctx, monday);
  return {
    h,
    keepWithNext: true,
    draw: (y) => {
      let x = M;
      if (label) {
        font('bold', 6.6);
        const lw = doc.getTextWidth(label) + 0.5 * (label.length - 1) + 6;
        pill(M, y + 2.6, lw, 5.4, BRAND);
        color(WHITE);
        spaced(label, M + 3, y + 6.25, 0.5);
        x += lw + 3;
      }
      font('bold', 9.5);
      color(INK);
      doc.text(range, x, y + 6.6);
      const rw = doc.getTextWidth(range);
      stroke(BRAND_LIGHT, 0.3);
      doc.line(x + rw + 3, y + 5.3, W - M, y + 5.3);
    }
  };
};

/** Compact table: a shaded row per day */
export const dayHeader = (ctx: DigestContext, day: Date, count: number): Block => {
  const { doc, today, geo: { W, M, CW }, kit: { font, color, fill, spaced } } = ctx;
  const key = dayKeyOf(day);
  const isToday = day.getTime() === today.getTime();
  return {
    h: 8.5,
    keepWithNext: true,
    isDayHeader: true,
    dayKey: key,
    draw: (y) => {
      const countLabel = count === 1 ? '1 event' : `${count} events`;
      const rel = relativeDayLabel(ctx, day);
      fill(BG);
      doc.rect(M, y, CW, 7, 'F');
      fill(BRAND);
      doc.rect(M, y, isToday ? 1.6 : 0.9, 7, 'F');
      font('bold', 8);
      color(INK);
      const label = `${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]}`;
      doc.text(label, M + 3, y + 4.7);
      if (rel) {
        const lx = M + 3 + doc.getTextWidth(label) + 2.5;
        font('bold', 5.8);
        color(BRAND);
        spaced(rel, lx, y + 4.6, 0.3);
      }
      font('medium', 7);
      color(MUTED);
      doc.text(countLabel, W - M - 2, y + 4.7, { align: 'right' });
    }
  };
};

/** Compact table: the day's row again at the top of the page it carries over onto */
export const continuedHeader = ({ doc, geo: { M, CW }, kit: { font, color, fill } }: DigestContext, dayKey: string): Block => {
  const [yy, mm, dd] = dayKey.split('-').map(Number);
  const day = new Date(yy, mm - 1, dd);
  return {
    h: 8.5,
    keepWithNext: true,
    draw: (y) => {
      fill(BG);
      doc.rect(M, y, CW, 7, 'F');
      font('semibold', 8.5);
      color(INK);
      const label = `${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]}`;
      doc.text(label, M + 3, y + 4.7);
      const labelW = doc.getTextWidth(label);
      font('regular', 7.5);
      color(MUTED);
      doc.text('(continued)', M + 3 + labelW + 1.5, y + 4.7);
    }
  };
};
