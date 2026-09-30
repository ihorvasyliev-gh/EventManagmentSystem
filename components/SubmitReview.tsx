import React from 'react';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock, ImageIcon, Info, Mail, MapPin, Pencil, Send, User, AlertCircle
} from 'lucide-react';
import { getCategoryDotColor } from './WeekView';
import ThemeToggle from './ThemeToggle';

/** What the submitter entered, ready to show back to them */
export interface SubmissionSummary {
  title: string;
  category: string;
  /** One entry per day, with that day's times (and places when they differ) */
  days: Array<{ key: string; date: string; sessions: Array<{ key: string; time: string; place: string }> }>;
  /** Shared venue ('' when each date and time has its own) */
  location: string;
  description: string;
  posterUrl: string | null;
  name: string;
  email: string;
}

export type ReviewField = 'title' | 'dates' | 'location' | 'description' | 'poster' | 'name';

export interface ReviewConflict {
  label: string;
  titles: string[];
}

const mapsUrl = (place: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

const EditButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 -mr-1 rounded-lg text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30 transition-colors"
  >
    <Pencil className="w-3.5 h-3.5" /> Edit
  </button>
);

const Block: React.FC<{ icon: React.ReactNode; label: string; onEdit: () => void; editLabel: string; children: React.ReactNode }> = ({
  icon, label, onEdit, editLabel, children
}) => (
  <div className="flex items-start gap-3 py-4 border-t border-slate-100 dark:border-slate-700/70 first:border-t-0">
    <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 flex items-center justify-center">
      {icon}
    </span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 min-h-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <EditButton onClick={onEdit} label={editLabel} />
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  </div>
);

