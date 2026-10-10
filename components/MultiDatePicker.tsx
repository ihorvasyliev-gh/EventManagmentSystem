import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Clock, Plus } from 'lucide-react';
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
  getSlotsForDate,
  compareByStartTime,
  updateSlot,
  addSlotAfter,
  removeSlot,
  copySlots,
  type PerDateTimes,
  type TimeRange,
  type TimeSlot,
} from '../utils/multiDateUtils';
import { formatLocalDate } from '../utils/date';

export interface MultiDatePickerProps {
  selectedDates: Date[];
  onChangeDates: (dates: Date[]) => void;
  /**
   * Times the event runs at on every day: one, or several (e.g. morning and evening, each its
   * own occurrence). Always at least one.
   */
  sharedTimes: TimeSlot[];
  onChangeSharedTimes: (times: TimeSlot[]) => void;
  /**
   * "Same time every day" toggle. Leave `onChangeSameTimeForAll` out to always use the
   * shared times.
   */
  sameTimeForAll?: boolean;
  onChangeSameTimeForAll?: (same: boolean) => void;
  /** Own times per date (YYYY-MM-DD) while `sameTimeForAll` is off */
  perDateTimes?: PerDateTimes;
  onChangePerDateTimes?: (times: PerDateTimes) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
}

interface SlotFieldsProps {
  slot: TimeSlot;
  onChange: (patch: Partial<TimeRange>) => void;
  onRemove?: () => void;
  disabled: boolean;
  compact?: boolean;
}

