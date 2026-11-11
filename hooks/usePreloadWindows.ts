import { useEffect } from 'react';

interface Preloadable {
  preload: () => Promise<unknown>;
}

/** Someone who asked their browser to save data, or is on a very slow connection */
const prefersLessData = (): boolean => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!connection && (connection.saveData === true || /(^|-)2g$/.test(connection.effectiveType ?? ''));
};

const whenIdle = (run: () => void, timeout: number): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const timer = setTimeout(run, Math.min(timeout, 1500));
  return () => clearTimeout(timer);
};

/**
 * Windows load their files when first opened, which on a slow connection is a wait with nothing
 * on screen, and offline doesn't work at all. Once the calendar is up, the files of the windows
 * people open most are fetched in the background, while the browser has nothing else to do:
 * `first` straight away, `later` a few seconds after. They are small (the PDF and Excel parts
 * still load only when used). A file that fails to load here is simply asked for again when its
 * window is opened.
 */
export const usePreloadWindows = (ready: boolean, first: Preloadable[], later: Preloadable[]) => {
  useEffect(() => {
    if (!ready || prefersLessData()) return;
    const load = (windows: Preloadable[]) => () => {
      if (!navigator.onLine) return;
      windows.forEach((w) => void w.preload().catch(() => undefined));
    };
    const cancelFirst = whenIdle(load(first), 2000);
    let cancelLater: (() => void) | undefined;
    const timer = setTimeout(() => {
      cancelLater = whenIdle(load(later), 5000);
    }, 4000);
    return () => {
      cancelFirst();
      clearTimeout(timer);
      cancelLater?.();
    };
  }, [ready, first, later]);
};
