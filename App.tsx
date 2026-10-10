import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import Navbar from './components/Navbar';
import CalendarView from './components/CalendarView';
import LoginPage from './pages/LoginPage';
import SearchBar, { SEARCH_INPUT_ID } from './components/SearchBar';
import EventFiltersComponent from './components/EventFilters';
import ErrorBoundary from './components/ErrorBoundary';
import CategoryPills from './components/CategoryPills';
import SubmissionsBanner from './components/SubmissionsBanner';
import UpdateBanner from './components/UpdateBanner';
import AppFooter from './components/AppFooter';
import { CalendarDaySkeleton } from './components/SkeletonLoader';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { type Event, type EventFilters, UserRole } from './types';
import { filterEvents } from './utils/filterEvents';
import { getEventLocations, isRecurringEvent } from './utils/recurrence';
import BottomNavigation from './components/BottomNavigation';
import { useMedia } from './hooks/useMedia';
import { useSession } from './hooks/useSession';
import { useEventsSync } from './hooks/useEventsSync';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useSubmitPage } from './hooks/useSubmitPage';
import { useEventModal } from './hooks/useEventModal';
import { useEventActions } from './hooks/useEventActions';
import { useSubmissionActions } from './hooks/useSubmissionActions';
import { useDeepLinks, eventShareLink } from './hooks/useDeepLinks';
import { useAppShortcuts } from './hooks/useAppShortcuts';

