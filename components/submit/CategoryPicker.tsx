import React from 'react';
import { Plus } from 'lucide-react';
import { useCategories } from '../../contexts/CategoriesContext';
import { getCategoryIconColor } from '../WeekView';
import CategoryIcon from '../CategoryIcon';
import { FieldError } from './formParts';

interface CategoryPickerProps {
  value: string;
  onChange: (category: string) => void;
  extra?: string | null;
  required?: boolean;
  error?: string;
  /** Admin only: opens the "Add category" modal right from the submission form */
  onAddCategory?: () => void;
}

/**
 * The categories as pills (radio buttons underneath), two to a row on phones. None is picked for
 * a new event. An event being edited may have a retired category: it is offered too, first.
 */
const CategoryPicker: React.FC<CategoryPickerProps> = ({ value, onChange, extra, required, error, onAddCategory }) => {
  const { categories } = useCategories();
  const names = categories.map((c) => c.name);
  const options = [...(extra && !names.includes(extra) ? [extra] : []), ...names];

  return (
    <fieldset
      id="field-category"
      tabIndex={-1}
      aria-invalid={!!error}
      aria-describedby={error ? 'err-category' : undefined}
      className="outline-none scroll-mt-24"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
          Category{required && <> <span className="text-red-500" aria-hidden="true">*</span></>}
        </legend>
        {onAddCategory && (
          <button
            type="button"
            onClick={onAddCategory}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            New category
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {options.map((cat) => {
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
              <CategoryIcon
                category={cat}
                className={`w-4 h-4 shrink-0 ${selected ? 'text-white' : getCategoryIconColor(cat)}`}
              />
              {cat}
            </label>
          );
        })}
      </div>
      <FieldError id="err-category" message={error} />
    </fieldset>
  );
};

export default CategoryPicker;
