import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Download, Check, MessageSquare, LayoutGrid, List, Eye, AlertTriangle, Inbox, ChevronDown, CalendarPlus
} from 'lucide-react';
import { Event } from '../types';
import { generateEventsDigestPDF, generateWhatsAppSummary, digestFileName } from '../utils/pdfExport';
import { calculatePresetDateRange, DateRangePreset } from '../utils/date';
import { expandRecurringEvents } from '../utils/recurrence';
import { groupDigestOccurrences, formatOccurrenceLabel } from '../utils/digestGrouping';
import { useToast } from '../contexts/ToastContext';
import { getCategoryDotColor } from './WeekView';
import ModalShell from './ModalShell';

interface FortnightlyBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  /** Deleted occurrences of recurring events */
  recurrenceExceptions?: Map<string, Date[]>;
  /** Admins: open the submissions inbox (shown when pending events fall in the period) */
  onOpenSubmissions?: () => void;
}

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: '1week', label: '1 week' },
  { id: '2weeks', label: '2 weeks' },
  { id: '1month', label: '1 month' },
  { id: 'all', label: 'All upcoming' }
];

const FORMAT_KEY = 'ccp_digest_format';
const BUTTONS_KEY = 'ccp_digest_buttons';

const readPref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference just isn't remembered
  }
};

const fmtDay = (d: Date) => d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Tiny schematic of each PDF layout so the choice is visual, not just a label */
const LayoutThumb: React.FC<{ kind: 'executive' | 'compact'; active: boolean }> = ({ kind, active }) => {
  const bar = active ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600';
  const heading = 'bg-slate-300 dark:bg-slate-600';
  const line = 'bg-slate-200 dark:bg-slate-600';
  return (
    <div className="w-full h-20 sm:h-24 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 flex flex-col gap-1 overflow-hidden" aria-hidden="true">
      <div className={`h-0.5 -mx-1.5 -mt-1.5 mb-0.5 ${bar}`} />
      <div className={`h-1.5 w-1/2 rounded-sm ${heading}`} />
      {kind === 'executive' ? (
        [0, 1].map((i) => (
          <div key={i} className="flex-1 flex gap-1 rounded-sm border border-slate-200 dark:border-slate-700 p-1">
            <div className={`w-0.5 rounded-full ${i ? 'bg-emerald-400' : 'bg-blue-400'}`} />
            <div className="flex-1 space-y-0.5">
              <div className={`h-1 w-3/4 rounded ${line}`} />
              <div className={`h-1 w-1/2 rounded ${line}`} />
            </div>
            <div className="w-3 rounded-sm bg-slate-200 dark:bg-slate-700" />
          </div>
        ))
      ) : (
        <>
          <div className="h-1.5 rounded-sm bg-slate-200 dark:bg-slate-700" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-1">
              <div className={`h-1 w-2 rounded ${line}`} />
              <div className={`h-1 flex-1 rounded ${line}`} />
              <div className={`h-1 w-3 rounded ${line}`} />
            </div>
          ))}
        </>
      )}
    </div>
  );
};

