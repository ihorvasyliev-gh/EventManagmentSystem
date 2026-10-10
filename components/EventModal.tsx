import React, { useState, useRef, useEffect, useMemo } from 'react';
import { type Event, UserRole, type EventCategory, type EventStatus, type Attachment, type EventHistoryEntry } from '../types';
import { X, MapPin, Upload, Loader2, Pencil, CheckCircle, Trash2, Plus, Copy, User, Mail, AlertCircle, Repeat } from 'lucide-react';
import { formatLocalDate } from '../utils/date';
import { uploadPosterToR2, fetchEventDetails } from '../services/eventService';
import { createCategory } from '../services/categoryService';
import EventDetails from './event-modal/EventDetails';
import DeleteEventDialog from './event-modal/DeleteEventDialog';
import AddCategoryDialog from './event-modal/AddCategoryDialog';
import { validateEvent } from '../utils/validation';
import { useTheme } from '../contexts/ThemeContext';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import PosterLightbox from './PosterLightbox';
import MultiDatePicker from './MultiDatePicker';
import SessionPlaces from './SessionPlaces';
import { makeSlot, readScheduleFromEvent, materializeCustomSchedule } from '../utils/multiDateUtils';
import { useEventSchedule } from '../hooks/useEventSchedule';
import { getEventLocations, expandRecurringEvents } from '../utils/recurrence';
import { EVENT_CATEGORIES } from '../constants/categories';
import { detectOccurrenceConflicts, getOccurrencesAroundDates } from '../utils/conflictDetection';
import { useToast } from '../contexts/ToastContext';
import { POSTER_ACCEPT, MAX_POSTER_IMAGE_MB, MAX_POSTER_PDF_MB } from '../utils/posterFile';
import { usePosterFile } from '../hooks/usePosterFile';
import PdfPagePicker from './PdfPagePicker';


/** Parses a YYYY-MM-DD input value as a local date (new Date('YYYY-MM-DD') would be UTC midnight). */
const parseLocalDateInput = (value: string): Date | undefined => {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};

