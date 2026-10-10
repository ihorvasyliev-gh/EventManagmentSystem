import React from 'react';
import { type RecurrenceType } from '../../types';

interface RecurrenceFieldsProps {
  /** Dates and times picked above (more than one makes it a custom schedule) */
  sessionCount: number;
  dateCount: number;
  type: RecurrenceType;
  onTypeChange: (type: RecurrenceType) => void;
  interval: number;
  onIntervalChange: (interval: number) => void;
  /** YYYY-MM-DD, or '' for no end */
  endDate: string;
  onEndDateChange: (value: string) => void;
}

/** Edit form: repeat daily / weekly / monthly / yearly (only for an event on a single date) */
const RecurrenceFields: React.FC<RecurrenceFieldsProps> = ({
  sessionCount,
  dateCount,
  type,
  onTypeChange,
  interval,
  onIntervalChange,
  endDate,
  onEndDateChange
}) => {
  const repeats = sessionCount <= 1 && type !== 'none' && type !== 'custom';
  return (
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
      <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">RECURRENCE</h4>
      <div className="space-y-4">
        <div className={repeats ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : ''}>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Repeat</label>
            <select
              value={sessionCount > 1 ? 'custom' : type}
              onChange={(e) => onTypeChange(e.target.value as RecurrenceType)}
              disabled={sessionCount > 1}
              className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom Dates</option>
            </select>
          </div>

          {repeats && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Interval (Every X)</label>
                <input
                  type="number"
                  min="1"
                  value={interval}
                  onChange={(e) => onIntervalChange(Number(e.target.value))}
                  className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                />
              </div>
            </>
          )}
        </div>

        {sessionCount > 1 && (
          <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">
            Multi-day custom schedule active ({dateCount} {dateCount === 1 ? 'date' : 'dates'}
            {sessionCount > dateCount ? `, ${sessionCount} times` : ''} selected above).
          </p>
        )}
        {sessionCount <= 1 && type === 'custom' && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select additional dates on the calendar above to set custom recurring dates.
          </p>
        )}
      </div>
    </div>
  );
};

export default RecurrenceFields;
