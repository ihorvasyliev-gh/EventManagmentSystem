import type { Event, Attachment, EventHistoryEntry, RecurrenceRule } from '../types.ts';

/** Columns the app reads from events (no `select *`: old columns stay out of every response) */
export const EVENT_COLUMNS = [
  'id', 'title', 'description', 'date', 'end_date', 'location', 'poster_url', 'status', 'category', 'tags',
  'recurrence_type', 'recurrence_interval', 'recurrence_end_date', 'recurrence_occurrences',
  'recurrence_days_of_week', 'recurrence_custom_dates', 'recurrence_custom_end_dates',
  'recurrence_custom_locations', 'submitter_name', 'submitter_email', 'creator_id', 'created_at', 'updated_at'
].join(',');

/** An events row as Supabase returns it (columns may be missing from shorter selects) */
export interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  end_date?: string | null;
  location?: string | null;
  poster_url?: string | null;
  status: Event['status'];
  category?: string | null;
  tags?: string[] | null;
  recurrence_type?: RecurrenceRule['type'] | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_occurrences?: number | null;
  recurrence_days_of_week?: number[] | null;
  recurrence_custom_dates?: string[] | null;
  recurrence_custom_end_dates?: string[] | null;
  recurrence_custom_locations?: (string | null)[] | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  creator_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface AttachmentRow {
  id: string;
  event_id: string;
  name: string;
  url: string;
  type: Attachment['type'];
  size: number;
  uploaded_at: string;
}

export interface HistoryRow {
  id: string;
  event_id: string;
  user_id: string | null;
  user_name: string;
  action: EventHistoryEntry['action'];
  changes: EventHistoryEntry['changes'] | null;
  timestamp: string;
}

export const toIsoList = (dates?: Date[]): string[] | null =>
  dates ? dates.map(d => (d instanceof Date ? d : new Date(d)).toISOString()) : null;

export const mapAttachmentRow = (att: AttachmentRow): Attachment => ({
  id: att.id,
  name: att.name,
  url: att.url,
  type: att.type,
  size: att.size,
  uploadedAt: new Date(att.uploaded_at)
});

export const mapHistoryRow = (h: HistoryRow): EventHistoryEntry => ({
  id: h.id,
  eventId: h.event_id,
  userId: h.user_id ?? '',
  userName: h.user_name,
  action: h.action,
  changes: h.changes || undefined,
  timestamp: new Date(h.timestamp)
});

const mapRecurrence = (row: EventRow): RecurrenceRule | undefined => {
  if (!row.recurrence_type || row.recurrence_type === 'none') return undefined;
  return {
    type: row.recurrence_type,
    interval: row.recurrence_interval || undefined,
    endDate: row.recurrence_end_date ? new Date(row.recurrence_end_date) : undefined,
    occurrences: row.recurrence_occurrences || undefined,
    daysOfWeek: row.recurrence_days_of_week || undefined,
    customDates: row.recurrence_custom_dates ? row.recurrence_custom_dates.map(d => new Date(d)) : undefined,
    customEndDates: row.recurrence_custom_end_dates ? row.recurrence_custom_end_dates.map(d => new Date(d)) : undefined,
    customLocations: Array.isArray(row.recurrence_custom_locations)
      ? row.recurrence_custom_locations.map(l => l ?? '')
      : undefined
  };
};

/** Supabase row (snake_case) → app event. Attachments come separately, when they're loaded. */
export const mapEventRow = (row: EventRow, attachments?: Attachment[]): Event => {
  const tags = row.tags || [];
  // Older submissions kept the submitter in tags only
  const tagValue = (prefix: string) => tags.find(t => t.startsWith(prefix))?.slice(prefix.length);
  const posterAttachment = attachments?.find(att => att.type === 'image');
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    date: new Date(row.date),
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    location: row.location || '',
    posterUrl: row.poster_url || posterAttachment?.url || undefined,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    category: row.category || undefined,
    tags,
    status: row.status,
    submitterName: row.submitter_name || tagValue('by:') || undefined,
    submitterEmail: row.submitter_email || tagValue('email:') || undefined,
    recurrence: mapRecurrence(row),
    creatorId: row.creator_id || undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(row.date),
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
  };
};

/** The editable columns of an event, for an update */
export const eventToRow = (event: Omit<Event, 'id' | 'createdAt'>) => ({
  title: event.title,
  description: event.description || null,
  date: event.date.toISOString(),
  end_date: event.endDate ? event.endDate.toISOString() : null,
  location: event.location || null,
  poster_url: event.posterUrl || null,
  status: event.status,
  category: event.category || null,
  tags: event.tags || [],
  recurrence_type: event.recurrence?.type || 'none',
  recurrence_interval: event.recurrence?.interval || null,
  recurrence_end_date: event.recurrence?.endDate ? event.recurrence.endDate.toISOString() : null,
  recurrence_occurrences: event.recurrence?.occurrences || null,
  recurrence_days_of_week: event.recurrence?.daysOfWeek || null,
  recurrence_custom_dates: toIsoList(event.recurrence?.customDates),
  recurrence_custom_end_dates: toIsoList(event.recurrence?.customEndDates),
  recurrence_custom_locations: event.recurrence?.customLocations ?? null,
  submitter_name: event.submitterName || null,
  submitter_email: event.submitterEmail || null
});
