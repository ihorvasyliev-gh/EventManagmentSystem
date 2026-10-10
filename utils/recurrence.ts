import type { Event, RecurrenceRule } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INSTANCES_PER_EVENT = 1000; // Safety break

const toDayKey = (d: Date): string =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

/**
 * Returns the n-th step of a pattern recurrence, always computed from the series start
 * (never from the previous instance), so monthly/yearly series don't drift after short
 * months (Jan 31 → Feb 28 → Mar 31, not Mar 3 → Apr 3) and local wall-clock time is kept
 * across DST changes.
 */
const addRecurrenceSteps = (base: Date, type: RecurrenceRule['type'], steps: number): Date => {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const h = base.getHours();
  const mi = base.getMinutes();
  const s = base.getSeconds();
  const ms = base.getMilliseconds();

  switch (type) {
    case 'daily':
      return new Date(y, m, d + steps, h, mi, s, ms);
    case 'weekly':
      return new Date(y, m, d + steps * 7, h, mi, s, ms);
    case 'monthly': {
      const target = new Date(y, m + steps, 1);
      const day = Math.min(d, daysInMonth(target.getFullYear(), target.getMonth()));
      return new Date(target.getFullYear(), target.getMonth(), day, h, mi, s, ms);
    }
    case 'yearly': {
      const day = Math.min(d, daysInMonth(y + steps, m));
      return new Date(y + steps, m, day, h, mi, s, ms);
    }
    default:
      return new Date(y, m, d + steps, h, mi, s, ms);
  }
};

/** Rough number of whole periods between the series start and `target`, never overshooting. */
const periodsBefore = (base: Date, target: Date, type: RecurrenceRule['type']): number => {
  if (target <= base) return 0;
  switch (type) {
    case 'daily':
      return Math.max(0, Math.floor((target.getTime() - base.getTime()) / DAY_MS) - 1);
    case 'weekly':
      return Math.max(0, Math.floor((target.getTime() - base.getTime()) / (7 * DAY_MS)) - 1);
    case 'monthly':
      return Math.max(0, (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth()) - 1);
    case 'yearly':
      return Math.max(0, target.getFullYear() - base.getFullYear() - 1);
    default:
      return 0;
  }
};

/**
 * True when a custom-dates series stores its own times for every date
 * (`customDates` hold each start, `customEndDates` each end).
 */
/** A repeating or multi-date event (anything but a one-off) */
export const isRecurringEvent = (event?: Event | null): boolean =>
  !!event?.recurrence && event.recurrence.type !== 'none';

export const hasPerDateTimes = (rule?: RecurrenceRule): boolean =>
  !!rule && rule.type === 'custom' &&
  !!rule.customDates && rule.customDates.length > 0 &&
  !!rule.customEndDates && rule.customEndDates.length === rule.customDates.length;

/**
 * True when a custom-dates series stores an address for every date (`customLocations`),
 * i.e. it is held in different places.
 */
export const hasPerSessionPlaces = (rule?: RecurrenceRule): boolean =>
  !!rule && rule.type === 'custom' &&
  !!rule.customDates && rule.customDates.length > 0 &&
  !!rule.customLocations && rule.customLocations.length === rule.customDates.length;

/** Every address an event is held at: its own location plus, for a series in different places, each date's */
export const getEventLocations = (event: Pick<Event, 'location' | 'recurrence'>): string[] => {
  const all = [event.location, ...(hasPerSessionPlaces(event.recurrence) ? event.recurrence!.customLocations! : [])];
  return Array.from(new Set(all.map(l => l?.trim()).filter((l): l is string => !!l)));
};

/** Instance overlaps [rangeStart, rangeEnd] (multi-day events that started earlier still count). */
const overlapsRange = (start: Date, end: Date | undefined, rangeStart: Date, rangeEnd: Date): boolean => {
  const effectiveEnd = end && end > start ? end : start;
  return start <= rangeEnd && effectiveEnd >= rangeStart;
};

