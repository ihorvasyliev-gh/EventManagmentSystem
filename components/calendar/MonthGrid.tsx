import React, { useMemo } from 'react';
import { type Event } from '../../types';
import { getDaysInMonth, getFirstDayOfMonth, isSameDay } from '../../utils/date';
import MonthDayCell from './MonthDayCell';
import MobileDayPanel from './MobileDayPanel';
import { toDayKey } from './shared';

interface MonthGridProps {
  currentDate: Date;
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

/** The month as a grid of days (weeks start on Monday); on phones, the tapped day's events below */
const MonthGrid: React.FC<MonthGridProps> = ({
  currentDate,
  eventsByDayKey,
  isMobile,
  selectedDay,
  onSelectedDayChange,
  onOpenDay,
  onEventClick,
  canAdd,
  onAddEventForDate
}) => {
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const calendarDays = useMemo(() => {
    const days: Array<Date | null> = [];
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    }
    // Complete the last week so the grid lines don't end raggedly
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    return days;
  }, [currentDate, daysInMonth, firstDay]);

  const selectedDayEvents = useMemo(
    () => (selectedDay ? eventsByDayKey.get(toDayKey(selectedDay)) || [] : []),
    [selectedDay, eventsByDayKey]
  );

  return (
    <>
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-[9px] sm:text-[10px] 2xl:text-xs font-semibold text-slate-400 uppercase tracking-widest px-0.5">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-slate-100 dark:border-slate-800">
        {calendarDays.map((day, idx) =>
          day ? (
            <MonthDayCell
              key={day.toISOString()}
              day={day}
              dayEvents={eventsByDayKey.get(toDayKey(day)) || []}
              isMobile={isMobile}
              isSelected={isMobile && !!selectedDay && isSameDay(day, selectedDay)}
              canAdd={canAdd}
              onEventClick={onEventClick}
              onAddEventForDate={onAddEventForDate}
              onSelect={(d) => onSelectedDayChange(prev => (prev && isSameDay(prev, d) ? null : d))}
              onOpenDay={onOpenDay}
            />
          ) : (
            <div key={`empty-${idx}`} className="min-h-[3.25rem] sm:min-h-[6.5rem] lg:min-h-[8rem] bg-slate-50/50 dark:bg-slate-800/30 border-b border-r border-slate-100 dark:border-slate-800"></div>
          )
        )}
      </div>

      {isMobile && !selectedDay && (
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
          Tap a day to see its events
        </p>
      )}

      {isMobile && selectedDay && (
        <MobileDayPanel
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
