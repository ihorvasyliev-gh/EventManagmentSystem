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

  if (!eventData.date) {
    errors.push({ field: 'date', message: 'Date is required' });
  } else {
    const eventDate = new Date(eventData.date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // validation regarding past dates is removed to allow backtracking
    // if (eventDate < now && !eventData.id) {
    //   errors.push({ field: 'date', message: 'Event date cannot be in the past' });
    // }
  }

  if (eventData.maxAttendees !== undefined && eventData.maxAttendees < 1) {
    errors.push({ field: 'maxAttendees', message: 'Max attendees must be at least 1' });
  }

  if (eventData.tags && eventData.tags.length > 10) {
    errors.push({ field: 'tags', message: 'Maximum 10 tags allowed' });
  }

  return errors;
};

export const validateDateRange = (startDate: Date, endDate: Date): boolean => {
  return startDate <= endDate;
};

export const validateFile = (file: File, maxSizeMB: number = 10, allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']): ValidationError | null => {
  if (!allowedTypes.includes(file.type)) {
    return {
      field: 'file',
      message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      field: 'file',
      message: `File size must be less than ${maxSizeMB}MB`
    };
  }

  return null;
};
