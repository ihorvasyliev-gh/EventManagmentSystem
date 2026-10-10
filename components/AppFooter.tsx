import React from 'react';

/** Copyright line, and the keyboard shortcuts on large screens */
const AppFooter: React.FC<{ isAdmin: boolean; clearTabBar: boolean }> = ({ isAdmin, clearTabBar }) => (
  // Room to scroll the last line out from under the phone's tab bar
  <footer className={`bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto pt-6 ${clearTabBar ? 'pb-28' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'}`}>
    <div className="max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 text-center text-slate-500 dark:text-slate-400 text-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em]">
        <span className="block sm:inline">&copy; {new Date().getFullYear()} Cork City Partnership</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Internal use only</span>
      </p>
      <p className="hidden lg:block mt-2 text-xs text-slate-400 dark:text-slate-500">
        Keyboard: <kbd className="font-sans font-semibold">/</kbd> search · <kbd className="font-sans font-semibold">←</kbd> <kbd className="font-sans font-semibold">→</kbd> previous / next · <kbd className="font-sans font-semibold">T</kbd> today
        {isAdmin && <> · <kbd className="font-sans font-semibold">C</kbd> new event · <kbd className="font-sans font-semibold">E</kbd> edit open event</>}
        {' '}· <kbd className="font-sans font-semibold">Esc</kbd> close
      </p>
    </div>
  </footer>
);

export default AppFooter;
