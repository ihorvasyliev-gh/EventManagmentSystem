import { useState, useEffect } from 'react';

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * Today at midnight, moving on when the day changes: a calendar left open overnight kept
 * highlighting yesterday and listing today's events as upcoming-or-past by yesterday's date.
 */
export function useToday(): Date {
  const [today, setToday] = useState(startOfToday);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      setToday((prev) => {
        const next = startOfToday();
        return next.getTime() === prev.getTime() ? prev : next;
      });
      clearTimeout(timer);
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      // A second past midnight, so the new date is certainly there
      timer = setTimeout(update, tomorrow.getTime() - now.getTime() + 1000);
    };
    // Timers sleep with the computer: check again when the tab is looked at
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    update();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
