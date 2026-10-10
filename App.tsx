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
import { CalendarDaySkeleton } from './components/SkeletonLoader';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Event, EventFilters, UserRole, EventStatus } from './types';
import { updateEvent, deleteEvent, deleteRecurrenceInstance, saveCustomSchedule, clearRecurrenceExceptions } from './services/eventService';
import { approveSubmissions, declineSubmissions } from './services/submissionService';
import { filterEvents } from './utils/filterEvents';
import { expandRecurringEvents, getEventLocations } from './utils/recurrence';
import { cacheExceptions } from './utils/eventsCache';
import { isSameDay } from './utils/date';
import { materializeCustomSchedule } from './utils/multiDateUtils';
import BottomNavigation from './components/BottomNavigation';
import { useMedia } from './hooks/useMedia';
import { isAnyModalOpen } from './hooks/useModalFocusTrap';
import { useSession } from './hooks/useSession';
import { useEventsSync } from './hooks/useEventsSync';
import { usePullToRefresh } from './hooks/usePullToRefresh';

/** Flags an error as already reported to the user (EventModal won't show it again) */
const markHandled = (e: unknown): Error => {
  const err = e instanceof Error ? e : new Error(String(e));
  (err as Error & { handled?: boolean }).handled = true;
  return err;
};

const isSubmitUrl = (): boolean =>
  window.location.pathname.startsWith('/submit') ||
  new URLSearchParams(window.location.search).get('mode') === 'submit';

