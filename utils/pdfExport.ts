import type jsPDF from 'jspdf';
import { Event } from '../types';
import { formatLocalDate } from './date';
import {
  groupDigestOccurrences,
  formatAlsoOnDates,
  formatOccurrenceLabel,
  monthShort,
  monthShortUpper,
  weekdayShortUpper
} from './digestGrouping';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  title?: string;
  baseUrl?: string;
  includeCalendarButtons?: boolean;
}

// CCP Brand Colors (RGB) matching official logo
const CCP_RED = [225, 0, 0];       // #E10000 (Official Red from vector logo)
const CCP_GREEN = [62, 168, 11];    // #3EA80B (Official Green from vector logo)
const SLATE_DARK = [30, 41, 59];   // #1E293B
const SLATE_MUTED = [100, 116, 139]; // #64748B
const BG_LIGHT = [248, 250, 252];  // #F8FAFC
const BORDER_LIGHT = [226, 232, 240]; // #E2E8F0
const OUTLOOK_BLUE = [0, 120, 212]; // #0078D4 (Microsoft Outlook Brand Blue)
const OUTLOOK_BG = [239, 246, 255]; // #EFF6FF (Soft Blue)
const OUTLOOK_BORDER = [186, 215, 253]; // #BFDBFE

const GOOGLE_BLUE = [26, 115, 232]; // #1A73E8 (Google Brand Blue)
const GOOGLE_BG = [248, 250, 252]; // #F8FAFC
const GOOGLE_BORDER = [203, 213, 225]; // #CBD5E1

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

/**
 * Generate link for single-event .ics download (Desktop Outlook / Apple / Mobile)
 */
export const createIcsDownloadUrl = (
  event: {
    id: string;
    date: Date | string;
    title?: string;
    endDate?: Date | string;
    location?: string;
    description?: string;
    category?: string;
  },
  baseUrl?: string
): string => {
  let base = baseUrl;
  if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
      base = window.location.origin;
    } else {
      base = 'https://ccp-event-calendar.pages.dev';
    }
  }

  const d = toDate(event.date);
  const endD = toDate(event.endDate);

  const params = new URLSearchParams();
  params.set('event_id', event.id);
  if (d) params.set('date', d.toISOString());
  if (event.title) params.set('title', event.title);
  if (endD) params.set('end_date', endD.toISOString());
  if (event.location) params.set('location', event.location);
  if (event.category) params.set('category', event.category);
  if (event.description) {
    const descShort = event.description.length > 400 ? event.description.slice(0, 400) : event.description;
    params.set('description', descShort);
  }

  return `${base}/api/calendar?${params.toString()}`;
};

export interface LoadedPdfFlyer {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  format: 'JPEG' | 'PNG';
}

/**
 * Reads EXIF orientation (1-8) from JPEG ArrayBuffer. Returns 1 if not JPEG or no tag.
 */
const getExifOrientation = (buffer: ArrayBuffer): number => {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
      return 1;
    }
    let offset = 2;
    const maxOffset = view.byteLength;
    while (offset < maxOffset) {
      if (view.getUint8(offset) !== 0xFF) return 1;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xE1) {
        // APP1
        const length = view.getUint16(offset + 2, false);
        const exifStart = offset + 4;
        if (
          view.getUint32(exifStart, false) === 0x45786966 && // "Exif"
          view.getUint16(exifStart + 4, false) === 0x0000
        ) {
          const tiffStart = exifStart + 6;
          const isLittleEndian = view.getUint16(tiffStart, false) === 0x4949;
          if (view.getUint16(tiffStart + 2, isLittleEndian) !== 0x002A) return 1;
          const firstIfdOffset = view.getUint32(tiffStart + 4, isLittleEndian);
          if (firstIfdOffset < 8) return 1;
          const ifdStart = tiffStart + firstIfdOffset;
          const tagCount = view.getUint16(ifdStart, isLittleEndian);
          for (let i = 0; i < tagCount; i++) {
            const entryOffset = ifdStart + 2 + i * 12;
            if (entryOffset + 12 > maxOffset) break;
            const tag = view.getUint16(entryOffset, isLittleEndian);
            if (tag === 0x0112) { // Orientation tag
              return view.getUint16(entryOffset + 8, isLittleEndian);
            }
          }
        }
        offset += 2 + length;
      } else if ((marker & 0xFF00) !== 0xFF00 && marker !== 0xD9 && marker !== 0xDA) {
        const segLen = view.getUint16(offset + 2, false);
        offset += 2 + segLen;
      } else {
        break;
      }
    }
  } catch {
    // ignore
  }
  return 1;
};

