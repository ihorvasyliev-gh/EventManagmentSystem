import React from 'react';
import { BellRing, FileText, Mail, X } from 'lucide-react';
import type { RoutineTask } from '../utils/weeklyRoutine';

interface WeeklyRoutineBannerProps {
  task: RoutineTask;
  /** Friday only: published events in the next 2 weeks */
  eventCount?: number;
  busy?: boolean;
  onSend: () => void;
  onDismiss: () => void;
}

/**
 * Admins: a single, unmistakable action prompt above the calendar on routine days —
 * green on Wednesdays for the staff reminder, raspberry on Fridays for the 2-week digest.
 */
const WeeklyRoutineBanner: React.FC<WeeklyRoutineBannerProps> = ({
  task,
  eventCount = 0,
  busy = false,
  onSend,
  onDismiss
}) => {
  const isReminder = task === 'reminder';

  const eventsSummary =
    eventCount === 0
      ? 'No published events in the next 2 weeks'
      : `${eventCount === 1 ? '1 event' : `${eventCount} events`} over the next 2 weeks · Executive cards with flyers`;

  return (
    <section
      data-routine-banner=""
      aria-label={isReminder ? 'Wednesday reminder' : 'Friday digest'}
      className={`mb-3 rounded-xl border border-l-4 px-3.5 py-3 shadow-xs transition-colors ${
        isReminder
          ? 'bg-ccp-green-50 dark:bg-ccp-green-950/60 border-ccp-green-300 dark:border-ccp-green-700/70 border-l-ccp-green-600 dark:border-l-ccp-green-500'
          : 'bg-brand-50 dark:bg-brand-950/50 border-brand-300 dark:border-brand-700/70 border-l-brand-600 dark:border-l-brand-500'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <span
            aria-hidden="true"
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              isReminder
                ? 'bg-ccp-green-600/15 dark:bg-ccp-green-500/20 text-ccp-green-700 dark:text-ccp-green-300'
                : 'bg-brand-600/15 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300'
            }`}
          >
            {isReminder ? <BellRing className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.14em] leading-tight ${
                isReminder
                  ? 'text-ccp-green-700 dark:text-ccp-green-300'
                  : 'text-brand-700 dark:text-brand-300'
              }`}
            >
              {isReminder ? 'Wednesday · Staff reminder' : 'Friday · Upcoming Events Digest'}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
              {isReminder ? 'Time to remind staff to send in their events' : 'Time to send the 2-week digest'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {isReminder ? 'Opens a ready-to-paste email to all staff before Friday’s digest' : eventsSummary}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            aria-label="Hide for today"
            title="Hide for today"
            className="sm:hidden inline-flex items-center justify-center w-8 h-8 -mr-1 -mt-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-black/5 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onSend}
            disabled={busy}
            className={`cta w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 h-10 rounded text-white shadow-sm transition-colors disabled:opacity-60 ${
              isReminder
                ? 'bg-ccp-green-600 hover:bg-ccp-green-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {busy ? (
              <span className="w-4 h-4 shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Mail className="w-4 h-4 shrink-0" />
            )}
            <span>
              {busy ? 'Preparing…' : isReminder ? 'Send reminder' : 'Email 2-week digest'}
            </span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            aria-label="Hide for today"
            title="Hide for today"
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-black/5 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default WeeklyRoutineBanner;
