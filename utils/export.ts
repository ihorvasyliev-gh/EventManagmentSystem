import { type Event } from '../types';
import { eventContacts } from './contacts';
import { foldICSLine } from './icsFold.ts';
import { loadImageForPdf, type LoadedPdfFlyer } from './pdf/images';
import { posterVariantUrl } from './posterVariants.ts';

/** Posters are shown 58 px tall in the sheet; made twice that size, they stay sharp zoomed in */
const SHEET_POSTER_PX = 58;
const POSTER_TIMEOUT_MS = 8000;

/** A row's poster (its small copy), or the first image attached */
const posterOf = (event: Event): string | undefined =>
  event.posterUrl ? posterVariantUrl(event.posterUrl, 'thumb') : event.attachments?.find(a => a.type === 'image')?.url;

/** A poster made small enough for the sheet, or null (offline, gone, not an image, too slow) */
const loadSheetPoster = (url: string): Promise<LoadedPdfFlyer | null> =>
  Promise.race([
    loadImageForPdf(url, 2 * SHEET_POSTER_PX, true),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), POSTER_TIMEOUT_MS))
  ]);

const formatDateStr = (d?: Date | string | null): string => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatTimeStr = (d?: Date | string | null): string => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const RECURRENCE_LABELS: Record<string, string> = {
  none: '',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom'
};

/** Drafts and pending submissions never leave the app */
export const isPublished = (e: Event): boolean => !e.status || e.status === 'published';

const escapeICS = (text = ''): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export const exportToICal = (events: Event[]): string => {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  let ical = 'BEGIN:VCALENDAR\r\n';
  ical += 'VERSION:2.0\r\n';
  ical += 'PRODID:-//CCP Events//EN\r\n';
  ical += 'CALSCALE:GREGORIAN\r\n';
  ical += 'METHOD:PUBLISH\r\n';

  events.forEach(event => {
    ical += 'BEGIN:VEVENT\r\n';
    ical += `UID:${event.instanceKey || event.id}@ccp-events\r\n`;
    ical += `DTSTART:${formatDate(event.date)}\r\n`;
    const end = event.endDate ? new Date(event.endDate) : null;
    const endDate = end && !isNaN(end.getTime()) ? end : new Date(event.date.getTime() + 60 * 60 * 1000); // Default 1 hour
    ical += `DTEND:${formatDate(endDate)}\r\n`;
    ical += `SUMMARY:${escapeICS(event.title)}\r\n`;
    ical += `DESCRIPTION:${escapeICS(event.description)}\r\n`;
    ical += `LOCATION:${escapeICS(event.location)}\r\n`;
    ical += `DTSTAMP:${formatDate(new Date())}\r\n`;
    ical += 'SEQUENCE:0\r\n';
    ical += 'END:VEVENT\r\n';
  });

  ical += 'END:VCALENDAR\r\n';
  return ical.split('\r\n').map(foldICSLine).join('\r\n');
};

// Download file helper (string content)
export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
};

// Download Blob (e.g. Excel file)
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export published events to professionally styled Excel (.xlsx) spreadsheet:
 * - Strictly published events only (excluding drafts/submissions)
 * - Start Date, Start Time, End Date, End Time columns
 * - Embedded poster thumbnails inside the worksheet
 * - CCP corporate slate styling & alternating row colors
 * - Gridlines enabled and text wrapping
 */
