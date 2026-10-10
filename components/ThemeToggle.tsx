import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

/** Light / dark switch for pages without the main navbar (login, submit form) */
const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-300 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors ${className}`}
    >
      {theme === 'light' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </button>
  );
};

export default ThemeToggle;
