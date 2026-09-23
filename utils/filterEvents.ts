import { Event, EventFilters, UserRole } from '../types.ts';
import { expandRecurringEvents } from './recurrence.ts';

// Open-ended date filters still need a finite window to look for occurrences in
const OPEN_RANGE_YEARS = 5;

export const filterEvents = (events: Event[], filters: EventFilters, userRole?: UserRole): Event[] => {
  let filtered = [...events];

  // Search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(event =>
      event.title.toLowerCase().includes(searchLower) ||
      (event.description || '').toLowerCase().includes(searchLower) ||
      (event.location || '').toLowerCase().includes(searchLower) ||
      (event.category || '').toLowerCase().includes(searchLower) ||
      (event.submitterName || '').toLowerCase().includes(searchLower) ||
      event.tags?.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  // Category filter
  if (filters.category) {
    filtered = filtered.filter(event => event.category === filters.category);
  }

  // Status filter
  if (filters.status) {
    filtered = filtered.filter(event => event.status === filters.status);
  } else {
    // By default, show only published events (unless status filter is explicitly set)
    // Admins can see drafts, but non-admins can only see published events
    if (userRole === UserRole.ADMIN) {
      filtered = filtered.filter(event => event.status === 'published' || event.status === 'draft' || event.status === undefined);
    } else {
      filtered = filtered.filter(event => event.status === 'published' || event.status === undefined);
    }
  }

  // Date range filter (start inclusive, end exclusive). Recurring series are kept when
  // any occurrence falls inside the range, not only when the series itself starts there.
  if (filters.dateRange && (filters.dateRange.start || filters.dateRange.end)) {
    const { start, end } = filters.dateRange;
    filtered = filtered.filter(event => {
      const eventDate = new Date(event.date);
      const isRecurring = !!event.recurrence && event.recurrence.type !== 'none';
      if (!isRecurring) {
        if (start && eventDate < start) return false;
        if (end && eventDate >= end) return false;
        return true;
      }
      const rangeStart = start ?? eventDate;
      const rangeEnd = end
        ? new Date(end.getTime() - 1)
        : new Date(rangeStart.getFullYear() + OPEN_RANGE_YEARS, rangeStart.getMonth(), rangeStart.getDate());
      if (rangeEnd < rangeStart) return false;
      return expandRecurringEvents([event], rangeStart, rangeEnd).some(inst =>
        inst.date >= rangeStart && inst.date <= rangeEnd
      );
    });
  }

  // Location filter
  if (filters.location) {
    filtered = filtered.filter(event => event.location === filters.location);
  }

  // Creator filter
  if (filters.creatorId) {
    filtered = filtered.filter(event => event.creatorId === filters.creatorId);
  }

  // Submitter Email filter
  if (filters.submitterEmail) {
    const emailLower = filters.submitterEmail.toLowerCase();
    filtered = filtered.filter(event =>
      event.submitterEmail?.toLowerCase() === emailLower ||
      event.tags?.some(tag => tag.toLowerCase() === `email:${emailLower}`)
    );
  }

  // Tags filter
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(event =>
      event.tags && filters.tags!.some(tag => event.tags!.includes(tag))
    );
  }

  return filtered;
};
