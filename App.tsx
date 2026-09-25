import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import Navbar from './components/Navbar';
import CalendarView from './components/CalendarView';
import LoginPage from './pages/LoginPage';
import SearchBar, { SEARCH_INPUT_ID } from './components/SearchBar';
import EventFiltersComponent from './components/EventFilters';
import ErrorBoundary from './components/ErrorBoundary';
import { CalendarDaySkeleton } from './components/SkeletonLoader';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { User, Event, EventFilters, UserRole, EventStatus } from './types';
import { getEvents, updateEvent, deleteEvent, deleteRecurrenceInstance, getRecurrenceExceptionsBatch, getPendingSubmissions, approveSubmission, rejectSubmission } from './services/eventService';
import { logout as logoutService, getCurrentUser } from './services/authService';
import { checkTomorrowRSVPEvents } from './services/notificationService';
import { supabase } from './lib/supabase';
import { filterEvents } from './utils/filterEvents';
import { expandRecurringEvents } from './utils/recurrence';
import { getCachedUser, cacheUser, clearUserCache } from './utils/sessionCache';
import { getCachedEvents, cacheEvents, clearEventsCache, getCachedExceptions, cacheExceptions } from './utils/eventsCache';
import { isSameDay } from './utils/date';
import BottomNavigation from './components/BottomNavigation';
import { useMedia } from './hooks/useMedia';
import { isAnyModalOpen } from './hooks/useModalFocusTrap';
import { EVENT_CATEGORIES } from './constants/categories';
import { getCategoryDotColor } from './components/WeekView';
import { Inbox, ArrowRight } from 'lucide-react';

/** Flags an error as already reported to the user (EventModal won't show it again) */
const markHandled = (e: unknown): Error => {
  const err = e instanceof Error ? e : new Error(String(e));
  (err as Error & { handled?: boolean }).handled = true;
  return err;
};

const isSubmitUrl = (): boolean =>
  window.location.pathname.startsWith('/submit') ||
  new URLSearchParams(window.location.search).get('mode') === 'submit';

