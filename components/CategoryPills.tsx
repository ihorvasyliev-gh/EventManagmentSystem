import React, { useEffect, useRef, useState } from 'react';
import { EVENT_CATEGORIES, CATEGORY_SHORT_LABELS } from '../constants/categories';
import { getCategoryDotColor } from './WeekView';

interface CategoryPillsProps {
  selected?: string;
  onSelect: (category: string | undefined) => void;
  className?: string;
}

const pillClass = (active: boolean) =>
  `flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
    active
      ? 'bg-brand-600 text-white shadow-sm'
      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
  }`;

/** Quick category filter: one compact row of short names (full names in the tooltip) that scrolls sideways when it doesn't fit */
const CategoryPills: React.FC<CategoryPillsProps> = ({ selected, onSelect, className = '' }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreOnRight, setMoreOnRight] = useState(false);

  // Fade the right edge only while some categories are hidden there
  useEffect(() => {
    const scroller = scrollerRef.current;
    const row = rowRef.current;
    if (!scroller || !row) return;
    const update = () => setMoreOnRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(row);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`min-w-0 min-h-10 sm:h-10 py-1 sm:py-0 flex items-center px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}>
      <div
        ref={scrollerRef}
        className={`min-w-0 w-full overflow-x-auto no-scrollbar touch-pan-x ${moreOnRight ? '[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]' : ''}`}
        role="group"
        aria-label="Filter by category"
      >
        <div ref={rowRef} className="flex w-max items-center gap-0.5">
          <button type="button" onClick={() => onSelect(undefined)} aria-pressed={!selected} className={pillClass(!selected)}>
            All
          </button>
          {EVENT_CATEGORIES.map((cat) => {
            const isSelected = selected === cat;
            return (
              <button key={cat} type="button" onClick={() => onSelect(isSelected ? undefined : cat)} aria-pressed={isSelected} title={cat} className={pillClass(isSelected)}>
                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)} ${isSelected ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
                {CATEGORY_SHORT_LABELS[cat]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CategoryPills;
