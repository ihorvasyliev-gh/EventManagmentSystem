import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Event, ViewMode, UserRole } from '../types';
import { getDaysInMonth, getFirstDayOfMonth, isSameDay, addMonths, isMultiDayEvent } from '../utils/date';
import { expandRecurringEvents } from '../utils/recurrence';
import {
  ChevronLeft,
  ChevronRight,
  Grid,
  Calendar as CalendarIcon,
  List as ListIcon,
  MapPin,
  Clock,
  Plus,
  ChevronDown,
  X
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useMedia } from '../hooks/useMedia';
import { isAnyModalOpen } from '../hooks/useModalFocusTrap';
import WeekView, { getCategoryColor, getCategoryDotColor } from './WeekView';

/** Makes a clickable card reachable and usable from the keyboard */
const clickableProps = (onActivate: () => void) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: (e: React.MouseEvent) => { e.stopPropagation(); onActivate(); },
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    }
  }
});

const VIEW_MODE_STORAGE_KEY = 'ccp_calendar_view_mode';

const readStoredViewMode = (isMobile: boolean): ViewMode | null => {
  try {
    const value = localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}_${isMobile ? 'mobile' : 'desktop'}`);
    return value === 'grid' || value === 'week' || value === 'agenda' ? value : null;
  } catch {
    return null;
  }
};

const formatEventRangeText = (event: Event): string => {
  if (!event.endDate || !isMultiDayEvent(event.date, event.endDate)) return '';
  const sStr = event.date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const eStr = event.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${sStr} – ${eStr}`;
};

