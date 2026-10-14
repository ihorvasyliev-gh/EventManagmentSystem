/**
 * What changed in an event, in words, for its history: "Date & time: Thu 15 Oct 2026, 10:00–11:30
 * → Thu 22 Oct 2026, 10:00–11:30". Shared by the app (admins' edits) and /api/edit-event (staff
 * changing their own events), so every edit is logged the same way. Both sides are events rows
 * (snake_case), as stored. Times are read on Irish time.
 */
import { readContacts } from './contacts.ts';
import { describeRepeat, formatShortDate, isPatternType } from './repeat.ts';

export interface ChangeSource {
  title?: string | null;
  description?: string | null;
  date: string;
  end_date?: string | null;
  location?: string | null;
  poster_url?: string | null;
  status?: string | null;
  category?: string | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_occurrences?: number | null;
  recurrence_custom_dates?: string[] | null;
  recurrence_custom_end_dates?: string[] | null;
  recurrence_custom_locations?: Array<string | null> | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  extra_contacts?: unknown;
}

export interface Change {
  old: string | null;
  new: string | null;
}

export type EventChanges = Record<string, Change>;

/** How each kind of change is labelled, in the order they are shown */
export const CHANGE_LABELS: ReadonlyArray<[key: string, label: string]> = [
  ['title', 'Name'],
  ['category', 'Category'],
  ['status', 'Status'],
  ['when', 'Date & time'],
  ['repeat', 'Repeats'],
  ['location', 'Venue'],
  ['description', 'Description'],
  ['poster', 'Poster'],
  ['contacts', 'Contacts']
];

/** Occurrences listed in one change before the rest are counted ("and 4 more") */
const MAX_LISTED = 6;

const TIME = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const text = (value: string | null | undefined): string => (value ?? '').trim();

const valid = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

/** "Thu 15 Oct 2026, 10:00–11:30" (the end's date too when it ends on another day) */
const occurrenceLabel = (start: Date, end: Date | null, startTime = TIME.format(start), endTime = end ? TIME.format(end) : ''): string => {
  const day = formatShortDate(start);
  if (!end || end.getTime() <= start.getTime()) return `${day}, ${startTime}`;
  const endDay = formatShortDate(end);
  return endDay === day ? `${day}, ${startTime}–${endTime}` : `${day}, ${startTime} – ${endDay}, ${endTime}`;
};

/**
 * Every occurrence an event row describes, as words. A repeating series is described by its
 * first date (how it repeats is a change of its own). Hand-picked dates without their own times
 * run at the time of day of the event itself.
 */
const occurrenceLabels = (row: ChangeSource): string[] => {
  const start = valid(row.date);
  if (!start) return [];
  const end = valid(row.end_date);
  const dates = row.recurrence_custom_dates;
  if (row.recurrence_type !== 'custom' || !dates?.length) return [occurrenceLabel(start, end)];

  const ends = row.recurrence_custom_end_dates;
  const ownTimes = !!ends && ends.length === dates.length;
  const places = row.recurrence_custom_locations;
  // (one address repeated for every date is just the event's address)
  const ownPlaces = !!places && places.length === dates.length && places.some((p) => text(p) !== text(places[0]));
  const durationMs = end ? end.getTime() - start.getTime() : null;
  return dates.flatMap((iso, i) => {
    const day = valid(iso);
    if (!day) return [];
    let label: string;
    if (ownTimes) {
      label = occurrenceLabel(day, valid(ends![i]));
    } else {
      // The series' time of day on this date (stored dates may carry another time)
      const ownEnd = durationMs !== null && durationMs > 0 ? new Date(day.getTime() + durationMs) : null;
      label = occurrenceLabel(day, ownEnd, TIME.format(start), end ? TIME.format(end) : '');
    }
    const place = ownPlaces ? text(places![i]) : '';
    return [place ? `${label} at ${place}` : label];
  });
};

const list = (items: string[]): string | null => {
  if (items.length === 0) return null;
  const shown = items.slice(0, MAX_LISTED).join('; ');
  return items.length > MAX_LISTED ? `${shown} and ${items.length - MAX_LISTED} more` : shown;
};

/** Every address the event is held at */
const venues = (row: ChangeSource): string => {
  const all = [row.location, ...(row.recurrence_type === 'custom' ? row.recurrence_custom_locations ?? [] : [])];
  return Array.from(new Set(all.map(text).filter(Boolean))).join(' · ');
};

const repeatText = (row: ChangeSource): string => {
  if (row.recurrence_type === 'custom') return 'Only on the picked dates';
  return describeRepeat({
    type: row.recurrence_type,
    interval: row.recurrence_interval,
    endDate: row.recurrence_end_date,
    occurrences: row.recurrence_occurrences
  }, row.date) ?? 'Does not repeat';
};

// Emails in lower case: the form saves them that way, which is no change worth a line
const contactsText = (row: ChangeSource): string =>
  readContacts([{ name: row.submitter_name, email: row.submitter_email }, ...readContacts(row.extra_contacts)])
    .map((c) => {
      const email = c.email?.toLowerCase();
      return c.name && email ? `${c.name} (${email})` : c.name || email || '';
    })
    .join('; ');

const statusText = (status: string | null | undefined): string =>
  status === 'draft' ? 'Pending review' : status === 'published' ? 'Published' : text(status);

/**
 * The changes from `before` to `after`, by CHANGE_LABELS key; empty when nothing a person
 * would notice changed. Values are what is shown: the old value struck out, then the new one
 * (either may be null, e.g. a date only added or only removed).
 */
export const describeChanges = (before: ChangeSource, after: ChangeSource): EventChanges => {
  const changes: EventChanges = {};
  const compare = (key: string, oldValue: string, newValue: string) => {
    if (oldValue !== newValue) changes[key] = { old: oldValue || null, new: newValue || null };
  };

  compare('title', text(before.title), text(after.title));
  compare('category', text(before.category), text(after.category));
  compare('status', statusText(before.status), statusText(after.status));

  // Dates: only the ones taken out and put in, so a long series shows what really moved
  const oldDates = occurrenceLabels(before);
  const newDates = occurrenceLabels(after);
  const removed = oldDates.filter((d) => !newDates.includes(d));
  const added = newDates.filter((d) => !oldDates.includes(d));
  if (removed.length > 0 || added.length > 0) changes.when = { old: list(removed), new: list(added) };

  // Only worth a line when a pattern is involved (one date ↔ picked dates shows in the dates)
  if (isPatternType(before.recurrence_type) || isPatternType(after.recurrence_type)) {
    compare('repeat', repeatText(before), repeatText(after));
  }

  compare('location', venues(before), venues(after));
  compare('description', text(before.description), text(after.description));

  const oldPoster = text(before.poster_url);
  const newPoster = text(after.poster_url);
  if (oldPoster !== newPoster) {
    changes.poster = { old: null, new: !oldPoster ? 'Added' : !newPoster ? 'Removed' : 'Replaced' };
  }

  compare('contacts', contactsText(before), contactsText(after));
  return changes;
};
