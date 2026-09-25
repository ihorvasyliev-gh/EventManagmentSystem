import type jsPDF from 'jspdf';
import { Event } from '../types';
import { formatLocalDate, isMultiDayEvent } from './date';
import { getCategoryRgb, Rgb } from '../constants/categoryColors';
import {
  groupDigestOccurrences,
  formatAlsoOnDates,
  formatOccurrenceLabel,
  DigestEventGroup,
  monthShort,
  monthShortUpper
} from './digestGrouping';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  baseUrl?: string;
  includeCalendarButtons?: boolean;
  /** 'save' downloads the file (default); 'blob' returns it, e.g. for an in-browser preview */
  output?: 'save' | 'blob';
}

// ---------------------------------------------------------------------------
// Calendar / map links (also used by the digest cards)
// ---------------------------------------------------------------------------

/**
 * Generate deep link for adding an event directly into Google Calendar on the Web
 */
export const createGoogleCalendarUrl = (event: {
  title: string;
  description?: string;
  location?: string;
  date: Date | string;
  endDate?: Date | string;
}): string => {
  const start = toDate(event.date) || new Date();
  const end = toDate(event.endDate) || new Date(start.getTime() + 60 * 60 * 1000);

  const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Event',
    dates: `${formatGCalDate(start)}/${formatGCalDate(end)}`,
  });

  if (event.location) {
    params.set('location', event.location);
  }
  if (event.description) {
    const descShort = event.description.length > 1000 ? event.description.slice(0, 1000) : event.description;
    params.set('details', descShort);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * Generate deep link for adding an event directly into Outlook 365 on the Web
 */
export const createOutlookWebUrl = (event: {
  title: string;
  description?: string;
  location?: string;
  date: Date | string;
  endDate?: Date | string;
}): string => {
  const start = toDate(event.date) || new Date();
  const end = toDate(event.endDate) || new Date(start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title || 'Event',
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });

  if (event.location) {
    params.set('location', event.location);
  }
  if (event.description) {
    params.set('body', event.description);
  }

  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
};

export const createGoogleMapsUrl = (location: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
};

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface LoadedPdfFlyer {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  format: 'JPEG' | 'PNG';
}

/**
 * Loads an image as a JPEG/PNG data URL for jsPDF, at most 1200px on its long side.
 * createImageBitmap applies the EXIF orientation, so phone photos come out upright.
 */
export const loadImageForPdf = async (url: string): Promise<LoadedPdfFlyer | null> => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const isPng = blob.type === 'image/png' || url.toLowerCase().includes('.png');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (!isPng) {
      // JPEG has no alpha: keep transparent areas white rather than black
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return {
      dataUrl: canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88),
      width: canvas.width,
      height: canvas.height,
      aspectRatio: canvas.width / canvas.height,
      format: isPng ? 'PNG' : 'JPEG'
    };
  } catch (err) {
    console.warn('loadImageForPdf error:', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Fonts & text
// ---------------------------------------------------------------------------

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

const FONT_FILES: Record<Weight, string> = {
  regular: 'Inter-Regular.ttf',
  medium: 'Inter-Medium.ttf',
  semibold: 'Inter-SemiBold.ttf',
  bold: 'Inter-Bold.ttf'
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
};

let fontDataPromise: Promise<Record<Weight, string> | null> | null = null;

/** Fetches the Inter TTFs once per session (null when unavailable, e.g. offline) */
const loadFontData = (): Promise<Record<Weight, string> | null> => {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all(
      (Object.keys(FONT_FILES) as Weight[]).map(async (weight) => {
        const res = await fetch(`/fonts/${FONT_FILES[weight]}`);
        if (!res.ok) throw new Error(`Font ${FONT_FILES[weight]} unavailable`);
        return [weight, arrayBufferToBase64(await res.arrayBuffer())] as const;
      })
    )
      .then((entries) => Object.fromEntries(entries) as Record<Weight, string>)
      .catch((err) => {
        console.warn('PDF fonts could not be loaded, using Helvetica:', err);
        fontDataPromise = null;
        return null;
      });
  }
  return fontDataPromise;
};

// Supported Windows-1252 characters above 255 that jsPDF maps properly
const WINANSI_SUPPORTED_EXTRA = new Set([
  338, 339, 352, 353, 376, 381, 382, 402, 710, 732,
  8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230, 8240, 8249, 8250, 8364, 8482
]);

const normaliseWhitespace = (text: string, preserveNewlines: boolean): string => {
  if (preserveNewlines) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return text.replace(/\s+/g, ' ').trim();
};

const stripEmoji = (text: string): string =>
  String(text)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[☀-➿]/g, '')
    .replace(/[︀-️​-‍]/g, '');

/**
 * Sanitizes strings for jsPDF standard fonts (Helvetica) to prevent switching to 16-bit encoding
 * which injects null bytes and corrupts letter spacing and glyphs.
 */
const cleanPdfText = (text: string | null | undefined, preserveNewlines = false): string => {
  if (!text) return '';
  let result = '';
  const stripped = stripEmoji(text);
  for (let i = 0; i < stripped.length; i++) {
    const code = stripped.charCodeAt(i);
    result += code <= 255 || WINANSI_SUPPORTED_EXTRA.has(code) ? stripped[i] : ' ';
  }
  return normaliseWhitespace(result, preserveNewlines);
};

