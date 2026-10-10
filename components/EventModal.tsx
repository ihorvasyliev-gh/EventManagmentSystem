import React, { useState, useRef, useEffect, useMemo } from 'react';
import { type Event, UserRole, type Attachment, type EventHistoryEntry } from '../types';
import { X } from 'lucide-react';
import { fetchEventDetails } from '../services/eventService';
import { createCategory } from '../services/categoryService';
import EventDetails from './event-modal/EventDetails';
import EventForm from './event-modal/EventForm';
import EventModalFooter from './event-modal/EventModalFooter';
import DeleteEventDialog from './event-modal/DeleteEventDialog';
import AddCategoryDialog from './event-modal/AddCategoryDialog';
import { type EventInput, useEventForm } from './event-modal/useEventForm';
import { useTheme } from '../contexts/ThemeContext';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import PosterLightbox from './PosterLightbox';
import { expandRecurringEvents, isRecurringEvent } from '../utils/recurrence';
import { EVENT_CATEGORIES } from '../constants/categories';
import { useToast } from '../contexts/ToastContext';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
  events?: Event[];
  role: UserRole;
  currentUserId?: string;
  onUpdate?: (id: string, eventData: EventInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>; // For event deletion
  onDeleteInstance?: (eventId: string, instanceDate: Date) => Promise<void>; // For instance deletion
  /** Admins: start a new event from this one (same details, new dates) */
  onDuplicate?: (event: Event) => void;
  initialMode?: 'view' | 'edit';
  autoApproveOnSave?: boolean;
  /** Unsaved form data to restore (e.g. after a failed save) */
  draft?: EventInput | null;
  /** Builds a shareable link for an event occurrence */
  getShareLink?: (event: Event) => string;
  /** Days deleted from recurring series (event id → days) */
  recurrenceExceptions?: Map<string, Date[]>;
}

// The other upcoming dates of a repeating or multi-date event (the calendar shows one at a time)
const SERIES_DATES_SHOWN = 6;

