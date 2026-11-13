import React, { useState, useMemo, useEffect, useRef } from 'react';
import { type Event, UserRole, type EventCategory } from '../types';
import { isSameDay, isMultiDayEvent, formatClock, APP_LOCALE } from '../utils/date';
import { Clock, MapPin, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { shortCategoryLabel } from '../constants/categories';
import { PendingBadge } from './calendar/shared';

export interface WeekViewProps {
  /** Today at midnight (moves on at midnight) */
  today: Date;
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

// Category colours (Tailwind cat-* scales, mirrored for the PDF in constants/categoryColors.ts)
const CATEGORY_TONE: Record<string, string> = {
  'Enterprise & Employment': 'enterprise',
  'Community & Family': 'community',
  'Education & Training': 'education',
  'Special Visits & Celebrations': 'special',
  'Public Information Session': 'info',
  'Health & Wellbeing': 'health',
  Other: 'other',
  // Older category names
  meeting: 'enterprise',
  workshop: 'education',
  social: 'health',
  training: 'community',
  community: 'special',
  celebration: 'special',
  other: 'other'
};

// Full class names, so Tailwind finds them. The border colour only shows where a chip sets a border width.
const CHIP_CLASSES: Record<string, string> = {
  enterprise: 'bg-cat-enterprise-100 text-cat-enterprise-800 border-cat-enterprise-500 dark:bg-cat-enterprise-900 dark:text-cat-enterprise-100 dark:border-cat-enterprise-400',
  community: 'bg-cat-community-100 text-cat-community-800 border-cat-community-500 dark:bg-cat-community-900 dark:text-cat-community-100 dark:border-cat-community-400',
  education: 'bg-cat-education-100 text-cat-education-800 border-cat-education-500 dark:bg-cat-education-900 dark:text-cat-education-100 dark:border-cat-education-400',
  special: 'bg-cat-special-100 text-cat-special-800 border-cat-special-500 dark:bg-cat-special-900 dark:text-cat-special-100 dark:border-cat-special-400',
  info: 'bg-cat-info-100 text-cat-info-800 border-cat-info-500 dark:bg-cat-info-900 dark:text-cat-info-100 dark:border-cat-info-400',
  health: 'bg-cat-health-100 text-cat-health-800 border-cat-health-500 dark:bg-cat-health-900 dark:text-cat-health-100 dark:border-cat-health-400',
  other: 'bg-cat-other-100 text-cat-other-800 border-cat-other-400 dark:bg-cat-other-800 dark:text-cat-other-100 dark:border-cat-other-500'
};

const DOT_CLASSES: Record<string, string> = {
  enterprise: 'bg-cat-enterprise-500',
  community: 'bg-cat-community-500',
  education: 'bg-cat-education-500',
  special: 'bg-cat-special-500',
  info: 'bg-cat-info-500',
  health: 'bg-cat-health-500',
  other: 'bg-cat-other-400'
};

// The left edge of an event's card, in its category's colour (the month grid's chips and the agenda's bar)
const ACCENT_CLASSES: Record<string, string> = {
  enterprise: 'border-l-cat-enterprise-500 dark:border-l-cat-enterprise-400',
  community: 'border-l-cat-community-500 dark:border-l-cat-community-400',
  education: 'border-l-cat-education-500 dark:border-l-cat-education-400',
  special: 'border-l-cat-special-500 dark:border-l-cat-special-400',
  info: 'border-l-cat-info-500 dark:border-l-cat-info-400',
  health: 'border-l-cat-health-500 dark:border-l-cat-health-400',
  other: 'border-l-cat-other-400 dark:border-l-cat-other-500'
};

export const getCategoryColor = (category?: EventCategory): string => {
  if (!category) return 'bg-brand-50 text-brand-800 border-brand-500 dark:bg-brand-900 dark:text-brand-100 dark:border-brand-400';
  return CHIP_CLASSES[CATEGORY_TONE[category] ?? 'other'];
};

export const getCategoryDotColor = (category?: EventCategory): string => {
  if (!category) return 'bg-brand-500';
  return DOT_CLASSES[CATEGORY_TONE[category]] ?? 'bg-brand-500';
};

/** A 3px left edge in the category's colour, for a card that has a border */
export const getCategoryAccent = (category?: EventCategory): string =>
  `border-l-[3px] ${category ? ACCENT_CLASSES[CATEGORY_TONE[category] ?? 'other'] : 'border-l-brand-500 dark:border-l-brand-400'}`;

const formatTimeRange = (event: Event): string => {
  const startStr = formatClock(event.date);
  if (event.endDate) {
    if (isMultiDayEvent(event.date, event.endDate)) {
      const endDayStr = event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' });
      return `${startStr} – ${endDayStr}`;
    }
    const endStr = formatClock(event.endDate);
    return `${startStr} – ${endStr}`;
  }
  return startStr;
};

const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  today,
  events,
  onEventClick,
  onAddEventForDate,
  userRole
}) => {
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
    <div className="p-2 sm:p-4 lg:px-6 transition-colors text-slate-900 dark:text-slate-100">
      {/* Mobile: 7-day pill strip / tabs */}
      <div className="block lg:hidden mb-4">
        <div className="grid grid-cols-7 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          {eventsByDay.map((group, idx) => {
            const isSelected = idx === selectedMobileDayIndex;
            const isToday = isSameDay(group.day, today);
            const count = group.events.length;
            const dayName = group.day.toLocaleDateString(APP_LOCALE, { weekday: 'narrow' });

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
                aria-label={`${group.day.toLocaleDateString(APP_LOCALE, { weekday: 'long', month: 'short', day: 'numeric' })}, ${count} events`}
              >
                <span className="text-[11px] uppercase font-bold tracking-wider opacity-80">
                  <span className="sm:hidden">{dayName}</span>
                  <span className="hidden sm:inline">{group.day.toLocaleDateString(APP_LOCALE, { weekday: 'short' })}</span>
                </span>
                <span className="text-sm font-extrabold">{group.day.getDate()}</span>
                {/* A dot in each event's category colour (up to three), as in the month grid */}
                <div className="h-1.5 flex items-center justify-center gap-0.5 mt-0.5" aria-hidden="true">
                  {group.events.slice(0, 3).map((ev, i) => (
                    <span
                      key={ev.instanceKey ?? `${ev.id}-${i}`}
                      className={`w-1.5 h-1.5 rounded-full ${getCategoryDotColor(ev.category)} ${isSelected ? 'ring-1 ring-white' : ''}`}
                    />
                  ))}
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
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {activeMobileGroup.day.toLocaleDateString(APP_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })}
                </h3>
                {/* Not on the narrowest phones, where it pushed "Add" out; the day strip above marks today too */}
                {isSameDay(activeMobileGroup.day, today) && (
                  <span className="hidden min-[360px]:inline px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-brand-500 text-white rounded-full">
                    Today
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={selectedMobileDayIndex === 6}
                onClick={() => setSelectedMobileDayIndex(prev => Math.min(6, prev + 1))}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {onAddEventForDate && userRole === UserRole.ADMIN && (
              <button
                type="button"
                onClick={() => onAddEventForDate(activeMobileGroup.day)}
                className="shrink-0 p-1.5 rounded-lg text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/60 transition-colors flex items-center justify-center gap-1 text-xs font-semibold"
                aria-label="Add event for this day"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Add</span>
              </button>
            )}
          </div>

          {/* Mobile active day events */}
          <div className="p-3 bg-white dark:bg-slate-900/40 rounded-b-xl border-x border-b border-slate-200 dark:border-slate-700 min-h-[16rem] space-y-2.5">
            {activeMobileGroup.events.length === 0 ? (
              <div className="h-36 flex flex-col items-center justify-center text-slate-400 text-xs italic border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
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
                    className={`p-3 rounded-xl border border-slate-200 dark:border-slate-700 ${getCategoryAccent(event.category)} bg-white dark:bg-slate-800 shadow-sm hover:shadow active:scale-[0.99] transition-all cursor-pointer space-y-2 touch-manipulation group min-h-[44px] ${event.status === 'draft' ? 'border-dashed' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="flex items-center gap-1 flex-wrap min-w-0 max-w-full">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${colorClass} min-w-0 max-w-full truncate`}>
                          {event.category || 'Event'}
                        </span>
                        <PendingBadge event={event} />
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

      {/* Large screens: the week as one grid of seven days, in the month grid's look */}
      <div className="hidden lg:grid lg:grid-cols-7 border-t border-l border-slate-100 dark:border-slate-800">
        {eventsByDay.map((group, idx) => {
          const isToday = isSameDay(group.day, today);
          const isPast = group.day < today;
          const dayName = group.day.toLocaleDateString(APP_LOCALE, { weekday: 'short' });
          const fullDay = group.day.toLocaleDateString(APP_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

          return (
            <div
              key={idx}
              aria-current={isToday ? 'date' : undefined}
              className={`flex flex-col min-w-0 border-r border-b border-slate-100 dark:border-slate-800 transition-colors ${
                isToday
                  ? 'bg-brand-50/60 dark:bg-brand-900/25'
                  : isPast
                  ? 'bg-slate-50/70 dark:bg-slate-900/60'
                  : ''
              }`}
            >
              {/* The day: its number first, as in the agenda; today under a raspberry line */}
              <div
                className={`relative flex items-center justify-between gap-1 pl-2.5 pr-1.5 xl:pl-3 py-2 border-b border-slate-100 dark:border-slate-800 ${
                  isToday ? 'before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-brand-600 dark:before:bg-brand-400' : ''
                }`}
              >
                <h3 className="flex items-baseline gap-1.5 min-w-0" aria-label={fullDay}>
                  <span
                    className={`text-xl xl:text-2xl font-bold tabular-nums ${
                      isToday ? 'text-brand-600 dark:text-brand-300' : isPast ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {group.day.getDate()}
                  </span>
                  <span className={`text-[11px] xl:text-xs font-bold uppercase tracking-wider ${isToday ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {dayName}
                  </span>
                  {isToday && (
                    <span className="hidden xl:inline self-center ml-0.5 text-[11px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-brand-600 dark:bg-brand-400 text-white dark:text-slate-900">
                      Today
                    </span>
                  )}
                </h3>

                {onAddEventForDate && userRole === UserRole.ADMIN && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEventForDate(group.day);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900/50 dark:hover:text-brand-300 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                    title={`Add event for ${dayName}`}
                    aria-label={`Add event for ${dayName}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* The day's events, in columns that reach the bottom of the window; past days lose most of
                  their colour, as in the month grid */}
              <div className={`p-1.5 xl:p-2 space-y-1.5 xl:space-y-2 flex-1 min-h-[max(14rem,calc(100vh_-_25rem))] ${isPast && !isToday ? 'grayscale-[70%] hover:grayscale-0 focus-within:grayscale-0' : ''}`}>
                {group.events.length === 0 ? (
                  <p className="pt-5 text-center text-xs text-slate-400">No events</p>
                ) : (
                  group.events.map(event => {
                    const colorClass = getCategoryColor(event.category);
                    const timeText = formatTimeRange(event);
                    const isMulti = isMultiDayEvent(event.date, event.endDate);
                    const statusClass = event.status === 'draft' ? 'border-dashed italic' : '';

                    return (
                      <div
                        key={event.instanceKey ?? event.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEventClick(event)}
                        onKeyDown={cardKeyDown(event)}
                        className={`p-2 rounded-md border border-slate-200 dark:border-slate-700/80 ${getCategoryAccent(event.category)} bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-1 touch-manipulation group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${statusClass}`}
                      >
                        {/* Category & Time */}
                        <div className="flex items-center justify-between gap-x-1.5 gap-y-1 flex-wrap">
                          {/* Short names: the full ones were cut to "Enterprise & Em…" in these narrow columns */}
                          <span className={`text-[11px] xl:text-xs font-bold px-1.5 py-0.5 rounded ${colorClass} min-w-0 max-w-full truncate`} title={event.category}>
                            {shortCategoryLabel(event.category)}
                          </span>
                          <span className="text-[11px] xl:text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {timeText}
                          </span>
                        </div>

                        {/* Title: these columns are tall, so it gets the lines it needs */}
                        <h4 className="text-xs xl:text-sm font-semibold text-slate-900 dark:text-white line-clamp-4 [overflow-wrap:anywhere] leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-300">
                          {isMulti && <><span className="text-brand-600 dark:text-brand-400 font-bold">↔</span>{' '}</>}
                          {event.title}
                        </h4>

                        {/* Location */}
                        {event.location && (
                          <div className="flex items-center gap-1 text-[11px] xl:text-xs text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}

                        {event.status === 'draft' && <div><PendingBadge event={event} /></div>}
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
