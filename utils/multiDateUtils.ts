import { formatLocalDate } from './date.ts';
import { hasPerDateTimes, hasPerSessionPlaces } from './recurrence.ts';
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

// ─── Sessions: times and places per date ─────────────────────────────────
// A multi-date event runs at the same time(s) every day (the default) or at its own times on
// each picked date. Either way a day can hold several sessions (e.g. morning and evening),
// and each session is its own occurrence. The event is held in one place, or every session
// has its own address.

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;   // "HH:mm" or '' when there is no end time
}

/** One session of a day. Its `id` (unique within the day) keeps its address attached while its times change. */
export interface TimeSlot extends TimeRange {
  id: string;
}

/** Own sessions per picked day, keyed by YYYY-MM-DD. Days without an entry use the shared sessions. */
export type PerDateTimes = Record<string, TimeSlot[]>;

/** Address of each session while the event is held in different places, keyed by `sessionKey()` */
export type SessionPlaces = Record<string, string>;

export interface Occurrence {
  start: Date;
  end?: Date;
  /** Own address, when the event is held in different places */
  location?: string;
}

let slotCounter = 0;
/** A new session id */
export const newSlotId = (): string => `s${Date.now().toString(36)}${(slotCounter++).toString(36)}`;

export const makeSlot = (start: string, end: string, id: string = newSlotId()): TimeSlot => ({ id, start, end });

/** Key of one session (a day and one of its times) in `SessionPlaces` */
export const sessionKey = (day: Date, slotId: string): string => `${formatLocalDate(day)}#${slotId}`;

/** "HH:mm" of a Date in local time */
export const toTimeString = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Sessions of one day: its own list when set, otherwise the shared sessions */
export const getSlotsForDate = (
  perDate: PerDateTimes | null | undefined,
  date: Date,
  shared: TimeSlot[]
): TimeSlot[] => {
  const own = perDate?.[formatLocalDate(date)];
  return own && own.length > 0 ? own : shared;
};

/** Earlier start first; sessions without a valid start go last */
export const compareByStartTime = (a: TimeRange, b: TimeRange): number =>
  (parseTimeToMinutes(a.start) ?? 1440) - (parseTimeToMinutes(b.start) ?? 1440);

/** Changes one session's times; moving its start keeps its duration */
export const updateSlot = (slots: TimeSlot[], id: string, patch: Partial<TimeRange>): TimeSlot[] =>
  slots.map((slot) => {
    if (slot.id !== id) return slot;
    const next = { ...slot, ...patch };
    if (patch.start !== undefined && slot.start && slot.end && patch.end === undefined) {
      next.end = calculatePreservedEndTime(patch.start, slot.start, slot.end);
    }
    return next;
  });

/** Adds a session after the latest one, one hour after it ends and just as long */
export const addSlotAfter = (slots: TimeSlot[], fallback: TimeRange = { start: '10:00', end: '11:30' }): TimeSlot[] => {
  const latest = [...slots].sort(compareByStartTime).pop();
  if (!latest || parseTimeToMinutes(latest.start) === null) return [...slots, makeSlot(fallback.start, fallback.end)];
  const duration = calculateTimeDurationMinutes(latest.start, latest.end) ?? 90;
  const start = addMinutesToTime(latest.end || addMinutesToTime(latest.start, duration), 60);
  return [...slots, makeSlot(start, addMinutesToTime(start, duration))];
};

/** Removes a session, keeping at least one */
export const removeSlot = (slots: TimeSlot[], id: string): TimeSlot[] =>
  slots.length > 1 ? slots.filter((s) => s.id !== id) : slots;

/** Copies of `slots` (same ids, so each copy's address stays attached to its day and id) */
export const copySlots = (slots: TimeSlot[]): TimeSlot[] => slots.map((s) => ({ ...s }));

