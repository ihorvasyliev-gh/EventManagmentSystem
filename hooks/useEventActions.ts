import { useCallback } from 'react';
import type React from 'react';
import { type Event, type User } from '../types';
import {
  deleteEvent, deleteRecurrenceInstance, saveCustomSchedule, restoreEvent, removeDeletedEventFiles, dropMissingFiles,
  type DeletedEvent
} from '../services/eventService';
import { cacheExceptions } from '../utils/eventsCache';
import { isSameDay } from '../utils/date';
import { isRecurringEvent } from '../utils/recurrence';
import { materializeCustomSchedule } from '../utils/multiDateUtils';
import type { ToastType, ToastOptions } from '../contexts/ToastContext';
import type { EventModalControls } from './useEventModal';

/** How long a deletion can be undone from its toast */
const UNDO_MS = 10_000;

export type ShowToast = (message: string, type?: ToastType, duration?: number, options?: ToastOptions) => void;

interface EventActionsOptions {
  user: User | null;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  recurrenceExceptions: Map<string, Date[]>;
  setRecurrenceExceptions: React.Dispatch<React.SetStateAction<Map<string, Date[]>>>;
  showToast: ShowToast;
  modal: EventModalControls;
}

/**
 * Deleting events and single dates from the event window (changes are saved from the event
 * form). Each deletion shows at once and is undone if the server refuses it.
 */
export const useEventActions = ({
  user,
  events,
  setEvents,
  recurrenceExceptions,
  setRecurrenceExceptions,
  showToast,
  modal
}: EventActionsOptions) => {
  const { event: selectedEvent, close: closeModal } = modal;

  /** Forgets the deleted days of an event (it was deleted, or its dates were saved in full) */
  const forgetExceptions = useCallback((id: string) => {
    setRecurrenceExceptions((prev) => {
      const next = new Map(prev);
      next.delete(id);
      cacheExceptions(next);
      return next;
    });
  }, [setRecurrenceExceptions]);

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
          void removeDeletedEventFiles(await deleteEvent(eventId));
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

  /**
   * Puts a deleted event back (Undo, or Restore in the change log) and onto the calendar.
   * True when it worked; the toast says why not. From the change log its files may be gone.
   */
  const restoreDeletedEvent = useCallback(async (deleted: DeletedEvent, options?: { checkFiles?: boolean }): Promise<boolean> => {
    if (!user) return false;
    try {
      const { deleted: copy, lostFiles } = options?.checkFiles ? await dropMissingFiles(deleted) : { deleted, lostFiles: 0 };
      const { event, deletedDates } = await restoreEvent(copy);
      setEvents((prev) => [...prev.filter((e) => e.id !== event.id), event]);
      if (deletedDates.length) {
        setRecurrenceExceptions((prev) => {
          const next = new Map(prev);
          next.set(event.id, deletedDates);
          cacheExceptions(next);
          return next;
        });
      }
      showToast(
        lostFiles
          ? `"${event.title}" is back on the calendar, without its flyer or files (they were removed after it was deleted)`
          : `"${event.title}" is back on the calendar`,
        lostFiles ? 'warning' : 'success'
      );
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The event could not be restored', 'error');
      return false;
    }
  }, [user, setEvents, setRecurrenceExceptions, showToast]);

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

    let deleted: DeletedEvent;
    try {
      deleted = await deleteEvent(id);
    } catch (e) {
      console.error("Error deleting event", e);
      setEvents((prev) => [...prev, eventToDelete]);
      showToast('Failed to delete event', 'error');
      return;
    }
    if (isRecurringEvent(eventToDelete)) forgetExceptions(id);
    // A while to undo; after that its flyer and attachments are removed from storage
    showToast('Event deleted successfully', 'success', UNDO_MS, {
      action: { label: 'Undo', onClick: () => void restoreDeletedEvent(deleted) },
      onExpire: () => void removeDeletedEventFiles(deleted)
    });
  }, [user, events, setEvents, selectedEvent, closeModal, forgetExceptions, showToast, restoreDeletedEvent]);

  return { handleDeleteInstance, handleDeleteEvent, restoreDeletedEvent, forgetExceptions };
};
