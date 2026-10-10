import { useCallback, useMemo } from 'react';
import type React from 'react';
import { type Event, type EventStatus } from '../types';
import { approveSubmissions, declineSubmissions } from '../services/submissionService';
import type { ShowToast } from './useEventActions';

interface SubmissionActionsOptions {
  isAdmin: boolean;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  syncAfterChange: () => void;
  showToast: ShowToast;
}

/** Admins' inbox: the submissions waiting for review, and approving or declining them */
export const useSubmissionActions = ({ isAdmin, events, setEvents, syncAfterChange, showToast }: SubmissionActionsOptions) => {
  // Admins see every draft, so the inbox is simply the drafts, newest first
  const pendingSubmissions = useMemo(
    () => (isAdmin
      ? events.filter((e) => e.status === 'draft').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      : []),
    [events, isAdmin]
  );

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

  const handleRejectSubmission = useCallback(async (eventId: string) => {
    const rejected = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      await declineSubmissions([eventId]);
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

  return { pendingSubmissions, handleApproveSubmission, handleRejectSubmission, handleApproveAllSubmissions };
};
