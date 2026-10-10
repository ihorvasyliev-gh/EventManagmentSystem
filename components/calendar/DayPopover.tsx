import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { type Event } from '../../types';
import { APP_LOCALE } from '../../utils/date';
import { isAnyModalOpen } from '../../hooks/useModalFocusTrap';
import { DayEventCard } from './shared';

interface DayPopoverProps {
  day: Date;
  events: Event[];
  onEventClick: (event: Event) => void;
  /** Admins: start a new event on this day */
  onAdd?: () => void;
  onClose: () => void;
}

/**
 * Desktop month grid: all of a day's events. Rendered into <body>: the calendar card's
 * backdrop-filter would clip a fixed overlay inside it.
 */
const DayPopover: React.FC<DayPopoverProps> = ({ day, events, onEventClick, onAdd, onClose }) => {
  // Escape closes it (unless a dialog opened from it is on top)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnyModalOpen()) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      data-own-swipe
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={day.toLocaleDateString(APP_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {day.toLocaleDateString(APP_LOCALE, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {onAdd && (
              <button
                type="button"
                onClick={() => {
                  onAdd();
                  onClose();
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 hover:bg-brand-100 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {events.length === 0 && (
            <p className="py-6 text-center text-xs italic text-slate-400">No events scheduled for this day</p>
          )}
          {events.map(ev => (
            <DayEventCard
              key={ev.instanceKey ?? ev.id}
              event={ev}
              onOpen={() => {
                onEventClick(ev);
                onClose();
              }}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 shadow-xs hover:shadow hover:border-brand-400 dark:hover:border-brand-500 transition-all cursor-pointer space-y-1.5 min-h-[44px]"
              timeWeight="font-medium"
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DayPopover;
