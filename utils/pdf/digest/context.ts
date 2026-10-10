/**
 * What every part of the digest draws with: the document and its helpers, the page
 * geometry, and the period's events worked out once (groups, days with events, the grid
 * of "At a glance").
 */
import type jsPDF from 'jspdf';
import type { createScreenOnlyLayer } from '../../pdfScreenOnly.ts';
import type { LayoutBlock } from '../../pdfLayout.ts';
import { type Event } from '../../../types';
import { isMultiDayEvent } from '../../date';
import { groupDigestOccurrences, type DigestEventGroup } from '../../digestGrouping';
import { toDate, startOfLocalDay } from '../../digestText.ts';
import type { createPdfKit } from '../kit';
import type { LoadedPdfFlyer } from '../images';
import { addDays, dayKeyOf } from '../dates';

export interface BulletinOptions {
  startDate: Date;
  endDate: Date;
  format: 'executive' | 'compact';
  /** 'save' downloads the file (default); 'blob' returns it, e.g. for an in-browser preview */
  output?: 'save' | 'blob';
}

export type PdfKit = ReturnType<typeof createPdfKit>;
export type ScreenOnly = ReturnType<typeof createScreenOnlyLayer>;
export type PdfFlyer = LoadedPdfFlyer & { alias: string };

export interface Block extends LayoutBlock {
  draw: (y: number) => void;
  /** Executive cards: index of the event group (for the contents list) */
  group?: number;
  /**
   * Executive cards: draw the day's date beside the card — on the day's first card, and
   * again ("cont.") on the first card of a page the day carries over onto. Set after pagination.
   */
  tile?: 'first' | 'continued';
}

export interface Geometry {
  W: number;
  H: number;
  M: number;
  CW: number;
  /** Content top on continuation pages */
  PAGE_TOP: number;
  PAGE_BOTTOM: number;
  /** Executive cards sit right of a narrow column holding each day's date */
  TILE_W: number;
  CARD_X: number;
  CARD_W: number;
  /** Bottom of page 1's title and totals */
  HERO_BOTTOM: number;
}

export const pageGeometry = (doc: jsPDF): Geometry => {
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 14;
  const TILE_W = 12;
  const CARD_X = M + TILE_W + 3;
  return {
    W,
    H,
    M,
    CW: W - M * 2,                               // 182
    PAGE_TOP: 26,
    PAGE_BOTTOM: H - 17,
    TILE_W,
    CARD_X,
    CARD_W: W - M - CARD_X,                      // 167
    HERO_BOTTOM: 57
  };
};

export interface DigestData {
  periodStart: Date;
  periodEnd: Date;
  isExecutive: boolean;
  today: Date;
  /** Published occurrences that start in the period */
  inPeriod: Event[];
  /** Occurrences of the same event merged into one entry */
  groups: DigestEventGroup[];
  /** Days of the period that have something on (multi-day events cover every day they span) */
  eventsByDay: Map<string, Event[]>;
  venues: Set<string | undefined>;
  /** Every day of the period something is on, counting each day a multi-day event spans */
  eventDays: Set<string>;
  categories: string[];
  /** "At a glance" grid: whole weeks, Monday to Sunday, covering the period */
  gridStart: Date;
  gridEnd: Date;
  gridRows: number;
}

export const collectDigestData = (events: Event[], options: BulletinOptions): DigestData => {
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
  const isExecutive = options.format === 'executive';
  const today = startOfLocalDay(new Date());

  const eventsByDay = new Map<string, Event[]>();
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
  const venues = new Set(groups.flatMap((g) => g.occurrences.map((o) => o.location?.trim().toLowerCase())).filter(Boolean));
  const eventDays = new Set(Array.from(eventsByDay.keys()).filter((key) => key >= dayKeyOf(periodStart) && key <= dayKeyOf(periodEnd)));
  const categories = Array.from(new Set(groups.map((g) => g.event.category || 'Other')));

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

  return { periodStart, periodEnd, isExecutive, today, inPeriod, groups, eventsByDay, venues, eventDays, categories, gridStart, gridEnd, gridRows };
};

export interface DigestContext extends DigestData {
  doc: jsPDF;
  kit: PdfKit;
  /** "Add to calendar" buttons show in the viewer but are left off paper when printed */
  screenOnly: ScreenOnly;
  geo: Geometry;
  logo: LoadedPdfFlyer | null;
  /** Executive cards: each event's flyer thumbnail */
  flyers: Map<string, PdfFlyer>;
}
