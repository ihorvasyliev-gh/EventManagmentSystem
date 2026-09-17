import type jsPDF from 'jspdf';
import { Event } from '../types';
import { formatLocalDate } from './date';

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
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const sStr = s ? s.toLocaleDateString('en-IE', opt) : '';
  const eStr = e ? e.toLocaleDateString('en-IE', opt) : '';
  return sStr && eStr ? `${sStr} – ${eStr}` : sStr || eStr;
};

const formatEventDate = (d: Date | string) => {
  const date = toDate(d);
  if (!date) return '';
  return date.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatEventDateDisplay = (start: Date | string, end?: Date | string | null): string => {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e || !isMultiDayEvent(s, e)) {
    return s.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const sStr = s.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  const eStr = e.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  return `${sStr} – ${eStr}`;
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

/**
 * Generate Upcoming Events Digest PDF using jsPDF
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

  // Pre-load CCP logo
  const logoData = await loadImageAsBase64('/assets/ccp-logo.png');

  // Filter events within selected date range and sort chronologically (only published events, strictly excluding drafts/submissions)
  const startMs = (toDate(options.startDate) || new Date()).getTime();
  const endMs = (toDate(options.endDate) || new Date()).getTime();
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

  let currentPage = 1;

  // Header helper
  const drawHeader = () => {
    // Top decorative brand bar
    doc.setFillColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
    doc.rect(margin, margin, contentWidth, 2, 'F');
    doc.setFillColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
    doc.rect(margin + contentWidth * 0.7, margin, contentWidth * 0.3, 2, 'F');

    // Draw logo if available
    let headerTextX = margin;
    if (logoData) {
      try {
        const imgProps = doc.getImageProperties(logoData);
        const ratio = imgProps && imgProps.width && imgProps.height
          ? imgProps.width / imgProps.height
          : (1024 / 240);
        const logoHeight = 10.5;
        const logoWidth = logoHeight * ratio;
        doc.addImage(logoData, 'PNG', margin, margin + 4, logoWidth, logoHeight);
        headerTextX = margin + logoWidth + 4;
      } catch {
        headerTextX = margin;
      }
    }

    // Header Titles
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
    doc.text('CORK CITY PARTNERSHIP', headerTextX, margin + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
    doc.text('UPCOMING EVENTS DIGEST', headerTextX, margin + 13);

    // Period Badge on right (Clean Executive Chip)
    const periodText = `Period: ${formatDateRange(options.startDate, options.endDate)}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
    doc.text(
      periodText,
      pageWidth - margin,
      margin + 10.5,
      { align: 'right' }
    );

    // Divider line
    doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, margin + 18, pageWidth - margin, margin + 18);
  };

  // Footer helper
  const drawFooter = (pageNum: number) => {
    const footerY = pageHeight - 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);

    doc.text(
      'Cork City Partnership Clg • Education | Employment | Empowerment • Confidential / Internal',
      margin,
      footerY
    );
    doc.text(`Page ${pageNum}`, pageWidth - margin, footerY, { align: 'right' });
  };

  // Draw first page header
  drawHeader();
  let currentY = margin + 24;

  if (filteredEvents.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
    doc.text(
      'No upcoming events scheduled for this period.',
      pageWidth / 2,
      currentY + 20,
      { align: 'center' }
    );
    drawFooter(currentPage);
    doc.save(`CCP-Events-Digest-${formatLocalDate(toDate(options.startDate) || new Date())}.pdf`);
    return;
  }

  // Pre-load flyers if in executive format
  const flyerMap = new Map<string, LoadedPdfFlyer>();
  if (options.format === 'executive') {
    await Promise.all(
      filteredEvents.map(async (ev) => {
        const imgUrl = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (imgUrl) {
          const flyerObj = await loadImageForPdf(imgUrl);
          if (flyerObj) flyerMap.set(ev.id, flyerObj);
        }
      })
    );
  }

  // FORMAT 1: EXECUTIVE CARDS
  if (options.format === 'executive') {
    let lastWeekNum = 0;

    for (let i = 0; i < filteredEvents.length; i++) {
      const ev = filteredEvents[i];
      const flyer = flyerMap.get(ev.id);
      const hasFlyer = !!flyer;
      const evDate = toDate(ev.date) || new Date();
      const endEvDate = toDate(ev.endDate);
      const isMultiDay = isMultiDayEvent(ev.date, ev.endDate);

      // Event URLs
      const outlookUrl = createOutlookWebUrl(ev);
      const googleUrl = createGoogleCalendarUrl(ev);
      const mapsUrl = ev.location ? createGoogleMapsUrl(ev.location) : '';

      // Text column layout
      const textStartX = margin + 33;
      // Reserve 30mm on right for flyer when present (24mm flyer + 3mm right margin + 3mm gap)
      const textWidth = hasFlyer ? contentWidth - 33 - 30 : contentWidth - 35;

      // 1. Category Pill Height
      const catHeight = ev.category ? 6.2 : 0;

      // 2. Title Lines (all lines preserved)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const cleanTitle = cleanPdfText(ev.title);
      const titleLines = doc.splitTextToSize(cleanTitle, textWidth);
      const titleHeight = titleLines.length * 4.0;

      // 3. Venue Lines
      let venueLines: string[] = [];
      let venueHeight = 0;
      if (ev.location) {
        const cleanLoc = cleanPdfText(ev.location);
        if (cleanLoc) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          venueLines = doc.splitTextToSize(cleanLoc, textWidth - 3);
          venueHeight = venueLines.length * 3.5 + 1.5;
        }
      }

      // 4. Description Lines (all lines preserved, support newlines!)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const cleanDesc = cleanPdfText(ev.description || '', true);
      const descLines = cleanDesc ? doc.splitTextToSize(cleanDesc, textWidth) : [];
      const descHeight = descLines.length > 0 ? (descLines.length * 2.9) : 0;

      // 5. Action Buttons & Submitter footer row
      const btnHeight = 4.6;
      const bottomFooterHeight = btnHeight + 3.0 + 2.5;

      // Calculate dynamic card height to ensure all content always fits
      const contentHeight = 4.5 + catHeight + titleHeight + venueHeight + descHeight + bottomFooterHeight;
      const minCardHeight = hasFlyer ? 41 : 35;
      const cardHeight = Math.max(minCardHeight, contentHeight);

      // Check if we need to print a week header
      const diffDays = Math.floor((evDate.getTime() - startMs) / (1000 * 60 * 60 * 24));
      const weekNum = diffDays < 7 ? 1 : 2;
      const isNewWeek = weekNum !== lastWeekNum;
      const weekBannerH = isNewWeek ? 10 : 0;

      // Page break check (ensures week header + dynamic card fit on current page)
      if (currentY + weekBannerH + cardHeight > pageHeight - 16) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        drawHeader();
        currentY = margin + 24;
      }

      // Week Section Banner
      if (isNewWeek) {
        lastWeekNum = weekNum;
        doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
        doc.roundedRect(margin, currentY, contentWidth, 7, 1.5, 1.5, 'F');
        doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
        doc.roundedRect(margin, currentY, contentWidth, 7, 1.5, 1.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
        const weekLabel =
          weekNum === 1
            ? 'WEEK 1 — Upcoming 7 Days'
            : 'WEEK 2 — Following Week';
        doc.text(weekLabel, margin + 4, currentY + 4.8);
        currentY += 10;
      }

      // Draw Event Card Background
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, currentY, contentWidth, cardHeight, 2, 2, 'F');
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.roundedRect(margin, currentY, contentWidth, cardHeight, 2, 2, 'S');

      // Left Accent Color Bar
      doc.setFillColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
      doc.roundedRect(margin, currentY, 2.5, cardHeight, 1, 1, 'F');

      // Modern Calendar Date Badge (Left)
      const badgeW = 23;
      const badgeH = 20;
      const badgeX = margin + 5.5;
      const badgeY = currentY + 3.5;

      // Badge Container
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.8, 1.8, 'F');
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.8, 1.8, 'S');

      // Badge Top Ribbon (Month)
      doc.setFillColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
      doc.roundedRect(badgeX, badgeY, badgeW, 5.5, 1.8, 1.8, 'F');
      doc.rect(badgeX, badgeY + 3, badgeW, 2.5, 'F');

      const monthName = evDate.toLocaleDateString('en-IE', { month: 'short' }).toUpperCase();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(monthName, badgeX + badgeW / 2, badgeY + 3.8, { align: 'center' });

      // Badge Body (Day & Weekday or Multi-day)
      if (!isMultiDay || !endEvDate) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
        doc.text(String(evDate.getDate()), badgeX + badgeW / 2, badgeY + 12.2, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.8);
        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        const dayName = evDate.toLocaleDateString('en-IE', { weekday: 'short' }).toUpperCase();
        doc.text(dayName, badgeX + badgeW / 2, badgeY + 17, { align: 'center' });
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
        doc.text(`${evDate.getDate()}–${endEvDate.getDate()}`, badgeX + badgeW / 2, badgeY + 11.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.2);
        doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
        doc.text('MULTI-DAY', badgeX + badgeW / 2, badgeY + 16.8, { align: 'center' });
      }

      // Time Display below Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
      const timeStr = formatEventTime(ev.date, ev.endDate);
      const timeLines = doc.splitTextToSize(timeStr, badgeW + 4);
      doc.text(timeLines[0], badgeX + badgeW / 2, badgeY + badgeH + 4.2, { align: 'center' });

      // Middle Column: Category, Title, Venue (Clickable Maps), Description
      let infoY = currentY + 4.5;

      // Category Pill & optional Multi-day indicator
      if (ev.category) {
        doc.setFont('helvetica', 'bold');
        const cleanCat = cleanPdfText(ev.category);
        const catFontSize = cleanCat.length > 25 ? 5.5 : 6;
        doc.setFontSize(catFontSize);
        const textW = doc.getTextWidth(cleanCat);
        const pillWidth = Math.max(14, textW + 3.5);
        const pillHeight = 4.2;

        doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
        doc.roundedRect(textStartX, infoY, pillWidth, pillHeight, 1, 1, 'F');
        doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
        doc.roundedRect(textStartX, infoY, pillWidth, pillHeight, 1, 1, 'S');

        doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
        doc.text(cleanCat, textStartX + pillWidth / 2, infoY + 3, { align: 'center' });

        if (isMultiDay && endEvDate) {
          const multiText = `${formatDateRange(ev.date, ev.endDate)}`;
          const multiTextW = doc.getTextWidth(multiText);
          const multiPillW = multiTextW + 4;
          const multiX = textStartX + pillWidth + 2;

          doc.setFillColor(254, 242, 242); // soft red tint
          doc.roundedRect(multiX, infoY, multiPillW, pillHeight, 1, 1, 'F');
          doc.setDrawColor(254, 202, 202);
          doc.roundedRect(multiX, infoY, multiPillW, pillHeight, 1, 1, 'S');

          doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
          doc.text(multiText, multiX + multiPillW / 2, infoY + 3, { align: 'center' });
        }

        infoY += pillHeight + 2;
      }

      // Event Title (ALL lines rendered)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      doc.text(titleLines, textStartX, infoY + 1);
      infoY += titleHeight + 1.5;

      // Venue / Location (Clickable to Google Maps)
      if (venueLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(2, 132, 199); // Maps Link Blue
        drawPinIcon(doc, textStartX, infoY);
        doc.text(venueLines, textStartX + 2.8, infoY);

        if (mapsUrl) {
          const venueW = Math.min(textWidth, doc.getTextWidth(venueLines[0]) + 4);
          doc.link(textStartX, infoY - 3, venueW, venueHeight, { url: mapsUrl });
        }
        infoY += venueHeight;
      }

      // Description (ALL lines printed, never truncated!)
      if (descLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        doc.text(descLines, textStartX, infoY);
      }

      // Right Column: Flyer Thumbnail (True Aspect Ratio & EXIF Orientation Preserved)
      let flyerW = 0;
      let flyerH = 0;
      let flyerX = pageWidth - margin;
      if (hasFlyer && flyer) {
        try {
          const maxW = 24;
          const maxH = Math.min(cardHeight - 6, 38);
          const fRatio = flyer.aspectRatio; // True visual aspect ratio (width / height)

          if (fRatio > maxW / maxH) {
            flyerW = maxW;
            flyerH = maxW / fRatio;
          } else {
            flyerH = maxH;
            flyerW = maxH * fRatio;
          }

          flyerX = pageWidth - margin - flyerW - 3;
          const flyerY = currentY + 3 + (maxH - flyerH) / 2;

          // Draw subtle image border frame
          doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
          doc.roundedRect(flyerX - 0.5, flyerY - 0.5, flyerW + 1, flyerH + 1, 1, 1, 'S');

          doc.addImage(flyer.dataUrl, flyer.format, flyerX, flyerY, flyerW, flyerH, undefined, 'FAST');
        } catch (imgErr) {
          console.warn('Could not embed flyer thumbnail in PDF:', imgErr);
        }
      }

      // Action Buttons (Outlook 365 Web & Google Calendar)
      const showCalendarButtons = options.includeCalendarButtons !== false;
      const actionRight = hasFlyer && flyer ? (flyerX - 3) : (pageWidth - margin - 4);
      const btnY = currentY + cardHeight - btnHeight - 2.5;

      const googleBtnW = 18;
      const outlookBtnW = 20;
      const btnGap = 2;

      const googleBtnX = actionRight - googleBtnW;
      const outlookBtnX = googleBtnX - btnGap - outlookBtnW;

      if (showCalendarButtons) {
        // 1. Outlook Web Button
        doc.setFillColor(OUTLOOK_BG[0], OUTLOOK_BG[1], OUTLOOK_BG[2]);
        doc.roundedRect(outlookBtnX, btnY, outlookBtnW, btnHeight, 1.2, 1.2, 'F');
        doc.setDrawColor(OUTLOOK_BORDER[0], OUTLOOK_BORDER[1], OUTLOOK_BORDER[2]);
        doc.roundedRect(outlookBtnX, btnY, outlookBtnW, btnHeight, 1.2, 1.2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(OUTLOOK_BLUE[0], OUTLOOK_BLUE[1], OUTLOOK_BLUE[2]);
        doc.text('+ Outlook', outlookBtnX + outlookBtnW / 2, btnY + 3.2, { align: 'center' });
        doc.link(outlookBtnX, btnY, outlookBtnW, btnHeight, { url: outlookUrl });

        // 2. Google Calendar Button
        doc.setFillColor(GOOGLE_BG[0], GOOGLE_BG[1], GOOGLE_BG[2]);
        doc.roundedRect(googleBtnX, btnY, googleBtnW, btnHeight, 1.2, 1.2, 'F');
        doc.setDrawColor(GOOGLE_BORDER[0], GOOGLE_BORDER[1], GOOGLE_BORDER[2]);
        doc.roundedRect(googleBtnX, btnY, googleBtnW, btnHeight, 1.2, 1.2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(GOOGLE_BLUE[0], GOOGLE_BLUE[1], GOOGLE_BLUE[2]);
        doc.text('+ Google', googleBtnX + googleBtnW / 2, btnY + 3.2, { align: 'center' });
        doc.link(googleBtnX, btnY, googleBtnW, btnHeight, { url: googleUrl });
      }

      // Submitter info footer line inside card (to the left of action buttons if present)
      if (ev.submitterName) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        const maxSubWidth = showCalendarButtons ? (outlookBtnX - textStartX - 3) : textWidth;
        const subText = cleanPdfText(`Submitted by ${ev.submitterName}${ev.submitterEmail ? ` (${ev.submitterEmail})` : ''}`);
        const subLines = doc.splitTextToSize(subText, Math.max(20, maxSubWidth));
        doc.text(subLines[0], textStartX, currentY + cardHeight - 3.5);
      }

      currentY += cardHeight + 3.5;
    }
  } else {
    // FORMAT 2: COMPACT TABLE
    // Table Header
    const colX = {
      date: margin + 2,
      time: margin + 30,
      title: margin + 55,
      venue: margin + 115,
      category: margin + 155
    };

    const drawTableHeader = (y: number) => {
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.rect(margin, y, contentWidth, 7, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
      doc.text('Date', colX.date, y + 4.8);
      doc.text('Time', colX.time, y + 4.8);
      doc.text('Event & Description', colX.title, y + 4.8);
      doc.text('Venue / Location', colX.venue, y + 4.8);
      doc.text('Category', colX.category, y + 4.8);
    };

    drawTableHeader(currentY);
    currentY += 7;

    for (let i = 0; i < filteredEvents.length; i++) {
      const ev = filteredEvents[i];
      const rowHeight = 13;

      if (currentY + rowHeight > pageHeight - 16) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        drawHeader();
        currentY = margin + 24;
        drawTableHeader(currentY);
        currentY += 7;
      }

      // Row background
      if (i % 2 === 1) {
        doc.setFillColor(252, 252, 253);
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      }
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      // Date & Time (Multi-day aware)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const dateDisplay = formatEventDateDisplay(ev.date, ev.endDate);
      doc.text(dateDisplay, colX.date, currentY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
      doc.text(formatEventTime(ev.date, ev.endDate), colX.time, currentY + 5);

      // URLs for calendar integration
      const outlookUrl = createOutlookWebUrl(ev);
      const googleUrl = createGoogleCalendarUrl(ev);
      const mapsUrl = ev.location ? createGoogleMapsUrl(ev.location) : '';

      // Event Title (Clean text, NOT clickable as requested)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const cleanTitle = cleanPdfText(ev.title);
      const title = cleanTitle.length > 34 ? cleanTitle.slice(0, 32) + '…' : cleanTitle;
      doc.text(title, colX.title, currentY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      const cleanDesc = cleanPdfText(ev.description || '').replace(/\n/g, ' ');
      const desc = cleanDesc.slice(0, 50) + (cleanDesc.length > 50 ? '…' : '');
      doc.text(desc, colX.title, currentY + 8.5);

      // Venue (Clickable to Google Maps)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(2, 132, 199); // Maps Link Blue
      const cleanLoc = cleanPdfText(ev.location || '');
      const venue = cleanLoc.length > 25 ? cleanLoc.slice(0, 23) + '…' : cleanLoc;
      doc.text(venue, colX.venue, currentY + 5);
      if (mapsUrl && venue) {
        doc.link(colX.venue, currentY + 1, 38, 5, { url: mapsUrl });
      }

      // Category
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(CCP_RED[0], CCP_RED[1], CCP_RED[2]);
      const cleanCat = cleanPdfText(ev.category || 'Event');
      const catLines = doc.splitTextToSize(cleanCat, 24);
      doc.text(catLines[0], colX.category, currentY + 5);

      // Calendar quick links in Compact format
      if (options.includeCalendarButtons !== false) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(OUTLOOK_BLUE[0], OUTLOOK_BLUE[1], OUTLOOK_BLUE[2]);
        doc.text('+Outlook', colX.category, currentY + 9.5);
        doc.link(colX.category, currentY + 7, 9, 4, { url: outlookUrl });

        doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
        doc.text('•', colX.category + 9.8, currentY + 9.5);

        doc.setTextColor(GOOGLE_BLUE[0], GOOGLE_BLUE[1], GOOGLE_BLUE[2]);
        doc.text('+Google', colX.category + 12.2, currentY + 9.5);
        doc.link(colX.category + 12.2, currentY + 7, 9, 4, { url: googleUrl });
      }

      currentY += rowHeight;
    }
  }

  // Draw footer on last page
  drawFooter(currentPage);

  // Save the PDF
  const validStart = toDate(options.startDate) || new Date();
  const filename = `CCP-Events-Digest-${formatLocalDate(validStart)}.pdf`;
  doc.save(filename);
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
