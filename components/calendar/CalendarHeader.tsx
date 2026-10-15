import React from 'react';
import { ChevronLeft, ChevronRight, Grid, Calendar as CalendarIcon, List as ListIcon } from 'lucide-react';
import { type ViewMode } from '../../types';
import { APP_LOCALE } from '../../utils/date';

interface CalendarHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** The month, or the week's dates */
  title: string;
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const VIEWS = [
  ['grid', 'Month', Grid],
  ['week', 'Week', CalendarIcon],
  ['agenda', 'Agenda', ListIcon]
] as const;

/**
 * The period shown, previous / next / Today, and Month / Week / Agenda, in one row (on phones the
 * views are icons, so the first events start higher up)
 */
const CalendarHeader: React.FC<CalendarHeaderProps> = ({ viewMode, onViewModeChange, title, currentDate, onPrev, onNext, onToday }) => (
  <div className="px-3 py-2 sm:px-4 sm:py-3 lg:px-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 gap-2 sm:gap-4">
    <h2 className="min-w-0 flex-1 text-base sm:text-xl lg:text-2xl font-medium text-slate-900 dark:text-white truncate">
      {viewMode === 'week' ? title : (
        <>
          {/* The full month where it fits beside the buttons */}
          <span className="min-[430px]:hidden">{currentDate.toLocaleString(APP_LOCALE, { month: 'short', year: 'numeric' })}</span>
          <span className="hidden min-[430px]:inline">{title}</span>
        </>
      )}
    </h2>
    <div className="flex items-center gap-1 min-[400px]:gap-1.5 sm:gap-3 shrink-0">
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
        <button
          type="button"
          onClick={onPrev}
          className="w-9 h-10 sm:w-8 sm:h-8 min-w-0 min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
          aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="w-9 h-10 sm:w-8 sm:h-8 min-w-0 min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
          aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
        >
          <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        title="Go to today (T)"
        className="cta !text-xs !tracking-[0.06em] px-2 sm:px-3 h-10 sm:h-8 min-h-0 rounded border border-brand-600 text-brand-600 hover:bg-brand-600 hover:text-white dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-400 dark:hover:text-slate-900 transition-colors"
      >
        Today
      </button>

      {/* Month / Week / Agenda, styled like the site's menu: the current view in raspberry, underlined */}
      <div className="flex" role="group" aria-label="Calendar view">
        {VIEWS.map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            aria-pressed={viewMode === mode}
            title={label}
            className={`relative w-9 h-10 md:w-auto md:h-8 px-0 md:px-3 min-w-0 min-h-0 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 md:after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-current after:transition-opacity ${viewMode === mode ? 'text-brand-600 dark:text-brand-300 after:opacity-100' : 'text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 after:opacity-0'}`}
          >
            <Icon className="h-[18px] w-[18px] md:h-3.5 md:w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only md:not-sr-only">{label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default CalendarHeader;
