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
