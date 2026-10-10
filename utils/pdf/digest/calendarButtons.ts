/**
 * "+ Outlook" / "+ Google" buttons (screen only), and the other dates of a series for
 * the "Also on" rows that carry their own small buttons.
 */
import { isMultiDayEvent } from '../../date';
import { type DigestEventGroup, monthShort } from '../../digestGrouping';
import { toDate, WEEKDAYS_LONG, clock, isAllDay } from '../../digestText.ts';
import { type Rgb } from '../../../constants/categoryColors';
import { createGoogleCalendarUrl, createOutlookWebUrl } from '../links';
import { BRAND, WHITE, BRAND_TINT_BORDER } from '../theme';
import type { DigestContext } from './context';

export type CalendarLinkEvent = Parameters<typeof createGoogleCalendarUrl>[0];

/** Other dates of a series, each with its own time and venue (for "Also on") */
export const otherDatesOf = (group: DigestEventGroup) => {
  const ev = group.event;
  const firstPlace = ev.location?.trim() ?? '';
  return group.occurrences.slice(1).map((o) => {
    const s = toDate(o.date) || toDate(ev.date) || new Date();
    const e = toDate(o.endDate);
    const place = o.location?.trim() || firstPlace;
    return {
      date: `${WEEKDAYS_LONG[s.getDay()].slice(0, 3)} ${s.getDate()} ${monthShort(s)}`,
      time: isAllDay(s, e) ? 'All day' : e && !isMultiDayEvent(s, e) ? `${clock(s)} – ${clock(e)}` : clock(s),
      // Only a venue that differs from the card's own is printed (repeating it just got cut off)
      place: place !== firstPlace ? place : '',
      calendarEvent: { ...ev, date: o.date, endDate: o.endDate, location: place }
    };
  });
};

// Outlined in raspberry, like the site's buttons
export const calendarLinks = (calendarEvent: CalendarLinkEvent): Array<{ label: string; url: string; fg: Rgb; bg: Rgb }> => [
  { label: '+ Outlook', url: createOutlookWebUrl(calendarEvent), fg: BRAND, bg: WHITE },
  { label: '+ Google', url: createGoogleCalendarUrl(calendarEvent), fg: BRAND, bg: WHITE }
];

/** Small "+ Outlook" / "+ Google" buttons in a row of "Also on" dates */
const ROW_BTN_PAD = 1.6;
const ROW_BTN_GAP = 1;

export const rowButtonsWidth = ({ doc, kit: { font } }: DigestContext, fs: number): number => {
  font('semibold', fs);
  return doc.getTextWidth('+ Outlook') + doc.getTextWidth('+ Google') + ROW_BTN_PAD * 4 + ROW_BTN_GAP;
};

/** Draws them (screen only) ending at `right`, centred on the row whose text baseline is `rowY` */
export const rowButtons = (ctx: DigestContext, right: number, rowY: number, calendarEvent: CalendarLinkEvent, fs: number, bh: number) => {
  const { doc, screenOnly, kit: { color, pill } } = ctx;
  let x = right - rowButtonsWidth(ctx, fs);
  screenOnly(() => {
    calendarLinks(calendarEvent).forEach((b) => {
      const bw = doc.getTextWidth(b.label) + ROW_BTN_PAD * 2;
      const by = rowY - 0.9 - bh / 2;
      pill(x, by, bw, bh, b.bg, BRAND_TINT_BORDER);
      color(b.fg);
      doc.text(b.label, x + ROW_BTN_PAD, rowY - 0.35);
      doc.link(x, by, bw, bh, { url: b.url });
      x += bw + ROW_BTN_GAP;
    });
  });
};
