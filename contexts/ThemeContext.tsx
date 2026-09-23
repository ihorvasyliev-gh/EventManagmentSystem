import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const getSavedTheme = (): Theme | null => {
  try {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
};

const getSystemTheme = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // An explicit choice wins; otherwise follow the operating system setting
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme() ?? getSystemTheme());

  // Sync the class on <html> (the inline script in index.html sets it before first paint)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Follow OS changes until the user picks a theme themselves
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media?.addEventListener) return;
    const handleChange = (e: MediaQueryListEvent) => {
      if (!getSavedTheme()) setTheme(e.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('theme', next);
      } catch {
        // Storage unavailable — the choice lasts for this session only
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
