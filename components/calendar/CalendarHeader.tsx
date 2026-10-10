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

/** The period shown, previous / next / Today, and Month / Week / Agenda */
const CalendarHeader: React.FC<CalendarHeaderProps> = ({ viewMode, onViewModeChange, title, currentDate, onPrev, onNext, onToday }) => (
  <div className="p-3 sm:p-6 flex flex-col sm:flex-row justify-between items-center border-b border-slate-100 dark:border-slate-800 gap-2 sm:gap-4">
    <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
      <h2 className="text-base sm:text-2xl font-medium text-slate-900 dark:text-white sm:min-w-48 truncate">
        {viewMode === 'week' ? title : (
          <>
            <span className="min-[400px]:hidden">{currentDate.toLocaleString(APP_LOCALE, { month: 'short', year: 'numeric' })}</span>
            <span className="hidden min-[400px]:inline">{title}</span>
          </>
        )}
      </h2>
      <div className="flex items-center gap-1.5 sm:gap-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={onPrev}
            className="p-2 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
            aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
          >
            <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="p-2 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
            aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
          >
            <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          title="Go to today (T)"
          className="cta !text-xs px-3 h-10 sm:h-8 min-h-0 rounded border border-brand-600 text-brand-600 hover:bg-brand-600 hover:text-white dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-400 dark:hover:text-slate-900 transition-colors"
        >
          Today
        </button>
      </div>
    </div>

    {/* Month / Week / Agenda, styled like the site's menu: the current view in raspberry, underlined */}
    <div className="flex w-full sm:w-auto border-b border-slate-200 dark:border-slate-700 sm:border-0">
      {VIEWS.map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onViewModeChange(mode)}
          aria-pressed={viewMode === mode}
          className={`relative flex-1 sm:flex-none px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px sm:after:bottom-0 after:h-0.5 after:bg-current after:transition-opacity ${viewMode === mode ? 'text-brand-600 dark:text-brand-300 after:opacity-100' : 'text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 after:opacity-0'}`}
        >
          <Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  </div>
);

export default CalendarHeader;
