import { formatLocalDate } from './date.ts';
import { hasPerDateTimes } from './recurrence.ts';
import type { Event, RecurrenceRule } from '../types.ts';

export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

export interface CalendarCell {
  date: Date;
  inMonth: boolean;
  key: string;
}

export interface DurationPreset {
  label: string;
  minutes: number;
}

export const DURATION_PRESETS: DurationPreset[] = [
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
  { label: '+1.5h', minutes: 90 },
  { label: '+2h', minutes: 120 },
];

/**
 * Formats a Date object into "Mon, 12 Oct" representation.
 */
export const formatDateChipLabel = (d: Date): string => {
  const weekday = SHORT_WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = SHORT_MONTHS[d.getMonth()];
  return `${weekday}, ${day} ${month}`;
};

/**
 * Parses a YYYY-MM-DD date key into a local midnight Date.
 */
export const parseDateKey = (key: string): Date => {
  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  return new Date(year, month, day, 0, 0, 0, 0);
};

/**
 * Returns true if two Date objects fall on the exact same local calendar day.
 */
export const isSameLocalDay = (a: Date, b: Date): boolean => {
  return formatLocalDate(a) === formatLocalDate(b);
};

/**
 * Builds the month calendar grid for a given year & month (0-indexed).
 * Calendar uses a Monday-based week (Mo, Tu, We, Th, Fr, Sa, Su).
 */
export const getCalendarDays = (year: number, month: number): CalendarCell[] => {
  const firstDay = new Date(year, month, 1);
  // Monday-based: 0=Mon, ..., 6=Sun
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    cells.push({ date: d, inMonth: false, key: formatLocalDate(d) });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, inMonth: true, key: formatLocalDate(d) });
  }

  // Next month padding to fill remaining slots in the last 7-day row
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({ date: d, inMonth: false, key: formatLocalDate(d) });
  }

  return cells;
};

/**
 * Toggles a date in the selectedDates array:
 * - If a date matching the target's YYYY-MM-DD already exists, it is removed.
 * - Otherwise, it is added (applying timeStr if provided) and sorted ascending.
 */
export const toggleDateSelection = (
  selectedDates: Date[],
  targetDate: Date,
  timeStr?: string
): Date[] => {
  const targetKey = formatLocalDate(targetDate);
  const exists = selectedDates.some(d => formatLocalDate(d) === targetKey);

  if (exists) {
    return selectedDates.filter(d => formatLocalDate(d) !== targetKey);
  }

  const newDate = new Date(targetDate);
  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      newDate.setHours(h, m, 0, 0);
    }
  }

  return [...selectedDates, newDate].sort((a, b) => a.getTime() - b.getTime());
};

/**
 * Removes a date from selectedDates matching the target's YYYY-MM-DD.
 */
export const removeDateSelection = (
  selectedDates: Date[],
  targetDate: Date
): Date[] => {
  const targetKey = formatLocalDate(targetDate);
  return selectedDates.filter(d => formatLocalDate(d) !== targetKey);
};

/**
 * Parses "HH:mm" time string to minutes from midnight (0..1439).
 * Returns null if the format or values are invalid.
 */
export const parseTimeToMinutes = (timeStr: string): number | null => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

/**
 * Converts total minutes from midnight into "HH:mm" string.
 * Clamps to [0, 1439] (23:59).
 */
export const minutesToTimeString = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Calculates duration in minutes between start and end time strings.
 * Returns null if either is invalid or if endTime <= startTime.
 */
export const calculateTimeDurationMinutes = (
  startTime: string,
  endTime: string
): number | null => {
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);
  if (startMins === null || endMins === null) return null;
  const diff = endMins - startMins;
  return diff > 0 ? diff : null;
};

/**
 * Adds minutesToAdd to a startTime string and returns the resulting "HH:mm",
 * clamped at 23:59.
 */
export const addMinutesToTime = (startTime: string, minutesToAdd: number): string => {
  const startMins = parseTimeToMinutes(startTime);
  if (startMins === null) return startTime;
  return minutesToTimeString(startMins + minutesToAdd);
};

/**
 * Preserves the previous duration between oldStartTime and currentEndTime
 * when newStartTime changes.
 * Returns the adjusted end time string.
 */
export const calculatePreservedEndTime = (
  newStartTime: string,
  oldStartTime: string,
  currentEndTime: string
): string => {
  const prevDuration = calculateTimeDurationMinutes(oldStartTime, currentEndTime);
  if (prevDuration === null || prevDuration <= 0) {
    return currentEndTime;
  }
  const newStartMins = parseTimeToMinutes(newStartTime);
  if (newStartMins === null) {
    return currentEndTime;
  }
  return minutesToTimeString(newStartMins + prevDuration);
};

// ─── Per-date times ──────────────────────────────────────────────────────
// A multi-date event can run at the same time every day (the default) or have
// its own start/end on each picked date.

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;   // "HH:mm" or '' when there is no end time
}

