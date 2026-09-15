import React, { useState, useMemo, useEffect } from 'react';
import { Filter, X, Calendar, MapPin, User, Tag } from 'lucide-react';
import { EventFilters, EventCategory, EventStatus, EventCategoryItem } from '../types';
import { getCategories } from '../services/categoryService';

interface EventFiltersProps {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  availableLocations: string[];
  availableCreators: { id: string; name: string }[];
  onClose?: () => void;
}

const EventFiltersComponent: React.FC<EventFiltersProps> = ({
  filters,
  onFiltersChange,
  availableLocations,
  availableCreators,
  onClose
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState<EventCategoryItem[]>([]);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(err => {
        console.error('Failed to load categories:', err);
        // Fallback to empty array
        setCategories([]);
      });
  }, []);

  const categoryOptions: { value: EventCategory; label: string }[] = categories.map(cat => ({
    value: cat.name,
    label: cat.name.charAt(0).toUpperCase() + cat.name.slice(1)
  }));

  const statuses: { value: EventStatus; label: string }[] = [
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Draft' }
  ];

  const quickDateFilters = [
    { label: 'Today', getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: today, end: tomorrow };
    }},
    { label: 'This Week', getRange: () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end };
    }},
    { label: 'This Month', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start, end };
    }},
    { label: 'Next Month', getRange: () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 1);
      return { start, end };
    }}
  ];

  const hasActiveFilters = useMemo(() => 
    filters.category || 
    filters.status || 
    filters.dateRange || 
    filters.location || 
    filters.creatorId ||
    (filters.tags && filters.tags.length > 0),
    [filters]
  );

  const clearFilters = () => {
    onFiltersChange({});
  };

  const applyQuickDate = (getRange: () => { start: Date; end: Date }) => {
    const range = getRange();
    onFiltersChange({ ...filters, dateRange: range });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
          hasActiveFilters
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
        aria-label="Filter events"
        aria-expanded={isOpen}
      >
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
            {[
              filters.category ? 1 : 0,
              filters.status ? 1 : 0,
              filters.dateRange ? 1 : 0,
              filters.location ? 1 : 0,
              filters.creatorId ? 1 : 0,
              filters.tags?.length || 0
            ].reduce((a, b) => a + b, 0)}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:right-0 sm:left-auto sm:mt-2 sm:w-80 w-full bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-lg shadow-xl border-t sm:border border-slate-200 dark:border-slate-700 z-50 p-4 sm:p-4 space-y-4 max-h-[85vh] sm:max-h-[80vh] overflow-y-auto animate-slide-up sm:animate-scale-in">
            <div className="flex justify-between items-center mb-2 sm:mb-0">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filters</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-0 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Date Filters */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Quick Date Filters
              </label>
              <div className="grid grid-cols-2 gap-2">
                {quickDateFilters.map((filter) => (
                  <button
                    key={filter.label}
                    onClick={() => applyQuickDate(filter.getRange)}
                    className="px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 text-left bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filters.dateRange?.start ? filters.dateRange.start.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const start = e.target.value ? new Date(e.target.value) : undefined;
                    onFiltersChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, start }
                    });
                  }}
                  className="px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200"
                />
                <input
                  type="date"
                  value={filters.dateRange?.end ? filters.dateRange.end.toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const end = e.target.value ? new Date(e.target.value) : undefined;
                    onFiltersChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, end }
                    });
                  }}
                  className="px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Category
              </label>
              <select
                value={filters.category || ''}
                onChange={(e) => {
                  onFiltersChange({
                    ...filters,
                    category: e.target.value ? (e.target.value as EventCategory) : undefined
                  });
                }}
                className="w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="">All Categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <select
                value={filters.status || ''}
                onChange={(e) => {
                  onFiltersChange({
                    ...filters,
                    status: e.target.value ? (e.target.value as EventStatus) : undefined
                  });
                }}
                className="w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Filter */}
            {availableLocations.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  Location
                </label>
                <select
                  value={filters.location || ''}
                  onChange={(e) => {
                    onFiltersChange({
                      ...filters,
                      location: e.target.value || undefined
                    });
                  }}
                  className="w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="">All Locations</option>
                  {availableLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Creator Filter */}
            {availableCreators.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <User className="h-4 w-4 inline mr-1" />
                  Creator
                </label>
                <select
                  value={filters.creatorId || ''}
                  onChange={(e) => {
                    onFiltersChange({
                      ...filters,
                      creatorId: e.target.value || undefined
                    });
                  }}
                  className="w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="">All Creators</option>
                  {availableCreators.map((creator) => (
                    <option key={creator.id} value={creator.id}>
                      {creator.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(EventFiltersComponent, (prevProps, nextProps) => {
  // Compare filters object
  if (prevProps.filters !== nextProps.filters) {
    // Deep compare filter properties
    if (prevProps.filters.category !== nextProps.filters.category) return false;
    if (prevProps.filters.status !== nextProps.filters.status) return false;
    if (prevProps.filters.location !== nextProps.filters.location) return false;
    if (prevProps.filters.creatorId !== nextProps.filters.creatorId) return false;
    
    // Compare date ranges
    const prevStart = prevProps.filters.dateRange?.start?.getTime();
    const nextStart = nextProps.filters.dateRange?.start?.getTime();
    const prevEnd = prevProps.filters.dateRange?.end?.getTime();
    const nextEnd = nextProps.filters.dateRange?.end?.getTime();
    if (prevStart !== nextStart || prevEnd !== nextEnd) return false;
    
    // Compare tags arrays
    const prevTags = prevProps.filters.tags?.join(',') || '';
    const nextTags = nextProps.filters.tags?.join(',') || '';
    if (prevTags !== nextTags) return false;
  }
  
  // Compare arrays by length and content
  if (prevProps.availableLocations.length !== nextProps.availableLocations.length) return false;
  if (prevProps.availableLocations.join(',') !== nextProps.availableLocations.join(',')) return false;
  
  if (prevProps.availableCreators.length !== nextProps.availableCreators.length) return false;
  const prevCreators = prevProps.availableCreators.map(c => `${c.id}:${c.name}`).join(',');
  const nextCreators = nextProps.availableCreators.map(c => `${c.id}:${c.name}`).join(',');
  if (prevCreators !== nextCreators) return false;
  
  if (prevProps.onFiltersChange !== nextProps.onFiltersChange) return false;
  if (prevProps.onClose !== nextProps.onClose) return false;
  
  return true; // Props are equal, skip re-render
});
