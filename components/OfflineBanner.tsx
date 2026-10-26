import React from 'react';
import { WifiOff } from 'lucide-react';
import { APP_LOCALE, formatClock, isSameDay } from '../utils/date';

/** "at 14:32" today, "on Fri 23 Oct at 14:32" before */
const syncedWhen = (at: Date): string =>
  isSameDay(at, new Date())
    ? `at ${formatClock(at)}`
    : `on ${at.toLocaleDateString(APP_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })} at ${formatClock(at)}`;

/**
 * No connection: the calendar still shows what this device saved, in one slim line above it that
 * says so, and how fresh it is. It goes away (and the events reload) when the connection is back.
 */
const OfflineBanner: React.FC<{ lastSyncedAt: Date | null }> = ({ lastSyncedAt }) => (
  <div
    role="status"
    className="mb-3 flex items-start sm:items-center gap-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
  >
    <WifiOff className="shrink-0 mt-0.5 sm:mt-0 w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
    <span className="min-w-0">
      <span className="font-semibold">You’re offline.</span>{' '}
      Showing the events saved on this device{lastSyncedAt && <>, last updated <span className="whitespace-nowrap">{syncedWhen(lastSyncedAt)}</span></>}.
      {' '}New events and changes need a connection.
    </span>
  </div>
);

export default OfflineBanner;
