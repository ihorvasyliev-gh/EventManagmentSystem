import React, { useState } from 'react';
import { Download, Calendar, FileSpreadsheet, Link2, Check, FileText, ExternalLink } from 'lucide-react';
import { type Event } from '../types';
import { exportToICal, exportToExcel, downloadFile, downloadBlob, isPublished } from '../utils/export';
import { getEventsWithRelated } from '../services/eventService';
import { expandRecurringEvents } from '../utils/recurrence';
import ModalShell from './ModalShell';
import Tabs from './Tabs';
import SubscribeOptions from './SubscribeOptions';
import { useToast } from '../contexts/ToastContext';
import { useMedia } from '../hooks/useMedia';

const EXPORT_RANGE_YEARS = 2;

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The events shown now (after search and filters) */
  events: Event[];
  /** Every event, when search or filters are on: the export can take all of them instead */
  allEvents?: Event[];
  /** Deleted dates of repeating events (the calendar already has them) */
  recurrenceExceptions: Map<string, Date[]>;
  onOpenFortnightlyBulletin?: () => void;
}

// Published events only (strictly excluding drafts and pending submissions)
const publishedOnly = (list: Event[]) => list.filter(e => e.status !== 'draft' && (e.status === 'published' || !e.status));

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, events, allEvents, recurrenceExceptions, onOpenFortnightlyBulletin }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'subscribe'>('export');
  const [exportFormat, setExportFormat] = useState<'ical' | 'excel'>('ical');
  const [exporting, setExporting] = useState(false);
  // With search or filters on, the export says so and can take everything instead
  const [scope, setScope] = useState<'shown' | 'all'>('shown');
  const { showToast } = useToast();

  const isPhone = useMedia('(max-width: 639px)');

  if (!isOpen) return null;

  const shown = publishedOnly(events);
  const everything = allEvents ? publishedOnly(allEvents) : null;
  const toExport = everything && scope === 'all' ? everything : shown;
  const plural = (n: number) => `${n} published ${n === 1 ? 'event' : 'events'}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const eventsWithRelated = await getEventsWithRelated(toExport);

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

      const expanded = expandRecurringEvents(eventsWithRelated, rangeStart, rangeEnd, recurrenceExceptions);

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

  // Phones: no Close (the sheet has its own close button and pulls down), and no footer
  // at all on Subscribe, which has nothing else in it
  const exportFooter = (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="cta hidden sm:inline-flex justify-center items-center rounded border border-slate-300 dark:border-slate-600 px-4 py-2.5 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
      >
        Close
      </button>
      {activeTab === 'export' && (
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || toExport.length === 0}
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

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Export & subscribe"
      subtitle="Download the calendar or keep it synced in your own calendar app"
      icon={<Download className="w-5 h-5" />}
      footer={isPhone && activeTab !== 'export' ? undefined : exportFooter}
    >
      <Tabs
        label="Export"
        className="mb-5"
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'export', label: 'Download', icon: <Download className="h-4 w-4" aria-hidden="true" /> },
          { id: 'subscribe', label: 'Subscribe', icon: <Link2 className="h-4 w-4" aria-hidden="true" /> }
        ]}
      />

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
                <span className="block text-xs text-brand-700 dark:text-brand-300 mt-0.5">The branded PDF of the upcoming events for the Board & staff.</span>
              </span>
              <ExternalLink className="w-4 h-4 shrink-0 text-brand-500" />
            </button>
          )}

          {everything && (
            <fieldset className="p-4 rounded-leaf-sm border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30">
              <legend className="sr-only">Which events</legend>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Your search or filters are on</p>
              <div className="mt-2 space-y-1.5">
                {([
                  ['shown', `Only the ${plural(shown.length)} that ${shown.length === 1 ? 'matches' : 'match'}`],
                  ['all', `All ${plural(everything.length)}`]
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2.5 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                    <input
                      type="radio"
                      name="export-scope"
                      value={value}
                      checked={scope === value}
                      onChange={() => setScope(value)}
                      disabled={exporting}
                      className="w-4 h-4 accent-brand-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="eyebrow w-full mb-3">
              Export {plural(toExport.length)} as
            </legend>
            {formatOption('ical', <Calendar className="h-5 w-5 text-cat-enterprise-500 dark:text-cat-enterprise-400" />, 'Calendar file (.ics)', 'Import into Outlook, Google Calendar or Apple Calendar')}
            {formatOption('excel', <FileSpreadsheet className="h-5 w-5 text-ccp-green-500 dark:text-ccp-green-400" />, 'Excel spreadsheet (.xlsx)', 'Every event with dates, venues, posters and contacts')}
          </fieldset>
        </div>
      ) : (
        <SubscribeOptions compact />
      )}
    </ModalShell>
  );
};

export default ExportModal;
