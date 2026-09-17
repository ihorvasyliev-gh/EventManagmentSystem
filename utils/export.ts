import type ExcelJS from 'exceljs';
import { Event } from '../types';

interface LoadedPoster {
  base64: string;
  extension: 'png' | 'jpeg' | 'gif';
}

/**
 * Safely load an event poster/image as base64 data URL with abort timeout.
 * Returns null if network fails, times out, or CORS prevents access.
 */
const loadEventPoster = async (url: string): Promise<LoadedPoster | null> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout per image

    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const blob = await res.blob();
    const mimeType = blob.type || '';
    let extension: 'png' | 'jpeg' | 'gif' = 'jpeg';
    if (mimeType.includes('png') || url.toLowerCase().includes('.png')) {
      extension = 'png';
    } else if (mimeType.includes('gif') || url.toLowerCase().includes('.gif')) {
      extension = 'gif';
    }

    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    if (!base64) return null;
    return { base64, extension };
  } catch {
    return null;
  }
};

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

// Export to iCal format (published events only)
export const exportToICal = (events: Event[]): string => {
  const publishedEvents = events.filter(e => e.status !== 'draft' && (e.status === 'published' || !e.status));

  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  let ical = 'BEGIN:VCALENDAR\r\n';
  ical += 'VERSION:2.0\r\n';
  ical += 'PRODID:-//CCP Events//EN\r\n';
  ical += 'CALSCALE:GREGORIAN\r\n';
  ical += 'METHOD:PUBLISH\r\n';

  publishedEvents.forEach(event => {
    ical += 'BEGIN:VEVENT\r\n';
    ical += `UID:${event.instanceKey || event.id}@ccp-events\r\n`;
    ical += `DTSTART:${formatDate(event.date)}\r\n`;
    let endDate: Date;
    if (event.endDate) {
      const eDate = event.endDate instanceof Date ? event.endDate : new Date(event.endDate);
      endDate = isNaN(eDate.getTime()) ? new Date(event.date.getTime() + 60 * 60 * 1000) : eDate;
    } else {
      endDate = new Date(event.date);
      endDate.setHours(endDate.getHours() + 1); // Default 1 hour duration
    }
    ical += `DTEND:${formatDate(endDate)}\r\n`;
    ical += `SUMMARY:${event.title.replace(/,/g, '\\,').replace(/;/g, '\\;')}\r\n`;
    ical += `DESCRIPTION:${event.description.replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')}\r\n`;
    ical += `LOCATION:${event.location.replace(/,/g, '\\,').replace(/;/g, '\\;')}\r\n`;
    ical += `DTSTAMP:${formatDate(new Date())}\r\n`;
    ical += 'SEQUENCE:0\r\n';
    ical += 'END:VEVENT\r\n';
  });

  ical += 'END:VCALENDAR\r\n';
  return ical;
};

// Export to CSV format (published events only with detailed columns)
export const exportToCSV = (events: Event[]): string => {
  const publishedEvents = events.filter(e => e.status !== 'draft' && (e.status === 'published' || !e.status));

  const headers = [
    'Title',
    'Category',
    'Start Date',
    'Start Time',
    'End Date',
    'End Time',
    'Location',
    'Description',
    'Status',
    'Recurrence',
    'Contact Name',
    'Contact Email',
    'Attendees',
    'Comments',
    'Attachments'
  ];

  const rows = publishedEvents.map(event => {
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

    const commentsText = (event.comments ?? [])
      .filter(c => {
        const cDate = c.occurrenceDate instanceof Date ? c.occurrenceDate : new Date(c.occurrenceDate);
        return cDate.getTime() === startDate.getTime();
      })
      .map(c => {
        const createdAt = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt);
        return `${c.userName} (${formatDateStr(createdAt)} ${formatTimeStr(createdAt)}): ${c.content}`;
      })
      .join('; ');

    const attachmentsText = (event.attachments ?? [])
      .map(a => `${a.name}: ${a.url}`)
      .join('; ');

    let attendeesText = '';
    if (event.attendeeNames && event.attendeeNames.length > 0) {
      attendeesText = `${event.attendeeNames.length} (${event.attendeeNames.map(a => a.userName).join(', ')})`;
    } else if (event.attendees && event.attendees.length > 0) {
      attendeesText = `${event.attendees.length} attendee(s)`;
    } else if (event.rsvpEnabled) {
      attendeesText = '0 attendees';
    } else {
      attendeesText = 'RSVP disabled';
    }

    return [
      event.title,
      event.category || '',
      startDateStr,
      startTimeStr,
      endDateStr,
      endTimeStr,
      event.location,
      event.description.replace(/"/g, '""'),
      'Published',
      recurrenceLabel,
      event.submitterName || '',
      event.submitterEmail || '',
      attendeesText,
      commentsText.replace(/"/g, '""'),
      attachmentsText.replace(/"/g, '""')
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
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
  const publishedEvents = events.filter(e => e.status !== 'draft' && (e.status === 'published' || !e.status));

  // 2. Pre-fetch posters concurrently for events that have posterUrl or image attachments
  const posterMap = new Map<string, LoadedPoster>();
  const posterFetches = publishedEvents.map(async (event) => {
    const imgUrl = event.posterUrl || event.attachments?.find(a => a.type === 'image')?.url;
    if (imgUrl) {
      const poster = await loadEventPoster(imgUrl);
      if (poster) {
        posterMap.set(event.instanceKey || event.id, poster);
      }
    }
  });
  await Promise.allSettled(posterFetches);

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
    { header: 'RSVP / Attendees', key: 'attendees', width: 22 },
    { header: 'Comments', key: 'comments', width: 40 },
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

    const commentsText = (event.comments ?? [])
      .filter(c => {
        const cDate = c.occurrenceDate instanceof Date ? c.occurrenceDate : new Date(c.occurrenceDate);
        return cDate.getTime() === startDate.getTime();
      })
      .map(c => {
        const createdAt = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt);
        return `${c.userName} (${formatDateStr(createdAt)} ${formatTimeStr(createdAt)}): ${c.content}`;
      })
      .join('\n');

    const attachmentsText = (event.attachments ?? [])
      .map(a => `${a.name}: ${a.url}`)
      .join('\n');

    let attendeesText = '';
    if (event.attendeeNames && event.attendeeNames.length > 0) {
      attendeesText = `${event.attendeeNames.length} (${event.attendeeNames.map(a => a.userName).join(', ')})`;
    } else if (event.attendees && event.attendees.length > 0) {
      attendeesText = `${event.attendees.length} attendee(s)`;
    } else if (event.rsvpEnabled) {
      attendeesText = '0 attendees';
    } else {
      attendeesText = 'RSVP disabled';
    }
    if (event.maxAttendees) {
      attendeesText += ` [Max: ${event.maxAttendees}]`;
    }

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
      submitterName: event.submitterName || '',
      submitterEmail: event.submitterEmail || '',
      attendees: attendeesText,
      comments: commentsText,
      attachments: attachmentsText
    });

    const key = event.instanceKey || event.id;
    const posterData = posterMap.get(key);
    if (posterData) {
      try {
        const imageId = workbook.addImage({
          base64: posterData.base64,
          extension: posterData.extension
        });

        row.height = 65;

        worksheet.addImage(imageId, {
          tl: { col: 0.1, row: row.number - 1 + 0.1 },
          ext: { width: 58, height: 58 },
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
      // Centered columns: Poster (1), Start Date (4), Start Time (5), End Date (6), End Time (7), Status (10), Recurrence (11), RSVP (14)
      const isCentered = [1, 4, 5, 6, 7, 10, 11, 14].includes(colNumber);
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
