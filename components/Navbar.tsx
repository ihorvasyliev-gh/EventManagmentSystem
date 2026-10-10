import React, { useState, useEffect, useRef } from 'react';
import { type User, UserRole } from '../types';
import { LogOut, PlusCircle, Download, Moon, Sun, Menu, X, Inbox, FileText, RefreshCw, Users, KeyRound, BarChart3, ChevronDown } from 'lucide-react';
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
  /** Admins: staff accounts and password resets */
  onOpenStaff?: () => void;
  /** Admins: event statistics for Board reports */
  onOpenStats?: () => void;
  onChangePassword?: () => void;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const iconButton =
  'relative inline-flex items-center justify-center w-10 h-10 rounded-xl text-slate-500 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors';

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
  onOpenSubmitEvent,
  onOpenStaff,
  onOpenStats,
  onChangePassword
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
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

  // Account menu (desktop): closes on Escape or a click elsewhere
  useEffect(() => {
    if (!isAccountOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAccountOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setIsAccountOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isAccountOpen]);

  const closeMenuAnd = (action?: () => void) => () => {
    setIsMenuOpen(false);
    setIsAccountOpen(false);
    action?.();
  };

  const primaryAction = isAdmin ? onAddEventClick : onOpenSubmitEvent;
  const primaryLabel = isAdmin ? 'New Event' : 'Submit Event';

  const accountItem =
    'w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

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
                <img src="/assets/ccp-logo-v2.png" alt="" className="h-6 sm:h-7 w-auto object-contain" />
              </span>
              <span className="hidden min-[400px]:inline font-medium text-base sm:text-lg text-slate-900 dark:text-white select-none truncate">
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
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-300 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
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
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-300 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
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
                  className="hidden md:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 hover:text-brand-600 hover:bg-brand-50/60 dark:text-slate-300 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
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
                  className="cta hidden md:inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 h-10 rounded shadow-sm transition-colors ml-1"
                  title={isAdmin ? 'Create a new event (shortcut: C)' : 'Submit an event for review'}
                  aria-keyshortcuts={isAdmin ? 'c' : undefined}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{primaryLabel}</span>
                </button>
              )}

              {/* Account (desktop) */}
              <div ref={accountRef} className="relative hidden lg:flex items-center pl-3 ml-1.5 border-l border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAccountOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isAccountOpen}
                  aria-controls="account-menu"
                  className="flex items-center gap-2 rounded-xl pl-1 pr-2 py-1 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
                  title={`${user.fullName} (${user.role})`}
                >
                  <span className="w-9 h-9 rounded-full bg-ccp-green-600 text-white text-xs font-bold inline-flex items-center justify-center" aria-hidden="true">
                    {initialsOf(user.fullName)}
                  </span>
                  <span className="hidden xl:flex flex-col items-start leading-tight max-w-[10rem]">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-full">{user.fullName}</span>
                    <span className="text-[10px] text-brand-600 dark:text-brand-300 uppercase tracking-[0.14em] font-bold">{user.role}</span>
                  </span>
                  <span className="sr-only xl:hidden">Account menu</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isAccountOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isAccountOpen && (
                  <div id="account-menu" role="menu" className={`absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-1.5 animate-scale-in origin-top-right ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                    </div>
                    {onChangePassword && (
                      <button type="button" role="menuitem" onClick={closeMenuAnd(onChangePassword)} className={accountItem}>
                        <KeyRound className="h-4 w-4 text-slate-400" /> Change password
                      </button>
                    )}
                    {isAdmin && onOpenStaff && (
                      <button type="button" role="menuitem" onClick={closeMenuAnd(onOpenStaff)} className={accountItem}>
                        <Users className="h-4 w-4 text-slate-400" /> Staff accounts
                      </button>
                    )}
                    {isAdmin && onOpenStats && (
                      <button type="button" role="menuitem" onClick={closeMenuAnd(onOpenStats)} className={accountItem}>
                        <BarChart3 className="h-4 w-4 text-slate-400" /> Statistics
                      </button>
                    )}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                    <button type="button" role="menuitem" onClick={closeMenuAnd(onLogout)} className={`${accountItem} !text-red-600 dark:!text-red-400`}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
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
                <span className="w-10 h-10 rounded-full bg-ccp-green-600 text-white text-sm font-bold inline-flex items-center justify-center shrink-0" aria-hidden="true">
                  {initialsOf(user.fullName)}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</span>
                </span>
                <span className="ml-auto shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.14em] bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300">
                  {user.role}
                </span>
              </div>

              <div className="space-y-0.5">
                {primaryAction && (
                  <button type="button" onClick={closeMenuAnd(primaryAction)} className={`${menuItem} cta md:hidden !text-white bg-brand-600 hover:!bg-brand-700 mb-1`}>
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
                {isAdmin && onOpenStaff && (
                  <button type="button" onClick={closeMenuAnd(onOpenStaff)} className={menuItem}>
                    <Users className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Staff accounts</span>
                  </button>
                )}
                {isAdmin && onOpenStats && (
                  <button type="button" onClick={closeMenuAnd(onOpenStats)} className={menuItem}>
                    <BarChart3 className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Statistics</span>
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
                {onChangePassword && (
                  <button type="button" onClick={closeMenuAnd(onChangePassword)} className={menuItem}>
                    <KeyRound className="h-5 w-5 text-slate-400" />
                    <span className="flex-1">Change password</span>
                  </button>
                )}
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