export interface Session {
  day: Date;
  slot: TimeSlot;
  /** `sessionKey(day, slot.id)` */
  key: string;
  /** The day has more than one session */
  multiple: boolean;
}

/** Every session of the picked days, by date and then start time */
export const listSessions = (dates: Date[], shared: TimeSlot[], perDate: PerDateTimes | null): Session[] =>
  [...dates]
    .sort((a, b) => a.getTime() - b.getTime())
    .flatMap((day) => {
      const slots = [...getSlotsForDate(perDate, day, shared)].sort(compareByStartTime);
      return slots.map((slot) => ({ day, slot, key: sessionKey(day, slot.id), multiple: slots.length > 1 }));
    });

/** "Fri, 2 Oct", plus the start time when that day has more than one session */
export const formatSessionLabel = (session: Pick<Session, 'day' | 'slot' | 'multiple'>): string =>
  session.multiple && session.slot.start
    ? `${formatDateChipLabel(session.day)}, ${session.slot.start}`
    : formatDateChipLabel(session.day);

const atTime = (day: Date, time: string): Date | undefined => {
  const mins = parseTimeToMinutes(time);
  if (mins === null) return undefined;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60, 0, 0);
};

/**
 * Every session of the picked dates as a start/end, sorted. With `perDate` null every day uses
 * the shared sessions; with `places` each occurrence carries its session's address.
 * Sessions whose start time is invalid are skipped (validate first).
 */
