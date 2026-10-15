/**
 * Headings between the events: a heading per month for long periods, otherwise a banner per
 * week (periods over a week), and in the compact table a shaded row per day, repeated as
 * "(continued)" after a page break. Dates only: a shared digest is opened for months after it
 * is issued, so nothing in it says "today" or "this week".
 */
import { monthShort } from '../../digestGrouping';
import { MONTHS_LONG, WEEKDAYS_LONG, startOfLocalDay } from '../../digestText.ts';
import { addDays, dayKeyOf, dayCountInclusive } from '../dates';
import { BRAND, INK, MUTED, BG, BRAND_LIGHT } from '../theme';
import type { Block, DigestContext } from './context';

export const showsWeekBanners = (ctx: DigestContext): boolean =>
  !ctx.longPeriod && dayCountInclusive(ctx.periodStart, ctx.periodEnd) > 7;

/** Weeks run Monday to Sunday, like the rows of "At a glance" (the first and last are cut to the period) */
export const weekIndexOf = ({ gridStart }: DigestContext, d: Date): number =>
  Math.floor(Math.round((startOfLocalDay(d).getTime() - gridStart.getTime()) / 86400000) / 7);

/** Months since the period's first month */
export const monthIndexOf = ({ periodStart }: DigestContext, d: Date): number =>
  (d.getFullYear() - periodStart.getFullYear()) * 12 + d.getMonth() - periodStart.getMonth();

/** The first day of a month heading's month */
export const monthOf = ({ periodStart }: DigestContext, monthIndex: number): Date =>
  new Date(periodStart.getFullYear(), periodStart.getMonth() + monthIndex, 1);

/** "15 – 18 October", "26 Oct – 1 Nov" or "Thursday 15 October": a week cut to the period */
export const weekRange = (ctx: DigestContext, weekIndex: number): string => {
  const { periodStart, periodEnd, gridStart } = ctx;
  const periodDayStart = startOfLocalDay(periodStart);
  const monday = addDays(gridStart, weekIndex * 7);
  const wStart = monday < periodDayStart ? periodDayStart : monday;
  const sunday = addDays(monday, 6);
  const lastDay = startOfLocalDay(periodEnd);
  const wEnd = sunday > lastDay ? lastDay : sunday;
  return wStart.getTime() === wEnd.getTime()
    ? `${WEEKDAYS_LONG[wStart.getDay()]} ${wStart.getDate()} ${MONTHS_LONG[wStart.getMonth()]}`
    : wStart.getMonth() === wEnd.getMonth()
      ? `${wStart.getDate()} – ${wEnd.getDate()} ${MONTHS_LONG[wEnd.getMonth()]}`
      : `${wStart.getDate()} ${monthShort(wStart)} – ${wEnd.getDate()} ${monthShort(wEnd)}`;
};

export const weekBanner = (ctx: DigestContext, weekIndex: number, h: number): Block => {
  const { doc, geo: { W, M }, kit: { font, color, stroke } } = ctx;
  const range = weekRange(ctx, weekIndex);
  return {
    h,
    keepWithNext: true,
    draw: (y) => {
      font('bold', 9.5);
      color(INK);
      doc.text(range, M, y + 6.6);
      const rw = doc.getTextWidth(range);
      stroke(BRAND_LIGHT, 0.3);
      doc.line(M + rw + 3, y + 5.3, W - M, y + 5.3);
    }
  };
};

/** Long periods: "November 2026" over a raspberry rule, with the number of events it starts */
export const monthBanner = (ctx: DigestContext, month: Date, count: number, h: number): Block => {
  const { doc, geo: { W, M }, kit: { font, color, stroke, spaced } } = ctx;
  const name = MONTHS_LONG[month.getMonth()];
  const countLabel = `${count} ${count === 1 ? 'EVENT' : 'EVENTS'}`;
  return {
    h,
    keepWithNext: true,
    draw: (y) => {
      const base = y + h - 5.2;
      font('semibold', 15);
      color(INK);
      doc.text(name, M, base);
      const nw = doc.getTextWidth(name);
      font('regular', 10);
      color(MUTED);
      doc.text(String(month.getFullYear()), M + nw + 2.6, base);
      font('bold', 6.5);
      spaced(countLabel, W - M, base, 0.35, 'right');
      stroke(BRAND, 0.45);
      doc.line(M, y + h - 2.6, W - M, y + h - 2.6);
    }
  };
};

/** Compact table: a shaded row per day */
export const dayHeader = (ctx: DigestContext, day: Date, count: number): Block => {
  const { doc, geo: { W, M, CW }, kit: { font, color, fill } } = ctx;
  const key = dayKeyOf(day);
  return {
    h: 8.5,
    keepWithNext: true,
    isDayHeader: true,
    dayKey: key,
    draw: (y) => {
      const countLabel = count === 1 ? '1 event' : `${count} events`;
      fill(BG);
      doc.rect(M, y, CW, 7, 'F');
      fill(BRAND);
      doc.rect(M, y, 0.9, 7, 'F');
      font('bold', 8);
      color(INK);
      doc.text(`${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]}`, M + 3, y + 4.7);
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
