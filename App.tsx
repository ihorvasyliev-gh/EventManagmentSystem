import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import Navbar from './components/Navbar';
import CalendarView from './components/CalendarView';
import LoginPage from './pages/LoginPage';
import SearchBar from './components/SearchBar';
import EventFiltersComponent, { type Submitter } from './components/EventFilters';
import ErrorBoundary from './components/ErrorBoundary';
import CategoryPills from './components/CategoryPills';
import SubmissionsBanner from './components/SubmissionsBanner';
import DigestChangedBanner from './components/DigestChangedBanner';
import UpdateBanner from './components/UpdateBanner';
import OfflineBanner from './components/OfflineBanner';
import AppFooter from './components/AppFooter';
import { CalendarDaySkeleton } from './components/SkeletonLoader';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { type Event, type EventFilters, UserRole } from './types';
import { filterEvents } from './utils/filterEvents';
import { getEventLocations, isRecurringEvent } from './utils/recurrence';
import BottomNavigation from './components/BottomNavigation';
import { useMedia } from './hooks/useMedia';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSession } from './hooks/useSession';
import { useEventsSync } from './hooks/useEventsSync';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useSubmitPage } from './hooks/useSubmitPage';
import { useEventModal } from './hooks/useEventModal';
import { useEventActions } from './hooks/useEventActions';
import { useSubmissionActions } from './hooks/useSubmissionActions';
import { useDeepLinks, eventShareLink } from './hooks/useDeepLinks';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useChangeLogBadge } from './hooks/useChangeLogBadge';
import { useSentDigest } from './hooks/useSentDigest';
import { useReminderEmail } from './hooks/useReminderEmail';
import { loadOrReload } from './utils/staleChunk';

