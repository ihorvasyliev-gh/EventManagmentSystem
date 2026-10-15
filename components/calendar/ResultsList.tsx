import React, { useState } from 'react';
import { SearchX } from 'lucide-react';
import { type Event } from '../../types';
import { AgendaDayGroups, FoldedEvents } from './AgendaView';

interface ResultsListProps {
  /** Results still to come, soonest first */
  upcoming: Event[];
  /** Results already over, latest first */
  past: Event[];
  today: Date;
  onEventClick: (event: Event) => void;
  onClearFilters?: () => void;
}

/** Search and filter results across all dates, upcoming first, the past ones folded away below */
const ResultsList: React.FC<ResultsListProps> = ({ upcoming, past, today, onEventClick, onClearFilters }) => {
  // Nothing coming up: the past results are what there is, so they start open
  const [showPast, setShowPast] = useState(upcoming.length === 0);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center text-sm flex flex-col items-center gap-3">
        <SearchX className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-slate-500 dark:text-slate-400">No events match your search or filters.</p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Clear search & filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {upcoming.length > 0 ? (
        <AgendaDayGroups events={upcoming} today={today} onEventClick={onEventClick} markSeries />
      ) : (
        <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Nothing coming up matches.</p>
      )}
      {past.length > 0 && (
        <FoldedEvents
          label={`${showPast ? 'Hide' : 'Show'} past results (${past.length})`}
          open={showPast}
          onToggle={() => setShowPast((open) => !open)}
        >
          <AgendaDayGroups events={past} today={today} onEventClick={onEventClick} markSeries />
        </FoldedEvents>
      )}
    </div>
  );
};

export default ResultsList;
