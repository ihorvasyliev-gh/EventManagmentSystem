import { type EventHistoryEntry } from '../types';
import { supabase } from '../lib/supabase';
import { type HistoryRow, mapHistoryRow } from './eventMapper';
import type { DeletedEvent } from './eventService';

/** A line of the admins' change log: a history entry with its event's name and who wrote it */
export interface ChangeLogEntry extends EventHistoryEntry {
  eventTitle: string;
  /** The author's role; null for submissions sent without an account */
  authorRole: 'admin' | 'staff' | null;
  /** A deleted event's copy, to restore it (deleted since migration 019) */
  deleted: DeletedEvent | null;
}

type ChangeLogRow = HistoryRow & {
  /** The event's name when the entry was written (migration 018) */
  event_title?: string | null;
  /** Before migration 018: the event itself, gone once it is deleted */
  events?: { title: string } | null;
  /** A deleted event's row, attachments and deleted dates (migration 019) */
  snapshot?: { event?: Record<string, unknown>; attachments?: Array<Record<string, unknown>>; deleted_dates?: Array<Record<string, unknown>> } | null;
  users: { role: string } | null;
};

const COLUMNS_019 = 'id,event_id,user_id,user_name,action,changes,timestamp,event_title,snapshot';
const COLUMNS = 'id,event_id,user_id,user_name,action,changes,timestamp,event_title';
const COLUMNS_BEFORE_018 = 'id,event_id,user_id,user_name,action,changes,timestamp,events(title)';

/** Entries in one page of the change log */
export const CHANGE_LOG_PAGE = 50;

/**
 * Which entries: changes staff made to their own events, deleted events (and declined
 * submissions), or everything
 */
export type ChangeLogView = 'staff' | 'deleted' | 'all';

/**
 * The latest history entries of every event (admins see them all, deleted events' too), newest
 * first, older than `before` when given; only events whose name has `search` in it, and only
 * what `userId` did, when given.
 */
export const getChangeLog = async (options: { view: ChangeLogView; before?: Date; search?: string; userId?: string }): Promise<ChangeLogEntry[]> => {
  const staffEdits = options.view === 'staff';
  const search = options.search?.trim();
  const page = (columns: string) => {
    let query = supabase
      .from('event_history')
      .select(`${columns},users${staffEdits ? '!inner' : ''}(role)`)
      .order('timestamp', { ascending: false })
      .limit(CHANGE_LOG_PAGE);
    if (staffEdits) query = query.eq('action', 'updated').eq('users.role', 'staff');
    if (options.view === 'deleted') query = query.eq('action', 'deleted');
    if (options.before) query = query.lt('timestamp', options.before.toISOString());
    // (before migration 018 entries have no event name to search)
    if (search && columns !== COLUMNS_BEFORE_018) query = query.ilike('event_title', `%${search}%`);
    if (options.userId) query = query.eq('user_id', options.userId);
    return query;
  };
  // Deleted events' copies are only needed where deletions are listed
  let { data, error } = await page(options.view === 'staff' ? COLUMNS : COLUMNS_019);
  // The database hasn't run migration 019 (no snapshot column) or 018 (no event_title) yet
  if (error?.code === '42703' && options.view !== 'staff') ({ data, error } = await page(COLUMNS));
  if (error?.code === '42703') ({ data, error } = await page(COLUMNS_BEFORE_018));
  if (error) throw new Error(error.message || 'The change log could not be loaded.');
  return ((data || []) as unknown as ChangeLogRow[]).map((row) => ({
    ...mapHistoryRow(row),
    eventTitle: row.event_title ?? row.events?.title ?? 'Deleted event',
    authorRole: row.users?.role === 'admin' ? 'admin' : row.users?.role === 'staff' ? 'staff' : null,
    deleted: row.snapshot?.event
      ? { row: row.snapshot.event, attachments: row.snapshot.attachments ?? [], deletedDates: row.snapshot.deleted_dates ?? [] }
      : null
  }));
};

/** How many changes staff made to their events after `since` (0 if it can't be told) */
export const countStaffEditsSince = async (since: Date): Promise<number> => {
  const { count, error } = await supabase
    .from('event_history')
    .select('id,users!inner(role)', { count: 'exact', head: true })
    .eq('action', 'updated')
    .eq('users.role', 'staff')
    .gt('timestamp', since.toISOString());
  if (error) {
    console.warn('Counting staff edits failed:', error);
    return 0;
  }
  return count ?? 0;
};
