import React from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import type { DigestChange } from '../hooks/useSentDigest';
import { sentOn } from '../utils/sentDigest';

/** "1 event changed since the digest went out on Fri 23 Oct", its day kept on one line */
export const DigestChangeLine: React.FC<{ change: DigestChange }> = ({ change }) => (
  <>
    {change.titles.length === 1 ? '1 event' : `${change.titles.length} events`} changed since the digest went out{' '}
    <span className="whitespace-nowrap">{sentOn(change.issued)}</span>
  </>
);

/**
 * Admins: events in the digest that went out read differently now, in one slim line above the
 * calendar (like submissions waiting for review). It opens the digest, which updates it.
 */
const DigestChangedBanner: React.FC<{ change: DigestChange; onOpen: () => void }> = ({ change, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group mb-3 w-full flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
  >
    <RefreshCw className="shrink-0 w-4 h-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
    <span className="flex-1 min-w-0 flex items-baseline gap-2 text-sm">
      <span className="min-w-0 font-semibold text-amber-900 dark:text-amber-100"><DigestChangeLine change={change} /></span>
      <span className="hidden md:inline min-w-0 truncate text-xs text-amber-800 dark:text-amber-200/80">
        {change.titles.slice(0, 3).join(' · ')}
      </span>
    </span>
    <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
      <span className="hidden sm:inline">Update digest</span>
      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
    </span>
  </button>
);

export default DigestChangedBanner;
