/** Pieces the calendar's views share: keyboard-usable cards, the "Pending review" badge, day keys */
import React from 'react';
import { Clock, MapPin } from 'lucide-react';
import { type Event } from '../../types';
import { isMultiDayEvent, formatClock, APP_LOCALE } from '../../utils/date';
import { getCategoryColor } from '../WeekView';

/** Makes a clickable card reachable and usable from the keyboard */
export const clickableProps = (onActivate: () => void) => ({
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

/** Drafts are only visible to admins: say plainly that they aren't published yet */
export const PendingBadge: React.FC<{ event: Event }> = ({ event }) =>
  event.status === 'draft' ? (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      Pending review
    </span>
  ) : null;

/** "16 Oct – 17 Oct" for an event over several days, '' otherwise */
export const formatEventRangeText = (event: Event): string => {
  if (!event.endDate || !isMultiDayEvent(event.date, event.endDate)) return '';
  const sStr = event.date.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' });
  const eStr = event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' });
  return `${sStr} – ${eStr}`;
};

/** YYYY-MM-DD in local time */
export const toDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface DayEventCardProps {
  event: Event;
  onOpen: () => void;
  className: string;
  /** Weight of the time on the right */
  timeWeight: 'font-semibold' | 'font-medium';
}

/** One event of a day: category, time, title and place (the phone's day panel and the day popover) */
export const DayEventCard: React.FC<DayEventCardProps> = ({ event, onOpen, className, timeWeight }) => {
  const colorClass = getCategoryColor(event.category);
  const isMulti = isMultiDayEvent(event.date, event.endDate);
  const timeStr = formatClock(event.date);
  const endStr = event.endDate
    ? isMulti
      ? `until ${event.endDate.toLocaleDateString(APP_LOCALE, { day: 'numeric', month: 'short' })}`
      : formatClock(event.endDate)
    : '';

  return (
    <div {...clickableProps(onOpen)} className={className}>
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="flex items-center gap-1 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${colorClass}`}>
            {event.category || 'Event'}
          </span>
          <PendingBadge event={event} />
        </span>
        <span className={`text-xs ${timeWeight} text-slate-500 dark:text-slate-400 flex items-center gap-1`}>
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
};
