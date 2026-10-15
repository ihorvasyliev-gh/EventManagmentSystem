import React from 'react';
import { Plus } from 'lucide-react';
import { type Event } from '../../types';
import { isSameDay, formatClock, APP_LOCALE } from '../../utils/date';
import { getCategoryColor, getCategoryDotColor } from '../WeekView';
import { clickableProps, formatEventRangeText } from './shared';

interface MonthDayCellProps {
  day: Date;
  dayEvents: Event[];
  isToday: boolean;
  /** Before today: shown paler, so the eye goes to today and what's ahead */
  isPast: boolean;
  /** A day of the month before or after, completing the first or last week */
  isOutside: boolean;
  isMobile: boolean;
  /** Phones: the day whose events show under the grid */
  isSelected: boolean;
  /** Admins can start a new event on a day */
  canAdd: boolean;
  onEventClick: (event: Event) => void;
  onAddEventForDate?: (date: Date) => void;
  /** Phones: show this day's events under the grid (again to hide them) */
  onSelect: (day: Date) => void;
  /** Desktop: all of the day's events in a popover */
  onOpenDay: (day: Date) => void;
  cellRef?: React.Ref<HTMLDivElement>;
}

/** One day of the month grid: up to three events (dots on phones) and "+N more" */
const MonthDayCell: React.FC<MonthDayCellProps> = ({
  day,
  dayEvents,
  isToday,
  isPast,
  isOutside,
  isMobile,
  isSelected,
  canAdd,
  onEventClick,
  onAddEventForDate,
  onSelect,
  onOpenDay,
  cellRef
}) => {
  const hasEvents = dayEvents.length > 0;
  const activate = () => (isMobile ? onSelect(day) : onOpenDay(day));
  const dayName = day.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayLabel = `${dayName}, ${dayEvents.length === 0 ? 'no events' : dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`}`;
  const muted = (isPast || isOutside) && !isToday;

  return (
    <div
      ref={cellRef}
      aria-current={isToday ? 'date' : undefined}
      onClick={() => {
        if (isMobile || hasEvents || canAdd) activate();
      }}
      className={`min-h-[3.25rem] sm:min-h-[6.5rem] lg:min-h-[7rem] short:lg:min-h-[5.5rem] scroll-mt-20 scroll-mb-4 group border-b border-r border-slate-100 dark:border-slate-800 p-1 sm:p-2 transition-colors ${
        isMobile ? 'cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/60' : `hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${hasEvents || canAdd ? 'cursor-pointer' : ''}`
      } ${
        isSelected
          ? 'bg-brand-50/70 dark:bg-brand-900/30 ring-2 ring-brand-500 ring-inset'
          : isToday
          ? 'bg-brand-50/60 dark:bg-brand-900/25 ring-2 ring-brand-600/80 dark:ring-brand-400/80 ring-inset'
          : muted
          ? 'bg-slate-50/70 dark:bg-slate-900/60'
          : 'bg-white dark:bg-slate-900/0'
      }`}
    >
      <div className={`flex items-center ${isMobile ? 'justify-center' : 'justify-between'} gap-1 mb-1 sm:mb-2 ${
        isToday ? 'text-brand-700 dark:text-brand-300' : muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 group-hover:text-slate-900 dark:text-slate-200'
      }`}>
        {/* The day itself is a button, so the keyboard and screen readers can open (or pick) it too */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); activate(); }}
          aria-label={dayLabel}
          aria-pressed={isMobile ? isSelected : undefined}
          className="text-xs sm:text-sm font-semibold rounded-full min-w-0 min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
        >
          {isToday ? (
            <span className="bg-brand-600 dark:bg-brand-400 text-white dark:text-slate-900 px-2 py-0.5 sm:py-1 rounded-full font-bold text-xs sm:text-sm shadow-sm">{day.getDate()}</span>
          ) : (
            <span className="px-1">{day.getDate()}</span>
          )}
        </button>
        {!isMobile && canAdd && onAddEventForDate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddEventForDate(day); }}
            className="p-1 min-w-0 min-h-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden flex items-center justify-center rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900/30 dark:hover:text-brand-400 transition-all"
            title="Add event"
            aria-label={`Add event on ${dayName}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mobile: Category dots + count pill (No 3-letter truncations) */}
      {isMobile ? (
        <div className={`flex flex-col items-center justify-center gap-1 mt-1 ${muted ? 'saturate-50 opacity-60' : ''}`}>
          {hasEvents && (
            <div className="flex items-center justify-center gap-1 flex-wrap max-w-full px-0.5">
              {dayEvents.slice(0, 3).map((ev, i) => (
                <span
                  key={ev.instanceKey ?? `${ev.id}-${i}`}
                  className={`w-2 h-2 rounded-full ${getCategoryDotColor(ev.category)}`}
                />
              ))}
            </div>
          )}
          {dayEvents.length > 3 && (
            <span className="text-[11px] leading-none font-bold text-slate-500 dark:text-slate-400">
              +{dayEvents.length - 3}
            </span>
          )}
        </div>
      ) : (
        /* Desktop: Event pills with time, full title, and +N more popover trigger */
        // Past days' events lose most of their colour rather than their contrast, so they stay readable
        <div className={`space-y-0.5 sm:space-y-1 ${muted ? 'grayscale-[70%] hover:grayscale-0 focus-within:grayscale-0' : ''}`}>
          {dayEvents.slice(0, 3).map(ev => {
            const colorClass = getCategoryColor(ev.category);
            const statusClass = ev.status === 'draft' ? 'dashed-border italic' : '';
            const rangeStr = formatEventRangeText(ev);
            const itemTitle = `${ev.title}${rangeStr ? ` (${rangeStr})` : ''}${ev.status === 'draft' ? ' — pending review' : ''}`;
            const timeStr = formatClock(ev.date);
            // Later days of a multi-day event: its start time belongs to the first day only
            const isContinuation = !!rangeStr && !isSameDay(ev.date, day);

            return (
              <div
                key={ev.instanceKey ?? ev.id}
                {...clickableProps(() => onEventClick(ev))}
                className={`w-full min-w-0 text-left ${colorClass} border-l-2 text-[11px] 2xl:text-xs px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-sm leading-snug font-semibold transition-all hover:opacity-80 cursor-pointer touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${statusClass}`}
                title={itemTitle}
              >
                {/* The clamp sits inside the padding: on the padded chip itself the next line showed through the bottom padding.
                    Two lines from tablets up (one on short laptop screens); below that the cells are too narrow for more than a word or two */}
                <span className="block truncate md:whitespace-normal md:line-clamp-2 short:md:line-clamp-1 md:[overflow-wrap:anywhere]">
                  {!isContinuation && <span className="hidden lg:inline font-bold tabular-nums mr-1">{timeStr}</span>}
                  {rangeStr && <span className="mr-0.5 opacity-75 font-bold">↔</span>}
                  {ev.title}
                </span>
              </div>
            );
          })}
          {dayEvents.length > 3 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDay(day);
              }}
              className="w-full text-left text-[11px] 2xl:text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 py-0.5 px-1 rounded hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
            >
              +{dayEvents.length - 3} more
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Re-renders only when its own day changes (not when the popover opens or another day is picked)
export default React.memo(MonthDayCell);
