import { expandRecurringEvents } from './recurrence.ts';
import { formatDateChipLabel, getTimesForDate, type PerDateTimes } from './multiDateUtils.ts';
import type { Event } from '../types.ts';

export interface ConflictEvent {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  location?: string;
  [key: string]: any;
}

export interface ConflictInfo {
  conflictingEvents: ConflictEvent[];
  hasConflict: boolean;
}

export const detectConflicts = (newEvent: Partial<ConflictEvent>, existingEvents: ConflictEvent[], excludeEventId?: string): ConflictInfo => {
  if (!newEvent.date) {
    return { conflictingEvents: [], hasConflict: false };
  }

  const newEventStart = new Date(newEvent.date);
  const newEventEnd = newEvent.endDate ? new Date(newEvent.endDate) : new Date(newEventStart.getTime() + 60 * 60 * 1000);

  const conflictingEvents = existingEvents.filter(event => {
    // Exclude the event being edited
    if (excludeEventId && event.id === excludeEventId) {
      return false;
    }

    const eventStart = new Date(event.date);
    const eventEnd = event.endDate ? new Date(event.endDate) : new Date(eventStart.getTime() + 60 * 60 * 1000);

    // Check for overlap
    // Two events overlap if: newEventStart < eventEnd && newEventEnd > eventStart
    return newEventStart < eventEnd && newEventEnd > eventStart;
  });

  return {
    conflictingEvents,
    hasConflict: conflictingEvents.length > 0
  };
};

export const formatConflictMessage = (conflicts: ConflictEvent[]): string => {
  if (conflicts.length === 0) {
    return '';
  }

  if (conflicts.length === 1) {
    return `This event conflicts with "${conflicts[0].title}" at ${conflicts[0].date.toLocaleString()}`;
  }

  return `This event conflicts with ${conflicts.length} other events`;
};

export interface MultiDateConflictItem {
  date: Date;
  conflictingEvents: ConflictEvent[];
  message: string;
}

export interface MultiDateConflictResult {
  hasConflict: boolean;
  conflicts: MultiDateConflictItem[];
  summaryMessage: string;
}

/**
 * Checks each picked date against existing events. Every date uses the shared start/end
 * times, or its own entry in `perDateTimes` when the event runs at different times per day.
 */
export function detectMultiDateConflicts(
  dates: Date[],
  startTimeStr: string,
  endTimeStr: string,
  existingEvents: ConflictEvent[],
  excludeEventId?: string,
  perDateTimes?: PerDateTimes | null
): MultiDateConflictResult {
  const none: MultiDateConflictResult = { hasConflict: false, conflicts: [], summaryMessage: '' };
  if (!dates || dates.length === 0) return none;

  const conflicts: MultiDateConflictItem[] = [];

  for (const date of dates) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      continue;
    }

    const times = getTimesForDate(perDateTimes, date, { start: startTimeStr, end: endTimeStr });
    if (!times.start || !times.end) continue;
    const [startH, startM = 0, startS = 0] = times.start.split(':').map(Number);
    const [endH, endM = 0, endS = 0] = times.end.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) continue;

    const startDateTime = new Date(date);
    startDateTime.setHours(startH, startM, startS, 0);

    const endDateTime = new Date(date);
    endDateTime.setHours(endH, endM, endS, 0);

    if (endDateTime.getTime() <= startDateTime.getTime()) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    const conflictInfo = detectConflicts(
      { date: startDateTime, endDate: endDateTime },
      existingEvents,
      excludeEventId
    );

    if (conflictInfo.hasConflict && conflictInfo.conflictingEvents.length > 0) {
      const count = conflictInfo.conflictingEvents.length;
      const message = count === 1
        ? `At this time: "${conflictInfo.conflictingEvents[0].title}"`
        : `At this time: ${count} events (e.g. "${conflictInfo.conflictingEvents[0].title}")`;

      conflicts.push({
        date,
        conflictingEvents: conflictInfo.conflictingEvents,
        message
      });
    }
  }

  const summaryMessage = conflicts.length === 0
    ? ''
    : conflicts
        .map(item => `Conflict on ${formatDateChipLabel(item.date)}: ${item.message}`)
        .join('; ');

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    summaryMessage
  };
}


/**
 * Occurrences of `events` around the given days, with recurring series expanded,
 * so conflict checks also see later occurrences of weekly/monthly/custom events.
 */
export function getOccurrencesAroundDates(events: Event[], dates: Date[]): Event[] {
  const valid = dates.filter(d => d instanceof Date && !isNaN(d.getTime()));
  if (valid.length === 0 || events.length === 0) return [];
  const times = valid.map(d => d.getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const rangeStart = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 1);
  const rangeEnd = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 2);
  return expandRecurringEvents(events, rangeStart, rangeEnd);
}
