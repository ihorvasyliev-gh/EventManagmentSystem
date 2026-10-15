import type { Event, RecurrenceRule } from '../types.ts';

/**
 * One digest entry: an event plus every occurrence of it inside the digest period.
 * Recurring and multi-date events expand into several instances that share the same `id`;
 * the digest shows them once, on their first date, with the rest listed as "Also on".
 */
export interface DigestEventGroup {
  /** First occurrence in the period — drives the card's date, time and links */
  event: Event;
  /** Every occurrence in the period (including `event`), sorted chronologically */
  occurrences: Event[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toTime = (d: Date | string | undefined | null): number => {
  if (!d) return NaN;
  return (d instanceof Date ? d : new Date(d)).getTime();
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const timeOfDay = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * Collapses occurrences sharing an event id into a single group, ordered by first occurrence.
 * Instances with an invalid date are dropped.
 */
export const groupDigestOccurrences = (events: Event[]): DigestEventGroup[] => {
  const byId = new Map<string, Event[]>();
  for (const ev of events) {
    if (isNaN(toTime(ev.date))) continue;
    const list = byId.get(ev.id);
    if (list) list.push(ev);
    else byId.set(ev.id, [ev]);
  }

  const groups: DigestEventGroup[] = [];
  byId.forEach((list) => {
    const occurrences = [...list].sort((a, b) => toTime(a.date) - toTime(b.date));
    // Drop duplicate instances of the same start (e.g. an event passed in twice)
    const unique = occurrences.filter((ev, i) => i === 0 || toTime(ev.date) !== toTime(occurrences[i - 1].date));
    groups.push({ event: unique[0], occurrences: unique });
  });

  return groups.sort((a, b) => toTime(a.event.date) - toTime(b.event.date));
};

/**
 * Short label for an extra occurrence, e.g. "Sat 26 Sep".
 * Appends the start time when it differs from the first occurrence ("Sat 26 Sep, 14:00").
 */
export const formatOccurrenceLabel = (occurrence: Date | string, first?: Date | string): string => {
  const d = occurrence instanceof Date ? occurrence : new Date(occurrence);
  if (isNaN(d.getTime())) return '';
  let label = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (first) {
    const f = first instanceof Date ? first : new Date(first);
    if (!isNaN(f.getTime()) && timeOfDay(f) !== timeOfDay(d)) {
      label += `, ${timeOfDay(d)}`;
    }
  }
  return label;
};

/**
 * Label for an extra occurrence of a group, e.g. "Sat 26 Sep, 14:00". A series held in
 * different places adds the address when it differs from the first occurrence's
 * ("Sat 26 Sep at Mahon Library"), cut to `maxPlaceLength` characters.
 */
export const formatGroupOccurrence = (
  occurrence: Pick<Event, 'date' | 'location'>,
  first: Pick<Event, 'date' | 'location'>,
  maxPlaceLength = Infinity
): string => {
  const label = formatOccurrenceLabel(occurrence.date, first.date);
  const place = occurrence.location?.trim() ?? '';
  if (!label || !place || place === (first.location?.trim() ?? '')) return label;
  const shortPlace = place.length > maxPlaceLength ? `${place.slice(0, Math.max(1, maxPlaceLength - 1)).trimEnd()}…` : place;
  return `${label} at ${shortPlace}`;
};

/**
 * Up to this many other dates are listed one by one under "Also on". A longer series is summed
 * up instead ("every Thursday until 17 Dec") with its dates by month ("22, 29 Oct · 5, 12 Nov").
 */
export const ALSO_ON_LIST_MAX = 3;

/**
 * Days of one month of a long series: "22", "2–6" for a run of days, or "12 (18:00)" when the
 * time differs from the first date's
 */
export interface SeriesMonth {
  month: string;
  days: string[];
}

/** A long series' other dates at one venue; `place` is '' for the event's own venue */
export interface SeriesVenue {
  place: string;
  months: SeriesMonth[];
}

export interface SeriesSummary {
  /** "every Thursday until 17 Dec, except 26 Nov"; '' when the dates follow no simple pattern */
  pattern: string;
  /** The other dates: the event's own venue first, then each venue the series moves to */
  venues: SeriesVenue[];
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const asDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

// Whole days since 1970 for a local date, so a clock change doesn't put a week at 6.96 days
const dayNumber = (d: Date): number => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const fromDayNumber = (n: number): Date => {
  const u = new Date(n * 86400000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** "Tuesday", "Tuesday and Thursday", "Monday, Wednesday and Friday" */
const listWords = (words: string[]): string =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

const ordinal = (n: number): string => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

/**
 * Days grouped by month, in order, three or more days in a row as a range:
 * [{ month: 'Oct', days: ['22', '29'] }, { month: 'Nov', days: ['2–6', '12 (18:00)'] }]
 */
const byMonth = (dates: Array<{ date: Date; time?: string }>): SeriesMonth[] => {
  const months: SeriesMonth[] = [];
  let key = NaN;
  let run: number[] = [];
  const flush = () => {
    const days = months[months.length - 1]?.days;
    if (days) days.push(...(run.length >= 3 ? [`${run[0]}–${run[run.length - 1]}`] : run.map(String)));
    run = [];
  };
  for (const { date, time } of dates) {
    const k = date.getFullYear() * 12 + date.getMonth();
    if (k !== key) {
      flush();
      key = k;
      months.push({ month: MONTHS_SHORT[date.getMonth()], days: [] });
    }
    const day = date.getDate();
    if (run.length > 0 && (time || day !== run[run.length - 1] + 1)) flush();
    if (time) months[months.length - 1].days.push(`${day} (${time})`);
    else run.push(day);
  }
  flush();
  return months;
};

const monthText = (m: SeriesMonth): string => `${m.days.join(', ')} ${m.month}`;

/**
 * The rule a series' days follow ("every Thursday") and the days it skips (cancelled sessions),
 * or null when they follow none or skip too many to read as one. `days` are day numbers, ascending.
 */
const seriesRule = (days: number[]): { label: string; skipped: number[] } | null => {
  if (days.length < 3) return null;
  const first = days[0];
  const span = days[days.length - 1] - first;
  if (span === days.length - 1) return { label: 'every day', skipped: [] };

  const fits = (label: string, expected: number[]) => {
    const present = new Set(days);
    const skipped = expected.filter((n) => !present.has(n));
    return skipped.length <= Math.min(3, Math.floor((days.length - 1) / 2)) ? { label, skipped } : null;
  };
  const weekdayOf = (n: number) => fromDayNumber(n).getDay();
  const weekdays = Array.from(new Set(days.map(weekdayOf)));

  if (weekdays.length === 1) {
    // Same weekday: weekly, or every 2, 3… weeks
    const step = days.slice(1).reduce((g, n, i) => gcd(g, n - days[i]), 0);
    const weeks = step / 7;
    const name = WEEKDAYS_LONG[weekdays[0]];
    const label = weeks === 1 ? `every ${name}` : weeks === 2 ? `every other ${name}` : `every ${weeks} weeks on ${name}`;
    const rule = fits(label, Array.from({ length: span / step + 1 }, (_, i) => first + i * step));
    if (rule) return rule;
  } else {
    // Several weekdays each week ("every Tuesday and Thursday", "every weekday")
    const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => weekdays.includes(d)).map((d) => WEEKDAYS_LONG[d]);
    const label = weekdays.length === 7 ? 'every day'
      : weekdays.length === 5 && !weekdays.includes(0) && !weekdays.includes(6) ? 'every weekday'
      : `every ${listWords(names)}`;
    const rule = fits(label, Array.from({ length: span + 1 }, (_, i) => first + i).filter((n) => weekdays.includes(weekdayOf(n))));
    if (rule) return rule;
  }

  // Same day of every month
  const start = fromDayNumber(first);
  const dom = start.getDate();
  if (days.every((n) => fromDayNumber(n).getDate() === dom)) {
    const last = fromDayNumber(days[days.length - 1]);
    const months = (last.getFullYear() - start.getFullYear()) * 12 + last.getMonth() - start.getMonth() + 1;
    const expected = Array.from({ length: months }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, dom))
      .filter((d) => d.getDate() === dom)
      .map(dayNumber);
    return fits(`the ${dom}${ordinal(dom)} of every month`, expected);
  }
  return null;
};

/**
 * True when the series is known to have no date after `last`, so "until 17 Dec" is safe to
 * print. An open-ended series, or one whose end isn't known here, continues as far as we know.
 */
const seriesEndsOn = (rule: RecurrenceRule | undefined, last: Date): boolean => {
  if (!rule || rule.type === 'none') return false;
  if (rule.type === 'custom') return !(rule.customDates ?? []).some((d) => dayNumber(asDate(d)) > dayNumber(last));
  if (!rule.endDate) return false;
  const step = rule.interval && rule.interval > 0 ? Math.floor(rule.interval) : 1;
  const next = new Date(last);
  if (rule.type === 'daily') next.setDate(next.getDate() + step);
  else if (rule.type === 'weekly') next.setDate(next.getDate() + 7 * step);
  else if (rule.type === 'monthly') next.setMonth(next.getMonth() + step);
  else next.setFullYear(next.getFullYear() + step);
  return dayNumber(next) > dayNumber(asDate(rule.endDate));
};

const normalizePlace = (place: string | undefined): string => (place ?? '').trim().replace(/\s+/g, ' ');

/**
 * Summary of a series with more than `ALSO_ON_LIST_MAX` other dates, or null for a shorter one
 * (whose dates are listed one by one): the pattern its dates follow and its other dates by
 * month, grouped by venue when the series moves around.
 */
export const summarizeSeries = (group: DigestEventGroup): SeriesSummary | null => {
  const others = group.occurrences.slice(1);
  if (others.length <= ALSO_ON_LIST_MAX) return null;
  const firstDate = asDate(group.event.date);
  const firstTime = timeOfDay(firstDate);
  const firstPlace = normalizePlace(group.event.location);

  const venues: Array<{ place: string; dates: Array<{ date: Date; time?: string }> }> = [{ place: '', dates: [] }];
  for (const occ of others) {
    const date = asDate(occ.date);
    const place = normalizePlace(occ.location);
    const key = place && place !== firstPlace ? place : '';
    let venue = venues.find((v) => v.place === key);
    if (!venue) venues.push((venue = { place: key, dates: [] }));
    const time = timeOfDay(date);
    venue.dates.push({ date, time: time === firstTime ? undefined : time });
  }

  let pattern = '';
  const days = Array.from(new Set(group.occurrences.map((o) => dayNumber(asDate(o.date)))));
  const rule = seriesRule(days);
  if (rule) {
    const last = asDate(others[others.length - 1].date);
    pattern = rule.label;
    if (seriesEndsOn(group.event.recurrence, last)) pattern += ` until ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]}`;
    if (rule.skipped.length) {
      const skipped = byMonth(rule.skipped.map((n) => ({ date: fromDayNumber(n) })));
      pattern += `, except ${listWords(skipped.map(monthText))}`;
    }
  }

  return {
    pattern,
    venues: venues.filter((v) => v.dates.length > 0).map((v) => ({ place: v.place, months: byMonth(v.dates) }))
  };
};

/** "22, 29 Oct · 5, 12 Nov; at Mahon Library: 19, 26 Nov" */
export const formatSeriesDates = (venues: SeriesVenue[]): string =>
  venues.map((v) => `${v.place ? `at ${v.place}: ` : ''}${v.months.map(monthText).join(' · ')}`).join('; ');

/**
 * "Also on" line for a group, or '' when the event occurs only once in the period. A long
 * series reads "every Thursday until 17 Dec: 22, 29 Oct · 5, 12, 19, 26 Nov · 3, 10, 17 Dec".
 */
export const formatAlsoOnDates = (group: DigestEventGroup, separator = '  ·  '): string => {
  const series = summarizeSeries(group);
  if (series) {
    const dates = formatSeriesDates(series.venues);
    return series.pattern ? `${series.pattern}: ${dates}` : dates;
  }
  return group.occurrences
    .slice(1)
    .map((occ) => formatGroupOccurrence(occ, group.event))
    .filter(Boolean)
    .join(separator);
};

export const monthShort = (d: Date): string => MONTHS_SHORT[d.getMonth()];
export const monthShortUpper = (d: Date): string => MONTHS_SHORT[d.getMonth()].toUpperCase();

/** Events added in the last two weeks are marked NEW in the digest (it goes out every fortnight) */
export const NEW_FOR_DAYS = 14;

/** The day from which an event counts as new: two weeks before the day the digest is issued */
export const newSince = (issued: Date): Date =>
  new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() - NEW_FOR_DAYS);

/** Added on or after `since` (and not after `now`: an event with no saved creation time is not new) */
export const isNewEvent = (ev: Pick<Event, 'createdAt'>, since: Date, now: Date = new Date()): boolean => {
  const t = toTime(ev.createdAt);
  return !isNaN(t) && t >= since.getTime() && t <= now.getTime();
};
