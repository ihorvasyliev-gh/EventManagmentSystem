import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildOccurrences,
  buildSchedule,
  listSessions,
  validateOccurrenceTimes,
  validateSessionPlaces,
  type BuiltSchedule,
  type ScheduleState,
  type SessionPlaces,
} from '../utils/multiDateUtils';
import { formatLocalDate } from '../utils/date';

/**
 * State of an event's dates, times and places, shared by the submit page and the admin form.
 * Each picked day runs at the shared times or at its own, and every session is held at the
 * shared address or at its own.
 */
export function useEventSchedule(initial: () => ScheduleState) {
  const [schedule, setSchedule] = useState<ScheduleState>(initial);
  const { dates, shared, sameTime, perDate, samePlace, location, places } = schedule;
  const activePerDate = sameTime ? null : perDate;

  const sessions = useMemo(() => listSessions(dates, shared, activePerDate), [dates, shared, activePerDate]);
  const occurrences = useMemo(
    () => buildOccurrences(dates, shared, activePerDate, samePlace ? null : places),
    [dates, shared, activePerDate, samePlace, places]
  );

  const update = useCallback((patch: Partial<ScheduleState>) => setSchedule(prev => ({ ...prev, ...patch })), []);

  /** One address for everything, or one per session (each starting from the shared address) */
  const setSamePlace = useCallback((same: boolean) => {
    setSchedule(prev => {
      const prevSessions = listSessions(prev.dates, prev.shared, prev.sameTime ? null : prev.perDate);
      if (same) {
        // Back to one address: keep the first session's
        const first = prevSessions.map(s => prev.places[s.key]?.trim()).find(Boolean);
        return { ...prev, samePlace: true, location: first || prev.location };
      }
      const seeded: SessionPlaces = {};
      prevSessions.forEach(s => { seeded[s.key] = prev.places[s.key] ?? prev.location; });
      return { ...prev, samePlace: false, places: seeded };
    });
  }, []);

  // A session added while each has its own address starts with the address of the one before it
  useEffect(() => {
    if (samePlace || sessions.every(s => s.key in places)) return;
    setSchedule(prev => {
      const next = { ...prev.places };
      let previous = prev.location;
      for (const s of sessions) {
        if (!(s.key in next)) next[s.key] = previous;
        previous = next[s.key] || previous;
      }
      return { ...prev, places: next };
    });
  }, [sessions, samePlace, places]);

  const validateTimes = useCallback(
    (): string | null => validateOccurrenceTimes(dates, shared, activePerDate),
    [dates, shared, activePerDate]
  );

  /** Missing per-session address, or null (the shared address is checked by the form) */
  const validatePlaces = useCallback(
    (): string | null => (samePlace ? null : validateSessionPlaces(sessions, places)),
    [samePlace, sessions, places]
  );

  /** What the event stores; `location` is the shared address or the first session's */
  const build = useCallback((): BuiltSchedule & { location: string } => {
    const built = buildSchedule(occurrences, { ownTimes: !sameTime, ownPlaces: !samePlace });
    return { ...built, location: built.location ?? location.trim() };
  }, [occurrences, sameTime, samePlace, location]);

  /** Everything that is saved, for "unsaved changes" checks */
  const snapshot = useMemo(() => JSON.stringify([
    dates.map(d => formatLocalDate(d)).sort(),
    sameTime,
    sessions.map(s => [s.key.split('#')[0], s.slot.start, s.slot.end]),
    samePlace,
    samePlace ? location : sessions.map(s => places[s.key] ?? ''),
  ]), [dates, sameTime, sessions, samePlace, location, places]);

  return {
    schedule,
    update,
    reset: setSchedule,
    setSamePlace,
    activePerDate,
    sessions,
    occurrences,
    validateTimes,
    validatePlaces,
    build,
    snapshot,
  };
}

export type EventScheduleControls = ReturnType<typeof useEventSchedule>;
