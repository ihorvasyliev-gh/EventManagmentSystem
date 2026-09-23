import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Download, Copy, Check, Calendar, MessageSquare, LayoutGrid, List } from 'lucide-react';
import { Event } from '../types';
import { generateFortnightlyPDF, generateWhatsAppSummary } from '../utils/pdfExport';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { calculatePresetDateRange, DateRangePreset } from '../utils/date';
import { expandRecurringEvents } from '../utils/recurrence';
import { useToast } from '../contexts/ToastContext';

interface FortnightlyBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  /** Deleted occurrences of recurring events */
  recurrenceExceptions?: Map<string, Date[]>;
}

const FortnightlyBulletinModal: React.FC<FortnightlyBulletinModalProps> = ({
  isOpen,
  onClose,
  events,
  recurrenceExceptions
}) => {
  const { showToast } = useToast();
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalPanelRef);

  // Range preset selection: '2weeks' (default), '1week', '1month', 'all', or 'custom'
  const [activePreset, setActivePreset] = useState<DateRangePreset | 'custom'>('2weeks');

  // Default dates: Today -> +14 days in user's local timezone
  const [startDateStr, setStartDateStr] = useState(() => {
    return calculatePresetDateRange('2weeks', { events }).startDateStr;
  });

  const [endDateStr, setEndDateStr] = useState(() => {
    return calculatePresetDateRange('2weeks', { events }).endDateStr;
  });

  // Always reset to default 2 weeks when modal opens (no persistence needed)
  useEffect(() => {
    if (isOpen) {
      setActivePreset('2weeks');
      const range = calculatePresetDateRange('2weeks', { events });
      setStartDateStr(range.startDateStr);
      setEndDateStr(range.endDateStr);
    }
  }, [isOpen, events]);

  const handleSelectPreset = (preset: DateRangePreset) => {
    setActivePreset(preset);
    const range = calculatePresetDateRange(preset, { events });
    setStartDateStr(range.startDateStr);
    setEndDateStr(range.endDateStr);
  };

  const handleStartDateChange = (val: string) => {
    setStartDateStr(val);
    setActivePreset('custom');
  };

  const handleEndDateChange = (val: string) => {
    setEndDateStr(val);
    setActivePreset('custom');
  };

  const [format, setFormat] = useState<'executive' | 'compact'>('executive');
  const [includeCalendarButtons, setIncludeCalendarButtons] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const startDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = new Date(`${endDateStr}T23:59:59.999`);

  // Every occurrence in the period: repeating and multi-date events are listed on each date
  const periodEvents = isNaN(startDate.getTime()) || isNaN(endDate.getTime())
    ? []
    : expandRecurringEvents(events, startDate, endDate, recurrenceExceptions);

  // Count events in range (only published events, excluding drafts/submissions)
  const matchingEvents = periodEvents.filter((e) => {
    if (e.status === 'draft' || (e.status && e.status !== 'published')) return false;
    const d = e.date instanceof Date ? e.date : new Date(e.date);
    const t = d.getTime();
    return !isNaN(t) && t >= startDate.getTime() && t <= endDate.getTime();
  });

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await generateFortnightlyPDF(periodEvents, {
        startDate,
        endDate,
        format,
        baseUrl: window.location.origin,
        includeCalendarButtons
      });
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      showToast('Failed to generate the PDF. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyWhatsApp = async () => {
    const text = generateWhatsAppSummary(periodEvents, startDate, endDate);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="bulletin-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        ></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div
          ref={modalPanelRef}
          className="inline-block align-bottom bg-white dark:bg-slate-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-slate-200 dark:border-slate-700"
        >
          {/* Header */}
          <div className="bg-slate-50 dark:bg-slate-850 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white" id="bulletin-modal-title">
                  Upcoming Events Digest
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Generate upcoming events digest for Board & Staff
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* 1. Date Range Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                1. Date Range
              </label>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl mb-3 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('2weeks')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all text-center ${
                    activePreset === '2weeks'
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-600'
                  }`}
                >
                  2 Weeks
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('1week')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all text-center ${
                    activePreset === '1week'
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-600'
                  }`}
                >
                  1 Week
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('1month')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all text-center ${
                    activePreset === '1month'
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-600'
                  }`}
                >
                  1 Month
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('all')}
                  className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all text-center ${
                    activePreset === 'all'
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-600'
                  }`}
                >
                  All
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">From</span>
                  <input
                    type="date"
                    value={startDateStr}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">To</span>
                  <input
                    type="date"
                    value={endDateStr}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Format Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                2. Document Layout Style
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat('executive')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    format === 'executive'
                      ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/30 text-brand-900 dark:text-brand-100 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <LayoutGrid className={`w-5 h-5 ${format === 'executive' ? 'text-brand-600' : 'text-slate-400'}`} />
                    {format === 'executive' && <span className="text-[10px] bg-brand-600 text-white font-bold px-1.5 py-0.5 rounded">Selected</span>}
                  </div>
                  <div>
                    <span className="block text-xs font-bold">Executive Digest</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Visual cards with badges & flyer thumbnails. Ideal for Board.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('compact')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    format === 'compact'
                      ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/30 text-brand-900 dark:text-brand-100 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <List className={`w-5 h-5 ${format === 'compact' ? 'text-brand-600' : 'text-slate-400'}`} />
                    {format === 'compact' && <span className="text-[10px] bg-brand-600 text-white font-bold px-1.5 py-0.5 rounded">Selected</span>}
                  </div>
                  <div>
                    <span className="block text-xs font-bold">Compact Table</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Dense agenda table format. Fits maximum events.
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Events Included Preview Banner */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <span>
                  <strong>{matchingEvents.length}</strong> event{matchingEvents.length !== 1 ? 's' : ''} in selected period
                </span>
              </div>
              <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">
                Ready to export
              </span>
            </div>

            {/* Calendar Buttons Toggle (Digital vs Print-Ready) */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeCalendarButtons}
                  onChange={(e) => setIncludeCalendarButtons(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Interactive calendar buttons (+Outlook, +Google)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {includeCalendarButtons
                      ? 'Buttons will be included for quick 1-click addition. Uncheck for a clean print-ready paper copy.'
                      : 'Clean print-ready mode: web buttons are hidden for neat printing.'}
                  </span>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2.5">
              <button
                onClick={handleDownloadPDF}
                disabled={isGenerating}
                className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Generating Branded PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Events Digest PDF</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCopyWhatsApp}
                className="w-full py-2.5 px-4 bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800/60 rounded-xl font-medium text-xs transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Copied WhatsApp Text to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 text-green-600" />
                    <span>Copy Formatted WhatsApp Summary</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-850 px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Official Cork City Partnership branding applied.</span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-white dark:bg-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FortnightlyBulletinModal;
