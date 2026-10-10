import React from 'react';
import { Inbox, ArrowRight } from 'lucide-react';
import { type Event } from '../types';

/** Admins: submissions waiting for review, above the calendar */
const SubmissionsBanner: React.FC<{ submissions: Event[]; onOpen: () => void }> = ({ submissions, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="group mb-4 w-full flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
  >
    <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
      <Inbox className="w-5 h-5" />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-amber-900 dark:text-amber-100">
        {submissions.length} {submissions.length === 1 ? 'submission is' : 'submissions are'} waiting for review
      </span>
      <span className="block text-xs text-amber-800 dark:text-amber-200/80 truncate">
        {submissions.slice(0, 3).map((e) => e.title).join(' · ')}
      </span>
    </span>
    <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
      Review <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
    </span>
    <ArrowRight className="sm:hidden shrink-0 w-5 h-5 text-amber-700 dark:text-amber-300" />
  </button>
);

export default SubmissionsBanner;
