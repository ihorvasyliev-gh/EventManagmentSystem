import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, X, Calendar, MapPin, User, Tag, CircleDot } from 'lucide-react';
import { type EventFilters, type EventStatus } from '../types';
import { EVENT_CATEGORIES, CATEGORY_SHORT_LABELS } from '../constants/categories';
import { formatLocalDate } from '../utils/date';
import { getCategoryDotColor } from './WeekView';

/** YYYY-MM-DD (date input) → local midnight */
const parseDateInput = (value: string): Date | undefined => {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};

/** An empty range means "no date filter" (keeps the active-filter badge accurate) */
const normalizeRange = (range: { start?: Date; end?: Date }) =>
  range.start || range.end ? range : undefined;

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Someone who sent events in, for the "Submitted by" filter */
export interface Submitter {
  email: string;
  name: string;
}

/** Today, this week (Monday to Sunday, like the calendar), this month and next month */
const quickRanges = (now = new Date()): Array<{ label: string; start: Date; end: Date }> => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return [
    { label: 'Today', start: today, end: addDays(today, 1) },
    { label: 'This week', start: monday, end: addDays(monday, 7) },
    { label: 'This month', start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    { label: 'Next month', start: new Date(now.getFullYear(), now.getMonth() + 1, 1), end: new Date(now.getFullYear(), now.getMonth() + 2, 1) }
  ];
};

const STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'published', label: 'Published' },
  // The calendar's own words for a draft
  { value: 'draft', label: 'Pending review' }
];

const fieldClass =
  'w-full px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500';
const labelClass = 'flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2';

interface EventFiltersProps {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  availableLocations: string[];
  availableSubmitters: Submitter[];
  /** How many events the search and filters leave, for the "Show N events" button */
  resultCount: number;
  /** Phones: the categories are chosen here (bigger screens have them beside the search) */
  showCategory?: boolean;
}

