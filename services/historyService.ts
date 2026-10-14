import { type EventHistoryEntry } from '../types';
import { supabase } from '../lib/supabase';
import { type HistoryRow, mapHistoryRow } from './eventMapper';

/** A line of the admins' change log: a history entry with its event's name and who wrote it */
export interface ChangeLogEntry extends EventHistoryEntry {
  eventTitle: string;
  /** The author's role; null for submissions sent without an account */
  authorRole: 'admin' | 'staff' | null;
}

type ChangeLogRow = HistoryRow & {
  /** The event's name when the entry was written (migration 018) */
  event_title?: string | null;
  /** Before migration 018: the event itself, gone once it is deleted */
  events?: { title: string } | null;
  users: { role: string } | null;
};

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
 * first, older than `before` when given.
 */
export const getChangeLog = async (options: { view: ChangeLogView; before?: Date }): Promise<ChangeLogEntry[]> => {
  const staffEdits = options.view === 'staff';
  const page = (columns: string) => {
    let query = supabase
      .from('event_history')
      .select(`${columns},users${staffEdits ? '!inner' : ''}(role)`)
      .order('timestamp', { ascending: false })
      .limit(CHANGE_LOG_PAGE);
    if (staffEdits) query = query.eq('action', 'updated').eq('users.role', 'staff');
    if (options.view === 'deleted') query = query.eq('action', 'deleted');
    if (options.before) query = query.lt('timestamp', options.before.toISOString());
    return query;
  };
  let { data, error } = await page(COLUMNS);
  // The database hasn't run migration 018 yet (no event_title column)
  if (error?.code === '42703') ({ data, error } = await page(COLUMNS_BEFORE_018));
  if (error) throw new Error(error.message || 'The change log could not be loaded.');
  return ((data || []) as unknown as ChangeLogRow[]).map((row) => ({
    ...mapHistoryRow(row),
    eventTitle: row.event_title ?? row.events?.title ?? 'Deleted event',
    authorRole: row.users?.role === 'admin' ? 'admin' : row.users?.role === 'staff' ? 'staff' : null
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
