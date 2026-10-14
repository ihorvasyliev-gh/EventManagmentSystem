import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'theme';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const getSavedTheme = (): Theme | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
};

const getSystemTheme = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Switches still settling: a second switch during the crossfade keeps transitions off until both end
let switching = 0;

/**
 * Switches the page's colours in one go. The colours come from the `dark` class on <html>
 * (Tailwind's dark: styles), so nothing has to re-render for them. Element transitions are off
 * while it happens: with them, a few dozen buttons and cards faded on their own timing while
 * everything else jumped, which looked patchy. Where the browser can, the whole page crossfades
 * from the old picture to the new one instead (View Transitions).
 */
const switchColours = (next: Theme, update: () => void, animate: boolean) => {
  const root = document.documentElement;
  const apply = () => {
    switching++;
    root.classList.add('theme-switching');
    root.classList.toggle('dark', next === 'dark');
    update();
  };
  const settle = () => {
    // Styles are worked out with transitions off, then they come back for normal use
    void getComputedStyle(root).color;
    requestAnimationFrame(() => {
      switching = Math.max(0, switching - 1);
      if (switching === 0) root.classList.remove('theme-switching');
    });
  };

  if (animate && typeof document.startViewTransition === 'function' && document.visibilityState === 'visible' && !prefersReducedMotion()) {
    try {
      const transition = document.startViewTransition(apply);
      // A skipped crossfade (e.g. the tab was hidden) still switched the colours
      transition.ready.catch(() => undefined);
      transition.finished.then(settle, settle);
      return;
    } catch {
      // Fall through: switch without the crossfade
    }
  }
  apply();
  settle();
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // An explicit choice wins; otherwise follow the operating system setting
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme() ?? getSystemTheme());
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // The class on <html> follows the state (theme-init.js already set it before the first paint)
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  /** Shows a theme: the colours and the React state (icons, labels) change in the same frame */
  const show = useCallback((next: Theme, animate: boolean) => {
    if (next === themeRef.current) return;
    switchColours(next, () => {
      themeRef.current = next;
      flushSync(() => setTheme(next));
    }, animate);
  }, []);

  useEffect(() => {
    // Follow OS changes until the user picks a theme themselves
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (!getSavedTheme()) show(e.matches ? 'dark' : 'light', true);
    };
    // A choice made in another tab of the app
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      show(getSavedTheme() ?? getSystemTheme(), false);
    };
    media?.addEventListener?.('change', handleSystemChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      media?.removeEventListener?.('change', handleSystemChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [show]);

  const toggleTheme = useCallback(() => {
    const next = themeRef.current === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the choice lasts for this session only
    }
    show(next, true);
  }, [show]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