// Windows and pages load when first opened; after a deploy an old tab reloads instead of crashing
const lazyWithReload = <T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  lazy(() => loadOrReload(load));
const EventModal = lazyWithReload(() => import('./components/EventModal'));
const ExportModal = lazyWithReload(() => import('./components/ExportModal'));
const SubmissionsModal = lazyWithReload(() => import('./components/SubmissionsModal'));
const FortnightlyBulletinModal = lazyWithReload(() => import('./components/FortnightlyBulletinModal'));
// A shared digest's page (/digest/…): anyone with the link, no account, no calendar
const DigestViewPage = lazyWithReload(() => import('./pages/DigestViewPage'));
const isDigestPage = () => window.location.pathname.startsWith('/digest/');
const SubmitEventPage = lazyWithReload(() => import('./pages/SubmitEventPage'));
const StaffModal = lazyWithReload(() => import('./components/StaffModal'));
const EmailRecipientsModal = lazyWithReload(() => import('./components/EmailRecipientsModal'));
const PasswordModal = lazyWithReload(() => import('./components/PasswordModal'));
const StatsModal = lazyWithReload(() => import('./components/StatsModal'));
const ChangeLogModal = lazyWithReload(() => import('./components/ChangeLogModal'));
const MyEventsModal = lazyWithReload(() => import('./components/MyEventsModal'));

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  const { user, isSessionLoading, handleLogin, handleLogout, updateUser } = useSession();
  const isAdmin = user?.role === UserRole.ADMIN;

  const {
    events, setEvents, recurrenceExceptions, setRecurrenceExceptions,
    loadingEvents, isRefreshing, lastSyncedAt, refreshEvents, syncAfterChange
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
  const isOnline = useOnlineStatus();

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
  const [isRecipientsOpen, setIsRecipientsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isMyEventsOpen, setIsMyEventsOpen] = useState(false);
  // The logo and the Calendar tab: back to today, at the top
  const [todayRequest, setTodayRequest] = useState(0);
  const goHome = useCallback(() => {
    setTodayRequest((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  // Admins: the change log, and how many staff edits came in since it was last opened
  const changeLog = useChangeLogBadge(isAdmin, events);
  const sendReminder = useReminderEmail();
  const [changeLogNewSince, setChangeLogNewSince] = useState<Date | null>(null);
  const [isChangeLogOpen, setIsChangeLogOpen] = useState(false);
  const { markSeen: markChangeLogSeen } = changeLog;
  const openChangeLog = useCallback(() => {
    setChangeLogNewSince(markChangeLogSeen());
    setIsChangeLogOpen(true);
  }, [markChangeLogSeen]);
  const openInbox = useCallback(() => setIsSubmissionsModalOpen(true), []);
  const openExport = useCallback(() => setIsExportModalOpen(true), []);

  const { pendingSubmissions, handleApproveSubmission, handleRejectSubmission, handleApproveAllSubmissions } =
    useSubmissionActions({ isAdmin, events, setEvents, syncAfterChange, showToast });
  // Admins: events in the digest that went out changed since, so it wants updating (in the inbox too)
  const sentDigest = useSentDigest(isAdmin, !loadingEvents && events.length > 0, events, recurrenceExceptions);
  const inboxCount = pendingSubmissions.length + (sentDigest.change ? 1 : 0);
  const { refresh: refreshSentDigest } = sentDigest;
  const closeDigest = useCallback(() => {
    setIsBulletinModalOpen(false);
    // It may have shared or updated the digest
    refreshSentDigest();
  }, [refreshSentDigest]);
  const openDigestFromInbox = useCallback(() => {
    setIsSubmissionsModalOpen(false);
    setIsBulletinModalOpen(true);
  }, []);
  const { handleDeleteInstance, handleDeleteEvent, restoreDeletedEvent, forgetExceptions } = useEventActions({
    user, events, setEvents, recurrenceExceptions, setRecurrenceExceptions, showToast, modal
  });

  const { open: openEvent, close: closeEventModal } = modal;
  const { openWith: openSubmitPageWith, openToEdit: openSubmitPageToEdit, close: closeSubmitPage } = submitPage;
  // The series itself, not the one occurrence that was opened
  const seriesOf = useCallback(
    (event: Event) => (isRecurringEvent(event) ? events.find((e) => e.id === event.id) ?? event : event),
    [events]
  );
  const handleDuplicateEvent = useCallback((event: Event) => {
    closeEventModal();
    openSubmitPageWith(null, seriesOf(event));
  }, [seriesOf, closeEventModal, openSubmitPageWith]);

  // Every change to an event is made in the event form (admins any event, staff their own)
  const handleEditEvent = useCallback((event: Event) => {
    closeEventModal();
    openSubmitPageToEdit(seriesOf(event));
  }, [seriesOf, closeEventModal, openSubmitPageToEdit]);
  // From the inbox, saving publishes the submission (unless the admin sets it back to Draft)
  const handleEditSubmission = useCallback((event: Event) => openSubmitPageToEdit(seriesOf(event), true), [seriesOf, openSubmitPageToEdit]);
  const handleEventSaved = useCallback(({ event, changed, exceptionsCleared }: { event: Event; changed: boolean; exceptionsCleared: boolean }) => {
    const before = events.find((e) => e.id === event.id);
    setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
    // Days deleted earlier were left out of the saved dates
    if (exceptionsCleared && recurrenceExceptions.has(event.id)) forgetExceptions(event.id);
    closeSubmitPage();
    if (!changed) showToast('Nothing was changed', 'info');
    else if (isAdmin) showToast(before?.status === 'draft' && event.status === 'published' ? `"${event.title}" is saved and published` : 'Event updated', 'success');
    else if (event.status === 'published') showToast('Your changes are saved and on the calendar', 'success');
    else showToast('Your changes are saved. The event is still waiting for review', 'success');
  }, [events, setEvents, recurrenceExceptions, forgetExceptions, closeSubmitPage, isAdmin, showToast]);

  useAppShortcuts(user, submitPage.open);
  useDeepLinks({ user, loadingEvents, events, recurrenceExceptions, onOpenEvent: openEvent, onOpenInbox: openInbox, showToast });

  // Filtered events
  const filteredEvents = useMemo(() => {
    return filterEvents(events, { ...filters, search: searchQuery }, user?.role, user?.id, user?.email);
  }, [events, filters, searchQuery, user?.role, user?.id, user?.email]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || filters.category || filters.status || filters.dateRange ||
    filters.location || filters.submitterEmail || filters.creatorId || filters.tags?.length
  );
  // Everything this person can see before search and filters, for "Showing X of Y"
  const unfilteredCount = useMemo(
    () => (hasActiveFilters ? filterEvents(events, {}, user?.role, user?.id, user?.email).length : 0),
    [hasActiveFilters, events, user?.role, user?.id, user?.email]
  );
  // Search and filters that cut across dates (words, place, status, who sent it) show their
  // results as one list over every date; a category or a date filter keeps the calendar, moved to
  // that period. The banner switches between the two.
  const crossDateFilters = Boolean(
    searchQuery.trim() || filters.status || filters.location || filters.submitterEmail || filters.creatorId || filters.tags?.length
  );
  const [listChoice, setListChoice] = useState<boolean | null>(null);
  useEffect(() => {
    if (!hasActiveFilters) setListChoice(null);
  }, [hasActiveFilters]);
  const showResults = hasActiveFilters && (listChoice ?? crossDateFilters);
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilters({});
  }, []);

  // Extract unique values for filters
  const availableLocations = useMemo(() => {
    return Array.from(new Set<string>(events.flatMap(getEventLocations)))
      .sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Who sent events in, by name (the address when no name was given)
  const availableSubmitters = useMemo<Submitter[]>(() => {
    const byEmail = new Map<string, Submitter>();
    events.forEach(e => {
      const email = e.submitterEmail?.trim();
      if (!email || byEmail.has(email.toLowerCase())) return;
      byEmail.set(email.toLowerCase(), { email, name: e.submitterName?.trim() || email });
    });
    return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
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
          editing={submitPage.editing}
          editingExceptions={submitPage.editing ? recurrenceExceptions.get(submitPage.editing.id) : undefined}
          publishOnSave={submitPage.publishOnSave}
          onSaved={handleEventSaved}
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
      {/* Keyboard users: past the top bar, banners, search and categories, straight to the calendar */}
      <a
        href="#calendar"
        onClick={(e) => {
          e.preventDefault();
          const calendar = document.getElementById('calendar');
          calendar?.focus({ preventScroll: true });
          calendar?.scrollIntoView({ block: 'start' });
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded focus:bg-brand-600 focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to calendar
      </a>
      <Navbar
        user={user}
        onLogout={handleLogout}
        onAddEventClick={submitPage.open}
        onOpenSubmitEvent={submitPage.open}
        onExportClick={openExport}
        onRefresh={() => refreshEvents(true)}
        onHomeClick={goHome}
        onOpenMyEvents={isAdmin ? undefined : () => setIsMyEventsOpen(true)}
        hasTabBar={hasTabBar}
        loadingEvents={loadingEvents}
        isRefreshing={isRefreshing}
        pendingSubmissionsCount={inboxCount}
        onOpenSubmissions={openInbox}
        onOpenFortnightlyBulletin={() => setIsBulletinModalOpen(true)}
        onSendReminder={isAdmin ? sendReminder : undefined}
        onOpenStaff={() => setIsStaffOpen(true)}
        onOpenEmailRecipients={() => setIsRecipientsOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenChangeLog={openChangeLog}
        changeLogCount={changeLog.count}
        onChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main className="flex-grow max-w-7xl 2xl:max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5 lg:py-6">
        <h1 className="sr-only">CCP Event Calendar</h1>
        {!isOnline && <OfflineBanner lastSyncedAt={lastSyncedAt} />}
        {isAdmin && pendingSubmissions.length > 0 && (
          <SubmissionsBanner submissions={pendingSubmissions} onOpen={openInbox} />
        )}
        {isAdmin && sentDigest.change && (
          <DigestChangedBanner change={sentDigest.change} onOpen={() => setIsBulletinModalOpen(true)} />
        )}

        {/* Search, categories and Filters: one row from 1024px; below that the categories get their
            own row, and on phones they are picked in Filters */}
        <div className="mb-3 sm:mb-4 flex flex-wrap lg:flex-nowrap items-center gap-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          {!isMobile && (
            <CategoryPills
              className="order-last w-full lg:order-none lg:w-auto"
              selected={filters.category}
              onSelect={(category) => setFilters(prev => ({ ...prev, category }))}
            />
          )}
          <EventFiltersComponent
            filters={filters}
            onFiltersChange={setFilters}
            availableLocations={availableLocations}
            availableSubmitters={availableSubmitters}
            resultCount={filteredEvents.length}
            showCategory={isMobile}
          />
        </div>

        {hasActiveFilters && !loadingEvents && (
          <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3 rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50/60 dark:bg-brand-950/30 px-3 sm:px-4 py-2 text-xs sm:text-sm text-brand-800 dark:text-brand-200" role="status">
            <span className="min-w-0">
              Showing <strong>{filteredEvents.length}</strong> of {unfilteredCount} events
              {searchQuery.trim() && <> matching “{searchQuery.trim()}”</>}
              {filters.category && isMobile && <> in {filters.category}</>}
            </span>
            <span className="shrink-0 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setListChoice(!showResults)}
                className="text-xs font-semibold underline underline-offset-2 hover:no-underline"
              >
                {showResults ? 'Show on calendar' : 'Show as list'}
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold underline underline-offset-2 hover:no-underline"
              >
                Clear all
              </button>
            </span>
          </div>
        )}

        <div id="calendar" tabIndex={-1} className="scroll-mt-20 focus:outline-none">
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
              showResults={showResults}
              todayRequest={todayRequest}
            />
          )}
        </div>
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
            currentUserEmail={user.email}
            onDelete={handleDeleteEvent}
            onDeleteInstance={handleDeleteInstance}
            onDuplicate={isAdmin ? handleDuplicateEvent : undefined}
            onEdit={handleEditEvent}
            recurrenceExceptions={recurrenceExceptions}
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
            allEvents={hasActiveFilters ? events : undefined}
            recurrenceExceptions={recurrenceExceptions}
            onOpenFortnightlyBulletin={() => setIsBulletinModalOpen(true)}
          />
        </Suspense>
      )}

      {isStaffOpen && isAdmin && (
        <Suspense fallback={null}>
          <StaffModal isOpen={isStaffOpen} onClose={() => setIsStaffOpen(false)} currentUserId={user.id} />
        </Suspense>
      )}

      {isRecipientsOpen && isAdmin && (
        <Suspense fallback={null}>
          <EmailRecipientsModal isOpen={isRecipientsOpen} onClose={() => setIsRecipientsOpen(false)} />
        </Suspense>
      )}

      {isStatsOpen && isAdmin && (
        <Suspense fallback={null}>
          <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} events={events} recurrenceExceptions={recurrenceExceptions} />
        </Suspense>
      )}

      {isChangeLogOpen && isAdmin && (
        <Suspense fallback={null}>
          <ChangeLogModal
            isOpen={isChangeLogOpen}
            onClose={() => setIsChangeLogOpen(false)}
            events={events}
            onOpenEvent={openEvent}
            onRestore={(deleted) => restoreDeletedEvent(deleted, { checkFiles: true })}
            newSince={changeLogNewSince}
          />
        </Suspense>
      )}

      {isMyEventsOpen && !isAdmin && (
        <Suspense fallback={null}>
          <MyEventsModal
            isOpen={isMyEventsOpen}
            onClose={() => setIsMyEventsOpen(false)}
            events={events}
            user={user}
            recurrenceExceptions={recurrenceExceptions}
            onOpenEvent={openEvent}
            onSubmitEvent={submitPage.open}
          />
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
            onClose={closeDigest}
            events={events}
            recurrenceExceptions={recurrenceExceptions}
            canShare={isAdmin}
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
            onEdit={handleEditSubmission}
            onReject={handleRejectSubmission}
            onApproveAll={handleApproveAllSubmissions}
            onOpenEvent={openEvent}
            digestChange={sentDigest.change}
            onOpenDigest={openDigestFromInbox}
          />
        </Suspense>
      )}

      <AppFooter isAdmin={isAdmin} clearTabBar={hasTabBar} />

      {hasTabBar && (
        <BottomNavigation
          onHomeClick={goHome}
          onCreateClick={submitPage.open}
          createLabel={isAdmin ? 'New event' : 'Submit'}
          onInboxClick={isAdmin ? openInbox : undefined}
          inboxCount={inboxCount}
          onMyEventsClick={isAdmin ? undefined : () => setIsMyEventsOpen(true)}
          onDigestClick={() => setIsBulletinModalOpen(true)}
          onChangeLogClick={isAdmin ? openChangeLog : undefined}
          changeLogCount={changeLog.count}
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
          {isDigestPage() ? (
            <Suspense fallback={null}>
              <DigestViewPage />
            </Suspense>
          ) : (
            <AppContent />
          )}
          <UpdateBanner />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
