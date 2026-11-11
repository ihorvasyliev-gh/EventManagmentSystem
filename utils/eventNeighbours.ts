/**
 * The events just before and just after the one open in the event window, by date: what its
 * Previous / Next buttons (and the ← → keys) go to.
 */
import type { Event } from '../types.ts';
import { expandRecurringEvents } from './recurrence.ts';

/** How far back and ahead of the open event its neighbours are looked for */
const MONTHS_BACK = 6;
const MONTHS_AHEAD = 12;

export interface NeighbourOptions {
  /** The date filter (end exclusive) and place filter in use: dates outside them are skipped */
  dateRange?: { start?: Date; end?: Date };
  location?: string;
  exceptions?: Map<string, Date[]>;
}

const addMonthsTo = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

/** By start, then by title, then by id: the same order every time for events at the same hour */
const inOrder = (a: Event, b: Event): number =>
  a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

/**
 * `events` are the ones the calendar is showing (after search and filters); each date of a
 * repeating event counts on its own, so Next from one Thursday of a weekly class may be the
 * following Thursday.
 */
export const eventNeighbours = (
  events: Event[],
  current: Event,
  { dateRange, location, exceptions }: NeighbourOptions = {}
): { previous: Event | null; next: Event | null } => {
  const from = addMonthsTo(current.date, -MONTHS_BACK);
  const to = addMonthsTo(current.date, MONTHS_AHEAD);
  const isCurrent = (e: Event) => e.id === current.id && e.date.getTime() === current.date.getTime();
  const others = expandRecurringEvents(events, from, to, exceptions).filter((e) =>
    !isCurrent(e) &&
    (!dateRange?.start || e.date >= dateRange.start) && (!dateRange?.end || e.date < dateRange.end) &&
    (!location || e.location?.trim() === location)
  );

  let previous: Event | null = null;
  let next: Event | null = null;
  for (const e of others) {
    if (inOrder(e, current) < 0) {
      if (!previous || inOrder(e, previous) > 0) previous = e;
    } else if (!next || inOrder(e, next) < 0) {
      next = e;
    }
  }
  return { previous, next };
};
