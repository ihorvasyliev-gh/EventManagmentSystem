import { type RefObject, useEffect, useRef, useState } from 'react';
import { type Event, type EventCategory, type EventStatus, type RecurrenceType } from '../../types';
import { formatLocalDate } from '../../utils/date';
import { uploadPosterToR2 } from '../../services/eventService';
import { validateEvent } from '../../utils/validation';
import { makeSlot, readScheduleFromEvent, materializeCustomSchedule } from '../../utils/multiDateUtils';
import { useEventSchedule } from '../../hooks/useEventSchedule';
import { isRecurringEvent } from '../../utils/recurrence';
import { usePosterFile } from '../../hooks/usePosterFile';
import { useToast } from '../../contexts/ToastContext';

/** Parses a YYYY-MM-DD input value as a local date (new Date('YYYY-MM-DD') would be UTC midnight). */
const parseLocalDateInput = (value: string): Date | undefined => {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};

export type EventInput = Omit<Event, 'id' | 'createdAt'>;

/** What the form holds once it passes the checks (the poster and attachments are added on save) */
export type EventFormValues = Pick<
  Event,
  'title' | 'description' | 'location' | 'date' | 'endDate' | 'category' | 'status' | 'tags' | 'submitterName' | 'submitterEmail' | 'recurrence'
>;

interface UseEventFormOptions {
  isOpen: boolean;
  event: Event | null;
  /** Unsaved form data to restore (e.g. after a failed save) */
  draft: EventInput | null;
  autoApproveOnSave: boolean;
  initialMode: 'view' | 'edit';
  /** Bumped to re-initialise the form from the event (e.g. "Cancel" back to details) */
  resetKey: number;
  isEditing: boolean;
  /** Latest events and deleted days, read when the form opens (not on every background refresh) */
  eventsRef: RefObject<Event[]>;
  exceptionsRef: RefObject<Map<string, Date[]> | undefined>;
}

/**
 * The edit form's fields: filled from the event (or a draft) when the window opens, checked
 * before saving, and compared with how they started to warn about unsaved changes.
 */
