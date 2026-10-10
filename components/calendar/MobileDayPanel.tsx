import React from 'react';
import { X } from 'lucide-react';
import { type Event } from '../../types';
import { APP_LOCALE } from '../../utils/date';
import { DayEventCard } from './shared';

interface MobileDayPanelProps {
  day: Date;
  events: Event[];
  onEventClick: (event: Event) => void;
  /** Admins: start a new event on this day */
  onAdd?: () => void;
  onClose: () => void;
}

/** Phones: the tapped day's events, in cards under the month grid */
const MobileDayPanel: React.FC<MobileDayPanelProps> = ({ day, events, onEventClick, onAdd, onClose }) => (
  <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 animate-fade-in">
    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {day.toLocaleDateString(APP_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          ({events.length} {events.length === 1 ? 'event' : 'events'})
        </span>
      </div>
      <div className="flex items-center gap-1">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 transition-colors"
          >
            + Add
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
          aria-label="Close day events"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>

    <div className="mt-3 space-y-2">
      {events.length === 0 ? (
        <div className="py-4 text-center text-xs italic text-slate-400">
          No events scheduled for this day
        </div>
      ) : (
        events.map(event => (
          <DayEventCard
            key={event.instanceKey ?? event.id}
            event={event}
            onOpen={() => onEventClick(event)}
            className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm active:scale-[0.99] transition-all cursor-pointer space-y-1.5 touch-manipulation min-h-[44px]"
            timeWeight="font-semibold"
          />
        ))
      )}
    </div>
  </div>
);

export default MobileDayPanel;
