import React from 'react';
import { Calendar as CalendarIcon, ChevronDown, Clock, MapPin } from 'lucide-react';
import { type Event } from '../../types';
import { isSameDay, isMultiDayEvent, formatClock, APP_LOCALE } from '../../utils/date';
import { getCategoryColor, getCategoryDotColor } from '../WeekView';
import { clickableProps, PendingBadge } from './shared';

interface AgendaDayGroupsProps {
  events: Event[];
  muted?: boolean;
  onEventClick: (event: Event) => void;
}

/** The month's events as a list, under a sticky header per day */
const AgendaDayGroups: React.FC<AgendaDayGroupsProps> = ({ events, muted = false, onEventClick }) => {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const dateKey = event.date.toDateString();
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([dateKey, dayEvents]) => {
        const date = new Date(dateKey);
        const isToday = isSameDay(date, new Date());
        const dayOfWeek = date.toLocaleDateString(APP_LOCALE, { weekday: 'short' });
        const month = date.toLocaleDateString(APP_LOCALE, { month: 'short' });

        return (
          <div key={dateKey} className={muted ? 'opacity-75' : ''}>
            {/* Day Header */}
            <div className={`sticky top-0 z-10 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 ${isToday ? 'bg-brand-50 dark:bg-brand-900/30' : 'bg-slate-50 dark:bg-slate-800/50'} backdrop-blur-sm`}>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-bold ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-slate-900 dark:text-white'}`}>
                  {date.getDate()}
                </span>
                <div className="flex flex-col">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {dayOfWeek}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {month}
                  </span>
                </div>
              </div>
              {isToday && (
                <span className="ml-auto px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] bg-brand-600 dark:bg-brand-400 text-white dark:text-slate-900 rounded">
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
                          <div className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold whitespace-nowrap">
                            until {event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })}
                          </div>
                        ) : event.endDate ? (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            to {formatClock(event.endDate)}
                          </div>
                        ) : null}
                      </div>

                      {/* Event Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <div className={`w-1 h-full min-h-[2.5rem] rounded-full ${getCategoryDotColor(event.category)}`}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colorClass}`}>
                                {event.category || 'Event'}
                              </span>
                              <PendingBadge event={event} />
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                                {event.title}
                              </h3>
                            </div>
                            {isMulti && event.endDate && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 my-1 rounded text-[11px] font-semibold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                                <span>🗓 {event.date.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })} – {event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })}</span>
                              </div>
                            )}
                            {event.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
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

interface AgendaViewProps {
  /** The month's events that are still to come (or on today) */
  upcomingEvents: Event[];
  /** The month's events that finished before today */
  pastEvents: Event[];
  showPast: boolean;
  onToggleShowPast: () => void;
  onEventClick: (event: Event) => void;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  onNextMonth: () => void;
}

/** Agenda: the month's upcoming events by day, with the past ones folded away at the bottom */
const AgendaView: React.FC<AgendaViewProps> = ({
  upcomingEvents,
  pastEvents,
  showPast,
  onToggleShowPast,
  onEventClick,
  hasActiveFilters,
  onClearFilters,
  onNextMonth
}) => {
  if (upcomingEvents.length === 0 && pastEvents.length === 0) {
    return (
      <div className="p-8 sm:p-12 text-center text-sm flex flex-col items-center gap-3">
        <CalendarIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-slate-500 dark:text-slate-400">
          {hasActiveFilters ? 'No events match your search or filters this month.' : 'No events this month.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Clear search & filters
            </button>
          )}
          <button
            type="button"
            onClick={onNextMonth}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
          >
            Next month →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {upcomingEvents.length === 0 && pastEvents.length > 0 && (
        <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-sm italic">
          No upcoming events this month.
        </div>
      )}

      {/* Upcoming Events in chronological order */}
      {upcomingEvents.length > 0 && <AgendaDayGroups events={upcomingEvents} onEventClick={onEventClick} />}

      {/* Past Events Collapsible Section at the bottom */}
      {pastEvents.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 pb-4">
          <div className="px-3 sm:px-4">
            <button
              type="button"
              onClick={onToggleShowPast}
              className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all touch-manipulation shadow-xs"
              aria-expanded={showPast}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{showPast ? 'Hide' : 'Show'} Past Events ({pastEvents.length})</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showPast && (
            <div className="mt-3 opacity-80 divide-y divide-slate-100 dark:divide-slate-800">
              <AgendaDayGroups events={pastEvents} muted onEventClick={onEventClick} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgendaView;
