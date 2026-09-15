import ExcelJS from 'exceljs';
import { Event } from '../types';

// Export to iCal format
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
    const endDate = new Date(event.date);
    endDate.setHours(endDate.getHours() + 1); // Default 1 hour duration
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

// Export to CSV format
export const exportToCSV = (events: Event[]): string => {
  const headers = ['Title', 'Date', 'Time', 'Location', 'Description', 'Category', 'Status'];
  const rows = events.map(event => [
    event.title,
    event.date.toLocaleDateString(),
    event.date.toLocaleTimeString(),
    event.location,
    event.description.replace(/"/g, '""'),
    event.category || '',
    event.status || 'published'
  ]);

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

const RECURRENCE_LABELS: Record<string, string> = {
  none: '',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom'
};

/** Export events to Excel (.xlsx) with description, comments, attachments. */
export const exportToExcel = async (events: Event[]): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Events');

  // Define columns
  worksheet.columns = [
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Time', key: 'time', width: 15 },
    { header: 'Location', key: 'location', width: 30 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Recurrence', key: 'recurrence', width: 20 },
    { header: 'Comments', key: 'comments', width: 50 },
    { header: 'Attachments', key: 'attachments', width: 50 }
  ];

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' } // Light gray
  };

  events.forEach(event => {
    const date = event.date instanceof Date ? event.date : new Date(event.date);
    const recurrenceLabel = event.recurrence?.type
      ? RECURRENCE_LABELS[event.recurrence.type] || event.recurrence.type
      : '';
    const commentsText = (event.comments ?? [])
      .filter(c => {
        const cDate = c.occurrenceDate instanceof Date ? c.occurrenceDate : new Date(c.occurrenceDate);
        // Compare timestamps to ensure the comment belongs to this specific event occurrence
        return cDate.getTime() === date.getTime();
      })
      .map(c => {
        const createdAt = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt);
        return `${c.userName} (${createdAt.toLocaleString()}): ${c.content}`;
      })
      .join('\n');
    const attachmentsText = (event.attachments ?? [])
      .map(a => `${a.name}: ${a.url}`)
      .join('\n');

    worksheet.addRow({
      title: event.title,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      location: event.location,
      description: event.description || '',
      category: event.category || '',
      status: event.status || 'published',
      recurrence: recurrenceLabel,
      comments: commentsText,
      attachments: attachmentsText
    });
  });

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