const FortnightlyBulletinModal: React.FC<FortnightlyBulletinModalProps> = ({
  isOpen,
  onClose,
  events,
  recurrenceExceptions,
  onOpenSubmissions
}) => {
  const { showToast } = useToast();

  const [activePreset, setActivePreset] = useState<DateRangePreset | 'custom'>('2weeks');
  const [startDateStr, setStartDateStr] = useState(() => calculatePresetDateRange('2weeks', { events }).startDateStr);
  const [endDateStr, setEndDateStr] = useState(() => calculatePresetDateRange('2weeks', { events }).endDateStr);
  const [format, setFormat] = useState<'executive' | 'compact'>(() => (readPref(FORMAT_KEY) === 'compact' ? 'compact' : 'executive'));
  const [includeCalendarButtons, setIncludeCalendarButtons] = useState(() => readPref(BUTTONS_KEY) !== 'false');
  const [busy, setBusy] = useState<'download' | 'preview' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(true);

  // Always start from the default fortnight when the dialog opens
  useEffect(() => {
    if (isOpen) {
      setActivePreset('2weeks');
      const range = calculatePresetDateRange('2weeks', { events });
      setStartDateStr(range.startDateStr);
      setEndDateStr(range.endDateStr);
    }
  }, [isOpen]); // reset only when the dialog opens, not on every events refresh

  const handleSelectPreset = (preset: DateRangePreset) => {
    setActivePreset(preset);
    const range = calculatePresetDateRange(preset, { events });
    setStartDateStr(range.startDateStr);
    setEndDateStr(range.endDateStr);
  };

  const startDate = useMemo(() => new Date(`${startDateStr}T00:00:00`), [startDateStr]);
  const endDate = useMemo(() => new Date(`${endDateStr}T23:59:59.999`), [endDateStr]);
  const rangeValid = !isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate;

  // Every occurrence in the period: repeating and multi-date events are listed on each date
  const periodEvents = useMemo(
    () => (rangeValid ? expandRecurringEvents(events, startDate, endDate, recurrenceExceptions) : []),
    [rangeValid, events, startDate, endDate, recurrenceExceptions]
  );

  const { groups, pendingCount } = useMemo(() => {
    const inRange = periodEvents.filter((e) => e.date.getTime() >= startDate.getTime() && e.date.getTime() <= endDate.getTime());
    return {
      groups: groupDigestOccurrences(inRange.filter((e) => !e.status || e.status === 'published')),
      pendingCount: new Set(inRange.filter((e) => e.status === 'draft').map((e) => e.id)).size
    };
  }, [periodEvents, startDate, endDate]);

  const dayCount = rangeValid ? Math.round((endDate.getTime() - startDate.getTime()) / 86400000) : 0;

  const pdfOptions = { startDate, endDate, format, baseUrl: window.location.origin, includeCalendarButtons };

  const handleDownloadPDF = async () => {
    setBusy('download');
    try {
      await generateEventsDigestPDF(periodEvents, pdfOptions);
      showToast('Digest PDF downloaded', 'success');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      showToast('Failed to generate the PDF. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handlePreviewPDF = async () => {
    // Open the tab straight away (inside the click) so pop-up blockers allow it
    const previewWindow = window.open('', '_blank');
    setBusy('preview');
    try {
      const blob = await generateEventsDigestPDF(periodEvents, { ...pdfOptions, output: 'blob' });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        // Pop-ups blocked: fall back to a normal download
        const a = document.createElement('a');
        a.href = url;
        a.download = digestFileName(startDate, endDate);
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      previewWindow?.close();
      console.error('Failed to generate PDF preview:', err);
      showToast('Failed to generate the preview. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleCopyWhatsApp = async () => {
    const text = generateWhatsAppSummary(periodEvents, startDate, endDate);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    showToast('WhatsApp summary copied — paste it into the group chat', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const disabled = !rangeValid || busy !== null;

  const footer = (
    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
      <button
        type="button"
        onClick={handleDownloadPDF}
        disabled={disabled}
        className="col-span-2 sm:order-4 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-50"
      >
        {busy === 'download' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
        {busy === 'download' ? 'Generating…' : 'Download PDF'}
      </button>
      <button
        type="button"
        onClick={handlePreviewPDF}
        disabled={disabled}
        className="sm:order-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
      >
        {busy === 'preview' ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Eye className="w-4 h-4" />}
        Preview
      </button>
      <button
        type="button"
        onClick={handleCopyWhatsApp}
        disabled={!rangeValid}
        className="sm:order-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/60 transition-colors disabled:opacity-50"
      >
        {copied ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
        <span className="sm:hidden">{copied ? 'Copied!' : 'WhatsApp text'}</span>
        <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy WhatsApp text'}</span>
      </button>
      <div className="hidden sm:block sm:order-2 flex-1" />
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Upcoming Events Digest"
      subtitle="A branded PDF and WhatsApp summary for the Board & staff"
      icon={<FileText className="w-5 h-5" />}
      size="lg"
      footer={footer}
    >
      <div className="space-y-6">
        {/* 1. Period */}
        <section aria-labelledby="digest-period">
          <h3 id="digest-period" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
            1 · Period
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                aria-pressed={activePreset === p.id}
                className={`py-2 px-2 text-sm font-medium rounded-lg transition-all ${
                  activePreset === p.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">From</span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => { setStartDateStr(e.target.value); setActivePreset('custom'); }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">To</span>
              <input
                type="date"
                value={endDateStr}
                min={startDateStr}
                onChange={(e) => { setEndDateStr(e.target.value); setActivePreset('custom'); }}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </label>
          </div>
          {!rangeValid && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              The “To” date must be on or after the “From” date.
            </p>
          )}
        </section>

        {/* 2. Layout */}
        <section aria-labelledby="digest-layout">
          <h3 id="digest-layout" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
            2 · Layout
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'executive', icon: LayoutGrid, name: 'Executive cards', hint: 'Overview calendar, full descriptions & flyers. Best for the Board.' },
              { id: 'compact', icon: List, name: 'Compact table', hint: 'A dense agenda that fits the most events per page.' }
            ] as const).map((opt) => {
              const active = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setFormat(opt.id); writePref(FORMAT_KEY, opt.id); }}
                  aria-pressed={active}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <LayoutThumb kind={opt.id} active={active} />
                  <span className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    <opt.icon className={`w-4 h-4 ${active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`} />
                    {opt.name}
                  </span>
                  <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.hint}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
            <span className="flex items-start gap-2.5">
              <CalendarPlus className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">“Add to calendar” buttons</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {includeCalendarButtons ? 'One-click Outlook & Google links for email readers.' : 'Hidden — cleaner for printing on paper.'}
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={includeCalendarButtons}
              onChange={(e) => { setIncludeCalendarButtons(e.target.checked); writePref(BUTTONS_KEY, String(e.target.checked)); }}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative shrink-0 w-10 h-6 rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-brand-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2"
            />
          </label>
        </section>

        {/* 3. What's included */}
        <section aria-labelledby="digest-included">
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="w-full flex items-center justify-between gap-2 mb-2.5"
          >
            <h3 id="digest-included" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              3 · Included — {groups.length} {groups.length === 1 ? 'event' : 'events'}
              {rangeValid && <span className="normal-case tracking-normal font-normal"> over {dayCount} {dayCount === 1 ? 'day' : 'days'}</span>}
            </h3>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showList ? 'rotate-180' : ''}`} />
          </button>

          {pendingCount > 0 && (
            <div className="mb-3 flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <strong>{pendingCount} pending {pendingCount === 1 ? 'submission is' : 'submissions are'}</strong> in this period and won’t appear until approved.
                {onOpenSubmissions && (
                  <button
                    type="button"
                    onClick={onOpenSubmissions}
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                  >
                    <Inbox className="w-3.5 h-3.5" /> Review submissions
                  </button>
                )}
              </div>
            </div>
          )}

          {showList && (
            groups.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400">
                No published events in this period. Try a longer range.
              </div>
            ) : (
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/70 max-h-64 overflow-y-auto">
                {groups.map((g) => (
                  <li key={g.event.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${getCategoryDotColor(g.event.category)}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{g.event.title}</p>
                      {g.occurrences.length > 1 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          Also on {g.occurrences.slice(1).map((o) => formatOccurrenceLabel(o.date, g.event.date)).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      <span className="block font-medium text-slate-700 dark:text-slate-300">{fmtDay(g.event.date)}</span>
                      {fmtTime(g.event.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </div>
    </ModalShell>
  );
};

export default FortnightlyBulletinModal;
