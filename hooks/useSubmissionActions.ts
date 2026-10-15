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

/** What became of a review: whether the server emailed the submitters (null: it failed) */
export type ReviewOutcome = { authorsEmailed: boolean } | null;

/** Admins' inbox: the submissions waiting for review, and approving or declining them */
export const useSubmissionActions = ({ isAdmin, events, setEvents, syncAfterChange, showToast }: SubmissionActionsOptions) => {
  // Admins see every draft, so the inbox is simply the drafts, newest first
  const pendingSubmissions = useMemo(
    () => (isAdmin
      ? events.filter((e) => e.status === 'draft').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      : []),
    [events, isAdmin]
  );

  const handleApproveSubmission = useCallback(async (event: Event): Promise<ReviewOutcome> => {
    // Optimistic update: instantly mark it published (and so out of the inbox)
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, status: 'published', updatedAt: new Date() } : e)));
    try {
      const { events: [serverEvent], authorsEmailed } = await approveSubmissions([event.id]);
      showToast(`Event "${event.title}" approved and published!`, 'success');
      if (serverEvent) setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...serverEvent } : e)));
      syncAfterChange();
      return { authorsEmailed };
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)));
      showToast(err instanceof Error ? err.message : 'Failed to approve event', 'error');
      return null;
    }
  }, [setEvents, syncAfterChange, showToast]);

  const handleRejectSubmission = useCallback(async (eventId: string, reason?: string): Promise<ReviewOutcome> => {
    const rejected = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    try {
      const { authorsEmailed } = await declineSubmissions([eventId], reason);
      showToast('Submission declined', 'info');
      syncAfterChange();
      return { authorsEmailed };
    } catch (err) {
      if (rejected) setEvents((prev) => (prev.some((e) => e.id === eventId) ? prev : [...prev, rejected]));
      showToast(err instanceof Error ? err.message : 'Failed to decline the submission', 'error');
      return null;
    }
  }, [events, setEvents, syncAfterChange, showToast]);

  const handleApproveAllSubmissions = useCallback(async (): Promise<ReviewOutcome> => {
    const subsToApprove = [...pendingSubmissions];
    if (subsToApprove.length === 0) return null;
    const ids = new Set(subsToApprove.map((s) => s.id));
    setEvents((prev) => prev.map((e) => (ids.has(e.id) ? { ...e, status: 'published' as EventStatus, updatedAt: new Date() } : e)));
    try {
      const { authorsEmailed } = await approveSubmissions([...ids]);
      showToast(`All ${subsToApprove.length} events approved and published!`, 'success');
      syncAfterChange();
      return { authorsEmailed };
    } catch (err) {
      const original = new Map(subsToApprove.map((s) => [s.id, s]));
      setEvents((prev) => prev.map((e) => original.get(e.id) ?? e));
      showToast(err instanceof Error ? err.message : 'Failed to approve submissions', 'error');
      return null;
    }
  }, [pendingSubmissions, setEvents, syncAfterChange, showToast]);

  return { pendingSubmissions, handleApproveSubmission, handleRejectSubmission, handleApproveAllSubmissions };
};
