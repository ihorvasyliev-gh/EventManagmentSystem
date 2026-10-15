/**
 * A shared digest's events as plain data, stored next to its PDF. The digest's page shows them
 * as a list that reads well on a phone (the PDF drawn at a phone's width has tiny text); the
 * PDF stays for printing and saving. Everything is worded when the digest is shared, so the
 * page shows it the same in any time zone.
 */
import type { Event } from '../types.ts';
import { isMultiDayEvent } from './date.ts';
import { formatAlsoOnDates, digestNewEvents, monthShort, type DigestPreviousIssue } from './digestGrouping.ts';
import { digestGroupsFor, formatPeriodShort, isAllDay, clock, MONTHS_LONG, WEEKDAYS_LONG, toDate } from './digestText.ts';
import { eventContacts } from './contacts.ts';

export interface DigestListEntry {
  /** "Thursday 15 October" */
  day: string;
  title: string;
  category: string;
  /** "10:00 – 11:30", "All day" or "09:00 – Fri 9 Oct, 17:00" */
  time: string;
  where: string;
  /** The other dates in the period, as the PDF writes them under "Also on" */
  also: string;
  description: string;
  contacts: Array<{ name: string; email: string }>;
  isNew: boolean;
}

export interface DigestList {
  version: 1;
  /** "16 – 30 October 2026" */
  period: string;
  entries: DigestListEntry[];
}

/** Far more than a digest carries; keeps a stored list small */
const MAX_ENTRIES = 500;
const MAX_TEXT = 4000;

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const timeOf = (start: Date, end: Date | null): string => {
  if (isAllDay(start, end)) return 'All day';
  if (!end) return clock(start);
  if (isMultiDayEvent(start, end)) return `${clock(start)} – ${WEEKDAYS_SHORT[end.getDay()]} ${end.getDate()} ${monthShort(end)}, ${clock(end)}`;
  return `${clock(start)} – ${clock(end)}`;
};

/** The digest's events, as its PDF lists them: once each, on their first date in the period */
export const buildDigestList = (
  events: Event[],
  options: { startDate: Date; endDate: Date; previousIssue?: DigestPreviousIssue | null; now?: Date }
): DigestList => {
  const groups = digestGroupsFor(events, options.startDate, options.endDate);
  const { newIds } = digestNewEvents(groups, options.previousIssue, options.now);
  return {
    version: 1,
    period: formatPeriodShort(options.startDate, options.endDate),
    entries: groups.slice(0, MAX_ENTRIES).map((group) => {
      const ev = group.event;
      const start = toDate(ev.date)!;
      return {
        day: `${WEEKDAYS_LONG[start.getDay()]} ${start.getDate()} ${MONTHS_LONG[start.getMonth()]}`,
        title: ev.title,
        category: ev.category || 'Other',
        time: timeOf(start, toDate(ev.endDate)),
        where: ev.location?.trim() ?? '',
        also: formatAlsoOnDates(group, ', '),
        description: ev.description?.trim() ?? '',
        contacts: eventContacts(ev).map((c) => ({ name: c.name ?? '', email: c.email ?? '' })),
        isNew: newIds.has(ev.id)
      };
    })
  };
};

const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '');

/** A stored list read back (by the server before storing it, and by the page): null if it isn't one */
export const parseDigestList = (value: unknown): DigestList | null => {
  if (!value || typeof value !== 'object') return null;
  const list = value as Partial<Record<keyof DigestList, unknown>>;
  if (list.version !== 1 || !Array.isArray(list.entries)) return null;
  const entries = list.entries.slice(0, MAX_ENTRIES).flatMap((raw): DigestListEntry[] => {
    if (!raw || typeof raw !== 'object') return [];
    const e = raw as Record<string, unknown>;
    if (!text(e.title) || !text(e.day)) return [];
    return [{
      day: text(e.day),
      title: text(e.title),
      category: text(e.category),
      time: text(e.time),
      where: text(e.where),
      also: text(e.also),
      description: text(e.description),
      contacts: (Array.isArray(e.contacts) ? e.contacts : []).slice(0, 10).flatMap((raw: unknown) => {
        const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        return text(c.name) || text(c.email) ? [{ name: text(c.name), email: text(c.email) }] : [];
      }),
      isNew: e.isNew === true
    }];
  });
  return { version: 1, period: text(list.period), entries };
};
