import type { Event } from '../types.ts';
import { mapEventRow, type EventRow } from '../services/eventMapper.ts';

/** A Supabase Realtime change on the events table (REPLICA IDENTITY FULL: whole rows) */
export interface EventChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

const isFullRow = (row: Record<string, unknown> | null | undefined): row is EventRow & Record<string, unknown> =>
  !!row &&
  typeof row.id === 'string' &&
  typeof row.title === 'string' &&
  typeof row.date === 'string' &&
  typeof row.status === 'string';

/**
 * Applies realtime changes to the loaded events, so one edit doesn't make every open calendar
 * download all events again. Returns null when a change can't be applied from its message
 * (e.g. a partial row); the caller then reloads.
 */
export const applyEventChanges = (events: Event[], changes: EventChange[]): Event[] | null => {
  let next = events;
  let reorder = false;
  for (const change of changes) {
    if (change.eventType === 'DELETE') {
      const id = change.old?.id;
      if (typeof id !== 'string') return null;
      next = next.filter((e) => e.id !== id);
      continue;
    }
    if (!isFullRow(change.new)) return null;
    const existing = next.find((e) => e.id === change.new.id);
    // Attachments and history already loaded for it are kept (the row doesn't carry them)
    const mapped = mapEventRow(change.new, existing?.attachments);
    const merged: Event = existing ? { ...mapped, history: existing.history } : mapped;
    next = existing ? next.map((e) => (e.id === merged.id ? merged : e)) : [...next, merged];
    reorder = true;
  }
  return reorder ? [...next].sort((a, b) => a.date.getTime() - b.date.getTime()) : next;
};

/** True when a change touched a repeating event (its deleted dates may have changed with it) */
export const touchesSeries = (changes: EventChange[]): boolean =>
  changes.some((c) => {
    const type = (c.new?.recurrence_type ?? c.old?.recurrence_type) as string | undefined;
    return !!type && type !== 'none';
  });