// Lazy load modals for code splitting
const EventModal = lazy(() => import('./components/EventModal'));
const ExportModal = lazy(() => import('./components/ExportModal'));
const SubmissionsModal = lazy(() => import('./components/SubmissionsModal'));
const FortnightlyBulletinModal = lazy(() => import('./components/FortnightlyBulletinModal'));
const SubmitEventPage = lazy(() => import('./pages/SubmitEventPage'));

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  // Global State
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  const [recurrenceExceptions, setRecurrenceExceptions] = useState<Map<string, Date[]>>(new Map());

  // Mobile State
  const isMobile = useMedia('(max-width: 640px)');
  // Phones and small tablets get the bottom tab bar
  const hasTabBar = useMedia('(max-width: 767px)');

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
  const [pendingSubmissions, setPendingSubmissions] = useState<Event[]>([]);
  const [isSubmitPageOpen, setIsSubmitPageOpen] = useState(() => typeof window !== 'undefined' && isSubmitUrl());
  // Date pre-filled when an admin adds an event from a calendar day
  const [submitInitialDate, setSubmitInitialDate] = useState<Date | null>(null);

  // Session restoration - мгновенное восстановление из кэша
  const userIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Функция для загрузки профиля пользователя с сервера
    const fetchUserProfileFromServer = async (uid: string): Promise<User | null> => {
      try {
        const currentUser = await getCurrentUser(uid);
        if (currentUser && isMounted) {
          userIdRef.current = currentUser.id;
          setUser(currentUser);
          return currentUser;
        }
        return null;
      } catch (error) {
        console.error('Error fetching user profile from server:', error);
        return null;
      }
    };

    // Функция для синхронного восстановления сессии
    const restoreSessionSync = (): void => {
      // Шаг 1: Пытаемся восстановить пользователя из кэша (синхронно, мгновенно)
      const cachedUser = getCachedUser();
      if (cachedUser) {
        // Пользователь найден в кэше - восстанавливаем мгновенно
        userIdRef.current = cachedUser.id;
        setUser(cachedUser);
        setIsSessionLoading(false);

        // В фоне проверяем и обновляем данные пользователя с сервера
        supabase.auth.getSession().then(({ data: { session }, error }) => {
          if (!isMounted || error || !session) {
            // Сессия невалидна - очищаем кэш и состояние
            if (isMounted) {
              clearUserCache();
              setUser(null);
            }
            return;
          }

          // Обновляем данные пользователя в фоне (не блокируем UI)
          fetchUserProfileFromServer(session.user.id).then((freshUser) => {
            if (freshUser && isMounted) {
              if (import.meta.env.DEV) console.log('User data refreshed from server:', freshUser.email);
            }
          });
        });
        return;
      }

      // Шаг 2: Кэша нет - проверяем сессию через Supabase (асинхронно)
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;

        if (session && !error) {
          // Сессия есть - загружаем пользователя с сервера
          fetchUserProfileFromServer(session.user.id).finally(() => {
            if (isMounted) setIsSessionLoading(false);
          });
        } else {
          if (isMounted) setIsSessionLoading(false);
        }
      });
    };

    // Запускаем синхронное восстановление сессии
    restoreSessionSync();

    // Подписываемся на изменения auth state для будущих обновлений
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Пользователь вошел или токен обновлен
        if (session) {
          await fetchUserProfileFromServer(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        // Пользователь вышел
        userIdRef.current = null;
        setUser(null);
        setEvents([]);
        setPendingSubmissions([]);
        clearUserCache();
        clearEventsCache();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);



const toTime = (d: any): number => {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  if (d instanceof Date) return isNaN(d.getTime()) ? 0 : d.getTime();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const areEventsEqual = (a: Event[], b: Event[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const bMap = new Map<string, Event>();
  for (const eb of b) {
    bMap.set(eb.id, eb);
  }
  for (const ea of a) {
    const eb = bMap.get(ea.id);
    if (!eb) return false;
    if (
      ea.status !== eb.status ||
      ea.title !== eb.title ||
      toTime(ea.date) !== toTime(eb.date) ||
      toTime(ea.endDate) !== toTime(eb.endDate) ||
      ea.location !== eb.location ||
      ea.category !== eb.category ||
      ea.description !== eb.description ||
      ea.posterUrl !== eb.posterUrl ||
      ea.submitterName !== eb.submitterName ||
      ea.submitterEmail !== eb.submitterEmail ||
      toTime(ea.updatedAt) !== toTime(eb.updatedAt) ||
      (ea.tags?.join(',') || '') !== (eb.tags?.join(',') || '') ||
      (ea.attendees?.length || 0) !== (eb.attendees?.length || 0)
    ) {
      return false;
    }
  }
  return true;
};

  // Refresh Events Handler — при обновлении показываем кеш + крутим логотип, скелетоны только при первой загрузке без кеша
  const refreshEvents = useCallback(async (isManual = false) => {
    if (!user) return;

    setIsRefreshing(true);

    try {
      const data = await getEvents();
      // If manual refresh requested, always update state.
      // Otherwise, update if any event data actually changed.
      setEvents((prev) => (isManual || !areEventsEqual(prev, data) ? data : prev));
      // Also refreshes the cache timestamp when nothing changed
      cacheEvents(data);

      // Load recurrence exceptions for recurring events in one batch
      const recurringEventIds = data
        .filter(e => e.recurrence && e.recurrence.type !== 'none')
        .map(e => e.id);

      if (recurringEventIds.length > 0) {
        try {
          const exceptionsMap = await getRecurrenceExceptionsBatch(recurringEventIds);
          setRecurrenceExceptions(exceptionsMap);
          cacheExceptions(exceptionsMap);
        } catch (err) {
          console.error('Error loading batch exceptions:', err);
        }
      }

    } catch (error) {
      console.error('Error loading events:', error);
      if (isManual) {
        showToast('Failed to refresh events', 'error');
      } else {
        const cached = getCachedEvents();
        if (!cached || cached.length === 0) {
          showToast('Failed to load events', 'error');
        }
      }
    } finally {
      setLoadingEvents(false);
      setIsRefreshing(false);
    }
  }, [user, showToast]);

  // Initial Load of Events
  useEffect(() => {
    if (!user) return;

    // Check for tomorrow's events and notify
    checkTomorrowRSVPEvents(user.id).catch(console.error);

    const cached = getCachedEvents();

    if (cached && cached.length > 0) {
      setEvents(cached);
      setLoadingEvents(false);

      // Load cached exceptions immediately
      const cachedExceptions = getCachedExceptions();
      if (cachedExceptions) {
        setRecurrenceExceptions(cachedExceptions);
      }
    } else {
      setLoadingEvents(true);
    }

    // Background sync using requestIdleCallback for non-blocking updates
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => refreshEvents(false), { timeout: 2000 });
    } else {
      setTimeout(() => refreshEvents(false), 100);
    }
  }, [user, refreshEvents]);

  // Keep the local cache in step with every optimistic change
  useEffect(() => {
    if (user) cacheEvents(events);
  }, [user, events]);

  // Pull-to-refresh on mobile when at top of page
  const pullStartYRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (!user || !isMobile) return;
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 10 && !isAnyModalOpen()) {
        pullStartYRef.current = e.touches[0].clientY;
      } else {
        pullStartYRef.current = null;
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const startY = pullStartYRef.current;
      pullStartYRef.current = null;
      if (startY == null || window.scrollY > 10) return;
      const endY = e.changedTouches[0].clientY;
      if (endY - startY > 70) {
        refreshEvents(true);
      }
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [user, isMobile, refreshEvents]);

  // Auth Handlers - memoized callbacks
  const handleLogin = useCallback((loggedInUser: User) => {
    // Кэшируем пользователя при логине
    cacheUser(loggedInUser);
    setUser(loggedInUser);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutService();
    clearUserCache();
    clearEventsCache();
    setUser(null);
    setEvents([]);
    setPendingSubmissions([]);
  }, []);

  // Submissions handlers for Admins
  const refreshSubmissions = useCallback(async () => {
    if (user?.role === UserRole.ADMIN) {
      try {
        const subs = await getPendingSubmissions();
        setPendingSubmissions((prev) => {
          const prevIds = prev.map(e => e.id).sort().join(',');
          const newIds = subs.map(e => e.id).sort().join(',');
          if (prevIds !== newIds) return subs;
          const prevTimes = prev.map(e => toTime(e.updatedAt)).join(',');
          const newTimes = subs.map(e => toTime(e.updatedAt)).join(',');
          if (prevTimes !== newTimes) return subs;
          return prev;
        });
      } catch (err) {
        console.error('Error fetching submissions:', err);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === UserRole.ADMIN) {
      refreshSubmissions();
    }
  }, [user, refreshSubmissions]);

  // Realtime subscription for live updates of events & submissions
  useEffect(() => {
    if (!user) return;
    if (import.meta.env.VITE_SUPABASE_REALTIME === 'false') return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('events-realtime-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events' },
          (payload) => {
            if (import.meta.env.DEV) {
              console.log('[Realtime] Events table change:', payload.eventType, payload);
            }

            if (user.role === UserRole.ADMIN) {
              refreshSubmissions();
              if (payload.eventType === 'INSERT') {
                const newRow = payload.new as any;
                if (newRow && (newRow.status === 'draft' || !newRow.status)) {
                  showToast(`New submission received: "${newRow.title || 'Untitled Event'}"`, 'info');
                }
              }
            }

            refreshEvents(true);
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && import.meta.env.DEV) {
            console.warn('[Realtime] Subscription error; set VITE_SUPABASE_REALTIME=false to poll instead.');
          }
        });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[Realtime] Could not subscribe to channel:', err);
      }
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, refreshSubmissions, refreshEvents, showToast]);

  // Fallback sync on tab focus / visibility; a 30s poll only when realtime is switched off
  useEffect(() => {
    if (!user) return;

    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        if (user.role === UserRole.ADMIN) {
          refreshSubmissions();
        }
        refreshEvents(false);
      }
    };

    window.addEventListener('focus', handleSyncOnVisible);
    document.addEventListener('visibilitychange', handleSyncOnVisible);
    const poll = import.meta.env.VITE_SUPABASE_REALTIME === 'false' ? setInterval(handleSyncOnVisible, 30 * 1000) : undefined;

    return () => {
      window.removeEventListener('focus', handleSyncOnVisible);
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
      clearInterval(poll);
    };
  }, [user, refreshSubmissions, refreshEvents]);

  const handleApproveSubmission = useCallback(async (event: Event) => {
    // Optimistic update: instantly remove from inbox & mark published in events
    setPendingSubmissions((prev) => prev.filter((e) => e.id !== event.id));
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === event.id);
      const updatedEvent: Event = { ...event, status: 'published', updatedAt: new Date() };
      const next = exists
        ? prev.map((e) => (e.id === event.id ? updatedEvent : e))
        : [...prev, updatedEvent];
      return next;
    });

    try {
      const serverEvent = await approveSubmission(event.id);
      showToast(`Event "${event.title}" approved and published!`, 'success');
      setEvents((prev) => prev.map((e) => (e.id === event.id ? serverEvent : e)));
      refreshSubmissions();
      refreshEvents(true);
    } catch (err: any) {
      // Rollback on failure
      setPendingSubmissions((prev) => [event, ...prev]);
      setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
      showToast(err?.message || 'Failed to approve event', 'error');
    }
  }, [refreshSubmissions, refreshEvents, showToast]);

  const handleRejectSubmission = useCallback(async (eventId: string) => {
    const rejectedSub = pendingSubmissions.find((e) => e.id === eventId);
    // Optimistic update: remove from submissions inbox and events list
    setPendingSubmissions((prev) => prev.filter((e) => e.id !== eventId));
    setEvents((prev) => prev.filter((e) => e.id !== eventId));

    try {
      await rejectSubmission(eventId);
      showToast('Submission removed', 'info');
      refreshSubmissions();
      refreshEvents(true);
    } catch (err: any) {
      // Rollback on failure
      if (rejectedSub) {
        setPendingSubmissions((prev) => [rejectedSub, ...prev]);
        setEvents((prev) => [...prev, rejectedSub]);
      }
      showToast(err?.message || 'Failed to reject event', 'error');
    }
  }, [pendingSubmissions, refreshSubmissions, refreshEvents, showToast]);

  const handleApproveAllSubmissions = useCallback(async () => {
    const subsToApprove = [...pendingSubmissions];
    if (subsToApprove.length === 0) return;

    // Optimistic update: clear inbox and publish all events immediately
    setPendingSubmissions([]);
    setEvents((prev) => {
      const subMap = new Map(subsToApprove.map((s) => [s.id, s]));
      const next = prev.map((e) => {
        if (subMap.has(e.id)) {
          return { ...e, status: 'published' as EventStatus, updatedAt: new Date() };
        }
        return e;
      });
      for (const sub of subsToApprove) {
        if (!next.some((e) => e.id === sub.id)) {
          next.push({ ...sub, status: 'published' as EventStatus, updatedAt: new Date() });
        }
      }
      return next;
    });

    const results = await Promise.allSettled(subsToApprove.map((sub) => approveSubmission(sub.id)));
    const failed = subsToApprove.filter((_, i) => results[i].status === 'rejected');
    const approvedCount = subsToApprove.length - failed.length;

    if (failed.length === 0) {
      showToast(`All ${approvedCount} events approved and published!`, 'success');
    } else {
      // Roll back only the submissions that actually failed
      setPendingSubmissions((prev) => [...failed, ...prev.filter((p) => !failed.some((f) => f.id === p.id))]);
      showToast(
        approvedCount > 0
          ? `${approvedCount} approved, ${failed.length} failed — they are back in the inbox`
          : 'Failed to approve submissions',
        'error'
      );
    }
    refreshSubmissions();
    refreshEvents(true);
  }, [pendingSubmissions, refreshSubmissions, refreshEvents, showToast]);

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
  const openSubmitPageWithDate = useCallback((initialDate: Date | null) => {
    setSubmitInitialDate(initialDate);
    setIsSubmitPageOpen(true);
    if (!isSubmitUrl()) {
      window.history.pushState({}, '', '/?mode=submit');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const openSubmitPage = useCallback(() => openSubmitPageWithDate(null), [openSubmitPageWithDate]);

  const closeSubmitPage = useCallback(() => {
    setIsSubmitPageOpen(false);
    setSubmitInitialDate(null);
    if (isSubmitUrl()) {
      window.history.pushState({}, '', '/');
    }
  }, []);

  const handleUpdateEvent = useCallback(async (id: string, eventData: Omit<Event, 'id' | 'createdAt'>) => {
    if (!user) return;

    // Find original event for rollback (check events, pendingSubmissions, or selectedEvent)
    const originalEvent = events.find(e => e.id === id) || pendingSubmissions.find(e => e.id === id) || (selectedEvent?.id === id ? selectedEvent : null);
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

    // Update UI immediately
    setEvents((prev) => {
      const exists = prev.some(e => e.id === id);
      const next = exists ? prev.map((e) => (e.id === id ? optimisticEvent : e)) : [...prev, optimisticEvent];
      return next;
    });
    setSelectedEvent(prev => prev?.id === id ? optimisticEvent : prev);

    if (isDraftBeingPublished) {
      setPendingSubmissions(prev => prev.filter(e => e.id !== id));
    }

    // Close modal immediately for better UX
    setIsModalOpen(false);
    resetModalStateLater();

    // Sync with server in background
    try {
      const serverEvent = await updateEvent(id, eventData, user.id, user.fullName);
      // Replace optimistic event with server response
      setEvents((prev) => {
        const exists = prev.some(e => e.id === id);
        const next = exists ? prev.map((e) => (e.id === id ? serverEvent : e)) : [...prev, serverEvent];
        return next;
      });

      if (user.role === UserRole.ADMIN && isDraftBeingPublished) {
        refreshSubmissions();
      }
      refreshEvents(true);

      if (isDraftBeingPublished) {
        showToast(`Event "${serverEvent.title}" updated and approved!`, 'success');
      } else {
        showToast('Event updated successfully', 'success');
      }
    } catch (e) {
      console.error("Error updating event", e);
      // Rollback optimistic update on error
      setEvents((prev) => prev.map((e) => (e.id === id ? originalEvent : e)));
      if (isDraftBeingPublished) {
        setPendingSubmissions(prev => {
          if (prev.some(e => e.id === id)) return prev;
          return [originalEvent, ...prev];
        });
      }
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
  }, [user, showToast, events, pendingSubmissions, selectedEvent, modalAutoApprove, refreshSubmissions, refreshEvents]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    resetModalStateLater();
  }, [resetModalStateLater]);

  const handleEventUpdate = useCallback((updatedEvent: Event) => {
    const isRecurring = !!updatedEvent.recurrence && updatedEvent.recurrence.type !== 'none';
    // Attendees/comments are per occurrence. For a recurring series, `updatedEvent` is one
    // expanded instance (its own date), so it must never replace the series itself.
    if (!isRecurring) {
      setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id
        ? { ...e, attendees: updatedEvent.attendees, attendeeNames: updatedEvent.attendeeNames, comments: updatedEvent.comments }
        : e)));
    }
    setSelectedEvent(prev => (prev && (prev.instanceKey ?? prev.id) === (updatedEvent.instanceKey ?? updatedEvent.id)) ? updatedEvent : prev);
  }, []);

  const handleDeleteInstance = useCallback(async (eventId: string, instanceDate: Date) => {
    if (!user) return;

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

  }, [user, showToast]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    if (!user) return;

    // Find the event to determine if it's recurring
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

    // Sync with server in background
    try {
      await deleteEvent(id, user.id, user.fullName);
      showToast('Event deleted successfully', 'success');

      // Reload exceptions if it was a recurring event
      if (eventToDelete.recurrence && eventToDelete.recurrence.type !== 'none') {
        setRecurrenceExceptions((prev: Map<string, Date[]>) => {
          const next = new Map<string, Date[]>(prev);
          next.delete(id);
          cacheExceptions(next);
          return next;
        });
      }
    } catch (e) {
      console.error("Error deleting event", e);
      // Rollback optimistic update on error
      setEvents((prev) => [...prev, eventToDelete]);
      showToast('Failed to delete event', 'error');
    }
  }, [user, events, selectedEvent, showToast]);

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
    if (event.recurrence && event.recurrence.type !== 'none') {
      url.searchParams.set('at', String(event.date.getTime()));
    }
    return url.toString();
  }, []);

  // Open an event from a shared link once events are loaded
  const deepLinkHandledRef = React.useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || !user || loadingEvents || events.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    if (!eventId) {
      deepLinkHandledRef.current = true;
      return;
    }
    deepLinkHandledRef.current = true;

    const master = events.find(e => e.id === eventId);
    const at = Number(params.get('at'));
    let target: Event | undefined = master;
    if (master && at && master.recurrence && master.recurrence.type !== 'none') {
      const day = new Date(at);
      const instances = expandRecurringEvents(
        [master],
        new Date(day.getFullYear(), day.getMonth(), day.getDate()),
        new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999),
        recurrenceExceptions
      );
      target = instances.find(i => i.date.getTime() === at) ?? instances[0] ?? master;
    }

    params.delete('event');
    params.delete('at');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);

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
    return Array.from(new Set<string>(events.map(e => e.location?.trim()).filter((l): l is string => !!l)))
      .sort((a, b) => a.localeCompare(b));
  }, [events]);

  // Extract unique submitter emails for filters
  const availableSubmitterEmails = useMemo(() => {
    const emails = new Set<string>();
    events.forEach(e => {
      if (e.submitterEmail && typeof e.submitterEmail === 'string' && e.submitterEmail.trim()) {
        emails.add(e.submitterEmail.trim());
      }
      e.tags?.forEach(tag => {
        if (tag.toLowerCase().startsWith('email:')) {
          const email = tag.slice(6).trim();
          if (email) emails.add(email);
        }
      });
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
      refreshEvents(true);
      if (user.role === UserRole.ADMIN) {
        refreshSubmissions();
      }
    }
    wasSubmitPageOpenRef.current = isSubmitPageOpen;
  }, [isSubmitPageOpen, user, refreshEvents, refreshSubmissions]);

  if (isSubmitPageOpen) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>}>
        <SubmitEventPage
          currentUser={user}
          events={events}
          initialDate={submitInitialDate}
          onBackToLogin={closeSubmitPage}
        />
      </Suspense>
    );
  }

  if (isSessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 gap-4">
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans">
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
      />

      <main className="flex-grow max-w-7xl 2xl:max-w-[96rem] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Admin: submissions waiting for review */}
        {user.role === UserRole.ADMIN && pendingSubmissions.length > 0 && (
          <button
            type="button"
            onClick={() => setIsSubmissionsModalOpen(true)}
            className="group mb-4 w-full flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
          >
            <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-amber-900 dark:text-amber-100">
                {pendingSubmissions.length} {pendingSubmissions.length === 1 ? 'submission is' : 'submissions are'} waiting for review
              </span>
              <span className="block text-xs text-amber-800/80 dark:text-amber-200/70 truncate">
                {pendingSubmissions.slice(0, 3).map((e) => e.title).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
              Review <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
            <ArrowRight className="sm:hidden shrink-0 w-5 h-5 text-amber-700 dark:text-amber-300" />
          </button>
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

        {/* Quick Category Filter Pills */}
        <div className="mb-4 sm:mb-6 flex items-center gap-2 overflow-x-auto lg:overflow-visible lg:flex-wrap pb-1 pt-0.5 no-scrollbar text-xs -mx-3 px-3 sm:mx-0 sm:px-0 touch-pan-x" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setFilters(prev => ({ ...prev, category: undefined }))}
            aria-pressed={!filters.category}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-medium whitespace-nowrap transition-all ${
              !filters.category
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            All
          </button>
          {EVENT_CATEGORIES.map(cat => {
            const isSelected = filters.category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilters(prev => ({ ...prev, category: isSelected ? undefined : cat }))}
                aria-pressed={isSelected}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(cat)}`} aria-hidden="true" />
                {cat}
              </button>
            );
          })}
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
            onEventClick={handleEventClick}
            onAddEventForDate={user.role === UserRole.ADMIN ? openSubmitPageWithDate : undefined}
            recurrenceExceptions={recurrenceExceptions}
            userRole={user.role}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            dateRange={filters.dateRange}
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
            currentUserName={user.fullName}
            onUpdate={handleUpdateEvent}
            onEventUpdate={handleEventUpdate}
            onDelete={handleDeleteEvent}
            onDeleteInstance={handleDeleteInstance}
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

      {isBulletinModalOpen && (
        <Suspense fallback={null}>
          <FortnightlyBulletinModal
            isOpen={isBulletinModalOpen}
            onClose={() => setIsBulletinModalOpen(false)}
            events={events}
            recurrenceExceptions={recurrenceExceptions}
            onOpenSubmissions={user.role === UserRole.ADMIN ? () => {
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
          />
        </Suspense>
      )}

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto py-6 pb-28 md:pb-6">
        <div className="max-w-7xl 2xl:max-w-[96rem] mx-auto px-4 text-center text-slate-500 dark:text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} Cork City Partnership. Internal Use Only.
          <p className="hidden lg:block mt-2 text-xs text-slate-400 dark:text-slate-500">
            Keyboard: <kbd className="font-sans font-semibold">/</kbd> search · <kbd className="font-sans font-semibold">←</kbd> <kbd className="font-sans font-semibold">→</kbd> previous / next · <kbd className="font-sans font-semibold">T</kbd> today
            {user.role === UserRole.ADMIN && <> · <kbd className="font-sans font-semibold">C</kbd> new event · <kbd className="font-sans font-semibold">E</kbd> edit open event</>}
            {' '}· <kbd className="font-sans font-semibold">Esc</kbd> close
          </p>
        </div>
      </footer>

      {hasTabBar && (
        <BottomNavigation
          onHomeClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onCreateClick={openSubmitPage}
          createLabel={user.role === UserRole.ADMIN ? 'New event' : 'Submit'}
          onInboxClick={user.role === UserRole.ADMIN ? () => setIsSubmissionsModalOpen(true) : undefined}
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
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
