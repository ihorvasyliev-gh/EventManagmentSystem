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

export function detectMultiDateConflicts(
  dates: Date[],
  startTimeStr: string,
  endTimeStr: string,
  existingEvents: ConflictEvent[],
  excludeEventId?: string
): MultiDateConflictResult {
  if (!dates || dates.length === 0 || !startTimeStr || !endTimeStr) {
    return {
      hasConflict: false,
      conflicts: [],
      summaryMessage: ''
    };
  }

  const [startH, startM = 0, startS = 0] = startTimeStr.split(':').map(Number);
  const [endH, endM = 0, endS = 0] = endTimeStr.split(':').map(Number);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
    return {
      hasConflict: false,
      conflicts: [],
      summaryMessage: ''
    };
  }

  const conflicts: MultiDateConflictItem[] = [];

  for (const date of dates) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      continue;
    }

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
        .map(item => `Conflict on ${item.date.toLocaleDateString()}: ${item.message}`)
        .join('; ');

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    summaryMessage
  };
}

