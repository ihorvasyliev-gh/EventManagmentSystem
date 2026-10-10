import React from 'react';
import { MapPin, Calendar as CalendarIcon, Download, Tag, User, Link2, Repeat, Maximize2 } from 'lucide-react';
import type { Attachment, Event, EventHistoryEntry } from '../../types';
import { formatDate, formatTime, isSameDay, formatClock, APP_LOCALE } from '../../utils/date';
import LazyImage from '../LazyImage';
import { PosterDownloadButton } from '../PosterLightbox';
import EventHistory from '../EventHistory';
import { getCategoryColor } from '../WeekView';
import AddToCalendarMenu from './AddToCalendarMenu';

interface EventDetailsProps {
  event: Event;
  attachments: Attachment[];
  history: EventHistoryEntry[];
  /** The other upcoming dates of a series */
  seriesDates: { upcoming: Event[]; more: number };
  onOpenPoster: () => void;
  /** Copies a link to the event (absent: no button) */
  onCopyLink?: () => void;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
}

/** The event window's read-only view: poster, when and where, details, add to calendar, history */
const EventDetails: React.FC<EventDetailsProps> = ({
  event, attachments, history, seriesDates, onOpenPoster, onCopyLink, calendarOpen, onToggleCalendar, onCloseCalendar
}) => (
  <div className="space-y-6">
    {/* Header Info */}
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {event.status === 'draft' && <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">Draft</span>}
        {event.category && (
          <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-[0.12em] ${getCategoryColor(event.category)}`}>
            {event.category}
          </span>
        )}
        {(event.submitterName || event.submitterEmail) && (
          <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
            <User className="w-3 h-3 shrink-0 text-slate-400" />
            <span className="shrink-0">{event.submitterName || 'Staff Member'}</span>
            {event.submitterEmail && <span className="min-w-0 truncate text-slate-400 text-[11px]">({event.submitterEmail})</span>}
          </span>
        )}
      </div>

      <div className="flex justify-between items-start gap-3">
        <h2 className={`min-w-0 text-2xl sm:text-[1.75rem] font-semibold leading-tight [overflow-wrap:anywhere] text-slate-900 dark:text-white`}>
          {event.title}
        </h2>
        {onCopyLink && (
          <button
            onClick={onCopyLink}
            className="shrink-0 -mt-1 p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
            title="Copy link to this event"
            aria-label="Copy link to this event"
          >
            <Link2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>

    {/* Poster & Attachments */}
    {(event.posterUrl || attachments.length > 0) && (
      <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
        {event.posterUrl && (
          <div className="relative group">
            <button
              type="button"
              onClick={onOpenPoster}
              className="block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              aria-label="Open full poster"
              title="Open full poster"
            >
              <LazyImage
                src={event.posterUrl}
                alt={event.title}
                className="w-full h-56"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <Maximize2 className="h-3.5 w-3.5" /> View full poster
                </span>
              </span>
            </button>
            <PosterDownloadButton
              url={event.posterUrl}
              title={event.title}
              className="absolute bottom-3 right-3 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-all text-slate-700 dark:text-slate-200 hover:scale-105"
            />
          </div>
        )}
        {attachments.length > 0 && (
          <div className={`p-4 ${event.posterUrl ? 'border-t border-slate-100 dark:border-slate-800' : ''} bg-slate-50/50 dark:bg-slate-800/30`}>
            <h4 className="text-[10px] font-bold text-brand-600 dark:text-brand-300 uppercase tracking-[0.14em] mb-2">Attachments</h4>
            <div className="grid gap-2">
              {attachments.map((att, idx) => (
                <a key={idx} href={att.url} download={att.name} className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 hover:border-brand-200 transition-colors group">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
                  <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    )}

    {/* Details Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <div className="flex items-center p-3 rounded-leaf-xs border border-slate-200 dark:border-slate-700">
        <CalendarIcon className="h-5 w-5 mr-3 text-brand-600 dark:text-brand-300 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-brand-600 dark:text-brand-300 font-bold uppercase tracking-[0.14em]">Date & Time</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 break-words">
            {event.endDate && !isSameDay(event.date, event.endDate) ? (
              <>
                <span>{formatDate(event.date)} at {formatTime(event.date)}</span>
                <span className="text-slate-400 dark:text-slate-500 mx-1.5 font-bold">→</span>
                <span>{formatDate(event.endDate)} at {formatTime(event.endDate)}</span>
              </>
            ) : event.endDate ? (
              <>
                {formatDate(event.date)}, <span className="whitespace-nowrap">{formatTime(event.date)} – {formatTime(event.endDate)}</span>
              </>
            ) : (
              <>
                {formatDate(event.date)} at {formatTime(event.date)}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center p-3 rounded-leaf-xs border border-slate-200 dark:border-slate-700">
        <MapPin className="h-5 w-5 mr-3 text-brand-600 dark:text-brand-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-brand-600 dark:text-brand-300 font-bold uppercase tracking-[0.14em]">Location</p>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 break-words block">
            {event.location}
          </a>
        </div>
      </div>
    </div>

    {seriesDates.upcoming.length > 0 && (
      <div className="p-3 rounded-leaf-xs border border-slate-200 dark:border-slate-700">
        <p className="text-[10px] text-brand-600 dark:text-brand-300 font-bold uppercase tracking-[0.14em] flex items-center gap-1.5">
          <Repeat className="h-3 w-3" /> Other upcoming dates
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {seriesDates.upcoming.map((o) => (
            <li key={o.instanceKey ?? o.date.getTime()} className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
              {o.date.toLocaleDateString(APP_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatClock(o.date)}
              {o.location?.trim() && o.location.trim() !== event.location?.trim() && (
                <span className="font-normal text-slate-500 dark:text-slate-400"> · {o.location.trim()}</span>
              )}
            </li>
          ))}
          {seriesDates.more > 0 && (
            <li className="px-1 py-1 text-xs text-slate-500 dark:text-slate-400">
              +{seriesDates.more} more in the next 12 months
            </li>
          )}
        </ul>
      </div>
    )}

    {event.tags && event.tags.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {event.tags.map((tag, idx) => (
          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <Tag className="w-3 h-3 mr-1.5 opacity-50" />
            {tag}
          </span>
        ))}
      </div>
    )}

    <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300">
      <p className="whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{event.description}</p>
    </div>

    <AddToCalendarMenu event={event} open={calendarOpen} onToggle={onToggleCalendar} onClose={onCloseCalendar} />

    {history.length > 0 && <EventHistory history={history} />}
  </div>
);

export default EventDetails;
