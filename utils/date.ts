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

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
};

export const formatTime = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

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

/**
 * Calculates start and end dates for quick range presets based on a reference local date.
 */
export const calculatePresetDateRange = (
  preset: DateRangePreset,
  options?: {
    referenceDate?: Date;
    events?: Array<{ date: Date | string }>;
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
        const d = ev.date instanceof Date ? ev.date : new Date(ev.date);
        const t = d.getTime();
        if (!isNaN(t) && t > maxMs) {
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

