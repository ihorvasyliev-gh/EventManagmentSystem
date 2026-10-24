import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Event } from '../types';
import { fetchSentDigest, type SentDigest } from '../services/digestService';
import { issuedDay, sentDigestChanges, type SentDigestState } from '../utils/sentDigest';

/** The digest that went out has events that read differently now: its day and their titles */
export interface DigestChange {
  issued: Date;
  titles: string[];
}

/**
 * Admins: whether the digest that went out (while it can still be updated) has events that read
 * differently on the calendar now, so the inbox and the banner above the calendar can point to
 * the digest dialog's Update digest. Compared again whenever the events change, once they have
 * loaded (`ready`: an empty calendar would read as every event gone); the digest itself is looked
 * up again on `refresh` (after the digest dialog closes: it may have shared or updated it).
 */
export const useSentDigest = (enabled: boolean, ready: boolean, events: Event[], recurrenceExceptions?: Map<string, Date[]>) => {
  const [sent, setSent] = useState<SentDigestState<SentDigest> | null>(null);
  const [lookups, setLookups] = useState(0);
  const refresh = useCallback(() => setLookups((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setSent(null);
      return;
    }
    let active = true;
    fetchSentDigest()
      .then((found) => active && setSent(found))
      // Nothing to point to: the dialog still offers the update when opened
      .catch(() => active && setSent(null));
    return () => {
      active = false;
    };
  }, [enabled, lookups]);

  const change = useMemo((): DigestChange | null => {
    if (!ready) return null;
    const changes = sentDigestChanges(sent, events, recurrenceExceptions);
    return sent && changes?.changed?.length ? { issued: issuedDay(sent.digest.issued), titles: changes.changed } : null;
  }, [ready, sent, events, recurrenceExceptions]);

  return { change, refresh };
};
