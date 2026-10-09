export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const getFirstDayOfMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
};

export const addMonths = (date: Date, months: number): Date => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

export const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/** True when an event ends on a later calendar day than it starts */
export const isMultiDayEvent = (start: Date | string, end?: Date | string | null): boolean => {
  if (!end) return false;
  const s = new Date(start);
  const e = new Date(end);
  return !isNaN(s.getTime()) && !isNaN(e.getTime()) && !isSameDay(s, e);
};

/** Irish English throughout ("Tuesday 13 October 2026"), whatever language the browser uses */
export const APP_LOCALE = 'en-IE';

const LONG_DATE = new Intl.DateTimeFormat(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Tuesday 13 October 2026" */
export const formatDate = (date: Date): string => LONG_DATE.format(date);

/** 24-hour clock, "13:00" — the same as the digest PDF (an en-US browser would show "01:00 PM") */
export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const formatTime = formatClock;

/**
 * Formats a Date object into YYYY-MM-DD string using local browser date components.
 * Unlike toISOString().slice(0, 10), this NEVER shifts backwards or forwards across timezones.
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns a new Date object initialized to local midnight (00:00:00.000) of today.
 */
export const getStartOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};

export type DateRangePreset = '2weeks' | '1week' | '1month' | 'all';

export interface DateRangeResult {
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
}

export interface LastOccurrenceSource {
  date: Date | string;
  endDate?: Date | string;
  recurrence?: {
    type: string;
    endDate?: Date | string;
    customDates?: Array<Date | string>;
    customEndDates?: Array<Date | string>;
  };
}

/**
 * Latest known moment of an event: its end, its last hand-picked date, or the end date of
 * its repeat. Open-ended repeats count only from their first date.
 */
export const getLastOccurrenceTime = (ev: LastOccurrenceSource): number => {
  const candidates: Array<Date | string | undefined> = [ev.date, ev.endDate];
  const rule = ev.recurrence;
  if (rule?.type === 'custom') {
    candidates.push(...(rule.customDates ?? []), ...(rule.customEndDates ?? []));
  } else if (rule && rule.type !== 'none' && rule.endDate) {
    candidates.push(rule.endDate);
  }
  return candidates.reduce<number>((max, c) => {
    if (!c) return max;
    const t = (c instanceof Date ? c : new Date(c)).getTime();
    return !isNaN(t) && t > max ? t : max;
  }, 0);
};

/**
 * Calculates start and end dates for quick range presets based on a reference local date.
 */
export const calculatePresetDateRange = (
  preset: DateRangePreset,
  options?: {
    referenceDate?: Date;
    events?: Array<LastOccurrenceSource>;
  }
): DateRangeResult => {
  const ref = options?.referenceDate ? new Date(options.referenceDate) : new Date();
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  let end: Date;

  if (preset === '1week') {
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (preset === '2weeks') {
    end = new Date(start);
    end.setDate(end.getDate() + 14);
  } else if (preset === '1month') {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  } else if (preset === 'all') {
    let maxMs = 0;
    if (options?.events && options.events.length > 0) {
      for (const ev of options.events) {
        const t = getLastOccurrenceTime(ev);
        if (t > maxMs) {
          maxMs = t;
        }
      }
    }
    if (maxMs > start.getTime()) {
      end = new Date(maxMs);
    } else {
      end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
    }
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + 14);
  }

  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  return {
    startDate: start,
    endDate: endOfDay,
    startDateStr: formatLocalDate(start),
    endDateStr: formatLocalDate(end)
  };
};

