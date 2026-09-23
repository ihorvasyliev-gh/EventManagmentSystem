import React, { useState, useEffect } from 'react';
import { User, UserRole, Event } from '../types';
import { LogOut, Calendar, PlusCircle, Download, Moon, Sun, Menu, X, Inbox, FileText } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { useTheme } from '../contexts/ThemeContext';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onAddEventClick: () => void;
  onExportClick?: () => void;
  onRefresh?: () => void;
  loadingEvents?: boolean;
  isRefreshing?: boolean;
  events?: any[]; // Using any[] to avoid circular dependency issues if types are mixed, but ideally Event[]
  userRsvpEventIds?: Set<string>;
  pendingSubmissionsCount?: number;
  onOpenSubmissions?: () => void;
  onOpenFortnightlyBulletin?: () => void;
  onOpenSubmitEvent?: () => void;
  onEventClick?: (event: Event) => void;
}

const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onAddEventClick,
  onExportClick,
  onRefresh,
  loadingEvents = false,
  isRefreshing = false,
  events = [],
  userRsvpEventIds = new Set(),
  pendingSubmissionsCount = 0,
  onOpenSubmissions,
  onOpenFortnightlyBulletin,
  onOpenSubmitEvent,
  onEventClick
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleRefreshClick = () => {
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMobileMenuOpen]);

  const handleAddEventClickMobile = () => {
    onAddEventClick();
    setIsMobileMenuOpen(false);
  };

  const handleExportClickMobile = () => {
    if (onExportClick) {
      onExportClick();
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <nav className={`sticky top-0 z-50 w-full transition-all duration-300 ${theme === 'dark' ? 'glass-panel-dark text-white' : 'glass-panel text-slate-800'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo Section */}
            <div
              className="flex items-center space-x-2.5 sm:space-x-3 group cursor-pointer"
              onClick={handleRefreshClick}
              title="Click to refresh events"
            >
              <div className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs flex items-center justify-center">
                <img
                  src="/assets/ccp-logo.png"
                  alt="Cork City Partnership"
                  className="h-6 sm:h-7 w-auto object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-base sm:text-lg tracking-tight leading-none text-slate-900 dark:text-white select-none">
                  Calendar
                </span>
              </div>
              {(loadingEvents || isRefreshing) && (
                <div className="w-3.5 h-3.5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>

            {/* Desktop Actions Section - lg so phones/tablets get hamburger menu */}
            <div className="hidden lg:flex items-center gap-3 flex-nowrap">
              <div className="flex flex-col items-end pr-4 mr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{user.fullName}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{user.role}</span>
              </div>

              <div className="flex items-center gap-2">
                <NotificationCenter
                  userId={user.id}
                  events={events} // Pass events
                  userRsvpEventIds={userRsvpEventIds} // Pass RSVP IDs
                  onEventClick={onEventClick}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all btn-hover-effect rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                />

                <button
                  onClick={toggleTheme}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all btn-hover-effect rounded-lg"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                  aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>

                {onOpenFortnightlyBulletin && (
                  <button
                    onClick={onOpenFortnightlyBulletin}
                    className="flex items-center space-x-1.5 text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/50 font-medium px-3 py-1.5 rounded-lg transition-all text-sm border border-brand-200 dark:border-brand-800 shadow-xs"
                    title="Generate 2-week Upcoming Events Digest for Board and staff"
                  >
                    <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                    <span className="hidden sm:inline">Events Digest</span>
                  </button>
                )}

                {onExportClick && (
                  <button
                    onClick={onExportClick}
                    className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5 rounded-lg transition-all hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 btn-hover-effect text-sm"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export</span>
                  </button>
                )}

                {user.role === UserRole.ADMIN && onOpenSubmissions && (
                  <button
                    onClick={onOpenSubmissions}
                    className="relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Review staff submissions"
                  >
                    <Inbox className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                    <span className="hidden sm:inline">Submissions</span>
                    {pendingSubmissionsCount > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white animate-pulse">
                        {pendingSubmissionsCount}
                      </span>
                    )}
                  </button>
                )}

                {user.role === UserRole.ADMIN ? (
                  <button
                    onClick={onAddEventClick}
                    className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-xs btn-hover-effect"
                    title="Create a new event (shortcut: C)"
                    aria-keyshortcuts="c"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>New Event</span>
                  </button>
                ) : onOpenSubmitEvent && (
                  <button
                    onClick={onOpenSubmitEvent}
                    className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-xs btn-hover-effect"
                    title="Submit an event for review"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Submit Event</span>
                  </button>
                )}

                <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

                <button
                  onClick={onLogout}
                  aria-label="Sign out"
                  className="group flex items-center gap-2 p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg btn-hover-effect"
                  title="Sign Out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mobile Actions Section - show on everything below lg (1024px) */}
            <div className="flex lg:hidden items-center gap-2 flex-shrink-0">
              <NotificationCenter
                userId={user.id}
                events={events} // Pass events
                userRsvpEventIds={userRsvpEventIds} // Pass RSVP IDs
                onEventClick={onEventClick}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all btn-hover-effect rounded-lg"
              />

              <button
                onClick={toggleTheme}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all btn-hover-effect rounded-lg"
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all btn-hover-effect rounded-lg"
                aria-label="Toggle menu"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm animate-fade-in lg:hidden"
            onClick={handleMobileMenuClose}
            aria-hidden="true"
          />
          <div className={`fixed top-16 left-0 right-0 z-50 ${theme === 'dark' ? 'glass-panel-dark' : 'bg-white'} border-b border-slate-200 dark:border-slate-800 shadow-xl animate-slide-down lg:hidden`}>
            <div className="max-w-7xl mx-auto px-4 py-4">
              {/* User Info */}
              <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{user.fullName}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mt-0.5">{user.role}</span>
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-2">
                {onExportClick && (
                  <button
                    onClick={handleExportClickMobile}
                    className="w-full flex items-center space-x-3 text-left px-4 py-3 min-h-[48px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all font-medium"
                  >
                    <Download className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    <span>Export Events</span>
                  </button>
                )}

                {onOpenFortnightlyBulletin && (
                  <button
                    onClick={() => {
                      onOpenFortnightlyBulletin();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 text-left px-4 py-3 min-h-[48px] text-brand-700 dark:text-brand-300 bg-brand-50/50 dark:bg-brand-950/20 hover:bg-brand-100 rounded-lg transition-all font-medium"
                  >
                    <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    <span>Upcoming Events Digest</span>
                  </button>
                )}

                {user.role === UserRole.ADMIN && (
                  <button
                    onClick={handleAddEventClickMobile}
                    className="w-full flex items-center space-x-3 text-left px-4 py-3 min-h-[48px] text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all font-medium"
                  >
                    <PlusCircle className="h-5 w-5" />
                    <span>New Event</span>
                  </button>
                )}

                {user.role !== UserRole.ADMIN && onOpenSubmitEvent && (
                  <button
                    onClick={() => {
                      onOpenSubmitEvent();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 text-left px-4 py-3 min-h-[48px] text-brand-700 dark:text-brand-300 bg-brand-50/50 dark:bg-brand-950/20 hover:bg-brand-100 rounded-lg transition-all font-medium"
                  >
                    <PlusCircle className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    <span>Submit Event</span>
                  </button>
                )}

                {user.role === UserRole.ADMIN && onOpenSubmissions && (
                  <button
                    onClick={() => {
                      onOpenSubmissions();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between text-left px-4 py-3 min-h-[48px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all font-medium"
                  >
                    <div className="flex items-center space-x-3">
                      <Inbox className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                      <span>Submissions Inbox</span>
                    </div>
                    {pendingSubmissionsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white">
                        {pendingSubmissionsCount}
                      </span>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center space-x-3 text-left px-4 py-3 min-h-[48px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all font-medium"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
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