/** An event's details, its edit form, and deleting it */
const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  events = [],
  role,
  currentUserId = '1',
  onUpdate,
  onDelete,
  onDeleteInstance,
  onDuplicate,
  initialMode = 'view',
  autoApproveOnSave = false,
  draft = null,
  getShareLink,
  recurrenceExceptions
}) => {
  const { theme } = useTheme();
  const { showToast } = useToast();
  // Latest events without making the form re-initialise on every background refresh
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const exceptionsRef = useRef(recurrenceExceptions);
  exceptionsRef.current = recurrenceExceptions;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Bumped to re-initialise the form from the event (e.g. "Cancel" back to details)
  const [formResetKey, setFormResetKey] = useState(0);

  const form = useEventForm({
    isOpen,
    event,
    draft,
    autoApproveOnSave,
    initialMode,
    resetKey: formResetKey,
    isEditing,
    eventsRef,
    exceptionsRef
  });

  // Saved with the event; loaded when it opens
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<EventHistoryEntry[]>([]);

  // Categories State
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
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

  // Available categories: standard EVENT_CATEGORIES, current event's category, plus any custom
  const { category } = form;
  const availableCategories = useMemo(() => {
    const list: string[] = [...EVENT_CATEGORIES];
    if (category && !list.includes(category)) {
      list.push(category);
    }
    customCategories.forEach(c => {
      if (!list.includes(c)) {
        list.push(c);
      }
    });
    return list;
  }, [category, customCategories]);

  const modalPanelRef = useRef<HTMLDivElement>(null);
  // Escape / backdrop / close button go through requestClose (defined below)
  const requestCloseRef = useRef<() => void>(onClose);
  useModalFocusTrap(isOpen, () => requestCloseRef.current(), modalPanelRef);

  const showForm = isEditing;

  // "E" opens the edit form from the details view (admins)
  useEffect(() => {
    if (!isOpen || showForm || showDeleteDialog || role !== UserRole.ADMIN) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
      if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsEditing(true);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, showForm, showDeleteDialog, role]);

  // Opening (or "Cancel" back to the details): the mode, attachments and history of the event
  useEffect(() => {
    setShowPosterPreview(false);
    if (!isOpen || !event) return;
    // Initial values from props (might be incomplete if lazy loaded)
    setAttachments(event.attachments || []);
    setHistory(event.history || []);
    setIsEditing(initialMode === 'edit');

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
  }, [isOpen, event, initialMode, autoApproveOnSave, formResetKey]);

  // A draft restored after a failed save opens in the form, with its attachments
  useEffect(() => {
    if (!isOpen || !draft) return;
    setAttachments(draft.attachments || []);
    if (event) setIsEditing(true);
    // Applied once per draft, like the form's own fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft]);

  const confirmDiscard = (): boolean =>
    !(showForm && form.isDirty) || window.confirm('You have unsaved changes. Discard them?');

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
    if (showAddCategoryModal) {
      setShowAddCategoryModal(false);
      return;
    }
    if (showCalendarDropdown) {
      setShowCalendarDropdown(false);
      return;
    }
    if (isSubmitting || !confirmDiscard()) return;
    onClose();
  };
  const requestClose = () => requestCloseRef.current();

  const handleCancelForm = () => {
    if (!confirmDiscard()) return;
    if (isEditing && !autoApproveOnSave && initialMode !== 'edit') {
      // Back to details: drop the edits so the next "Edit" starts from the saved event
      setFormResetKey(k => k + 1);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showToast('Please enter a category name', 'warning');
      return;
    }

    setIsCreatingCategory(true);
    try {
      const newCategory = await createCategory(newCategoryName.trim(), currentUserId);
      setCustomCategories(prev => [...prev, newCategory.name]);
      form.setCategory(newCategory.name);
      setNewCategoryName('');
      setShowAddCategoryModal(false);
    } catch (err: any) {
      console.error('Failed to create category:', err);
      showToast(err.message || 'Failed to create category', 'error');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.validate();
    if (!values) return;

    setIsSubmitting(true);
    try {
      // A new poster is uploaded first: if that fails, nothing is saved and the form stays open
      const posterUrl = await form.uploadPoster();
      const fullEventData: EventInput = {
        title: values.title,
        description: values.description,
        location: values.location,
        date: values.date,
        endDate: values.endDate,
        posterUrl,
        category: values.category,
        status: autoApproveOnSave ? 'published' : values.status,
        tags: values.tags,
        submitterName: values.submitterName,
        submitterEmail: values.submitterEmail,
        attachments,
        creatorId: event?.creatorId || currentUserId,
        recurrence: values.recurrence
      };

      if (event && onUpdate) {
        await onUpdate(event.id, fullEventData);
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      // The parent already reported save failures (and reopened the form); only report upload errors here
      if (!err?.handled) {
        showToast(err?.message ? `Failed to save event: ${err.message}` : 'Failed to save event', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div ref={modalPanelRef} className={`relative flex flex-col rounded-none sm:rounded-leaf text-left overflow-hidden shadow-xl transform transition-all sm:max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[min(90vh,calc(100dvh-2rem))] border-t sm:border border-white/20 animate-scale-in ${theme === 'dark' ? 'panel-dark' : 'bg-white'}`}>

          {/* Header */}
          <div className="px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0 z-10 bg-white dark:bg-slate-900">
            <h3 className={`text-lg sm:text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`} id="modal-title">
              {isEditing ? 'Edit Event' : 'Event Details'}
            </h3>
            <button onClick={requestClose} aria-label="Close" className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
            {!showForm && event ? (
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
            ) : (
              <EventForm
                form={form}
                role={role}
                event={event}
                events={events}
                isEditing={isEditing}
                autoApproveOnSave={autoApproveOnSave}
                availableCategories={availableCategories}
                onAddCategory={() => setShowAddCategoryModal(true)}
                onSubmit={handleSubmit}
              />
            )}
          </div>

          {showDeleteDialog && event && (
            <DeleteEventDialog
              event={event}
              isDark={theme === 'dark'}
              isDeleting={isDeleting}
              onConfirm={(deleteAll) => void handleDeleteConfirm(deleteAll)}
              onCancel={() => setShowDeleteDialog(false)}
            />
          )}

          {showAddCategoryModal && (
            <AddCategoryDialog
              isDark={theme === 'dark'}
              name={newCategoryName}
              onNameChange={setNewCategoryName}
              isCreating={isCreatingCategory}
              onAdd={handleAddCategory}
              onCancel={() => {
                setShowAddCategoryModal(false);
                setNewCategoryName('');
              }}
            />
          )}

          <EventModalFooter
            showForm={showForm}
            isEditing={isEditing}
            isSubmitting={isSubmitting}
            autoApproveOnSave={autoApproveOnSave}
            canManage={role === UserRole.ADMIN && !!event}
            onCancel={handleCancelForm}
            onClose={onClose}
            onDelete={() => setShowDeleteDialog(true)}
            onDuplicate={onDuplicate && event ? () => onDuplicate(event) : undefined}
            onEdit={() => setIsEditing(true)}
          />
        </div>

      </div>
    </div>
  );
};

export default React.memo(EventModal);
