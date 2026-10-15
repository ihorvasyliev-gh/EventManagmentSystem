/**
 * The statistics as an Excel workbook, for a Board report: a Summary sheet with the totals and
 * the tables the Statistics window shows (every venue, not only the busiest), and a Dates sheet
 * with each date held, to sort and filter.
 */
import type { Event } from '../types.ts';
import type { PeriodStats } from './eventStats.ts';
import { formatClock } from './date.ts';
import { isAllDay } from './digestText.ts';

export interface StatsTable {
  title: string;
  header: string[];
  rows: Array<Array<string | number>>;
}

export const STATS_NOTE = 'Published events only. A repeating or multi-date event counts once per date; deleted dates are left out.';

/** The Summary sheet: the totals, then a table per breakdown */
export const statsSummary = (stats: PeriodStats): { totals: Array<[string, number]>; tables: StatsTable[] } => ({
  totals: [
    ['Events', stats.events],
    ['Dates held', stats.occurrences],
    ['Venues', stats.venues],
    ['Sent in by staff', stats.submitted]
  ],
  tables: [
    { title: 'By category', header: ['Category', 'Dates held', 'Events'], rows: stats.byCategory.map((c) => [c.name, c.occurrences, c.events]) },
    { title: 'By month', header: ['Month', 'Dates held'], rows: stats.byMonth.map((m) => [m.label, m.occurrences]) },
    { title: 'Venues', header: ['Venue', 'Dates held'], rows: stats.topVenues.map((v) => [v.name, v.occurrences]) }
  ]
});

export interface StatsDateRow {
  /** The day, as a date Excel sorts (midnight UTC, so it shows the same day everywhere) */
  date: Date;
  start: string;
  end: string;
  title: string;
  category: string;
  venue: string;
  sentInByStaff: 'Yes' | 'No';
}

/** The Dates sheet: one row per date held */
export const statsDateRows = (dates: Event[]): StatsDateRow[] =>
  dates.map((o) => {
    const end = o.endDate && !isNaN(o.endDate.getTime()) ? o.endDate : null;
    const allDay = isAllDay(o.date, end);
    return {
      date: new Date(Date.UTC(o.date.getFullYear(), o.date.getMonth(), o.date.getDate())),
      start: allDay ? 'All day' : formatClock(o.date),
      end: allDay || !end ? '' : formatClock(end),
      title: o.title,
      category: o.category?.trim() || 'Uncategorised',
      venue: o.location?.trim() ?? '',
      sentInByStaff: o.tags?.includes('staff-submission') ? 'Yes' : 'No'
    };
  });

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } } as const;
const HEADER_FONT = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const BODY_FONT = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };

/** The workbook, as an .xlsx file */
export const exportStatsToExcel = async (stats: PeriodStats, periodLabel: string, dates: Event[]): Promise<Blob> => {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 36 }, { width: 14 }, { width: 12 }];
  summary.addRow(['CCP events']).font = { ...BODY_FONT, size: 16, bold: true };
  summary.addRow([periodLabel]).font = { ...BODY_FONT, color: { argb: 'FF475569' } };
  summary.addRow([]);
  const { totals, tables } = statsSummary(stats);
  for (const [label, value] of totals) {
    const row = summary.addRow([label, value]);
    row.font = BODY_FONT;
    row.getCell(2).font = { ...BODY_FONT, bold: true };
  }
  for (const table of tables) {
    if (table.rows.length === 0) continue;
    summary.addRow([]);
    summary.addRow([table.title]).font = { ...BODY_FONT, size: 13, bold: true };
    const header = summary.addRow(table.header);
    header.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    for (const values of table.rows) summary.addRow(values).font = BODY_FONT;
  }
  summary.addRow([]);
  summary.addRow([STATS_NOTE]).font = { ...BODY_FONT, italic: true, color: { argb: 'FF64748B' } };

  const sheet = workbook.addWorksheet('Dates', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14, style: { numFmt: 'ddd d mmm yyyy' } },
    { header: 'Start', key: 'start', width: 10 },
    { header: 'End', key: 'end', width: 10 },
    { header: 'Event', key: 'title', width: 40 },
    { header: 'Category', key: 'category', width: 26 },
    { header: 'Venue', key: 'venue', width: 32 },
    { header: 'Sent in by staff', key: 'sentInByStaff', width: 16 }
  ];
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  for (const row of statsDateRows(dates)) sheet.addRow(row).font = BODY_FONT;
  if (dates.length > 0) sheet.autoFilter = { from: 'A1', to: 'G1' };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
