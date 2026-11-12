import React, { useState } from 'react';
import { Calendar, Copy, Check, ExternalLink } from 'lucide-react';
import { EVENT_CATEGORIES } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';

const FEED_NAME = 'CCP Events';

/** The live feed's address for some categories (none = every published event) */
export const feedUrlFor = (categories: string[], origin = window.location.origin): string =>
  `${origin}/api/calendar${categories.length > 0 ? `?category=${categories.map(encodeURIComponent).join(',')}` : ''}`;

/**
 * Subscribing to the live calendar feed: categories, one-click links for Outlook, Apple and
 * Google, the address to copy, and how to add it by hand. Used by Export → Subscribe in the app
 * and by the public page /subscribe (no account needed: the feed has published events only).
 */
const SubscribeOptions: React.FC = () => {
  const [copied, setCopied] = useState(false);
  // Subscribe to some categories only (none ticked = everything)
  const [feedCategories, setFeedCategories] = useState<string[]>([]);

  const feedUrl = feedUrlFor(feedCategories);
  const feedName = feedCategories.length === 1 ? `${FEED_NAME}: ${feedCategories[0]}` : FEED_NAME;
  // webcal:// only opens apps that register for it (Apple Calendar, desktop Outlook) —
  // Android has none, so Google Calendar and Outlook on the web get their own links
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const googleSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
  const outlookSubscribeUrl = `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(feedName)}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = feedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const subscribeOption = (href: string, name: string, hint: string, newTab: boolean) => (
    <a
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-950/20 transition-colors"
    >
      <Calendar className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{name}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
    </a>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Subscribe once and new or changed events show up in your own calendar automatically.
      </p>

      <fieldset>
        <legend className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          Which events? <span className="font-normal">(nothing ticked = all of them)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_CATEGORIES.map((cat) => {
            const checked = feedCategories.includes(cat);
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
                  onChange={() => setFeedCategories((prev) => (checked ? prev.filter((c) => c !== cat) : [...prev, cat]))}
                />
                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)} ${checked ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
                {cat}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        {subscribeOption(outlookSubscribeUrl, 'Outlook', 'Microsoft 365 / Outlook on the web', true)}
        {subscribeOption(webcalUrl, 'Outlook on the desktop, Apple Calendar & other apps', 'Windows Outlook, iPhone, iPad or Mac', false)}
        {subscribeOption(googleSubscribeUrl, 'Google Calendar', 'Opens Google Calendar in your browser', true)}
      </div>

      <div>
        <label htmlFor="feed-url" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Or copy the feed address
        </label>
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
            onClick={handleCopyUrl}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-ccp-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-4">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Adding it by hand</h4>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <li><strong className="text-slate-800 dark:text-slate-200">Outlook on the web / new Outlook:</strong> Calendar → Add calendar → Subscribe from web → paste the address → Import</li>
          <li><strong className="text-slate-800 dark:text-slate-200">Classic Outlook (Windows):</strong> Calendar → Add Calendar → From Internet → paste → OK</li>
          <li><strong className="text-slate-800 dark:text-slate-200">Google Calendar:</strong> Other calendars (+) → From URL → paste</li>
          <li><strong className="text-slate-800 dark:text-slate-200">Apple Calendar:</strong> File → New Calendar Subscription → paste</li>
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
          Google Calendar adds subscriptions on a computer only; after that it syncs to your phone. Calendar apps refresh
          subscribed calendars on their own schedule, so changes can take a few hours (Google: up to a day) to appear.
        </p>
      </div>
    </div>
  );
};

export default SubscribeOptions;
