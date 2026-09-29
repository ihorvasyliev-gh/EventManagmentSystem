import { expandRecurringEvents } from './recurrence.ts';
import {
  buildOccurrences, formatDateChipLabel, isSameLocalDay, makeSlot, toTimeString, type Occurrence, type PerDateTimes
} from './multiDateUtils.ts';
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
 * Checks each occurrence (a picked date at one of its times) against existing events.
 * Occurrences without an end time are not checked.
 */
export function detectOccurrenceConflicts(
  occurrences: Occurrence[],
  existingEvents: ConflictEvent[],
  excludeEventId?: string
): MultiDateConflictResult {
  const conflicts: MultiDateConflictItem[] = [];

  for (const { start, end } of occurrences) {
    if (!(start instanceof Date) || isNaN(start.getTime()) || !end || isNaN(end.getTime())) continue;
    const endDateTime = new Date(end);
    if (endDateTime.getTime() <= start.getTime()) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    const conflictInfo = detectConflicts({ date: start, endDate: endDateTime }, existingEvents, excludeEventId);

    if (conflictInfo.hasConflict && conflictInfo.conflictingEvents.length > 0) {
      const count = conflictInfo.conflictingEvents.length;
      const message = count === 1
        ? `At this time: "${conflictInfo.conflictingEvents[0].title}"`
        : `At this time: ${count} events (e.g. "${conflictInfo.conflictingEvents[0].title}")`;

      conflicts.push({
        date: start,
        conflictingEvents: conflictInfo.conflictingEvents,
        message
      });
    }
  }

  const summaryMessage = conflicts.length === 0
    ? ''
    : conflicts
        .map(item => `Conflict on ${formatConflictDate(item.date, occurrences)}: ${item.message}`)
        .join('; ');

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    summaryMessage
  };
}

/** "Fri, 2 Oct", plus the time when the event runs more than once that day */
export function formatConflictDate(
  date: Date,
  occurrences: Pick<Occurrence, 'start'>[],
  formatDay: (d: Date) => string = formatDateChipLabel
): string {
  const label = formatDay(date);
  const sameDay = occurrences.filter(o => isSameLocalDay(o.start, date)).length;
  return sameDay > 1 ? `${label}, ${toTimeString(date)}` : label;
}

/**
 * Checks each picked date against existing events. Every date uses the shared start/end
 * times, or its own sessions in `perDateTimes` when the event runs at different times per day.
 */
export function detectMultiDateConflicts(
  dates: Date[],
  startTimeStr: string,
  endTimeStr: string,
  existingEvents: ConflictEvent[],
  excludeEventId?: string,
  perDateTimes?: PerDateTimes | null
): MultiDateConflictResult {
  const valid = (dates ?? []).filter(d => d instanceof Date && !isNaN(d.getTime()));
  const occurrences = buildOccurrences(valid, [makeSlot(startTimeStr, endTimeStr)], perDateTimes ?? null);
  return detectOccurrenceConflicts(occurrences, existingEvents, excludeEventId);
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
