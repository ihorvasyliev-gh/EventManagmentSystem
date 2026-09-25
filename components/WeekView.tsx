import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Event, UserRole, EventCategory } from '../types';
import { isSameDay, isMultiDayEvent } from '../utils/date';
import { Clock, MapPin, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export interface WeekViewProps {
  currentDate: Date;
  events: Event[];
  onEventClick: (event: Event) => void;
  onAddEventForDate?: (date: Date) => void;
  userRole?: UserRole;
}

export const getMondayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0);
};

export const getWeekDays = (date: Date): Date[] => {
  const monday = getMondayOfWeek(date);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    days.push(next);
  }
  return days;
};

const isEventOnDay = (event: Event, day: Date): boolean => {
  const s = new Date(event.date);
  s.setHours(0, 0, 0, 0);
  if (!event.endDate || !isMultiDayEvent(event.date, event.endDate)) {
    return isSameDay(event.date, day);
  }
  const e = new Date(event.endDate);
  e.setHours(23, 59, 59, 999);
  const target = new Date(day);
  target.setHours(12, 0, 0, 0);
  return target >= s && target <= e;
};

export const getCategoryColor = (category?: EventCategory): string => {
  if (!category) return 'bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-100';

  const colors: Record<string, string> = {
    'Enterprise & Employment': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    'Community & Family': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    'Education & Training': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    'Special Visits & Celebrations': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    'Public Information Session': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
    'Health & Wellbeing': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
    'Other': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
    meeting: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    workshop: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    social: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100',
    training: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    community: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    celebration: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    other: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
  };
  return colors[category] || colors.Other || colors.other;
};

export const getCategoryDotColor = (category?: EventCategory): string => {
  if (!category) return 'bg-brand-500';
  const colors: Record<string, string> = {
    'Enterprise & Employment': 'bg-blue-500',
    'Community & Family': 'bg-emerald-500',
    'Education & Training': 'bg-purple-500',
    'Special Visits & Celebrations': 'bg-amber-500',
    'Public Information Session': 'bg-cyan-500',
    'Health & Wellbeing': 'bg-rose-500',
    'Other': 'bg-slate-400',
    meeting: 'bg-blue-500',
    workshop: 'bg-purple-500',
    social: 'bg-pink-500',
    training: 'bg-emerald-500',
    community: 'bg-orange-500',
    celebration: 'bg-amber-500',
    other: 'bg-slate-400'
  };
  return colors[category] || 'bg-brand-500';
};

