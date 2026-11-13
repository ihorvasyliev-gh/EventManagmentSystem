/**
 * Compact layout: a dense table with a row per event (time, event, venue, category)
 * under a shaded row per day.
 */
import { isMultiDayEvent } from '../../date';
import { type DigestEventGroup, monthShort, summarizeSeries } from '../../digestGrouping';
import { toDate, clock, isAllDay } from '../../digestText.ts';
import { getCategoryRgb, type Rgb } from '../../../constants/categoryColors';
import { createGoogleCalendarUrl, createOutlookWebUrl, createGoogleMapsUrl } from '../links';
import { BRAND, INK, BODY, MUTED, FAINT, BORDER, BG, PLACE, WHITE, GREEN_DARK, GREEN_TINT, GREEN_TINT_BORDER } from '../theme';
import type { Block, DigestContext } from './context';
import { otherDatesOf, type CalendarLinkEvent } from './calendarButtons';
import { seriesDates } from './seriesDates';

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

/** "+ Outlook · + Google" as text links from `x` on the baseline `y`: the table has no buttons */
const calendarTextLinks = ({ doc, kit: { font, color } }: DigestContext, calendarEvent: CalendarLinkEvent, x: number, y: number, fs: number) => {
  font('semibold', fs);
  color(BRAND);
  doc.text('+ Outlook', x, y);
  const ow = doc.getTextWidth('+ Outlook');
  doc.link(x, y - 2.6, ow, 3.4, { url: createOutlookWebUrl(calendarEvent) });
  color(FAINT);
  doc.text('·', x + ow + 1.6, y);
  color(BRAND);
  doc.text('+ Google', x + ow + 3.6, y);
  doc.link(x + ow + 3.6, y - 2.6, doc.getTextWidth('+ Google'), 3.4, { url: createGoogleCalendarUrl(calendarEvent) });
};

export const compactRow = (ctx: DigestContext, group: DigestEventGroup, groupIndex: number, dayKey: string): Block => {
  const { doc, screenOnly, geo: { M, CW } } = ctx;
  const { font, txt, color, stroke, spaced, fitLines, truncate, drawLinkedLines, pill, categoryMark } = ctx.kit;
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

  // "Also on" table under the row, across the event and venue columns (a long series summed up)
  const series = summarizeSeries(group);
  const seriesLayout = series ? seriesDates(ctx, series, COL.category - 3 - COL.event, 6.6) : null;
  const otherDates = series ? [] : otherDatesOf(group);
  const A_ROW = 3.9;
  font('semibold', 6.6);
  const aDateW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.date))) + 3;
  font('regular', 6.6);
  const aTimeW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.time))) + 3;
  const alsoRows = seriesLayout ? seriesLayout.rows : otherDates.length;
  const alsoH = alsoRows ? 1.5 + 3 + alsoRows * A_ROW : 0;

  const TL = 3.7;
  let contentH = titleLines.length * TL;
  if (descLine) contentH += 3.3;
  contentH += 3.5;
  const mainH = Math.max(3.2 + contentH, 3.2 + venueLines.length * 3.3);
  const isNew = ctx.newIds.has(ev.id);
  const isUpdated = ctx.updatedIds.has(ev.id);
  // UPDATED and NEW labels go under the category
  const h = Math.max(isNew || isUpdated ? 13.6 : 11.5, mainH + alsoH + 2.4);

  return {
    h,
    dayKey,
    group: groupIndex,
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
      screenOnly(() => calendarTextLinks(ctx, ev, COL.event, ly, 6.4));

      // Venue
      if (venueLines.length) {
        font('regular', 7.3);
        color(PLACE);
        doc.text(venueLines, COL.venue, y + 5.6, { lineHeightFactor: 1.3 });
        doc.link(COL.venue, y + 2.6, venueW, venueLines.length * 3.3 + 1, { url: createGoogleMapsUrl(ev.location) });
      }

      // Also on
      if (alsoRows) {
        const left = COL.event;
        let ay = y + mainH + 1.5 + 2.4;
        font('bold', 5.8);
        color(BRAND);
        const labelW = spaced('ALSO ON', left, ay, 0.3);
        seriesLayout?.draw(left, ay, left + labelW + 2, ay + A_ROW, A_ROW);
        // Each date reads along the table's own columns: its day and time under the event, with the
        // same "+ Outlook · + Google" links as the row, and a venue of its own under the venue
        const timeX = left + aDateW;
        const linksX = timeX + aTimeW;
        const placeW = M + CW - 2 - COL.venue;
        otherDates.forEach((o) => {
          ay += A_ROW;
          font('semibold', 6.6);
          color(INK);
          doc.text(o.date, left, ay);
          font('regular', 6.6);
          color(BODY);
          doc.text(o.time, timeX, ay);
          const place = txt(o.place);
          if (place) {
            color(PLACE);
            const shown = truncate(place, placeW);
            doc.text(shown, COL.venue, ay);
            doc.link(COL.venue, ay - 2.7, doc.getTextWidth(shown), 3.5, { url: createGoogleMapsUrl(o.place) });
          }
          screenOnly(() => calendarTextLinks(ctx, o.calendarEvent, linksX, ay, 6));
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
      let lx = COL.category;
      const label = (text: string, fg: Rgb, bg: Rgb, border: Rgb) => {
        font('bold', 5.6);
        const lw = doc.getTextWidth(text) + 0.3 * (text.length - 1) + 3.6;
        pill(lx, y + 8.4, lw, 3.8, bg, border);
        color(fg);
        spaced(text, lx + 1.8, y + 11.1, 0.3);
        lx += lw + 1.2;
      };
      if (isUpdated) label('UPDATED', WHITE, BRAND, BRAND);
      if (isNew) label('NEW', GREEN_DARK, GREEN_TINT, GREEN_TINT_BORDER);
    }
  };
};