// Lazy load modals for code splitting
const EventModal = lazy(() => import('./components/EventModal'));
const ExportModal = lazy(() => import('./components/ExportModal'));
const SubmissionsModal = lazy(() => import('./components/SubmissionsModal'));
const FortnightlyBulletinModal = lazy(() => import('./components/FortnightlyBulletinModal'));
const SubmitEventPage = lazy(() => import('./pages/SubmitEventPage'));
const StaffModal = lazy(() => import('./components/StaffModal'));
const PasswordModal = lazy(() => import('./components/PasswordModal'));
const StatsModal = lazy(() => import('./components/StatsModal'));

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  const { user, isSessionLoading, handleLogin, handleLogout, updateUser } = useSession();
  const isAdmin = user?.role === UserRole.ADMIN;

  const {
    events, setEvents, recurrenceExceptions, setRecurrenceExceptions,
    loadingEvents, isRefreshing, refreshEvents, syncAfterChange
  } = useEventsSync({
    userId: user?.id ?? null,
    onError: useCallback((message: string) => showToast(message, 'error'), [showToast]),
    onNewDraft: isAdmin ? (title: string) => showToast(`New submission received: "${title}"`, 'info') : undefined
  });

  // Mobile State
  const isMobile = useMedia('(max-width: 640px)');
  // Phones and small tablets get the bottom tab bar; not a phone held sideways, where it took a
  // third of the screen (the menu has the same actions)
  const hasTabBar = useMedia('(max-width: 767px) and (min-height: 500px)');
  usePullToRefresh(!!user && isMobile, () => void refreshEvents(true));

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EventFilters>({});

  // Windows and pages
  const modal = useEventModal();
  const submitPage = useSubmitPage();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSubmissionsModalOpen, setIsSubmissionsModalOpen] = useState(false);
  const [isBulletinModalOpen, setIsBulletinModalOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const openInbox = useCallback(() => setIsSubmissionsModalOpen(true), []);
  const openExport = useCallback(() => setIsExportModalOpen(true), []);

  const { pendingSubmissions, handleApproveSubmission, handleRejectSubmission, handleApproveAllSubmissions } =
    useSubmissionActions({ isAdmin, events, setEvents, syncAfterChange, showToast });
  const { handleUpdateEvent, handleDeleteInstance, handleDeleteEvent } = useEventActions({
    user, events, setEvents, recurrenceExceptions, setRecurrenceExceptions, syncAfterChange, showToast, modal
  });

  const { open: openEvent, close: closeEventModal } = modal;
  const { openWith: openSubmitPageWith } = submitPage;
  const handleDuplicateEvent = useCallback((event: Event) => {
    // The series itself, not the one occurrence that was opened
    const source = isRecurringEvent(event) ? events.find((e) => e.id === event.id) ?? event : event;
    closeEventModal();
    openSubmitPageWith(null, source);
  }, [events, closeEventModal, openSubmitPageWith]);

  useAppShortcuts(user, submitPage.open);
  useDeepLinks({ user, loadingEvents, events, recurrenceExceptions, onOpenEvent: openEvent, onOpenInbox: openInbox, showToast });

  // Filtered events
  const filteredEvents = useMemo(() => {
    return filterEvents(events, { ...filters, search: searchQuery }, user?.role);
  }, [events, filters, searchQuery, user?.role]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || filters.category || filters.status || filters.dateRange ||
    filters.location || filters.submitterEmail || filters.creatorId || filters.tags?.length
  );
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilters({});
  }, []);

  // Extract unique values for filters
  const availableLocations = useMemo(() => {
    return Array.from(new Set<string>(events.flatMap(getEventLocations)))
      .sort((a, b) => a.localeCompare(b));
  }, [events]);

  const availableSubmitterEmails = useMemo(() => {
    const emails = new Set<string>();
    events.forEach(e => {
      if (e.submitterEmail?.trim()) emails.add(e.submitterEmail.trim());
    });
    return Array.from(emails).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Signing in on a phone: the login form sits low on the page, and the calendar would open
  // scrolled down by as much as the page was scrolled to reach the button
  const userId = user?.id;
  useEffect(() => {
    if (userId) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [userId]);

  // Coming back from the submit page: pick up whatever was just submitted
  const wasSubmitPageOpenRef = React.useRef(submitPage.isOpen);
  useEffect(() => {
    if (wasSubmitPageOpenRef.current && !submitPage.isOpen && user) {
      void refreshEvents(true);
    }
    wasSubmitPageOpenRef.current = submitPage.isOpen;
  }, [submitPage.isOpen, user, refreshEvents]);

  if (submitPage.isOpen) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-[100dvh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>}>
        <SubmitEventPage
          currentUser={user}
          events={events}
          initialDate={submitPage.initialDate}
          template={submitPage.template}
          onBackToLogin={submitPage.close}
        />
      </Suspense>
    );
  }

  if (isSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 dark:bg-slate-900 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Restoring session…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onOpenSubmitEvent={submitPage.open}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900 flex flex-col font-sans">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onAddEventClick={submitPage.open}
        onOpenSubmitEvent={submitPage.open}
        onExportClick={openExport}
        onRefresh={() => refreshEvents(true)}
        loadingEvents={loadingEvents}
        isRefreshing={isRefreshing}
        pendingSubmissionsCount={pendingSubmissions.length}
        onOpenSubmissions={openInbox}
        onOpenFortnightlyBulletin={() => setIsBulletinModalOpen(true)}
        onOpenStaff={() => setIsStaffOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main className="flex-grow max-w-7xl 2xl:max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {isAdmin && pendingSubmissions.length > 0 && (
          <SubmissionsBanner submissions={pendingSubmissions} onOpen={openInbox} />
        )}

        {/* Search, categories and Filters: one row from 1024px; below that the categories get their own row */}
        <div className="mb-4 flex flex-wrap lg:flex-nowrap items-center gap-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <CategoryPills
            className="order-last w-full lg:order-none lg:w-auto"
            selected={filters.category}
            onSelect={(category) => setFilters(prev => ({ ...prev, category }))}
          />
          <EventFiltersComponent
            filters={filters}
            onFiltersChange={setFilters}
            availableLocations={availableLocations}
            availableSubmitterEmails={availableSubmitterEmails}
          />
        </div>

        {hasActiveFilters && !loadingEvents && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50/60 dark:bg-brand-950/30 px-4 py-2.5 text-sm text-brand-800 dark:text-brand-200" role="status">
            <span>
              Showing <strong>{filteredEvents.length}</strong> of {filterEvents(events, {}, user.role).length} events
              {searchQuery.trim() && <> matching “{searchQuery.trim()}”</>}
            </span>
            <button
              type="button"
              onClick={clearAllFilters}
              className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
            >
              Clear all
            </button>
          </div>
        )}

        {loadingEvents ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className="grid grid-cols-7 gap-2 lg:gap-4">
              {Array.from({ length: 35 }).map((_, idx) => (
                <CalendarDaySkeleton key={idx} />
              ))}
            </div>
          </div>
        ) : (
          <CalendarView
            events={filteredEvents}
            onEventClick={openEvent}
            onAddEventForDate={isAdmin ? submitPage.openWithDate : undefined}
            recurrenceExceptions={recurrenceExceptions}
            userRole={user.role}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            dateRange={filters.dateRange}
            location={filters.location}
          />
        )}
      </main>

      {modal.isOpen && (
        <Suspense fallback={null}>
          <EventModal
            isOpen={modal.isOpen}
            onClose={closeEventModal}
            event={modal.event}
            events={events}
            role={user.role}
            currentUserId={user.id}
            onUpdate={handleUpdateEvent}
            onDelete={handleDeleteEvent}
            onDeleteInstance={handleDeleteInstance}
            onDuplicate={isAdmin ? handleDuplicateEvent : undefined}
            recurrenceExceptions={recurrenceExceptions}
            initialMode={modal.initialMode}
            autoApproveOnSave={modal.autoApprove}
            draft={modal.draft}
            getShareLink={eventShareLink}
          />
        </Suspense>
      )}

      {isExportModalOpen && (
        <Suspense fallback={null}>
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            events={filteredEvents}
            onOpenFortnightlyBulletin={() => setIsBulletinModalOpen(true)}
          />
        </Suspense>
      )}

      {isStaffOpen && isAdmin && (
        <Suspense fallback={null}>
          <StaffModal isOpen={isStaffOpen} onClose={() => setIsStaffOpen(false)} currentUserId={user.id} />
        </Suspense>
      )}

      {isStatsOpen && isAdmin && (
        <Suspense fallback={null}>
          <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} events={events} recurrenceExceptions={recurrenceExceptions} />
        </Suspense>
      )}

      {(isChangePasswordOpen || user.mustChangePassword) && (
        <Suspense fallback={null}>
          <PasswordModal
            isOpen
            mode={user.mustChangePassword ? 'forced' : 'change'}
            email={user.email}
            onClose={() => setIsChangePasswordOpen(false)}
            onSignOut={handleLogout}
            onChanged={() => {
              setIsChangePasswordOpen(false);
              updateUser({ mustChangePassword: false });
              showToast('Your password has been changed', 'success');
            }}
          />
        </Suspense>
      )}

      {isBulletinModalOpen && (
        <Suspense fallback={null}>
          <FortnightlyBulletinModal
            isOpen={isBulletinModalOpen}
            onClose={() => setIsBulletinModalOpen(false)}
            events={events}
            recurrenceExceptions={recurrenceExceptions}
            canEmail={isAdmin}
            onOpenSubmissions={isAdmin ? () => {
              setIsBulletinModalOpen(false);
              setIsSubmissionsModalOpen(true);
            } : undefined}
          />
        </Suspense>
      )}

      {isSubmissionsModalOpen && (
        <Suspense fallback={null}>
          <SubmissionsModal
            isOpen={isSubmissionsModalOpen}
            onClose={() => setIsSubmissionsModalOpen(false)}
            submissions={pendingSubmissions}
            events={events}
            onApprove={handleApproveSubmission}
            onEdit={(ev) => modal.openToEdit(ev, { autoApprove: true })}
            onReject={handleRejectSubmission}
            onApproveAll={handleApproveAllSubmissions}
            onOpenEvent={openEvent}
          />
        </Suspense>
      )}

      <AppFooter isAdmin={isAdmin} clearTabBar={hasTabBar} />

      {hasTabBar && (
        <BottomNavigation
          onHomeClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onCreateClick={submitPage.open}
          createLabel={isAdmin ? 'New event' : 'Submit'}
          onInboxClick={isAdmin ? openInbox : undefined}
          inboxCount={pendingSubmissions.length}
          onSearchClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.getElementById(SEARCH_INPUT_ID)?.focus();
          }}
          onDigestClick={() => setIsBulletinModalOpen(true)}
          onExportClick={openExport}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AppContent />
          <UpdateBanner />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