/** Characters covered by the bundled Inter subset (Latin, Latin Extended-A, Cyrillic, punctuation) */
const isInInterSubset = (code: number): boolean =>
  code === 10 ||
  (code >= 0x20 && code <= 0x7e) ||
  (code >= 0xa0 && code <= 0x17f) ||
  (code >= 0x218 && code <= 0x21b) ||
  (code >= 0x400 && code <= 0x45f) ||
  code === 0x490 || code === 0x491 ||
  (code >= 0x2010 && code <= 0x2027) ||
  (code >= 0x2030 && code <= 0x203a) ||
  code === 0x20ac || code === 0x2122 || code === 0x2212 ||
  (code >= 0x2190 && code <= 0x2193);

const cleanUnicodeText = (text: string | null | undefined, preserveNewlines = false): string => {
  if (!text) return '';
  let result = '';
  const stripped = stripEmoji(text);
  for (let i = 0; i < stripped.length; i++) {
    result += isInInterSubset(stripped.charCodeAt(i)) || stripped[i] === '\t' ? stripped[i] : ' ';
  }
  return normaliseWhitespace(result, preserveNewlines);
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const toDate = (d: Date | string | number | undefined | null): Date | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
};

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// Fixed English abbreviations ("Sep", not the en-IE "Sept")
const formatDateRange = (start: Date | string, end: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  const fmt = (d: Date) => `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
  const sStr = s ? fmt(s) : '';
  const eStr = e ? fmt(e) : '';
  return sStr && eStr ? `${sStr} – ${eStr}` : sStr || eStr;
};

/** "Friday 25 September – Friday 9 October 2026" (year shown once when shared) */
const formatLongRange = (s: Date, e: Date): string => {
  const long = (d: Date, withYear: boolean) =>
    `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
  if (startOfLocalDay(s).getTime() === startOfLocalDay(e).getTime()) return long(s, true);
  return `${long(s, s.getFullYear() !== e.getFullYear())} – ${long(e, true)}`;
};

const formatEventTime = (start: Date | string, end?: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  const sStr = s ? clock(s) : '';
  if (e) {
    const eStr = clock(e);
    return sStr ? `${sStr} – ${eStr}` : eStr;
  }
  return sStr;
};

const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const dayKeyOf = (d: Date): string => formatLocalDate(d);

const dayCountInclusive = (start: Date, end: Date): number =>
  Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;

/** True for events without a meaningful time (starting at midnight and not ending at a set time) */
const isAllDay = (start: Date, end: Date | null): boolean =>
  start.getHours() === 0 && start.getMinutes() === 0 &&
  (!end || (end.getHours() === 23 && end.getMinutes() >= 59) || (end.getHours() === 0 && end.getMinutes() === 0));

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const RED: Rgb = [225, 0, 0];            // #E10000 official CCP red
const GREEN: Rgb = [62, 168, 11];        // #3EA80B official CCP green
const INK: Rgb = [15, 23, 42];           // slate-900
const BODY: Rgb = [71, 85, 105];         // slate-600
const MUTED: Rgb = [100, 116, 139];      // slate-500
const FAINT: Rgb = [148, 163, 184];      // slate-400
const BORDER: Rgb = [226, 232, 240];     // slate-200
const BG: Rgb = [248, 250, 252];         // slate-50
const WHITE: Rgb = [255, 255, 255];
const LINK: Rgb = [3, 105, 161];         // sky-700
const RED_TINT: Rgb = [254, 242, 242];
const RED_TINT_BORDER: Rgb = [254, 202, 202];
const OUTLOOK_BLUE: Rgb = [0, 99, 177];
const OUTLOOK_BG: Rgb = [235, 244, 255];
const GOOGLE_BLUE: Rgb = [26, 115, 232];
const GOOGLE_BG: Rgb = [241, 245, 249];

// ---------------------------------------------------------------------------
// Digest generator
// ---------------------------------------------------------------------------

interface Block {
  h: number;
  /** Must stay on the same page as the next block (headers) */
  keepWithNext?: boolean;
  /** Day the block belongs to (cards), used to repeat the day header after a page break */
  dayKey?: string;
  isDayHeader?: boolean;
  draw: (y: number) => void;
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

  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 14;
  const CW = W - M * 2;                          // 182
  const PAGE_TOP = 26;                           // content top on continuation pages
  const PAGE_BOTTOM = H - 17;

  // --- Fonts ---------------------------------------------------------------
  const fontData = await loadFontData();
  let hasInter = false;
  if (fontData) {
    try {
      (Object.keys(FONT_FILES) as Weight[]).forEach((weight) => {
        doc.addFileToVFS(FONT_FILES[weight], fontData[weight]);
        doc.addFont(FONT_FILES[weight], `Inter-${weight}`, 'normal');
      });
      hasInter = true;
    } catch (err) {
      console.warn('Could not register PDF fonts:', err);
    }
  }
  const font = (weight: Weight, size: number) => {
    if (hasInter) doc.setFont(`Inter-${weight}`, 'normal');
    else doc.setFont('helvetica', weight === 'regular' ? 'normal' : 'bold');
    doc.setFontSize(size);
  };
  const txt = (s: string | null | undefined, keepNewlines = false) =>
    hasInter ? cleanUnicodeText(s, keepNewlines) : cleanPdfText(s, keepNewlines);