export const useEventForm = ({
  isOpen,
  event,
  draft,
  autoApproveOnSave,
  initialMode,
  resetKey,
  isEditing,
  eventsRef,
  exceptionsRef
}: UseEventFormOptions) => {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Dates, times and places (filled from the event when the form opens)
  const schedule = useEventSchedule(() => ({
    dates: [event?.date ? new Date(event.date) : new Date()],
    shared: [makeSlot('10:00', '11:30', 't1')],
    sameTime: true,
    perDate: {},
    samePlace: true,
    location: '',
    places: {},
  }));
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [status, setStatus] = useState<EventStatus>('published');
  const [tags, setTags] = useState<string>('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const poster = usePosterFile((message) => {
    if (message) showToast(message, 'warning');
  });
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none');
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

  // Unsaved-changes tracking (see formSnapshot below)
  const [baselineTick, setBaselineTick] = useState(0);
  const draftAppliedRef = useRef(false);

  // Initialize form state when opening or switching modes
  useEffect(() => {
    if (!isOpen) return;
    // Re-capture the unsaved-changes baseline once this initialisation has rendered
    setBaselineTick(t => t + 1);
    draftAppliedRef.current = false;
    if (!event) return;
    setTitle(event.title);
    setDescription(event.description);
    setCategory(event.category || '');
    setStatus(autoApproveOnSave ? 'published' : (event.status || 'published'));
    setTags(event.tags?.join(', ') || '');
    setSubmitterName(event.submitterName || '');
    setSubmitterEmail(event.submitterEmail || '');
    poster.reset(event.posterUrl || null);

    // `event` may be one expanded occurrence of a series. The form edits the series,
    // so take dates from the stored series — otherwise saving would move the whole
    // series to the occurrence that was clicked.
    const source = isRecurringEvent(event)
      ? (eventsRef.current.find(e => e.id === event.id) ?? event)
      : event;

    // Days deleted earlier ("Delete only this occurrence") are left out of hand-picked dates
    const remaining = materializeCustomSchedule(source, exceptionsRef.current?.get(source.id));
    schedule.reset(readScheduleFromEvent(remaining ? { ...source, ...remaining } : source));

    if (event.recurrence) {
      setRecurrenceType(event.recurrence.type);
      setRecurrenceInterval(event.recurrence.interval || 1);
      const recurrenceEnd = event.recurrence.endDate ? new Date(event.recurrence.endDate) : null;
      setRecurrenceEndDate(recurrenceEnd && !isNaN(recurrenceEnd.getTime()) ? formatLocalDate(recurrenceEnd) : '');
    } else {
      setRecurrenceType('none');
      setRecurrenceInterval(1);
      setRecurrenceEndDate('');
    }
    setFieldErrors({});
    // Re-initialise only when the dialog opens, the event changes or Cancel resets it: the form
    // helpers (poster, schedule) are new objects every render and must not reset the user's edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, event, initialMode, autoApproveOnSave, resetKey]);

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
    schedule.reset(readScheduleFromEvent({ ...draft, location: draft.location || '' }));
    if (draft.recurrence && draft.recurrence.type !== 'custom') {
      setRecurrenceType(draft.recurrence.type);
      setRecurrenceInterval(draft.recurrence.interval || 1);
      setRecurrenceEndDate(draft.recurrence.endDate ? formatLocalDate(new Date(draft.recurrence.endDate)) : '');
    }
    // Applied once per draft (see above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, draft]);

  // Unsaved-changes tracking: snapshot of the form right after it was initialised
  const formSnapshot = JSON.stringify([
    title, description, category, status, tags, submitterName, submitterEmail,
    schedule.snapshot,
    recurrenceType, recurrenceInterval, recurrenceEndDate, poster.preview, poster.file?.name ?? null
  ]);
  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    baselineRef.current = formSnapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineTick, isEditing]);
  const isDirty = draftAppliedRef.current || (baselineRef.current !== null && baselineRef.current !== formSnapshot);

  /** Checks the form; null (with the problems shown) while it can't be saved */
  const validate = (): EventFormValues | null => {
    if (poster.busy || poster.choosing) {
      showToast(
        poster.busy
          ? 'The PDF is still being turned into an image — save again in a moment.'
          : 'Pick the page of the PDF to use as the poster (or cancel).',
        'warning'
      );
      return null;
    }
    if (!title.trim()) {
      setFieldErrors(prev => ({ ...prev, title: 'Please enter an event title.' }));
      return null;
    }
    if (!schedule.schedule.dates || schedule.schedule.dates.length === 0) {
      setFieldErrors(prev => ({ ...prev, date: 'Please select at least one date' }));
      return null;
    }
    const timeError = schedule.validateTimes();
    if (timeError) {
      setFieldErrors(prev => ({ ...prev, date: timeError }));
      return null;
    }

    if (schedule.occurrences.length === 0) {
      setFieldErrors(prev => ({ ...prev, date: 'Invalid start date or time.' }));
      return null;
    }

    const { samePlace, location } = schedule.schedule;
    const placeError = samePlace
      ? (!location.trim() ? 'Please specify the venue/location.' : null)
      : schedule.validatePlaces();
    if (placeError) {
      setFieldErrors(prev => ({ ...prev, location: placeError }));
      return null;
    }
    const builtSchedule = schedule.build();
    if (!description.trim()) {
      setFieldErrors(prev => ({ ...prev, description: 'Please provide a description.' }));
      return null;
    }

    const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

    let recurrence: Event['recurrence'] = undefined;
    if (builtSchedule.recurrence) {
      recurrence = builtSchedule.recurrence;
    } else if (recurrenceType === 'daily' || recurrenceType === 'weekly' || recurrenceType === 'monthly' || recurrenceType === 'yearly') {
      recurrence = {
        type: recurrenceType,
        interval: recurrenceInterval || 1,
        endDate: recurrenceEndDate ? parseLocalDateInput(recurrenceEndDate) : undefined,
      };
    }

    const values: EventFormValues = {
      title: title.trim(),
      description: description.trim(),
      location: builtSchedule.location,
      date: builtSchedule.date,
      endDate: builtSchedule.endDate,
      category: category || undefined,
      status: status || 'published',
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      submitterName: submitterName.trim() || undefined,
      submitterEmail: submitterEmail.trim() || undefined,
      recurrence
    };

    const validationErrors = validateEvent(values);
    if (validationErrors.length > 0) {
      const byField: Record<string, string> = {};
      validationErrors.forEach(err => { byField[err.field] = err.message; });
      setFieldErrors(byField);
      return null;
    }
    setFieldErrors({});
    return values;
  };

  /** The poster to save: a newly picked file is uploaded first (if that fails, nothing is saved) */
  const uploadPoster = async (): Promise<string | undefined> => {
    if (poster.file) {
      try {
        return await uploadPosterToR2(poster.file);
      } catch (uploadErr) {
        const reason = uploadErr instanceof Error ? uploadErr.message : '';
        throw new Error(`the poster could not be uploaded${reason ? ` (${reason})` : ''}. Your changes are still here — please try again`, { cause: uploadErr });
      }
    }
    // No preview means the poster was removed
    return poster.preview || undefined;
  };

  return {
    title, setTitle,
    description, setDescription,
    category, setCategory,
    status, setStatus,
    submitterName, setSubmitterName,
    submitterEmail, setSubmitterEmail,
    recurrenceType, setRecurrenceType,
    recurrenceInterval, setRecurrenceInterval,
    recurrenceEndDate, setRecurrenceEndDate,
    schedule,
    poster,
    fieldErrors,
    clearFieldError,
    isDirty,
    validate,
    uploadPoster
  };
};

export type EventFormState = ReturnType<typeof useEventForm>;