const formatTimeRange = (event: Event): string => {
  const startStr = event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (event.endDate) {
    if (isMultiDayEvent(event.date, event.endDate)) {
      const endDayStr = event.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
      return `${startStr} – ${endDayStr}`;
    }
    const endStr = event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${startStr} – ${endStr}`;
  }
  return startStr;
};

const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onAddEventForDate,
  userRole
}) => {
  const { theme } = useTheme();
  const today = useMemo(() => new Date(), []);

  // Compute Monday to Sunday
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Map events to each day
  const eventsByDay = useMemo(() => {
    return weekDays.map(day => {
      const matching = events
        .filter(ev => isEventOnDay(ev, day))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return {
        day,
        events: matching
      };
    });
  }, [weekDays, events]);

  // Mobile selected day tab (defaults to today if in current week, else 0)
  const initialDayIndex = useMemo(() => {
    const idx = weekDays.findIndex(d => isSameDay(d, today));
    return idx !== -1 ? idx : 0;
  }, [weekDays, today]);

  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState<number>(initialDayIndex);

  useEffect(() => {
    const idx = weekDays.findIndex(d => isSameDay(d, today));
    setSelectedMobileDayIndex(idx !== -1 ? idx : 0);
  }, [currentDate, weekDays, today]);

  // Mobile swipe gestures: switch day (the container is marked data-own-swipe so the
  // calendar doesn't also switch week). Mostly-vertical gestures are scrolling, not swipes.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndRef.current = null;
    touchStartRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchEndRef.current;
    touchStartRef.current = null;
    if (!start || !end) return;
    const distance = start.x - end.x;
    if (Math.abs(distance) < Math.abs(start.y - end.y) * 1.5) return;
    if (distance > 50 && selectedMobileDayIndex < 6) {
      setSelectedMobileDayIndex(prev => prev + 1);
    } else if (distance < -50 && selectedMobileDayIndex > 0) {
      setSelectedMobileDayIndex(prev => prev - 1);
    }
  };

  const cardKeyDown = (event: Event) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEventClick(event);
    }
  };

  const activeMobileGroup = eventsByDay[selectedMobileDayIndex] || eventsByDay[0];

  return (
    <div className={`p-2 sm:p-4 lg:p-6 transition-colors ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
      {/* Mobile: 7-day pill strip / tabs */}
      <div className="block lg:hidden mb-4">
        <div className="grid grid-cols-7 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          {eventsByDay.map((group, idx) => {
            const isSelected = idx === selectedMobileDayIndex;
            const isToday = isSameDay(group.day, today);
            const count = group.events.length;
            const dayName = group.day.toLocaleDateString('default', { weekday: 'narrow' });

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedMobileDayIndex(idx)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all min-h-[48px] touch-manipulation ${
                  isSelected
                    ? 'bg-brand-600 text-white shadow-sm font-semibold'
                    : isToday
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60'
                }`}
                aria-label={`${group.day.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })}, ${count} events`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                  <span className="sm:hidden">{dayName}</span>
                  <span className="hidden sm:inline">{group.day.toLocaleDateString('default', { weekday: 'short' })}</span>
                </span>
                <span className="text-sm font-extrabold">{group.day.getDate()}</span>
                <div className="h-1.5 flex items-center justify-center gap-0.5 mt-0.5">
                  {count > 0 && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-brand-500 dark:bg-brand-400'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile: Active day card column */}
        <div
          className="mt-3"
          data-own-swipe
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Mobile active day header */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-t-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedMobileDayIndex === 0}
                onClick={() => setSelectedMobileDayIndex(prev => Math.max(0, prev - 1))}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {activeMobileGroup.day.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {isSameDay(activeMobileGroup.day, today) && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-brand-500 text-white rounded-full">
                    Today
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={selectedMobileDayIndex === 6}
                onClick={() => setSelectedMobileDayIndex(prev => Math.min(6, prev + 1))}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {onAddEventForDate && userRole === UserRole.ADMIN && (
              <button
                type="button"
                onClick={() => onAddEventForDate(activeMobileGroup.day)}
                className="p-1.5 rounded-lg text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors flex items-center gap-1 text-xs font-semibold"
                aria-label="Add event for this day"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>

          {/* Mobile active day events */}
          <div className="p-3 bg-white dark:bg-slate-900/40 rounded-b-xl border-x border-b border-slate-200 dark:border-slate-700 min-h-[16rem] space-y-2.5">
            {activeMobileGroup.events.length === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs italic border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                No events
              </div>
            ) : (
              activeMobileGroup.events.map(event => {
                const colorClass = getCategoryColor(event.category);
                const timeText = formatTimeRange(event);
                const isMulti = isMultiDayEvent(event.date, event.endDate);

                return (
                  <div
                    key={event.instanceKey ?? event.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEventClick(event)}
                    onKeyDown={cardKeyDown(event)}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-sm hover:shadow active:scale-[0.99] transition-all cursor-pointer space-y-2 touch-manipulation group min-h-[44px]"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colorClass} max-w-[150px] truncate`}>
                        {event.category || 'Event'}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {timeText}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400">
                      {isMulti && <span className="mr-1 text-brand-600 dark:text-brand-400 font-bold">↔</span>}
                      {event.title}
                    </h4>

                    {event.location && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Desktop / Tablet: 7 Day Columns Grid */}
      <div className="hidden lg:grid lg:grid-cols-7 gap-2 xl:gap-3">
        {eventsByDay.map((group, idx) => {
          const isToday = isSameDay(group.day, today);
          const dayName = group.day.toLocaleDateString('default', { weekday: 'short' });

          return (
            <div
              key={idx}
              className={`flex flex-col rounded-xl border transition-colors ${
                isToday
                  ? 'border-brand-300 dark:border-brand-700 bg-brand-50/20 dark:bg-brand-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-2.5 rounded-t-xl border-b flex items-center justify-between ${
                  isToday
                    ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider">{dayName}</span>
                  <span
                    className={`text-xs font-extrabold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {group.day.getDate()}
                  </span>
                  {isToday && (
                    <span className="hidden xl:inline text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-brand-500 text-white">
                      Today
                    </span>
                  )}
                </div>

                {onAddEventForDate && userRole === UserRole.ADMIN && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEventForDate(group.day);
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900/50 dark:hover:text-brand-400 transition-all min-w-[24px] min-h-[24px] flex items-center justify-center"
                    title={`Add event for ${dayName}`}
                    aria-label={`Add event for ${dayName}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Event Cards in Day Column */}
              <div className="p-2 space-y-2 flex-1 min-h-[18rem] overflow-y-auto max-h-[36rem]">
                {group.events.length === 0 ? (
                  <div className="h-28 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs italic border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    No events
                  </div>
                ) : (
                  group.events.map(event => {
                    const colorClass = getCategoryColor(event.category);
                    const timeText = formatTimeRange(event);
                    const isMulti = isMultiDayEvent(event.date, event.endDate);
                    const statusClass = event.status === 'draft' ? 'opacity-70 border-dashed' : '';

                    return (
                      <div
                        key={event.instanceKey ?? event.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEventClick(event)}
                        onKeyDown={cardKeyDown(event)}
                        className={`p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:border-brand-400 dark:hover:border-brand-500 shadow-xs hover:shadow transition-all cursor-pointer space-y-1 touch-manipulation group ${statusClass}`}
                      >
                        {/* Category & Time */}
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colorClass} max-w-[90px] truncate`}>
                            {event.category || 'Event'}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {timeText}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-400">
                          {isMulti && <span className="mr-1 text-brand-600 dark:text-brand-400 font-bold">↔</span>}
                          {event.title}
                        </h4>

                        {/* Location */}
                        {event.location && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-slate-400" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(WeekView);