export const buildOccurrences = (
  dates: Date[],
  shared: TimeSlot[],
  perDate: PerDateTimes | null,
  places?: SessionPlaces | null
): Occurrence[] =>
  listSessions(dates, shared, perDate)
    .flatMap(({ day, slot, key }): Occurrence[] => {
      const start = atTime(day, slot.start);
      if (!start) return [];
      const end = slot.end ? atTime(day, slot.end) : undefined;
      return [places ? { start, end, location: (places[key] ?? '').trim() } : { start, end }];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

const checkTimes = (times: TimeRange, where: string): string | null => {
  const startMins = parseTimeToMinutes(times.start);
  if (startMins === null) return `Please choose a start time${where}.`;
  if (times.end) {
    const endMins = parseTimeToMinutes(times.end);
    if (endMins === null) return `Please choose a valid end time${where}.`;
    if (endMins < startMins) return `The end time is before the start time${where}.`;
  }
  return null;
};

/**
 * Checks the times of every session. Returns a message naming the first bad one, or null
 * when everything is fine. Two sessions of one day can't start at the same time.
 */
export const validateOccurrenceTimes = (
  dates: Date[],
  shared: TimeSlot[],
  perDate: PerDateTimes | null
): string | null => {
  if (!perDate) {
    for (let i = 0; i < shared.length; i++) {
      const error = checkTimes(shared[i], shared.length > 1 ? ` for time ${i + 1}` : '');
      if (error) return error;
    }
    const starts = shared.map((s) => s.start);
    const repeated = starts.find((s, i) => starts.indexOf(s) !== i);
    return repeated ? `Two of the times start at ${repeated}.` : null;
  }

  const sessions = listSessions(dates, shared, perDate);
  for (const session of sessions) {
    const error = checkTimes(session.slot, ` for ${formatSessionLabel(session)}`);
    if (error) return error;
  }
  const seen = new Set<string>();
  for (const { day, slot } of sessions) {
    const key = `${formatLocalDate(day)} ${slot.start}`;
    if (seen.has(key)) return `Two times on ${formatDateChipLabel(day)} start at ${slot.start}.`;
    seen.add(key);
  }
  return null;
};

/** Message naming the first session without an address, or null */
export const validateSessionPlaces = (sessions: Session[], places: SessionPlaces): string | null => {
  const missing = sessions.find((s) => !(places[s.key] ?? '').trim());
  return missing ? `Please add the address for ${formatSessionLabel(missing)}.` : null;
};

/** Every occurrence starts and ends at the same time of day (so the series time can describe them all) */
const runAtOneTime = (occurrences: Occurrence[]): boolean => {
  const signature = (o: Occurrence) => `${toTimeString(o.start)}-${o.end ? toTimeString(o.end) : ''}`;
  const first = signature(occurrences[0]);
  return occurrences.every((o) => signature(o) === first);
};

export interface BuiltSchedule {
  date: Date;
  endDate?: Date;
  /** The first occurrence's address, set when the occurrences carry their own */
  location?: string;
  recurrence?: RecurrenceRule;
}

/**
 * Turns occurrences into what an Event stores: the first occurrence as `date`/`endDate` and,
 * for more than one, a custom series. Each date keeps its own times (`customEndDates`) when
 * `ownTimes` is set or the dates don't all run at the same time of day. With `ownPlaces` the
 * occurrences' addresses are kept (`customLocations`) unless they are all the same.
 */
export const buildSchedule = (
  occurrences: Occurrence[],
  options: { ownTimes?: boolean; ownPlaces?: boolean } = {}
): BuiltSchedule => {
  const [first] = occurrences;
  if (!first) throw new Error('At least one date is required');
  const location = options.ownPlaces ? { location: first.location ?? '' } : {};
  if (occurrences.length === 1) return { date: first.start, endDate: first.end, ...location };

  const places = options.ownPlaces ? occurrences.map((o) => o.location ?? '') : null;
  const ownTimes = !!options.ownTimes || !runAtOneTime(occurrences);
  return {
    date: first.start,
    endDate: first.end,
    ...location,
    recurrence: {
      type: 'custom',
      customDates: occurrences.map((o) => o.start),
      // A session without an end time stores its start, which reads back as "no end time"
      customEndDates: ownTimes ? occurrences.map((o) => o.end ?? o.start) : undefined,
      customLocations: places && places.some((p) => p !== places[0]) ? places : undefined,
    },
  };
};

type ScheduleSource = Pick<Event, 'date' | 'endDate' | 'recurrence'> & { location?: string };

/**
 * Every occurrence a stored event describes, each with its own times and address, sorted.
 * Older custom series (no per-date times) run every date at the series time.
 */
const storedOccurrences = (source: ScheduleSource): Occurrence[] => {
  const baseStart = new Date(source.date);
  const baseEnd = source.endDate ? new Date(source.endDate) : undefined;
  const location = source.location ?? '';
  const rule = source.recurrence;
  if (rule?.type !== 'custom' || !rule.customDates?.length) {
    return [{ start: baseStart, end: baseEnd, location }];
  }

  const perDate = hasPerDateTimes(rule);
  const places = hasPerSessionPlaces(rule) ? rule.customLocations! : null;
  const durationMs = baseEnd ? baseEnd.getTime() - baseStart.getTime() : undefined;
  const occurrences = rule.customDates
    .map((raw, i): Occurrence => {
      const start = new Date(raw);
      const ownLocation = places?.[i]?.trim() || location;
      if (perDate) {
        const end = new Date(rule.customEndDates![i]);
        return { start, end: end.getTime() > start.getTime() ? end : undefined, location: ownLocation };
      }
      start.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
      const end = durationMs !== undefined && durationMs >= 0 ? new Date(start.getTime() + durationMs) : undefined;
      return { start, end, location: ownLocation };
    })
    .filter((o) => !isNaN(o.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return occurrences.length > 0 ? occurrences : [{ start: baseStart, end: baseEnd, location }];
};

/** Everything the date picker and the address fields edit */
export interface ScheduleState {
  /** Picked days */
  dates: Date[];
  /** Sessions used on every day while `sameTime` is on (at least one) */
  shared: TimeSlot[];
  sameTime: boolean;
  /** Each day's own sessions while `sameTime` is off */
  perDate: PerDateTimes;
  samePlace: boolean;
  /** The address while `samePlace` is on */
  location: string;
  /** Each session's address while `samePlace` is off */
  places: SessionPlaces;
}

/**
 * Reads a stored event back into the form: picked days, their sessions and addresses. Days
 * that all run at the same times read back as "same time every day", and a series whose
 * sessions share one address as "same place".
 */
export const readScheduleFromEvent = (
  source: ScheduleSource,
  /** Suggested length for an event saved without an end time; null leaves the end empty */
  defaultDurationMinutes: number | null = 90
): ScheduleState => {
  const occurrences = storedOccurrences(source);
  // An event saved without an end time gets a suggested one (not a per-date series: there a
  // missing end is deliberate)
  const suggestEnd = defaultDurationMinutes !== null && !source.endDate && !hasPerDateTimes(source.recurrence);

  const days: { day: Date; items: Occurrence[] }[] = [];
  for (const o of occurrences) {
    const last = days[days.length - 1];
    if (last && isSameLocalDay(last.day, o.start)) last.items.push(o);
    else days.push({ day: o.start, items: [o] });
  }

  const perDate: PerDateTimes = {};
  const places: SessionPlaces = {};
  for (const { day, items } of days) {
    perDate[formatLocalDate(day)] = items.map((o, i) => {
      const start = toTimeString(o.start);
      const end = o.end ? toTimeString(o.end) : suggestEnd ? addMinutesToTime(start, defaultDurationMinutes!) : '';
      const slot = makeSlot(start, end, `t${i + 1}`);
      places[sessionKey(day, slot.id)] = o.location ?? '';
      return slot;
    });
  }

  const signature = (slots: TimeSlot[]) => slots.map((s) => `${s.start}-${s.end}`).join('|');
  const firstSlots = perDate[formatLocalDate(days[0].day)];
  const sameTime = Object.values(perDate).every((slots) => signature(slots) === signature(firstSlots));
  const addresses = occurrences.map((o) => o.location ?? '');
  const samePlace = addresses.every((a) => a === addresses[0]);

  return {
    dates: days.map((d) => d.day),
    shared: sameTime ? firstSlots : [firstSlots[0]],
    sameTime,
    perDate: sameTime ? {} : perDate,
    samePlace,
    location: samePlace ? addresses[0] : (source.location || addresses[0]),
    places: samePlace ? {} : places,
  };
};

/** "10:00 – 11:30", or just the start when there is no end time */
export const formatTimeRange = (r: TimeRange): string => (r.end ? `${r.start} – ${r.end}` : r.start);

/**
 * The occurrences a custom-dates series really runs on: every stored session with its own
 * times and address, minus days in `exceptions` (older "delete this occurrence" records) and
 * minus the occurrence starting at `removeAt` (every session of that day when `removeAt` is
 * just the day). Returns the resulting schedule, or null when nothing is left. Other event
 * types are returned unchanged.
 */
export const materializeCustomSchedule = (
  event: Pick<Event, 'id' | 'date' | 'endDate' | 'recurrence'> & { location?: string },
  exceptions: Date[] = [],
  removeAt?: Date
): BuiltSchedule | null => {
  const rule = event.recurrence;
  if (rule?.type !== 'custom' || !rule.customDates?.length) {
    return { date: event.date, endDate: event.endDate, recurrence: rule };
  }
  const skipDays = new Set(exceptions.map((d) => formatLocalDate(new Date(d))));
  let occurrences = storedOccurrences(event).filter((o) => !skipDays.has(formatLocalDate(o.start)));
  if (removeAt) {
    const removed = new Date(removeAt);
    const others = occurrences.filter((o) => o.start.getTime() !== removed.getTime());
    occurrences = others.length < occurrences.length
      ? others
      : occurrences.filter((o) => !isSameLocalDay(o.start, removed));
  }

  if (occurrences.length === 0) return null;
  return buildSchedule(occurrences, { ownTimes: hasPerDateTimes(rule), ownPlaces: hasPerSessionPlaces(rule) });
};
