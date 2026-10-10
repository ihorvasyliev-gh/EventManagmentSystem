import type jsPDF from 'jspdf';
import { createScreenOnlyLayer } from '../pdfScreenOnly.ts';
import { type LayoutBlock, paginate, pickLayout } from '../pdfLayout.ts';
import { type Event } from '../../types';
import { formatLocalDate, isMultiDayEvent } from '../date';
import { getCategoryRgb, type Rgb } from '../../constants/categoryColors';
import {
  groupDigestOccurrences,
  type DigestEventGroup,
  monthShort,
  monthShortUpper
} from '../digestGrouping';
import {
  toAbsoluteHttpUrl,
  toDate,
  MONTHS_LONG,
  WEEKDAYS_LONG,
  clock,
  startOfLocalDay,
  isAllDay,
  formatLongRange
} from '../digestText.ts';
import { createGoogleCalendarUrl, createOutlookWebUrl, createGoogleMapsUrl } from './links';
import { loadImageCached, type LoadedPdfFlyer } from './images';
import { loadFontData } from './fonts';
import { registerLato, createPdfKit } from './kit';
import { WEEKDAY_HEADERS, formatDateRange, addDays, dayKeyOf, dayCountInclusive } from './dates';
import {
  BRAND, GREEN, GREEN_DARK, INK, BODY, MUTED, FAINT, BORDER, BG, WHITE, PLACE,
  BRAND_TINT, BRAND_TINT_BORDER, BRAND_LIGHT, DAY_WITH_EVENTS, DENSITIES, type Density
} from './theme';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  /** 'save' downloads the file (default); 'blob' returns it, e.g. for an in-browser preview */
  output?: 'save' | 'blob';
}

interface Block extends LayoutBlock {
  draw: (y: number) => void;
  /** Executive cards: index of the event group (for the contents list) */
  group?: number;
  /**
   * Executive cards: draw the day's date beside the card — on the day's first card, and
   * again ("cont.") on the first card of a page the day carries over onto. Set after pagination.
   */
  tile?: 'first' | 'continued';
}

/**
 * Generate the Upcoming Events Digest PDF.
 * Occurrences of the same event (recurring / multi-date) are merged into one entry
 * shown on its first date, with the remaining dates listed as "Also on".
 */
