import jsPDF from 'jspdf';
import { Event } from '../types';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  title?: string;
}

// CCP Brand Colors (RGB)
const CCP_MAGENTA = [179, 0, 102]; // #B30066
const CCP_GREEN = [57, 181, 74];   // #39B54A
const SLATE_DARK = [30, 41, 59];   // #1E293B
const SLATE_MUTED = [100, 116, 139]; // #64748B
const BG_LIGHT = [248, 250, 252];  // #F8FAFC
const BORDER_LIGHT = [226, 232, 240]; // #E2E8F0

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

const formatDateRange = (start: Date, end: Date) => {
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${start.toLocaleDateString('en-IE', opt)} – ${end.toLocaleDateString('en-IE', opt)}`;
};

const formatEventDate = (d: Date) => {
  return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatEventTime = (start: Date, end?: Date) => {
  const s = start.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (end) {
    const e = end.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${s} – ${e}`;
  }
  return s;
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
  const startMs = options.startDate.getTime();
  const endMs = options.endDate.getTime();
  const filteredEvents = events
    .filter((e) => {
      const t = e.date.getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let currentPage = 1;

  // Header helper
  const drawHeader = () => {
    // Top decorative brand bar
    doc.setFillColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
    doc.rect(margin, margin, contentWidth, 2, 'F');
    doc.setFillColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
    doc.rect(margin + contentWidth * 0.7, margin, contentWidth * 0.3, 2, 'F');

    // Draw logo if available
    let headerTextX = margin;
    if (logoData) {
      try {
        doc.addImage(logoData, 'PNG', margin, margin + 4, 38, 12);
        headerTextX = margin + 42;
      } catch {
        headerTextX = margin;
      }
    }

    // Header Titles
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
    doc.text('CORK CITY PARTNERSHIP', headerTextX, margin + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
    doc.text('UPCOMING EVENTS BULLETIN', headerTextX, margin + 13);

    // Period Badge on right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
    doc.text(
      `Period: ${formatDateRange(options.startDate, options.endDate)}`,
      pageWidth - margin,
      margin + 8,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('For the Board of Directors & Staff', pageWidth - margin, margin + 13, { align: 'right' });

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

      // Check if we need to print a week header
      const diffDays = Math.floor((ev.date.getTime() - startMs) / (1000 * 60 * 60 * 24));
      const weekNum = diffDays < 7 ? 1 : 2;

      const hasFlyer = !!flyerData;
      const cardHeight = hasFlyer ? 38 : 30;

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
        doc.setTextColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
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
      doc.setFillColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
      doc.roundedRect(margin, currentY, 2.5, cardHeight, 1, 1, 'F');

      // Date & Time Column (left)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      doc.text(formatEventDate(ev.date), margin + 6, currentY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
      doc.text(formatEventTime(ev.date, ev.endDate), margin + 6, currentY + 11);

      // Venue / Location
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      const venueLines = doc.splitTextToSize(`Venue: ${ev.location}`, 36);
      doc.text(venueLines.slice(0, 2), margin + 6, currentY + 16);

      // Category Pill
      if (ev.category) {
        doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
        doc.roundedRect(margin + 6, currentY + 22, 34, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
        const catText = ev.category.length > 22 ? ev.category.slice(0, 20) + '…' : ev.category;
        doc.text(catText, margin + 8, currentY + 25.5);
      }

      // Middle Column: Title & Description
      const textStartX = margin + 46;
      const textWidth = hasFlyer ? contentWidth - 46 - 28 : contentWidth - 48;

      // Event Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const titleLines = doc.splitTextToSize(ev.title, textWidth);
      doc.text(titleLines.slice(0, 2), textStartX, currentY + 6.5);

      const titleHeight = (titleLines.slice(0, 2).length) * 4.5;

      // Description (wrapped)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      const maxDescLines = hasFlyer ? 4 : 3;
      const descLines = doc.splitTextToSize(ev.description, textWidth);
      doc.text(descLines.slice(0, maxDescLines), textStartX, currentY + 7 + titleHeight);

      // Submitter info footer line inside card
      if (ev.submitterName) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Submitted by ${ev.submitterName}${ev.submitterEmail ? ` (${ev.submitterEmail})` : ''}`,
          textStartX,
          currentY + cardHeight - 2.5
        );
      }

      // Right Column: Flyer Thumbnail
      if (hasFlyer && flyerData) {
        try {
          const flyerW = 24;
          const flyerH = cardHeight - 6;
          const flyerX = pageWidth - margin - flyerW - 3;
          doc.addImage(flyerData, 'JPEG', flyerX, currentY + 3, flyerW, flyerH, undefined, 'FAST');
        } catch (imgErr) {
          console.warn('Could not embed flyer thumbnail in PDF:', imgErr);
        }
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
      doc.setTextColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
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

      // Date & Time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      doc.text(formatEventDate(ev.date), colX.date, currentY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(CCP_GREEN[0], CCP_GREEN[1], CCP_GREEN[2]);
      doc.text(formatEventTime(ev.date, ev.endDate), colX.time, currentY + 5);

      // Event Title & short desc
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const title = ev.title.length > 34 ? ev.title.slice(0, 32) + '…' : ev.title;
      doc.text(title, colX.title, currentY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE_MUTED[0], SLATE_MUTED[1], SLATE_MUTED[2]);
      const desc = ev.description.replace(/\n/g, ' ').slice(0, 50) + (ev.description.length > 50 ? '…' : '');
      doc.text(desc, colX.title, currentY + 8.5);

      // Venue
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(SLATE_DARK[0], SLATE_DARK[1], SLATE_DARK[2]);
      const venue = ev.location.length > 25 ? ev.location.slice(0, 23) + '…' : ev.location;
      doc.text(venue, colX.venue, currentY + 5);

      // Category
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(CCP_MAGENTA[0], CCP_MAGENTA[1], CCP_MAGENTA[2]);
      const cat = (ev.category || 'Event').slice(0, 18);
      doc.text(cat, colX.category, currentY + 5);

      currentY += rowHeight;
    }
  }

  // Draw footer on last page
  drawFooter(currentPage);

  // Save the PDF
  const filename = `CCP-Fortnightly-Events-${options.startDate.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
};

/**
 * Generate a preformatted text digest for WhatsApp groups.
 */
export const generateWhatsAppSummary = (
  events: Event[],
  startDate: Date,
  endDate: Date
): string => {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const filteredEvents = events
    .filter((e) => {
      const t = e.date.getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const dateRangeStr = formatDateRange(startDate, endDate);

  let text = `📅 *CORK CITY PARTNERSHIP — UPCOMING EVENTS*\n`;
  text += `*Fortnightly Schedule:* ${dateRangeStr}\n`;
  text += `_Circulated for the Board & Staff_\n`;
  text += `────────────────────────────\n\n`;

  if (filteredEvents.length === 0) {
    text += `No upcoming events scheduled for this period.\n\n`;
    return text;
  }

  // Group by date
  let currentDateGroup = '';

  filteredEvents.forEach((ev) => {
    const evDateStr = ev.date.toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    if (evDateStr !== currentDateGroup) {
      currentDateGroup = evDateStr;
      text += `🗓 *${currentDateGroup}*\n`;
    }

    const timeStr = formatEventTime(ev.date, ev.endDate);
    text += `⏰ *${timeStr}* | *${ev.title}*\n`;
    text += `📍 *Venue:* ${ev.location}\n`;
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
  text += `📌 *PDF Bulletin & Calendar:* Check company email or portal.`;

  return text;
};
