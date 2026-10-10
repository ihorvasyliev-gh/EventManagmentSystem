/** Dates as the digest and the WhatsApp text write them */
import { formatLocalDate } from '../date';
import { monthShort } from '../digestGrouping';
import { toDate, clock, startOfLocalDay } from '../digestText.ts';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Fixed English abbreviations ("Sep", not the en-IE "Sept")
export const formatDateRange = (start: Date | string, end: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  const fmt = (d: Date) => `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
  const sStr = s ? fmt(s) : '';
  const eStr = e ? fmt(e) : '';
  return sStr && eStr ? `${sStr} – ${eStr}` : sStr || eStr;
};

export const formatEventTime = (start: Date | string, end?: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  const sStr = s ? clock(s) : '';
  if (e) {
    const eStr = clock(e);
    return sStr ? `${sStr} – ${eStr}` : eStr;
  }
  return sStr;
};

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const dayKeyOf = (d: Date): string => formatLocalDate(d);

export const dayCountInclusive = (start: Date, end: Date): number =>
  Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