const isRecurringEvent = (ev?: Event | null): boolean =>
  !!ev?.recurrence && ev.recurrence.type !== 'none';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
  events?: Event[];
  role: UserRole;
  currentUserId?: string;
  onUpdate?: (id: string, eventData: Omit<Event, 'id' | 'createdAt'>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>; // For event deletion
  onDeleteInstance?: (eventId: string, instanceDate: Date) => Promise<void>; // For instance deletion
  /** Admins: start a new event from this one (same details, new dates) */
  onDuplicate?: (event: Event) => void;
  initialMode?: 'view' | 'edit';
  autoApproveOnSave?: boolean;
  /** Unsaved form data to restore (e.g. after a failed save) */
  draft?: Omit<Event, 'id' | 'createdAt'> | null;
  /** Builds a shareable link for an event occurrence */
  getShareLink?: (event: Event) => string;
  /** Days deleted from recurring series (event id → days) */
  recurrenceExceptions?: Map<string, Date[]>;
}

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

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Dates, times and places (filled from the event when the form opens)
  const scheduleControls = useEventSchedule(() => ({
    dates: [event?.date ? new Date(event.date) : new Date()],
    shared: [makeSlot('10:00', '11:30', 't1')],
    sameTime: true,
    perDate: {},
    samePlace: true,
    location: '',
    places: {},
  }));
  const { schedule, update: updateSchedule, sessions, occurrences } = scheduleControls;
  const { dates: selectedDates, shared: sharedTimes, sameTime: sameTimeForAll, perDate: perDateTimes, samePlace, location, places } = schedule;
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [status, setStatus] = useState<EventStatus>('published');
  const [tags, setTags] = useState<string>('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const poster = usePosterFile((message) => {
    if (message) showToast(message, 'warning');
  });
  const { file: posterFile, preview: previewUrl, pdf: posterPdf } = poster;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Loaded when the event opens
  const [history, setHistory] = useState<EventHistoryEntry[]>([]);

  // Categories State
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [showPosterPreview, setShowPosterPreview] = useState(false);

  // The other upcoming dates of a repeating or multi-date event (the calendar shows one at a time)
  const SERIES_DATES_SHOWN = 6;
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

  // Recurrence State
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');

  // Inline validation errors (field id -> message)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  // Escape / backdrop / close button go through requestClose (defined below)
  const requestCloseRef = useRef<() => void>(onClose);
  useModalFocusTrap(isOpen, () => requestCloseRef.current(), modalPanelRef);
  // Bumped to re-initialise the form from the event (e.g. "Cancel" back to details)
  const [formResetKey, setFormResetKey] = useState(0);

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

  const conflictInfo = useMemo(() => {
    if (!isOpen || !showForm || !selectedDates || selectedDates.length === 0) {
      return { hasConflict: false, conflicts: [], summaryMessage: '' };
    }
    return detectOccurrenceConflicts(occurrences, getOccurrencesAroundDates(events || [], selectedDates), event?.id);
  }, [selectedDates, occurrences, events, event?.id, isOpen, showForm]);

  // Addresses used before, offered while typing a per-date address
  const knownVenues = useMemo(
    () => Array.from(new Set<string>((events || []).flatMap(getEventLocations))).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  // Unsaved-changes tracking (see formSnapshot below)
  const [baselineTick, setBaselineTick] = useState(0);
  const draftAppliedRef = useRef(false);

  // Initialize form state when opening or switching modes
  useEffect(() => {
    setShowPosterPreview(false);
    if (isOpen) {
      // Re-capture the unsaved-changes baseline once this initialisation has rendered
      setBaselineTick(t => t + 1);
      draftAppliedRef.current = false;
      if (event) {
        // We have an event (View/Edit mode)
        setTitle(event.title);
        setDescription(event.description);
        setCategory(event.category || '');
        setStatus(autoApproveOnSave ? 'published' : (event.status || 'published'));
        setTags(event.tags?.join(', ') || '');
        setSubmitterName(event.submitterName || '');
        setSubmitterEmail(event.submitterEmail || '');
        poster.reset(event.posterUrl || null);

        // Initial values from props (might be incomplete if lazy loaded)
        setAttachments(event.attachments || []);
        setHistory(event.history || []);

        // `event` may be one expanded occurrence of a series. The form edits the series,
        // so take dates from the stored series — otherwise saving would move the whole
        // series to the occurrence that was clicked.
        const source = isRecurringEvent(event)
          ? (eventsRef.current.find(e => e.id === event.id) ?? event)
          : event;

        // Days deleted earlier ("Delete only this occurrence") are left out of hand-picked dates
        const remaining = materializeCustomSchedule(source, exceptionsRef.current?.get(source.id));
        scheduleControls.reset(readScheduleFromEvent(remaining ? { ...source, ...remaining } : source));

        // Load Recurrence Data
        if (event.recurrence) {
          setRecurrenceType(event.recurrence.type as any);
          setRecurrenceInterval(event.recurrence.interval || 1);
          const recurrenceEnd = event.recurrence.endDate ? new Date(event.recurrence.endDate) : null;
          setRecurrenceEndDate(recurrenceEnd && !isNaN(recurrenceEnd.getTime()) ? formatLocalDate(recurrenceEnd) : '');
        } else {
          setRecurrenceType('none');
          setRecurrenceInterval(1);
          setRecurrenceEndDate('');
        }

        setIsEditing(initialMode === 'edit');
        setFieldErrors({});

        // LAZY LOAD: If details are missing, fetch them in background (no loading state)
        const needsLoading = !event.history || !event.attachments;

        let isActive = true;

        if (needsLoading) {
          fetchEventDetails(event.id).then(details => {
            if (!isActive) return;

            if (details.attachments) setAttachments(details.attachments);
            if (details.history) setHistory(details.history);
          }).catch(err => {
            console.error('Failed to lazy load event details:', err);
          });
        }

        return () => {
          isActive = false;
        };
      }
    }
    // Re-initialise only when the dialog opens, the event changes or Cancel resets it: the form
    // helpers (poster, schedule) are new objects every render and must not reset the user's edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event, initialMode, autoApproveOnSave, formResetKey]);

  // Restore unsaved form data (e.g. the save failed and the modal was reopened)
  useEffect(() => {
    if (!isOpen || !draft) return;
    draftAppliedRef.current = true;
    setTitle(draft.title || '');
    setDescription(draft.description || '');
    setCategory(draft.category || '');
    setStatus(draft.status || 'published');
    setTags(draft.tags?.join(', ') || '');
    setSubmitterName(draft.submitterName || '');
    setSubmitterEmail(draft.submitterEmail || '');
    poster.reset(draft.posterUrl || null);
    setAttachments(draft.attachments || []);
    scheduleControls.reset(readScheduleFromEvent({ ...draft, location: draft.location || '' }));
    if (draft.recurrence && draft.recurrence.type !== 'custom') {
      setRecurrenceType(draft.recurrence.type);
      setRecurrenceInterval(draft.recurrence.interval || 1);
      setRecurrenceEndDate(draft.recurrence.endDate ? formatLocalDate(new Date(draft.recurrence.endDate)) : '');
    }
    if (event) setIsEditing(true);
    // Applied once per draft (see above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft]);

  // Unsaved-changes tracking: snapshot of the form right after it was initialised
  const formSnapshot = JSON.stringify([
    title, description, category, status, tags, submitterName, submitterEmail,
    scheduleControls.snapshot,
    recurrenceType, recurrenceInterval, recurrenceEndDate, previewUrl, posterFile?.name ?? null
  ]);
  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    baselineRef.current = formSnapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineTick, isEditing]);
  const isDirty = draftAppliedRef.current || (baselineRef.current !== null && baselineRef.current !== formSnapshot);

  const confirmDiscard = (): boolean =>
    !(showForm && isDirty) || window.confirm('You have unsaved changes. Discard them?');

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
      setCategory(newCategory.name);
      setNewCategoryName('');
      setShowAddCategoryModal(false);
    } catch (err: any) {
      console.error('Failed to create category:', err);
      showToast(err.message || 'Failed to create category', 'error');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  // Cleared just before the file dialog opens, not after a pick: the same file can be picked
  // again, and a file still being read stays readable (clearing it can break reading on phones)
  const openFilePicker = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleRemovePoster = () => {
    poster.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (poster.busy || poster.choosing) {
      showToast(
        poster.busy
          ? 'The PDF is still being turned into an image — save again in a moment.'
          : 'Pick the page of the PDF to use as the poster (or cancel).',
        'warning'
      );
      return;
    }
    if (!title.trim()) {
      setFieldErrors(prev => ({ ...prev, title: 'Please enter an event title.' }));
      return;
    }
    if (!selectedDates || selectedDates.length === 0) {
      setFieldErrors(prev => ({ ...prev, date: 'Please select at least one date' }));
      return;
    }
    const timeError = scheduleControls.validateTimes();
    if (timeError) {
      setFieldErrors(prev => ({ ...prev, date: timeError }));
      return;
    }

    if (occurrences.length === 0) {
      setFieldErrors(prev => ({ ...prev, date: 'Invalid start date or time.' }));
      return;
    }

    const placeError = samePlace
      ? (!location.trim() ? 'Please specify the venue/location.' : null)
      : scheduleControls.validatePlaces();
    if (placeError) {
      setFieldErrors(prev => ({ ...prev, location: placeError }));
      return;
    }
    const builtSchedule = scheduleControls.build();
    const startDateTime = builtSchedule.date;
    const endDateTime = builtSchedule.endDate;
    if (!description.trim()) {
      setFieldErrors(prev => ({ ...prev, description: 'Please provide a description.' }));
      return;
    }

    const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

    let recurrence: Event['recurrence'] = undefined;
    if (builtSchedule.recurrence) {
      recurrence = builtSchedule.recurrence;
    } else if (['daily', 'weekly', 'monthly', 'yearly'].includes(recurrenceType)) {
      recurrence = {
        type: recurrenceType as 'daily' | 'weekly' | 'monthly' | 'yearly',
        interval: recurrenceInterval || 1,
        endDate: recurrenceEndDate ? parseLocalDateInput(recurrenceEndDate) : undefined,
      };
    }

    const eventDataToValidate = {
      title: title.trim(),
      description: description.trim(),
      location: builtSchedule.location,
      date: startDateTime,
      endDate: endDateTime,
      category: category || undefined,
      status: status || 'published',
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      recurrence
    };

    const validationErrors = validateEvent(eventDataToValidate);
    if (validationErrors.length > 0) {
      const byField: Record<string, string> = {};
      validationErrors.forEach(err => { byField[err.field] = err.message; });
      setFieldErrors(byField);
      setIsSubmitting(false);
      return;
    }
    setFieldErrors({});

    setIsSubmitting(true);
    try {
      let finalPosterUrl: string | undefined = previewUrl || undefined;

      // A new poster is uploaded first: if that fails, nothing is saved and the form stays open
      if (posterFile) {
        try {
          finalPosterUrl = await uploadPosterToR2(posterFile);
        } catch (uploadErr) {
          const reason = uploadErr instanceof Error ? uploadErr.message : '';
          throw new Error(`the poster could not be uploaded${reason ? ` (${reason})` : ''}. Your changes are still here — please try again`, { cause: uploadErr });
        }
      }

      // If user removed the poster, finalPosterUrl is undefined
      if (!previewUrl && !posterFile) {
        finalPosterUrl = undefined;
      }

      const fullEventData = {
        title: title.trim(),
        description: description.trim(),
        location: builtSchedule.location,
        date: startDateTime,
        endDate: endDateTime,
        posterUrl: finalPosterUrl,
        category: category || undefined,
        status: autoApproveOnSave ? 'published' : (status || 'published'),
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        submitterName: submitterName.trim() || undefined,
        submitterEmail: submitterEmail.trim() || undefined,
        attachments,
        creatorId: event?.creatorId || currentUserId,
        recurrence
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

  const handleDeleteClick = () => {
    if (!event) return;
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (deleteAll: boolean) => {
    if (!event || !onDelete) return;

    setIsDeleting(true);
    try {
      if (deleteAll) {
        // Удаляем всю серию
        // API call delegated to parent (App.tsx)
        await onDelete(event.id);
      } else {
        // Удаляем только этот экземпляр
        // API call delegated to parent (App.tsx)
        if (onDeleteInstance) {
          await onDeleteInstance(event.id, event.date);
        }
        // Закрываем модальное окно, так как этот экземпляр больше не существует
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
      <div className="flex items-end justify-center min-h-[100dvh] pt-0 px-0 pb-0 text-center sm:flex sm:items-center sm:p-0 sm:pt-4 sm:px-4 sm:pb-20">

        {/* Transparent Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-fade-in" aria-hidden="true" onClick={requestClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal Panel - Full Screen on Mobile */}
        <div ref={modalPanelRef} className={`relative flex flex-col rounded-none sm:rounded-leaf text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] border-t sm:border border-white/20 animate-scale-in ${theme === 'dark' ? 'panel-dark' : 'bg-white'}`}>

          {/* Header */}
          <div className="px-4 sm:px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0 z-10 bg-white dark:bg-slate-900">
            <h3 className={`text-lg sm:text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`} id="modal-title">
              {isEditing ? 'Edit Event' : 'Event Details'}
            </h3>
            <button onClick={requestClose} aria-label="Close" className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">

            {/* VIEW MODE */}
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
              // FORM MODE
              <form id="event-form" onSubmit={handleSubmit} className="space-y-5">
                {autoApproveOnSave && (
                  <div className="rounded-xl bg-ccp-green-50 dark:bg-ccp-green-950/30 border border-ccp-green-200 dark:border-ccp-green-800/60 p-3.5 flex items-center gap-3 text-xs text-ccp-green-800 dark:text-ccp-green-300">
                    <CheckCircle className="w-4 h-4 text-ccp-green-600 dark:text-ccp-green-400 shrink-0" />
                    <span>Saving your edits will automatically approve and publish this submission to the calendar.</span>
                  </div>
                )}
                {isEditing && event && isRecurringEvent(event) && (
                  <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 p-3.5 flex items-center gap-3 text-xs text-sky-800 dark:text-sky-300">
                    <Repeat className="w-4 h-4 shrink-0" />
                    <span>
                      {event.recurrence?.type === 'custom'
                        ? 'This event runs on several dates — changes apply to all of them. Tap a date in the calendar below to add or remove it.'
                        : 'This is a repeating event — changes apply to every occurrence. To remove a single date, use Delete → "Delete only this occurrence".'}
                    </span>
                  </div>
                )}
                {Object.keys(fieldErrors).length > 0 && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    Please fix the errors below.
                  </div>
                )}
                {/* 1. Event Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Event Name / Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); clearFieldError('title'); }}
                    className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400 min-h-[44px] sm:min-h-0 ${fieldErrors.title ? 'border-2 border-red-500 dark:border-red-500' : 'border border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                    placeholder="e.g. Enterprise Network Breakfast, Community Family Day"
                  />
                  {fieldErrors.title && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.title}</p>}
                </div>

                {/* 2. Category & Status */}
                <div className={`grid gap-x-2 gap-y-4 sm:gap-4 ${role === UserRole.ADMIN ? 'grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr]' : 'grid-cols-[1fr_auto]'}`}>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value as EventCategory | '')}
                      className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all min-h-[44px] sm:min-h-0"
                    >
                      <option value="">Select...</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setShowAddCategoryModal(true)}
                      className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      title="Add new category"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {role === UserRole.ADMIN && (
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as EventStatus)}
                        className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all min-h-[44px] sm:min-h-0"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 3. Event Date(s) & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Event Date(s) & Time <span className="text-red-500">*</span>
                  </label>
                  <MultiDatePicker
                    selectedDates={selectedDates}
                    onChangeDates={(dates) => {
                      updateSchedule({ dates });
                      if (dates.length > 0) clearFieldError('date');
                    }}
                    sharedTimes={sharedTimes}
                    onChangeSharedTimes={(times) => {
                      updateSchedule({ shared: times });
                      clearFieldError('date');
                    }}
                    sameTimeForAll={sameTimeForAll}
                    onChangeSameTimeForAll={(same) => {
                      updateSchedule({ sameTime: same });
                      clearFieldError('date');
                    }}
                    perDateTimes={perDateTimes}
                    onChangePerDateTimes={(times) => {
                      updateSchedule({ perDate: times });
                      clearFieldError('date');
                    }}
                    error={fieldErrors.date}
                  />
                </div>

                {conflictInfo.hasConflict && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3.5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300 animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Schedule Notice</span>
                      <span>{conflictInfo.summaryMessage}</span>
                    </div>
                  </div>
                )}

                {/* 4. Location / Venue */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Location / Venue <span className="text-red-500">*</span>
                  </label>
                  {samePlace && (
                    <>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 sm:top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          required
                          type="text"
                          value={location}
                          onChange={(e) => { updateSchedule({ location: e.target.value }); clearFieldError('location'); }}
                          className={`block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 ${fieldErrors.location ? 'border-2 border-red-500 dark:border-red-500' : 'border border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                          placeholder="e.g. Heron House, Room 4 / Mahon Community Centre"
                        />
                      </div>
                      {fieldErrors.location && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.location}</p>}
                    </>
                  )}
                  <div className={samePlace ? 'mt-1.5' : ''}>
                    <SessionPlaces
                      id="event-session-places"
                      sessions={sessions}
                      samePlace={samePlace}
                      onChangeSamePlace={(same) => { scheduleControls.setSamePlace(same); clearFieldError('location'); }}
                      places={places}
                      onChangePlaces={(next) => { updateSchedule({ places: next }); clearFieldError('location'); }}
                      suggestions={knownVenues}
                      error={samePlace ? undefined : fieldErrors.location}
                    />
                  </div>
                </div>

                {/* 5. Short Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Short Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); clearFieldError('description'); }}
                    rows={3}
                    className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all resize-y min-h-[80px] ${fieldErrors.description ? 'border-2 border-red-500 dark:border-red-500' : 'border border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                    placeholder="A few lines explaining what the event is about, who it's for, and key details for the Board & staff to pencil in."
                  />
                  {fieldErrors.description && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.description}</p>}
                </div>

                {/* 6. Poster / Flyer Upload & Removal */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Poster / Flyer <span className="text-slate-400 font-normal lowercase">(optional)</span>
                  </label>

                  {poster.choosing ? (
                    <PdfPagePicker pdf={poster.choosing} busy={poster.busy} onPick={poster.choosePage} onCancel={poster.cancelChoice} />
                  ) : poster.busy ? (
                    <div role="status" className="rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/20 p-5 text-center">
                      <Loader2 className="w-7 h-7 text-brand-500 animate-spin mx-auto mb-1.5" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Reading the PDF…</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">This only takes a moment</p>
                    </div>
                  ) : previewUrl ? (
                    <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 p-2.5 flex items-center gap-4">
                      <img
                        src={previewUrl}
                        alt="Poster preview"
                        className="w-20 h-20 object-cover rounded-lg border border-slate-300 dark:border-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {posterPdf?.name || posterFile?.name || (title ? `${title} flyer` : 'Current poster image')}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {posterPdf && (posterPdf.pages > 1 ? `Page ${posterPdf.page} of ${posterPdf.pages} · ` : 'Converted from PDF · ')}
                          {posterFile ? `${(posterFile.size / 1024).toFixed(0)} KB` : 'Active poster'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePoster}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Remove poster"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={openFilePicker}
                      className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-400 rounded-xl p-5 text-center transition-colors bg-slate-50/50 dark:bg-slate-800/50"
                    >
                      <Upload className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Click or drag and drop to upload flyer / poster
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        PNG, JPG or WEBP up to {MAX_POSTER_IMAGE_MB}MB · PDF up to {MAX_POSTER_PDF_MB}MB
                      </p>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={POSTER_ACCEPT}
                    className="hidden"
                    onChange={(e) => void poster.accept(e.target.files?.[0])}
                  />
                </div>

                {/* 7. Submitter Details */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">
                    Submitter Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        Submitter Name
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={submitterName}
                          onChange={(e) => setSubmitterName(e.target.value)}
                          placeholder="e.g. Sarah Murphy"
                          className="block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400"
                        />
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        Submitter Email
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          value={submitterEmail}
                          onChange={(e) => setSubmitterEmail(e.target.value)}
                          placeholder="e.g. sarah@corkcitypartnership.ie"
                          className="block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400"
                        />
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 8. Recurrence Section */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">RECURRENCE</h4>
                  <div className="space-y-4">
                    <div className={sessions.length <= 1 && recurrenceType !== 'none' && recurrenceType !== 'custom' ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : ''}>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Repeat</label>
                        <select
                          value={sessions.length > 1 ? 'custom' : recurrenceType}
                          onChange={(e) => setRecurrenceType(e.target.value as any)}
                          disabled={sessions.length > 1}
                          className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="none">None</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="custom">Custom Dates</option>
                        </select>
                      </div>

                      {sessions.length <= 1 && recurrenceType !== 'none' && recurrenceType !== 'custom' && (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Interval (Every X)</label>
                            <input
                              type="number"
                              min="1"
                              value={recurrenceInterval}
                              onChange={(e) => setRecurrenceInterval(Number(e.target.value))}
                              className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">End Date</label>
                            <input
                              type="date"
                              value={recurrenceEndDate}
                              onChange={(e) => setRecurrenceEndDate(e.target.value)}
                              className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {sessions.length > 1 && (
                      <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">
                        Multi-day custom schedule active ({selectedDates.length} {selectedDates.length === 1 ? 'date' : 'dates'}
                        {sessions.length > selectedDates.length ? `, ${sessions.length} times` : ''} selected above).
                      </p>
                    )}
                    {sessions.length <= 1 && recurrenceType === 'custom' && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select additional dates on the calendar above to set custom recurring dates.
                      </p>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Delete Confirmation Dialog */}
          {showDeleteDialog && event && (
            <DeleteEventDialog
              event={event}
              isDark={theme === 'dark'}
              isDeleting={isDeleting}
              onConfirm={(deleteAll) => void handleDeleteConfirm(deleteAll)}
              onCancel={() => setShowDeleteDialog(false)}
            />
          )}

          {/* Add Category Modal */}
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

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 flex flex-col-reverse sm:flex-row-reverse gap-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            {showForm ? (
              <>
                <button type="submit" form="event-form" disabled={isSubmitting} className="cta inline-flex justify-center items-center rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all disabled:opacity-50 w-full sm:w-auto">
                  {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : (isEditing ? (autoApproveOnSave ? 'Save & Approve' : 'Save Changes') : 'Create Event')}
                </button>
                <button type="button" onClick={handleCancelForm} disabled={isSubmitting} className="cta inline-flex justify-center items-center rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-600 transition-all w-full sm:w-auto">
                  Cancel
                </button>
              </>
            ) : role === UserRole.ADMIN && event ? (
              <div className="flex w-full items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="cta inline-flex justify-center items-center gap-1.5 rounded px-3 sm:px-4 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                  title="Delete event"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={() => onDuplicate(event)}
                    className="cta inline-flex justify-center items-center gap-1.5 rounded px-3 sm:px-4 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
                    title="New event with the same details"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="hidden min-[400px]:inline">Duplicate</span>
                  </button>
                )}
                <span className="flex-1" />
                <button type="button" onClick={onClose} className="cta hidden sm:inline-flex justify-center items-center rounded px-5 py-2.5 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-600 transition-all">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="cta inline-flex justify-center items-center gap-1.5 rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all flex-1 sm:flex-none"
                  title="Edit event (E)"
                  aria-keyshortcuts="e"
                >
                  <Pencil className="h-4 w-4" />
                  Edit event
                </button>
              </div>
            ) : (
              <button type="button" onClick={onClose} className="cta inline-flex justify-center items-center rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-600 transition-all w-full sm:w-auto">
                Close
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default React.memo(EventModal);
