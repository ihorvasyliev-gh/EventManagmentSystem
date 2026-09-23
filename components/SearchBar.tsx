import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

/** Used by the "/" keyboard shortcut to focus the search box */
export const SEARCH_INPUT_ID = 'event-search-input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = "Search events..." }) => {
  const [localValue, setLocalValue] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Debounce search
  useEffect(() => {
    if (localValue === value) return;
    const timer = setTimeout(() => {
      onChangeRef.current(localValue);
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  // Follow external changes (e.g. "Clear filters")
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const clear = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div className="relative flex-1 max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
      </div>
      <input
        id={SEARCH_INPUT_ID}
        type="search"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && localValue) {
            // First Escape clears the query, the next one leaves the field
            e.preventDefault();
            e.stopPropagation();
            clear();
          } else if (e.key === 'Enter') {
            // Apply immediately instead of waiting for the debounce
            onChange(localValue);
          }
        }}
        className="block w-full pl-10 pr-10 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 [&::-webkit-search-cancel-button]:hidden"
        placeholder={placeholder}
        aria-label="Search events"
        aria-keyshortcuts="/"
        autoComplete="off"
      />
      {localValue ? (
        <button
          type="button"
          onClick={clear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Clear search"
        >
          <X className="h-5 w-5" />
        </button>
      ) : (
        <kbd className="hidden sm:flex absolute inset-y-0 right-0 mr-3 my-auto h-5 items-center px-1.5 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-semibold text-slate-400 dark:text-slate-500 pointer-events-none">
          /
        </kbd>
      )}
    </div>
  );
};

export default SearchBar;