const EventFiltersComponent: React.FC<EventFiltersProps> = ({
  filters,
  onFiltersChange,
  availableLocations,
  availableSubmitters,
  resultCount,
  showCategory = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // The category is counted only where it is picked here; elsewhere its pills show it
  const activeCount = [
    showCategory && filters.category ? 1 : 0,
    filters.status ? 1 : 0,
    filters.dateRange ? 1 : 0,
    filters.location ? 1 : 0,
    filters.submitterEmail || filters.creatorId ? 1 : 0,
    filters.tags?.length || 0
  ].reduce((a, b) => a + b, 0);
  const hasActiveFilters = activeCount > 0;

  const ranges = quickRanges();
  const isRangeActive = (r: { start: Date; end: Date }) =>
    filters.dateRange?.start?.getTime() === r.start.getTime() && filters.dateRange?.end?.getTime() === r.end.getTime();

  // Two people with the same name are told apart by their address
  const nameCounts = new Map<string, number>();
  availableSubmitters.forEach((s) => nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1));

  const reset = () => onFiltersChange(showCategory ? {} : { category: filters.category });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 h-10 px-3 sm:px-4 lg:px-3 xl:px-4 rounded-xl border transition-colors ${
          hasActiveFilters
            ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-300 dark:border-brand-800 text-brand-700 dark:text-brand-300'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
        aria-label="Filter events"
        aria-expanded={isOpen}
        title="Filters"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {/* Icon only from 1024 to 1279px, where it shares the row with the search and every category */}
        <span className="hidden min-[400px]:inline lg:hidden xl:inline text-sm font-medium">Filters</span>
        {activeCount > 0 && (
          <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center bg-brand-600 text-white text-[11px] font-bold rounded-full">
            {activeCount}
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
          <div
            role="dialog"
            aria-label="Filters"
            className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:right-0 sm:left-auto sm:mt-2 sm:w-80 w-full bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-lg shadow-xl border-t sm:border border-slate-200 dark:border-slate-700 z-50 flex flex-col max-h-[85vh] sm:max-h-[80vh] animate-slide-up sm:animate-scale-in"
          >
            <div className="flex justify-between items-center px-4 pt-4 pb-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filters</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-0 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
              {showCategory && (
                <div role="group" aria-labelledby="filter-category-label">
                  <p id="filter-category-label" className={labelClass}>
                    <Tag className="h-4 w-4" /> Category
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {EVENT_CATEGORIES.map((cat) => {
                      const selected = filters.category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onFiltersChange({ ...filters, category: selected ? undefined : cat })}
                          className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-sm rounded-md border text-left transition-colors ${
                            selected
                              ? 'bg-brand-600 border-brand-600 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getCategoryDotColor(cat)} ${selected ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
                          <span className="truncate">{CATEGORY_SHORT_LABELS[cat]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div role="group" aria-labelledby="filter-dates-label">
                <p id="filter-dates-label" className={labelClass}>
                  <Calendar className="h-4 w-4" /> Dates
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ranges.map((range) => {
                    const active = isRangeActive(range);
                    return (
                      <button
                        key={range.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onFiltersChange({ ...filters, dateRange: active ? undefined : { start: range.start, end: range.end } })}
                        className={`px-3 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm border rounded-md text-left transition-colors ${
                          active
                            ? 'bg-brand-600 border-brand-600 text-white font-semibold'
                            : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200'
                        }`}
                      >
                        {range.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    aria-label="From date"
                    value={filters.dateRange?.start ? formatLocalDate(filters.dateRange.start) : ''}
                    onChange={(e) => {
                      const start = e.target.value ? parseDateInput(e.target.value) : undefined;
                      onFiltersChange({
                        ...filters,
                        dateRange: normalizeRange({ ...filters.dateRange, start })
                      });
                    }}
                    className={fieldClass}
                  />
                  <input
                    type="date"
                    aria-label="To date (inclusive)"
                    // The range end is exclusive (next midnight); show the last included day
                    value={filters.dateRange?.end ? formatLocalDate(addDays(filters.dateRange.end, -1)) : ''}
                    onChange={(e) => {
                      const lastDay = e.target.value ? parseDateInput(e.target.value) : undefined;
                      const end = lastDay ? addDays(lastDay, 1) : undefined;
                      onFiltersChange({
                        ...filters,
                        dateRange: normalizeRange({ ...filters.dateRange, end })
                      });
                    }}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="filter-status" className={labelClass}>
                  <CircleDot className="h-4 w-4" /> Status
                </label>
                <select
                  id="filter-status"
                  value={filters.status || ''}
                  onChange={(e) => {
                    onFiltersChange({
                      ...filters,
                      status: e.target.value ? (e.target.value as EventStatus) : undefined
                    });
                  }}
                  className={fieldClass}
                >
                  <option value="">Any status</option>
                  {STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              {availableLocations.length > 0 && (
                <div>
                  <label htmlFor="filter-location" className={labelClass}>
                    <MapPin className="h-4 w-4" /> Place
                  </label>
                  <select
                    id="filter-location"
                    value={filters.location || ''}
                    onChange={(e) => {
                      onFiltersChange({
                        ...filters,
                        location: e.target.value || undefined
                      });
                    }}
                    className={fieldClass}
                  >
                    <option value="">Any place</option>
                    {availableLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {availableSubmitters.length > 0 && (
                <div>
                  <label htmlFor="filter-submitter" className={labelClass}>
                    <User className="h-4 w-4" /> Submitted by
                  </label>
                  <select
                    id="filter-submitter"
                    value={filters.submitterEmail || ''}
                    onChange={(e) => {
                      onFiltersChange({
                        ...filters,
                        submitterEmail: e.target.value || undefined
                      });
                    }}
                    className={fieldClass}
                  >
                    <option value="">Anyone</option>
                    {availableSubmitters.map((s) => (
                      <option key={s.email} value={s.email} title={s.email}>
                        {(nameCounts.get(s.name) ?? 0) > 1 ? `${s.name} (${s.email})` : s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Always in reach at the bottom of the sheet: what the filters leave, and starting over */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-slate-200 dark:border-slate-700">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 h-11 sm:h-9 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cta flex-1 h-11 sm:h-9 min-h-0 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-colors"
              >
                {resultCount === 1 ? 'Show 1 event' : `Show ${resultCount} events`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(EventFiltersComponent);
