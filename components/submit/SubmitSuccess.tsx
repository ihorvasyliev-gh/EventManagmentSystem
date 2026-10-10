import React from 'react';
import { CheckCircle2, MapPin } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { getCategoryDotColor } from '../WeekView';
import { ScheduleList, type SubmissionSummary } from '../SubmitReview';

interface SubmitSuccessProps {
  summary: SubmissionSummary;
  /** Admins publish straight away; staff wait for review */
  isAdmin: boolean;
  signedIn: boolean;
  onSubmitAnother: () => void;
  onBack?: () => void;
}

/** After sending: what was sent and what happens next */
const SubmitSuccess: React.FC<SubmitSuccessProps> = ({ summary, isAdmin, signedIn, onSubmitAnother, onBack }) => {
  const steps: Array<[string, string, 'done' | 'current' | 'next']> = isAdmin
    ? [['Published', 'Live on the calendar now', 'done'], ['Upcoming Events Digest', 'Included in the next issue', 'next']]
    : [
        ['Sent', 'We have your event', 'done'],
        ['Review', 'Elizabeth checks the details', 'current'],
        ['On the calendar', "And in Friday's Upcoming Events Digest", 'next']
      ];
  return (
    <div className="relative min-h-[100dvh] bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-3 py-8 sm:p-6">
      <ThemeToggle className="absolute top-3 right-3 pt-[env(safe-area-inset-top)] box-content" />
      <div className="max-w-lg w-full animate-scale-in">
        <div className="text-center mb-6">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <span className="absolute inset-0 rounded-full bg-ccp-green-400/30 animate-ping [animation-iteration-count:2]" aria-hidden="true" />
            <span className="relative w-16 h-16 bg-ccp-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-ccp-green-500/30">
              <CheckCircle2 className="w-9 h-9" />
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium text-slate-900 dark:text-white">
            {isAdmin ? 'Event published' : 'Thank you — event sent!'}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            {isAdmin
              ? 'It is live on the calendar and will appear in the next Upcoming Events Digest.'
              : 'It will appear on the calendar once it has been reviewed.'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-leaf shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex gap-4 p-4 sm:p-5">
            {summary.posterUrl && (
              <img src={summary.posterUrl} alt="" className="w-20 h-24 sm:w-24 sm:h-28 shrink-0 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
            )}
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(summary.category)}`} /> {summary.category}
              </span>
              <p className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-white break-words">{summary.title}</p>
              {summary.location && (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /> <span className="break-words">{summary.location}</span>
                </p>
              )}
              {!isAdmin && (
                <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Waiting for review
                </p>
              )}
            </div>
          </div>
          <div className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-700 text-sm">
            <ScheduleList days={summary.days} compact />
          </div>
          <ol className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 space-y-3">
            {steps.map(([label, hint, state], i) => (
              <li key={label} className="flex items-start gap-3">
                <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  state === 'done' ? 'bg-ccp-green-500 text-white'
                    : state === 'current' ? 'bg-amber-400 text-amber-950'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
          <button
            type="button"
            onClick={onSubmitAnother}
            className="cta flex-1 h-12 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded shadow-sm transition-colors"
          >
            {isAdmin ? 'Create another event' : 'Submit another event'}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="cta flex-1 h-12 px-4 bg-white hover:bg-brand-50 dark:bg-transparent dark:hover:bg-brand-950/40 border border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-300 rounded transition-colors"
            >
              {signedIn ? 'Back to calendar' : 'Go to staff login'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmitSuccess;
