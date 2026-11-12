import React, { useCallback, useEffect, useState } from 'react';
import { BellOff, CalendarCheck2, Check, Clock, Link2, MapPin, RefreshCw, Share2, ShieldCheck, type LucideIcon } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import SubscribeOptions, { SubscribeHelp, categoryQuery, copyText, knownCategories, subscribePageUrl } from '../components/SubscribeOptions';
import { getCategoryDotColor } from '../components/WeekView';
import { shortCategoryLabel } from '../constants/categories';

interface PreviewEvent { title: string; start: string; end: string | null; location: string | null; category: string | null }

const PAGE_TITLE = 'Add CCP events to your calendar';
/** How many of the next events the page shows */
const PREVIEW_COUNT = 5;

const dublin = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', ...options });
const WEEKDAY = dublin({ weekday: 'short' });
const DAY_NUMBER = dublin({ day: 'numeric' });
const MONTH = dublin({ month: 'short' });
const DAY = dublin({ weekday: 'short', day: 'numeric', month: 'short' });
const TIME = dublin({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "10:00–12:00" beside the day's tile, or across days "10:00 – Wed 19 Nov, 16:00" */
const timesOf = (ev: PreviewEvent): string => {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : null;
  if (!end || end <= start) return TIME.format(start);
  if (DAY_KEY.format(start) === DAY_KEY.format(end)) return `${TIME.format(start)}–${TIME.format(end)}`;
  return `${TIME.format(start)} – ${DAY.format(end)}, ${TIME.format(end)}`;
};

const categoriesInAddress = (): string[] =>
  knownCategories(new URLSearchParams(window.location.search).getAll('category').flatMap((v) => v.split(',')));

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: RefreshCw, title: 'Updates by itself', text: 'New events, changes and cancellations' },
  { icon: BellOff, title: 'Shows as free time', text: 'So it doesn’t block your day' },
  { icon: ShieldCheck, title: 'Read-only', text: 'Remove it whenever you like' },
];

