import React, { useMemo, useState } from 'react';
import { BarChart3, Check, Copy } from 'lucide-react';
import ModalShell from './ModalShell';
import { type Event } from '../types';
import { computePeriodStats, statsSummaryText } from '../utils/eventStats';
import { formatLocalDate } from '../utils/date';
import { getCategoryDotColor } from './WeekView';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  recurrenceExceptions: Map<string, Date[]>;
}

type PeriodKey = 'this-quarter' | 'last-quarter' | 'this-year' | 'last-year' | 'last-12-months' | 'custom';

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'this-quarter', label: 'This quarter' },
  { key: 'last-quarter', label: 'Last quarter' },
  { key: 'this-year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
  { key: 'last-12-months', label: 'Last 12 months' },
  { key: 'custom', label: 'Dates…' }
];

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const parseDay = (value: string): Date | null => {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const DAY = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

const periodRange = (key: PeriodKey, now: Date): { start: Date; end: Date } => {
  const quarter = Math.floor(now.getMonth() / 3);
  switch (key) {
    case 'last-quarter':
      return { start: new Date(now.getFullYear(), quarter * 3 - 3, 1), end: endOfDay(new Date(now.getFullYear(), quarter * 3, 0)) };
    case 'this-year':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(new Date(now.getFullYear(), 11, 31)) };
    case 'last-year':
      return { start: new Date(now.getFullYear() - 1, 0, 1), end: endOfDay(new Date(now.getFullYear() - 1, 11, 31)) };
    case 'last-12-months':
      return { start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1), end: endOfDay(now) };
    default:
      return { start: new Date(now.getFullYear(), quarter * 3, 1), end: endOfDay(new Date(now.getFullYear(), quarter * 3 + 3, 0)) };
  }
};

const Tile: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="rounded-leaf-xs border border-slate-200 dark:border-slate-700 px-4 py-3">
    <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
  </div>
);

/** One row: label, a bar for the size (anchored at the left), and the number written out */
const BarRow: React.FC<{ label: React.ReactNode; value: number; max: number; detail?: string }> = ({ label, value, max, detail }) => (
  <tr className="align-middle">
    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-sm text-slate-700 dark:text-slate-200 w-[45%]">{label}</th>
    <td className="py-1.5 pr-3 w-[40%]" aria-hidden="true">
      <div className="h-2.5 rounded-r bg-brand-600 dark:bg-brand-400" style={{ width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0}%` }} />
    </td>
    <td className="py-1.5 text-right text-sm tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
      {value}
      {detail && <span className="text-slate-500 dark:text-slate-400"> · {detail}</span>}
    </td>
  </tr>
);

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section>
    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">{title}</h3>
    {note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note}</p>}
    <div className="mt-2">{children}</div>
  </section>
);

/** Admins: how many events ran in a period, by category, month and venue (for Board reports) */
const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, events, recurrenceExceptions }) => {
  const [period, setPeriod] = useState<PeriodKey>('this-quarter');
  const now = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState(() => formatLocalDate(periodRange('this-quarter', now).start));
  const [customTo, setCustomTo] = useState(() => formatLocalDate(periodRange('this-quarter', now).end));
  const [copied, setCopied] = useState(false);

  const range = useMemo(() => {
    if (period !== 'custom') return periodRange(period, now);
    const start = parseDay(customFrom);
    const end = parseDay(customTo);
    return start && end && start <= end ? { start, end: endOfDay(end) } : null;
  }, [period, now, customFrom, customTo]);

  const stats = useMemo(
    () => (range ? computePeriodStats(events, recurrenceExceptions, range.start, range.end) : null),
    [events, recurrenceExceptions, range]
  );
  const periodLabel = range ? `${DAY.format(range.start)} – ${DAY.format(range.end)}` : '';

  const copySummary = async () => {
    if (!stats) return;
    const text = statsSummaryText(stats, periodLabel);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the summary:', text);
    }
  };

  const maxCategory = Math.max(0, ...(stats?.byCategory.map((c) => c.occurrences) ?? []));
  const maxMonth = Math.max(0, ...(stats?.byMonth.map((m) => m.occurrences) ?? []));
  const maxVenue = Math.max(0, ...(stats?.topVenues.map((v) => v.occurrences) ?? []));

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Statistics"
      subtitle={periodLabel || 'Pick a period'}
      icon={<BarChart3 className="w-5 h-5" />}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="cta h-11 px-5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
            Close
          </button>
          <button type="button" onClick={copySummary} disabled={!stats} className="cta inline-flex items-center justify-center gap-2 h-11 px-5 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy as text'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                  period === p.key
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="block text-xs font-semibold mb-1">From</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3" />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="block text-xs font-semibold mb-1">To</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3" />
              </label>
              {!range && <p className="text-sm text-red-700 dark:text-red-300" role="alert">The start date must be before the end date.</p>}
            </div>
          )}
        </div>

        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile value={stats.events} label={stats.events === 1 ? 'event' : 'events'} />
              <Tile value={stats.occurrences} label={stats.occurrences === 1 ? 'date held' : 'dates held'} />
              <Tile value={stats.venues} label={stats.venues === 1 ? 'venue' : 'venues'} />
              <Tile value={stats.submitted} label="sent in by staff" />
            </div>

            {stats.occurrences === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No published events in this period.</p>
            ) : (
              <>
                <Section title="By category" note="Dates held · different events">
                  <table className="w-full">
                    <tbody>
                      {stats.byCategory.map((c) => (
                        <BarRow
                          key={c.name}
                          label={<span className="inline-flex items-center gap-2"><span className={`w-2 h-2 rounded-full shrink-0 ${getCategoryDotColor(c.name)}`} aria-hidden="true" />{c.name}</span>}
                          value={c.occurrences}
                          max={maxCategory}
                          detail={`${c.events} ${c.events === 1 ? 'event' : 'events'}`}
                        />
                      ))}
                    </tbody>
                  </table>
                </Section>

                <Section title="By month" note="Dates held">
                  <table className="w-full">
                    <tbody>
                      {stats.byMonth.map((m) => <BarRow key={m.key} label={m.label} value={m.occurrences} max={maxMonth} />)}
                    </tbody>
                  </table>
                </Section>

                {stats.topVenues.length > 0 && (
                  <Section title="Busiest venues" note="Dates held">
                    <table className="w-full">
                      <tbody>
                        {stats.topVenues.map((v) => <BarRow key={v.name} label={<span className="break-words">{v.name}</span>} value={v.occurrences} max={maxVenue} />)}
                      </tbody>
                    </table>
                  </Section>
                )}
              </>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Published events only. A repeating or multi-date event counts once per date; deleted dates are left out.
            </p>
          </>
        )}
      </div>
    </ModalShell>
  );
};

export default StatsModal;
