import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { type Event, type ViewMode, UserRole } from '../types';
import { addMonths, isMultiDayEvent, APP_LOCALE } from '../utils/date';
import { expandRecurringEvents } from '../utils/recurrence';
import { useMedia } from '../hooks/useMedia';
import { useToday } from '../hooks/useToday';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { isAnyModalOpen } from '../hooks/useModalFocusTrap';
import WeekView from './WeekView';
import CalendarHeader from './calendar/CalendarHeader';
import MonthGrid from './calendar/MonthGrid';
import AgendaView from './calendar/AgendaView';
import ResultsList from './calendar/ResultsList';
import DayPopover from './calendar/DayPopover';
import { toDayKey } from './calendar/shared';
import { resultInstances, hasEventsAfter, OPEN_SERIES_MONTHS } from '../utils/agenda';

const VIEW_MODE_STORAGE_KEY = 'ccp_calendar_view_mode';

const readStoredViewMode = (isMobile: boolean): ViewMode | null => {
  try {
    const value = localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}_${isMobile ? 'mobile' : 'desktop'}`);
    return value === 'grid' || value === 'week' || value === 'agenda' ? value : null;
  } catch {
    return null;
  }
};

const formatWeekRange = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleDateString(APP_LOCALE, { month: 'short' });
  const endMonth = end.toLocaleDateString(APP_LOCALE, { month: 'short' });
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
  /** Active place filter: occurrences of a series held elsewhere are hidden too */
  location?: string;
  /** Show the events as search results: one list across all dates instead of the calendar */
  showResults?: boolean;
  /** Goes back to today whenever this number changes (the logo, the Calendar tab) */
  todayRequest?: number;
}

/** Months the Agenda shows before it is scrolled further */
const AGENDA_FIRST_MONTHS = 2;

/** The calendar card: Month, Week or Agenda for the current period, with navigation */
const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  onEventClick,
  onAddEventForDate,
  recurrenceExceptions,
  userRole,
  hasActiveFilters = false,
  onClearFilters,
  dateRange,
  location,
  showResults = false,
  todayRequest = 0
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewModeState] = useState<ViewMode>(
    () => readStoredViewMode(window.matchMedia('(max-width: 640px)').matches)
      ?? (window.matchMedia('(max-width: 640px)').matches ? 'agenda' : 'grid')
  );
  const [showEarlierEvents, setShowEarlierEvents] = useState(false);
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  const closePopover = useCallback(() => setPopoverDay(null), []);
  // Phones show the selected day's events under the month grid; start on today
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date | null>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const isMobile = useMedia('(max-width: 640px)');
  const today = useToday();
  const canAdd = !!onAddEventForDate && userRole === UserRole.ADMIN;

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

  // The logo and the Calendar tab bring the calendar back to today
  useEffect(() => {
    if (todayRequest) goToday();
  }, [todayRequest, goToday]);

  // A date filter (This week, Next month, a From date) also shows that period
  const filterStartTime = dateRange?.start?.getTime();
  useEffect(() => {
    if (filterStartTime !== undefined) setCurrentDate(new Date(filterStartTime));
  }, [filterStartTime]);

  // Swipe left for the next period, right for the previous one
  const swipe = useHorizontalSwipe(nextPeriod, prevPeriod);
  const swipeClass = swipe.hint === 'left' ? '-translate-x-1' : swipe.hint === 'right' ? 'translate-x-1' : '';

  // ← / → move by a period, T jumps to today
  useEffect(() => {
    const handleCalendarKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) {
        return;
      }
      // Don't move the calendar behind an open dialog, or while it is hidden behind search results
      if (showResults || isAnyModalOpen() || popoverDay || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
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
  }, [prevPeriod, nextPeriod, goToday, popoverDay, showResults]);

  const monthName = currentDate.toLocaleString(APP_LOCALE, { month: 'long', year: 'numeric' });

  const headerTitle = useMemo(() => {
    if (viewMode === 'week') {
      return formatWeekRange(weekStart, weekEnd);
    }
    return monthName;
  }, [viewMode, weekStart, weekEnd, monthName]);

  // Date range for expanding recurring events: the week, and the month grid with the days of the
  // months before and after that complete its first and last weeks
  const rangeStart = useMemo(() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7));
    return weekStart < gridStart ? weekStart : gridStart;
  }, [currentDate, weekStart]);

  const rangeEnd = useMemo(() => {
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const gridEnd = new Date(last.getFullYear(), last.getMonth(), last.getDate() + ((7 - last.getDay()) % 7), 23, 59, 59, 999);
    return weekEnd > gridEnd ? weekEnd : gridEnd;
  }, [currentDate, weekEnd]);

  // Expand recurring events
  const displayEvents = useMemo(() => {
    const expanded = expandRecurringEvents(events, rangeStart, rangeEnd, recurrenceExceptions)
      .filter(ev => (!dateRange?.start || ev.date >= dateRange.start) && (!dateRange?.end || ev.date < dateRange.end))
      .filter(ev => !location || ev.location?.trim() === location);
    return expanded.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events, rangeStart, rangeEnd, recurrenceExceptions, dateRange, location]);

  // Every day an event is on (multi-day events on each of their days)
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

  // Agenda: from today (or the first of a month browsed to) on, a month further at a time
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const [agendaExtent, setAgendaExtent] = useState({ monthKey, months: AGENDA_FIRST_MONTHS });
  const agendaMonths = agendaExtent.monthKey === monthKey ? agendaExtent.months : AGENDA_FIRST_MONTHS;
  const monthStart = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  const isCurrentMonth = today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth();
  const agendaStart = isCurrentMonth ? today : monthStart;
  const agendaEnd = useMemo(
    () => new Date(monthStart.getFullYear(), monthStart.getMonth() + agendaMonths, 1, 0, 0, 0, -1),
    [monthStart, agendaMonths]
  );
  const agendaLimit = useMemo(() => new Date(today.getFullYear(), today.getMonth() + OPEN_SERIES_MONTHS, 1), [today]);
  const canLoadMoreAgenda = agendaEnd < agendaLimit && hasEventsAfter(events, agendaEnd);
  const loadMoreAgenda = useCallback(
    () => setAgendaExtent({ monthKey, months: agendaMonths + 1 }),
    [monthKey, agendaMonths]
  );

  const inFilters = useCallback(
    (ev: Event) =>
      (!dateRange?.start || ev.date >= dateRange.start) && (!dateRange?.end || ev.date < dateRange.end) &&
      (!location || ev.location?.trim() === location),
    [dateRange, location]
  );

  const agendaEvents = useMemo(() => {
    if (viewMode !== 'agenda' || showResults) return [];
    return expandRecurringEvents(events, agendaStart, agendaEnd, recurrenceExceptions)
      .filter(inFilters)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [viewMode, showResults, events, agendaStart, agendaEnd, recurrenceExceptions, inFilters]);

  // This month's events that were over before today, folded away above the list
  const earlierEvents = useMemo(() => {
    if (viewMode !== 'agenda' || showResults || !isCurrentMonth) return [];
    return expandRecurringEvents(events, monthStart, new Date(today.getTime() - 1), recurrenceExceptions)
      .filter((ev) => inFilters(ev) && (ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date) < today)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [viewMode, showResults, isCurrentMonth, events, monthStart, today, recurrenceExceptions, inFilters]);

  // Search results: every date, not just the month on screen
  const results = useMemo(
    () => (showResults ? resultInstances(events, { today, dateRange, location, exceptions: recurrenceExceptions }) : null),
    [showResults, events, today, dateRange, location, recurrenceExceptions]
  );

  const popoverDayEvents = useMemo(() => {
    if (!popoverDay) return [];
    return eventsByDayKey.get(toDayKey(popoverDay)) || [];
  }, [popoverDay, eventsByDayKey]);

  // Clipped rather than overflow-hidden where browsers can: hidden makes the card a scroll
  // container, and the agenda's day headers would no longer stick under the navbar
  const cardClass = 'rounded-leaf-sm sm:rounded-leaf overflow-hidden supports-[overflow:clip]:overflow-clip animate-fade-in border border-slate-200 dark:border-slate-800 bg-white shadow-sm dark-panel';

  if (results) {
    return (
      <section className={cardClass} aria-label="Search results">
        <ResultsList
          upcoming={results.upcoming}
          past={results.past}
          today={today}
          onEventClick={onEventClick}
          onClearFilters={onClearFilters}
        />
      </section>
    );
  }

  return (
    <div className={cardClass} {...swipe.handlers}>
      <CalendarHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        title={headerTitle}
        currentDate={currentDate}
        onPrev={prevPeriod}
        onNext={nextPeriod}
        onToday={goToday}
      />

      {viewMode === 'week' && (
        <div className={`transition-transform duration-150 ${swipeClass}`}>
          <div key={`week-${weekStart.toISOString()}`} className="animate-fade-in">
            <WeekView
              currentDate={currentDate}
              today={today}
              events={displayEvents}
              onEventClick={onEventClick}
              onAddEventForDate={onAddEventForDate}
              userRole={userRole}
            />
          </div>
        </div>
      )}

      {viewMode === 'grid' && (
        <div className={`p-2 sm:p-4 lg:px-6 transition-transform duration-150 ${swipeClass}`}>
          <div key={`month-${currentDate.getFullYear()}-${currentDate.getMonth()}`} className="animate-fade-in">
            <MonthGrid
              currentDate={currentDate}
              today={today}
              eventsByDayKey={eventsByDayKey}
              isMobile={isMobile}
              selectedDay={selectedMobileDay}
              onSelectedDayChange={setSelectedMobileDay}
              onOpenDay={setPopoverDay}
              onEventClick={onEventClick}
              canAdd={canAdd}
              onAddEventForDate={onAddEventForDate}
            />
          </div>
        </div>
      )}

      {viewMode === 'agenda' && (
        <div className={`transition-transform duration-150 ${swipeClass}`}>
          <div key={`agenda-${currentDate.getFullYear()}-${currentDate.getMonth()}`} className="animate-fade-in">
            <AgendaView
              events={agendaEvents}
              earlierEvents={earlierEvents}
              showEarlier={showEarlierEvents}
              onToggleShowEarlier={() => setShowEarlierEvents(prev => !prev)}
              today={today}
              onEventClick={onEventClick}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={onClearFilters}
              canLoadMore={canLoadMoreAgenda}
              onLoadMore={loadMoreAgenda}
              loadedUntil={agendaEnd}
            />
          </div>
        </div>
      )}

      {popoverDay && (
        <DayPopover
          day={popoverDay}
          events={popoverDayEvents}
          onEventClick={onEventClick}
          onAdd={canAdd && onAddEventForDate ? () => onAddEventForDate(popoverDay) : undefined}
          onClose={closePopover}
        />
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders when parent states change
export default React.memo(CalendarView);