const isRecurring = (event?: Event | null): boolean => !!event?.recurrence && event.recurrence.type !== 'none';

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

  // Admins see every draft, so the inbox is simply the drafts, newest first
  const pendingSubmissions = useMemo(
    () => (isAdmin
      ? events.filter((e) => e.status === 'draft').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      : []),
    [events, isAdmin]
  );

  // Mobile State
  const isMobile = useMedia('(max-width: 640px)');
  // Phones and small tablets get the bottom tab bar
  const hasTabBar = useMedia('(max-width: 767px)');
  usePullToRefresh(!!user && isMobile, () => void refreshEvents(true));

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EventFilters>({});

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [modalInitialMode, setModalInitialMode] = useState<'view' | 'edit'>('view');
  const [modalAutoApprove, setModalAutoApprove] = useState(false);
  // Unsaved form data to restore after a failed save
  const [eventDraft, setEventDraft] = useState<Omit<Event, 'id' | 'createdAt'> | null>(null);

  // Clears modal state after the close animation — unless the modal was reopened meanwhile
  // (e.g. a fast save failure reopens the form with the user's draft).
  const isModalOpenRef = React.useRef(false);
  isModalOpenRef.current = isModalOpen;
  const resetModalStateLater = useCallback(() => {
    setTimeout(() => {
      if (isModalOpenRef.current) return;
      setSelectedEvent(null);
      setModalInitialMode('view');
      setModalAutoApprove(false);
      setEventDraft(null);
    }, 200);
  }, []);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSubmissionsModalOpen, setIsSubmissionsModalOpen] = useState(false);
  const [isBulletinModalOpen, setIsBulletinModalOpen] = useState(false);
  const [isStaffOpen, setIsStaffOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSubmitPageOpen, setIsSubmitPageOpen] = useState(() => typeof window !== 'undefined' && isSubmitUrl());
  // Date pre-filled when an admin adds an event from a calendar day
  const [submitInitialDate, setSubmitInitialDate] = useState<Date | null>(null);
  // Event copied into the form ("Duplicate")
  const [submitTemplate, setSubmitTemplate] = useState<Event | null>(null);

  const handleApproveSubmission = useCallback(async (event: Event) => {
    // Optimistic update: instantly mark it published (and so out of the inbox)
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, status: 'published', updatedAt: new Date() } : e)));
    try {
      const [serverEvent] = await approveSubmissions([event.id]);
      showToast(`Event "${event.title}" approved and published!`, 'success');
      if (serverEvent) setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...serverEvent } : e)));
      syncAfterChange();
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
      showToast(err instanceof Error ? err.message : 'Failed to approve event', 'error');
    }
  }, [setEvents, syncAfterChange, showToast]);

  const handleRejectSubmission = useCallback(async (eventId: string, reason: string) => {
    const rejected = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await declineSubmissions([eventId], reason);
      showToast('Submission declined', 'info');
      syncAfterChange();
    } catch (err) {
      if (rejected) setEvents((prev) => (prev.some((e) => e.id === eventId) ? prev : [...prev, rejected]));
      showToast(err instanceof Error ? err.message : 'Failed to decline the submission', 'error');
    }
  }, [events, setEvents, syncAfterChange, showToast]);

  const handleApproveAllSubmissions = useCallback(async () => {
    const subsToApprove = [...pendingSubmissions];
    if (subsToApprove.length === 0) return;
    const ids = new Set(subsToApprove.map((s) => s.id));
    setEvents((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, status: 'published' as EventStatus, updatedAt: new Date() } : e)));
    try {
      await approveSubmissions([...ids]);
      showToast(`All ${subsToApprove.length} events approved and published!`, 'success');
      syncAfterChange();
    } catch (err) {
      const original = new Map(subsToApprove.map((s) => [s.id, s]));
      setEvents((prev) => prev.map((e) => original.get(e.id) ?? e));
      showToast(err instanceof Error ? err.message : 'Failed to approve submissions', 'error');
    }
  }, [pendingSubmissions, setEvents, syncAfterChange, showToast]);

  // Event Handlers - memoized callbacks
  const handleEventClick = useCallback((event: Event) => {
    setEventDraft(null);
    setSelectedEvent(event);
    setModalInitialMode('view');
    setModalAutoApprove(false);
    setIsModalOpen(true);
  }, []);

  // Submit page navigation: keep the URL in sync so the browser Back button works.
  // Admins create events through the same full-screen form (published straight away).
  const openSubmitPageWith = useCallback((initialDate: Date | null, template: Event | null = null) => {
    setSubmitInitialDate(initialDate);
    setSubmitTemplate(template);
    setIsSubmitPageOpen(true);
    if (!isSubmitUrl()) {
      window.history.pushState({}, '', '/?mode=submit');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const openSubmitPage = useCallback(() => openSubmitPageWith(null), [openSubmitPageWith]);
  const openSubmitPageWithDate = useCallback((date: Date | null) => openSubmitPageWith(date), [openSubmitPageWith]);

  const closeSubmitPage = useCallback(() => {
    setIsSubmitPageOpen(false);
    setSubmitInitialDate(null);
    setSubmitTemplate(null);
    if (isSubmitUrl()) {
      window.history.pushState({}, '', '/');
    }
  }, []);

  const handleDuplicateEvent = useCallback((event: Event) => {
    // The series itself, not the one occurrence that was opened
    const source = isRecurring(event) ? events.find((e) => e.id === event.id) ?? event : event;
    setIsModalOpen(false);
    resetModalStateLater();
    openSubmitPageWith(null, source);
  }, [events, resetModalStateLater, openSubmitPageWith]);

  const handleUpdateEvent = useCallback(async (id: string, eventData: Omit<Event, 'id' | 'createdAt'>) => {
    if (!user) return;

    const originalEvent = events.find(e => e.id === id) || (selectedEvent?.id === id ? selectedEvent : null);
    if (!originalEvent) {
      throw new Error('Event not found');
    }

    const isDraftBeingPublished = (originalEvent.status === 'draft' || modalAutoApprove) && eventData.status === 'published';

    // Optimistic update: update event immediately
    const optimisticEvent: Event = {
      ...originalEvent,
      ...eventData,
      id: id,
      creatorId: originalEvent.creatorId,
      createdAt: originalEvent.createdAt
    };
    setEvents((prev) => (prev.some(e => e.id === id) ? prev.map((e) => (e.id === id ? optimisticEvent : e)) : [...prev, optimisticEvent]));
    setSelectedEvent(prev => prev?.id === id ? optimisticEvent : prev);

    // Close modal immediately for better UX
    setIsModalOpen(false);
    resetModalStateLater();

    // Sync with server in background
    try {
      const serverEvent = await updateEvent(id, eventData, user.id, user.fullName);
      // Hand-picked dates: the form already left out deleted days, so the saved list is complete
      if (originalEvent.recurrence?.type === 'custom' && recurrenceExceptions.get(id)?.length) {
        await clearRecurrenceExceptions(id);
        setRecurrenceExceptions((prev: Map<string, Date[]>) => {
          const next = new Map(prev);
          next.delete(id);
          cacheExceptions(next);
          return next;
        });
      }
      setEvents((prev) => (prev.some(e => e.id === id) ? prev.map((e) => (e.id === id ? serverEvent : e)) : [...prev, serverEvent]));
      syncAfterChange();

      if (isDraftBeingPublished) {
        // Tells the submitter it's on the calendar (the event itself is already saved)
        approveSubmissions([id]).catch((err) => console.error('Approval email not sent:', err));
        showToast(`Event "${serverEvent.title}" updated and approved!`, 'success');
      } else {
        showToast('Event updated successfully', 'success');
      }
    } catch (e) {
      console.error("Error updating event", e);
      // Rollback optimistic update on error
      setEvents((prev) => prev.map((ev) => (ev.id === id ? originalEvent : ev)));
      setSelectedEvent(prev => prev?.id === id ? originalEvent : prev);
      showToast('Failed to update event — your changes have been kept, please try again', 'error');
      // Reopen the form with the unsaved changes
      setEventDraft(eventData);
      setSelectedEvent(originalEvent);
      setModalInitialMode('edit');
      setModalAutoApprove(modalAutoApprove);
      setIsModalOpen(true);
      throw markHandled(e);
    }
  }, [user, showToast, events, setEvents, selectedEvent, modalAutoApprove, resetModalStateLater, syncAfterChange, recurrenceExceptions, setRecurrenceExceptions]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    resetModalStateLater();
  }, [resetModalStateLater]);

  const handleDeleteInstance = useCallback(async (eventId: string, instanceDate: Date) => {
    if (!user) return;

    // Hand-picked dates: take the day out of the event itself, so editing shows the real list
    // and the day can be picked again later
    const master = events.find(e => e.id === eventId);
    if (master?.recurrence?.type === 'custom') {
      const schedule = materializeCustomSchedule(master, recurrenceExceptions.get(eventId), instanceDate);
      const previousExceptions = recurrenceExceptions.get(eventId);
      const updated: Event | null = schedule ? { ...master, ...schedule, recurrence: schedule.recurrence } : null;

      setEvents(prev => updated ? prev.map(e => (e.id === eventId ? updated : e)) : prev.filter(e => e.id !== eventId));
      setRecurrenceExceptions((prev: Map<string, Date[]>) => {
        const next = new Map(prev);
        next.delete(eventId);
        cacheExceptions(next);
        return next;
      });

      try {
        if (schedule) {
          await saveCustomSchedule(eventId, schedule, user.id, user.fullName, instanceDate);
          showToast('Removed from the event', 'success');
        } else {
          await deleteEvent(eventId);
          showToast('That was the last date, so the event was deleted', 'success');
        }
      } catch (error) {
        console.error('Error removing date', error);
        setEvents(prev => (prev.some(e => e.id === eventId) ? prev.map(e => (e.id === eventId ? master : e)) : [...prev, master]));
        if (previousExceptions) {
          setRecurrenceExceptions((prev: Map<string, Date[]>) => {
            const next = new Map(prev);
            next.set(eventId, previousExceptions);
            cacheExceptions(next);
            return next;
          });
        }
        showToast('Failed to remove this date', 'error');
      }
      return;
    }

    // Обновляем исключения (Optimistic)
    const normalizedDate = new Date(instanceDate);
    normalizedDate.setHours(0, 0, 0, 0);

    setRecurrenceExceptions((prev: Map<string, Date[]>) => {
      const next = new Map(prev);
      const exceptions = next.get(eventId) || [];

      // Добавляем исключение, если его еще нет
      if (!exceptions.some((d) => isSameDay(d, normalizedDate))) {
        next.set(eventId, [...exceptions, normalizedDate]);
      }
      cacheExceptions(next);
      return next;
    });

    // Sync with server
    try {
      await deleteRecurrenceInstance(eventId, instanceDate, user.id, user.fullName);
      showToast('Event instance deleted', 'success');
    } catch (error) {
      console.error("Error deleting instance", error);
      showToast("Failed to delete instance", "error");

      // Rollback (remove the added exception)
      setRecurrenceExceptions((prev: Map<string, Date[]>) => {
        const next = new Map(prev);
        const exceptions = next.get(eventId) || [];
        next.set(eventId, exceptions.filter((d) => !isSameDay(d, normalizedDate)));
        cacheExceptions(next);
        return next;
      });
    }
  }, [user, showToast, events, setEvents, recurrenceExceptions, setRecurrenceExceptions]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    if (!user) return;

    const eventToDelete = events.find(e => e.id === id);
    if (!eventToDelete) {
      showToast('Event not found', 'error');
      return;
    }

    // Optimistic update: remove event immediately
    setEvents((prev) => prev.filter(e => e.id !== id));

    // Close modal if it's open for this event
    if (selectedEvent?.id === id) {
      setIsModalOpen(false);
      resetModalStateLater();
    }

    try {
      await deleteEvent(id);
      showToast('Event deleted successfully', 'success');
      if (isRecurring(eventToDelete)) {
        setRecurrenceExceptions((prev: Map<string, Date[]>) => {
          const next = new Map<string, Date[]>(prev);
          next.delete(id);
          cacheExceptions(next);
          return next;
        });
      }
    } catch (e) {
      console.error("Error deleting event", e);
      setEvents((prev) => [...prev, eventToDelete]);
      showToast('Failed to delete event', 'error');
    }
  }, [user, events, setEvents, selectedEvent, resetModalStateLater, setRecurrenceExceptions, showToast]);

  const handleExportClick = useCallback(() => {
    setIsExportModalOpen(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Escape inside modals is handled by useModalFocusTrap (one modal at a time)
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) {
        if (e.key === 'Escape' && !isAnyModalOpen()) {
          target.blur();
        }
        return;
      }
      if (isAnyModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
      } else if (e.key === 'c' || e.key === 'C') {
        if (user.role === UserRole.ADMIN) {
          e.preventDefault();
          openSubmitPage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, openSubmitPage]);

  // Shareable links: /?event=<id>&at=<occurrence timestamp>
  const getEventShareLink = useCallback((event: Event) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('event', event.id);
    if (isRecurring(event)) {
      url.searchParams.set('at', String(event.date.getTime()));
    }
    return url.toString();
  }, []);

  // Links into the app: /?event=<id>&at=<time> opens an event; /?inbox (from the "new submission"
  // email) opens the submissions inbox. Handled once events are loaded.
  const deepLinkHandledRef = React.useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || !user || loadingEvents) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    const wantsInbox = params.has('inbox');
    if (!eventId && !wantsInbox) {
      deepLinkHandledRef.current = true;
      return;
    }
    if (eventId && events.length === 0) return;
    deepLinkHandledRef.current = true;

    const at = Number(params.get('at'));
    params.delete('event');
    params.delete('at');
    params.delete('inbox');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

    if (wantsInbox) {
      if (user.role === UserRole.ADMIN) setIsSubmissionsModalOpen(true);
      return;
    }

    const master = events.find(e => e.id === eventId);
    let target: Event | undefined = master;
    if (master && at && isRecurring(master)) {
      const day = new Date(at);
      const instances = expandRecurringEvents(
        [master],
        new Date(day.getFullYear(), day.getMonth(), day.getDate()),
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999),
        recurrenceExceptions
      );
      target = instances.find(i => i.date.getTime() === at) ?? instances[0] ?? master;
    }

    if (target) {
      handleEventClick(target);
    } else {
      showToast('That event could not be found — it may have been removed.', 'warning');
    }
  }, [user, loadingEvents, events, recurrenceExceptions, handleEventClick, showToast]);

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

  useEffect(() => {
    const handlePopState = () => setIsSubmitPageOpen(isSubmitUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Coming back from the submit page: pick up whatever was just submitted
  const wasSubmitPageOpenRef = React.useRef(isSubmitPageOpen);
  useEffect(() => {
    if (wasSubmitPageOpenRef.current && !isSubmitPageOpen && user) {
      void refreshEvents(true);
    }
    wasSubmitPageOpenRef.current = isSubmitPageOpen;
  }, [isSubmitPageOpen, user, refreshEvents]);

  if (isSubmitPageOpen) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-[100dvh]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>}>
        <SubmitEventPage
          currentUser={user}
          events={events}
          initialDate={submitInitialDate}
          template={submitTemplate}
          onBackToLogin={closeSubmitPage}
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
        onOpenSubmitEvent={openSubmitPage}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900 flex flex-col font-sans">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onAddEventClick={openSubmitPage}
        onOpenSubmitEvent={openSubmitPage}
        onExportClick={handleExportClick}
        onRefresh={() => refreshEvents(true)}
        loadingEvents={loadingEvents}
        isRefreshing={isRefreshing}
        pendingSubmissionsCount={pendingSubmissions.length}
        onOpenSubmissions={() => setIsSubmissionsModalOpen(true)}
        onOpenFortnightlyBulletin={() => setIsBulletinModalOpen(true)}
        onOpenStaff={() => setIsStaffOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onChangePassword={() => setIsChangePasswordOpen(true)}
      />

      <main className="flex-grow max-w-7xl 2xl:max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {isAdmin && pendingSubmissions.length > 0 && (
          <SubmissionsBanner submissions={pendingSubmissions} onOpen={() => setIsSubmissionsModalOpen(true)} />
        )}

        {/* Search and Filters Bar */}
        <div className="mb-3 sm:mb-4 flex gap-2 sm:gap-3 items-center">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <EventFiltersComponent
            filters={filters}
            onFiltersChange={setFilters}
            availableLocations={availableLocations}
            availableSubmitterEmails={availableSubmitterEmails}
          />
        </div>

        <CategoryPills selected={filters.category} onSelect={(category) => setFilters(prev => ({ ...prev, category }))} />

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
            onEventClick={handleEventClick}
            onAddEventForDate={isAdmin ? openSubmitPageWithDate : undefined}
            recurrenceExceptions={recurrenceExceptions}
            userRole={user.role}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            dateRange={filters.dateRange}
            location={filters.location}
          />
        )}
      </main>

      {isModalOpen && (
        <Suspense fallback={null}>
          <EventModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            event={selectedEvent}
            events={events}
            role={user.role}
            currentUserId={user.id}
            onUpdate={handleUpdateEvent}
            onDelete={handleDeleteEvent}
            onDeleteInstance={handleDeleteInstance}
            onDuplicate={isAdmin ? handleDuplicateEvent : undefined}
            recurrenceExceptions={recurrenceExceptions}
            initialMode={modalInitialMode}
            autoApproveOnSave={modalAutoApprove}
            draft={eventDraft}
            getShareLink={getEventShareLink}
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
            onEdit={(ev) => {
              setEventDraft(null);
              setSelectedEvent(ev);
              setModalInitialMode('edit');
              setModalAutoApprove(true);
              setIsModalOpen(true);
            }}
            onReject={handleRejectSubmission}
            onApproveAll={handleApproveAllSubmissions}
            onOpenEvent={handleEventClick}
          />
        </Suspense>
      )}

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto py-6 pb-28 md:pb-6">
        <div className="max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 text-center text-slate-500 dark:text-slate-400 text-sm">
          <span className="text-xs font-bold uppercase tracking-[0.14em]">&copy; {new Date().getFullYear()} Cork City Partnership · Internal use only</span>
          <p className="hidden lg:block mt-2 text-xs text-slate-400 dark:text-slate-500">
            Keyboard: <kbd className="font-sans font-semibold">/</kbd> search · <kbd className="font-sans font-semibold">←</kbd> <kbd className="font-sans font-semibold">→</kbd> previous / next · <kbd className="font-sans font-semibold">T</kbd> today
            {isAdmin && <> · <kbd className="font-sans font-semibold">C</kbd> new event · <kbd className="font-sans font-semibold">E</kbd> edit open event</>}
            {' '}· <kbd className="font-sans font-semibold">Esc</kbd> close
          </p>
        </div>
      </footer>

      {hasTabBar && (
        <BottomNavigation
          onHomeClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onCreateClick={openSubmitPage}
          createLabel={isAdmin ? 'New event' : 'Submit'}
          onInboxClick={isAdmin ? () => setIsSubmissionsModalOpen(true) : undefined}
          inboxCount={pendingSubmissions.length}
          onSearchClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.getElementById(SEARCH_INPUT_ID)?.focus();
          }}
          onDigestClick={() => setIsBulletinModalOpen(true)}
          onExportClick={handleExportClick}
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
