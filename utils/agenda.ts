/**
 * Lists of events that aren't bound to the month on screen: search and filter results across
 * all dates, and how far the Agenda can still be scrolled.
 */
import type { Event } from '../types.ts';
import { expandRecurringEvents, isRecurringEvent } from './recurrence.ts';
import { getLastOccurrenceTime } from './date.ts';

/** How far ahead a series with no end date is looked at */
export const OPEN_SERIES_MONTHS = 24;

const addMonthsTo = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

/** When an occurrence is over: its end, or its start when it has none */
const endOf = (event: Event): Date => (event.endDate && event.endDate > event.date ? event.endDate : event.date);

export interface ResultOptions {
  /** Today at midnight */
  today: Date;
  /** The date filter (end exclusive), when one is set */
  dateRange?: { start?: Date; end?: Date };
  /** The place filter: a series held in different places counts only where it is held there */
  location?: string;
  exceptions?: Map<string, Date[]>;
}

/**
 * Search and filter results as a list across all dates. Without a date filter every event is
 * listed once: a series at its next date (or its last one, when it is over). Within a date filter
 * each of its dates in the period is listed. Upcoming ones (ending today or later) come soonest
 * first, past ones latest first.
 */
export const resultInstances = (events: Event[], options: ResultOptions): { upcoming: Event[]; past: Event[] } => {
  const { today, dateRange, location, exceptions } = options;
  const atPlace = (e: Event) => !location || e.location?.trim() === location;
  const inRange = (e: Event) =>
    (!dateRange?.start || e.date >= dateRange.start) && (!dateRange?.end || e.date < dateRange.end);

  const instances: Event[] = [];
  for (const event of events) {
    if (dateRange?.start || dateRange?.end) {
      const from = dateRange.start ?? new Date(0);
      const to = dateRange.end ? new Date(dateRange.end.getTime() - 1) : addMonthsTo(from, OPEN_SERIES_MONTHS);
      instances.push(...expandRecurringEvents([event], from, to, exceptions).filter((e) => inRange(e) && atPlace(e)));
      continue;
    }
    if (!isRecurringEvent(event)) {
      if (atPlace(event)) instances.push(event);
      continue;
    }
    const next = expandRecurringEvents([event], today, addMonthsTo(today, OPEN_SERIES_MONTHS), exceptions)
      .filter(atPlace)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    if (next) {
      instances.push(next);
      continue;
    }
    // Over: its last date (looking back two years at most, so a long daily series stays cheap)
    const lookBack = new Date(Math.max(event.date.getTime(), addMonthsTo(today, -24).getTime()));
    const last = expandRecurringEvents([event], lookBack, new Date(today.getTime() - 1), exceptions)
      .filter(atPlace)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    if (last) instances.push(last);
  }

  const upcoming = instances.filter((e) => endOf(e) >= today).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = instances.filter((e) => endOf(e) < today).sort((a, b) => b.date.getTime() - a.date.getTime());
  return { upcoming, past };
};

/** A series that never ends by date (it repeats with no end date, or a number of times) */
const isOpenEnded = (event: Event): boolean =>
  isRecurringEvent(event) && event.recurrence!.type !== 'custom' && !event.recurrence!.endDate;

/** Whether any of the events still happens after `after` (the Agenda can load further) */
export const hasEventsAfter = (events: Event[], after: Date): boolean =>
  events.some((e) => isOpenEnded(e) || getLastOccurrenceTime(e) > after.getTime());
