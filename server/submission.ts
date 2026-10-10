/**
 * Checks what the public /submit form sends and turns it into an events row. The row is written
 * with the service-role key, so nothing the browser sends is trusted: status, creator and tags
 * are set here.
 */

export interface SubmissionInput {
  title?: unknown;
  description?: unknown;
  date?: unknown;
  end_date?: unknown;
  location?: unknown;
  category?: unknown;
  recurrence_type?: unknown;
  recurrence_custom_dates?: unknown;
  recurrence_custom_end_dates?: unknown;
  recurrence_custom_locations?: unknown;
  submitter_name?: unknown;
  submitter_email?: unknown;
}

export interface SubmissionRow {
  title: string;
  description: string;
  date: string;
  end_date: string | null;
  location: string;
  category: string | null;
  recurrence_type: 'none' | 'custom';
  recurrence_custom_dates: string[] | null;
  recurrence_custom_end_dates: string[] | null;
  recurrence_custom_locations: (string | null)[] | null;
  submitter_name: string;
  submitter_email: string;
}

export const LIMITS = {
  title: 200,
  description: 2000,
  location: 300,
  category: 80,
  name: 120,
  email: 254,
  dates: 366
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

export type SubmissionCheck = { ok: true; row: SubmissionRow } | { ok: false; error: string };

export const checkSubmission = (input: SubmissionInput): SubmissionCheck => {
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
  if (!name) return { ok: false, error: 'Please enter your name.' };
  const email = text(input.submitter_email, LIMITS.email)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' };

  const type = input.recurrence_type === 'custom' ? 'custom' : 'none';
  if (input.recurrence_type !== undefined && input.recurrence_type !== 'none' && input.recurrence_type !== 'custom') {
    return { ok: false, error: 'This kind of repeat can’t be submitted from the form.' };
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
      recurrence_custom_dates: customDates,
      recurrence_custom_end_dates: customEnds,
      recurrence_custom_locations: customPlaces,
      submitter_name: name,
      submitter_email: email
    }
  };
};
