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
  events: { title: string } | null;
  users: { role: string } | null;
};

const COLUMNS = 'id,event_id,user_id,user_name,action,changes,timestamp,events(title)';

/** Entries in one page of the change log */
export const CHANGE_LOG_PAGE = 50;

/**
 * The latest history entries of every event (admins see them all), newest first, older than
 * `before` when given. `staffEdits`: only changes staff made to their own events.
 */
export const getChangeLog = async (options: { staffEdits: boolean; before?: Date }): Promise<ChangeLogEntry[]> => {
  let query = supabase
    .from('event_history')
    .select(`${COLUMNS},users${options.staffEdits ? '!inner' : ''}(role)`)
    .order('timestamp', { ascending: false })
    .limit(CHANGE_LOG_PAGE);
  if (options.staffEdits) query = query.eq('action', 'updated').eq('users.role', 'staff');
  if (options.before) query = query.lt('timestamp', options.before.toISOString());
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'The change log could not be loaded.');
  return ((data || []) as unknown as ChangeLogRow[]).map((row) => ({
    ...mapHistoryRow(row),
    eventTitle: row.events?.title ?? 'Deleted event',
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
