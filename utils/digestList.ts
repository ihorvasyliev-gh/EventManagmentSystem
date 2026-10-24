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
  /** The event's id (lists shared before updates existed have none) */
  id?: string;
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
  /** The flyer the PDF shows ('' none), so a new flyer counts as a change (older lists have none) */
  poster?: string;
  isNew: boolean;
  /** In an update: it changed since the digest went out */
  isUpdated?: true;
}

export interface DigestList {
  version: 1;
  /** "16 – 30 October 2026" */
  period: string;
  entries: DigestListEntry[];
  /** In an update: the events no longer in it since the digest went out ("Coffee morning, Thu 15 Oct") */
  removed?: string[];
}

/** Far more than a digest carries; keeps a stored list small */
const MAX_ENTRIES = 500;
const MAX_TEXT = 4000;
const MAX_REMOVED = 50;

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
        id: ev.id,
        day: `${WEEKDAYS_LONG[start.getDay()]} ${start.getDate()} ${MONTHS_LONG[start.getMonth()]}`,
        title: ev.title,
        category: ev.category || 'Other',
        time: timeOf(start, toDate(ev.endDate)),
        where: ev.location?.trim() ?? '',
        also: formatAlsoOnDates(group, ', '),
        description: ev.description?.trim() ?? '',
        contacts: eventContacts(ev).map((c) => ({ name: c.name ?? '', email: c.email ?? '' })),
        poster: ev.posterUrl || ev.attachments?.find((a) => a.type === 'image')?.url || '',
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
      ...(text(e.id) ? { id: text(e.id) } : {}),
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
      ...(typeof e.poster === 'string' ? { poster: text(e.poster) } : {}),
      isNew: e.isNew === true,
      ...(e.isUpdated === true ? { isUpdated: true as const } : {})
    }];
  });
  const removed = Array.isArray(list.removed) ? list.removed.map(text).filter(Boolean).slice(0, MAX_REMOVED) : [];
  return { version: 1, period: text(list.period), entries, ...(removed.length ? { removed } : {}) };
};

/** Whether an event reads differently in two lists: what the page and the PDF show of it */
const entryChanged = (before: DigestListEntry, after: DigestListEntry): boolean =>
  (['day', 'title', 'category', 'time', 'where', 'also', 'description'] as const).some((f) => before[f] !== after[f])
  || JSON.stringify(before.contacts) !== JSON.stringify(after.contacts)
  // A list from before flyers were recorded can't tell
  || (before.poster !== undefined && after.poster !== undefined && before.poster !== after.poster);

export interface DigestListChanges {
  /** Entries of the newer list that read differently */
  changed: DigestListEntry[];
  /** Entries of the newer list the older one didn't have */
  added: DigestListEntry[];
  /** Entries of the older list the newer one doesn't have */
  removed: DigestListEntry[];
}

/**
 * What changed between two lists of the same digest period. Events are matched by id, and by
 * title where the older list has no ids (shared before updates existed).
 */
export const digestListChanges = (before: DigestList, after: DigestList): DigestListChanges => {
  const unmatched = [...before.entries];
  const changed: DigestListEntry[] = [];
  const added: DigestListEntry[] = [];
  after.entries.forEach((entry) => {
    const i = unmatched.findIndex((old) => (old.id && entry.id ? old.id === entry.id : old.title === entry.title));
    if (i < 0) {
      added.push(entry);
      return;
    }
    const [old] = unmatched.splice(i, 1);
    if (entryChanged(old, entry)) changed.push(entry);
  });
  return { changed, added, removed: unmatched };
};

/** "Coffee morning, Thursday 15 October": an event no longer in the digest */
const removedLabel = (entry: DigestListEntry) => `${entry.title}, ${entry.day}`;

/**
 * An update of a digest that went out (`sent`, null when its list can't be had): the events that
 * read differently since are marked Updated, and the ones no longer in it are named.
 */
export const markDigestUpdate = (list: DigestList, sent: DigestList | null): { list: DigestList; updatedIds: Set<string> } => {
  if (!sent) return { list, updatedIds: new Set() };
  const { changed, removed } = digestListChanges(sent, list);
  const updated = new Set(changed);
  return {
    list: {
      ...list,
      entries: list.entries.map((e) => (updated.has(e) ? { ...e, isUpdated: true as const } : e)),
      ...(removed.length ? { removed: removed.slice(0, MAX_REMOVED).map(removedLabel) } : {})
    },
    updatedIds: new Set(changed.flatMap((e) => (e.id ? [e.id] : [])))
  };
};