/** The dates with their times (and places), grouped by day */
export const ScheduleList: React.FC<{ days: SubmissionSummary['days']; compact?: boolean }> = ({ days, compact }) => (
  <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
    {days.map((day) => (
      <li key={day.key} className="flex flex-col min-[420px]:flex-row min-[420px]:items-baseline gap-x-3 gap-y-0.5">
        <span className="font-semibold text-slate-900 dark:text-white min-[420px]:w-28 shrink-0">{day.date}</span>
        <span className="flex-1 min-w-0 space-y-0.5">
          {day.sessions.map((s) => (
            <span key={s.key} className="flex flex-wrap items-baseline gap-x-2">
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400 self-center" /> {s.time}
              </span>
              {s.place && (
                <a
                  href={mapsUrl(s.place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 hover:underline break-words min-w-0"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 self-center" /> {s.place}
                </a>
              )}
            </span>
          ))}
        </span>
      </li>
    ))}
  </ul>
);

interface SubmitReviewProps {
  summary: SubmissionSummary;
  conflicts: ReviewConflict[];
  isSubmitting: boolean;
  submitError: string | null;
  onEdit: (field?: ReviewField) => void;
  onSend: () => void;
}

/** Shown after "Submit": the event as it will look, to check before it is sent */
const SubmitReview: React.FC<SubmitReviewProps> = ({ summary, conflicts, isSubmitting, submitError, onEdit, onSend }) => {
  const dateCount = summary.days.length;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onEdit()}
            className="inline-flex items-center gap-1.5 h-10 px-2.5 -ml-1 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" /> Back to form
          </button>
          <ThemeToggle className="ml-auto" />
          <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <img src="/assets/ccp-logo.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 sm:px-6 py-5 sm:py-8 pb-36 sm:pb-12 animate-fade-in">
        {/* Progress */}
        <ol className="flex items-center gap-2 text-xs font-semibold mb-5" aria-label="Progress">
          <li className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Details
          </li>
          <li className="h-px w-6 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
          <li className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-300" aria-current="step">
            <span className="w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center">2</span> Check
          </li>
          <li className="h-px w-6 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
          <li className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 text-[10px] flex items-center justify-center">3</span> Send
          </li>
        </ol>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Check your event</h1>
        <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-300">
          This is how it will appear on the calendar. Tap <span className="font-semibold">Edit</span> next to anything that needs changing.
        </p>

        {conflicts.length > 0 && (
          <div className="mt-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-4 flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold block">Something else is on at the same time</span>
              <ul className="mt-1 space-y-0.5 text-xs sm:text-sm">
                {conflicts.map((c) => (
                  <li key={c.label}>
                    <span className="font-semibold">{c.label}:</span> {c.titles.slice(0, 2).map((t) => `“${t}”`).join(', ')}
                    {c.titles.length > 2 && ` +${c.titles.length - 2} more`}
                  </li>
                ))}
              </ul>
              <span className="mt-1 block text-xs text-amber-800/80 dark:text-amber-200/80">You can still send it — this is just a heads-up.</span>
            </div>
            <button type="button" onClick={() => onEdit('dates')} className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline">
              Change dates
            </button>
          </div>
        )}

        {/* The event card */}
        <article className="mt-5 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {summary.posterUrl ? (
            <div className="relative bg-slate-100 dark:bg-slate-900">
              <img src={summary.posterUrl} alt="Poster" className="w-full max-h-80 object-contain" />
              <button
                type="button"
                onClick={() => onEdit('poster')}
                className="absolute top-3 right-3 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white"
              >
                <Pencil className="w-3.5 h-3.5" /> Change poster
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onEdit('poster')}
              className="w-full h-24 flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-900/40 border-b border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 transition-colors"
            >
              <ImageIcon className="w-5 h-5" /> No poster — add one (optional)
            </button>
          )}

          <div className="px-4 sm:px-6 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200">
                  <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(summary.category)}`} /> {summary.category}
                </span>
                <h2 className="mt-2 text-xl sm:text-2xl font-bold leading-tight text-slate-900 dark:text-white break-words">{summary.title}</h2>
              </div>
              <EditButton onClick={() => onEdit('title')} label="Edit name and category" />
            </div>
          </div>

          <div className="px-4 sm:px-6 pb-2 mt-2">
            <Block
              icon={<CalendarDays className="w-4 h-4" />}
              label={dateCount === 1 ? 'Date & time' : `${dateCount} dates`}
              onEdit={() => onEdit('dates')}
              editLabel="Edit dates and times"
            >
              <ScheduleList days={summary.days} />
            </Block>

            {summary.location && (
              <Block icon={<MapPin className="w-4 h-4" />} label="Venue" onEdit={() => onEdit('location')} editLabel="Edit venue">
                <a href={mapsUrl(summary.location)} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 dark:text-sky-400 hover:underline break-words">
                  {summary.location}
                </a>
              </Block>
            )}

            <Block icon={<Info className="w-4 h-4" />} label="About" onEdit={() => onEdit('description')} editLabel="Edit description">
              <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300 break-words">{summary.description}</p>
            </Block>

            <Block icon={<User className="w-4 h-4" />} label="Contact" onEdit={() => onEdit('name')} editLabel="Edit contact details">
              <p className="font-medium">{summary.name}</p>
              <p className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 break-all">
                <Mail className="w-3.5 h-3.5 shrink-0" /> {summary.email}
              </p>
            </Block>
          </div>
        </article>

        {submitError && (
          <div className="mt-5 flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {submitError}
          </div>
        )}

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center justify-between gap-3 mt-6">
          <button
            type="button"
            onClick={() => onEdit()}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[15px] hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
          <SendButton isSubmitting={isSubmitting} onSend={onSend} />
        </div>
      </main>

      {/* Phone: actions within thumb reach */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
        <button
          type="button"
          onClick={() => onEdit()}
          className="inline-flex items-center justify-center gap-1.5 h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-[15px]"
        >
          <Pencil className="w-4 h-4" /> Edit
        </button>
        <SendButton isSubmitting={isSubmitting} onSend={onSend} full />
      </div>
    </div>
  );
};

const SendButton: React.FC<{ isSubmitting: boolean; onSend: () => void; full?: boolean }> = ({ isSubmitting, onSend, full }) => (
  <button
    type="button"
    onClick={onSend}
    disabled={isSubmitting}
    className={`${full ? 'flex-1' : ''} inline-flex items-center justify-center gap-2 h-12 px-6 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-md shadow-brand-600/20 transition-colors text-[15px] disabled:opacity-60`}
  >
    {isSubmitting ? (
      <>
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…
      </>
    ) : (
      <>
        <Send className="w-4 h-4" /> Send for review
      </>
    )}
  </button>
);

export default SubmitReview;
