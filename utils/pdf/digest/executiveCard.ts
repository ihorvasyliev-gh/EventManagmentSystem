/**
 * Executive layout: a card per event (time, category, title, venue, description, contact,
 * other dates and the flyer), with the day's date in a tile beside it.
 */
import { isMultiDayEvent } from '../../date';
import { type DigestEventGroup, monthShort, monthShortUpper } from '../../digestGrouping';
import { toAbsoluteHttpUrl, toDate, WEEKDAYS_LONG, clock, startOfLocalDay, isAllDay } from '../../digestText.ts';
import { getCategoryRgb } from '../../../constants/categoryColors';
import { createGoogleMapsUrl } from '../links';
import { dayKeyOf, dayCountInclusive } from '../dates';
import { BRAND, INK, BODY, MUTED, BORDER, BG, WHITE, PLACE, BRAND_TINT, BRAND_TINT_BORDER, type Density } from '../theme';
import type { Block, DigestContext } from './context';
import { relativeDayLabel } from './headings';
import { calendarLinks, otherDatesOf, rowButtons, rowButtonsWidth } from './calendarButtons';

const TILE_H = 15;

/** The day's date in the column left of its cards (today in raspberry) */
const dateTile = (ctx: DigestContext, day: Date, y: number, mode: 'first' | 'continued') => {
  const { doc, today, geo: { M, TILE_W }, kit: { font, color, fill, stroke, spaced, leaf } } = ctx;
  const isToday = day.getTime() === today.getTime();
  const cx = M + TILE_W / 2;
  fill(isToday ? BRAND : WHITE);
  stroke(isToday ? BRAND : BORDER, 0.35);
  leaf(M, y, TILE_W, TILE_H, 3, 'FD');
  font('semibold', 5.2);
  color(isToday ? WHITE : MUTED);
  spaced(WEEKDAYS_LONG[day.getDay()].slice(0, 3).toUpperCase(), cx, y + 3.9, 0.3, 'center');
  font('bold', 13);
  color(isToday ? WHITE : INK);
  doc.text(String(day.getDate()), cx, y + 9.7, { align: 'center' });
  font('semibold', 5.2);
  color(isToday ? WHITE : MUTED);
  spaced(monthShortUpper(day), cx, y + 13.1, 0.3, 'center');
  const note = mode === 'continued' ? 'CONT.' : relativeDayLabel(ctx, day);
  if (note) {
    font('bold', 4.8);
    color(mode === 'continued' ? MUTED : BRAND);
    spaced(note, cx, y + TILE_H + 3.3, 0.2, 'center');
  }
};

