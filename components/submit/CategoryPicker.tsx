import React from 'react';
import { EVENT_CATEGORIES, type EventCategoryName } from '../../constants/categories';
import { getCategoryDotColor } from '../WeekView';
import { FieldError } from './formParts';

/**
 * The categories as pills (radio buttons underneath), two to a row on phones. None is picked for
 * a new event. An event being edited may have a category an admin added: it is offered too, first.
 */
const CategoryPicker: React.FC<{ value: string; onChange: (category: string) => void; extra?: string | null; required?: boolean; error?: string }> = ({ value, onChange, extra, required, error }) => (
  <fieldset
    id="field-category"
    tabIndex={-1}
    aria-invalid={!!error}
    aria-describedby={error ? 'err-category' : undefined}
    className="outline-none scroll-mt-24"
  >
    <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
      Category{required && <> <span className="text-red-500" aria-hidden="true">*</span></>}
    </legend>
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {[...(extra && !EVENT_CATEGORIES.includes(extra as EventCategoryName) ? [extra] : []), ...EVENT_CATEGORIES].map((cat) => {
        const selected = value === cat;
        return (
          <label
            key={cat}
            className={`relative inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 min-h-[44px] sm:min-h-[40px] rounded border text-sm leading-tight font-medium cursor-pointer select-none transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
              selected
                ? 'border-brand-600 bg-brand-600 text-white'
                : error
                ? 'border-red-300 dark:border-red-500/60 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-brand-300 hover:text-brand-600'
                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700 dark:hover:text-brand-300'
            }`}
          >
            <input
              type="radio"
              name="category"
              value={cat}
              checked={selected}
              onChange={() => onChange(cat)}
              className="sr-only"
            />
            <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${getCategoryDotColor(cat)} ${selected ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
            {cat}
          </label>
        );
      })}
    </div>
    <FieldError id="err-category" message={error} />
  </fieldset>
);

export default CategoryPicker;
