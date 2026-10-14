import { useCallback, useEffect, useState } from 'react';
import { countStaffEditsSince } from '../services/historyService';

const SEEN_KEY = 'ccp_change_log_seen';

const writeSeen = (date: Date) => {
  try {
    localStorage.setItem(SEEN_KEY, date.toISOString());
  } catch {
    // Storage unavailable: the count starts again from this visit
  }
};

/** When this device last opened the change log (the first visit counts from now) */
const readSeen = (): Date => {
  try {
    const saved = new Date(localStorage.getItem(SEEN_KEY) || '');
    if (!isNaN(saved.getTime())) return saved;
  } catch {
    // Storage unavailable
  }
  const now = new Date();
  writeSeen(now);
  return now;
};

/**
 * Admins: how many changes staff made to their events since the change log was last opened on
 * this device. Counted again a moment after `refreshKey` changes (the events list, which live
 * updates replace when someone saves an event).
 */
export const useChangeLogBadge = (enabled: boolean, refreshKey: unknown) => {
  const [seen, setSeen] = useState<Date | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (enabled && !seen) setSeen(readSeen());
  }, [enabled, seen]);

  useEffect(() => {
    if (!enabled || !seen) return;
    let active = true;
    const timer = setTimeout(() => {
      void countStaffEditsSince(seen).then((n) => {
        if (active) setCount(n);
      });
    }, 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, seen, refreshKey]);

  /** The log was opened: everything up to now has been seen. Returns when it was last opened before. */
  const markSeen = useCallback((): Date => {
    const previous = seen ?? readSeen();
    const now = new Date();
    writeSeen(now);
    setSeen(now);
    setCount(0);
    return previous;
  }, [seen]);

  return { count: enabled ? count : 0, markSeen };
};
