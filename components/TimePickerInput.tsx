import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => ALL_TIME_OPTIONS.indexOf(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // Sync internal input value when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Center the selected or highlighted option when opening
  useEffect(() => {
    if (!isOpen) return;
    const selectedIdx = ALL_TIME_OPTIONS.indexOf(value);
    setHighlightedIndex((prev) => (prev >= 0 ? prev : selectedIdx));
    const targetIdx = selectedIdx >= 0 ? selectedIdx : -1;
    const itemEl = targetIdx >= 0 ? optionRefs.current[targetIdx] : null;
    if (itemEl && listRef.current) {
      const listEl = listRef.current;
      const offsetTop = itemEl.offsetTop - listEl.offsetTop;
      listEl.scrollTop = Math.max(0, offsetTop - listEl.clientHeight / 2 + itemEl.clientHeight / 2);
    }
  }, [isOpen, value]);

  // Keep the highlighted option visible during keyboard navigation
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return;
    const itemEl = optionRefs.current[highlightedIndex];
    const listEl = listRef.current;
    if (!itemEl || !listEl) return;
    const itemTop = itemEl.offsetTop - listEl.offsetTop;
    const itemBottom = itemTop + itemEl.offsetHeight;
    if (itemTop < listEl.scrollTop) {
      listEl.scrollTop = itemTop;
    } else if (itemBottom > listEl.scrollTop + listEl.clientHeight) {
      listEl.scrollTop = itemBottom - listEl.clientHeight;
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = (timeOption: string) => {
    onChange(timeOption);
    setInputValue(timeOption);
    setIsOpen(false);
  };

  const commitTypedValue = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (!required) onChange('');
      return;
    }

    // Match patterns like "9", "9:00", "09:30", "1430", "9.30", "9am", "9pm"
    let clean = trimmed.toLowerCase().replace(/\s+/g, '');
    const isPM = clean.includes('pm');
    const isAM = clean.includes('am');
    clean = clean.replace(/am|pm/g, '');

    let hours: number;
    let minutes: number;

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

  // The latest commit (it reads the current props), for the outside-click listener
  const commitRef = useRef(commitTypedValue);
  commitRef.current = commitTypedValue;

  // Close dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Normalize a typed value on close. Untouched pickers stay quiet, so several pickers
        // sharing one state object don't overwrite each other with stale copies.
        if (inputValue !== value) commitRef.current(inputValue);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [inputValue, value]);

  const openList = (initialHighlight?: number) => {
    if (disabled) return;
    if (initialHighlight !== undefined) {
      setHighlightedIndex(initialHighlight);
    } else {
      setHighlightedIndex(ALL_TIME_OPTIONS.indexOf(value));
    }
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = ALL_TIME_OPTIONS.length;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < count) {
        selectOption(ALL_TIME_OPTIONS[highlightedIndex]);
      } else {
        commitTypedValue(inputValue);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        // Close just the dropdown, not the surrounding modal
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        const selectedIdx = ALL_TIME_OPTIONS.indexOf(value);
        openList(selectedIdx >= 0 ? selectedIdx : 0);
      } else {
        setHighlightedIndex((prev) => (prev < 0 ? 0 : (prev + 1) % count));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        const selectedIdx = ALL_TIME_OPTIONS.indexOf(value);
        openList(selectedIdx >= 0 ? selectedIdx : count - 1);
      } else {
        setHighlightedIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
      }
    } else if (e.key === 'Home' && isOpen) {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End' && isOpen) {
      e.preventDefault();
      setHighlightedIndex(count - 1);
    }
  };

  const refMinutes = useMemo(() => {
    return referenceStartTime ? timeToMinutes(referenceStartTime) : null;
  }, [referenceStartTime]);

  const listboxVisible = isOpen && !disabled;
  const activeDescendant = listboxVisible && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listboxVisible}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          value={inputValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setInputValue(e.target.value);
            // Typed text should commit on Enter rather than selecting a stale option
            setHighlightedIndex(-1);
          }}
          onFocus={() => openList()}
          onClick={() => openList()}
          onKeyDown={handleKeyDown}
          className={`w-full pl-3.5 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-medium transition-colors ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle time picker"
          onClick={() => {
            if (disabled) return;
            if (isOpen) setIsOpen(false);
            else openList();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 min-w-0 min-h-0 inline-flex items-center justify-center rounded-lg text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0 border-0 bg-transparent"
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>

      {listboxVisible && (
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Time options"
          className="absolute z-50 mt-1.5 w-full min-w-[180px] max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl py-1 focus:outline-none text-sm animate-scale-in"
        >
          {ALL_TIME_OPTIONS.map((timeOption, index) => {
            const isSelected = value === timeOption;
            const isHighlighted = highlightedIndex === index;
            const optMinutes = timeToMinutes(timeOption);
            const duration =
              refMinutes !== null && optMinutes > refMinutes
                ? formatDuration(optMinutes - refMinutes)
                : null;

            return (
              <button
                key={timeOption}
                id={optionId(index)}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(timeOption)}
                className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-brand-500 text-white font-semibold'
                    : isHighlighted
                    ? 'bg-slate-100 dark:bg-slate-700/70 text-slate-900 dark:text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70'
                } ${isHighlighted && isSelected ? 'ring-2 ring-inset ring-white/70' : ''}`}
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