const cardClass = 'bg-white dark:bg-slate-800 rounded-leaf-sm sm:rounded-leaf shadow-sm border border-slate-200 dark:border-slate-700';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-400 hover:text-brand-700 dark:hover:border-brand-500 dark:hover:text-brand-300 transition-colors';

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
  // Phones and tablets (and some computers) can hand the link to Messages, Mail, WhatsApp…
  const [canShare] = useState(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  useEffect(() => {
    document.title = `${PAGE_TITLE} · Cork City Partnership`;
  }, []);

  // The address keeps the ticked categories, so the page can be shared as it is
  const onCategoriesChange = useCallback((next: string[]) => {
    setCategories(next);
    window.history.replaceState(null, '', `/subscribe${categoryQuery(next)}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sep = categories.length > 0 ? '&' : '?';
    fetch(`/api/calendar${categoryQuery(categories)}${sep}preview=${PREVIEW_COUNT}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { events?: PreviewEvent[] } | null) => !cancelled && setUpcoming(Array.isArray(data?.events) ? data!.events : null))
      .catch(() => !cancelled && setUpcoming(null));
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const copyPageLink = async () => {
    await copyText(subscribePageUrl(categories));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const sharePage = () => {
    // Closing the share sheet without picking anything is not an error to show
    void navigator.share({ title: PAGE_TITLE, text: 'Cork City Partnership’s events in your own calendar.', url: subscribePageUrl(categories) }).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs shrink-0">
            <img src="/assets/ccp-logo-v2.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
          <p className="min-w-0 flex-1 text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">CCP Events Calendar</p>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {/* Flat raspberry with the green top bar, like the sign-in page's panel and the site's "Our Mission" box */}
        <div className="relative overflow-hidden rounded-leaf-sm sm:rounded-leaf bg-brand-600 text-white border-t-[6px] border-ccp-green-500 px-5 py-6 sm:px-9 sm:py-9 shadow-sm">
          <CalendarCheck2 className="pointer-events-none absolute -right-8 -bottom-12 h-56 w-56 text-white/10 hidden sm:block" strokeWidth={1} aria-hidden="true" />
          <div className="relative">
            <p className="eyebrow !text-white max-w-md"><span>Cork City Partnership · no account needed</span></p>
            <h1 className="mt-3 text-[1.75rem] leading-[1.15] sm:text-[2.5rem] sm:leading-[1.1] font-semibold tracking-[0.01em]">{PAGE_TITLE}</h1>
            <p className="mt-2.5 text-[15px] sm:text-lg text-brand-50 max-w-2xl">
              Every CCP event in your own Outlook, Google or Apple calendar, beside your own appointments.
            </p>
            <ul className="mt-5 sm:mt-7 grid gap-3 sm:grid-cols-3 sm:gap-5 max-w-3xl">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="shrink-0 w-9 h-9 rounded-leaf-xs bg-white/15 flex items-center justify-center">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-snug">
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-brand-50">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* A computer: the steps on the left, what the calendar holds beside them. A phone: the steps, what it holds, the help */}
        <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-x-6 lg:gap-y-5 lg:items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <SubscribeOptions initialCategories={initial} onCategoriesChange={onCategoriesChange} />
          </div>

          <div className="space-y-4 sm:space-y-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[5.25rem]">
            <section aria-labelledby="coming-up" className={`${cardClass} p-4 sm:p-5`}>
              <p className="eyebrow"><span>{categories.length > 0 ? `Only ${categories.map((c) => shortCategoryLabel(c)).join(', ')}` : 'All events'}</span></p>
              <h2 id="coming-up" className="mt-2 text-lg font-medium text-slate-900 dark:text-white">Coming up in this calendar</h2>
              {upcoming === undefined ? (
                <div className="mt-3 space-y-3" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-12 h-14 rounded-leaf-xs bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3.5 w-4/5 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
                        <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : upcoming === null ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Couldn't load the next events just now. Subscribing still works.</p>
              ) : upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing coming up in {categories.length > 0 ? 'these categories' : 'the calendar'} yet. New events will appear in your calendar once they're added.</p>
              ) : (
                <>
                  <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-700/70">
                    {upcoming.map((ev, i) => {
                      const start = new Date(ev.start);
                      return (
                        <li key={`${ev.start}-${i}`} className="py-3 flex gap-3">
                          <span className="shrink-0 w-12 self-start rounded-leaf-xs border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 py-1 text-center leading-none">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-brand-600 dark:text-brand-300">{WEEKDAY.format(start)}</span>
                            <span className="block mt-0.5 text-lg font-semibold text-slate-900 dark:text-white">{DAY_NUMBER.format(start)}</span>
                            <span className="block mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{MONTH.format(start)}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-white leading-snug">{ev.title}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />{timesOf(ev)}
                            </span>
                            {ev.location && (
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{ev.location}</span>
                              </span>
                            )}
                            {ev.category && (
                              <span className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(ev.category)}`} aria-hidden="true" />{shortCategoryLabel(ev.category)}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="pt-3 border-t border-slate-100 dark:border-slate-700/70 text-xs text-slate-500 dark:text-slate-400">
                    The next {upcoming.length === 1 ? 'event' : `${upcoming.length} events`}. Your calendar gets every event, and keeps itself up to date.
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="share-page" className={`${cardClass} p-4 sm:p-5`}>
              <h2 id="share-page" className="text-sm font-semibold text-slate-900 dark:text-white">Sharing this with someone?</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The link keeps the categories you ticked.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copyPageLink} className={secondaryButton}>
                  {linkCopied ? <Check className="h-4 w-4 text-ccp-green-600 dark:text-ccp-green-400" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                  {linkCopied ? 'Link copied' : 'Copy link to this page'}
                </button>
                {canShare && (
                  <button type="button" onClick={sharePage} className={secondaryButton}>
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Share
                  </button>
                )}
              </div>
            </section>
          </div>

          <section aria-labelledby="subscribe-help" className={`${cardClass} px-4 sm:px-6 pt-4 sm:pt-5 pb-1 lg:col-start-1 lg:row-start-2`}>
            <p className="eyebrow"><span>Help</span></p>
            <h2 id="subscribe-help" className="sr-only">Help</h2>
            <div className="mt-1">
              <SubscribeHelp />
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">&copy; {new Date().getFullYear()} Cork City Partnership</p>
      </main>
    </div>
  );
};

export default SubscribePage;
