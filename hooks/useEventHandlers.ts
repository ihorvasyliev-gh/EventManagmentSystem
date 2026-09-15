import { useState, useCallback } from 'react';
import { User, Event } from '../types';
import { createEvent, updateEvent, deleteEvent, deleteRecurrenceInstance, getEvents } from '../services/eventService';
import { cacheEvents, cacheExceptions, cacheRsvps } from '../utils/eventsCache';
import { clearRecurrenceCache } from '../utils/recurrence';

type ToastFn = (msg: string, type: 'success' | 'error' | 'info') => void;

export function useEventHandlers(
  user: User | null,
  events: Event[],
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>,
  setRecurrenceExceptions: React.Dispatch<React.SetStateAction<Map<string, Date[]>>>,
  setUserRsvpEventIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  showToast: ToastFn
) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [createWithDate, setCreateWithDate] = useState<Date | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleEventClick = useCallback((event: Event) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  }, []);

  const handleCreateClick = useCallback(() => {
    setSelectedEvent(null);
    setCreateWithDate(null);
    setIsModalOpen(true);
  }, []);

  const handleAddEventForDate = useCallback((date: Date) => {
    setCreateWithDate(date);
    setSelectedEvent(null);
    setIsModalOpen(true);
  }, []);

  const handleSaveEvent = useCallback(async (eventData: Omit<Event, 'id' | 'createdAt'>) => {
    if (!user) return;
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticEvent: Event = {
      ...eventData,
      id: tempId,
      createdAt: new Date(),
      creatorId: user.id,
      attendees: undefined,
      comments: undefined,
      history: undefined,
      attachments: eventData.attachments || undefined,
    };
    setEvents((prev) => {
      const next = [...prev, optimisticEvent];
      cacheEvents(next);
      return next;
    });
    setIsModalOpen(false);
    setTimeout(() => setSelectedEvent(null), 200);
    try {
      const serverEvent = await createEvent(eventData, user.id, user.fullName);
      setEvents((prev) => {
        const next = prev.map(e => (e.id === tempId ? serverEvent : e));
        cacheEvents(next);
        return next;
      });
      showToast('Event created successfully', 'success');
    } catch (e) {
      console.error('Error saving event', e);
      setEvents((prev) => {
        const next = prev.filter(e => e.id !== tempId);
        cacheEvents(next);
        return next;
      });
      showToast('Failed to create event', 'error');
      setIsModalOpen(true);
      setSelectedEvent(null);
      throw e;
    }
  }, [user, showToast, setEvents]);

  const handleUpdateEvent = useCallback(async (id: string, eventData: Omit<Event, 'id' | 'createdAt'>) => {
    if (!user) return;
    const originalEvent = events.find(e => e.id === id);
    if (!originalEvent) throw new Error('Event not found');
    const optimisticEvent: Event = {
      ...originalEvent,
      ...eventData,
      id,
      creatorId: originalEvent.creatorId,
      createdAt: originalEvent.createdAt,
    };
    setEvents((prev) => {
      const next = prev.map((e) => (e.id === id ? optimisticEvent : e));
      cacheEvents(next);
      return next;
    });
    setSelectedEvent((prev) => (prev?.id === id ? optimisticEvent : prev));
    setIsModalOpen(false);
    setTimeout(() => setSelectedEvent(null), 200);
    try {
      const serverEvent = await updateEvent(id, eventData, user.id, user.fullName);
      setEvents((prev) => {
        const next = prev.map((e) => (e.id === id ? serverEvent : e));
        cacheEvents(next);
        return next;
      });
      showToast('Event updated successfully', 'success');
    } catch (e) {
      console.error('Error updating event', e);
      setEvents((prev) => {
        const next = prev.map((e) => (e.id === id ? originalEvent : e));
        cacheEvents(next);
        return next;
      });
      setSelectedEvent((prev) => (prev?.id === id ? originalEvent : prev));
      showToast('Failed to update event', 'error');
      setIsModalOpen(true);
      setSelectedEvent(originalEvent);
      throw e;
    }
  }, [user, showToast, events, setEvents]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setCreateWithDate(null);
    setTimeout(() => setSelectedEvent(null), 200);
  }, []);

  const handleEventUpdate = useCallback((updatedEvent: Event) => {
    const isRecurring = updatedEvent.recurrence && updatedEvent.recurrence.type !== 'none';
    // For recurring events, the modal passes an *occurrence* (date = e.g. Feb 12), not the series.
    // Replacing the list event with it would corrupt the calendar: expansion would start from that
    // date and occurrences before it (e.g. 3rd, 5th) would disappear until the next refresh.
    if (!isRecurring) {
      setEvents((prev) => {
        const next = prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
        cacheEvents(next);
        return next;
      });
      setSelectedEvent((prev) => (prev?.id === updatedEvent.id ? updatedEvent : prev));
    } else {
      setSelectedEvent((prev) => (prev?.id === updatedEvent.id ? updatedEvent : prev));
    }
    if (user && updatedEvent.attendees !== undefined) {
      const isAttending = updatedEvent.attendees.includes(user.id);
      const instanceKey = updatedEvent.instanceKey ?? `${updatedEvent.id}_${updatedEvent.date.getTime()}`;
      setUserRsvpEventIds((prev) => {
        const next = new Set(prev);
        if (isAttending) next.add(instanceKey);
        else next.delete(instanceKey);
        cacheRsvps(Array.from(next));
        return next;
      });
    }
  }, [user, setEvents, setUserRsvpEventIds]);

  const handleDeleteInstance = useCallback(async (eventId: string, instanceDate: Date) => {
    if (!user) return;
    const normalizedDate = new Date(instanceDate);
    normalizedDate.setHours(0, 0, 0, 0);
    setRecurrenceExceptions((prev) => {
      const next = new Map(prev);
      const exceptions = next.get(eventId) || [];
      if (!exceptions.some((d: Date) => {
        const dNorm = new Date(d);
        dNorm.setHours(0, 0, 0, 0);
        return dNorm.getTime() === normalizedDate.getTime();
      })) {
        next.set(eventId, [...exceptions, normalizedDate]);
      }
      cacheExceptions(next);
      return next;
    });
    clearRecurrenceCache();
    try {
      await deleteRecurrenceInstance(eventId, instanceDate, user.id, user.fullName);
      showToast('Event instance deleted', 'success');
    } catch (error) {
      console.error('Error deleting instance', error);
      showToast('Failed to delete instance', 'error');
      setRecurrenceExceptions((prev) => {
        const next = new Map(prev);
        const exceptions = next.get(eventId) || [];
        const nextExceptions = exceptions.filter((d) => {
          const dNorm = new Date(d);
          dNorm.setHours(0, 0, 0, 0);
          return dNorm.getTime() !== normalizedDate.getTime();
        });
        next.set(eventId, nextExceptions);
        cacheExceptions(next);
        return next;
      });
    }
  }, [user, showToast, setRecurrenceExceptions]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    if (!user) return;
    const eventToDelete = events.find((e) => e.id === id);
    if (!eventToDelete) {
      showToast('Event not found', 'error');
      return;
    }
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      cacheEvents(next);
      return next;
    });
    clearRecurrenceCache();
    if (selectedEvent?.id === id) {
      setIsModalOpen(false);
      setTimeout(() => setSelectedEvent(null), 200);
    }
    try {
      await deleteEvent(id, user.id, user.fullName);
      showToast('Event deleted successfully', 'success');
      if (eventToDelete.recurrence && eventToDelete.recurrence.type !== 'none') {
        setRecurrenceExceptions((prev) => {
          const next = new Map(prev);
          next.delete(id);
          cacheExceptions(next);
          return next;
        });
      }
    } catch (e) {
      console.error('Error deleting event', e);
      setEvents((prev) => {
        const next = [...prev, eventToDelete];
        cacheEvents(next);
        return next;
      });
      showToast('Failed to delete event', 'error');
    }
  }, [user, events, selectedEvent, showToast, setEvents, setRecurrenceExceptions]);

  const handlePrefetchMonth = useCallback((_date: Date) => {
    const prefetchEvents = () => {
      getEvents()
        .then((data) => cacheEvents(data))
        .catch((err) => console.error('Prefetch error:', err));
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(prefetchEvents, { timeout: 3000 });
    } else {
      setTimeout(prefetchEvents, 500);
    }
  }, []);

  const handleExportClick = useCallback(() => setIsExportModalOpen(true), []);

  return {
    isModalOpen,
    setIsModalOpen,
    selectedEvent,
    setSelectedEvent,
    createWithDate,
    setCreateWithDate,
    isExportModalOpen,
    setIsExportModalOpen,
    handleEventClick,
    handleCreateClick,
    handleAddEventForDate,
    handleSaveEvent,
    handleUpdateEvent,
    handleCloseModal,
    handleEventUpdate,
    handleDeleteInstance,
    handleDeleteEvent,
    handlePrefetchMonth,
    handleExportClick,
  };
}
