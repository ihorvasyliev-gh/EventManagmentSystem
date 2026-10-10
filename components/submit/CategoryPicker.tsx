import React from 'react';
import { EVENT_CATEGORIES, type EventCategoryName } from '../../constants/categories';
import { getCategoryDotColor } from '../WeekView';

/** The categories as a row of pills (radio buttons underneath) */
const CategoryPicker: React.FC<{ value: EventCategoryName; onChange: (category: EventCategoryName) => void }> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Category</legend>
    <div className="flex flex-wrap gap-2">
      {EVENT_CATEGORIES.map((cat) => {
        const selected = value === cat;
        return (
          <label
            key={cat}
            className={`relative inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded border text-sm font-medium cursor-pointer select-none transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
              selected
                ? 'border-brand-600 bg-brand-600 text-white'
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
            <span className={`w-2.5 h-2.5 rounded-full ${getCategoryDotColor(cat)} ${selected ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
            {cat}
          </label>
        );
      })}
    </div>
  </fieldset>
);

export default CategoryPicker;
