import React from 'react';
import { Inbox, ArrowRight } from 'lucide-react';
import { type Event } from '../types';

/** Admins: submissions waiting for review, in one slim line above the calendar */
const SubmissionsBanner: React.FC<{ submissions: Event[]; onOpen: () => void }> = ({ submissions, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group mb-3 w-full flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
  >
    <Inbox className="shrink-0 w-4 h-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
    <span className="flex-1 min-w-0 flex items-baseline gap-2 text-sm">
      <span className="shrink-0 max-w-full truncate font-semibold text-amber-900 dark:text-amber-100">
        {submissions.length} {submissions.length === 1 ? 'submission is' : 'submissions are'} waiting for review
      </span>
      <span className="hidden md:inline min-w-0 truncate text-xs text-amber-800 dark:text-amber-200/80">
        {submissions.slice(0, 3).map((e) => e.title).join(' · ')}
      </span>
    </span>
    <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
      <span className="hidden sm:inline">Review</span>
      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
    </span>
  </button>
);

export default SubmissionsBanner;
