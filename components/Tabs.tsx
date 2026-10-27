import React, { useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<NoInfer<T>>>;
  value: T;
  onChange: (id: NoInfer<T>) => void;
  label: string;
  className?: string;
}

/**
 * Tabs inside a window, in the same underlined style as Month / Week / Agenda. The arrow keys,
 * Home and End move between them, and Tab goes on to the content.
 */
function Tabs<T extends string>({ tabs, value, onChange, label, className = '' }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === 'ArrowRight' ? (index + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`grid border-b border-slate-200 dark:border-slate-700 ${className}`}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex items-center justify-center gap-1.5 min-h-11 px-2 text-sm font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-current focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
              selected ? 'text-brand-600 dark:text-brand-300 after:opacity-100' : 'text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 after:opacity-0'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
