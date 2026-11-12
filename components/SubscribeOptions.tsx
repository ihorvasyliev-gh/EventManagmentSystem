import React, { useEffect, useId, useState } from 'react';
import { Apple, ArrowRight, Building2, CalendarDays, Check, ChevronDown, CircleCheck, Copy, ExternalLink, Link2, Mail, Monitor, type LucideIcon } from 'lucide-react';
import { EVENT_CATEGORIES } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';
import {
  type AppId, type SubscribeLink, APPS_BY_DEVICE, deviceOf, feedNameFor, feedUrlFor, knownCategories, subscribeLinks, subscribePageUrlFor,
} from '../utils/subscribeLinks';

export { categoryQuery, knownCategories } from '../utils/subscribeLinks';

/** The public subscribe page's address with these categories ticked */
export const subscribePageUrl = (categories: string[]): string => subscribePageUrlFor(categories, window.location.origin);

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers and some in-app browsers
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
};

const useCopied = (): [string | null, (key: string, text: string) => void] => {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, (key, text) => void copyText(text).then(() => setCopied(key))];
};

const APP_ICONS: Record<AppId, LucideIcon> = {
  'outlook-work': Building2,
  'outlook-personal': Mail,
  apple: Apple,
  google: CalendarDays,
  'outlook-classic': Monitor,
};

