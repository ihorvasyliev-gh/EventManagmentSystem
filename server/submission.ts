/**
 * Checks what the public /submit form sends and turns it into an events row. The row is written
 * with the service-role key, so nothing the browser sends is trusted: status, creator and tags
 * are set here. Staff editing their own event (/api/edit-event) send the same fields.
 */
import { isPatternType, type PatternType } from '../utils/repeat.ts';

export interface SubmissionInput {
  title?: unknown;
  description?: unknown;
  date?: unknown;
  end_date?: unknown;
  location?: unknown;
  category?: unknown;
  recurrence_type?: unknown;
  recurrence_interval?: unknown;
  recurrence_end_date?: unknown;
  recurrence_occurrences?: unknown;
  recurrence_custom_dates?: unknown;
  recurrence_custom_end_dates?: unknown;
  recurrence_custom_locations?: unknown;
  submitter_name?: unknown;
  submitter_email?: unknown;
  extra_contacts?: unknown;
}

export interface SubmissionContact {
  name: string;
  email: string;
}

export interface SubmissionRow {
  title: string;
  description: string;
  date: string;
  end_date: string | null;
  location: string;
  category: string | null;
  recurrence_type: 'none' | 'custom' | PatternType;
  /** Repeating series: every how many days / weeks / months / years */
  recurrence_interval: number | null;
  /** Repeating series: the last day it runs (null: it carries on) */
  recurrence_end_date: string | null;
  /** Repeating series an admin set up to stop after so many dates */
  recurrence_occurrences: number | null;
  recurrence_custom_dates: string[] | null;
  recurrence_custom_end_dates: string[] | null;
  recurrence_custom_locations: (string | null)[] | null;
  /** Null only for an event saved without a contact that is still without one (see checkSubmission) */
  submitter_name: string | null;
  submitter_email: string | null;
  /** More contact people besides the submitter */
  extra_contacts: SubmissionContact[];
}

export const LIMITS = {
  title: 200,
  description: 2000,
  location: 300,
  category: 80,
  name: 120,
  email: 254,
  dates: 366,
  /** Repeating series: at most every 52 weeks (or days, months…) */
  interval: 52,
  occurrences: 1000,
  /** Contact people besides the submitter (utils/contacts.ts MAX_CONTACTS, less the submitter) */
  extraContacts: 4
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

const isoDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const isoList = (value: unknown): string[] | null | undefined => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.dates) return undefined;
  const list = value.map(isoDate);
  return list.every((d): d is string => d !== null) ? list : undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A whole number from min to max, null when not given, undefined when not valid */
const count = (value: unknown, min: number, max: number): number | null | undefined => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
};

/** More contact people, each with a name and a valid email (or what's wrong with the list) */
const contactList = (value: unknown): SubmissionContact[] | string => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return 'The contact people are not valid.';
  if (value.length > LIMITS.extraContacts) return `Please list up to ${LIMITS.extraContacts + 1} contact people.`;
  const contacts: SubmissionContact[] = [];
  for (const item of value) {
    const entry = item && typeof item === 'object' ? (item as { name?: unknown; email?: unknown }) : {};
    const name = text(entry.name, LIMITS.name);
    if (!name) return 'Please enter a name for each contact person.';
    const email = text(entry.email, LIMITS.email)?.toLowerCase() ?? null;
    if (!email || !EMAIL_RE.test(email)) return `Please enter a valid email address for ${name}.`;
    contacts.push({ name, email });
  }
  return contacts;
};

export type SubmissionCheck = { ok: true; row: SubmissionRow } | { ok: false; error: string };

/**
 * `contactOptional`: changes to an event saved without a contact (older events admins made) may
 * leave it without one; a new event, or one that has a contact, always needs a name and email.
 */
