import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { LogOut, PlusCircle, Download, Moon, Sun, Menu, X, Inbox, FileText, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onAddEventClick: () => void;
  onExportClick?: () => void;
  onRefresh?: () => void;
  loadingEvents?: boolean;
  isRefreshing?: boolean;
  pendingSubmissionsCount?: number;
  onOpenSubmissions?: () => void;
  onOpenFortnightlyBulletin?: () => void;
  onOpenSubmitEvent?: () => void;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const iconButton =
  'relative inline-flex items-center justify-center w-10 h-10 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors';

const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onAddEventClick,
  onExportClick,
  onRefresh,
  loadingEvents = false,
  isRefreshing = false,
  pendingSubmissionsCount = 0,
  onOpenSubmissions,
  onOpenFortnightlyBulletin,
  onOpenSubmitEvent
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isAdmin = user.role === UserRole.ADMIN;
  const isBusy = loadingEvents || isRefreshing;

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMenuOpen]);

  const closeMenuAnd = (action?: () => void) => () => {
    setIsMenuOpen(false);
    action?.();
  };

  const primaryAction = isAdmin ? onAddEventClick : onOpenSubmitEvent;
  const primaryLabel = isAdmin ? 'New Event' : 'Submit Event';

  const menuItem =
    'w-full flex items-center gap-3 text-left px-3 py-3 min-h-[48px] rounded-xl font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

  return (
    <>
      <nav className={`sticky top-0 z-50 w-full pt-[env(safe-area-inset-top)] ${theme === 'dark' ? 'glass-panel-dark text-white' : 'glass-panel text-slate-800'}`}>
        <div className="max-w-7xl 2xl:max-w-[96rem] mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center gap-2">
            {/* Brand */}
            <button
              type="button"
              className="flex items-center gap-2.5 min-w-0 rounded-xl -ml-1 pl-1 pr-2 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
              onClick={onRefresh}
              title="Refresh events"
              aria-label="CCP Calendar — refresh events"
            >
              <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-center shrink-0">
                <img src="/assets/ccp-logo.png" alt="" className="h-6 sm:h-7 w-auto object-contain" />
              </span>
              <span className="hidden min-[400px]:inline font-semibold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white select-none truncate">
                Calendar
              </span>
              {isBusy && <RefreshCw className="w-3.5 h-3.5 text-brand-600 animate-spin shrink-0" aria-label="Syncing" />}
            </button>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Desktop-only secondary actions */}
              {onOpenFortnightlyBulletin && (
                <button
                  type="button"
                  onClick={onOpenFortnightlyBulletin}
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                  title="Generate the Upcoming Events Digest (PDF & WhatsApp)"
                >
                  <FileText className="h-4 w-4" />
                  <span>Digest</span>
                </button>
              )}
              {onExportClick && (
                <button
                  type="button"
                  onClick={onExportClick}
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                  title="Export or subscribe to the calendar"
                >
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </button>
              )}
              {isAdmin && onOpenSubmissions && (
                <button
                  type="button"
                  onClick={onOpenSubmissions}
                  className="hidden md:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                  title="Review staff submissions"
                >
                  <Inbox className="h-4 w-4" />
                  <span>Inbox</span>
                  {pendingSubmissionsCount > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold bg-brand-600 text-white">
                      {pendingSubmissionsCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={toggleTheme}
                className={`${iconButton} hidden md:inline-flex`}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
              </button>

              {primaryAction && (
                <button
                  type="button"
                  onClick={primaryAction}
                  className="hidden md:inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-semibold shadow-sm transition-colors ml-1"
                  title={isAdmin ? 'Create a new event (shortcut: C)' : 'Submit an event for review'}
                  aria-keyshortcuts={isAdmin ? 'c' : undefined}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{primaryLabel}</span>
                </button>
              )}

              {/* Account (desktop) */}
              <div className="hidden lg:flex items-center gap-2 pl-3 ml-1.5 border-l border-slate-200 dark:border-slate-800">
                <span
                  className="w-9 h-9 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold inline-flex items-center justify-center"
                  title={`${user.fullName} (${user.role})`}
                  aria-hidden="true"
                >
                  {initialsOf(user.fullName)}
                </span>
                <span className="hidden xl:flex flex-col leading-tight max-w-[10rem]">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{user.fullName}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{user.role}</span>
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Sign out"
                  title="Sign out"
                  className={`${iconButton} hover:!text-red-600 dark:hover:!text-red-400`}
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </div>

              {/* Menu (phones & tablets) */}
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className={`${iconButton} lg:hidden`}
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMenuOpen}
                aria-controls="app-menu"
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Menu drawer */}
      {isMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm animate-fade-in lg:hidden"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="app-menu"
            className={`fixed top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-16 inset-x-0 sm:inset-x-auto sm:right-4 sm:w-80 z-50 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} border-b sm:border sm:rounded-2xl border-slate-200 dark:border-slate-800 shadow-xl animate-slide-down lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto`}
          >
            <div className="p-3">
              <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span className="w-10 h-10 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-sm font-bold inline-flex items-center justify-center shrink-0" aria-hidden="true">
                  {initialsOf(user.fullName)}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</span>
                </span>
                <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {user.role}
                </span>
              </div>

              <div className="space-y-0.5">
                {primaryAction && (
                  <button type="button" onClick={closeMenuAnd(primaryAction)} className={`${menuItem} md:hidden !text-white bg-brand-600 hover:!bg-brand-700 mb-1`}>
                    <PlusCircle className="h-5 w-5" />
                    <span>{isAdmin ? 'New event' : 'Submit an event'}</span>
                  </button>
                )}
                {isAdmin && onOpenSubmissions && (
                  <button type="button" onClick={closeMenuAnd(onOpenSubmissions)} className={`${menuItem} md:hidden`}>
                    <Inbox className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Submissions inbox</span>
                    {pendingSubmissionsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white">{pendingSubmissionsCount}</span>
                    )}
                  </button>
                )}
                {onOpenFortnightlyBulletin && (
                  <button type="button" onClick={closeMenuAnd(onOpenFortnightlyBulletin)} className={menuItem}>
                    <FileText className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Events digest</span>
                    <span className="text-xs text-slate-400">PDF · WhatsApp</span>
                  </button>
                )}
                {onExportClick && (
                  <button type="button" onClick={closeMenuAnd(onExportClick)} className={menuItem}>
                    <Download className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Export & subscribe</span>
                  </button>
                )}
                <button type="button" onClick={toggleTheme} className={`${menuItem} md:hidden`}>
                  {theme === 'light' ? <Moon className="h-5 w-5 text-slate-400" /> : <Sun className="h-5 w-5 text-slate-400" />}
                  <span className="flex-1">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
                </button>
                {onRefresh && (
                  <button type="button" onClick={closeMenuAnd(onRefresh)} className={menuItem}>
                    <RefreshCw className={`h-5 w-5 text-slate-400 ${isBusy ? 'animate-spin' : ''}`} />
                    <span className="flex-1">Refresh events</span>
                  </button>
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={closeMenuAnd(onLogout)} className={`${menuItem} !text-red-600 dark:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-950/30`}>
                  <LogOut className="h-5 w-5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Navbar;