const AppIcon: React.FC<{ id: AppId; filled?: boolean }> = ({ id, filled }) => {
  const Icon = APP_ICONS[id];
  return (
    <span className={`shrink-0 w-10 h-10 rounded-leaf-xs flex items-center justify-center ${filled ? 'bg-brand-600 text-white' : 'bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-300'}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
};

const Help: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group border-b border-slate-200 dark:border-slate-700 last:border-b-0">
    <summary className="flex items-center justify-between gap-3 py-3.5 cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-brand-700 dark:hover:text-brand-300 [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="pb-4 text-sm text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">{children}</div>
  </details>
);

/** Step-by-step help for each calendar app, how the calendar updates, and how to remove it */
export const SubscribeHelp: React.FC = () => (
  <>
    <Help title="Adding it by hand in Outlook">
      <p><strong className="text-slate-800 dark:text-slate-100">Outlook on the web, new Outlook for Windows, Outlook for Mac:</strong> open Calendar → <em>Add calendar</em> → <em>Subscribe from web</em> → paste the address → give it a name → <em>Import</em>.</p>
      <p><strong className="text-slate-800 dark:text-slate-100">Classic Outlook for Windows:</strong> open Calendar → <em>Add Calendar</em> → <em>From Internet…</em> → paste the address → <em>OK</em> → <em>Yes</em>.</p>
      <p><strong className="text-slate-800 dark:text-slate-100">Outlook on your phone:</strong> the app can't add it itself. Add it once in Outlook on the web (the Outlook button above) and it appears in the app too.</p>
    </Help>
    <Help title="Adding it by hand in Google or Apple Calendar">
      <p><strong className="text-slate-800 dark:text-slate-100">Google Calendar:</strong> on a computer, open calendar.google.com → <em>+</em> next to <em>Other calendars</em> → <em>From URL</em> → paste → <em>Add calendar</em>. Google's phone app can't add it, but shows it once added.</p>
      <p><strong className="text-slate-800 dark:text-slate-100">iPhone or iPad:</strong> <em>Settings</em> → <em>Apps</em> → <em>Calendar</em> → <em>Calendar Accounts</em> → <em>Add Account</em> → <em>Other</em> → <em>Add Subscribed Calendar</em> → paste → <em>Next</em> → <em>Save</em>.</p>
      <p><strong className="text-slate-800 dark:text-slate-100">Mac:</strong> in Calendar, <em>File</em> → <em>New Calendar Subscription…</em> → paste → <em>Subscribe</em>. Set <em>Auto-refresh</em> to every hour.</p>
    </Help>
    <Help title="How does it stay up to date?">
      <p>You add it once. After that, new events, changes and cancellations reach your calendar by themselves: your calendar app checks for changes on its own.</p>
      <p>It isn't instant. Outlook usually picks up changes within a few hours, Google within a day, and Apple as often as its refresh setting says.</p>
      <p>It is read-only: you can't change CCP events from your own calendar, and changing them there doesn't change the CCP calendar. Events show as <em>free</em>, so they don't block your time.</p>
    </Help>
    <Help title="How do I remove it?">
      <p><strong className="text-slate-800 dark:text-slate-100">Outlook:</strong> right-click the calendar in the list (or its <em>⋯</em> menu) → <em>Remove</em> (or <em>Delete calendar</em>).</p>
      <p><strong className="text-slate-800 dark:text-slate-100">Google:</strong> hover over it under <em>Other calendars</em> → <em>⋮</em> → <em>Settings</em> → <em>Unsubscribe</em>.</p>
      <p><strong className="text-slate-800 dark:text-slate-100">Apple:</strong> iPhone: <em>Settings</em> → <em>Apps</em> → <em>Calendar</em> → <em>Calendar Accounts</em> → <em>Subscribed Calendars</em> → <em>Delete Account</em>. Mac: right-click it → <em>Unsubscribe</em>.</p>
    </Help>
  </>
);

/** A numbered step: a card of its own on the public page, a plain heading in the Export window */
const Step: React.FC<{ card: boolean; step: number; title: string; hint: string; labelId: string; children: React.ReactNode }> = ({ card, step, title, hint, labelId, children }) =>
  card ? (
    <section aria-labelledby={labelId} className="bg-white dark:bg-slate-800 rounded-leaf-sm sm:rounded-leaf shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-7 h-7 rounded-leaf-xs bg-brand-600 text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">{step}</span>
        <div>
          <h2 id={labelId} className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white leading-7">{title}</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  ) : (
    <div>
      <h3 id={labelId} className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{step}. {title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">{hint}</p>
      {children}
    </div>
  );

interface SubscribeOptionsProps {
  /** Categories ticked to begin with (e.g. from the page's address) */
  initialCategories?: string[];
  /** Told whenever the ticked categories change (the public page keeps them in its address) */
  onCategoriesChange?: (categories: string[]) => void;
  /** In the app's Export window: plain headings, and a link to share the public page */
  compact?: boolean;
}

/**
 * Subscribing to the live calendar feed: categories, one-click links for the calendars that
 * work on this device (the likeliest first), what to do in the window a link opens, and the
 * address to copy. Used by Export → Subscribe in the app and by the public page /subscribe (no
 * account: the feed is public and has published events only).
 */
const SubscribeOptions: React.FC<SubscribeOptionsProps> = ({ initialCategories = [], onCategoriesChange, compact = false }) => {
  const [categories, setCategories] = useState<string[]>(() => knownCategories(initialCategories));
  const [copied, copy] = useCopied();
  const [device] = useState(() => (typeof navigator === 'undefined' ? 'other' : deviceOf(navigator.userAgent, navigator.maxTouchPoints)));
  // The calendar whose link was last pressed: what to do next is shown under the list
  const [opened, setOpened] = useState<AppId | null>(null);
  const ids = useId();

  const setTicked = (next: string[]) => {
    const ordered = knownCategories(next);
    setCategories(ordered);
    onCategoriesChange?.(ordered);
  };

  const origin = window.location.origin;
  const feedUrl = feedUrlFor(categories, origin);
  const feedName = feedNameFor(categories);
  const links = subscribeLinks(categories, origin, device);
  const { main, more } = APPS_BY_DEVICE[device];
  const [best, ...others] = main.map((id) => links[id]);
  const card = !compact;

  const linkProps = (app: SubscribeLink) => ({
    href: app.href,
    onClick: () => setOpened(app.id),
    ...(app.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
  });

  const chip = (on: boolean) =>
    `inline-flex items-center gap-2 min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded border text-[13px] sm:text-xs font-medium select-none transition-colors ${
      on
        ? 'border-brand-600 bg-brand-600 text-white'
        : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-950/20'
    }`;

  const smallApp = (app: SubscribeLink) => (
    <a
      key={app.id}
      {...linkProps(app)}
      className="group flex items-center gap-3 p-3 rounded-leaf-xs border border-slate-200 dark:border-slate-600 transition-colors hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-950/20"
    >
      <AppIcon id={app.id} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{app.name}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{app.hint}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-300" aria-hidden="true" />
    </a>
  );

  return (
    <div className="space-y-5">
      <Step
        card={card}
        step={1}
        title="Which events?"
        labelId={`${ids}-which`}
        hint={categories.length === 0 ? 'All events. Tick categories to get only those.' : `Only ${categories.length === 1 ? 'this category' : 'these categories'}.`}
      >
        <div role="group" aria-labelledby={`${ids}-which`} className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTicked([])}
            aria-pressed={categories.length === 0}
            className={`${chip(categories.length === 0)} focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800`}
          >
            {categories.length === 0 && <Check className="h-3.5 w-3.5 -ml-0.5" aria-hidden="true" />}
            All events
          </button>
          {EVENT_CATEGORIES.map((cat) => {
            const checked = categories.includes(cat);
            return (
              <label key={cat} className={`${chip(checked)} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-offset-slate-800`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => setTicked(checked ? categories.filter((c) => c !== cat) : [...categories, cat])}
                />
                {checked
                  ? <Check className="h-3.5 w-3.5 -ml-0.5" aria-hidden="true" />
                  : <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)}`} aria-hidden="true" />}
                {cat}
              </label>
            );
          })}
        </div>
        {card && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            In your calendar it is called <strong className="font-semibold text-slate-700 dark:text-slate-200">{feedName}</strong>.
          </p>
        )}
      </Step>

      <Step card={card} step={2} title="Add it to your calendar" labelId={`${ids}-add`} hint="Pick your calendar and confirm in the window that opens.">
        <div className="space-y-2">
          <a
            {...linkProps(best)}
            className="group flex items-center gap-3 p-3.5 sm:p-4 rounded-leaf-sm border border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/30 transition-colors hover:border-brand-500 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/50"
          >
            <AppIcon id={best.id} filled />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-300">Best for this device</span>
              <span className="block text-[15px] sm:text-base font-semibold text-slate-900 dark:text-white">{best.name}</span>
              <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">{best.hint}</span>
            </span>
            <span className="cta shrink-0 hidden min-[420px]:inline-flex items-center gap-2 h-10 px-4 rounded bg-brand-600 group-hover:bg-brand-700 text-white shadow-sm transition-colors" aria-hidden="true">
              Add <ArrowRight className="h-4 w-4" />
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300 min-[420px]:hidden" aria-hidden="true" />
          </a>
          <div className={`grid gap-2 ${card ? 'sm:grid-cols-2 [&>*:last-child:nth-child(odd)]:sm:col-span-2' : ''}`}>{others.map(smallApp)}</div>
          {more.length > 0 && (
            <details className="group/more">
              <summary className="inline-flex items-start gap-1.5 py-1.5 cursor-pointer list-none text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-300 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-3.5 w-3.5 mt-px shrink-0 transition-transform group-open/more:rotate-180" aria-hidden="true" />
                More calendars ({more.map((id) => links[id].name).join(', ')})
              </summary>
              <div className={`mt-1 grid gap-2 ${card ? 'sm:grid-cols-2' : ''}`}>{more.map((id) => smallApp(links[id]))}</div>
            </details>
          )}
        </div>

        <div aria-live="polite">
          {opened && (
            <div className="mt-3 flex items-start gap-2.5 p-3 rounded-leaf-xs bg-ccp-green-50 dark:bg-ccp-green-950/40 border border-ccp-green-200 dark:border-ccp-green-800 text-sm text-slate-700 dark:text-slate-200 animate-fade-in">
              <CircleCheck className="h-5 w-5 shrink-0 text-ccp-green-600 dark:text-ccp-green-400" aria-hidden="true" />
              <span>
                <strong className="font-semibold text-slate-900 dark:text-white">{links[opened].next.title}.</strong> {links[opened].next.text}
                <span className="block mt-1 text-xs text-slate-600 dark:text-slate-300">Nothing opened? Copy the calendar address below and add it by hand{compact ? '' : ' (steps under Help)'}.</span>
              </span>
            </div>
          )}
        </div>

        <div className={card ? 'mt-5 pt-5 border-t border-slate-200 dark:border-slate-700' : 'mt-5'}>
          <label htmlFor="feed-url" className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Or copy the calendar address</label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">For any other calendar app, or to add it by hand{compact ? '' : ' (steps under Help)'}.</p>
          <div className="flex items-center gap-2">
            <input
              id="feed-url"
              readOnly
              value={feedUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 h-11 bg-slate-100 dark:bg-slate-900/60 rounded px-3 text-xs text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => copy('feed', feedUrl)}
              className="cta shrink-0 inline-flex items-center justify-center gap-2 h-11 px-4 rounded border border-brand-600 dark:border-brand-400 bg-white dark:bg-transparent text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
            >
              {copied === 'feed' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied === 'feed' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </Step>

      {compact && (
        <div className="rounded-leaf-xs bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            <strong className="text-slate-800 dark:text-slate-100">For people without an account:</strong> share the public page. It has these options, step-by-step help for each app,
            and {categories.length > 0 ? 'the same categories ticked' : 'every event'}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy('page', subscribePageUrl(categories))}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              {copied === 'page' ? <Check className="h-4 w-4 text-ccp-green-500" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
              {copied === 'page' ? 'Link copied' : 'Copy link to the public page'}
            </button>
            <a href={subscribePageUrl(categories)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-medium text-brand-700 dark:text-brand-300 hover:underline">
              Open it <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscribeOptions;
