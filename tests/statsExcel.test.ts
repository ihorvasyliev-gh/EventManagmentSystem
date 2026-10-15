import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { computePeriodStats, periodOccurrences } from '../utils/eventStats.ts';
import { exportStatsToExcel, statsDateRows, statsSummary } from '../utils/statsExcel.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event>): Event => ({
  id: 'a', title: 'Coffee morning', description: '', date: new Date(2026, 0, 6, 10), endDate: new Date(2026, 0, 6, 11, 30),
  location: 'Heron House', category: 'Community & Family', status: 'published', createdAt: new Date(2026, 0, 1), ...over
});

const events = [
  event({ id: 's', title: 'Coding club', date: new Date(2026, 0, 5, 16), endDate: new Date(2026, 0, 5, 17), category: 'Education & Training', recurrence: { type: 'weekly', interval: 1, occurrences: 3 }, tags: ['staff-submission'] }),
  event({ id: 'o', date: new Date(2026, 1, 10), endDate: null as unknown as undefined, location: 'Mahon Library' }),
  event({ id: 'd', title: 'Draft', status: 'draft' })
];
const start = new Date(2026, 0, 1);
const end = new Date(2026, 2, 31, 23, 59, 59);

test('the Dates sheet has each date held, in order, published only', () => {
  const rows = statsDateRows(periodOccurrences(events, undefined, start, end));
  assert.deepEqual(rows.map((r) => [r.date.toISOString().slice(0, 10), r.start, r.end, r.title, r.sentInByStaff]), [
    ['2026-01-05', '16:00', '17:00', 'Coding club', 'Yes'],
    ['2026-01-12', '16:00', '17:00', 'Coding club', 'Yes'],
    ['2026-01-19', '16:00', '17:00', 'Coding club', 'Yes'],
    ['2026-02-10', 'All day', '', 'Coffee morning', 'No']
  ]);
});

test('the Summary sheet has the totals and every venue', () => {
  const { totals, tables } = statsSummary(computePeriodStats(events, undefined, start, end, Number.POSITIVE_INFINITY));
  assert.deepEqual(totals, [['Events', 2], ['Dates held', 4], ['Venues', 2], ['Sent in by staff', 1]]);
  assert.deepEqual(tables.map((t) => t.title), ['By category', 'By month', 'Venues']);
  assert.deepEqual(tables[2].rows, [['Heron House', 3], ['Mahon Library', 1]]);
});

test('the workbook opens in Excel with both sheets filled in', async () => {
  const stats = computePeriodStats(events, undefined, start, end, Number.POSITIVE_INFINITY);
  const blob = await exportStatsToExcel(stats, '1 Jan 2026 – 31 Mar 2026', periodOccurrences(events, undefined, start, end));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(book.worksheets.map((s) => s.name), ['Summary', 'Dates']);
  const summary = book.getWorksheet('Summary')!;
  assert.equal(summary.getCell('A2').value, '1 Jan 2026 – 31 Mar 2026');
  assert.deepEqual([summary.getCell('A4').value, summary.getCell('B4').value], ['Events', 2]);
  const dates = book.getWorksheet('Dates')!;
  assert.equal(dates.rowCount, 5);
  assert.equal(dates.getCell('D2').value, 'Coding club');
  assert.equal((dates.getCell('A2').value as Date).toISOString(), '2026-01-05T00:00:00.000Z');
});
