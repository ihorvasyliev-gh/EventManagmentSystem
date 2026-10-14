import { type Event, type EventContact, type RecurrenceRule } from '../types';
import { supabase } from '../lib/supabase';
import { callApi } from './apiClient';
import { fetchAllPages } from './paging';
import { EVENT_COLUMNS, type EventRow, mapEventRow, toIsoList } from './eventMapper';

export interface SubmissionData {
  title: string;
  description: string;
  date: Date;
  endDate?: Date;
  location: string;
  category?: string;
  submitterName: string;
  submitterEmail: string;
  /** More contact people besides the submitter */
  extraContacts?: EventContact[];
  posterFile?: File;
  /** Admins only: publish straight away instead of sending it for review */
  publish?: boolean;
  recurrence?: RecurrenceRule;
  /** Cloudflare Turnstile token (the bot check people without an account pass) */
  turnstileToken?: string | null;
  /** Admins duplicating an event: keep its poster (already stored) when no new file is picked */
  existingPosterUrl?: string | null;
}

/** The form's fields as /api/submit and /api/edit-event read them */
const eventFields = (data: SubmissionData) => {
  const rule = data.recurrence;
  const custom = rule?.type === 'custom';
  const pattern = !!rule && rule.type !== 'custom' && rule.type !== 'none';
  return {
    title: data.title.trim(),
    description: data.description.trim(),
    date: data.date.toISOString(),
    end_date: data.endDate ? data.endDate.toISOString() : null,
    location: data.location.trim(),
    category: data.category || null,
    recurrence_type: rule?.type ?? 'none',
    recurrence_interval: pattern ? rule.interval || 1 : null,
    recurrence_end_date: pattern && rule.endDate ? rule.endDate.toISOString() : null,
    recurrence_occurrences: pattern ? rule.occurrences || null : null,
    recurrence_custom_dates: custom ? toIsoList(rule.customDates) : null,
    recurrence_custom_end_dates: custom ? toIsoList(rule.customEndDates) : null,
    recurrence_custom_locations: custom ? rule.customLocations ?? null : null,
    submitter_name: data.submitterName.trim(),
    submitter_email: data.submitterEmail.trim(),
    extra_contacts: data.extraContacts ?? []
  };
};

/**
 * Sends the /submit form: the event and its flyer go to the server together, so if the flyer
 * can't be saved the whole submission fails with a message, instead of arriving without it.
 * Works without an account (saved as a draft for review).
 */
export const submitEvent = async (data: SubmissionData): Promise<{ id: string; status: Event['status'] }> => {
  const form = new FormData();
  form.append('event', JSON.stringify({
    ...eventFields(data),
    publish: !!data.publish,
    poster_url: data.posterFile ? null : data.existingPosterUrl ?? null
  }));
  if (data.posterFile) form.append('poster', data.posterFile, data.posterFile.name);
  if (data.turnstileToken) form.append('turnstileToken', data.turnstileToken);
  return callApi<{ id: string; status: Event['status'] }>('/api/submit', { method: 'POST', form, auth: 'optional' });
};

/**
 * Saves staff's changes to an event of their own (/api/edit-event, which logs what changed).
 * `baseUpdatedAt` is when the version the form opened was saved: if anyone saved it since,
 * nothing is written and an ApiError with status 409 says so. Without a new `posterFile`,
 * `keepPoster` keeps the stored flyer, or removes it when false.
 */
export const saveOwnEvent = async (
  id: string,
  data: SubmissionData,
  options: { baseUpdatedAt?: Date; keepPoster: boolean }
): Promise<{ event: Event; changed: boolean; exceptionsCleared: boolean }> => {
  const form = new FormData();
  form.append('event', JSON.stringify({
    ...eventFields(data),
    id,
    base_updated_at: options.baseUpdatedAt ? options.baseUpdatedAt.toISOString() : null,
    keep_poster: !data.posterFile && options.keepPoster
  }));
  if (data.posterFile) form.append('poster', data.posterFile, data.posterFile.name);
  const result = await callApi<{ event: EventRow; changed: boolean; exceptionsCleared: boolean }>('/api/edit-event', { method: 'POST', form });
  return { event: mapEventRow(result.event), changed: result.changed, exceptionsCleared: result.exceptionsCleared };
};

/** Drafts waiting for review (admins), newest first */
export const getPendingSubmissions = async (): Promise<Event[]> => {
  const rows = await fetchAllPages<EventRow>((from, to) =>
    supabase
      .from('events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  );
  return rows.map(row => mapEventRow(row));
};

/** Publishes submissions */
export const approveSubmissions = async (ids: string[]): Promise<Event[]> => {
  const { events } = await callApi<{ events: EventRow[] }>('/api/submissions', { method: 'POST', body: { action: 'approve', ids } });
  return events.map(row => mapEventRow(row));
};

/** Declines submissions: deletes them and their flyers */
export const declineSubmissions = async (ids: string[]): Promise<string[]> => {
  const { declined } = await callApi<{ declined: string[] }>('/api/submissions', { method: 'POST', body: { action: 'decline', ids } });
  return declined;
};

/**
 * What's on the calendar, for people submitting without an account (they can't read the
 * events table): published events from a month ago on, without anyone's details.
 */
export const getPublishedEventsForSubmitters = async (): Promise<Event[]> => {
  const { events } = await callApi<{ events: EventRow[] }>('/api/published-events', { auth: 'optional' });
  return events.map(row => mapEventRow(row));
};