export const generateEventsDigestPDF = async (
  events: Event[],
  options: BulletinOptions
): Promise<Blob | void> => {
  const { jsPDF: JsPDF } = await import('jspdf');
  const doc: jsPDF = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  // "Add to calendar" buttons show in the viewer but are left off paper when printed
  const screenOnly = createScreenOnlyLayer(doc);

  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 14;
  const CW = W - M * 2;                          // 182
  const PAGE_TOP = 26;                           // content top on continuation pages
  const PAGE_BOTTOM = H - 17;
  // Executive cards sit right of a narrow column holding each day's date
  const TILE_W = 12;
  const CARD_X = M + TILE_W + 3;
  const CARD_W = W - M - CARD_X;                 // 167

  // --- Fonts ---------------------------------------------------------------
  const hasLato = registerLato(doc, await loadFontData());
  const { font, txt, color, fill, stroke, spaced, fitLines, truncate, drawLinkedLines, pill, leaf, eyebrow, drawPin, categoryMark } = createPdfKit(doc, hasLato);

  // --- Data ----------------------------------------------------------------
  const periodStart = toDate(options.startDate) || new Date();
  const periodEnd = toDate(options.endDate) || new Date();
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  // Only published events (drafts / pending submissions are never circulated)
  const inPeriod = events.filter((e) => {
    if (e.status && e.status !== 'published') return false;
    const d = toDate(e.date);
    return !!d && d.getTime() >= startMs && d.getTime() <= endMs;
  });
  const groups = groupDigestOccurrences(inPeriod);
  const isExecutive = options.format === 'executive';
  const today = startOfLocalDay(new Date());

  const [logo, flyers] = await Promise.all([
    // Printed about 55 mm wide: 600 px is still well over 250 dpi
    loadImageCached('/assets/ccp-logo-v2.png', 600),
    (async () => {
      // Keyed by event; the alias is per image, so a flyer shared by several events is embedded once
      const map = new Map<string, LoadedPdfFlyer & { alias: string }>();
      if (!isExecutive) return map;
      await Promise.all(groups.map(async ({ event: ev }) => {
        const url = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (!url) return;
        // Thumbnails are at most 42 mm tall: 600 px keeps them sharp in print (QR codes still scan)
        // and JPEG keeps a PNG flyer from adding a few hundred KB to the email attachment
        const flyer = await loadImageCached(url, 600, true);
        if (flyer) map.set(ev.id, { ...flyer, alias: `flyer-${url}` });
      }));
      return map;
    })()
  ]);

  // Days of the period that have something on (multi-day events cover every day they span)
  const eventsByDay = new Map<string, DigestEventGroup['event'][]>();
  for (const occ of inPeriod) {
    const s = toDate(occ.date)!;
    const e = toDate(occ.endDate);
    const last = e && isMultiDayEvent(s, e) ? startOfLocalDay(e) : startOfLocalDay(s);
    for (let d = startOfLocalDay(s); d <= last; d = addDays(d, 1)) {
      const key = dayKeyOf(d);
      const list = eventsByDay.get(key) || [];
      list.push(occ);
      eventsByDay.set(key, list);
    }
  }
  const venues = new Set(groups.flatMap((g) => g.occurrences.map((o) => o.location?.trim().toLowerCase())).filter(Boolean));
  // Every day of the period something is on, counting each day a multi-day event spans
  const eventDays = new Set(Array.from(eventsByDay.keys()).filter((key) => key >= dayKeyOf(periodStart) && key <= dayKeyOf(periodEnd)));
  const categories = Array.from(new Set(groups.map((g) => g.event.category || 'Other')));

  const logoDraw = (x: number, y: number, h: number): number => {
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

  // --- Page 1: header -------------------------------------------------------
  // Deliberately light: white paper, a thin raspberry and green stripe (the site's colours)
  // and dark text, so the digest prints cheaply and doesn't shout on screen.
  const drawBrandStripe = () => {
    fill(BRAND);
    doc.rect(0, 0, W, 1.8, 'F');
    fill(GREEN);
    doc.rect(W * 0.72, 0, W * 0.28, 1.8, 'F');
  };

  const drawHero = () => {
    drawBrandStripe();
    logoDraw(M, 10, 13);

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
  const drawStats = () => {
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

  // --- "At a glance" mini calendar ------------------------------------------
  const gridStart = (() => {
    const s = startOfLocalDay(periodStart);
    const dow = (s.getDay() + 6) % 7; // Monday = 0
    return addDays(s, -dow);
  })();
  const gridEnd = (() => {
    const e = startOfLocalDay(periodEnd);
    const dow = (e.getDay() + 6) % 7;
    return addDays(e, 6 - dow);
  })();
  const gridRows = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000 + 1) / 7;
  // The compact table is about density, so it skips the mini calendar
  const showGlance = isExecutive && groups.length > 0 && gridRows <= 6;
  // Longer periods get shorter rows so the first cards still fit on page 1
  const glanceCellH = (d: Density) => d.glanceCellH ?? (gridRows >= 5 ? 11 : 12.5);
  const glanceHeight = (d: Density) => showGlance ? 7 + 5 + gridRows * glanceCellH(d) : 0;

  const drawGlance = (top: number, cellH: number) => {
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

  const LEGEND_H = categories.length > 0 ? 8 : 0;
  const drawLegend = (top: number) => {
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

  // --- Continuation page header & footers ---------------------------------
  const drawPageHeader = () => {
    drawBrandStripe();
    logoDraw(M, 8, 7.5);
    font('semibold', 10);
    color(INK);
    doc.text('Upcoming Events', W - M, 11.2, { align: 'right' });
    font('regular', 7.5);
    color(MUTED);
    doc.text(txt(formatDateRange(periodStart, periodEnd)), W - M, 15.2, { align: 'right' });
    stroke(BORDER, 0.3);
    doc.line(M, 19.5, W - M, 19.5);
  };

  const drawFooters = () => {
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

  // --- Blocks ------------------------------------------------------------
  const showWeekBanners = dayCountInclusive(periodStart, periodEnd) > 7;
  const periodDayStart = startOfLocalDay(periodStart);
  // Weeks run Monday to Sunday, like the rows of "At a glance" (the first and last are cut to the period)
  const weekIndexOf = (d: Date) =>
    Math.floor(Math.round((startOfLocalDay(d).getTime() - gridStart.getTime()) / 86400000) / 7);

  // Weeks relative to the issue date: the old "WEEK 2" counted from the period start, so a
  // digest whose first days were empty opened on "Week 2"
  const thisMonday = addDays(today, -((today.getDay() + 6) % 7));
  const relativeWeekLabel = (monday: Date): string | null => {
    const diff = Math.round((monday.getTime() - thisMonday.getTime()) / (7 * 86400000));
    if (diff === 0) return 'THIS WEEK';
    if (diff === 1) return 'NEXT WEEK';
    return null;
  };

  const weekBanner = (weekIndex: number, h: number): Block => {
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
    const label = relativeWeekLabel(monday);
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

  const relativeDayLabel = (d: Date): string | null => {
    const diff = Math.round((startOfLocalDay(d).getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    return null;
  };

  /** Executive layout: the day's date in the column left of its cards (today in raspberry) */
  const TILE_H = 15;
  const dateTile = (day: Date, y: number, mode: 'first' | 'continued') => {
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
    const note = mode === 'continued' ? 'CONT.' : relativeDayLabel(day);
    if (note) {
      font('bold', 4.8);
      color(mode === 'continued' ? MUTED : BRAND);
      spaced(note, cx, y + TILE_H + 3.3, 0.2, 'center');
    }
  };

  /** Compact table: a shaded row per day */
  const dayHeader = (day: Date, count: number): Block => {
    const key = dayKeyOf(day);
    const isToday = day.getTime() === today.getTime();
    return {
      h: 8.5,
      keepWithNext: true,
      isDayHeader: true,
      dayKey: key,
      draw: (y) => {
        const countLabel = count === 1 ? '1 event' : `${count} events`;
        const rel = relativeDayLabel(day);
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

  const continuedHeader = (dayKey: string): Block => {
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

  /** Other dates of a series, each with its own time and venue (for "Also on") */
  const otherDatesOf = (group: DigestEventGroup) => {
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

  type CalendarLinkEvent = Parameters<typeof createGoogleCalendarUrl>[0];
  // Outlined in raspberry, like the site's buttons
  const calendarLinks = (calendarEvent: CalendarLinkEvent): Array<{ label: string; url: string; fg: Rgb; bg: Rgb }> => [
    { label: '+ Outlook', url: createOutlookWebUrl(calendarEvent), fg: BRAND, bg: WHITE },
    { label: '+ Google', url: createGoogleCalendarUrl(calendarEvent), fg: BRAND, bg: WHITE }
  ];

  /** Small "+ Outlook" / "+ Google" buttons in a row of "Also on" dates */
  const ROW_BTN_PAD = 1.6;
  const ROW_BTN_GAP = 1;
  const rowButtonsWidth = (fs: number): number => {
    font('semibold', fs);
    return doc.getTextWidth('+ Outlook') + doc.getTextWidth('+ Google') + ROW_BTN_PAD * 4 + ROW_BTN_GAP;
  };

  /** Draws them (screen only) ending at `right`, centred on the row whose text baseline is `rowY` */
  const rowButtons = (right: number, rowY: number, calendarEvent: CalendarLinkEvent, fs: number, bh: number) => {
    let x = right - rowButtonsWidth(fs);
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

  /** Measures and returns the executive card for one event group */
  const executiveCard = (group: DigestEventGroup, groupIndex: number, density: Density): Block => {
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
        if (block.tile) dateTile(day, y, block.tile);

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
          const placeW = right - rowButtonsWidth(ALSO_BTN_FS) - 2.5 - placeX - 3.6;
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
            rowButtons(right, rowY, o.calendarEvent, ALSO_BTN_FS, 3.6);
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

  // Compact table geometry
  const COL = {
    time: M + 3,
    event: M + 27,
    venue: M + 107,
    category: M + 141
  };
  const TABLE_HEAD_H = 7;
  const drawTableHead = (y: number) => {
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

  const compactRow = (group: DigestEventGroup, dayKey: string): Block => {
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
          const placeW = right - rowButtonsWidth(A_BTN_FS) - 2 - placeX - 3.4;
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
            rowButtons(right, ay, o.calendarEvent, A_BTN_FS, 3.2);
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

  const dayCounts = new Map<string, number>();
  groups.forEach((g) => {
    const key = dayKeyOf(startOfLocalDay(toDate(g.event.date) || periodStart));
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  });

  const buildBlocks = (density: Density): Block[] => {
    const blocks: Block[] = [];
    let lastWeek = -1;
    let lastDay = '';
    groups.forEach((group, i) => {
      const d = toDate(group.event.date) || periodStart;
      const day = startOfLocalDay(d);
      const key = dayKeyOf(day);
      if (showWeekBanners) {
        const wi = weekIndexOf(day);
        if (wi !== lastWeek) {
          lastWeek = wi;
          blocks.push(weekBanner(wi, density.weekBannerH));
        }
      }
      if (isExecutive) {
        // The date sits beside the card (no header row of its own)
        blocks.push(executiveCard(group, i, density));
        return;
      }
      if (key !== lastDay) {
        lastDay = key;
        blocks.push(dayHeader(day, dayCounts.get(key) ?? 1));
      }
      blocks.push(compactRow(group, key));
    });
    return blocks;
  };

  // --- Render ------------------------------------------------------------
  const HERO_BOTTOM = 57;

  // "In this digest": periods too long for "At a glance" list every event with its page
  const showIndex = isExecutive && !showGlance && groups.length > 1;
  const INDEX_HEAD_H = 7;
  const INDEX_ROW_H = 5.2;
  const INDEX_MAX_ROWS = Math.floor((PAGE_BOTTOM - 8 - HERO_BOTTOM - INDEX_HEAD_H) / INDEX_ROW_H);
  const indexCols = groups.length > INDEX_MAX_ROWS ? 2 : 1;
  const indexCapacity = INDEX_MAX_ROWS * indexCols;
  const indexShown = showIndex ? (groups.length > indexCapacity ? indexCapacity - 1 : groups.length) : 0;
  const indexMore = showIndex ? groups.length - indexShown : 0;
  const indexRows = Math.ceil((indexShown + (indexMore ? 1 : 0)) / indexCols);
  const indexHeight = showIndex ? INDEX_HEAD_H + indexRows * INDEX_ROW_H + 6 : 0;

  const drawIndex = (top: number, cardAt: Map<number, { page: number; y: number }>) => {
    const gutter = 6;
    const colW = indexCols === 2 ? (CW - gutter) / 2 : CW;
    eyebrow('IN THIS DIGEST', M, top + 3, indexCols === 2 ? M + colW - 12 : W - M - 12);
    for (let c = 0; c < indexCols; c++) {
      font('semibold', 6.3);
      color(FAINT);
      spaced('PAGE', M + c * (colW + gutter) + colW, top + 3, 0.4, 'right');
    }
    const rowsTop = top + INDEX_HEAD_H - 1.5;
    stroke(BORDER, 0.3);
    doc.line(M, rowsTop, M + CW, rowsTop);

    const cell = (i: number) => {
      const col = Math.floor(i / indexRows);
      const row = i % indexRows;
      return { x: M + col * (colW + gutter), y: rowsTop + row * INDEX_ROW_H };
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
      if (at) doc.link(x, y, colW, INDEX_ROW_H, { pageNumber: at.page, top: Math.max(0, at.y - 4) });
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
    doc.line(M, rowsTop + indexRows * INDEX_ROW_H, M + CW, rowsTop + indexRows * INDEX_ROW_H);
  };

  const listTop = (density: Density) =>
    showGlance ? HERO_BOTTOM + glanceHeight(density) + 2 + LEGEND_H + 5 : HERO_BOTTOM + indexHeight;
  const tableHeadSpace = isExecutive ? 0 : TABLE_HEAD_H + 1;

  const layoutFor = (density: Density) => paginate(buildBlocks(density), {
    firstTop: listTop(density) + tableHeadSpace,
    pageTop: PAGE_TOP + tableHeadSpace,
    pageBottom: PAGE_BOTTOM,
    gapAfter: (block, next) => {
      // Executive: a little more air before the first card of the next day
      if (isExecutive) {
        return block.group !== undefined && next?.group !== undefined && next.dayKey !== block.dayKey ? density.dayGap : 0;
      }
      if (!next?.isDayHeader) return 0;
      return block.dayKey && !block.isDayHeader ? 1.5 : 0;
    },
    continued: isExecutive ? undefined : continuedHeader
  });

  // The compact table has short rows, so it never leaves much of a gap
  const candidates = isExecutive ? DENSITIES : DENSITIES.slice(0, 1);
  const layouts = candidates.map(layoutFor);
  const chosen = pickLayout(layouts);
  const density = candidates[chosen];
  const { pages } = layouts[chosen];

  // Each day's date goes beside its first card, and again on a page the day carries over onto
  const cardAt = new Map<number, { page: number; y: number }>();
  if (isExecutive) {
    let prevDay = '';
    pages.forEach((placements, p) => {
      let firstOnPage = true;
      placements.forEach(({ block, y }) => {
        if (block.group === undefined) return;
        cardAt.set(block.group, { page: p + 1, y });
        block.tile = block.dayKey !== prevDay ? 'first' : firstOnPage ? 'continued' : undefined;
        prevDay = block.dayKey ?? '';
        firstOnPage = false;
      });
    });
  }

  drawHero();
  drawStats();
  if (showGlance) {
    drawGlance(HERO_BOTTOM, glanceCellH(density));
    drawLegend(HERO_BOTTOM + glanceHeight(density) + 2);
  }

  if (groups.length === 0) {
    const boxY = listTop(density) + 4;
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
  } else {
    pages.forEach((placements, p) => {
      if (p > 0) {
        doc.addPage();
        drawPageHeader();
      }
      // A page without event rows gets no table header
      if (!isExecutive && placements.some(({ block }) => block.dayKey)) drawTableHead(p === 0 ? listTop(density) : PAGE_TOP);
      placements.forEach(({ block, y }) => block.draw(y));
    });
    if (showIndex) {
      // Drawn last: it needs the page each card landed on
      doc.setPage(1);
      drawIndex(HERO_BOTTOM, cardAt);
    }
  }

  drawFooters();

  doc.setProperties({
    title: `Upcoming Events — ${formatDateRange(periodStart, periodEnd)}`,
    subject: 'Cork City Partnership events digest',
    author: 'Cork City Partnership',
    creator: 'CCP Event Calendar'
  });

  if (options.output === 'blob') {
    return doc.output('blob');
  }
  doc.save(digestFileName(periodStart, periodEnd));
};

/** File name used for a digest covering the given period */
export const digestFileName = (startDate: Date, endDate: Date): string =>
  `CCP-Upcoming-Events-${formatLocalDate(startDate)}-to-${formatLocalDate(endDate)}.pdf`;