/** Start and end of one session, with a remove button when the day has more than one */
const SlotFields: React.FC<SlotFieldsProps> = ({ slot, onChange, onRemove, disabled, compact }) => {
  const endBeforeStart = !!slot.start && !!slot.end && slot.end < slot.start;
  const labelClass = compact
    ? 'block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1'
    : 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
  return (
    <div>
      <div className="flex items-end gap-2">
        <div className={`grid flex-1 gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 sm:gap-3'}`}>
          <div>
            <label className={labelClass}>{compact ? 'Start' : 'Start Time'}</label>
            <TimePickerInput value={slot.start} onChange={(v) => onChange({ start: v })} disabled={disabled} placeholder="09:00" />
          </div>
          <div>
            <label className={labelClass}>{compact ? 'End' : 'End Time'}</label>
            <TimePickerInput
              value={slot.end}
              onChange={(v) => onChange({ end: v })}
              referenceStartTime={slot.start}
              disabled={disabled}
              placeholder="10:00"
            />
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove the ${slot.start || 'new'} time`}
            className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 mb-0.5 rounded-xl inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {endBeforeStart && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          The end time is before the start time.
        </p>
      )}
    </div>
  );
};

const AddTimeButton: React.FC<{ onClick: () => void; disabled: boolean; label: string }> = ({ onClick, disabled, label }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex items-center gap-1 text-left text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 min-h-[32px]"
  >
    <Plus className="w-3.5 h-3.5 shrink-0" /> {label}
  </button>
);

export const MultiDatePicker: React.FC<MultiDatePickerProps> = ({
  selectedDates,
  onChangeDates,
  sharedTimes,
  onChangeSharedTimes,
  sameTimeForAll = true,
  onChangeSameTimeForAll,
  perDateTimes = {},
  onChangePerDateTimes,
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

  // Own times per date: offered once more than one day is picked (and kept visible if the
  // user switched to it and then removed days)
  const canSetPerDate = !!onChangeSameTimeForAll && !!onChangePerDateTimes;
  const showSameTimeToggle = canSetPerDate && (selectedDates.length > 1 || !sameTimeForAll);
  const usePerDate = canSetPerDate && !sameTimeForAll;
  const sortedDates = useMemo(
    () => [...selectedDates].sort((a, b) => a.getTime() - b.getTime()),
    [selectedDates]
  );
  const sortedShared = useMemo(() => [...sharedTimes].sort(compareByStartTime), [sharedTimes]);

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

  const slotsOf = (date: Date): TimeSlot[] => getSlotsForDate(perDateTimes, date, sharedTimes);

  // Date selection toggling
  const handleToggleDate = (date: Date) => {
    if (disabled) return;
    const updated = toggleDateSelection(selectedDates, date, sortedShared[0]?.start);
    // A day added while each date has its own times starts from the latest picked day's times
    const key = formatLocalDate(date);
    if (usePerDate && updated.length > selectedDates.length && !perDateTimes[key]?.length && sortedDates.length > 0) {
      const latest = slotsOf(sortedDates[sortedDates.length - 1]);
      onChangePerDateTimes?.({ ...perDateTimes, [key]: copySlots(latest) });
    }
    onChangeDates(updated);
  };

  const handleRemoveDate = (date: Date) => {
    if (disabled) return;
    const updated = removeDateSelection(selectedDates, date);
    onChangeDates(updated);
  };

  // Quick duration click handler (+30m, +1h, etc.) for the only shared time
  const handleDurationClick = (minutes: number) => {
    if (disabled) return;
    const slot = sharedTimes[0];
    const start = slot.start || '09:00';
    onChangeSharedTimes(updateSlot(sharedTimes, slot.id, { start, end: addMinutesToTime(start, minutes) }));
  };

  const handleSameTimeToggle = (same: boolean) => {
    if (disabled || !onChangeSameTimeForAll || !onChangePerDateTimes) return;
    if (!same) {
      // Every day starts from the shared times; the user then adjusts the ones that differ
      const seeded: PerDateTimes = {};
      sortedDates.forEach((d) => {
        seeded[formatLocalDate(d)] = copySlots(sharedTimes);
      });
      onChangePerDateTimes(seeded);
    } else if (sortedDates.length > 0) {
      // Back to one set of times: keep the first day's for every day
      onChangeSharedTimes(copySlots(slotsOf(sortedDates[0])));
    }
    onChangeSameTimeForAll(same);
  };

  const setDateSlots = (date: Date, slots: TimeSlot[]) => {
    if (disabled || !onChangePerDateTimes) return;
    onChangePerDateTimes({ ...perDateTimes, [formatLocalDate(date)]: slots });
  };

  const copyTimesToAll = (date: Date) => {
    if (disabled || !onChangePerDateTimes) return;
    const source = slotsOf(date);
    const next: PerDateTimes = { ...perDateTimes };
    sortedDates.forEach((d) => {
      next[formatLocalDate(d)] = copySlots(source);
    });
    onChangePerDateTimes(next);
  };

  const onlyShared = sharedTimes.length === 1 ? sharedTimes[0] : null;
  const currentDuration = useMemo(
    () => (onlyShared ? calculateTimeDurationMinutes(onlyShared.start, onlyShared.end) : null),
    [onlyShared]
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
            {/* "Sep 2026" on the narrowest phones: the full name wrapped onto two lines there */}
            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
              <span className="min-[360px]:hidden">{MONTH_NAMES[viewMonth].slice(0, 3)} {viewYear}</span>
              <span className="hidden min-[360px]:inline">{MONTH_NAMES[viewMonth]} {viewYear}</span>
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
                    ? 'bg-brand-600 text-white font-semibold shadow-sm hover:bg-brand-700' +
                      (isToday ? ' ring-2 ring-brand-300 dark:ring-brand-400 ring-offset-1' : '')
                    : isToday
                    ? 'border-2 border-brand-500 text-brand-600 dark:text-brand-400 font-bold bg-brand-50/60 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/40'
                    : cell.inMonth
                    ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    // Days of the next/previous month can be picked too, so they stay readable
                    : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Event Times
            </span>
          </div>

          {showSameTimeToggle && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[32px] text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={sameTimeForAll}
                disabled={disabled}
                onChange={(e) => handleSameTimeToggle(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 accent-brand-600"
              />
              Same time every day
            </label>
          )}
        </div>

        {usePerDate ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Set the start and end time for each date. Add another time if it runs more than once that day.
            </p>
            <ul className="space-y-2">
              {sortedDates.map((d) => {
                const slots = slotsOf(d);
                const label = formatDateChipLabel(d);
                const hasProblem = slots.some((s) => !!s.start && !!s.end && s.end < s.start);
                return (
                  <li
                    key={formatLocalDate(d)}
                    className={`rounded-xl border p-2.5 sm:p-3 ${
                      hasProblem
                        ? 'border-rose-300 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{label}</span>
                      {sortedDates.length > 1 && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => copyTimesToAll(d)}
                          className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 min-h-[28px]"
                        >
                          Use for all dates
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {[...slots].sort(compareByStartTime).map((slot) => (
                        <SlotFields
                          key={slot.id}
                          slot={slot}
                          compact
                          disabled={disabled}
                          onChange={(patch) => setDateSlots(d, updateSlot(slots, slot.id, patch))}
                          onRemove={slots.length > 1 ? () => setDateSlots(d, removeSlot(slots, slot.id)) : undefined}
                        />
                      ))}
                    </div>
                    <AddTimeButton
                      disabled={disabled}
                      onClick={() => setDateSlots(d, addSlotAfter(slots))}
                      label="Add another time"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {sortedShared.map((slot, i) => (
                <div key={slot.id}>
                  {sharedTimes.length > 1 && (
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                      Time {i + 1}
                    </p>
                  )}
                  <SlotFields
                    slot={slot}
                    disabled={disabled}
                    onChange={(patch) => onChangeSharedTimes(updateSlot(sharedTimes, slot.id, patch))}
                    onRemove={sharedTimes.length > 1 ? () => onChangeSharedTimes(removeSlot(sharedTimes, slot.id)) : undefined}
                  />
                </div>
              ))}
            </div>

            {/* Quick Duration Chips */}
            {onlyShared && (
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
            )}

            <AddTimeButton
              disabled={disabled}
              onClick={() => onChangeSharedTimes(addSlotAfter(sharedTimes))}
              label={selectedDates.length > 1 ? 'Add another time each day (e.g. morning and evening)' : 'Add another time that day (e.g. morning and evening)'}
            />
          </>
        )}
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
