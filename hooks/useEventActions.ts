import { useCallback } from 'react';
import type React from 'react';
import { type Event, type User } from '../types';
import { updateEvent, deleteEvent, deleteRecurrenceInstance, saveCustomSchedule, clearRecurrenceExceptions } from '../services/eventService';
import { approveSubmissions } from '../services/submissionService';
import { cacheExceptions } from '../utils/eventsCache';
import { isSameDay } from '../utils/date';
import { isRecurringEvent } from '../utils/recurrence';
import { materializeCustomSchedule } from '../utils/multiDateUtils';
import type { ToastType } from '../contexts/ToastContext';
import type { EventInput, EventModalControls } from './useEventModal';

export type ShowToast = (message: string, type?: ToastType, duration?: number) => void;

interface EventActionsOptions {
  user: User | null;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  recurrenceExceptions: Map<string, Date[]>;
  setRecurrenceExceptions: React.Dispatch<React.SetStateAction<Map<string, Date[]>>>;
  syncAfterChange: () => void;
  showToast: ShowToast;
  modal: EventModalControls;
}

/** Flags an error as already reported to the user (EventModal won't show it again) */
const markHandled = (e: unknown): Error => {
  const err = e instanceof Error ? e : new Error(String(e));
  (err as Error & { handled?: boolean }).handled = true;
  return err;
};

/**
 * Saving and deleting events from the event window. Each change shows at once and is undone
 * if the server refuses it; a failed save reopens the form with the changes kept.
 */
export const useEventActions = ({
  user,
  events,
  setEvents,
  recurrenceExceptions,
  setRecurrenceExceptions,
  syncAfterChange,
  showToast,
  modal
}: EventActionsOptions) => {
  const { event: selectedEvent, autoApprove: modalAutoApprove, close: closeModal, openToEdit, replaceEvent } = modal;

  /** Forgets the deleted days of an event (it was deleted, or its dates were saved in full) */
  const forgetExceptions = useCallback((id: string) => {
    setRecurrenceExceptions((prev) => {
      const next = new Map(prev);
      next.delete(id);
      cacheExceptions(next);
      return next;
    });
  }, [setRecurrenceExceptions]);

  const handleUpdateEvent = useCallback(async (id: string, eventData: EventInput) => {
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
    replaceEvent(id, optimisticEvent);

    // Close modal immediately for better UX
    closeModal();

    // Sync with server in background
    try {
      const serverEvent = await updateEvent(id, eventData, user.id, user.fullName);
      // Hand-picked dates: the form already left out deleted days, so the saved list is complete
      if (originalEvent.recurrence?.type === 'custom' && recurrenceExceptions.get(id)?.length) {
        await clearRecurrenceExceptions(id);
        forgetExceptions(id);
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
      showToast('Failed to update event — your changes have been kept, please try again', 'error');
      // Reopen the form with the unsaved changes
      openToEdit(originalEvent, { autoApprove: modalAutoApprove, draft: eventData });
      throw markHandled(e);
    }
  }, [user, showToast, events, setEvents, selectedEvent, modalAutoApprove, closeModal, openToEdit, replaceEvent, syncAfterChange, recurrenceExceptions, forgetExceptions]);

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
      forgetExceptions(eventId);

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
          setRecurrenceExceptions((prev) => {
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

    // A repeating event: the day becomes an exception (shown at once)
    const normalizedDate = new Date(instanceDate);
    normalizedDate.setHours(0, 0, 0, 0);

    setRecurrenceExceptions((prev) => {
      const next = new Map(prev);
      const exceptions = next.get(eventId) || [];
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
      setRecurrenceExceptions((prev) => {
        const next = new Map(prev);
        const exceptions = next.get(eventId) || [];
        next.set(eventId, exceptions.filter((d) => !isSameDay(d, normalizedDate)));
        cacheExceptions(next);
        return next;
      });
    }
  }, [user, showToast, events, setEvents, recurrenceExceptions, setRecurrenceExceptions, forgetExceptions]);

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
    if (selectedEvent?.id === id) closeModal();

    try {
      await deleteEvent(id);
      showToast('Event deleted successfully', 'success');
      if (isRecurringEvent(eventToDelete)) forgetExceptions(id);
    } catch (e) {
      console.error("Error deleting event", e);
      setEvents((prev) => [...prev, eventToDelete]);
      showToast('Failed to delete event', 'error');
    }
  }, [user, events, setEvents, selectedEvent, closeModal, forgetExceptions, showToast]);

  return { handleUpdateEvent, handleDeleteInstance, handleDeleteEvent };
};
