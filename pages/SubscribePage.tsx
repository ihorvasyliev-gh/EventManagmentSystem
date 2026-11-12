import React, { useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import SubscribeOptions from '../components/SubscribeOptions';

/**
 * The public page to subscribe to the CCP calendar in Outlook, Apple or Google Calendar
 * (/subscribe): anyone with the link, no account. The feed it points at, /api/calendar, has
 * published events only, and only their title, dates, description, venue and category.
 */
const SubscribePage: React.FC = () => {
  useEffect(() => {
    document.title = 'Subscribe to the CCP events calendar · Cork City Partnership';
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shrink-0">
            <img src="/assets/ccp-logo-v2.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
          <p className="min-w-0 flex-1 text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">CCP Events Calendar</p>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">Add CCP events to your calendar</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600 dark:text-slate-300">
          Cork City Partnership's published events, live in Outlook or any calendar app. No account needed.
        </p>
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <SubscribeOptions />
        </div>
      </main>
    </div>
  );
};

export default SubscribePage;
