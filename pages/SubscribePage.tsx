import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Clock, Link2, Check, RefreshCw, ShieldCheck, BellOff } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import SubscribeOptions, { categoryQuery, copyText, knownCategories, subscribePageUrlFor } from '../components/SubscribeOptions';
import { getCategoryDotColor } from '../components/WeekView';

interface PreviewEvent { title: string; start: string; end: string | null; location: string | null; category: string | null }

const DAY = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "Tue 18 Nov · 10:00–12:00", or across days "Tue 18 Nov 10:00 – Wed 19 Nov 16:00" */
const whenOf = (ev: PreviewEvent): string => {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : null;
  if (!end || end <= start) return `${DAY.format(start)} · ${TIME.format(start)}`;
  if (DAY_KEY.format(start) === DAY_KEY.format(end)) return `${DAY.format(start)} · ${TIME.format(start)}–${TIME.format(end)}`;
  return `${DAY.format(start)} ${TIME.format(start)} – ${DAY.format(end)} ${TIME.format(end)}`;
};

const categoriesInAddress = (): string[] =>
  knownCategories(new URLSearchParams(window.location.search).getAll('category').flatMap((v) => v.split(',')));

/**
 * The public page to subscribe to the CCP calendar in Outlook, Apple or Google Calendar
 * (/subscribe, or /subscribe?category=… with categories ticked): anyone with the link, no
 * account. The feed it points at, /api/calendar, has published events only, and only their
 * title, dates, description, venue and category.
 */
const SubscribePage: React.FC = () => {
  const [initial] = useState(categoriesInAddress);
  const [categories, setCategories] = useState<string[]>(initial);
  const [upcoming, setUpcoming] = useState<PreviewEvent[] | null | undefined>(undefined);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    document.title = 'Add CCP events to your calendar · Cork City Partnership';
  }, []);

  // The address keeps the ticked categories, so the page can be shared as it is
  const onCategoriesChange = useCallback((next: string[]) => {
    setCategories(next);
    window.history.replaceState(null, '', `/subscribe${categoryQuery(next)}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sep = categories.length > 0 ? '&' : '?';
    fetch(`/api/calendar${categoryQuery(categories)}${sep}preview=4`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { events?: PreviewEvent[] } | null) => !cancelled && setUpcoming(Array.isArray(data?.events) ? data!.events : null))
      .catch(() => !cancelled && setUpcoming(null));
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const copyPageLink = async () => {
    await copyText(subscribePageUrlFor(categories));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

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

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">Add CCP events to your calendar</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Cork City Partnership's events in your own Outlook, Google or Apple calendar. No account needed.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2"><RefreshCw className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />Updates by itself: new events, changes and cancellations</li>
            <li className="flex items-start gap-2"><BellOff className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />Shows as free time, so it doesn't block your day</li>
            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />Read-only, and remove it whenever you like</li>
          </ul>
        </div>

        <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <SubscribeOptions initialCategories={initial} onCategoriesChange={onCategoriesChange} />
        </section>

        <section aria-labelledby="coming-up" className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <h2 id="coming-up" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Coming up in this calendar</h2>
          {upcoming === undefined ? (
            <div className="mt-3 space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/60 animate-pulse" />)}
            </div>
          ) : upcoming === null ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Couldn't load the next events just now. Subscribing still works.</p>
          ) : upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing coming up in {categories.length > 0 ? 'these categories' : 'the calendar'} yet. New events will appear in your calendar once they're added.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
              {upcoming.map((ev, i) => (
                <li key={`${ev.start}-${i}`} className="py-2.5 flex gap-3">
                  <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${getCategoryDotColor(ev.category ?? 'Other')}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900 dark:text-white">{ev.title}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{whenOf(ev)}</span>
                      {ev.location && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{ev.location}</span></span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex-1">Sharing this with someone? The link keeps the categories you ticked.</span>
          <button
            type="button"
            onClick={copyPageLink}
            className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {linkCopied ? <Check className="h-4 w-4 text-ccp-green-500" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {linkCopied ? 'Link copied' : 'Copy link to this page'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500">&copy; {new Date().getFullYear()} Cork City Partnership</p>
      </main>
    </div>
  );
};

export default SubscribePage;
