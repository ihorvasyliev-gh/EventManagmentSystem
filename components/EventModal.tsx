import React, { useState, useRef, useEffect, useMemo } from 'react';
import { type Event, UserRole, type Attachment, type EventHistoryEntry } from '../types';
import { X } from 'lucide-react';
import { fetchEventDetails } from '../services/eventService';
import EventDetails from './event-modal/EventDetails';
import EventModalFooter from './event-modal/EventModalFooter';
import DeleteEventDialog from './event-modal/DeleteEventDialog';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import PosterLightbox from './PosterLightbox';
import { expandRecurringEvents, isRecurringEvent } from '../utils/recurrence';
import { useToast } from '../contexts/ToastContext';
import { ownsEvent } from '../utils/eventOwnership';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
  events?: Event[];
  role: UserRole;
  currentUserId?: string;
  currentUserEmail?: string;
  onDelete?: (id: string) => Promise<void>; // For event deletion
  onDeleteInstance?: (eventId: string, instanceDate: Date) => Promise<void>; // For instance deletion
  /** Admins: start a new event from this one (same details, new dates) */
  onDuplicate?: (event: Event) => void;
  /**
   * Opens the event in the full-screen event form: admins for any event, staff for their own
   * (the same form either way; admins also set the status there)
   */
  onEdit?: (event: Event) => void;
  /** Builds a shareable link for an event occurrence */
  getShareLink?: (event: Event) => string;
  /** Days deleted from recurring series (event id → days) */
  recurrenceExceptions?: Map<string, Date[]>;
}

// The other upcoming dates of a repeating or multi-date event (the calendar shows one at a time)
const SERIES_DATES_SHOWN = 6;

/** An event's details, and from there editing (in the event form), duplicating and deleting it */
const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  events = [],
  role,
  currentUserId = '1',
  currentUserEmail,
  onDelete,
  onDeleteInstance,
  onDuplicate,
  onEdit,
  getShareLink,
  recurrenceExceptions
}) => {
  const { showToast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Saved with the event; loaded when it opens
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<EventHistoryEntry[]>([]);

  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [showPosterPreview, setShowPosterPreview] = useState(false);

  const seriesDates = useMemo(() => {
    if (!event || !isRecurringEvent(event)) return { upcoming: [] as Event[], more: 0 };
    const master = events.find((e) => e.id === event.id) ?? event;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const others = expandRecurringEvents([master], from, to, recurrenceExceptions)
      .filter((o) => o.date.getTime() !== event.date.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { upcoming: others.slice(0, SERIES_DATES_SHOWN), more: Math.max(0, others.length - SERIES_DATES_SHOWN) };
  }, [event, events, recurrenceExceptions]);

  const modalPanelRef = useRef<HTMLDivElement>(null);
  // Escape / backdrop / close button go through requestClose (defined below)
  const requestCloseRef = useRef<() => void>(onClose);
  useModalFocusTrap(isOpen, () => requestCloseRef.current(), modalPanelRef);

  const isAdmin = role === UserRole.ADMIN;
  // Admins edit any event; staff the ones they sent in (or that name them as the contact)
  const canEdit = !!event && !!onEdit && (isAdmin || ownsEvent(event, { id: currentUserId, email: currentUserEmail }));

  // "E" opens the event form from the details
  useEffect(() => {
    if (!isOpen || showDeleteDialog || !canEdit || !event) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
      if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onEdit?.(event);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, showDeleteDialog, canEdit, onEdit, event]);

  // Opening: the attachments and history of the event
  useEffect(() => {
    setShowPosterPreview(false);
    if (!isOpen || !event) return;
    // Initial values from props (might be incomplete if lazy loaded)
    setAttachments(event.attachments || []);
    setHistory(event.history || []);

    // LAZY LOAD: If details are missing, fetch them in background (no loading state)
    if (event.history && event.attachments) return;
    let isActive = true;
    fetchEventDetails(event.id).then(details => {
      if (!isActive) return;
      if (details.attachments) setAttachments(details.attachments);
      if (details.history) setHistory(details.history);
    }).catch(err => {
      console.error('Failed to lazy load event details:', err);
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, event]);

  requestCloseRef.current = () => {
    // Close the innermost layer first
    if (showPosterPreview) {
      setShowPosterPreview(false);
      return;
    }
    if (showDeleteDialog) {
      if (!isDeleting) setShowDeleteDialog(false);
      return;
    }
    if (showCalendarDropdown) {
      setShowCalendarDropdown(false);
      return;
    }
    onClose();
  };
  const requestClose = () => requestCloseRef.current();

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!event || !getShareLink) return;
    const link = getShareLink(event);
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard', 'success', 2500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  const handleDeleteConfirm = async (deleteAll: boolean) => {
    if (!event || !onDelete) return;

    setIsDeleting(true);
    try {
      if (deleteAll) {
        // The whole series (the parent makes the API call)
        await onDelete(event.id);
      } else {
        // Only this occurrence; the window closes because it no longer exists
        if (onDeleteInstance) {
          await onDeleteInstance(event.id, event.date);
        }
        onClose();
      }
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting event:', error);
      showToast('Failed to delete event. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {showPosterPreview && event?.posterUrl && (
        <PosterLightbox src={event.posterUrl} title={event.title} onClose={() => setShowPosterPreview(false)} />
      )}
      <div className="flex items-end sm:items-center justify-center min-h-[100dvh] sm:p-4">

        {/* Transparent Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-fade-in" aria-hidden="true" onClick={requestClose}></div>

        {/* Modal Panel - Full Screen on Mobile. Centred from sm up, never taller than the window
            (a phone held sideways is sm wide but only ~375px tall) */}
        {/* Wider with a poster, which then stands beside the details */}
        <div ref={modalPanelRef} className={`relative flex flex-col rounded-none sm:rounded-leaf text-left overflow-hidden shadow-xl transform transition-all sm:max-w-2xl ${event?.posterUrl ? 'md:max-w-4xl' : ''} w-full h-[100dvh] sm:h-auto sm:max-h-[min(90vh,calc(100dvh-2rem))] border-t sm:border border-white/20 animate-scale-in bg-white dark-panel`}>

          {/* Header */}
          <div className="px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0 z-10 bg-white dark:bg-slate-900">
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white" id="modal-title">
              Event Details
            </h3>
            <button onClick={requestClose} aria-label="Close" className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
            {event && (
              <EventDetails
                event={event}
                attachments={attachments}
                history={history}
                seriesDates={seriesDates}
                onOpenPoster={() => setShowPosterPreview(true)}
                onCopyLink={getShareLink ? handleCopyLink : undefined}
                calendarOpen={showCalendarDropdown}
                onToggleCalendar={() => setShowCalendarDropdown((open) => !open)}
                onCloseCalendar={() => setShowCalendarDropdown(false)}
              />
            )}
          </div>

          {showDeleteDialog && event && (
            <DeleteEventDialog
              event={event}
              isDeleting={isDeleting}
              onConfirm={(deleteAll) => void handleDeleteConfirm(deleteAll)}
              onCancel={() => setShowDeleteDialog(false)}
            />
          )}

          <EventModalFooter
            onClose={onClose}
            onDelete={isAdmin && event && onDelete ? () => setShowDeleteDialog(true) : undefined}
            onDuplicate={isAdmin && onDuplicate && event ? () => onDuplicate(event) : undefined}
            onEdit={canEdit && event && onEdit ? () => onEdit(event) : undefined}
          />
        </div>

      </div>
    </div>
  );
};

export default React.memo(EventModal);
