import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, Copy, ExternalLink, ImageIcon, MapPin, User } from 'lucide-react';
import { getCategoryDotColor } from './WeekView';
import type { OverlapEntry } from '../utils/duplicateDetection';

interface OverlapListProps {
  entries: OverlapEntry[];
  /** Label for one of the new event's sessions ("Fri 2 Oct") */
  formatWhen: (d: Date) => string;
  /** Opens an existing event in full (admin) */
  onOpenEvent?: (event: OverlapEntry['event']) => void;
  /** Wording for the person submitting (rather than the admin approving) */
  forSubmitter?: boolean;
  /** Extra line under the list */
  note?: React.ReactNode;
}

const VISIBLE = 3;
const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const timeRange = (ev: OverlapEntry['event']) => {
  const s = new Date(ev.date);
  const e = ev.endDate ? new Date(ev.endDate) : null;
  return e ? `${clock(s)} – ${clock(e)}` : clock(s);
};
const posterOf = (ev: OverlapEntry['event']): string | undefined =>
  ev.posterUrl || ev.attachments?.find((a: { type?: string }) => a.type === 'image')?.url;

const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

const Badge: React.FC<{ reason: OverlapEntry['duplicate'] }> = ({ reason }) =>
  reason === 'title' ? (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200">
      <Copy className="w-3 h-3" /> Possible duplicate
    </span>
  ) : reason === 'venue' ? (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
      <MapPin className="w-3 h-3" /> Same place
    </span>
  ) : null;

/** Poster + description of an existing event */
const Details: React.FC<{ ev: OverlapEntry['event']; compact?: boolean }> = ({ ev, compact }) => {
  const poster = posterOf(ev);
  return (
    <div className="flex gap-3">
      {poster ? (
        <img src={poster} alt="" className={`${compact ? 'w-16 h-20' : 'w-24 h-32'} shrink-0 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100`} />
      ) : (
        <span className={`${compact ? 'w-16 h-20' : 'w-24 h-32'} shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 flex items-center justify-center`}>
          <ImageIcon className="w-6 h-6" />
        </span>
      )}
      <p className={`text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line break-words ${compact ? 'line-clamp-5' : 'line-clamp-[10]'}`}>
        {ev.description?.trim() || <span className="italic text-slate-400">No description</span>}
      </p>
    </div>
  );
};

/**
 * Events that run at the same time as a new one, each with time, venue and who added it.
 * Hover (mouse) previews the poster and description; tap expands them in place.
 */
const OverlapList: React.FC<OverlapListProps> = ({ entries, formatWhen, onOpenEvent, forSubmitter, note }) => {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hover, setHover] = useState<{ entry: OverlapEntry; top: number; left: number } | null>(null);
  if (entries.length === 0) return null;

  const duplicates = entries.filter((e) => e.duplicate === 'title').length;
  const shown = showAll ? entries : entries.slice(0, VISIBLE);
  const keyOf = (e: OverlapEntry) => String(e.event.instanceKey ?? e.event.id);

  const handleEnter = (entry: OverlapEntry, el: HTMLElement) => {
    if (!canHover()) return;
    const r = el.getBoundingClientRect();
    const width = 320;
    const left = r.right + 12 + width < window.innerWidth ? r.right + 12 : Math.max(8, r.left - width - 12);
    setHover({ entry, top: Math.min(Math.max(8, r.top), window.innerHeight - 220), left });
  };

  return (
    <div className={`rounded-xl border ${duplicates ? 'border-red-200 dark:border-red-900/70 bg-red-50/60 dark:bg-red-950/20' : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20'} p-3`}>
      <p className={`flex items-center gap-2 text-xs font-semibold ${duplicates ? 'text-red-800 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {duplicates
          ? forSubmitter
            ? 'A similar event may already be on the calendar — please check it isn’t the same one'
            : 'Looks like it may already be on the calendar'
          : forSubmitter
            ? 'Something else is on at the same time'
            : `${entries.length} ${entries.length === 1 ? 'event' : 'events'} at the same time`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((entry) => {
          const ev = entry.event;
          const key = keyOf(entry);
          const isOpen = expanded === key;
          return (
            <li key={key} className="rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : key)}
                onMouseEnter={(e) => handleEnter(entry, e.currentTarget)}
                onMouseLeave={() => setHover(null)}
                aria-expanded={isOpen}
                className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getCategoryDotColor(ev.category)}`} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white break-words">{ev.title}</span>
                    <Badge reason={entry.duplicate} />
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {entry.when.map(formatWhen).join(', ')} · {timeRange(ev)}
                    </span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="break-words">{ev.location}</span></span>
                    )}
                    {ev.submitterName && (
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {ev.submitterName}</span>
                    )}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 animate-fade-in">
                  <div className="pt-2"><Details ev={ev} compact /></div>
                  {onOpenEvent && (
                    <button
                      type="button"
                      onClick={() => onOpenEvent(ev)}
                      className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open event
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {entries.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2 hover:no-underline"
        >
          {showAll ? 'Show fewer' : `Show ${entries.length - VISIBLE} more`}
        </button>
      )}

      {note && <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{note}</div>}

      {hover && createPortal(
        <div
          className="fixed z-[80] w-80 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl pointer-events-none animate-fade-in"
          style={{ top: hover.top, left: hover.left }}
          role="tooltip"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2 break-words">{hover.entry.event.title}</p>
          <Details ev={hover.entry.event} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default OverlapList;
