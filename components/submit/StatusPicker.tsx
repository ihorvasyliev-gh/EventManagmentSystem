import React from 'react';
import { type EventStatus } from '../../types';

const OPTIONS: Array<{ value: EventStatus; label: string }> = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' }
];

/** Admins editing an event: published (on the calendar) or a draft (waiting for review) */
const StatusPicker: React.FC<{ value: EventStatus; onChange: (status: EventStatus) => void }> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Status</legend>
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={`relative inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded border text-sm font-medium cursor-pointer select-none transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
              selected
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700 dark:hover:text-brand-300'
            }`}
          >
            <input
              type="radio"
              name="status"
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              className={`w-2.5 h-2.5 rounded-full ${option.value === 'published' ? 'bg-ccp-green-500' : 'bg-amber-400'} ${selected ? 'ring-1 ring-white' : ''}`}
              aria-hidden="true"
            />
            {option.label}
          </label>
        );
      })}
    </div>
    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
      {value === 'published'
        ? 'On the calendar for everyone, and in the digest.'
        : 'Waiting for review: only admins (and the person who sent it in) can see it.'}
    </p>
  </fieldset>
);

export default StatusPicker;
