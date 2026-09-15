import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';

interface TimePickerInputProps {
  value: string; // e.g. "09:00", "14:30"
  onChange: (time: string) => void;
  referenceStartTime?: string; // If provided, shows relative duration (+1h, +1.5h etc.)
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

// Convert "HH:mm" to total minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

// Format minute difference into human readable e.g. "1 hr", "1.5 hrs", "45 mins"
const formatDuration = (diffMinutes: number): string => {
  if (diffMinutes <= 0) return '';
  const hours = diffMinutes / 60;
  if (hours === 1) return '1 hr';
  if (hours % 1 === 0) return `${hours} hrs`;
  if (hours === 0.5) return '30 min';
  if (hours === 1.5) return '1.5 hrs';
  if (hours === 2.5) return '2.5 hrs';
  if (hours < 1) return `${diffMinutes} min`;
  const h = Math.floor(hours);
  const m = diffMinutes % 60;
  return `${h}h ${m}m`;
};

// Generate list of 30-min intervals for full 24h
const ALL_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

export const TimePickerInput: React.FC<TimePickerInputProps> = ({
  value,
  onChange,
  referenceStartTime,
  placeholder = '09:00',
  disabled = false,
  required = false,
  className = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Sync internal input value when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Normalize typed value on close
        commitTypedValue(inputValue);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [inputValue, value]);

  // Scroll into view when opening
  useEffect(() => {
    if (isOpen && selectedItemRef.current && listRef.current) {
      const listEl = listRef.current;
      const itemEl = selectedItemRef.current;
      const offsetTop = itemEl.offsetTop - listEl.offsetTop;
      listEl.scrollTop = Math.max(0, offsetTop - listEl.clientHeight / 2 + itemEl.clientHeight / 2);
    }
  }, [isOpen]);

  const commitTypedValue = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (!required) onChange('');
      return;
    }

    // Match patterns like "9", "9:00", "09:30", "1430", "9.30", "9am", "9pm"
    let clean = trimmed.toLowerCase().replace(/\s+/g, '');
    let isPM = clean.includes('pm');
    let isAM = clean.includes('am');
    clean = clean.replace(/am|pm/g, '');

    let hours = 0;
    let minutes = 0;

    if (clean.includes(':') || clean.includes('.')) {
      const [hPart, mPart] = clean.split(/[:.]/);
      hours = parseInt(hPart, 10) || 0;
      minutes = parseInt(mPart, 10) || 0;
    } else if (clean.length === 3 || clean.length === 4) {
      hours = parseInt(clean.slice(0, clean.length - 2), 10) || 0;
      minutes = parseInt(clean.slice(-2), 10) || 0;
    } else {
      hours = parseInt(clean, 10) || 0;
      minutes = 0;
    }

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    hours = Math.max(0, Math.min(23, hours));
    minutes = Math.max(0, Math.min(59, minutes));

    const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setInputValue(formatted);
    onChange(formatted);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTypedValue(inputValue);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (listRef.current) {
        listRef.current.scrollTop += 36;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listRef.current) {
        listRef.current.scrollTop -= 36;
      }
    }
  };

  const refMinutes = useMemo(() => {
    return referenceStartTime ? timeToMinutes(referenceStartTime) : null;
  }, [referenceStartTime]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={inputValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={`w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-medium transition-colors ${className}`}
        />
        <Clock
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        />
      </div>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full min-w-[180px] max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl py-1 focus:outline-none text-sm animate-in fade-in zoom-in-95 duration-100"
        >
          {ALL_TIME_OPTIONS.map((timeOption) => {
            const isSelected = value === timeOption;
            const optMinutes = timeToMinutes(timeOption);
            const duration =
              refMinutes !== null && optMinutes > refMinutes
                ? formatDuration(optMinutes - refMinutes)
                : null;

            return (
              <button
                key={timeOption}
                type="button"
                ref={isSelected ? selectedItemRef : undefined}
                onClick={() => {
                  onChange(timeOption);
                  setInputValue(timeOption);
                  setIsOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-brand-500 text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70'
                }`}
              >
                <span>{timeOption}</span>
                {duration && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    +{duration}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TimePickerInput;
