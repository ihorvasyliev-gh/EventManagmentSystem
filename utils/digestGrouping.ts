import type { Event } from '../types.ts';

/**
 * One digest entry: an event plus every occurrence of it inside the digest period.
 * Recurring and multi-date events expand into several instances that share the same `id`;
 * the digest shows them once, on their first date, with the rest listed as "Also on".
 */
export interface DigestEventGroup {
  /** First occurrence in the period — drives the card's date, time and links */
  event: Event;
  /** Every occurrence in the period (including `event`), sorted chronologically */
  occurrences: Event[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toTime = (d: Date | string | undefined | null): number => {
  if (!d) return NaN;
  return (d instanceof Date ? d : new Date(d)).getTime();
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const timeOfDay = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * Collapses occurrences sharing an event id into a single group, ordered by first occurrence.
 * Instances with an invalid date are dropped.
 */
export const groupDigestOccurrences = (events: Event[]): DigestEventGroup[] => {
  const byId = new Map<string, Event[]>();
  for (const ev of events) {
    if (isNaN(toTime(ev.date))) continue;
    const list = byId.get(ev.id);
    if (list) list.push(ev);
    else byId.set(ev.id, [ev]);
  }

  const groups: DigestEventGroup[] = [];
  byId.forEach((list) => {
    const occurrences = [...list].sort((a, b) => toTime(a.date) - toTime(b.date));
    // Drop duplicate instances of the same start (e.g. an event passed in twice)
    const unique = occurrences.filter((ev, i) => i === 0 || toTime(ev.date) !== toTime(occurrences[i - 1].date));
    groups.push({ event: unique[0], occurrences: unique });
  });

  return groups.sort((a, b) => toTime(a.event.date) - toTime(b.event.date));
};

/**
 * Short label for an extra occurrence, e.g. "Sat 26 Sep".
 * Appends the start time when it differs from the first occurrence ("Sat 26 Sep, 14:00").
 */
export const formatOccurrenceLabel = (occurrence: Date | string, first?: Date | string): string => {
  const d = occurrence instanceof Date ? occurrence : new Date(occurrence);
  if (isNaN(d.getTime())) return '';
  let label = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (first) {
    const f = first instanceof Date ? first : new Date(first);
    if (!isNaN(f.getTime()) && timeOfDay(f) !== timeOfDay(d)) {
      label += `, ${timeOfDay(d)}`;
    }
  }
  return label;
};

/** "Also on" line for a group, or '' when the event occurs only once in the period */
export const formatAlsoOnDates = (group: DigestEventGroup, separator = '  ·  '): string =>
  group.occurrences
    .slice(1)
    .map((occ) => formatOccurrenceLabel(occ.date, group.event.date))
    .filter(Boolean)
    .join(separator);

export const monthShort = (d: Date): string => MONTHS_SHORT[d.getMonth()];
export const monthShortUpper = (d: Date): string => MONTHS_SHORT[d.getMonth()].toUpperCase();