export const exportToExcel = async (events: Event[]): Promise<Blob> => {
  const ExcelJSConstructor = (await import('exceljs')).default;

  // 1. Strictly filter published events
  const publishedEvents = events.filter(isPublished);

  // 2. Each poster once, made small: a weekly series has a row per date, all with the same poster
  const posterUrls = [...new Set(publishedEvents.map(posterOf).filter((url): url is string => !!url))];
  const posters = new Map(await Promise.all(posterUrls.map(async (url) => [url, await loadSheetPoster(url)] as const)));
  // The workbook holds each image once; every row with that poster shows the same one
  const imageIds = new Map<string, number>();

  // 3. Create Workbook & Worksheet with gridlines enabled
  const workbook = new ExcelJSConstructor.Workbook();
  const worksheet = workbook.addWorksheet('Events', {
    views: [{ showGridLines: true }]
  });

  // 4. Define Columns
  worksheet.columns = [
    { header: 'Poster', key: 'poster', width: 14 },
    { header: 'Event Title', key: 'title', width: 32 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Start Date', key: 'startDate', width: 14 },
    { header: 'Start Time', key: 'startTime', width: 12 },
    { header: 'End Date', key: 'endDate', width: 14 },
    { header: 'End Time', key: 'endTime', width: 12 },
    { header: 'Location / Venue', key: 'location', width: 28 },
    { header: 'Description', key: 'description', width: 45 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Recurrence', key: 'recurrence', width: 16 },
    { header: 'Contact Name', key: 'submitterName', width: 22 },
    { header: 'Contact Email', key: 'submitterEmail', width: 26 },
    { header: 'Attachments', key: 'attachments', width: 35 }
  ];

  // 5. Header row styling (CCP Slate Dark & Red Accent)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800 (#1E293B)
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FFE10000' } }, // CCP Brand Red (#E10000) bottom border
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // 6. Populate Rows
  publishedEvents.forEach(event => {
    const startDate = event.date instanceof Date ? event.date : new Date(event.date);
    const startDateStr = formatDateStr(startDate);
    const startTimeStr = formatTimeStr(startDate);

    let endDateStr = startDateStr;
    let endTimeStr = '';
    if (event.endDate) {
      const eDate = event.endDate instanceof Date ? event.endDate : new Date(event.endDate);
      if (!isNaN(eDate.getTime())) {
        endDateStr = formatDateStr(eDate);
        endTimeStr = formatTimeStr(eDate);
      }
    }

    const recurrenceLabel = event.recurrence?.type
      ? RECURRENCE_LABELS[event.recurrence.type] || event.recurrence.type
      : '';

    const attachmentsText = (event.attachments ?? [])
      .map(a => `${a.name}: ${a.url}`)
      .join('\n');

    const contacts = eventContacts(event);
    const row = worksheet.addRow({
      poster: '',
      title: event.title,
      category: event.category || 'General',
      startDate: startDateStr,
      startTime: startTimeStr,
      endDate: endDateStr,
      endTime: endTimeStr,
      location: event.location || '',
      description: event.description || '',
      status: 'Published',
      recurrence: recurrenceLabel || 'None',
      // One line per contact person, the emails on the matching lines
      submitterName: contacts.map(c => c.name).join('\n'),
      submitterEmail: contacts.map(c => c.email ?? '').join('\n'),
      attachments: attachmentsText
    });

    const posterUrl = posterOf(event);
    const poster = posterUrl ? posters.get(posterUrl) : null;
    if (posterUrl && poster) {
      try {
        let imageId = imageIds.get(posterUrl);
        if (imageId === undefined) {
          imageId = workbook.addImage({ base64: poster.dataUrl, extension: poster.format === 'PNG' ? 'png' : 'jpeg' });
          imageIds.set(posterUrl, imageId);
        }

        row.height = 65;

        // In its own shape (flyers are mostly A4 upright), within a 58 px square
        const scale = SHEET_POSTER_PX / Math.max(poster.width, poster.height);
        worksheet.addImage(imageId, {
          tl: { col: 0.1, row: row.number - 1 + 0.1 },
          ext: { width: Math.round(poster.width * scale), height: Math.round(poster.height * scale) },
          editAs: 'oneCell'
        });
      } catch (err) {
        console.warn('Failed to embed poster into Excel row:', err);
        row.height = 28;
      }
    } else {
      row.height = 28;
    }

    // Apply Zebra striping and borders to data cells
    const isEven = row.number % 2 === 0;
    row.eachCell((cell, colNumber) => {
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' } // Soft Slate-50 (#F8FAFC)
        };
      }
      cell.font = {
        name: 'Calibri',
        size: 10,
        color: { argb: 'FF1E293B' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      // Centered columns: Poster (1), Start Date (4), Start Time (5), End Date (6), End Time (7), Status (10), Recurrence (11)
      const isCentered = [1, 4, 5, 6, 7, 10, 11].includes(colNumber);
      cell.alignment = {
        vertical: 'middle',
        horizontal: isCentered ? 'center' : 'left',
        wrapText: true
      };
    });
  });

  // Write to buffer & return Blob
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