export const checkSubmission = (input: SubmissionInput, { contactOptional = false } = {}): SubmissionCheck => {
  const title = text(input.title, LIMITS.title);
  if (!title) return { ok: false, error: `Please give the event a name (up to ${LIMITS.title} characters).` };
  const description = text(input.description, LIMITS.description);
  if (!description) return { ok: false, error: `Please add a description (up to ${LIMITS.description} characters).` };
  const location = text(input.location, LIMITS.location);
  if (!location) return { ok: false, error: 'Please say where the event is.' };
  const date = isoDate(input.date);
  if (!date) return { ok: false, error: 'The event date is missing or not valid.' };
  const endDate = input.end_date === null || input.end_date === undefined ? null : isoDate(input.end_date);
  if (endDate === null && input.end_date) return { ok: false, error: 'The end time is not valid.' };
  if (endDate && endDate < date) return { ok: false, error: 'The event ends before it starts.' };
  const category = input.category === null || input.category === undefined || input.category === ''
    ? null
    : text(input.category, LIMITS.category);
  if (category === null && input.category) return { ok: false, error: 'The category is not valid.' };
  const name = text(input.submitter_name, LIMITS.name);
  const email = text(input.submitter_email, LIMITS.email)?.toLowerCase() ?? null;
  const blank = (value: unknown) => typeof value !== 'string' || !value.trim();
  const noContact = contactOptional && blank(input.submitter_name) && blank(input.submitter_email);
  if (!name && !noContact) return { ok: false, error: 'Please enter your name.' };
  if ((!email || !EMAIL_RE.test(email)) && !noContact) return { ok: false, error: 'Please enter a valid email address.' };
  const extraContacts = contactList(input.extra_contacts);
  if (typeof extraContacts === 'string') return { ok: false, error: extraContacts };

  const requested = input.recurrence_type;
  if (requested !== undefined && requested !== null && requested !== 'none' && requested !== 'custom' && !isPatternType(requested)) {
    return { ok: false, error: 'This kind of repeat can’t be submitted from the form.' };
  }
  const type: SubmissionRow['recurrence_type'] = requested === 'custom' || isPatternType(requested) ? requested : 'none';

  // A repeating series: how often, and until when
  let interval: number | null = null;
  let repeatEnd: string | null = null;
  let occurrences: number | null = null;
  if (isPatternType(type)) {
    const every = count(input.recurrence_interval, 1, LIMITS.interval);
    if (every === undefined) return { ok: false, error: 'How often the event repeats is not valid.' };
    interval = every ?? 1;
    if (input.recurrence_end_date !== null && input.recurrence_end_date !== undefined && input.recurrence_end_date !== '') {
      repeatEnd = isoDate(input.recurrence_end_date);
      if (!repeatEnd) return { ok: false, error: 'The last date of the repeat is not valid.' };
      // The last date is that day's midnight, so the first day itself (up to a day before the
      // start time) still counts
      if (new Date(repeatEnd).getTime() < new Date(date).getTime() - DAY_MS) {
        return { ok: false, error: 'The repeat’s last date is before its first date.' };
      }
    }
    const times = count(input.recurrence_occurrences, 1, LIMITS.occurrences);
    if (times === undefined) return { ok: false, error: 'The number of repeats is not valid.' };
    occurrences = times;
  }

  let customDates: string[] | null = null;
  let customEnds: string[] | null = null;
  let customPlaces: (string | null)[] | null = null;
  if (type === 'custom') {
    const dates = isoList(input.recurrence_custom_dates);
    if (!dates) return { ok: false, error: `Pick between 1 and ${LIMITS.dates} dates.` };
    customDates = dates;
    const ends = isoList(input.recurrence_custom_end_dates);
    if (ends === undefined || (ends && ends.length !== dates.length)) return { ok: false, error: 'The times of the dates don’t match the dates.' };
    customEnds = ends;
    const places = input.recurrence_custom_locations;
    if (places !== null && places !== undefined) {
      if (!Array.isArray(places) || places.length !== dates.length) return { ok: false, error: 'The places don’t match the dates.' };
      if (places.some((p) => p !== null && (typeof p !== 'string' || p.length > LIMITS.location))) {
        return { ok: false, error: 'One of the places is not valid.' };
      }
      customPlaces = places.map((p) => (typeof p === 'string' ? p.trim() : null));
    }
  }

  return {
    ok: true,
    row: {
      title,
      description,
      date,
      end_date: endDate,
      location,
      category,
      recurrence_type: type,
      recurrence_interval: interval,
      recurrence_end_date: repeatEnd,
      recurrence_occurrences: occurrences,
      recurrence_custom_dates: customDates,
      recurrence_custom_end_dates: customEnds,
      recurrence_custom_locations: customPlaces,
      submitter_name: name,
      submitter_email: email,
      extra_contacts: extraContacts
    }
  };
};
