import React, { useState, useRef } from 'react';
import { X, FileText, Download, Copy, Check, Calendar, MessageSquare, LayoutGrid, List } from 'lucide-react';
import { Event } from '../types';
import { generateFortnightlyPDF, generateWhatsAppSummary } from '../utils/pdfExport';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

interface FortnightlyBulletinModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
}

const FortnightlyBulletinModal: React.FC<FortnightlyBulletinModalProps> = ({
  isOpen,
  onClose,
  events
}) => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalPanelRef);

  // Default dates: Today -> +14 days
  const [startDateStr, setStartDateStr] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });

  const [endDateStr, setEndDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    d.setHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 10);
  });

  const [format, setFormat] = useState<'executive' | 'compact'>('executive');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const startDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = new Date(`${endDateStr}T23:59:59`);

  // Count events in range
  const matchingEvents = events.filter((e) => {
    const d = e.date instanceof Date ? e.date : new Date(e.date);
    const t = d.getTime();
    return !isNaN(t) && t >= startDate.getTime() && t <= endDate.getTime();
  });

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await generateFortnightlyPDF(events, {
        startDate,
        endDate,
        format,
        baseUrl: window.location.origin
      });
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyWhatsApp = async () => {
    const text = generateWhatsAppSummary(events, startDate, endDate);
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
                  Fortnightly Bulletin
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Generate 2-week upcoming events digest for the Board & staff
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
                1. Date Range (Next 2 Weeks)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">From</span>
                  <input
                    type="date"
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">To</span>
                  <input
                    type="date"
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
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
                    <span>Download Fortnightly PDF Bulletin</span>
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