/**
 * Expands a list of events into individual instances for a specific date range.
 * Every instance keeps the original event duration (its own `endDate`), so recurring
 * occurrences render on the right day in the month/week grids.
 *
 * `instanceKey` format is `${id}_${startTimestamp}`.
 */
export const expandRecurringEvents = (
  events: Event[],
  rangeStart: Date,
  rangeEnd: Date,
  exceptionsMap?: Map<string, Date[]>
): Event[] => {
  const expandedEvents: Event[] = [];

  events.forEach(event => {
    const baseStart = new Date(event.date);
    const baseEnd = event.endDate ? new Date(event.endDate) : undefined;
    const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : undefined;
    const instanceEnd = (start: Date): Date | undefined =>
      durationMs !== undefined && durationMs >= 0 ? new Date(start.getTime() + durationMs) : undefined;

    // 1. Not recurring: include if it overlaps the range
    if (!event.recurrence || event.recurrence.type === 'none') {
      if (overlapsRange(baseStart, baseEnd, rangeStart, rangeEnd)) {
        expandedEvents.push(event);
      }
      return;
    }

    const rule = event.recurrence;
    const exceptions = exceptionsMap?.get(event.id);
    const excludedDays = exceptions && exceptions.length > 0
      ? new Set(exceptions.map(d => toDayKey(new Date(d))))
      : null;
    const isExcluded = (d: Date) => excludedDays?.has(toDayKey(d)) ?? false;

    const pushInstance = (start: Date, end: Date | undefined, location = event.location) => {
      expandedEvents.push({
        ...event,
        instanceKey: `${event.id}_${start.getTime()}`,
        date: start,
        endDate: end,
        location,
      });
    };

    // 2. Custom dates (manually picked): each date takes the time of day of the original event,
    //    or its own start/end when the series has per-date times, and its own address when the
    //    series is held in different places
    if (rule.type === 'custom') {
      const perDate = hasPerDateTimes(rule);
      const places = hasPerSessionPlaces(rule) ? rule.customLocations! : null;
      const customDates = rule.customDates && rule.customDates.length > 0 ? rule.customDates : [baseStart];
      customDates.forEach((customDate, i) => {
        const d = new Date(customDate);
        let end: Date | undefined;
        if (perDate) {
          const ownEnd = new Date(rule.customEndDates![i]);
          end = ownEnd.getTime() > d.getTime() ? ownEnd : undefined;
        } else {
          d.setHours(baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), baseStart.getMilliseconds());
          end = instanceEnd(d);
        }
        if (isNaN(d.getTime()) || isExcluded(d)) return;
        if (overlapsRange(d, end, rangeStart, rangeEnd)) {
          pushInstance(d, end, places?.[i]?.trim() || event.location);
        }
      });
      return;
    }

    // 3. Pattern-based recurrence (daily/weekly/monthly/yearly)
    const interval = rule.interval && rule.interval > 0 ? Math.floor(rule.interval) : 1;
    const endLimit = rule.endDate ? endOfDay(new Date(rule.endDate)) : undefined;

    // Jump close to the range start (occurrence index stays exact, so `occurrences` still works).
    // Look back one extra duration so multi-day instances that started earlier are included.
    const lookBackStart = new Date(rangeStart.getTime() - Math.max(0, durationMs ?? 0));
    let k = Math.floor(periodsBefore(baseStart, lookBackStart, rule.type) / interval);
    const kLimit = k + MAX_INSTANCES_PER_EVENT;

    for (; k < kLimit; k++) {
      if (rule.occurrences && k >= rule.occurrences) break;
      const start = addRecurrenceSteps(baseStart, rule.type, k * interval);
      if (endLimit && start > endLimit) break;
      if (start > rangeEnd) break;
      if (isExcluded(start)) continue;
      const end = instanceEnd(start);
      if (overlapsRange(start, end, rangeStart, rangeEnd)) {
        pushInstance(start, end);
      }
    }
  });

  return expandedEvents;
};

/**
 * Expansion is no longer cached (the old cache was keyed by event ids only and served
 * stale instances after edits). Kept as a no-op for existing callers.
 */
export const clearRecurrenceCache = (): void => {};
