import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ className = '', count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`}
          aria-label="Loading..."
        />
      ))}
    </>
  );
};

export const EventCardSkeleton: React.FC = () => {
  return (
    <div className="p-6 border border-slate-100 dark:border-slate-700/50 rounded-2xl bg-white dark:bg-slate-800">
      <SkeletonLoader className="h-4 w-3/4 mb-4" />
      <SkeletonLoader className="h-3 w-1/2 mb-2" />
      <SkeletonLoader className="h-3 w-2/3" />
    </div>
  );
};

export const CalendarDaySkeleton: React.FC = () => {
  return (
    <div className="min-h-[7rem] sm:min-h-[9rem] border border-slate-100 dark:border-slate-700 rounded-2xl p-3 bg-white/50 dark:bg-slate-800/40">
      <SkeletonLoader className="h-4 w-8 mb-3 ml-auto" />
      <SkeletonLoader className="h-6 w-full mb-1.5" />
      <SkeletonLoader className="h-6 w-full" />
    </div>
  );
};

export default SkeletonLoader;
