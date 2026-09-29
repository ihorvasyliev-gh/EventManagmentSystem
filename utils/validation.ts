import { Event } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export const validateEvent = (eventData: Partial<Event>): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!eventData.title || eventData.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (eventData.title.length > 200) {
    errors.push({ field: 'title', message: 'Title must be less than 200 characters' });
  }

  if (!eventData.description || eventData.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (eventData.description.length > 2000) {
    errors.push({ field: 'description', message: 'Description must be less than 2000 characters' });
  }

  if (!eventData.location || eventData.location.trim().length === 0) {
    errors.push({ field: 'location', message: 'Location is required' });
  }

  // Past dates are allowed (events can be logged after the fact)
  if (!eventData.date) {
    errors.push({ field: 'date', message: 'Date is required' });
  }

  if (eventData.maxAttendees !== undefined && eventData.maxAttendees < 1) {
    errors.push({ field: 'maxAttendees', message: 'Max attendees must be at least 1' });
  }

  if (eventData.tags && eventData.tags.length > 10) {
    errors.push({ field: 'tags', message: 'Maximum 10 tags allowed' });
  }

  return errors;
};

