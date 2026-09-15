import jsPDF from 'jspdf';
import { Event } from '../types';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  title?: string;
  baseUrl?: string;
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
  event: { id: string; date: Date | string },
  baseUrl?: string
): string => {
  const base = baseUrl || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://ccp-event-calendar.pages.dev');
  const d = toDate(event.date);
  const dateParam = d ? `&date=${encodeURIComponent(d.toISOString())}` : '';
  return `${base}/api/calendar?event_id=${encodeURIComponent(event.id)}${dateParam}`;
};

const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
export const cleanPdfText = (text: string | null | undefined): string => {
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
 * Generate Fortnightly Bulletin PDF using jsPDF
 */
export const generateFortnightlyPDF = async (
  events: Event[],
  options: BulletinOptions
): Promise<void> => {
  const doc = new jsPDF({
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

  // Filter events within selected date range and sort chronologically
  const startMs = (toDate(options.startDate) || new Date()).getTime();
  const endMs = (toDate(options.endDate) || new Date()).getTime();
  const filteredEvents = events
    .filter((e) => {
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
    doc.text('UPCOMING EVENTS BULLETIN', headerTextX, margin + 13);

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
      'No upcoming events scheduled for this two-week period.',
      pageWidth / 2,
      currentY + 20,
      { align: 'center' }
    );
    drawFooter(currentPage);
    doc.save(`CCP-Events-Bulletin-${options.startDate.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  // Pre-load flyers if in executive format
  const flyerMap = new Map<string, string>();
  if (options.format === 'executive') {
    await Promise.all(
      filteredEvents.map(async (ev) => {
        const imgUrl = ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url;
        if (imgUrl) {
          const b64 = await loadImageAsBase64(imgUrl);
          if (b64) flyerMap.set(ev.id, b64);
        }
      })
    );
  }

  // FORMAT 1: EXECUTIVE CARDS
  if (options.format === 'executive') {
    let lastWeekNum = 0;

    for (let i = 0; i < filteredEvents.length; i++) {
      const ev = filteredEvents[i];
      const flyerData = flyerMap.get(ev.id);
      const evDate = toDate(ev.date) || new Date();
      const endEvDate = toDate(ev.endDate);
      const isMultiDay = isMultiDayEvent(ev.date, ev.endDate);

      // Check if we need to print a week header
      const diffDays = Math.floor((evDate.getTime() - startMs) / (1000 * 60 * 60 * 24));
      const weekNum = diffDays < 7 ? 1 : 2;

      const hasFlyer = !!flyerData;
      const cardHeight = hasFlyer ? 41 : 35;

      // Page break check
      if (currentY + cardHeight > pageHeight - 16) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        drawHeader();
        currentY = margin + 24;
      }

      // Week Section Banner
      if (weekNum !== lastWeekNum) {
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
      // Square off bottom corners of header ribbon
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
      const textStartX = margin + 33;
      const textWidth = hasFlyer ? contentWidth - 33 - 27 : contentWidth - 35;

      // Event URLs
      const outlookUrl = createOutlookWebUrl(ev);
      const icsUrl = createIcsDownloadUrl(ev, options.baseUrl);
      const mapsUrl = ev.location ? createGoogleMapsUrl(ev.location) : '';

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

      // Event Title (Clean text, NOT clickable as requested)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const cleanTitle = cleanPdfText(ev.title);
      const titleLines = doc.splitTextToSize(cleanTitle, textWidth);
      doc.text(titleLines.slice(0, 2), textStartX, infoY + 1);
      const titleHeight = (titleLines.slice(0, 2).length) * 4;
      infoY += titleHeight + 1.5;

      // Venue / Location (Clickable to Google Maps)
      if (ev.location) {
        const cleanLoc = cleanPdfText(ev.location);
        if (cleanLoc) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(2, 132, 199); // Maps Link Blue
          drawPinIcon(doc, textStartX, infoY);
          const venueLines = doc.splitTextToSize(cleanLoc, textWidth - 3);
          doc.text(venueLines[0], textStartX + 2.8, infoY);

          if (mapsUrl) {
            const venueW = Math.min(textWidth, doc.getTextWidth(venueLines[0]) + 4);
            doc.link(textStartX, infoY - 3, venueW, 4.2, { url: mapsUrl });
          }
          infoY += 3.5;
        }
      }

      // Description (wrapped)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      const maxDescLines = hasFlyer ? 2 : 3;
      const cleanDesc = cleanPdfText(ev.description || '');
      const descLines = doc.splitTextToSize(cleanDesc, textWidth);
      doc.text(descLines.slice(0, maxDescLines), textStartX, infoY);

      // Right Column: Flyer Thumbnail
      let flyerW = 0;
      let flyerX = pageWidth - margin;
      if (hasFlyer && flyerData) {
        try {
          const maxW = 23;
          const maxH = cardHeight - 6;
          flyerW = maxW;
          let flyerH = maxH;
          try {
            const fProps = doc.getImageProperties(flyerData);
            if (fProps && fProps.width && fProps.height) {
              const fRatio = fProps.width / fProps.height;
              if (fRatio > maxW / maxH) {
                flyerW = maxW;
                flyerH = maxW / fRatio;
              } else {
                flyerH = maxH;
                flyerW = maxH * fRatio;
              }
            }
          } catch {
            // fallback to box bounds
          }
          flyerX = pageWidth - margin - flyerW - 3;
          const flyerY = currentY + 3 + (maxH - flyerH) / 2;

          // Draw subtle image border frame
          doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
          doc.roundedRect(flyerX - 0.5, flyerY - 0.5, flyerW + 1, flyerH + 1, 1, 1, 'S');

          doc.addImage(flyerData, 'JPEG', flyerX, flyerY, flyerW, flyerH, undefined, 'FAST');
        } catch (imgErr) {
          console.warn('Could not embed flyer thumbnail in PDF:', imgErr);
        }
      }

      // Action Buttons (Outlook 365 Web & .ICS)
      const actionRight = hasFlyer && flyerData ? (flyerX - 3) : (pageWidth - margin - 4);
      const btnHeight = 4.6;
      const btnY = currentY + cardHeight - btnHeight - 2;

      const icsBtnW = 14;
      const outlookBtnW = 21;
      const btnGap = 2;

      const icsBtnX = actionRight - icsBtnW;
      const outlookBtnX = icsBtnX - btnGap - outlookBtnW;

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

      // 2. .ICS Download Button
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.roundedRect(icsBtnX, btnY, icsBtnW, btnHeight, 1.2, 1.2, 'F');
      doc.setDrawColor(BORDER_LIGHT[0], BORDER_LIGHT[1], BORDER_LIGHT[2]);
      doc.roundedRect(icsBtnX, btnY, icsBtnW, btnHeight, 1.2, 1.2, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      doc.text('.ICS', icsBtnX + icsBtnW / 2, btnY + 3.2, { align: 'center' });
      doc.link(icsBtnX, btnY, icsBtnW, btnHeight, { url: icsUrl });

      // Submitter info footer line inside card (to the left of action buttons)
      if (ev.submitterName) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        const maxSubWidth = outlookBtnX - textStartX - 3;
        const subText = cleanPdfText(`Submitted by ${ev.submitterName}${ev.submitterEmail ? ` (${ev.submitterEmail})` : ''}`);
        const subLines = doc.splitTextToSize(subText, Math.max(20, maxSubWidth));
        doc.text(subLines[0], textStartX, currentY + cardHeight - 3.2);
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
      const icsUrl = createIcsDownloadUrl(ev, options.baseUrl);
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
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(OUTLOOK_BLUE[0], OUTLOOK_BLUE[1], OUTLOOK_BLUE[2]);
      doc.text('+Outlook', colX.category, currentY + 9.5);
      doc.link(colX.category, currentY + 7, 10, 4, { url: outlookUrl });

      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      doc.text('•', colX.category + 11.5, currentY + 9.5);

      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      doc.text('.ics', colX.category + 14.5, currentY + 9.5);
      doc.link(colX.category + 13.5, currentY + 7, 8, 4, { url: icsUrl });

      currentY += rowHeight;
    }
  }

  // Draw footer on last page
  drawFooter(currentPage);

  // Save the PDF
  const validStart = toDate(options.startDate) || new Date();
  const filename = `CCP-Fortnightly-Events-${validStart.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
};

/**
 * Generate a preformatted text digest for WhatsApp groups.
 */
export const generateWhatsAppSummary = (
  events: Event[],
  startDate: Date | string,
  endDate: Date | string
): string => {
  const startMs = (toDate(startDate) || new Date()).getTime();
  const endMs = (toDate(endDate) || new Date()).getTime();
  const filteredEvents = events
    .filter((e) => {
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

  const dateRangeStr = formatDateRange(startDate, endDate);

  let text = `📅 *CORK CITY PARTNERSHIP — UPCOMING EVENTS*\n`;
  text += `*Schedule:* ${dateRangeStr}\n`;
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
        text += `🗓 *${currentDateGroup}*\n`;
      }
    } else if (evDateStr !== currentDateGroup) {
      currentDateGroup = evDateStr;
      text += `🗓 *${currentDateGroup}*\n`;
    }

    const timeStr = formatEventTime(ev.date, ev.endDate);
    text += `⏰ *${timeStr}* | *${ev.title}*\n`;
    if (ev.location) {
      const mapUrl = createGoogleMapsUrl(ev.location);
      text += `📍 *Venue:* ${ev.location} (${mapUrl})\n`;
    }
    if (ev.category) {
      text += `🏷 *Category:* ${ev.category}\n`;
    }
    if (ev.description) {
      const firstLines = ev.description.split('\n').filter(Boolean).slice(0, 2).join(' ');
      text += `ℹ️ ${firstLines}\n`;
    }
    if (ev.submitterName) {
      text += `👤 _Contact: ${ev.submitterName}_\n`;
    }
    text += `\n`;
  });

  text += `────────────────────────────\n`;
  text += `📌 *PDF Bulletin & Calendar:* Check company portal.`;

  return text;
};
