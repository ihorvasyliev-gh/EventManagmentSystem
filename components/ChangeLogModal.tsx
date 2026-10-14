import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import ModalShell from './ModalShell';
import { ChangeList, historyIcon } from './EventHistory';
import { type Event } from '../types';
import { type ChangeLogEntry, type ChangeLogView, CHANGE_LOG_PAGE, getChangeLog } from '../services/historyService';
import { APP_LOCALE } from '../utils/date';

interface ChangeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Events on the calendar, to open the one an entry is about */
  events: Event[];
  onOpenEvent: (event: Event) => void;
  /** Entries after this are marked New (when the log was opened before) */
  newSince: Date | null;
}

const whatTheyDid = (entry: ChangeLogEntry): string => {
  if (entry.action === 'created') return entry.authorRole ? 'created' : 'sent in';
  if (entry.action === 'deleted') return entry.changes && 'declined' in entry.changes ? 'declined' : 'deleted';
  if (entry.changes && 'deleted_instance' in entry.changes) return 'removed a date from';
  return entry.action === 'updated' ? 'changed' : entry.action.replace(/_/g, ' ');
};

const EMPTY: Record<ChangeLogView, { title: string; text: string }> = {
  staff: {
    title: 'No changes by staff yet',
    text: 'Staff can change the events they sent in. When they do, what they changed shows here.'
  },
  deleted: {
    title: 'No deleted events',
    text: 'When an event is deleted or a submission declined, it shows here: who did it, and what the event was.'
  },
  all: { title: 'Nothing here yet', text: 'Changes to events show here as they are made.' }
};

const formatWhen = (date: Date) =>
  date.toLocaleString(APP_LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Admins: what changed on the calendar, newest first. "Staff edits" lists the changes staff made
 * to their own events (they go live without review), with each field's old and new value;
 * "Deleted", who deleted which event (or declined which submission) and what it was.
 */
const ChangeLogModal: React.FC<ChangeLogModalProps> = ({ isOpen, onClose, events, onOpenEvent, newSince }) => {
  const [view, setView] = useState<ChangeLogView>('staff');
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (which: ChangeLogView, before?: Date) => {
    setLoading(true);
    setError(null);
    try {
      const page = await getChangeLog({ view: which, before });
      setEntries((prev) => (before ? [...prev, ...page] : page));
      setHasMore(page.length === CHANGE_LOG_PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change log could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setEntries([]);
    void load(view);
  }, [isOpen, view, load]);

  const openEvent = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    onClose();
    onOpenEvent(event);
  };

  const tab = (value: ChangeLogView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === value}
      onClick={() => setView(value)}
      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        view === value
          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Change log"
      subtitle="Who changed which event, and what changed"
      icon={<History className="w-5 h-5" />}
      size="lg"
    >
      <div role="tablist" aria-label="Show" className="flex gap-1 p-1 mb-4 rounded-xl bg-slate-100 dark:bg-slate-900/60 w-full sm:w-fit">
        {tab('staff', 'Staff edits')}
        {tab('deleted', 'Deleted')}
        {tab('all', 'All activity')}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="py-10 text-center">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {EMPTY[view].title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {EMPTY[view].text}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {entries.map((entry) => {
          const isNew = !!newSince && entry.timestamp > newSince && entry.authorRole === 'staff' && entry.action === 'updated';
          const onCalendar = events.some((e) => e.id === entry.eventId);
          return (
            <li key={entry.id} className={`rounded-leaf-xs border p-3.5 sm:p-4 ${isNew ? 'border-brand-300 dark:border-brand-700 bg-brand-50/40 dark:bg-brand-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">{historyIcon(entry.action)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]">
                    <span className="font-semibold text-slate-900 dark:text-white">{entry.userName}</span>{' '}
                    {whatTheyDid(entry)}{' '}
                    {onCalendar ? (
                      <button
                        type="button"
                        onClick={() => openEvent(entry.eventId)}
                        className="font-semibold text-brand-700 dark:text-brand-300 underline underline-offset-2 hover:no-underline text-left"
                      >
                        {entry.eventTitle}
                      </button>
                    ) : (
                      <span className="font-semibold">{entry.eventTitle}</span>
                    )}
                    {isNew && (
                      <span className="ml-2 align-middle px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white">New</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatWhen(entry.timestamp)}
                    {entry.authorRole === 'staff' && ' · staff'}
                    {entry.authorRole === 'admin' && ' · admin'}
                  </p>
                  <ChangeList changes={entry.changes} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {loading && (
        <p className="py-6 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      )}
      {!loading && hasMore && entries.length > 0 && (
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => void load(view, entries[entries.length - 1].timestamp)}
            className="cta px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
          >
            Show older changes
          </button>
        </div>
      )}
    </ModalShell>
  );
};

export default ChangeLogModal;
