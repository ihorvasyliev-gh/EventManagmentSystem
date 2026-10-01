/**
 * "Possible duplicate" check for events that already overlap in time:
 * a similar title or the same venue makes it likely the same event entered twice.
 */
import type { MultiDateConflictItem, ConflictEvent } from './conflictDetection.ts';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'for', 'to', 'in', 'on', 'at', 'with', 'by', 'from', 'our', 'your',
  'event', 'session', 'cork', 'city', 'partnership', 'ccp'
]);

const words = (text: string | undefined, keepShort = false): string[] =>
  (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && (keepShort || (w.length > 1 && !STOP_WORDS.has(w))));

/** Share of the shorter title's words that also appear in the other title (0–1) */
export const titleSimilarity = (a: string | undefined, b: string | undefined): number => {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) {
    const na = (a || '').trim().toLowerCase();
    return na !== '' && na === (b || '').trim().toLowerCase() ? 1 : 0;
  }
  let shared = 0;
  wa.forEach((w) => {
    if (wb.has(w)) shared++;
  });
  return shared / Math.min(wa.size, wb.size);
};

/** The whole address, normalised (a shared first part like "Cork City Partnership" alone is too common) */
const venueKey = (location: string | undefined): string => words(location, true).join(' ');

export type DuplicateReason = 'title' | 'venue';

export const duplicateReason = (
  candidate: { title?: string; location?: string },
  existing: { title?: string; location?: string }
): DuplicateReason | null => {
  if (titleSimilarity(candidate.title, existing.title) >= 0.6) return 'title';
  const venue = venueKey(candidate.location);
  if (venue && venue === venueKey(existing.location)) return 'venue';
  return null;
};

export interface OverlapEntry {
  event: ConflictEvent;
  /** Start of each of the candidate's sessions this event overlaps */
  when: Date[];
  duplicate: DuplicateReason | null;
}

/** One entry per overlapping event (a series counts once), likely duplicates first */
export const groupOverlaps = (
  conflicts: MultiDateConflictItem[],
  candidate: { id?: string; title?: string; location?: string }
): OverlapEntry[] => {
  const byKey = new Map<string, OverlapEntry>();
  conflicts.forEach(({ date, conflictingEvents }) => {
    conflictingEvents.forEach((ev) => {
      if (candidate.id && ev.id === candidate.id) return;
      const key = String(ev.id ?? ev.title);
      const entry = byKey.get(key) ?? { event: ev, when: [], duplicate: duplicateReason(candidate, ev) };
      if (!entry.when.some((d) => d.getTime() === date.getTime())) entry.when.push(date);
      byKey.set(key, entry);
    });
  });
  const rank = (e: OverlapEntry) => (e.duplicate === 'title' ? 0 : e.duplicate === 'venue' ? 1 : 2);
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || new Date(a.event.date).getTime() - new Date(b.event.date).getTime());
};
