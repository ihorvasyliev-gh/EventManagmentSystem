import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { APP_LOCALE } from '../../utils/date';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

interface MonthPickerProps {
  /** The button that opened it: the picker sits under it */
  anchor: HTMLElement;
  /** The month the calendar is showing */
  currentDate: Date;
  today: Date;
  onPick: (firstOfMonth: Date) => void;
  onClose: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, m) => m);
const WIDTH = 272;

const placeUnder = (anchor: HTMLElement): { top: number; left: number } => {
  const rect = anchor.getBoundingClientRect();
  return { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)) };
};

/**
 * Any month of any year in two clicks, instead of one click of the arrow per month. Opens from the
 * calendar's title. Rendered into <body>, like the day's window: the calendar card clips what
 * reaches past its edge.
 */
const MonthPicker: React.FC<MonthPickerProps> = ({ anchor, currentDate, today, onPick, onClose }) => {
  const [year, setYear] = useState(currentDate.getFullYear());
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(true, onClose, panelRef);

  // Under the title, kept inside the screen
  const [position, setPosition] = useState(() => placeUnder(anchor));
  useEffect(() => {
    const place = () => setPosition(placeUnder(anchor));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [anchor]);

  // Starts on the month shown, so the arrow keys move from there
  const focusMonth = (month: number) =>
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-month="${month}"]`)?.focus();
  const startMonth = currentDate.getMonth();
  useEffect(() => {
    focusMonth(startMonth);
    // Once, on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGridKeys = (e: React.KeyboardEvent, month: number) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      const next = month + step;
      // Past December or before January: the same place in the next or previous year
      if (next < 0 || next > 11) setYear((y) => y + (next < 0 ? -1 : 1));
      // The twelve buttons stay as the year changes
      focusMonth((next + 12) % 12);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      setYear((y) => y + (e.key === 'PageUp' ? -1 : 1));
    }
  };

  const yearButton = 'w-9 h-9 min-w-0 min-h-0 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[55]" onClick={onClose} data-own-swipe>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a month"
        style={{ top: position.top, left: position.left, width: WIDTH }}
        className="fixed p-3 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 animate-scale-in origin-top-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setYear((y) => y - 1)} className={yearButton} aria-label="Previous year">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white" aria-live="polite">{year}</span>
          <button type="button" onClick={() => setYear((y) => y + 1)} className={yearButton} aria-label="Next year">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((month) => {
            const date = new Date(year, month, 1);
            const isShown = year === currentDate.getFullYear() && month === currentDate.getMonth();
            const isThisMonth = year === today.getFullYear() && month === today.getMonth();
            return (
              <button
                key={month}
                type="button"
                data-month={month}
                onClick={() => {
                  onPick(date);
                  onClose();
                }}
                onKeyDown={(e) => handleGridKeys(e, month)}
                aria-label={date.toLocaleDateString(APP_LOCALE, { month: 'long', year: 'numeric' })}
                aria-current={isShown ? 'true' : undefined}
                className={`h-11 min-w-0 min-h-0 rounded-md text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 ${
                  isShown
                    ? 'bg-brand-600 text-white'
                    : isThisMonth
                    ? 'border border-brand-600 text-brand-700 hover:bg-brand-50 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-brand-950/40'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {date.toLocaleDateString(APP_LOCALE, { month: 'short' })}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MonthPicker;
