import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { TimePickerInput } from './TimePickerInput';
import {
  WEEKDAY_LABELS,
  MONTH_NAMES,
  DURATION_PRESETS,
  formatDateChipLabel,
  getCalendarDays,
  toggleDateSelection,
  removeDateSelection,
  calculateTimeDurationMinutes,
  addMinutesToTime,
  calculatePreservedEndTime,
} from '../utils/multiDateUtils';
import { formatLocalDate } from '../utils/date';

export interface MultiDatePickerProps {
  selectedDates: Date[];
  onChangeDates: (dates: Date[]) => void;
  startTime: string;
  onChangeStartTime: (time: string) => void;
  endTime: string;
  onChangeEndTime: (time: string) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export const MultiDatePicker: React.FC<MultiDatePickerProps> = ({
  selectedDates,
  onChangeDates,
  startTime,
  onChangeStartTime,
  endTime,
  onChangeEndTime,
  disabled = false,
  error,
  className = '',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Initialize view month & year based on first selected date or today
  const initialDate = selectedDates.length > 0 ? new Date(selectedDates[0]) : new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  // Set of formatted YYYY-MM-DD keys for O(1) membership check
  const selectedKeys = useMemo(
    () => new Set(selectedDates.map(formatLocalDate)),
    [selectedDates]
  );

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  // Compute 7-column calendar cells for current view
  const calendarDays = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (disabled) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (disabled) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleTodayClick = () => {
    if (disabled) return;
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // Date selection toggling
  const handleToggleDate = (date: Date) => {
    if (disabled) return;
    const updated = toggleDateSelection(selectedDates, date, startTime);
    onChangeDates(updated);
  };

  const handleRemoveDate = (date: Date) => {
    if (disabled) return;
    const updated = removeDateSelection(selectedDates, date);
    onChangeDates(updated);
  };

  // Start time adjustment preserving selected duration
  const handleStartTimeChange = (newStartTime: string) => {
    if (disabled) return;
    if (startTime && endTime) {
      const adjustedEnd = calculatePreservedEndTime(newStartTime, startTime, endTime);
      if (adjustedEnd !== endTime) {
        onChangeEndTime(adjustedEnd);
      }
    }
    onChangeStartTime(newStartTime);
  };

  // Quick duration click handler (+30m, +1h, etc.)
  const handleDurationClick = (minutes: number) => {
    if (disabled) return;
    const effectiveStart = startTime || '09:00';
    if (!startTime) {
      onChangeStartTime(effectiveStart);
    }
    const newEnd = addMinutesToTime(effectiveStart, minutes);
    onChangeEndTime(newEnd);
  };

  const currentDuration = useMemo(
    () => calculateTimeDurationMinutes(startTime, endTime),
    [startTime, endTime]
  );

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        error
          ? 'border-rose-400 dark:border-rose-600 bg-rose-50/20 dark:bg-rose-950/10'
          : isDark
          ? 'border-slate-700 bg-slate-800/80 shadow-xs'
          : 'border-slate-200 bg-white shadow-xs'
      } p-3.5 sm:p-5 space-y-4 w-full ${className}`}
    >
      {/* Mini-Calendar Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
          </div>

          <button
            type="button"
            onClick={handleTodayClick}
            disabled={disabled}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[32px] sm:min-h-[36px]"
          >
            Today
          </button>
        </div>

        {/* Prev / Next Month Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={disabled}
            aria-label="Previous month"
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={disabled}
            aria-label="Next month"
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday Column Headers (Monday-based) */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((dayLabel) => (
          <div
            key={dayLabel}
            className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 py-1"
          >
            {dayLabel}
          </div>
        ))}
      </div>

      {/* Calendar Day Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((cell, idx) => {
          const isSelected = selectedKeys.has(cell.key);
          const isToday = cell.key === todayKey;

          return (
            <button
              key={`${cell.key}-${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => handleToggleDate(cell.date)}
              aria-label={`${cell.date.toDateString()}${isSelected ? ', selected' : ''}`}
              aria-pressed={isSelected}
              className={`
                relative w-full h-11 sm:h-10 rounded-xl text-xs sm:text-sm font-medium transition-all
                flex items-center justify-center touch-manipulation
                disabled:cursor-not-allowed disabled:opacity-50
                ${
                  isSelected
                    ? 'bg-brand-500 text-white font-semibold shadow-sm hover:bg-brand-600' +
                      (isToday ? ' ring-2 ring-brand-300 dark:ring-brand-400 ring-offset-1' : '')
                    : isToday
                    ? 'border-2 border-brand-500 text-brand-600 dark:text-brand-400 font-bold bg-brand-50/60 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40'
                    : cell.inMonth
                    ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    : 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }
              `}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Selected Dates Chips & Counter */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Selected: {selectedDates.length} {selectedDates.length === 1 ? 'day' : 'days'}
          </span>
          {selectedDates.length > 1 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChangeDates([])}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline min-h-[32px] sm:min-h-0 flex items-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear all
            </button>
          )}
        </div>

        {selectedDates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-0.5">
            {selectedDates.map((d, idx) => (
              <span
                key={`${formatLocalDate(d)}-${idx}`}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
              >
                <span>{formatDateChipLabel(d)}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove date ${formatDateChipLabel(d)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveDate(d);
                  }}
                  className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-brand-200/80 dark:hover:bg-brand-800/80 text-brand-500 dark:text-brand-300 transition-colors disabled:opacity-40"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            Tap dates on the calendar to select them for this event.
          </p>
        )}
      </div>

      {/* Time Pickers Section */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-3">
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Event Times
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Start Time
            </label>
            <TimePickerInput
              value={startTime}
              onChange={handleStartTimeChange}
              disabled={disabled}
              placeholder="09:00"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              End Time
            </label>
            <TimePickerInput
              value={endTime}
              onChange={onChangeEndTime}
              referenceStartTime={startTime}
              disabled={disabled}
              placeholder="10:00"
            />
          </div>
        </div>

        {/* Quick Duration Chips */}
        <div className="flex items-center flex-wrap gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
            Duration:
          </span>
          {DURATION_PRESETS.map((preset) => {
            const isActive = currentDuration === preset.minutes;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() => handleDurationClick(preset.minutes)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[38px] sm:min-h-[36px] flex items-center justify-center
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-sm ring-1 ring-brand-600'
                      : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                  }
                `}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Error Message */}
      {error && (
        <div className="pt-1 text-xs font-medium text-rose-500 dark:text-rose-400 flex items-center gap-1.5">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default MultiDatePicker;