/** Measures and returns the executive card for one event group */
export const executiveCard = (ctx: DigestContext, group: DigestEventGroup, groupIndex: number, density: Density): Block => {
  const { doc, flyers, screenOnly, geo: { CARD_X, CARD_W } } = ctx;
  const { font, txt, color, fill, stroke, spaced, fitLines, truncate, drawLinkedLines, pill, leaf, drawPin, categoryMark } = ctx.kit;
  const ev = group.event;
  const cat = getCategoryRgb(ev.category);
  const flyer = flyers.get(ev.id);
  const start = toDate(ev.date) || new Date();
  const end = toDate(ev.endDate);
  const multi = !!end && isMultiDayEvent(start, end);
  const allDay = isAllDay(start, end);
  const day = startOfLocalDay(start);

  const ACCENT = 1.4;
  const PAD_Y = density.cardPadY;
  const mainX = CARD_X + ACCENT + 4.6;
  const FLYER_W = 30;
  const mainRight = CARD_X + CARD_W - 5 - (flyer ? FLYER_W + 5 : 0);
  const mainW = mainRight - mainX;

  // Title
  font('bold', 12);
  const titleLines: string[] = doc.splitTextToSize(txt(ev.title) || 'Untitled event', mainW);
  const TITLE_LH = 5.1;

  // Venue
  font('medium', 8);
  const venue = txt(ev.location);
  const venueLines: string[] = venue ? doc.splitTextToSize(venue, mainW - 3.6) : [];
  const VENUE_LH = 3.7;

  // Description
  font('regular', 8.3);
  const desc = txt(ev.description || '', true);
  const descLines = fitLines(desc, mainW, 16);
  const DESC_LH = 3.85;

  // "Also on": one row per other date with its time, its venue when it differs (links to
  // Google Maps) and small screen-only buttons adding that date to Outlook / Google
  const otherDates = otherDatesOf(group);
  const ALSO_LABEL_H = 3.4;
  const ALSO_ROW_H = 4.8;
  const ALSO_PAD = 1.8;
  const ALSO_BTN_FS = 5.4;
  font('semibold', 7);
  const alsoDateW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.date))) + 3.5;
  font('medium', 7);
  const alsoTimeW = Math.max(0, ...otherDates.map((o) => doc.getTextWidth(o.time))) + 3.5;
  const alsoH = otherDates.length ? ALSO_LABEL_H + ALSO_PAD * 2 + otherDates.length * ALSO_ROW_H - 1 : 0;

  const contact = ev.submitterName
    ? txt(`${ev.submitterName}${ev.submitterEmail ? ` · ${ev.submitterEmail}` : ''}`)
    : '';

  // When: "13:00 – 15:00", "All day" or "10:00 until Sun 18 Oct"
  const when = allDay ? 'All day'
    : !end ? clock(start)
    : multi ? `${clock(start)} until ${WEEKDAYS_LONG[end.getDay()].slice(0, 3)} ${end.getDate()} ${monthShort(end)}`
    : `${clock(start)} – ${clock(end)}`;
  const chips = [
    ...(multi && end ? [`${dayCountInclusive(start, end)} DAYS`] : []),
    ...(group.occurrences.length > 1 ? [`${group.occurrences.length} DATES`] : [])
  ];

  let contentH = 4.2;                                              // time & category row
  contentH += titleLines.length * TITLE_LH - 0.6;
  if (venueLines.length) contentH += 2.2 + venueLines.length * VENUE_LH;
  if (descLines.length) contentH += 3 + descLines.length * DESC_LH;
  if (contact) contentH += 2.4 + 3.3;
  if (otherDates.length) contentH += 3 + alsoH;

  const BTN_H = 4.6;

  let flyerW = 0;
  let flyerH = 0;
  if (flyer) {
    flyerW = FLYER_W;
    flyerH = flyerW / flyer.aspectRatio;
    if (flyerH > density.flyerMaxH) {
      flyerH = density.flyerMaxH;
      flyerW = flyerH * flyer.aspectRatio;
    }
  }
  // Tall enough for the date tile (and its "Today" / "cont." note) beside it
  const h = Math.max(TILE_H + 4.5, PAD_Y * 2 + contentH, flyer ? flyerH + PAD_Y * 2 : 0);

  const block: Block = {
    h: h + density.cardGap,
    dayKey: dayKeyOf(day),
    group: groupIndex,
    draw: (y) => {
      if (block.tile) dateTile(ctx, day, y, block.tile);

      // Leaf-shaped card (the site's boxes) with a category-coloured left edge
      const r = 5;
      fill(cat.accent);
      leaf(CARD_X, y, CARD_W, h, r, 'F');
      fill(WHITE);
      leaf(CARD_X + ACCENT, y, CARD_W - ACCENT, h, r, 'F');
      stroke(BORDER, 0.25);
      leaf(CARD_X, y, CARD_W, h, r, 'S');

      // Time, then category and chips; "+ Outlook" / "+ Google" on the right (screen only)
      let cy = y + PAD_Y + 2.8;
      let buttonsLeft = mainRight;
      font('semibold', 6.2);
      screenOnly(() => calendarLinks(ev).reverse().forEach((b) => {
        const bw = doc.getTextWidth(b.label) + 5.4;
        const bx = buttonsLeft - bw;
        pill(bx, cy - 3.45, bw, BTN_H, b.bg, BRAND_TINT_BORDER);
        color(b.fg);
        doc.text(b.label, bx + 2.7, cy - 0.15);
        doc.link(bx, cy - 3.45, bw, BTN_H, { url: b.url });
        buttonsLeft = bx - 1.5;
      }));
      font('bold', 9);
      color(INK);
      doc.text(when, mainX, cy);
      let mx = mainX + doc.getTextWidth(when) + 2.6;
      stroke(BORDER, 0.3);
      doc.line(mx, cy - 2.6, mx, cy + 0.3);
      mx += 2.6;
      font('bold', 5.8);
      const chipW = chips.reduce((sum, c) => sum + doc.getTextWidth(c) + 0.3 * (c.length - 1) + 4.2 + 1.5, 0);
      categoryMark(ev.category, mx + 1, cy - 1.1, 1, false);
      font('bold', 6.3);
      color(cat.accent);
      const catLabel = txt(ev.category || 'Event').toUpperCase();
      mx += 3.1 + spaced(truncate(catLabel, Math.max(10, buttonsLeft - mx - 3.1 - chipW - 2)), mx + 3.1, cy, 0.35) + 2;
      chips.forEach((c) => {
        font('bold', 5.8);
        const cw = doc.getTextWidth(c) + 0.3 * (c.length - 1) + 4.2;
        pill(mx, cy - 3.05, cw, 4.2, BRAND_TINT, BRAND_TINT_BORDER);
        color(BRAND);
        spaced(c, mx + 2.1, cy - 0.1, 0.3);
        mx += cw + 1.5;
      });

      // Title
      cy += 1.6 + TITLE_LH - 0.6;
      font('semibold', 12.5);
      color(INK);
      doc.text(titleLines, mainX, cy, { lineHeightFactor: 1.2 });
      cy += (titleLines.length - 1) * TITLE_LH;

      // Venue (links to Google Maps)
      if (venueLines.length) {
        cy += 2.2 + VENUE_LH;
        drawPin(mainX, cy, PLACE);
        font('medium', 8);
        color(PLACE);
        doc.text(venueLines, mainX + 3.6, cy, { lineHeightFactor: 1.3 });
        const linkW = Math.min(mainW, Math.max(...venueLines.map((l) => doc.getTextWidth(l))) + 4);
        doc.link(mainX, cy - 3, linkW, venueLines.length * VENUE_LH + 0.6, { url: createGoogleMapsUrl(ev.location) });
        cy += (venueLines.length - 1) * VENUE_LH;
      }

      // Description (printed in full up to 16 lines)
      if (descLines.length) {
        cy += 3 + DESC_LH;
        font('regular', 8.3);
        drawLinkedLines(descLines, desc, mainX, cy, DESC_LH, BODY);
        cy += (descLines.length - 1) * DESC_LH;
      }

      // Contact
      if (contact) {
        cy += 2.4 + 3.3;
        font('semibold', 7);
        color(MUTED);
        doc.text('Contact', mainX, cy);
        const lw = doc.getTextWidth('Contact') + 1.8;
        font('regular', 7);
        drawLinkedLines([truncate(contact, mainW - lw)], contact, mainX + lw, cy, 0, BODY);
      }

      // Also on
      if (otherDates.length) {
        const top = cy + 3;
        const boxW = mainRight - mainX;
        const left = mainX + 2.5;
        const right = mainX + boxW - 2.5;
        fill(BG);
        stroke(BORDER, 0.2);
        leaf(mainX, top, boxW, alsoH, 2.5, 'FD');
        font('bold', 6.3);
        color(BRAND);
        spaced('ALSO ON', left, top + ALSO_PAD + 2.3, 0.3);
        const timeX = left + alsoDateW;
        const placeX = timeX + alsoTimeW;
        const placeW = right - rowButtonsWidth(ctx, ALSO_BTN_FS) - 2.5 - placeX - 3.6;
        otherDates.forEach((o, i) => {
          const rowY = top + ALSO_PAD + ALSO_LABEL_H + i * ALSO_ROW_H + 3.2;
          if (i > 0) {
            stroke(BORDER, 0.15);
            doc.line(left, rowY - 3.5, right, rowY - 3.5);
          }
          font('semibold', 7);
          color(INK);
          doc.text(o.date, left, rowY);
          font('medium', 7);
          color(BODY);
          doc.text(o.time, timeX, rowY);
          const place = txt(o.place);
          if (place && placeW > 8) {
            drawPin(placeX, rowY, PLACE);
            color(PLACE);
            const shown = truncate(place, placeW);
            doc.text(shown, placeX + 3.6, rowY);
            doc.link(placeX, rowY - 2.9, doc.getTextWidth(shown) + 3.6, 3.8, { url: createGoogleMapsUrl(o.place) });
          }
          rowButtons(ctx, right, rowY, o.calendarEvent, ALSO_BTN_FS, 3.6);
        });
      }

      // Flyer thumbnail
      if (flyer) {
        try {
          const fx = CARD_X + CARD_W - 5 - FLYER_W + (FLYER_W - flyerW) / 2;
          const fy = y + PAD_Y;
          doc.saveGraphicsState();
          leaf(fx, fy, flyerW, flyerH, 3, null);
          doc.clip();
          doc.discardPath();
          doc.addImage(flyer.dataUrl, flyer.format, fx, fy, flyerW, flyerH, flyer.alias, 'FAST');
          doc.restoreGraphicsState();
          stroke(BORDER, 0.3);
          leaf(fx, fy, flyerW, flyerH, 3, 'S');
          const posterLink = toAbsoluteHttpUrl(ev.posterUrl);
          if (posterLink) doc.link(fx, fy, flyerW, flyerH, { url: posterLink });
        } catch (err) {
          console.warn('Could not embed flyer thumbnail in PDF:', err);
        }
      }
    }
  };
  return block;
};
