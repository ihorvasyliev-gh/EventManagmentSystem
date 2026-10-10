import React from 'react';
import { EVENT_CATEGORIES } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';

interface CategoryPillsProps {
  selected?: string;
  onSelect: (category: string | undefined) => void;
}

const pillClass = (active: boolean) =>
  `flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded border font-medium whitespace-nowrap transition-all ${
    active
      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-300 dark:hover:border-brand-700 border-slate-200 dark:border-slate-700'
  }`;

/** Quick category filter: one row that scrolls sideways (faded edge) until it fits, from 1280px */
const CategoryPills: React.FC<CategoryPillsProps> = ({ selected, onSelect }) => (
  <div className="mb-4 sm:mb-6 flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar text-xs -mx-3 px-3 sm:mx-0 sm:px-0 touch-pan-x [mask-image:linear-gradient(to_right,#000_88%,transparent)] xl:[mask-image:none]" role="group" aria-label="Filter by category">
    <button type="button" onClick={() => onSelect(undefined)} aria-pressed={!selected} className={pillClass(!selected)}>
      All
    </button>
    {EVENT_CATEGORIES.map((cat) => {
      const isSelected = selected === cat;
      return (
        <button key={cat} type="button" onClick={() => onSelect(isSelected ? undefined : cat)} aria-pressed={isSelected} className={pillClass(isSelected)}>
          <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)} ${isSelected ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
          {cat}
        </button>
      );
    })}
  </div>
);

export default CategoryPills;