/** Own times per picked day, keyed by YYYY-MM-DD. Days without an entry use the shared times. */
export type PerDateTimes = Record<string, TimeRange>;

export interface Occurrence {
  start: Date;
  end?: Date;
}

/** "HH:mm" of a Date in local time */
export const toTimeString = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Times for one day: its own entry when set, otherwise the shared times */
export const getTimesForDate = (
  perDate: PerDateTimes | null | undefined,
  date: Date,
  shared: TimeRange
): TimeRange => perDate?.[formatLocalDate(date)] ?? shared;

const atTime = (day: Date, time: string): Date | undefined => {
  const mins = parseTimeToMinutes(time);
  if (mins === null) return undefined;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60, 0, 0);
};

/**
 * Each picked date (sorted) at its start/end time. With `perDate` null every day uses the
 * shared times. Days whose start time is invalid are skipped (validate first).
 */
export const buildOccurrences = (
  dates: Date[],
  shared: TimeRange,
  perDate: PerDateTimes | null
): Occurrence[] =>
  [...dates]
    .sort((a, b) => a.getTime() - b.getTime())
    .flatMap((day) => {
      const times = getTimesForDate(perDate, day, shared);
      const start = atTime(day, times.start);
      if (!start) return [];
      const end = times.end ? atTime(day, times.end) : undefined;
      return [{ start, end }];
    });

/**
 * Checks the times of every picked day. Returns a message naming the first bad day
 * (per-date mode) or null when everything is fine.
 */
export const validateOccurrenceTimes = (
  dates: Date[],
  shared: TimeRange,
  perDate: PerDateTimes | null
): string | null => {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  for (const day of sorted) {
    const times = getTimesForDate(perDate, day, shared);
    const where = perDate ? ` for ${formatDateChipLabel(day)}` : '';
    const startMins = parseTimeToMinutes(times.start);
    if (startMins === null) return `Please choose a start time${where}.`;
    if (times.end) {
      const endMins = parseTimeToMinutes(times.end);
      if (endMins === null) return `Please choose a valid end time${where}.`;
      if (endMins < startMins) return `The end time is before the start time${where}.`;
    }
  }
  return null;
};

/**
 * Turns picked occurrences into what an Event stores: the first occurrence as `date`/`endDate`
 * and, for more than one date, a custom series. With `perDateTimes` each date keeps its own
 * times (`customEndDates`); otherwise the series time applies to every date.
 */
export const buildSchedule = (
  occurrences: Occurrence[],
  perDateTimes: boolean
): { date: Date; endDate?: Date; recurrence?: RecurrenceRule } => {
  const [first] = occurrences;
  if (!first) throw new Error('At least one date is required');
  if (occurrences.length === 1) return { date: first.start, endDate: first.end };
  return {
    date: first.start,
    endDate: first.end,
    recurrence: {
      type: 'custom',
      customDates: occurrences.map((o) => o.start),
      // A day without an end time stores its start, which reads back as "no end time"
      customEndDates: perDateTimes ? occurrences.map((o) => o.end ?? o.start) : undefined,
    },
  };
};

/**
 * Reads a stored event back into the picker's state: picked days, shared times and, for a
 * series with per-date times that actually differ, each day's own times.
 */
export const readScheduleFromEvent = (
  source: Pick<Event, 'date' | 'endDate' | 'recurrence'>,
  defaultDurationMinutes = 90
): { dates: Date[]; shared: TimeRange; sameTime: boolean; perDate: PerDateTimes } => {
  const start = new Date(source.date);
  const shared: TimeRange = {
    start: toTimeString(start),
    end: source.endDate
      ? toTimeString(new Date(source.endDate))
      : addMinutesToTime(toTimeString(start), defaultDurationMinutes),
  };
  const rule = source.recurrence;

  if (rule?.type === 'custom' && rule.customDates && rule.customDates.length > 0) {
    const dates = rule.customDates.map((d) => new Date(d));
    if (!hasPerDateTimes(rule)) return { dates, shared, sameTime: true, perDate: {} };

    const perDate: PerDateTimes = {};
    dates.forEach((d, i) => {
      const end = new Date(rule.customEndDates![i]);
      perDate[formatLocalDate(d)] = {
        start: toTimeString(d),
        end: end.getTime() > d.getTime() ? toTimeString(end) : '',
      };
    });
    const ranges = Object.values(perDate);
    const sameTime = ranges.every((r) => r.start === ranges[0].start && r.end === ranges[0].end);
    return {
      dates,
      shared: sameTime ? ranges[0] : shared,
      sameTime,
      perDate: sameTime ? {} : perDate,
    };
  }

  return { dates: [start], shared, sameTime: true, perDate: {} };
};

/** "10:00 – 11:30", or just the start when there is no end time */
export const formatTimeRange = (r: TimeRange): string => (r.end ? `${r.start} – ${r.end}` : r.start);
