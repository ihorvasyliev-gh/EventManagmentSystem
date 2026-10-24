/**
 * The digest that went out, against the calendar as it is now: which of its events read
 * differently, so an admin can update it (its link then shows the change). Shared by the digest
 * dialog (which updates it) and the inbox and the banner above the calendar (which point to it).
 */
import type { Event } from '../types.ts';
import { buildDigestList, digestListChanges, type DigestList } from './digestList.ts';
import { digestFromKey } from './digestLinks.ts';
import { expandRecurringEvents } from './recurrence.ts';
import { formatLocalDate } from './date.ts';
import { monthShort } from './digestGrouping.ts';
import { WEEKDAYS_LONG } from './digestText.ts';

/** A digest can be updated for a week after it went out: then the next one is due */
export const UPDATE_DAYS = 7;

/** The latest digest shared (what its links show) and its events as they show there (null: unknown) */
export interface SentDigestState<D extends { issued: string; key: string } = { issued: string; key: string }> {
  digest: D;
  list: DigestList | null;
}

/** The day a digest went out (YYYY-MM-DD) as a local date */
export const issuedDay = (issued: string): Date => new Date(`${issued}T00:00:00`);

/** Whether a digest that went out on `issued` can still be updated */
export const isUpdatable = (issued: string, now: Date = new Date()): boolean =>
  now.getTime() < issuedDay(issued).getTime() + UPDATE_DAYS * 86400000;

/**
 * The sent digest's period, and the events in it that read differently now (changed, added or
 * no longer in it), by title; `changed` is null when its list can't be had to compare with
 */
export const sentDigestChanges = (
  sent: SentDigestState | null,
  events: Event[],
  recurrenceExceptions?: Map<string, Date[]>
): { start: Date; end: Date; changed: string[] | null } | null => {
  const file = sent && digestFromKey(sent.digest.key);
  if (!sent || !file?.start || !file.end) return null;
  const start = new Date(`${file.start}T00:00:00`);
  const end = new Date(`${file.end}T23:59:59.999`);
  if (!sent.list) return { start, end, changed: null };
  const now = buildDigestList(expandRecurringEvents(events, start, end, recurrenceExceptions), { startDate: start, endDate: end });
  const { changed, added, removed } = digestListChanges(sent.list, now);
  return { start, end, changed: [...changed, ...added, ...removed].map((e) => e.title) };
};

/** "today" or "on Fri 23 Oct" */
export const sentOn = (day: Date, today: Date = new Date()): string =>
  formatLocalDate(day) === formatLocalDate(today)
    ? 'today'
    : `on ${WEEKDAYS_LONG[day.getDay()].slice(0, 3)} ${day.getDate()} ${monthShort(day)}`;

/** "Coffee morning", "Coffee morning and Job fair", "A, B, C and 2 more" */
export const nameEvents = (titles: string[]): string => {
  const shown = titles.slice(0, 3);
  const more = titles.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
};
