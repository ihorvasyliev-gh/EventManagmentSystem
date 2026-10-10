import React from 'react';
import { ArrowLeft, ChevronDown, Info, RotateCcw, X } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';

/** Sticky bar: back to the calendar (or the login page), theme, logo */
export const SubmitTopBar: React.FC<{ onBack?: () => void; backLabel: string }> = ({ onBack, backLabel }) => (
  <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
    <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 h-10 px-2.5 -ml-1 rounded-xl text-sm font-medium text-slate-600 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-300 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden min-[340px]:inline">{backLabel}</span>
        </button>
      )}
      <ThemeToggle className="ml-auto" />
      <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
        <img src="/assets/ccp-logo-v2.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
      </span>
    </div>
  </header>
);

/** What the form is for; staff also get the CEO's guidelines on what to send in */
export const SubmitIntro: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => (
  <div className="mb-5 sm:mb-6">
    <p className="eyebrow max-w-md">
      <span>{isAdmin ? 'Admin · publishes immediately' : 'Staff event form · no login needed'}</span>
    </p>
    <h1 className="mt-2 text-2xl sm:text-[2.375rem] sm:leading-tight font-medium text-slate-900 dark:text-white">
      {isAdmin ? 'Create a new event' : 'Submit an upcoming event'}
    </h1>
    <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
      {isAdmin
        ? 'It goes straight onto the calendar and into the next Upcoming Events Digest.'
        : 'Any CCP, co-hosted, or CCP-funded event you’d be happy for colleagues, Board members, or City Hall to attend or share — fill in the four short steps below (takes ~2 mins).'}
    </p>

    {!isAdmin && (
      <details className="mt-3 group rounded-leaf-sm border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50 p-3.5 sm:p-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 transition-colors">
        <summary className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer list-none select-none">
          <Info className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <span>What can be included? Guidelines from CEO</span>
          <ChevronDown className="w-4 h-4 ml-auto text-slate-400 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <strong className="text-slate-800 dark:text-slate-200">Eligible events:</strong> Any event held exclusively by CCP, co-hosted with another organisation, or held by a third party that was funded by CCP.
          </p>
          <p>
            <strong className="text-slate-800 dark:text-slate-200">Who it’s for:</strong> Any event that you would be happy for a colleague, a Board member, or staff member from City Hall to attend — e.g. award ceremonies, Culture Night, information talks, family fun days, Christmas markets, visits by the Lord Mayor, etc.
          </p>
          <p>
            <strong className="text-slate-800 dark:text-slate-200">Community & local activities:</strong> Things like coffee mornings — while Board members or City Hall may not attend personally, colleagues might wish to notify other staff or their community that it is taking place in their area.
          </p>
        </div>
      </details>
    )}
  </div>
);

/** "We restored the event you hadn't sent yet", with Start fresh */
export const RestoredDraftNotice: React.FC<{ onStartFresh: () => void; onDismiss: () => void }> = ({ onStartFresh, onDismiss }) => (
  <div className="mb-5 flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-sm text-sky-900 dark:text-sky-100" role="status">
    <RotateCcw className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
    <span className="flex-1">We restored the event you hadn’t sent yet.</span>
    <button type="button" onClick={onStartFresh} className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline">
      Start fresh
    </button>
    <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 p-1 -m-1 rounded-lg text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50">
      <X className="w-4 h-4" />
    </button>
  </div>
);
