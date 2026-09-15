import { Event, RecurrenceRule } from '../types';
import { getRecurrenceExceptions } from '../services/eventService';

/**
 * Checks if a date is actively within the recurrence range
 */
const isDateWithinRecurrenceRange = (date: Date, start: Date, rule: RecurrenceRule, count: number): boolean => {
  if (date < start) return false;
  if (rule.endDate && date > rule.endDate) return false;
  if (rule.occurrences && count >= rule.occurrences) return false;
  return true;
};

// Cache for expanded recurring events
interface CacheEntry {
  events: Event[];
  rangeStart: number;
  rangeEnd: number;
  eventIds: string;
  timestamp: number;
}

const CACHE_SIZE = 10; // Keep last 10 results
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const expansionCache: CacheEntry[] = [];

/**
 * Generate cache key from events and date range
 */
const getCacheKey = (events: Event[], rangeStart: Date, rangeEnd: Date): string => {
  const eventIds = events.map(e => e.id).sort().join(',');
  return `${eventIds}_${rangeStart.getTime()}_${rangeEnd.getTime()}`;
};

/**
 * Find cached result
 */
const getCachedResult = (cacheKey: string, rangeStart: Date, rangeEnd: Date): Event[] | null => {
  const now = Date.now();
  const entry = expansionCache.find(
    e => e.eventIds === cacheKey.split('_')[0] &&
      e.rangeStart === rangeStart.getTime() &&
      e.rangeEnd === rangeEnd.getTime() &&
      (now - e.timestamp) < CACHE_TTL
  );
  return entry ? entry.events : null;
};

/**
 * Store result in cache
 */
const setCachedResult = (cacheKey: string, rangeStart: Date, rangeEnd: Date, result: Event[]): void => {
  // Remove old entries if cache is full
  if (expansionCache.length >= CACHE_SIZE) {
    expansionCache.shift();
  }

  expansionCache.push({
    events: result,
    rangeStart: rangeStart.getTime(),
    rangeEnd: rangeEnd.getTime(),
    eventIds: cacheKey.split('_')[0],
    timestamp: Date.now()
  });
};

/**
 * Expands a list of events into individual instances for a specific date range.
 * Handles recurring events by generating instances.
 * Results are cached for performance.
 * 
 * Note: This function is synchronous for performance, but exceptions are loaded
 * asynchronously. For best results, preload exceptions before calling this function.
 */
