import { useState, useMemo } from 'react';
import { Event, EventFilters, UserRole } from '../types';
import { filterEvents } from '../utils/filterEvents';

export function useFilters(events: Event[], userRole?: UserRole) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EventFilters>({});

  const filteredEvents = useMemo(
    () => filterEvents(events, { ...filters, search: searchQuery }, userRole),
    [events, filters, searchQuery, userRole]
  );

  return { searchQuery, setSearchQuery, filters, setFilters, filteredEvents };
}
