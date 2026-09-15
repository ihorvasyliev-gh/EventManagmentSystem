import { Event } from '../types';

export interface ConflictInfo {
  conflictingEvents: Event[];
  hasConflict: boolean;
}

export const detectConflicts = (newEvent: Partial<Event>, existingEvents: Event[], excludeEventId?: string): ConflictInfo => {
  if (!newEvent.date) {
    return { conflictingEvents: [], hasConflict: false };
  }

  const newEventStart = new Date(newEvent.date);
  const newEventEnd = new Date(newEventStart);
  newEventEnd.setHours(newEventEnd.getHours() + 1); // Default 1 hour duration

  const conflictingEvents = existingEvents.filter(event => {
    // Exclude the event being edited
    if (excludeEventId && event.id === excludeEventId) {
      return false;
    }


    const eventStart = new Date(event.date);
    const eventEnd = new Date(eventStart);
    eventEnd.setHours(eventEnd.getHours() + 1); // Default 1 hour duration

    // Check for overlap
    // Two events overlap if: newEventStart < eventEnd && newEventEnd > eventStart
    return newEventStart < eventEnd && newEventEnd > eventStart;
  });

  return {
    conflictingEvents,
    hasConflict: conflictingEvents.length > 0
  };
};

export const formatConflictMessage = (conflicts: Event[]): string => {
  if (conflicts.length === 0) {
    return '';
  }

  if (conflicts.length === 1) {
    return `This event conflicts with "${conflicts[0].title}" at ${conflicts[0].date.toLocaleString()}`;
  }

  return `This event conflicts with ${conflicts.length} other events`;
};
