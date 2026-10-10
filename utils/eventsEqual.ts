import type { Event } from '../types.ts';

const toTime = (d: unknown): number => {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  if (d instanceof Date) return isNaN(d.getTime()) ? 0 : d.getTime();
  const parsed = new Date(d as string);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

/** Same events with the same visible details (a background sync that changed nothing keeps the state) */
export const areEventsEqual = (a: Event[], b: Event[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bMap = new Map<string, Event>();
  for (const eb of b) {
    bMap.set(eb.id, eb);
  }
  for (const ea of a) {
    const eb = bMap.get(ea.id);
    if (!eb) return false;
    if (
      ea.status !== eb.status ||
      ea.title !== eb.title ||
      toTime(ea.date) !== toTime(eb.date) ||
      toTime(ea.endDate) !== toTime(eb.endDate) ||
      ea.location !== eb.location ||
      ea.category !== eb.category ||
      ea.description !== eb.description ||
      ea.posterUrl !== eb.posterUrl ||
      ea.submitterName !== eb.submitterName ||
      ea.submitterEmail !== eb.submitterEmail ||
      toTime(ea.updatedAt) !== toTime(eb.updatedAt) ||
      (ea.tags?.join(',') || '') !== (eb.tags?.join(',') || '')
    ) {
      return false;
    }
  }
  return true;
};

export const areExceptionsEqual = (a: Map<string, Date[]>, b: Map<string, Date[]>): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, dates] of a) {
    const other = b.get(id);
    if (!other || other.length !== dates.length) return false;
    const times = new Set(other.map((d) => d.getTime()));
    if (dates.some((d) => !times.has(d.getTime()))) return false;
  }
  return true;
};
