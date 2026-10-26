import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { type Event } from '../../types';
import { isSameDay } from '../../utils/date';
import MonthDayCell from './MonthDayCell';
import MobileDayPanel from './MobileDayPanel';
import { toDayKey } from './shared';

interface MonthGridProps {
  currentDate: Date;
  /** Today at midnight (moves on at midnight) */
  today: Date;
  eventsByDayKey: Map<string, Event[]>;
  isMobile: boolean;
  /** Phones: the day whose events show under the grid */
  selectedDay: Date | null;
  onSelectedDayChange: React.Dispatch<React.SetStateAction<Date | null>>;
  /** Desktop: all of a day's events in a popover */
  onOpenDay: (day: Date) => void;
  onEventClick: (event: Event) => void;
  /** Admins can start a new event on a day */
  canAdd: boolean;
  onAddEventForDate?: (date: Date) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** One array for every day without events, so those cells don't re-render for a new empty one */
const NO_EVENTS: Event[] = [];

/** The month as a grid of days (weeks start on Monday); on phones, the tapped day's events below */
const MonthGrid: React.FC<MonthGridProps> = ({
  currentDate,
  today,
  eventsByDayKey,
  isMobile,
  selectedDay,
  onSelectedDayChange,
  onOpenDay,
  onEventClick,
  canAdd,
  onAddEventForDate
}) => {
  // Whole weeks from Monday to Sunday: the first and last weeks are completed with the days of
  // the months before and after, shown paler
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const leading = (first.getDay() + 6) % 7;
    const trailing = (7 - last.getDay()) % 7;
    const days: Date[] = [];
    for (let i = 1 - leading; i <= last.getDate() + trailing; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [currentDate]);

  // Phones: after a tap, bring the day's events (under the grid) into view
  const panelRef = useRef<HTMLDivElement>(null);
  const revealPanelRef = useRef(false);
  const toggleSelectedDay = useCallback(
    (d: Date) => {
      revealPanelRef.current = true;
      onSelectedDayChange((prev) => (prev && isSameDay(prev, d) ? null : d));
    },
    [onSelectedDayChange]
  );
  useEffect(() => {
    if (!revealPanelRef.current || !selectedDay) return;
    revealPanelRef.current = false;
    const panel = panelRef.current;
    if (!panel) return;
    // As much of the panel as fits between the navbar and the tab bar, from its top
    const rect = panel.getBoundingClientRect();
    const visibleBottom = window.innerHeight - 88;
    const overflow = rect.top + Math.min(rect.height, visibleBottom - 72) - visibleBottom;
    if (overflow <= 0) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: overflow, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedDay]);

  // Large screens: when today's week is below the fold (late in the month on a laptop), scroll
  // just enough to show it
  const todayCellRef = useRef<HTMLDivElement>(null);
  const showsToday = today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth();
  useEffect(() => {
    if (isMobile || !showsToday) return;
    const cell = todayCellRef.current;
    if (!cell || cell.getBoundingClientRect().bottom <= window.innerHeight) return;
    cell.scrollIntoView?.({ block: 'nearest' });
  }, [isMobile, showsToday]);

  const selectedDayEvents = useMemo(
    () => (selectedDay ? eventsByDayKey.get(toDayKey(selectedDay)) || [] : []),
    [selectedDay, eventsByDayKey]
  );

  return (
    <>
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-[11px] lg:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:tracking-widest px-0.5">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-slate-100 dark:border-slate-800">
        {calendarDays.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <MonthDayCell
              key={day.toISOString()}
              cellRef={isToday ? todayCellRef : undefined}
              day={day}
              dayEvents={eventsByDayKey.get(toDayKey(day)) || NO_EVENTS}
              isToday={isToday}
              isPast={day < today}
              isOutside={day.getMonth() !== currentDate.getMonth()}
              isMobile={isMobile}
              isSelected={isMobile && !!selectedDay && isSameDay(day, selectedDay)}
              canAdd={canAdd}
              onEventClick={onEventClick}
              onAddEventForDate={onAddEventForDate}
              onSelect={toggleSelectedDay}
              onOpenDay={onOpenDay}
            />
          );
        })}
      </div>

      {isMobile && !selectedDay && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Tap a day to see its events
        </p>
      )}

      {isMobile && selectedDay && (
        <MobileDayPanel
          panelRef={panelRef}
          day={selectedDay}
          events={selectedDayEvents}
          onEventClick={onEventClick}
          onAdd={canAdd && onAddEventForDate ? () => onAddEventForDate(selectedDay) : undefined}
          onClose={() => onSelectedDayChange(null)}
        />
      )}
    </>
  );
};

export default MonthGrid;