/**
 * Loads an image from URL, resolves EXIF orientation (so phone photos are upright),
 * preserves the original aspect ratio, and returns optimized base64 for jsPDF.
 */
export const loadImageForPdf = async (url: string): Promise<LoadedPdfFlyer | null> => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const isPng = blob.type === 'image/png' || url.toLowerCase().includes('.png');
    const buffer = await blob.arrayBuffer();
    const exifOrientation = getExifOrientation(buffer);

    // 1. Try ImageBitmap with 'from-image' orientation
    if (typeof createImageBitmap !== 'undefined' && typeof document !== 'undefined') {
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = bitmap.width;
        let h = bitmap.height;

        let needManualRotate = false;
        let rotateDeg = 0;
        if ((exifOrientation === 6 || exifOrientation === 8) && w > h) {
          needManualRotate = true;
          rotateDeg = exifOrientation === 6 ? 90 : 270;
        } else if (exifOrientation === 3) {
          needManualRotate = true;
          rotateDeg = 180;
        }

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (needManualRotate) {
            if (rotateDeg === 90) {
              canvas.width = h;
              canvas.height = w;
              ctx.translate(h, 0);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(bitmap, 0, 0, w, h);
            } else if (rotateDeg === 270) {
              canvas.width = h;
              canvas.height = w;
              ctx.translate(0, w);
              ctx.rotate(-Math.PI / 2);
              ctx.drawImage(bitmap, 0, 0, w, h);
            } else if (rotateDeg === 180) {
              canvas.width = w;
              canvas.height = h;
              ctx.translate(w, h);
              ctx.rotate(Math.PI);
              ctx.drawImage(bitmap, 0, 0, w, h);
            }
          } else {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(bitmap, 0, 0, w, h);
          }

          const outFormat = isPng ? 'PNG' : 'JPEG';
          const dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
          bitmap.close();
          return {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            aspectRatio: canvas.width / canvas.height,
            format: outFormat
          };
        }
      } catch (bitmapErr) {
        console.warn('createImageBitmap failed, trying Image element:', bitmapErr);
      }
    }

    // 2. Fallback: HTMLImageElement
    if (typeof document !== 'undefined') {
      const blobUrl = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = blobUrl;
        });

        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        let needManualRotate = false;
        let rotateDeg = 0;
        if ((exifOrientation === 6 || exifOrientation === 8) && w > h) {
          needManualRotate = true;
          rotateDeg = exifOrientation === 6 ? 90 : 270;
        } else if (exifOrientation === 3) {
          needManualRotate = true;
          rotateDeg = 180;
        }

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (needManualRotate) {
            if (rotateDeg === 90) {
              canvas.width = h;
              canvas.height = w;
              ctx.translate(h, 0);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(img, 0, 0, w, h);
            } else if (rotateDeg === 270) {
              canvas.width = h;
              canvas.height = w;
              ctx.translate(0, w);
              ctx.rotate(-Math.PI / 2);
              ctx.drawImage(img, 0, 0, w, h);
            } else if (rotateDeg === 180) {
              canvas.width = w;
              canvas.height = h;
              ctx.translate(w, h);
              ctx.rotate(Math.PI);
              ctx.drawImage(img, 0, 0, w, h);
            }
          } else {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
          }

          const outFormat = isPng ? 'PNG' : 'JPEG';
          const dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
          URL.revokeObjectURL(blobUrl);
          return {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            aspectRatio: canvas.width / canvas.height,
            format: outFormat
          };
        }
      } catch (imgErr) {
        console.warn('HTMLImageElement fallback failed:', imgErr);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }

    // 3. Fallback: raw FileReader
    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    if (!base64) return null;

    let naturalW = 100;
    let naturalH = 100;
    if (typeof document !== 'undefined') {
      try {
        const testImg = new Image();
        testImg.src = base64;
        await new Promise<void>((res) => {
          testImg.onload = () => res();
          testImg.onerror = () => res();
        });
        if (testImg.naturalWidth && testImg.naturalHeight) {
          naturalW = testImg.naturalWidth;
          naturalH = testImg.naturalHeight;
        }
      } catch {
        // ignore
      }
    }

    return {
      dataUrl: base64,
      width: naturalW,
      height: naturalH,
      aspectRatio: naturalW / naturalH,
      format: isPng ? 'PNG' : 'JPEG'
    };
  } catch (err) {
    console.warn('loadImageForPdf error:', err);
    return null;
  }
};

const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  const loaded = await loadImageForPdf(url);
  return loaded ? loaded.dataUrl : null;
};

const toDate = (d: Date | string | number | undefined | null): Date | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
};

