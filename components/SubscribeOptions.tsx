import React, { useEffect, useState } from 'react';
import { Calendar, Copy, Check, ExternalLink, ChevronDown, Link2 } from 'lucide-react';
import { EVENT_CATEGORIES } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';
import { calendarName } from '../server/feed.ts';

/** Ticked categories in the order of the category list, and only names it has */
export const knownCategories = (names: string[]): string[] => {
  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  return EVENT_CATEGORIES.filter((c) => wanted.has(c.toLowerCase()));
};

/** `?category=A,B` for some categories, or nothing for every event */
export const categoryQuery = (categories: string[]): string =>
  categories.length > 0 ? `?category=${categories.map(encodeURIComponent).join(',')}` : '';

/** The live feed's address for some categories (none = every published event) */
export const feedUrlFor = (categories: string[], origin = window.location.origin): string =>
  `${origin}/api/calendar${categoryQuery(categories)}`;

/** The public subscribe page, with the same categories ticked */
export const subscribePageUrlFor = (categories: string[], origin = window.location.origin): string =>
  `${origin}/subscribe${categoryQuery(categories)}`;

/** The name the calendar gets in Outlook (the feed names itself the same way for other apps) */
export const feedNameFor = calendarName;

type AppId = 'outlook-work' | 'outlook-personal' | 'apple' | 'google' | 'outlook-classic';

/** The app most likely wanted on this device (shown first, marked "Best for this device") */
const likelyApp = (): AppId => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'apple';
  if (/Android/.test(ua)) return 'google';
  return 'outlook-work';
};

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

const Help: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group border-b border-slate-200 dark:border-slate-700 last:border-b-0">
    <summary className="flex items-center justify-between gap-3 py-3 cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="pb-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">{children}</div>
  </details>
);

interface SubscribeOptionsProps {
  /** Categories ticked to begin with (e.g. from the page's address) */
  initialCategories?: string[];
  /** Told whenever the ticked categories change (the public page keeps them in its address) */
  onCategoriesChange?: (categories: string[]) => void;
  /** In the app's Export window: a link to share the public page instead of the long help */
  compact?: boolean;
}

/**
 * Subscribing to the live calendar feed: categories, one-click links for Outlook (work and
 * personal), Apple and Google, the address to copy, and help for each app. Used by Export →
 * Subscribe in the app and by the public page /subscribe (no account: the feed is public and has
 * published events only).
 */
const SubscribeOptions: React.FC<SubscribeOptionsProps> = ({ initialCategories = [], onCategoriesChange, compact = false }) => {
  const [categories, setCategories] = useState<string[]>(() => knownCategories(initialCategories));
  const [copied, copy] = useCopied();
  const [best] = useState(likelyApp);

  const setTicked = (next: string[]) => {
    const ordered = knownCategories(next);
    setCategories(ordered);
    onCategoriesChange?.(ordered);
  };

  const feedUrl = feedUrlFor(categories);
  const feedName = feedNameFor(categories);
  const pageUrl = subscribePageUrlFor(categories);
  // webcal:// opens the calendar app that registers for it (Apple Calendar, classic Outlook);
  // Outlook on the web and Google get their own links (Android has no webcal app at all)
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const addFromWeb = (host: string) =>
    `https://${host}/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(feedName)}`;

  const apps: { id: AppId; href: string; name: string; hint: string; newTab: boolean }[] = [
    { id: 'outlook-work', href: addFromWeb('outlook.office.com'), name: 'Outlook (work or school account)', hint: 'Microsoft 365. Then also in Outlook on your computer and phone', newTab: true },
    { id: 'outlook-personal', href: addFromWeb('outlook.live.com'), name: 'Outlook.com (personal account)', hint: 'Outlook.com, Hotmail or Live', newTab: true },
    { id: 'apple', href: webcalUrl, name: 'Apple Calendar', hint: 'iPhone, iPad or Mac', newTab: false },
    { id: 'google', href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`, name: 'Google Calendar', hint: 'Opens Google Calendar; then on your Android phone too', newTab: true },
    { id: 'outlook-classic', href: webcalUrl, name: 'Classic Outlook on Windows', hint: 'Opens the Outlook app on this computer; only on this computer', newTab: false },
  ];
  const ordered = [...apps.filter((a) => a.id === best), ...apps.filter((a) => a.id !== best)];

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">1. Which events?</legend>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
          {categories.length === 0 ? 'All events. Tick categories to get only those.' : `Only ${categories.length === 1 ? 'this category' : 'these categories'}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTicked([])}
            aria-pressed={categories.length === 0}
            className={`inline-flex items-center px-3 py-1.5 rounded border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 ${
              categories.length === 0
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-brand-300'
            }`}
          >
            All events
          </button>
          {EVENT_CATEGORIES.map((cat) => {
            const checked = categories.includes(cat);
            return (
              <label
                key={cat}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium cursor-pointer select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                  checked
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-brand-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => setTicked(checked ? categories.filter((c) => c !== cat) : [...categories, cat])}
                />
                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)} ${checked ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
                {cat}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">2. Add it to your calendar</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">Pick your calendar and confirm in the window that opens.</p>
        <div className="space-y-2">
          {ordered.map((app) => (
            <a
              key={app.id}
              href={app.href}
              {...(app.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-950/20 ${
                app.id === best ? 'border-brand-300 dark:border-brand-700 bg-brand-50/30 dark:bg-brand-950/10' : 'border-slate-200 dark:border-slate-600'
              }`}
            >
              <Calendar className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                  {app.name}
                  {app.id === best && (
                    <span className="ml-2 align-middle inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-brand-600 text-white">Best for this device</span>
                  )}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{app.hint}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="feed-url" className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Or copy the calendar address</label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">For any other calendar app, or to add it by hand (steps below).</p>
        <div className="flex items-center gap-2">
          <input
            id="feed-url"
            readOnly
            value={feedUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-600"
          />
          <button
            type="button"
            onClick={() => copy('feed', feedUrl)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            {copied === 'feed' ? <Check className="h-4 w-4 text-ccp-green-500" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied === 'feed' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {compact ? (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            <strong className="text-slate-800 dark:text-slate-100">For people without an account:</strong> share the public page. It has these options, step-by-step help for each app,
            and {categories.length > 0 ? 'the same categories ticked' : 'every event'}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy('page', pageUrl)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              {copied === 'page' ? <Check className="h-4 w-4 text-ccp-green-500" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
              {copied === 'page' ? 'Link copied' : 'Copy link to the public page'}
            </button>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg font-medium text-brand-700 dark:text-brand-300 hover:underline">
              Open it <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4">
          <Help title="Adding it by hand in Outlook">
            <p><strong className="text-slate-800 dark:text-slate-100">Outlook on the web, new Outlook for Windows, Outlook for Mac:</strong> open Calendar → <em>Add calendar</em> → <em>Subscribe from web</em> → paste the address → give it a name → <em>Import</em>.</p>
            <p><strong className="text-slate-800 dark:text-slate-100">Classic Outlook for Windows:</strong> open Calendar → <em>Add Calendar</em> → <em>From Internet…</em> → paste the address → <em>OK</em> → <em>Yes</em>.</p>
            <p><strong className="text-slate-800 dark:text-slate-100">Outlook on your phone:</strong> the app can't add it itself. Add it once in Outlook on the web (top button above) and it appears in the app too.</p>
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
        </div>
      )}
    </div>
  );
};

export default SubscribeOptions;
