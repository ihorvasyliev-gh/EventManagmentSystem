/**
 * Compact layout: a dense table with a row per event (time, event, venue, category)
 * under a shaded row per day.
 */
import { isMultiDayEvent } from '../../date';
import { type DigestEventGroup, monthShort } from '../../digestGrouping';
import { toDate, clock, isAllDay } from '../../digestText.ts';
import { getCategoryRgb } from '../../../constants/categoryColors';
import { createGoogleCalendarUrl, createOutlookWebUrl, createGoogleMapsUrl } from '../links';
import { BRAND, INK, BODY, MUTED, FAINT, BORDER, BG, PLACE } from '../theme';
import type { Block, DigestContext } from './context';
import { otherDatesOf, rowButtons, rowButtonsWidth } from './calendarButtons';

const columns = (M: number) => ({
  time: M + 3,
  event: M + 27,
  venue: M + 107,
  category: M + 141
});

export const TABLE_HEAD_H = 7;

export const drawTableHead = ({ doc, geo: { M, CW }, kit: { font, color, fill, stroke, spaced } }: DigestContext, y: number) => {
  const COL = columns(M);
  fill(BG);
  doc.rect(M, y, CW, TABLE_HEAD_H, 'F');
  stroke(BRAND, 0.4);
  doc.line(M, y + TABLE_HEAD_H, M + CW, y + TABLE_HEAD_H);
  font('bold', 6.5);
  color(BRAND);
  spaced('TIME', COL.time, y + 4.6, 0.4);
  spaced('EVENT', COL.event, y + 4.6, 0.4);
  spaced('VENUE', COL.venue, y + 4.6, 0.4);
  spaced('CATEGORY', COL.category, y + 4.6, 0.4);
};

export const compactRow = (ctx: DigestContext, group: DigestEventGroup, dayKey: string): Block => {
  const { doc, screenOnly, geo: { M, CW } } = ctx;
  const { font, txt, color, stroke, spaced, fitLines, truncate, drawLinkedLines, pill, drawPin, categoryMark } = ctx.kit;
  const COL = columns(M);
  const ev = group.event;
  const cat = getCategoryRgb(ev.category);
  const start = toDate(ev.date) || new Date();
  const end = toDate(ev.endDate);
  const multi = !!end && isMultiDayEvent(start, end);
  const eventW = COL.venue - COL.event - 4;
  const venueW = COL.category - COL.venue - 3;

  font('bold', 8.5);
  const titleLines = fitLines(txt(ev.title) || 'Untitled event', eventW, 2);
  font('regular', 7);
  const descLine = truncate(txt(ev.description || ''), eventW);
  font('regular', 7.3);
  const venueLines = fitLines(txt(ev.location), venueW, 3);

  // "Also on" table under the row, across the event and venue columns
  const otherDates = otherDatesOf(group);
  const A_ROW = 3.9;
  const A_BTN_FS = 5;
  font('semibold', 6.6);
  const aDateW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.date))) + 3;
  font('regular', 6.6);
  const aTimeW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.time))) + 3;
  const alsoH = otherDates.length ? 1.5 + 3 + otherDates.length * A_ROW : 0;

  const TL = 3.7;
  let contentH = titleLines.length * TL;
  if (descLine) contentH += 3.3;
  contentH += 3.5;
  const mainH = Math.max(3.2 + contentH, 3.2 + venueLines.length * 3.3);
  const h = Math.max(11.5, mainH + alsoH + 2.4);

  return {
    h,
    dayKey,
    draw: (y) => {
      stroke(BORDER, 0.2);
      doc.line(M, y + h, M + CW, y + h);

      // Time
      font('bold', 8.3);
      color(INK);
      doc.text(isAllDay(start, end) ? 'All day' : clock(start), COL.time, y + 5.6);
      if (end && !isAllDay(start, end)) {
        font('regular', 7);
        color(MUTED);
        doc.text(multi ? `until ${end.getDate()} ${monthShort(end)}` : `to ${clock(end)}`, COL.time, y + 9);
      }

      // Event
      let ly = y + 5.6;
      font('bold', 8.5);
      color(INK);
      doc.text(titleLines, COL.event, ly, { lineHeightFactor: 1.25 });
      ly += (titleLines.length - 1) * TL;
      if (descLine) {
        ly += 3.4;
        font('regular', 7);
        drawLinkedLines([descLine], txt(ev.description || ''), COL.event, ly, 0, MUTED);
      }
      ly += 3.5;
      screenOnly(() => {
        font('semibold', 6.4);
        color(BRAND);
        doc.text('+ Outlook', COL.event, ly);
        const ow = doc.getTextWidth('+ Outlook');
        doc.link(COL.event, ly - 2.6, ow, 3.4, { url: createOutlookWebUrl(ev) });
        color(FAINT);
        doc.text('·', COL.event + ow + 1.6, ly);
        color(BRAND);
        doc.text('+ Google', COL.event + ow + 3.6, ly);
        doc.link(COL.event + ow + 3.6, ly - 2.6, doc.getTextWidth('+ Google'), 3.4, { url: createGoogleCalendarUrl(ev) });
      });

      // Venue
      if (venueLines.length) {
        font('regular', 7.3);
        color(PLACE);
        doc.text(venueLines, COL.venue, y + 5.6, { lineHeightFactor: 1.3 });
        doc.link(COL.venue, y + 2.6, venueW, venueLines.length * 3.3 + 1, { url: createGoogleMapsUrl(ev.location) });
      }

      // Also on
      if (otherDates.length) {
        const left = COL.event;
        const right = COL.category - 3;
        let ay = y + mainH + 1.5 + 2.4;
        font('bold', 5.8);
        color(BRAND);
        spaced('ALSO ON', left, ay, 0.3);
        const timeX = left + aDateW;
        const placeX = timeX + aTimeW;
        const placeW = right - rowButtonsWidth(ctx, A_BTN_FS) - 2 - placeX - 3.4;
        otherDates.forEach((o) => {
          ay += A_ROW;
          font('semibold', 6.6);
          color(INK);
          doc.text(o.date, left, ay);
          font('regular', 6.6);
          color(BODY);
          doc.text(o.time, timeX, ay);
          const place = txt(o.place);
          if (place && placeW > 8) {
            drawPin(placeX, ay, PLACE);
            color(PLACE);
            const shown = truncate(place, placeW);
            doc.text(shown, placeX + 3.4, ay);
            doc.link(placeX, ay - 2.7, doc.getTextWidth(shown) + 3.4, 3.5, { url: createGoogleMapsUrl(o.place) });
          }
          rowButtons(ctx, right, ay, o.calendarEvent, A_BTN_FS, 3.2);
        });
      }

      // Category pill
      font('semibold', 6.3);
      const catText = truncate(txt(ev.category || 'Event'), M + CW - COL.category - 7);
      const cw = doc.getTextWidth(catText) + 6.2;
      pill(COL.category, y + 2.8, cw, 4.6, cat.tint);
      categoryMark(ev.category, COL.category + 2.1, y + 5.1, 0.85, false);
      color(cat.accent);
      doc.text(catText, COL.category + 3.6, y + 6.05);
    }
  };
};
