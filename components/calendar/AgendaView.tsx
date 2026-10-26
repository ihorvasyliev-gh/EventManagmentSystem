import React, { useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronDown, Clock, MapPin, Repeat } from 'lucide-react';
import { type Event } from '../../types';
import { isSameDay, isMultiDayEvent, formatClock, APP_LOCALE } from '../../utils/date';
import { isRecurringEvent } from '../../utils/recurrence';
import { getCategoryColor, getCategoryDotColor } from '../WeekView';
import { clickableProps, PendingBadge } from './shared';

interface AgendaDayGroupsProps {
  events: Event[];
  /** Today at midnight: earlier days are shown paler */
  today: Date;
  onEventClick: (event: Event) => void;
  /** Search results: mark repeating events, which are listed once at their next date */
  markSeries?: boolean;
}

const monthLabel = (date: Date) => date.toLocaleDateString(APP_LOCALE, { month: 'long', year: 'numeric' });

/** Events as a list under a sticky header per day, with the month named whenever it changes */
export const AgendaDayGroups: React.FC<AgendaDayGroupsProps> = ({ events, today, onEventClick, markSeries = false }) => {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const dateKey = event.date.toDateString();
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
  }

  let previousMonth = '';
  return (
    <>
      {Array.from(groups.entries()).map(([dateKey, dayEvents]) => {
        const date = new Date(dateKey);
        const isToday = isSameDay(date, today);
        const isPast = date < today;
        const dayOfWeek = date.toLocaleDateString(APP_LOCALE, { weekday: 'short' });
        const month = date.toLocaleDateString(APP_LOCALE, { month: 'short' });
        const thisMonth = monthLabel(date);
        const newMonth = thisMonth !== previousMonth;
        previousMonth = thisMonth;

        return (
          <div key={dateKey}>
            {newMonth && (
              <h3 className="px-3 sm:px-4 pt-4 pb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-300 border-b border-slate-100 dark:border-slate-800">
                {thisMonth}
              </h3>
            )}
            {/* Sticks under the navbar while the day's events scroll by; opaque so they don't show through */}
            <div className={`sticky top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-16 z-10 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 ${isToday ? 'bg-brand-50 dark:bg-[#361B26]' : 'bg-slate-50 dark:bg-slate-850'}`}>
              <div className="flex items-baseline gap-2">
                {/* A day that has passed: its date paler (not the whole day faded, which would make its text too faint to read) */}
                <span className={`text-2xl sm:text-3xl font-bold ${isToday ? 'text-brand-600 dark:text-brand-400' : isPast ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                  {date.getDate()}
                </span>
                <div className="flex flex-col">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {dayOfWeek}
                  </span>
                  {/* A shade darker on today's tint, where the usual grey is too faint to read */}
                  <span className={`text-[11px] ${isToday ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {month}
                  </span>
                </div>
              </div>
              {isToday && (
                <span className="ml-auto px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] bg-brand-600 dark:bg-brand-400 text-white dark:text-slate-900 rounded">
                  Today
                </span>
              )}
            </div>

            {/* Events for this day */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {dayEvents.map(event => {
                const colorClass = getCategoryColor(event.category);
                const isMulti = isMultiDayEvent(event.date, event.endDate);

                return (
                  <div
                    key={event.instanceKey ?? event.id}
                    {...clickableProps(() => onEventClick(event))}
                    className="p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group touch-manipulation min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    <div className="flex gap-3 items-start">
                      {/* Time */}
                      <div className="flex-shrink-0 w-16 sm:w-20 text-right">
                        <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                          {formatClock(event.date)}
                        </div>
                        {isMulti && event.endDate ? (
                          <div className="text-[11px] text-brand-600 dark:text-brand-400 font-semibold whitespace-nowrap">
                            until {event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })}
                          </div>
                        ) : event.endDate ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            to {formatClock(event.endDate)}
                          </div>
                        ) : null}
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <div className={`w-1 self-stretch min-h-[2.5rem] rounded-full ${getCategoryDotColor(event.category)}`}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${colorClass}`}>
                                {event.category || 'Event'}
                              </span>
                              <PendingBadge event={event} />
                              {markSeries && isRecurringEvent(event) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  <Repeat className="h-3 w-3" aria-hidden="true" /> Repeats
                                </span>
                              )}
                            </div>
                            {/* Its own line: in the badges' row a short title sat beside them and a long one under them */}
                            <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 [overflow-wrap:anywhere]">
                              {event.title}
                            </h4>
                            {isMulti && event.endDate && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 my-1 rounded text-[11px] font-semibold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                                <span>🗓 {event.date.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })} – {event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })}</span>
                              </div>
                            )}
                            {/* One line: the whole description is in the event's window */}
                            {event.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                {event.description}
                              </p>
                            )}
                            {event.location && (
                              <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-1">
                                <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

/**
 * A folded group of events (past ones), opened with a full-width button; `compact` is a slim
 * line, for the top of a list
 */
export const FoldedEvents: React.FC<{
  label: string;
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
  children: React.ReactNode;
}> = ({ label, open, onToggle, compact = false, children }) => (
  <div className={compact ? '' : 'py-3'}>
    <div className={compact ? '' : 'px-3 sm:px-4'}>
      <button
        type="button"
        onClick={onToggle}
        className={compact
          ? 'w-full flex items-center justify-between px-3 sm:px-4 py-2.5 min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors touch-manipulation'
          : 'w-full flex items-center justify-between px-4 py-3 min-h-[44px] bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all touch-manipulation shadow-xs'}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>{label}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
    {open && <div className={`${compact ? '' : 'mt-3 '}divide-y divide-slate-100 dark:divide-slate-800`}>{children}</div>}
  </div>
);

const smallButton = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors';

interface AgendaViewProps {
  /** From the start of the list (today, or the first of a month browsed to) on, soonest first */
  events: Event[];
  /** This month's events that finished before today */
  earlierEvents: Event[];
  showEarlier: boolean;
  onToggleShowEarlier: () => void;
  today: Date;
  onEventClick: (event: Event) => void;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  /** More events are planned after the last month loaded */
  canLoadMore: boolean;
  onLoadMore: () => void;
  /** The last day loaded */
  loadedUntil: Date;
}

/**
 * Agenda: one list from today on, month after month, loading the next month as it is scrolled
 * to; this month's earlier events folded away at the top
 */
const AgendaView: React.FC<AgendaViewProps> = ({
  events,
  earlierEvents,
  showEarlier,
  onToggleShowEarlier,
  today,
  onEventClick,
  hasActiveFilters,
  onClearFilters,
  canLoadMore,
  onLoadMore,
  loadedUntil
}) => {
  // Load the next month when the end of the list comes near; a new observer after every load
  // answers at once if the end is still in sight (months with nothing on)
  const endRef = useRef<HTMLDivElement>(null);
  const loadedUntilTime = loadedUntil.getTime();
  useEffect(() => {
    const end = endRef.current;
    if (!end || !canLoadMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore();
    }, { rootMargin: '400px 0px' });
    observer.observe(end);
    return () => observer.disconnect();
  }, [canLoadMore, onLoadMore, loadedUntilTime]);

  const until = loadedUntil.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {earlierEvents.length > 0 && (
        <FoldedEvents
          label={`${showEarlier ? 'Hide' : 'Show'} earlier this month (${earlierEvents.length})`}
          open={showEarlier}
          onToggle={onToggleShowEarlier}
          compact
        >
          <AgendaDayGroups events={earlierEvents} today={today} onEventClick={onEventClick} />
        </FoldedEvents>
      )}

      {events.length > 0 ? (
        <AgendaDayGroups events={events} today={today} onEventClick={onEventClick} />
      ) : (
        <div className="p-8 sm:p-12 text-center text-sm flex flex-col items-center gap-3">
          <CalendarIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">
            {hasActiveFilters ? `No events match your search or filters until ${until}.` : `No events planned until ${until}.`}
          </p>
          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className={`${smallButton} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700`}
            >
              Clear search & filters
            </button>
          )}
        </div>
      )}

      <div ref={endRef} className="px-4 py-5 text-center">
        {canLoadMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            className={`${smallButton} text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50`}
          >
            Show events after {loadedUntil.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'long' })}
          </button>
        ) : (
          events.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Nothing else is planned yet.</p>
        )}
      </div>
    </div>
  );
};

export default AgendaView;