export const expandRecurringEvents = (
  events: Event[],
  rangeStart: Date,
  rangeEnd: Date,
  exceptionsMap?: Map<string, Date[]>
): Event[] => {
  // Check cache first (but cache key should include exceptions if provided)
  const cacheKey = getCacheKey(events, rangeStart, rangeEnd);
  const cached = getCachedResult(cacheKey, rangeStart, rangeEnd);
  if (cached && !exceptionsMap) {
    // Only use cache if no exceptions map is provided (cache doesn't account for exceptions)
    return cached;
  }
  const expandedEvents: Event[] = [];

  events.forEach(event => {
    // 1. If it's not recurring, just check if it falls in the range
    if (!event.recurrence || event.recurrence.type === 'none') {
      if (event.date >= rangeStart && event.date <= rangeEnd) {
        expandedEvents.push(event);
      }
      return;
    }

    // 2. Handle custom dates recurrence (manually picked dates)
    const rule = event.recurrence;

    if (rule.type === 'custom' && rule.customDates && rule.customDates.length > 0) {
      const exceptions = exceptionsMap?.get(event.id);
      rule.customDates.forEach(customDate => {
        const d = new Date(customDate);
        // Copy time from original event
        d.setHours(event.date.getHours(), event.date.getMinutes(), event.date.getSeconds(), event.date.getMilliseconds());

        if (d >= rangeStart && d <= rangeEnd) {
          // Check if this instance is excluded
          const isExcluded = exceptions?.some(excDate => {
            const excDateOnly = new Date(excDate);
            excDateOnly.setHours(0, 0, 0, 0);
            const instanceDateOnly = new Date(d);
            instanceDateOnly.setHours(0, 0, 0, 0);
            return excDateOnly.getTime() === instanceDateOnly.getTime();
          });

          if (!isExcluded) {
            const instanceKey = `${event.id}_${d.getTime()}`;
            expandedEvents.push({
              ...event,
              instanceKey,
              date: new Date(d),
            });
          }
        }
      });
      return;
    }

    // 3. Pattern-based recurrence (daily/weekly/monthly/yearly)
    const interval = rule.interval || 1;
    let currentInstanceDate = new Date(event.date);

    // SAFETY CHECK: If interval is somehow 0 or negative, force to 1 to avoid infinite loops
    if (interval <= 0) return;

    // OPTIMIZATION: Jump ahead to rangeStart if event started long ago
    // Only optimize if we don't have a strict occurrences limit (or if we Accept approximation)
    // If 'occurrences' is set, we technically must count from the start to know when to stop.
    // However, for typical calendar usage, 'occurrences' is rare vs 'endDate' or 'infinite'.
    // We will skip optimization if occurrences is set to be safe.
    const shouldOptimizeJump = !rule.occurrences && currentInstanceDate < rangeStart;

    if (shouldOptimizeJump) {
      if (rule.type === 'daily') {
        const diffTime = rangeStart.getTime() - currentInstanceDate.getTime();
        const daysToJump = Math.floor(diffTime / (1000 * 60 * 60 * 24 * interval));
        // Jump one less to be safe and let the loop handle the boundary
        if (daysToJump > 0) {
          currentInstanceDate.setDate(currentInstanceDate.getDate() + (daysToJump * interval));
        }
      } else if (rule.type === 'weekly') {
        const diffTime = rangeStart.getTime() - currentInstanceDate.getTime();
        const weeksToJump = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7 * interval));
        if (weeksToJump > 0) {
          currentInstanceDate.setDate(currentInstanceDate.getDate() + (weeksToJump * 7 * interval));
        }
      } else if (rule.type === 'monthly') {
        const yearDiff = rangeStart.getFullYear() - currentInstanceDate.getFullYear();
        const monthDiff = rangeStart.getMonth() - currentInstanceDate.getMonth();
        const totalMonths = (yearDiff * 12) + monthDiff;
        const jumps = Math.floor(totalMonths / interval);
        if (jumps > 0) {
          currentInstanceDate.setMonth(currentInstanceDate.getMonth() + (jumps * interval));
        }
      } else if (rule.type === 'yearly') {
        const yearDiff = rangeStart.getFullYear() - currentInstanceDate.getFullYear();
        const jumps = Math.floor(yearDiff / interval);
        if (jumps > 0) {
          currentInstanceDate.setFullYear(currentInstanceDate.getFullYear() + (jumps * interval));
        }
      }
    }

    // Now iterate strictly within or slightly before rangeStart until rangeEnd
    const MAX_INSTANCES = 1000; // Safety break
    let count = 0;

    while (
      count < MAX_INSTANCES &&
      (!rule.endDate || currentInstanceDate <= rule.endDate) &&
      (!rule.occurrences || count < rule.occurrences)
    ) {

      // If the current instance is past the range we are looking at, we can stop
      if (currentInstanceDate > rangeEnd) {
        break;
      }

      // If the instance is within the range, check if it's not excluded
      if (currentInstanceDate >= rangeStart) {
        // Check if this instance is excluded
        const exceptions = exceptionsMap?.get(event.id);
        const isExcluded = exceptions?.some(excDate => {
          const excDateOnly = new Date(excDate);
          excDateOnly.setHours(0, 0, 0, 0);
          const instanceDateOnly = new Date(currentInstanceDate);
          instanceDateOnly.setHours(0, 0, 0, 0);
          return excDateOnly.getTime() === instanceDateOnly.getTime();
        });

        // Only add if not excluded
        if (!isExcluded) {
          const instanceKey = `${event.id}_${currentInstanceDate.getTime()}`;
          expandedEvents.push({
            ...event,
            instanceKey,
            date: new Date(currentInstanceDate),
          });
        }
      }

      // Calculate next date
      const nextDate = new Date(currentInstanceDate);

      switch (rule.type) {
        case 'daily': nextDate.setDate(nextDate.getDate() + interval); break;
        case 'weekly': nextDate.setDate(nextDate.getDate() + (interval * 7)); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + interval); break;
        case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + interval); break;
        case 'custom': nextDate.setDate(nextDate.getDate() + interval); break;
        default: return;
      }

      currentInstanceDate = nextDate;
      count++;
    }

    // Fallback: If we didn't add any instances but we should have (e.g. slight mismatch in jump logic),
    // the loop handles it by starting slightly before rangeStart.
  });

  // Cache the result
  setCachedResult(cacheKey, rangeStart, rangeEnd, expandedEvents);

  return expandedEvents;
};

/**
 * Clear the expansion cache (useful when events are updated)
 */
export const clearRecurrenceCache = (): void => {
  expansionCache.length = 0;
};