export const createGoogleMapsUrl = (location: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
};

export const isMultiDayEvent = (start: Date | string, end?: Date | string | null): boolean => {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return false;
  return s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth() || s.getDate() !== e.getDate();
};

const formatDateRange = (start: Date | string, end: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  // Fixed English abbreviations ("Sep", not the en-IE "Sept")
  const fmt = (d: Date) => `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
  const sStr = s ? fmt(s) : '';
  const eStr = e ? fmt(e) : '';
  return sStr && eStr ? `${sStr} – ${eStr}` : sStr || eStr;
};

const formatEventDateDisplay = (start: Date | string, end?: Date | string | null): string => {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e || !isMultiDayEvent(s, e)) {
    return formatOccurrenceLabel(s);
  }
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${monthShort(e)}`
    : `${s.getDate()} ${monthShort(s)} – ${e.getDate()} ${monthShort(e)}`;
};

const formatEventTime = (start: Date | string, end?: Date | string) => {
  const s = toDate(start);
  const e = toDate(end);
  const sStr = s ? s.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  if (e) {
    const eStr = e.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false });
    return sStr ? `${sStr} – ${eStr}` : eStr;
  }
  return sStr;
};

// Supported Windows-1252 characters above 255 that jsPDF maps properly
const WINANSI_SUPPORTED_EXTRA = new Set([
  338, 339, 352, 353, 376, 381, 382, 402, 710, 732,
  8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230, 8240, 8249, 8250, 8364, 8482
]);

/**
 * Sanitizes strings for jsPDF standard fonts (Helvetica) to prevent switching to 16-bit encoding
 * which injects null bytes and corrupts letter spacing and glyphs.
 */
export const cleanPdfText = (text: string | null | undefined, preserveNewlines = false): string => {
  if (!text) return '';
  let result = '';
  const stripped = String(text)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uFE00-\uFE0F]/g, '');

  for (let i = 0; i < stripped.length; i++) {
    const code = stripped.charCodeAt(i);
    if (code <= 255 || WINANSI_SUPPORTED_EXTRA.has(code)) {
      result += stripped[i];
    } else {
      result += ' ';
    }
  }

  if (preserveNewlines) {
    return result
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return result.replace(/\s+/g, ' ').trim();
};

/**
 * Draws a sharp, vector map pin icon directly in jsPDF without relying on Unicode emojis
 */
const drawPinIcon = (doc: jsPDF, x: number, y: number): void => {
  doc.setFillColor(2, 132, 199);
  doc.setDrawColor(2, 132, 199);
  const centerX = x + 1.0;
  const centerY = y - 1.1;
  const r = 0.95;

  // Pin head circle
  doc.circle(centerX, centerY, r, 'F');

  // Downward pointer
  doc.triangle(
    centerX - r * 0.85, centerY + 0.2,
    centerX + r * 0.85, centerY + 0.2,
    centerX, y + 0.4,
    'F'
  );

  // Center white dot
  doc.setFillColor(255, 255, 255);
  doc.circle(centerX, centerY, 0.4, 'F');
};

/** Accent colour per category (falls back to slate) */
const CATEGORY_COLORS: Record<string, number[]> = {
  'Enterprise & Employment': [37, 99, 235],
  'Community & Family': [234, 88, 12],
  'Education & Training': [124, 58, 237],
  'Special Visits & Celebrations': [219, 39, 119],
  'Public Information Session': [13, 148, 136],
  'Health & Wellbeing': [22, 163, 74],
};
const getCategoryColor = (category?: string): number[] =>
  (category && CATEGORY_COLORS[category]) || SLATE_MUTED;

const RED_TINT_BG = [254, 242, 242];   // #FEF2F2
const RED_TINT_BORDER = [254, 202, 202]; // #FECACA
const SUBMITTER_GREY = [148, 163, 184]; // #94A3B8

const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const dayCountInclusive = (start: Date, end: Date): number =>
  Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;

/**
 * Generate Upcoming Events Digest PDF using jsPDF.
 * Occurrences of the same event (recurring / multi-date) are merged into one entry
 * shown on its first date, with the remaining dates listed as "Also on".
 */
