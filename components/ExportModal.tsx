import React, { useState } from 'react';
import { Download, Calendar, FileSpreadsheet, Link2, Copy, Check, ExternalLink, FileText } from 'lucide-react';
import { Event } from '../types';
import { exportToICal, exportToExcel, downloadFile, downloadBlob, isPublished } from '../utils/export';
import { getEventsWithRelated, getRecurrenceExceptionsBatch } from '../services/eventService';
import { expandRecurringEvents } from '../utils/recurrence';
import ModalShell from './ModalShell';
import { EVENT_CATEGORIES } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';
import { useToast } from '../contexts/ToastContext';

const EXPORT_RANGE_YEARS = 2;
const FEED_NAME = 'CCP Events';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  onOpenFortnightlyBulletin?: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, events, onOpenFortnightlyBulletin }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'subscribe'>('export');
  const [exportFormat, setExportFormat] = useState<'ical' | 'excel'>('ical');
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Subscribe to some categories only (none ticked = everything)
  const [feedCategories, setFeedCategories] = useState<string[]>([]);
  const { showToast } = useToast();

  if (!isOpen) return null;

  // Build the subscription URL based on current origin
  const feedPath = '/api/calendar';
  const feedQuery = feedCategories.length > 0 ? `?category=${feedCategories.map(encodeURIComponent).join(',')}` : '';
  const feedUrl = `${window.location.origin}${feedPath}${feedQuery}`;
  const feedName = feedCategories.length === 1 ? `${FEED_NAME}: ${feedCategories[0]}` : FEED_NAME;
  // webcal:// only opens apps that register for it (Apple Calendar, desktop Outlook) —
  // Android has none, so Google Calendar and Outlook on the web get their own links
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const googleSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
  const outlookSubscribeUrl = `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(feedName)}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = feedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Export published events only (strictly excluding drafts and pending submissions)
      const publishedOnly = events.filter(e => e.status !== 'draft' && (e.status === 'published' || !e.status));
      const eventsWithRelated = await getEventsWithRelated(publishedOnly);
      const recurringIds = eventsWithRelated
        .filter(e => e.recurrence && e.recurrence.type !== 'none')
        .map(e => e.id);
      const exceptionsMap = await getRecurrenceExceptionsBatch(recurringIds);

      const now = new Date();
      const rangeStart = eventsWithRelated.length > 0
        ? new Date(Math.min(...eventsWithRelated.map(e => e.date.getTime())))
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const twoYearsMs = EXPORT_RANGE_YEARS * 365.25 * 24 * 60 * 60 * 1000;
      const rangeEnd = eventsWithRelated.length > 0
        ? new Date(Math.max(...eventsWithRelated.map(e => {
          const end = e.recurrence?.endDate;
          if (end) return end.getTime();
          return e.date.getTime() + twoYearsMs;
        })))
        : new Date(rangeStart.getTime() + twoYearsMs);

      const expanded = expandRecurringEvents(eventsWithRelated, rangeStart, rangeEnd, exceptionsMap);

      if (exportFormat === 'ical') {
        const icalContent = exportToICal(expanded.filter(isPublished));
        downloadFile(icalContent, 'ccp-events.ics', 'text/calendar');
      } else {
        const blob = await exportToExcel(expanded);
        downloadBlob(blob, 'ccp-events.xlsx');
      }
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Please check your connection and try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const exportFooter = (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="cta inline-flex justify-center items-center rounded border border-slate-300 dark:border-slate-600 px-4 py-2.5 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
      >
        {activeTab === 'export' ? 'Cancel' : 'Close'}
      </button>
      {activeTab === 'export' && (
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="cta inline-flex justify-center items-center gap-2 rounded px-5 py-2.5 bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:opacity-50 transition-colors"
        >
          {exporting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download {exportFormat === 'ical' ? '.ics' : '.xlsx'}
            </>
          )}
        </button>
      )}
    </div>
  );

  const formatOption = (value: 'ical' | 'excel', icon: React.ReactNode, name: string, hint: string) => {
    const active = exportFormat === value;
    return (
      <label
        className={`flex items-start gap-3 p-4 rounded-leaf-sm border-2 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
          active ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
        }`}
      >
        <input
          type="radio"
          name="format"
          value={value}
          checked={active}
          onChange={() => setExportFormat(value)}
          className="sr-only"
          disabled={exporting}
        />
        <span className="shrink-0 mt-0.5">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-900 dark:text-white">{name}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>
        </span>
        <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-brand-600 bg-brand-600' : 'border-slate-300 dark:border-slate-500'}`} aria-hidden="true">
          {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </span>
      </label>
    );
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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Export & subscribe"
      subtitle="Download the calendar or keep it synced in your own calendar app"
      icon={<Download className="w-5 h-5" />}
      footer={exportFooter}
    >
      {/* Tabs */}
      <div className="grid grid-cols-2 mb-5 border-b border-slate-200 dark:border-slate-700" role="tablist">
        {([
          { id: 'export', label: 'Download', icon: <Download className="h-4 w-4" /> },
          { id: 'subscribe', label: 'Subscribe', icon: <Link2 className="h-4 w-4" /> }
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`relative inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-current ${
              activeTab === t.id ? 'text-brand-600 dark:text-brand-300 after:opacity-100' : 'text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 after:opacity-0'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'export' ? (
        <div className="space-y-4">
          {onOpenFortnightlyBulletin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFortnightlyBulletin();
              }}
              className="w-full flex items-center gap-3 p-4 rounded-leaf-sm bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/80 text-left hover:bg-brand-100/70 dark:hover:bg-brand-900/40 transition-colors"
            >
              <FileText className="w-5 h-5 shrink-0 text-brand-600 dark:text-brand-400" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-brand-900 dark:text-brand-100">Looking for the Events Digest?</span>
                <span className="block text-xs text-brand-700 dark:text-brand-300 mt-0.5">The branded PDF & WhatsApp summary for the Board & staff.</span>
              </span>
              <ExternalLink className="w-4 h-4 shrink-0 text-brand-500" />
            </button>
          )}

          <fieldset className="space-y-3">
            <legend className="eyebrow w-full mb-3">
              Export published events as
            </legend>
            {formatOption('ical', <Calendar className="h-5 w-5 text-cat-enterprise-500 dark:text-cat-enterprise-400" />, 'Calendar file (.ics)', 'Import into Outlook, Google Calendar or Apple Calendar')}
            {formatOption('excel', <FileSpreadsheet className="h-5 w-5 text-ccp-green-500 dark:text-ccp-green-400" />, 'Excel spreadsheet (.xlsx)', 'Every event with dates, venues, posters and contacts')}
          </fieldset>
        </div>
      ) : (
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
            {subscribeOption(googleSubscribeUrl, 'Google Calendar', 'Opens Google Calendar in your browser', true)}
            {subscribeOption(outlookSubscribeUrl, 'Outlook', 'Microsoft 365 / Outlook on the web', true)}
            {subscribeOption(webcalUrl, 'Apple Calendar & other apps', 'iPhone, iPad, Mac or Outlook on the desktop', false)}
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
              <li><strong className="text-slate-800 dark:text-slate-200">Outlook:</strong> Add calendar → Subscribe from web → paste the address</li>
              <li><strong className="text-slate-800 dark:text-slate-200">Google Calendar:</strong> Other calendars (+) → From URL → paste</li>
              <li><strong className="text-slate-800 dark:text-slate-200">Apple Calendar:</strong> File → New Calendar Subscription → paste</li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              Google Calendar adds subscriptions on a computer only; after that it syncs to your phone. Calendar apps refresh
              subscribed calendars on their own schedule, so changes can take a few hours (Google: up to a day) to appear.
            </p>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default ExportModal;