const formatWeekRange = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleDateString('default', { month: 'short' });
  const endMonth = end.toLocaleDateString('default', { month: 'short' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  // The year is only noise while browsing the current year
  const yearSuffix = endYear === new Date().getFullYear() ? '' : `, ${endYear}`;

  if (startYear !== endYear) {
    return `${start.getDate()} ${startMonth} ${startYear} – ${end.getDate()} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}${yearSuffix}`;
  }
  return `${start.getDate()}–${end.getDate()} ${endMonth}${yearSuffix}`;
};

interface CalendarViewProps {
  events: Event[];
  onEventClick: (event: Event) => void;
  onAddEventForDate?: (date: Date) => void;
  recurrenceExceptions?: Map<string, Date[]>;
  userRole?: UserRole;
  /** Search/filters are narrowing the events (used for empty states) */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /** Active date filter: occurrences of repeating events outside it are hidden too */
  dateRange?: { start?: Date; end?: Date };
}

const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  onEventClick,
  onAddEventForDate,
  recurrenceExceptions,
  userRole,
  hasActiveFilters = false,
  onClearFilters,
  dateRange
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewModeState] = useState<ViewMode>(
    () => readStoredViewMode(window.matchMedia('(max-width: 640px)').matches)
      ?? (window.matchMedia('(max-width: 640px)').matches ? 'agenda' : 'grid')
  );
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  // Phones show the selected day's events under the month grid; start on today
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const { theme } = useTheme();

  // Mobile detection
  const isMobile = useMedia('(max-width: 640px)');

  // Remember the chosen view separately for phone and desktop layouts
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(`${VIEW_MODE_STORAGE_KEY}_${isMobile ? 'mobile' : 'desktop'}`, mode);
    } catch {
      // Storage unavailable (private mode) — the choice just isn't remembered
    }
  }, [isMobile]);

  // Switch to the remembered (or default) view when crossing the phone/desktop breakpoint
  const isFirstLayoutRef = useRef(true);
  useEffect(() => {
    if (isFirstLayoutRef.current) {
      isFirstLayoutRef.current = false;
      return;
    }
    setViewModeState(readStoredViewMode(isMobile) ?? (isMobile ? 'agenda' : 'grid'));
  }, [isMobile]);

  // Reset day details when the month changes; the current month keeps today selected
  useEffect(() => {
    setPopoverDay(null);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === currentDate.getFullYear() && now.getMonth() === currentDate.getMonth();
    setSelectedMobileDay(isCurrentMonth ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : null);
  }, [currentDate]);

  // Swipe Gestures (horizontal only — vertical scrolling must not change the month)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null);
  const minSwipeDistance = 60;

  const onTouchStart = (e: React.TouchEvent) => {
    // Areas with their own swipe handling (e.g. the week view's day strip) opt out
    if ((e.target as HTMLElement).closest('[data-own-swipe]')) {
      touchStartRef.current = null;
      return;
    }
    touchEndRef.current = null;
    touchStartRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  // Week computation
  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0, 0);
  }, [currentDate]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  // Period navigation
  // Always step from the 1st so Jan 31 → Feb doesn't skip to March
  const nextMonth = useCallback(() => {
    setCurrentDate(prev => addMonths(new Date(prev.getFullYear(), prev.getMonth(), 1), 1));
  }, []);

  const prevMonth = useCallback(() => {
    setCurrentDate(prev => addMonths(new Date(prev.getFullYear(), prev.getMonth(), 1), -1));
  }, []);

  const prevPeriod = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() - 7);
        return next;
      });
    } else {
      prevMonth();
    }
  }, [viewMode, prevMonth]);

  const nextPeriod = useCallback(() => {
    if (viewMode === 'week') {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + 7);
        return next;
      });
    } else {
      nextMonth();
    }
  }, [viewMode, nextMonth]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const onTouchEnd = () => {
    const start = touchStartRef.current;
    const end = touchEndRef.current;
    touchStartRef.current = null;
    if (!start || !end) return;
    const distance = start.x - end.x;
    const verticalDistance = Math.abs(start.y - end.y);
    if (Math.abs(distance) < verticalDistance * 1.5) return;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setSwipeHint('left');
      nextPeriod();
      setTimeout(() => setSwipeHint(null), 180);
    }
    if (isRightSwipe) {
      setSwipeHint('right');
      prevPeriod();
      setTimeout(() => setSwipeHint(null), 180);
    }
  };

  useEffect(() => {
    const handleCalendarKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) {
        return;
      }
      // Don't move the calendar behind an open dialog
      if (isAnyModalOpen() || popoverDay || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        prevPeriod();
      } else if (e.key === 'ArrowRight') {
        nextPeriod();
      } else if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
        goToday();
      }
    };

    window.addEventListener('keydown', handleCalendarKeyDown);
    return () => window.removeEventListener('keydown', handleCalendarKeyDown);
  }, [prevPeriod, nextPeriod, goToday, popoverDay]);

  // Day popover: Escape closes it
  useEffect(() => {
    if (!popoverDay) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnyModalOpen()) {
        e.preventDefault();
        setPopoverDay(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [popoverDay]);

  // Grid Data Generation
  const calendarDays = useMemo(() => {
    const days = [];
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

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const headerTitle = useMemo(() => {
    if (viewMode === 'week') {
      return formatWeekRange(weekStart, weekEnd);
    }
    return monthName;
  }, [viewMode, weekStart, weekEnd, monthName]);

  // Date range for expanding recurring events (covers month and week boundaries)
  const rangeStart = useMemo(() => {
    const mStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    return weekStart < mStart ? weekStart : mStart;
  }, [currentDate, weekStart]);

  const rangeEnd = useMemo(() => {
    const mEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    return weekEnd > mEnd ? weekEnd : mEnd;
  }, [currentDate, weekEnd]);

  // Expand recurring events
  const displayEvents = useMemo(() => {
    const expanded = expandRecurringEvents(events, rangeStart, rangeEnd, recurrenceExceptions)
      .filter(ev => (!dateRange?.start || ev.date >= dateRange.start) && (!dateRange?.end || ev.date < dateRange.end));
    return expanded.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events, rangeStart, rangeEnd, recurrenceExceptions, dateRange]);

  const toDayKey = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of displayEvents) {
      const s = new Date(ev.date);
      s.setHours(0, 0, 0, 0);
      const isMulti = isMultiDayEvent(ev.date, ev.endDate);
      const e = ev.endDate && isMulti ? new Date(ev.endDate) : new Date(s);
      e.setHours(0, 0, 0, 0);

      const curr = new Date(s);
      while (curr <= e) {
        const key = toDayKey(curr);
        const list = map.get(key) || [];
        list.push(ev);
        map.set(key, list);
        curr.setDate(curr.getDate() + 1);
      }
    }
    return map;
  }, [displayEvents]);

  // For Agenda / List View: Filter to current month
  const listViewEvents = useMemo(() => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return displayEvents.filter(e => {
      const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
      return e.date <= monthEnd && end >= monthStart;
    });
  }, [displayEvents, currentDate]);

  // Split month's events into upcoming (>= today midnight or ending today) and past (concluded strictly before today)
  const startOfToday = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }, []);

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const upcoming: Event[] = [];
    const past: Event[] = [];

    for (const ev of listViewEvents) {
      const s = new Date(ev.date);
      const isMulti = isMultiDayEvent(ev.date, ev.endDate);
      const e = ev.endDate && isMulti ? new Date(ev.endDate) : (ev.endDate ? new Date(ev.endDate) : s);

      if (e < startOfToday) {
        past.push(ev);
      } else {
        upcoming.push(ev);
      }
    }

    upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    past.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { upcomingEvents: upcoming, pastEvents: past };
  }, [listViewEvents, startOfToday]);

  const selectedMobileDayEvents = useMemo(() => {
    if (!selectedMobileDay) return [];
    return eventsByDayKey.get(toDayKey(selectedMobileDay)) || [];
  }, [selectedMobileDay, eventsByDayKey]);

  const popoverDayEvents = useMemo(() => {
    if (!popoverDay) return [];
    return eventsByDayKey.get(toDayKey(popoverDay)) || [];
  }, [popoverDay, eventsByDayKey]);

  // Helper to render agenda day groups
  const renderAgendaDayGroups = (eventList: Event[], isMuted = false) => {
    const groups = new Map<string, Event[]>();
    for (const event of eventList) {
      const dateKey = event.date.toDateString();
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(event);
    }

    return Array.from(groups.entries()).map(([dateKey, dayEvents]) => {
      const date = new Date(dateKey);
      const isToday = isSameDay(date, new Date());
      const dayOfWeek = date.toLocaleDateString('default', { weekday: 'short' });
      const month = date.toLocaleDateString('default', { month: 'short' });

      return (
        <div key={dateKey} className={isMuted ? 'opacity-75' : ''}>
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
              <span className="ml-auto px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-brand-500 dark:bg-brand-400 text-white dark:text-slate-900 rounded-full">
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
                        {event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {isMulti && event.endDate ? (
                        <div className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold whitespace-nowrap">
                          until {event.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                        </div>
                      ) : event.endDate ? (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          to {event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                              {event.title}
                            </h3>
                          </div>
                          {isMulti && event.endDate && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 my-1 rounded text-[11px] font-semibold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                              <span>🗓 {event.date.toLocaleDateString([], { day: 'numeric', month: 'short' })} – {event.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
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
    });
  };

  return (
    <div
      className={`rounded-2xl overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-800 ${theme === 'dark' ? 'glass-panel-dark' : 'bg-white shadow-sm'}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Calendar Header with 3-Way Switcher */}
      <div className="p-3 sm:p-6 flex flex-col sm:flex-row justify-between items-center border-b border-slate-100 dark:border-slate-800 gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <h2 className="text-base sm:text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:min-w-48 truncate">
            {viewMode === 'week' ? headerTitle : (
              <>
                <span className="min-[400px]:hidden">{currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                <span className="hidden min-[400px]:inline">{headerTitle}</span>
              </>
            )}
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-4">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={prevPeriod}
                className="p-2 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
                aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
              >
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                onClick={nextPeriod}
                className="p-2 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 rounded-md text-slate-500 dark:text-slate-400 transition-all shadow-sm"
                aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
              >
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={goToday}
              title="Go to today (T)"
              className="px-3 h-10 sm:h-8 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        {/* 3-Way Segmented Switcher (Month, Week, Agenda) */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex-1 sm:flex-none px-3 sm:px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-md flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Grid className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>Month</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`flex-1 sm:flex-none px-3 sm:px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-md flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium transition-all ${viewMode === 'week' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <CalendarIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>Week</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('agenda')}
            className={`flex-1 sm:flex-none px-3 sm:px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-md flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium transition-all ${viewMode === 'agenda' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <ListIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>Agenda</span>
          </button>
        </div>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div className={`transition-transform duration-150 ${swipeHint === 'left' ? '-translate-x-1' : swipeHint === 'right' ? 'translate-x-1' : ''}`}>
          <div key={`week-${weekStart.toISOString()}`} className="animate-fade-in">
            <WeekView
              currentDate={currentDate}
              events={displayEvents}
              onEventClick={onEventClick}
              onAddEventForDate={onAddEventForDate}
              userRole={userRole}
            />
          </div>
        </div>
      )}

      {/* Month Grid View */}
      {viewMode === 'grid' && (
        <div className={`p-2 sm:p-6 transition-transform duration-150 ${swipeHint === 'left' ? '-translate-x-1' : swipeHint === 'right' ? 'translate-x-1' : ''}`}>
          <div key={`month-${currentDate.getFullYear()}-${currentDate.getMonth()}`} className="animate-fade-in">
            <div className="grid grid-cols-7 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="text-center text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-0.5">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t border-l border-slate-100 dark:border-slate-800">
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="min-h-[3.25rem] sm:min-h-[6.5rem] lg:min-h-[8rem] bg-slate-50/50 dark:bg-slate-800/30 border-b border-r border-slate-100 dark:border-slate-800"></div>;

                const dayEvents = day ? (eventsByDayKey.get(toDayKey(day)) || []) : [];
                const isToday = isSameDay(day, new Date());
                const isSelectedMobile = isMobile && selectedMobileDay && isSameDay(day, selectedMobileDay);
                const hasEvents = dayEvents.length > 0;

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => {
                      if (isMobile) {
                        setSelectedMobileDay(prev => (prev && isSameDay(prev, day) ? null : day));
                      } else if (hasEvents || (onAddEventForDate && userRole === UserRole.ADMIN)) {
                        setPopoverDay(day);
                      }
                    }}
                    className={`min-h-[3.25rem] sm:min-h-[6.5rem] lg:min-h-[8rem] group border-b border-r border-slate-100 dark:border-slate-800 p-1 sm:p-2 transition-colors ${
                      isMobile ? 'cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/60' : `hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${hasEvents || (onAddEventForDate && userRole === UserRole.ADMIN) ? 'cursor-pointer' : ''}`
                    } ${
                      isSelectedMobile
                        ? 'bg-brand-50/70 dark:bg-brand-900/30 ring-2 ring-brand-500 ring-inset'
                        : isToday
                        ? 'bg-brand-50/50 dark:bg-brand-900/40 ring-2 ring-brand-500/80 dark:ring-brand-400/80 ring-inset'
                        : 'bg-white dark:bg-slate-900/0'
                    }`}
                  >
                    <div className={`flex items-center ${isMobile ? 'justify-center' : 'justify-between'} gap-1 mb-1 sm:mb-2 ${isToday ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500'}`}>
                      <span className="text-xs sm:text-sm font-semibold">
                        {isToday ? (
                          <span className="bg-brand-500 dark:bg-brand-400 text-white dark:text-slate-900 px-2 py-0.5 sm:py-1 rounded-full font-bold text-xs sm:text-sm shadow-sm">{day.getDate()}</span>
                        ) : (
                          day.getDate()
                        )}
                      </span>
                      {!isMobile && onAddEventForDate && userRole === UserRole.ADMIN && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onAddEventForDate(day); }}
                          className="p-1 min-w-0 min-h-0 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900/30 dark:hover:text-brand-400 transition-all"
                          title="Add event"
                          aria-label="Add event"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Mobile: Category dots + count pill (No 3-letter truncations) */}
                    {isMobile ? (
                      <div className="flex flex-col items-center justify-center gap-1 mt-1">
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
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                            +{dayEvents.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Desktop: Event pills with time, full title, and +N more popover trigger */
                      <div className="space-y-0.5 sm:space-y-1">
                        {dayEvents.slice(0, 3).map(ev => {
                          const colorClass = getCategoryColor(ev.category);
                          const statusClass = ev.status === 'draft' ? 'opacity-70 dashed-border' : '';
                          const rangeStr = formatEventRangeText(ev);
                          const itemTitle = rangeStr ? `${ev.title} (${rangeStr})` : ev.title;
                          const timeStr = ev.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                          return (
                            <div
                              key={ev.instanceKey ?? ev.id}
                              {...clickableProps(() => onEventClick(ev))}
                              className={`w-full text-left ${colorClass} text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-[4px] truncate font-medium transition-all hover:opacity-80 cursor-pointer touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${statusClass}`}
                              title={itemTitle}
                            >
                              <span className="hidden lg:inline font-bold mr-1 opacity-80">{timeStr}</span>
                              {rangeStr && <span className="mr-0.5 opacity-75 font-bold">↔</span>}
                              {ev.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPopoverDay(day);
                            }}
                            className="w-full text-left text-[9px] sm:text-[10px] font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 py-0.5 px-1 rounded hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
                          >
                            +{dayEvents.length - 3} more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isMobile && !selectedMobileDay && (
              <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
                Tap a day to see its events
              </p>
            )}

            {/* Mobile: Tapping a day displays clean card section below the grid */}
            {isMobile && selectedMobileDay && (
              <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {selectedMobileDay.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({selectedMobileDayEvents.length} {selectedMobileDayEvents.length === 1 ? 'event' : 'events'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {onAddEventForDate && userRole === UserRole.ADMIN && (
                      <button
                        type="button"
                        onClick={() => onAddEventForDate(selectedMobileDay)}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 transition-colors"
                      >
                        + Add
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedMobileDay(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
                      aria-label="Close day events"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {selectedMobileDayEvents.length === 0 ? (
                    <div className="py-4 text-center text-xs italic text-slate-400">
                      No events scheduled for this day
                    </div>
                  ) : (
                    selectedMobileDayEvents.map(event => {
                      const colorClass = getCategoryColor(event.category);
                      const isMulti = isMultiDayEvent(event.date, event.endDate);
                      const timeStr = event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const endStr = event.endDate
                        ? isMulti
                          ? `until ${event.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
                          : event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div
                          key={event.instanceKey ?? event.id}
                          {...clickableProps(() => onEventClick(event))}
                          className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm active:scale-[0.99] transition-all cursor-pointer space-y-1.5 touch-manipulation min-h-[44px]"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colorClass}`}>
                              {event.category || 'Event'}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {timeStr} {endStr && `– ${endStr}`}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {isMulti && <span className="mr-1 text-brand-600 dark:text-brand-400 font-bold">↔</span>}
                            {event.title}
                          </h4>
                          {event.location && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
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
            )}
          </div>
        </div>
      )}

      {/* Agenda View */}
      {viewMode === 'agenda' && (
        <div className={`transition-transform duration-150 ${swipeHint === 'left' ? '-translate-x-1' : swipeHint === 'right' ? 'translate-x-1' : ''}`}>
          <div key={`agenda-${currentDate.getFullYear()}-${currentDate.getMonth()}`} className="animate-fade-in">
            {listViewEvents.length === 0 ? (
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
                    onClick={nextPeriod}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
                  >
                    Next month →
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcomingEvents.length === 0 && pastEvents.length > 0 && (
                  <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-sm italic">
                    No upcoming events this month.
                  </div>
                )}

                {/* Upcoming Events in chronological order */}
                {upcomingEvents.length > 0 && renderAgendaDayGroups(upcomingEvents, false)}

                {/* Past Events Collapsible Section at the bottom */}
                {pastEvents.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 pb-4">
                    <div className="px-3 sm:px-4">
                      <button
                        type="button"
                        onClick={() => setShowPastEvents(prev => !prev)}
                        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-all touch-manipulation shadow-xs"
                        aria-expanded={showPastEvents}
                      >
                        <span className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span>{showPastEvents ? 'Hide' : 'Show'} Past Events ({pastEvents.length})</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showPastEvents ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {showPastEvents && (
                      <div className="mt-3 opacity-80 divide-y divide-slate-100 dark:divide-slate-800">
                        {renderAgendaDayGroups(pastEvents, true)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Month Grid: Day Event Popover Modal (portal: the calendar card's backdrop-filter would clip a fixed overlay) */}
      {popoverDay && createPortal(
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setPopoverDay(null)}
          data-own-swipe
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={popoverDay.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {popoverDay.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {popoverDayEvents.length} {popoverDayEvents.length === 1 ? 'event' : 'events'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {onAddEventForDate && userRole === UserRole.ADMIN && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddEventForDate(popoverDay);
                      setPopoverDay(null);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 hover:bg-brand-100 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPopoverDay(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {popoverDayEvents.length === 0 && (
                <p className="py-6 text-center text-xs italic text-slate-400">No events scheduled for this day</p>
              )}
              {popoverDayEvents.map(ev => {
                const colorClass = getCategoryColor(ev.category);
                const isMulti = isMultiDayEvent(ev.date, ev.endDate);
                const timeStr = ev.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const endStr = ev.endDate
                  ? isMulti
                    ? `until ${ev.endDate.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
                    : ev.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <div
                    key={ev.instanceKey ?? ev.id}
                    {...clickableProps(() => {
                      onEventClick(ev);
                      setPopoverDay(null);
                    })}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 shadow-xs hover:shadow hover:border-brand-400 dark:hover:border-brand-500 transition-all cursor-pointer space-y-1.5 min-h-[44px]"
                  >
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colorClass}`}>
                        {ev.category || 'Event'}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {timeStr} {endStr && `– ${endStr}`}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {isMulti && <span className="mr-1 text-brand-600 dark:text-brand-400 font-bold">↔</span>}
                      {ev.title}
                    </h4>
                    {ev.location && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{ev.location}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders when parent states change
export default React.memo(CalendarView);
