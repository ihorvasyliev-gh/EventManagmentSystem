/**
 * Repeating events in plain words ("Every week on Thursday, until Fri 18 Dec 2026") and the
 * repeats the /submit form offers. Shared by the app and the Cloudflare functions, so days are
 * read on Irish time whatever time zone the computer is in.
 */
import type { RecurrenceRule } from '../types.ts';

export type PatternType = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** A series that repeats on a pattern (not a one-off, and not hand-picked dates) */
export const isPatternType = (type: unknown): type is PatternType =>
  type === 'daily' || type === 'weekly' || type === 'monthly' || type === 'yearly';

const TIME_ZONE = 'Europe/Dublin';
const WEEKDAY = new Intl.DateTimeFormat('en-IE', { timeZone: TIME_ZONE, weekday: 'long' });
const DAY_OF_MONTH = new Intl.DateTimeFormat('en-IE', { timeZone: TIME_ZONE, day: 'numeric' });
const DAY_AND_MONTH = new Intl.DateTimeFormat('en-IE', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' });
const SHORT_DATE = new Intl.DateTimeFormat('en-IE', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** "Thu 15 Oct 2026" */
export const formatShortDate = (date: Date): string => SHORT_DATE.format(date).replace(/,/g, '');

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** The parts of a rule that say how it repeats */
export interface RepeatPattern {
  type?: string | null;
  interval?: number | null;
  endDate?: Date | string | null;
  occurrences?: number | null;
}

/**
 * "Every week on Thursday", "Every 2 weeks on Thursday", "Every month on the 15th", with
 * ", until Fri 18 Dec 2026" or ", 6 times" when the series ends. Null for anything that
 * doesn't repeat on a pattern. `start` is the first occurrence.
 */
export const describeRepeat = (rule: RepeatPattern | null | undefined, start: Date | string): string | null => {
  if (!rule || !isPatternType(rule.type)) return null;
  const first = new Date(start);
  if (isNaN(first.getTime())) return null;
  const every = rule.interval && rule.interval > 1 ? Math.floor(rule.interval) : 1;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.type];
  let text = every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
  if (rule.type === 'weekly') text += ` on ${WEEKDAY.format(first)}`;
  if (rule.type === 'monthly') {
    const day = Number(DAY_OF_MONTH.format(first));
    text += ` on the ${ordinal(day)}${day > 28 ? ' (the last day in shorter months)' : ''}`;
  }
  if (rule.type === 'yearly') text += ` on ${DAY_AND_MONTH.format(first)}`;

  const until = rule.endDate ? new Date(rule.endDate) : null;
  if (until && !isNaN(until.getTime())) text += `, until ${formatShortDate(until)}`;
  else if (rule.occurrences && rule.occurrences > 0) text += `, ${rule.occurrences} times`;
  return text;
};

/**
 * The whole series: "Every week on Thursday from Thu 15 Oct 2026 until Fri 18 Dec 2026", or
 * "…, with no end date". Null for anything that doesn't repeat on a pattern.
 */
export const describeSeries = (rule: RepeatPattern | null | undefined, start: Date | string): string | null => {
  const pattern = describeRepeat(rule ? { type: rule.type, interval: rule.interval } : null, start);
  if (!pattern || !rule) return null;
  const until = rule.endDate ? new Date(rule.endDate) : null;
  const end = until && !isNaN(until.getTime())
    ? ` until ${formatShortDate(until)}`
    : rule.occurrences && rule.occurrences > 0 ? `, ${rule.occurrences} times` : ', with no end date';
  return `${pattern} from ${formatShortDate(new Date(start))}${end}`;
};

// ─── The /submit form's repeat ───────────────────────────────────────

/** How the form says an event repeats */
export interface RepeatSetting {
  type: 'none' | PatternType;
  interval: number;
  /** The last date as YYYY-MM-DD, or '' when it carries on */
  until: string;
  /** Kept from a series an admin set up to end after so many dates (the form doesn't change it) */
  occurrences?: number;
}

export const NO_REPEAT: RepeatSetting = { type: 'none', interval: 1, until: '' };

/** The choices the form offers */
export const REPEAT_CHOICES: ReadonlyArray<{ type: RepeatSetting['type']; interval: number; label: string }> = [
  { type: 'none', interval: 1, label: 'No' },
  { type: 'weekly', interval: 1, label: 'Every week' },
  { type: 'weekly', interval: 2, label: 'Every 2 weeks' },
  { type: 'monthly', interval: 1, label: 'Every month' }
];

export const isRepeating = (setting: RepeatSetting): boolean => setting.type !== 'none';

/** One of the form's own choices (a series an admin set up may repeat in another way) */
export const isRepeatChoice = (setting: Pick<RepeatSetting, 'type' | 'interval'>): boolean =>
  REPEAT_CHOICES.some((c) => c.type === setting.type && (c.type === 'none' || c.interval === setting.interval));

const pad = (n: number) => String(n).padStart(2, '0');

/** A saved event's repeat, for the form */
export const repeatFromRule = (rule?: RecurrenceRule | null): RepeatSetting => {
  if (!rule || !isPatternType(rule.type)) return NO_REPEAT;
  const end = rule.endDate ? new Date(rule.endDate) : null;
  return {
    type: rule.type,
    interval: rule.interval && rule.interval > 0 ? Math.floor(rule.interval) : 1,
    until: end && !isNaN(end.getTime()) ? `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` : '',
    ...(rule.occurrences ? { occurrences: rule.occurrences } : {})
  };
};

/** The last date (local midnight, like the admin form saves it), or undefined */
export const untilDate = (until: string): Date | undefined => {
  const [y, m, d] = until.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};

/** What the event stores for the form's repeat (undefined: it doesn't repeat) */
export const ruleFromRepeat = (setting: RepeatSetting): RecurrenceRule | undefined => {
  if (setting.type === 'none') return undefined;
  return {
    type: setting.type,
    interval: setting.interval,
    endDate: untilDate(setting.until),
    ...(setting.occurrences ? { occurrences: setting.occurrences } : {})
  };
};