export const generateEventsDigestPDF = async (
  events: Event[],
  options: BulletinOptions
): Promise<void> => {
  const jsPDFConstructor = (await import('jspdf')).default;
  const doc = new jsPDFConstructor({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm
  const contentTop = 36;
  const contentBottom = pageHeight - 16;

  // Pre-load CCP logo
  const logoData = await loadImageAsBase64('/assets/ccp-logo.png');

  // Filter events within selected date range (only published events, strictly excluding drafts/submissions)
  const periodStart = toDate(options.startDate) || new Date();
  const periodEnd = toDate(options.endDate) || new Date();
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  const filteredEvents = events.filter((e) => {
    if (e.status === 'draft' || (e.status && e.status !== 'published')) return false;
    const d = toDate(e.date);
    if (!d) return false;
    const t = d.getTime();
    return t >= startMs && t <= endMs;
  });
  const groups = groupDigestOccurrences(filteredEvents);

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

  const setColor = (rgb: number[]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setFill = (rgb: number[]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setDraw = (rgb: number[]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  // Header helper
  const drawHeader = () => {
    // Full-bleed brand band
    setFill(CCP_RED);
    doc.rect(0, 0, pageWidth, 3, 'F');
    setFill(CCP_GREEN);
    doc.rect(pageWidth * 0.72, 0, pageWidth * 0.28, 3, 'F');

    // Logo (or wordmark fallback) on the left
    let hasLogo = false;
    if (logoData) {
      try {
        const imgProps = doc.getImageProperties(logoData);
        const ratio = imgProps && imgProps.width && imgProps.height
          ? imgProps.width / imgProps.height
          : (1024 / 240);
        const logoHeight = 12;
        doc.addImage(logoData, 'PNG', margin, 10, logoHeight * ratio, logoHeight);
        hasLogo = true;
      } catch {
        hasLogo = false;
      }
    }
    if (!hasLogo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      setColor(CCP_RED);
      doc.text('CORK CITY PARTNERSHIP', margin, 18);
    }

    // Title block on the right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    setColor(SLATE_DARK);
    doc.text('Upcoming Events', pageWidth - margin, 16, { align: 'right' });

    const countLabel = `${groups.length} ${groups.length === 1 ? 'event' : 'events'}`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(SLATE_MUTED);
    doc.text(
      cleanPdfText(`${formatDateRange(options.startDate, options.endDate)}  ·  ${countLabel}`),
      pageWidth - margin,
      22,
      { align: 'right' }
    );

    // Divider
    setDraw(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin, 28, pageWidth - margin, 28);
  };

  // Footers are drawn once all pages exist so we can print "Page X of Y"
  const drawFooters = () => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      const footerY = pageHeight - 8;
      setDraw(BORDER_LIGHT);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setColor(SLATE_MUTED);
      doc.text('Cork City Partnership Clg  ·  Education | Employment | Empowerment', margin, footerY);
      doc.text(`Page ${p} of ${total}`, pageWidth - margin, footerY, { align: 'right' });
    }
  };

  const newPage = () => {
    doc.addPage();
    drawHeader();
    return contentTop;
  };

  // Draw first page header
  drawHeader();
  let currentY = contentTop;

  if (groups.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    setColor(SLATE_MUTED);
    doc.text(
      'No upcoming events scheduled for this period.',
      pageWidth / 2,
      currentY + 20,
      { align: 'center' }
    );
    drawFooters();
    doc.save(`CCP-Events-Digest-${formatLocalDate(periodStart)}.pdf`);
    return;
  }

  // Week sections are only useful when the period spans more than one week
  const periodDayStart = startOfLocalDay(periodStart);
  const showWeekBanners = dayCountInclusive(periodStart, periodEnd) > 7;
  const getWeekIndex = (d: Date) =>
    Math.floor((startOfLocalDay(d).getTime() - periodDayStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
  const WEEK_BANNER_H = 9;

  const drawWeekBanner = (weekIndex: number, y: number) => {
    const weekStart = new Date(periodDayStart);
    weekStart.setDate(weekStart.getDate() + weekIndex * 7);
    const weekEndRaw = new Date(weekStart);
    weekEndRaw.setDate(weekEndRaw.getDate() + 6);
    const weekEnd = weekEndRaw.getTime() > periodEnd.getTime() ? periodEnd : weekEndRaw;

    const label = `WEEK ${weekIndex + 1}`;
    const range = weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${monthShort(weekEnd)}`
      : `${weekStart.getDate()} ${monthShort(weekStart)} – ${weekEnd.getDate()} ${monthShort(weekEnd)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setColor(CCP_RED);
    doc.text(label, margin, y + 4.5);
    const labelW = doc.getTextWidth(label);

    doc.setFont('helvetica', 'normal');
    setColor(SLATE_MUTED);
    doc.text(range, margin + labelW + 2.5, y + 4.5);
    const rangeW = doc.getTextWidth(range);

    setDraw(BORDER_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(margin + labelW + rangeW + 6, y + 3.4, pageWidth - margin, y + 3.4);
  };

  // Pre-load flyers if in executive format
  const flyerMap = new Map<string, LoadedPdfFlyer>();
  if (options.format === 'executive') {
    await Promise.all(
      groups.map(async ({ event: ev }) => {
        const imgUrl = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (imgUrl) {
          const flyerObj = await loadImageForPdf(imgUrl);
          if (flyerObj) flyerMap.set(ev.id, flyerObj);
        }
      })
    );
  }

  const showCalendarButtons = options.includeCalendarButtons !== false;
  let lastWeekIndex = -1;

  // FORMAT 1: EXECUTIVE CARDS
  if (options.format === 'executive') {
    const panelW = 30;
    const pad = 5;
    const btnHeight = 5;
    const flyerMaxW = 26;

    for (const group of groups) {
      const ev = group.event;
      const flyer = flyerMap.get(ev.id);
      const evDate = toDate(ev.date) || new Date();
      const endEvDate = toDate(ev.endDate);
      const isMultiDay = !!endEvDate && isMultiDayEvent(evDate, endEvDate);
      const occurrenceCount = group.occurrences.length;
      const alsoOn = formatAlsoOnDates(group);
      const catColor = getCategoryColor(ev.category);

      // Column geometry
      const cardX = margin;
      const textX = cardX + panelW + pad;
      const rightEdge = cardX + contentWidth - pad - (flyer ? flyerMaxW + 4 : 0);
      const textW = rightEdge - textX;

      // --- Measure ---
      const headRowH = 5.5; // category + date-count chip

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      const titleLines: string[] = doc.splitTextToSize(cleanPdfText(ev.title) || 'Untitled event', textW);
      const titleLineH = 4.8;
      const titleH = titleLines.length * titleLineH;

      let venueLines: string[] = [];
      const cleanLoc = cleanPdfText(ev.location);
      if (cleanLoc) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        venueLines = doc.splitTextToSize(cleanLoc, textW - 3.5);
      }
      const venueLineH = 3.4;
      const venueH = venueLines.length > 0 ? venueLines.length * venueLineH + 1.8 : 0;

      let alsoOnLines: string[] = [];
      const alsoOnLabel = 'ALSO ON';
      let alsoOnLabelW = 0;
      if (alsoOn) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        alsoOnLabelW = doc.getTextWidth(alsoOnLabel) + 2.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        alsoOnLines = doc.splitTextToSize(alsoOn, textW - 4 - alsoOnLabelW);
      }
      const alsoOnLineH = 3.3;
      const alsoOnBoxH = alsoOnLines.length > 0 ? alsoOnLines.length * alsoOnLineH + 2.6 : 0;
      const alsoOnH = alsoOnBoxH > 0 ? alsoOnBoxH + 2.2 : 0;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const cleanDesc = cleanPdfText(ev.description || '', true);
      const descLines: string[] = cleanDesc ? doc.splitTextToSize(cleanDesc, textW) : [];
      const descLineH = 3.3;
      const descH = descLines.length > 0 ? descLines.length * descLineH + 1 : 0;

      const hasFooterRow = showCalendarButtons || !!ev.submitterName;
      const footerH = hasFooterRow ? btnHeight + 4 : 0;

      const contentH = pad + headRowH + titleH + 1 + venueH + alsoOnH + descH + footerH + pad - 1;
      const minH = flyer ? 42 : 36;
      const cardH = Math.max(minH, contentH);

      // Week section
      const weekIndex = showWeekBanners ? getWeekIndex(evDate) : 0;
      const needsBanner = showWeekBanners && weekIndex !== lastWeekIndex;
      const bannerH = needsBanner ? WEEK_BANNER_H : 0;

      if (currentY + bannerH + cardH > contentBottom && currentY > contentTop) {
        currentY = newPage();
      }

      if (needsBanner) {
        lastWeekIndex = weekIndex;
        drawWeekBanner(weekIndex, currentY);
        currentY += WEEK_BANNER_H;
      }

      const cardY = currentY;
      const cardR = 2.2;

      // --- Card body: tinted date panel on the left, white content on the right ---
      setFill(BG_LIGHT);
      doc.roundedRect(cardX, cardY, contentWidth, cardH, cardR, cardR, 'F');
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX + panelW, cardY, contentWidth - panelW, cardH, cardR, cardR, 'F');
      doc.rect(cardX + panelW, cardY, cardR + 0.5, cardH, 'F');

      // Panel divider + outer border
      setDraw(BORDER_LIGHT);
      doc.setLineWidth(0.3);
      doc.line(cardX + panelW, cardY, cardX + panelW, cardY + cardH);
      doc.roundedRect(cardX, cardY, contentWidth, cardH, cardR, cardR, 'S');

      // Category accent strip along the top of the date panel
      setFill(CCP_RED);
      doc.roundedRect(cardX, cardY, panelW, 2.4, cardR, cardR, 'F');
      doc.rect(cardX, cardY + 1.2, panelW, 1.2, 'F');
      doc.rect(cardX + panelW - cardR, cardY, cardR, 1.2, 'F');

      // --- Date panel ---
      const panelCX = cardX + panelW / 2;
      const endInOtherMonth = isMultiDay && endEvDate && endEvDate.getMonth() !== evDate.getMonth();
      const monthLabel = endInOtherMonth && endEvDate
        ? `${monthShortUpper(evDate)} – ${monthShortUpper(endEvDate)}`
        : monthShortUpper(evDate);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(CCP_RED);
      doc.text(monthLabel, panelCX, cardY + 8.5, { align: 'center' });

      const dayLabel = isMultiDay && endEvDate ? `${evDate.getDate()}–${endEvDate.getDate()}` : String(evDate.getDate());
      doc.setFontSize(isMultiDay ? 15 : 21);
      setColor(SLATE_DARK);
      doc.text(dayLabel, panelCX, cardY + (isMultiDay ? 16.5 : 17.5), { align: 'center' });

      doc.setFontSize(6.5);
      setColor(SLATE_MUTED);
      const subLabel = isMultiDay && endEvDate
        ? `${dayCountInclusive(evDate, endEvDate)} DAYS`
        : weekdayShortUpper(evDate);
      doc.text(subLabel, panelCX, cardY + 22.5, { align: 'center' });

      // Time chip
      const timeStr = cleanPdfText(formatEventTime(ev.date, ev.endDate));
      if (timeStr) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        const timeW = Math.min(panelW - 3, doc.getTextWidth(timeStr) + 4);
        doc.setFillColor(236, 253, 243); // soft green
        doc.roundedRect(panelCX - timeW / 2, cardY + 25.2, timeW, 5, 2.5, 2.5, 'F');
        setColor(CCP_GREEN);
        doc.text(timeStr, panelCX, cardY + 28.6, { align: 'center' });
      }

      // --- Content column ---
      let y = cardY + pad;

      // Category label with colour dot
      let chipX = textX;
      if (ev.category) {
        const catText = cleanPdfText(ev.category).toUpperCase();
        setFill(catColor);
        doc.circle(textX + 1, y + 1.7, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        setColor(catColor);
        doc.text(catText, textX + 3, y + 2.6);
        chipX = textX + 3 + doc.getTextWidth(catText) + 3;
      }

      // "N DATES" chip for repeated events
      if (occurrenceCount > 1) {
        const chipText = `${occurrenceCount} DATES`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        const chipW = doc.getTextWidth(chipText) + 4;
        setFill(RED_TINT_BG);
        doc.roundedRect(chipX, y - 0.2, chipW, 3.8, 1.9, 1.9, 'F');
        setColor(CCP_RED);
        doc.text(chipText, chipX + chipW / 2, y + 2.5, { align: 'center' });
      }
      y += headRowH;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      setColor(SLATE_DARK);
      doc.text(titleLines, textX, y + 3.2, { lineHeightFactor: 1.18 });
      y += titleH + 1;

      // Venue (clickable to Google Maps)
      if (venueLines.length > 0) {
        y += 1.8;
        drawPinIcon(doc, textX, y + 0.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(2, 132, 199);
        doc.text(venueLines, textX + 3.2, y, { lineHeightFactor: 1.3 });
        if (ev.location) {
          const venueW = Math.min(textW, doc.getTextWidth(venueLines[0]) + 4);
          doc.link(textX, y - 3, venueW, venueLines.length * venueLineH + 0.5, { url: createGoogleMapsUrl(ev.location) });
        }
        y += venueLines.length * venueLineH;
      }

      // "Also on" box listing the remaining dates of this event
      if (alsoOnLines.length > 0) {
        y += 2.2;
        setFill(RED_TINT_BG);
        setDraw(RED_TINT_BORDER);
        doc.setLineWidth(0.2);
        doc.roundedRect(textX, y, textW, alsoOnBoxH, 1.2, 1.2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        setColor(CCP_RED);
        doc.text(alsoOnLabel, textX + 2, y + 3.4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setColor(SLATE_DARK);
        doc.text(alsoOnLines, textX + 2 + alsoOnLabelW, y + 3.4, { lineHeightFactor: 1.35 });
        y += alsoOnBoxH;
      }

      // Description (all lines printed, never truncated)
      if (descLines.length > 0) {
        y += 3.8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setColor(SLATE_MUTED);
        doc.text(descLines, textX, y, { lineHeightFactor: 1.25 });
      }

      // Flyer thumbnail (true aspect ratio & EXIF orientation preserved)
      if (flyer) {
        try {
          const maxH = Math.min(cardH - 8, 40);
          let flyerW = flyerMaxW;
          let flyerH = flyerMaxW / flyer.aspectRatio;
          if (flyerH > maxH) {
            flyerH = maxH;
            flyerW = maxH * flyer.aspectRatio;
          }
          const flyerX = cardX + contentWidth - pad - flyerMaxW + (flyerMaxW - flyerW) / 2;
          const flyerY = cardY + 4;
          setDraw(BORDER_LIGHT);
          doc.setLineWidth(0.3);
          doc.roundedRect(flyerX - 0.6, flyerY - 0.6, flyerW + 1.2, flyerH + 1.2, 1, 1, 'S');
          doc.addImage(flyer.dataUrl, flyer.format, flyerX, flyerY, flyerW, flyerH, undefined, 'FAST');
        } catch (imgErr) {
          console.warn('Could not embed flyer thumbnail in PDF:', imgErr);
        }
      }

      // Footer row: submitter on the left, calendar buttons on the right
      const btnY = cardY + cardH - pad - btnHeight + 1;
      const googleBtnW = 17;
      const outlookBtnW = 19;
      const googleBtnX = rightEdge - googleBtnW;
      const outlookBtnX = googleBtnX - 2 - outlookBtnW;

      if (showCalendarButtons) {
        const drawButton = (x: number, w: number, label: string, url: string, bg: number[], border: number[], fg: number[]) => {
          setFill(bg);
          setDraw(border);
          doc.setLineWidth(0.25);
          doc.roundedRect(x, btnY, w, btnHeight, 2.5, 2.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          setColor(fg);
          doc.text(label, x + w / 2, btnY + 3.4, { align: 'center' });
          doc.link(x, btnY, w, btnHeight, { url });
        };
        drawButton(outlookBtnX, outlookBtnW, '+ Outlook', createOutlookWebUrl(ev), OUTLOOK_BG, OUTLOOK_BORDER, OUTLOOK_BLUE);
        drawButton(googleBtnX, googleBtnW, '+ Google', createGoogleCalendarUrl(ev), GOOGLE_BG, GOOGLE_BORDER, GOOGLE_BLUE);
      }

      if (ev.submitterName) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        setColor(SUBMITTER_GREY);
        const maxSubWidth = showCalendarButtons ? outlookBtnX - textX - 3 : textW;
        const subText = cleanPdfText(`Submitted by ${ev.submitterName}${ev.submitterEmail ? ` (${ev.submitterEmail})` : ''}`);
        const subLines = doc.splitTextToSize(subText, Math.max(20, maxSubWidth));
        doc.text(subLines[0], textX, btnY + 3.4);
      }

      currentY += cardH + 4;
    }
  } else {
    // FORMAT 2: COMPACT TABLE
    const colX = {
      date: margin + 3,
      time: margin + 30,
      title: margin + 52,
      venue: margin + 112,
      category: margin + 147
    };
    const titleColW = colX.venue - colX.title - 4;
    const headerH = 7;

    const drawTableHeader = (y: number) => {
      setFill(SLATE_DARK);
      doc.roundedRect(margin, y, contentWidth, headerH, 1.2, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('DATE', colX.date, y + 4.6);
      doc.text('TIME', colX.time, y + 4.6);
      doc.text('EVENT', colX.title, y + 4.6);
      doc.text('VENUE', colX.venue, y + 4.6);
      doc.text('CATEGORY', colX.category, y + 4.6);
    };

    drawTableHeader(currentY);
    currentY += headerH;

    groups.forEach((group, i) => {
      const ev = group.event;
      const alsoOn = formatAlsoOnDates(group);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const titleLines = fitLines(cleanPdfText(ev.title), titleColW, 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const descLine = fitLines(cleanPdfText(ev.description || ''), titleColW, 1)[0] || '';
      doc.setFont('helvetica', 'bold');
      const alsoOnLines: string[] = alsoOn ? doc.splitTextToSize(`Also on: ${alsoOn}`, titleColW) : [];
      const titleBlockH = titleLines.length * 3.6;
      const rowHeight = Math.max(13, 4.8 + titleBlockH + (descLine ? 3.2 : 0) + alsoOnLines.length * 3 + 2.4);

      const weekIndex = showWeekBanners ? getWeekIndex(toDate(ev.date) || periodStart) : 0;
      const needsBanner = showWeekBanners && weekIndex !== lastWeekIndex;
      const bannerH = needsBanner ? WEEK_BANNER_H : 0;

      if (currentY + bannerH + rowHeight > contentBottom) {
        currentY = newPage();
        drawTableHeader(currentY);
        currentY += headerH;
      }

      if (needsBanner) {
        lastWeekIndex = weekIndex;
        currentY += 1.5;
        drawWeekBanner(weekIndex, currentY);
        currentY += WEEK_BANNER_H - 1.5;
      }

      // Row background & separator
      if (i % 2 === 1) {
        setFill(BG_LIGHT);
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      }
      setDraw(BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      // Date (multi-day aware) & time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColor(SLATE_DARK);
      doc.text(formatEventDateDisplay(ev.date, ev.endDate), colX.date, currentY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setColor(CCP_GREEN);
      doc.text(formatEventTime(ev.date, ev.endDate), colX.time, currentY + 5);

      // Title, description and extra dates
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColor(SLATE_DARK);
      doc.text(titleLines, colX.title, currentY + 4.8, { lineHeightFactor: 1.27 });
      let lineY = currentY + 4.8 + titleBlockH;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setColor(SLATE_MUTED);
      if (descLine) {
        doc.text(descLine, colX.title, lineY);
        lineY += 3.2;
      }

      if (alsoOnLines.length > 0) {
        doc.setFont('helvetica', 'bold');
        setColor(CCP_RED);
        doc.text(alsoOnLines, colX.title, lineY, { lineHeightFactor: 1.3 });
      }

      // Venue (clickable to Google Maps)
      const cleanLoc = cleanPdfText(ev.location || '');
      if (cleanLoc) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(2, 132, 199);
        const venueLines: string[] = doc.splitTextToSize(cleanLoc, colX.category - colX.venue - 3).slice(0, 2);
        doc.text(venueLines, colX.venue, currentY + 5, { lineHeightFactor: 1.3 });
        doc.link(colX.venue, currentY + 1.5, colX.category - colX.venue - 3, venueLines.length * 3.2 + 1, { url: createGoogleMapsUrl(ev.location) });
      }

      // Category with colour dot
      const catColor = getCategoryColor(ev.category);
      setFill(catColor);
      doc.circle(colX.category + 0.8, currentY + 4.1, 0.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      setColor(catColor);
      const catLine = doc.splitTextToSize(cleanPdfText(ev.category || 'Event'), margin + contentWidth - colX.category - 4)[0] || '';
      doc.text(catLine, colX.category + 2.4, currentY + 5);

      // Calendar quick links
      if (showCalendarButtons) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        setColor(OUTLOOK_BLUE);
        doc.text('+ Outlook', colX.category, currentY + 9.5);
        doc.link(colX.category, currentY + 7, 10, 4, { url: createOutlookWebUrl(ev) });

        setColor(SLATE_MUTED);
        doc.text('·', colX.category + 10.6, currentY + 9.5);

        setColor(GOOGLE_BLUE);
        doc.text('+ Google', colX.category + 12.4, currentY + 9.5);
        doc.link(colX.category + 12.4, currentY + 7, 10, 4, { url: createGoogleCalendarUrl(ev) });
      }

      currentY += rowHeight;
    });
  }

  drawFooters();

  // Save the PDF
  doc.save(`CCP-Events-Digest-${formatLocalDate(periodStart)}.pdf`);
};
export const generateFortnightlyPDF = generateEventsDigestPDF;

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
  const filteredEvents = events
    .filter((e) => {
      // Exclude drafts and pending submissions
      if (e.status === 'draft' || (e.status && e.status !== 'published')) return false;
      const d = toDate(e.date);
      if (!d) return false;
      const t = d.getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => {
      const ta = toDate(a.date)?.getTime() || 0;
      const tb = toDate(b.date)?.getTime() || 0;
      return ta - tb;
    });

  const dateRangeStr = cleanWa(formatDateRange(startDate, endDate));

  let text = `📅 CORK CITY PARTNERSHIP — UPCOMING EVENTS\n`;
  text += `Schedule: ${dateRangeStr}\n`;
  text += `────────────────────────────\n\n`;

  if (filteredEvents.length === 0) {
    text += `No upcoming events scheduled for this period.\n\n`;
    return text;
  }

  // Group by date
  let currentDateGroup = '';

  filteredEvents.forEach((ev) => {
    const evDate = toDate(ev.date) || new Date();
    const isMulti = isMultiDayEvent(ev.date, ev.endDate);
    const evDateStr = evDate.toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

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