  const color = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const fill = (rgb: Rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const stroke = (rgb: Rgb, width = 0.25) => {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(width);
  };

  /** Letter-spaced small caps label; returns its width */
  const spaced = (text: string, x: number, y: number, spacing = 0.35, align: 'left' | 'right' | 'center' = 'left'): number => {
    const w = doc.getTextWidth(text) + spacing * Math.max(0, text.length - 1);
    const startX = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    doc.text(text, startX, y, { charSpace: spacing });
    return w;
  };

  /** Wraps text to at most `maxLines`, ending the last line with an ellipsis if it was cut */
  const fitLines = (text: string, width: number, maxLines: number): string[] => {
    if (!text) return [];
    const lines: string[] = doc.splitTextToSize(text, width);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && doc.getTextWidth(`${last}…`) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  };

  const truncate = (text: string, width: number): string => fitLines(text, width, 1)[0] || '';

  const pill = (x: number, y: number, w: number, h: number, bg: Rgb, border?: Rgb) => {
    fill(bg);
    if (border) {
      stroke(border, 0.2);
      doc.roundedRect(x, y, w, h, h / 2, h / 2, 'FD');
    } else {
      doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    }
  };

  const drawPin = (x: number, y: number, rgb: Rgb) => {
    fill(rgb);
    const cx = x + 1;
    const cy = y - 1.25;
    const r = 0.95;
    doc.circle(cx, cy, r, 'F');
    doc.triangle(cx - r * 0.86, cy + 0.35, cx + r * 0.86, cy + 0.35, cx, y + 0.45, 'F');
    fill(WHITE);
    doc.circle(cx, cy, 0.38, 'F');
  };

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
  const showButtons = options.includeCalendarButtons !== false;
  const isExecutive = options.format === 'executive';
  const today = startOfLocalDay(new Date());

  const [logo, flyers] = await Promise.all([
    loadImageForPdf('/assets/ccp-logo.png'),
    (async () => {
      const map = new Map<string, LoadedPdfFlyer>();
      if (!isExecutive) return map;
      await Promise.all(groups.map(async ({ event: ev }) => {
        const url = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (!url) return;
        const flyer = await loadImageForPdf(url);
        if (flyer) map.set(ev.id, flyer);
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
  const venues = new Set(groups.map((g) => g.event.location?.trim().toLowerCase()).filter(Boolean));
  const eventDays = new Set(groups.flatMap((g) => g.occurrences.map((o) => dayKeyOf(toDate(o.date)!))));
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
    color(RED);
    doc.text('CORK CITY PARTNERSHIP', x, y + h * 0.7);
    return doc.getTextWidth('CORK CITY PARTNERSHIP');
  };

  // --- Page 1: header -------------------------------------------------------
  // Deliberately light: white paper, a thin brand stripe and dark text, so the
  // digest prints cheaply and doesn't shout on screen.
  const drawBrandStripe = () => {
    fill(RED);
    doc.rect(0, 0, W, 1.8, 'F');
    fill(GREEN);
    doc.rect(W * 0.72, 0, W * 0.28, 1.8, 'F');
  };

  const drawHero = () => {
    drawBrandStripe();
    logoDraw(M, 10, 13);

    font('semibold', 7);
    color(MUTED);
    spaced('EVENTS DIGEST', W - M, 14.5, 0.6, 'right');
    font('regular', 8);
    const issued = new Date();
    doc.text(`Issued ${WEEKDAYS_LONG[issued.getDay()].slice(0, 3)} ${issued.getDate()} ${monthShort(issued)} ${issued.getFullYear()}`, W - M, 19.5, { align: 'right' });

    font('bold', 24);
    color(INK);
    doc.text('Upcoming Events', M, 37);
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
      { value: String(groups.length), label: groups.length === 1 ? 'Event' : 'Events', accent: RED },
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
  const GLANCE_CELL_H = 12.5;
  const glanceHeight = showGlance ? 7 + 5 + gridRows * GLANCE_CELL_H : 0;

  const drawGlance = (top: number) => {
    font('semibold', 7);
    color(MUTED);
    spaced('AT A GLANCE', M, top + 3, 0.5);

    const gy = top + 7;
    const cellW = CW / 7;
    font('semibold', 6.3);
    color(FAINT);
    WEEKDAY_HEADERS.forEach((d, i) => spaced(d, M + i * cellW + cellW / 2, gy + 3, 0.3, 'center'));

    const rowsTop = gy + 5;
    const gridH = gridRows * GLANCE_CELL_H;
    fill(WHITE);
    doc.roundedRect(M, rowsTop, CW, gridH, 2, 2, 'F');

    for (let i = 0; i < gridRows * 7; i++) {
      const d = addDays(gridStart, i);
      const col = i % 7;
      const row = Math.floor(i / 7);
      const x = M + col * cellW;
      const y = rowsTop + row * GLANCE_CELL_H;
      const inRange = d >= startOfLocalDay(periodStart) && d <= startOfLocalDay(periodEnd);
      const key = dayKeyOf(d);
      const dayEvents = inRange ? eventsByDay.get(key) || [] : [];
      const isToday = d.getTime() === today.getTime();

      if (!inRange) {
        fill(BG);
        doc.rect(x, y, cellW, GLANCE_CELL_H, 'F');
      } else if (dayEvents.length > 0) {
        fill([255, 250, 250]);
        doc.rect(x, y, cellW, GLANCE_CELL_H, 'F');
      }

      // Day number (with month on the 1st and on the first cell)
      const showMonth = d.getDate() === 1 || i === 0;
      if (isToday) {
        fill(RED);
        doc.circle(x + 4.3, y + 3.9, 2.55, 'F');
        font('bold', 7.5);
        color(WHITE);
        doc.text(String(d.getDate()), x + 4.3, y + 4.95, { align: 'center' });
      } else {
        font(dayEvents.length ? 'bold' : 'medium', 7.5);
        color(inRange ? (dayEvents.length ? INK : MUTED) : FAINT);
        doc.text(String(d.getDate()), x + 2.3, y + 5);
      }
      if (showMonth) {
        const numW = isToday ? 7 : doc.getTextWidth(String(d.getDate())) + 3.2;
        font('semibold', 5.8);
        color(inRange ? RED : FAINT);
        doc.text(monthShortUpper(d), x + (isToday ? 1.8 : 2.3) + numW, y + 4.9);
      }

      if (dayEvents.length > 0) {
        // One dot per event (by category), then a count
        const maxDots = 5;
        dayEvents.slice(0, maxDots).forEach((ev, idx) => {
          fill(getCategoryRgb(ev.category).accent);
          doc.circle(x + 3 + idx * 2.5, y + 9.4, 0.85, 'F');
        });
        font('semibold', 6);
        color(MUTED);
        const label = dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`;
        doc.text(label, x + cellW - 2, y + 10.2, { align: 'right' });
      }
    }

    // Grid lines
    stroke(BORDER, 0.2);
    for (let c = 1; c < 7; c++) doc.line(M + c * cellW, rowsTop, M + c * cellW, rowsTop + gridH);
    for (let r = 1; r < gridRows; r++) doc.line(M, rowsTop + r * GLANCE_CELL_H, M + CW, rowsTop + r * GLANCE_CELL_H);
    stroke(BORDER, 0.3);
    doc.roundedRect(M, rowsTop, CW, gridH, 2, 2, 'S');
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
      fill(getCategoryRgb(cat).accent);
      doc.circle(x + 1.2, y - 1.05, 1.05, 'F');
      color(BODY);
      doc.text(label, x + 3.2, y);
      x += w;
    });
  };

  // --- Continuation page header & footers ---------------------------------
  const drawPageHeader = () => {
    drawBrandStripe();
    logoDraw(M, 8, 7.5);
    font('bold', 9.5);
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
      const orgW = doc.getTextWidth('Cork City Partnership CLG');
      font('regular', 7);
      color(MUTED);
      doc.text('  ·  Education | Employment | Empowerment', M + orgW, y);
      font('medium', 7);
      color(MUTED);
      doc.text(`Page ${p} of ${total}`, W - M, y, { align: 'right' });
    }
  };

  // --- Blocks ------------------------------------------------------------
  const showWeekBanners = dayCountInclusive(periodStart, periodEnd) > 7;
  const periodDayStart = startOfLocalDay(periodStart);
  const weekIndexOf = (d: Date) =>
    Math.floor((startOfLocalDay(d).getTime() - periodDayStart.getTime()) / (7 * 86400000));

  const weekBanner = (weekIndex: number): Block => {
    const wStart = addDays(periodDayStart, weekIndex * 7);
    const wEndRaw = addDays(wStart, 6);
    const wEnd = wEndRaw > periodEnd ? startOfLocalDay(periodEnd) : wEndRaw;
    const range = wStart.getMonth() === wEnd.getMonth()
      ? `${wStart.getDate()} – ${wEnd.getDate()} ${MONTHS_LONG[wEnd.getMonth()]}`
      : `${wStart.getDate()} ${monthShort(wStart)} – ${wEnd.getDate()} ${monthShort(wEnd)}`;
    return {
      h: 11,
      keepWithNext: true,
      draw: (y) => {
        const label = `WEEK ${weekIndex + 1}`;
        font('bold', 6.8);
        const lw = doc.getTextWidth(label) + 0.5 * (label.length - 1) + 6;
        pill(M, y + 2.6, lw, 5.4, BG, BORDER);
        color(INK);
        spaced(label, M + 3, y + 6.3, 0.5);
        font('semibold', 9);
        color(INK);
        doc.text(range, M + lw + 3, y + 6.5);
        const rw = doc.getTextWidth(range);
        stroke(BORDER, 0.3);
        doc.line(M + lw + rw + 6, y + 5.3, W - M, y + 5.3);
      }
    };
  };

  const relativeDayLabel = (d: Date): string | null => {
    const diff = Math.round((startOfLocalDay(d).getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    return null;
  };

  const dayHeader = (day: Date, count: number): Block => {
    const key = dayKeyOf(day);
    const isToday = day.getTime() === today.getTime();
    return {
      h: isExecutive ? 15 : 8.5,
      keepWithNext: true,
      isDayHeader: true,
      dayKey: key,
      draw: (y) => {
        const countLabel = count === 1 ? '1 event' : `${count} events`;
        const rel = relativeDayLabel(day);
        if (isExecutive) {
          // Date tile (outlined — no solid ink block)
          const tile = 11.5;
          const ty = y + 1.5;
          const tileColor = isToday ? RED : INK;
          fill(isToday ? RED_TINT : WHITE);
          stroke(isToday ? RED : BORDER, isToday ? 0.45 : 0.35);
          doc.roundedRect(M, ty, tile, tile, 2.2, 2.2, 'FD');
          font('semibold', 5.2);
          color(isToday ? RED : MUTED);
          spaced(monthShortUpper(day), M + tile / 2, ty + 3.7, 0.3, 'center');
          font('bold', 12);
          color(tileColor);
          doc.text(String(day.getDate()), M + tile / 2, ty + 9.3, { align: 'center' });

          font('bold', 11);
          color(INK);
          const wd = WEEKDAYS_LONG[day.getDay()];
          doc.text(wd, M + tile + 3.5, y + 6.3);
          let afterX = M + tile + 3.5 + doc.getTextWidth(wd) + 2.5;
          if (rel) {
            font('bold', 5.8);
            const cw = doc.getTextWidth(rel) + 0.3 * (rel.length - 1) + 4.4;
            pill(afterX, y + 2.6, cw, 4.4, RED_TINT, RED_TINT_BORDER);
            color(RED);
            spaced(rel, afterX + 2.2, y + 5.75, 0.3);
            afterX += cw;
          }
          font('regular', 8);
          color(MUTED);
          doc.text(`${day.getDate()} ${MONTHS_LONG[day.getMonth()]} ${day.getFullYear()}`, M + tile + 3.5, y + 11);
          font('medium', 7.5);
          doc.text(countLabel, W - M, y + 6.3, { align: 'right' });
        } else {
          fill(BG);
          doc.rect(M, y, CW, 7, 'F');
          fill(isToday ? RED : INK);
          doc.rect(M, y, 0.9, 7, 'F');
          font('bold', 8);
          color(INK);
          const label = `${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]}`;
          doc.text(label, M + 3, y + 4.7);
          if (rel) {
            const lx = M + 3 + doc.getTextWidth(label) + 2.5;
            font('bold', 5.8);
            color(RED);
            spaced(rel, lx, y + 4.6, 0.3);
          }
          font('medium', 7);
          color(MUTED);
          doc.text(countLabel, W - M - 2, y + 4.7, { align: 'right' });
        }
      }
    };
  };

  const continuedHeader = (dayKey: string): Block => {
    const [yy, mm, dd] = dayKey.split('-').map(Number);
    const day = new Date(yy, mm - 1, dd);
    return {
      h: isExecutive ? 9 : 8.5,
      keepWithNext: true,
      draw: (y) => {
        if (!isExecutive) {
          fill(BG);
          doc.rect(M, y, CW, 7, 'F');
        }
        font('semibold', 8.5);
        color(INK);
        const label = `${WEEKDAYS_LONG[day.getDay()]} ${day.getDate()} ${MONTHS_LONG[day.getMonth()]}`;
        const x = M + (isExecutive ? 0 : 3);
        doc.text(label, x, y + 4.7);
        const labelW = doc.getTextWidth(label);
        font('regular', 7.5);
        color(MUTED);
        doc.text('(continued)', x + labelW + 1.5, y + 4.7);
      }
    };
  };

  /** Measures and returns the executive card for one event group */
  const executiveCard = (group: DigestEventGroup, dayKey: string): Block => {
    const ev = group.event;
    const cat = getCategoryRgb(ev.category);
    const flyer = flyers.get(ev.id);
    const start = toDate(ev.date) || new Date();
    const end = toDate(ev.endDate);
    const multi = !!end && isMultiDayEvent(start, end);

    const ACCENT = 1.4;
    const PAD_Y = 4.6;
    const timeX = M + ACCENT + 4;
    const dividerX = M + 30;
    const mainX = dividerX + 4.5;
    const FLYER_W = 30;
    const mainRight = M + CW - 5 - (flyer ? FLYER_W + 5 : 0);
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

    // "Also on" chips
    const alsoOn = group.occurrences.slice(1).map((o) => formatOccurrenceLabel(o.date, ev.date)).filter(Boolean);
    const CHIP_H = 4.6;
    const chipRows: Array<Array<{ label: string; w: number }>> = [];
    if (alsoOn.length) {
      font('semibold', 6.3);
      const labelW = doc.getTextWidth('ALSO ON') + 0.3 * 6 + 2.5;
      font('medium', 6.8);
      let row: Array<{ label: string; w: number }> = [];
      let rowW = labelW;
      alsoOn.forEach((label) => {
        const w = doc.getTextWidth(label) + 4.4;
        if (rowW + w > mainW && row.length) {
          chipRows.push(row);
          row = [];
          rowW = labelW;
        }
        row.push({ label, w });
        rowW += w + 1.5;
      });
      if (row.length) chipRows.push(row);
    }

    const contact = ev.submitterName
      ? txt(`${ev.submitterName}${ev.submitterEmail ? ` · ${ev.submitterEmail}` : ''}`)
      : '';
    const BTN_H = 4.8;

    let contentH = 4.2;                                              // category row
    contentH += titleLines.length * TITLE_LH - 0.6;
    if (venueLines.length) contentH += 2.2 + venueLines.length * VENUE_LH;
    if (descLines.length) contentH += 3 + descLines.length * DESC_LH;
    if (contact) contentH += 2.4 + 3.3;
    if (chipRows.length) contentH += 3 + chipRows.length * (CHIP_H + 1.4) - 1.4;

    let flyerW = 0;
    let flyerH = 0;
    if (flyer) {
      flyerW = FLYER_W;
      flyerH = flyerW / flyer.aspectRatio;
      if (flyerH > 42) {
        flyerH = 42;
        flyerW = flyerH * flyer.aspectRatio;
      }
    }
    const multiH = multi ? 7.4 : 0;
    const h = Math.max(19 + multiH, PAD_Y * 2 + contentH, flyer ? flyerH + PAD_Y * 2 : 0);

    return {
      h: h + 3.2,
      dayKey,
      draw: (y) => {
        const r = 2.4;
        // Card with a category-coloured left edge
        fill(cat.accent);
        doc.roundedRect(M, y, CW, h, r, r, 'F');
        fill(WHITE);
        doc.roundedRect(M + ACCENT, y, CW - ACCENT, h, r, r, 'F');
        doc.rect(M + ACCENT, y, r, h, 'F');
        stroke(BORDER, 0.25);
        doc.roundedRect(M, y, CW, h, r, r, 'S');

        // Time column
        let ty = y + PAD_Y + 4.2;
        if (isAllDay(start, end)) {
          font('bold', 10.5);
          color(INK);
          doc.text('All day', timeX, ty);
        } else {
          font('bold', 12);
          color(INK);
          doc.text(clock(start), timeX, ty);
          if (end) {
            ty += 4.4;
            font('medium', 7.8);
            color(MUTED);
            doc.text(multi ? `until ${end.getDate()} ${monthShort(end)}` : `to ${clock(end)}`, timeX, ty);
          }
        }
        if (multi && end) {
          ty += 3.2;
          const label = `${dayCountInclusive(start, end)} DAYS`;
          font('bold', 5.8);
          const w = doc.getTextWidth(label) + 0.3 * (label.length - 1) + 4.2;
          pill(timeX, ty, w, 4.2, RED_TINT, RED_TINT_BORDER);
          color(RED);
          spaced(label, timeX + 2.1, ty + 2.95, 0.3);
        }
        stroke(BORDER, 0.25);
        doc.line(dividerX, y + PAD_Y, dividerX, y + h - PAD_Y);

        // Category + repeat chip
        let cy = y + PAD_Y + 2.6;
        const catLabel = txt(ev.category || 'Event').toUpperCase();
        let buttonsLeft = mainRight;
        if (showButtons) {
          font('semibold', 6.2);
          const buttons: Array<{ label: string; url: string; fg: Rgb; bg: Rgb }> = [
            { label: '+ Google', url: createGoogleCalendarUrl(ev), fg: GOOGLE_BLUE, bg: GOOGLE_BG },
            { label: '+ Outlook', url: createOutlookWebUrl(ev), fg: OUTLOOK_BLUE, bg: OUTLOOK_BG }
          ];
          buttons.forEach((b) => {
            const bw = doc.getTextWidth(b.label) + 5.4;
            const bx = buttonsLeft - bw;
            pill(bx, cy - 3.45, bw, BTN_H, b.bg, BORDER);
            color(b.fg);
            doc.text(b.label, bx + 2.7, cy - 0.15);
            doc.link(bx, cy - 3.45, bw, BTN_H, { url: b.url });
            buttonsLeft = bx - 1.5;
          });
        }
        fill(cat.accent);
        doc.circle(mainX + 1, cy - 1, 1, 'F');
        font('bold', 6.3);
        color(cat.accent);
        const catW = spaced(truncate(catLabel, buttonsLeft - mainX - 20), mainX + 3.1, cy, 0.35);
        if (group.occurrences.length > 1) {
          const chip = `${group.occurrences.length} DATES`;
          font('bold', 5.8);
          const cw = doc.getTextWidth(chip) + 0.3 * (chip.length - 1) + 4.2;
          const cx = mainX + 3.1 + catW + 2.5;
          pill(cx, cy - 3.05, cw, 4.2, RED_TINT, RED_TINT_BORDER);
          color(RED);
          spaced(chip, cx + 2.1, cy - 0.1, 0.3);
        }

        // Title
        cy += 1.6 + TITLE_LH - 0.6;
        font('bold', 12);
        color(INK);
        doc.text(titleLines, mainX, cy, { lineHeightFactor: 1.2 });
        cy += (titleLines.length - 1) * TITLE_LH;

        // Venue (links to Google Maps)
        if (venueLines.length) {
          cy += 2.2 + VENUE_LH;
          drawPin(mainX, cy, LINK);
          font('medium', 8);
          color(LINK);
          doc.text(venueLines, mainX + 3.6, cy, { lineHeightFactor: 1.3 });
          const linkW = Math.min(mainW, Math.max(...venueLines.map((l) => doc.getTextWidth(l))) + 4);
          doc.link(mainX, cy - 3, linkW, venueLines.length * VENUE_LH + 0.6, { url: createGoogleMapsUrl(ev.location) });
          cy += (venueLines.length - 1) * VENUE_LH;
        }

        // Description (printed in full up to 16 lines)
        if (descLines.length) {
          cy += 3 + DESC_LH;
          font('regular', 8.3);
          color(BODY);
          doc.text(descLines, mainX, cy, { lineHeightFactor: 1.33 });
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
          color(BODY);
          const shown = truncate(contact, mainW - lw);
          doc.text(shown, mainX + lw, cy);
          if (ev.submitterEmail) {
            doc.link(mainX + lw, cy - 2.6, doc.getTextWidth(shown), 3.4, { url: `mailto:${ev.submitterEmail}` });
          }
        }

        // Also on
        if (chipRows.length) {
          cy += 3;
          chipRows.forEach((row, ri) => {
            const rowY = cy + ri * (CHIP_H + 1.4);
            let x = mainX;
            if (ri === 0) {
              font('bold', 6.3);
              color(RED);
              x += spaced('ALSO ON', mainX, rowY + 3.2, 0.3) + 2.5;
            } else {
              font('bold', 6.3);
              x += doc.getTextWidth('ALSO ON') + 0.3 * 6 + 2.5;
            }
            font('medium', 6.8);
            row.forEach((chip) => {
              pill(x, rowY, chip.w, CHIP_H, BG, BORDER);
              color(INK);
              doc.text(chip.label, x + 2.2, rowY + 3.15);
              x += chip.w + 1.5;
            });
          });
        }

        // Flyer thumbnail
        if (flyer) {
          try {
            const fx = M + CW - 5 - FLYER_W + (FLYER_W - flyerW) / 2;
            const fy = y + PAD_Y;
            doc.saveGraphicsState();
            doc.roundedRect(fx, fy, flyerW, flyerH, 1.6, 1.6, null);
            doc.clip();
            doc.discardPath();
            doc.addImage(flyer.dataUrl, flyer.format, fx, fy, flyerW, flyerH, `flyer-${ev.id}`, 'FAST');
            doc.restoreGraphicsState();
            stroke(BORDER, 0.3);
            doc.roundedRect(fx, fy, flyerW, flyerH, 1.6, 1.6, 'S');
            if (ev.posterUrl) doc.link(fx, fy, flyerW, flyerH, { url: ev.posterUrl });
          } catch (err) {
            console.warn('Could not embed flyer thumbnail in PDF:', err);
          }
        }
      }
    };
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
    stroke(BORDER, 0.3);
    doc.line(M, y + TABLE_HEAD_H, M + CW, y + TABLE_HEAD_H);
    font('bold', 6.5);
    color(MUTED);
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
    font('semibold', 6.6);
    const alsoOn = formatAlsoOnDates(group, ', ');
    const alsoLines: string[] = alsoOn ? doc.splitTextToSize(`Also on ${alsoOn}`, eventW) : [];
    font('regular', 7.3);
    const venueLines = fitLines(txt(ev.location), venueW, 3);

    const TL = 3.7;
    let contentH = titleLines.length * TL;
    if (descLine) contentH += 3.3;
    contentH += alsoLines.length * 3.1;
    if (showButtons) contentH += 3.5;
    const h = Math.max(11.5, 3.2 + contentH + 2.4, 3.2 + venueLines.length * 3.3 + 2.4);

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
          color(MUTED);
          doc.text(descLine, COL.event, ly);
        }
        if (alsoLines.length) {
          ly += 3.2;
          font('semibold', 6.6);
          color(RED);
          doc.text(alsoLines, COL.event, ly, { lineHeightFactor: 1.3 });
          ly += (alsoLines.length - 1) * 3.1;
        }
        if (showButtons) {
          ly += 3.5;
          font('semibold', 6.4);
          color(OUTLOOK_BLUE);
          doc.text('+ Outlook', COL.event, ly);
          const ow = doc.getTextWidth('+ Outlook');
          doc.link(COL.event, ly - 2.6, ow, 3.4, { url: createOutlookWebUrl(ev) });
          color(FAINT);
          doc.text('·', COL.event + ow + 1.6, ly);
          color(GOOGLE_BLUE);
          doc.text('+ Google', COL.event + ow + 3.6, ly);
          doc.link(COL.event + ow + 3.6, ly - 2.6, doc.getTextWidth('+ Google'), 3.4, { url: createGoogleCalendarUrl(ev) });
        }

        // Venue
        if (venueLines.length) {
          font('regular', 7.3);
          color(LINK);
          doc.text(venueLines, COL.venue, y + 5.6, { lineHeightFactor: 1.3 });
          doc.link(COL.venue, y + 2.6, venueW, venueLines.length * 3.3 + 1, { url: createGoogleMapsUrl(ev.location) });
        }

        // Category pill
        font('semibold', 6.3);
        const catText = truncate(txt(ev.category || 'Event'), M + CW - COL.category - 7);
        const cw = doc.getTextWidth(catText) + 6.2;
        pill(COL.category, y + 2.8, cw, 4.6, cat.tint);
        fill(cat.accent);
        doc.circle(COL.category + 2.1, y + 5.1, 0.8, 'F');
        color(cat.accent);
        doc.text(catText, COL.category + 3.6, y + 6.05);
      }
    };
  };

  const blocks: Block[] = [];
  let lastWeek = -1;
  let lastDay = '';
  groups.forEach((group) => {
    const d = toDate(group.event.date) || periodStart;
    const day = startOfLocalDay(d);
    const key = dayKeyOf(day);
    if (showWeekBanners) {
      const wi = weekIndexOf(day);
      if (wi !== lastWeek) {
        lastWeek = wi;
        blocks.push(weekBanner(wi));
      }
    }
    if (key !== lastDay) {
      lastDay = key;
      const count = groups.filter((g) => dayKeyOf(startOfLocalDay(toDate(g.event.date) || periodStart)) === key).length;
      blocks.push(dayHeader(day, count));
    }
    blocks.push(isExecutive ? executiveCard(group, key) : compactRow(group, key));
  });

  // --- Render ------------------------------------------------------------
  drawHero();
  drawStats();
  let y = 57;
  if (showGlance) {
    drawGlance(y);
    y += glanceHeight + 2;
    drawLegend(y);
    y += LEGEND_H + 5;
  }

  if (groups.length === 0) {
    const boxY = y + 4;
    fill(BG);
    stroke(BORDER, 0.3);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.roundedRect(M, boxY, CW, 34, 3, 3, 'FD');
    doc.setLineDashPattern([], 0);
    font('bold', 12);
    color(INK);
    doc.text('No events scheduled for this period', W / 2, boxY + 15, { align: 'center' });
    font('regular', 8.5);
    color(MUTED);
    doc.text('New events submitted to the calendar will appear in the next digest.', W / 2, boxY + 21.5, { align: 'center' });
  }

  const startListPage = (top: number): number => {
    if (isExecutive) return top;
    drawTableHead(top);
    return top + TABLE_HEAD_H + 1;
  };

  if (groups.length > 0) {
    y = startListPage(y);
  }
  let currentDay = '';
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Height that must fit together (headers stay with the first card that follows)
    let needed = block.h;
    for (let j = i; blocks[j]?.keepWithNext && j + 1 < blocks.length; j++) needed += blocks[j + 1].h;

    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      drawPageHeader();
      y = startListPage(PAGE_TOP);
      // A day that continues onto this page gets its header repeated
      if (!block.isDayHeader && block.dayKey && block.dayKey === currentDay) {
        const cont = continuedHeader(block.dayKey);
        cont.draw(y);
        y += cont.h;
      }
    }
    if (block.isDayHeader && block.dayKey) currentDay = block.dayKey;
    block.draw(y);
    y += block.h;
    if (!isExecutive && block.dayKey && !block.isDayHeader && blocks[i + 1]?.isDayHeader) y += 1.5;
    if (isExecutive && blocks[i + 1]?.isDayHeader) y += 2;
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

/**
 * Generate a preformatted text digest for WhatsApp groups (clean plain text without * or _ formatting).
 */
export const generateWhatsAppSummary = (
  events: Event[],
  startDate: Date | string,
  endDate: Date | string
): string => {
  const cleanWa = (val?: string | null) => (val || '').replace(/[*_]/g, '').trim();

  const startMs = (toDate(startDate) || new Date()).getTime();
  const endMs = (toDate(endDate) || new Date()).getTime();
  // Repeated occurrences of one event are listed once, on their first date, with "Also on" dates
  const groups = groupDigestOccurrences(
    events.filter((e) => {
      // Exclude drafts and pending submissions
      if (e.status && e.status !== 'published') return false;
      const d = toDate(e.date);
      if (!d) return false;
      const t = d.getTime();
      return t >= startMs && t <= endMs;
    })
  );

  const dateRangeStr = cleanWa(formatDateRange(startDate, endDate));

  let text = `📅 CORK CITY PARTNERSHIP — UPCOMING EVENTS\n`;
  text += `Schedule: ${dateRangeStr}\n`;
  text += `────────────────────────────\n\n`;

  if (groups.length === 0) {
    text += `No upcoming events scheduled for this period.\n\n`;
    return text;
  }

  // Group by date
  let currentDateGroup = '';

  groups.forEach((group) => {
    const ev = group.event;
    const evDate = toDate(ev.date) || new Date();
    const isMulti = isMultiDayEvent(ev.date, ev.endDate);
    const evDateStr = `${WEEKDAYS_LONG[evDate.getDay()]} ${evDate.getDate()} ${MONTHS_LONG[evDate.getMonth()]}`;

    if (isMulti && ev.endDate) {
      const multiHeader = `${formatDateRange(ev.date, ev.endDate)} (Multi-day)`;
      if (multiHeader !== currentDateGroup) {
        currentDateGroup = multiHeader;
        text += `🗓 ${cleanWa(currentDateGroup)}\n`;
      }
    } else if (evDateStr !== currentDateGroup) {
      currentDateGroup = evDateStr;
      text += `🗓 ${cleanWa(currentDateGroup)}\n`;
    }

    const timeStr = cleanWa(formatEventTime(ev.date, ev.endDate));
    const titleStr = cleanWa(ev.title);
    text += `⏰ ${timeStr} | ${titleStr}\n`;
    const alsoOn = formatAlsoOnDates(group, '; ');
    if (alsoOn) {
      text += `🔁 Also on: ${alsoOn}\n`;
    }
    if (ev.location) {
      const cleanLoc = cleanWa(ev.location);
      if (cleanLoc) {
        text += `📍 Venue: ${cleanLoc}\n`;
      }
    }
    if (ev.category) {
      text += `🏷 Category: ${cleanWa(ev.category)}\n`;
    }
    if (ev.description) {
      const firstLines = ev.description.split('\n').filter(Boolean).slice(0, 2).join(' ');
      const cleanDesc = cleanWa(firstLines);
      if (cleanDesc) {
        text += `ℹ️ ${cleanDesc}\n`;
      }
    }
    if (ev.submitterName) {
      text += `👤 Contact: ${cleanWa(ev.submitterName)}\n`;
    }
    text += `\n`;
  });

  text += `────────────────────────────\n`;
  text += `📌 PDF Digest & Calendar: Check company portal.`;

  return text;
};
