import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MapPin, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { submitEvent, saveEventChanges, getPublishedEventsForSubmitters, type SubmissionData } from '../services/submissionService';
import { type User as AuthUser, UserRole, type Event, type EventStatus } from '../types';
import MultiDatePicker from '../components/MultiDatePicker';
import SessionPlaces from '../components/SessionPlaces';
import {
  type TimeSlot, type ScheduleState, formatTimeRange, compareByStartTime, getSlotsForDate, readScheduleFromEvent, materializeCustomSchedule
} from '../utils/multiDateUtils';
import { useEventSchedule } from '../hooks/useEventSchedule';
import { useToday } from '../hooks/useToday';
import { getEventLocations } from '../utils/recurrence';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';
import { EVENT_CATEGORIES, type EventCategoryName } from '../constants/categories';
import { detectOccurrenceConflicts, formatConflictDate, getOccurrencesAroundDates } from '../utils/conflictDetection';
import { formatOccurrenceLabel } from '../utils/digestGrouping';
import OverlapList from '../components/OverlapList';
import { groupOverlaps } from '../utils/duplicateDetection';
import SubmitReview, { type SubmissionSummary, type ReviewField } from '../components/SubmitReview';
import SubmitSuccess from '../components/submit/SubmitSuccess';
import SubmitPreview from '../components/submit/SubmitPreview';
import { SubmitTopBar, SubmitIntro, RestoredDraftNotice } from '../components/submit/SubmitIntro';
import { Section, FieldError, inputClass } from '../components/submit/formParts';
import CategoryPicker from '../components/submit/CategoryPicker';
import StatusPicker from '../components/submit/StatusPicker';
import RepeatPicker from '../components/submit/RepeatPicker';
import { type RepeatSetting, NO_REPEAT, describeSeries, repeatFromRule, ruleFromRepeat, untilDate } from '../utils/repeat';
import { ApiError } from '../services/apiClient';
import PosterUpload from '../components/submit/PosterUpload';
import ContactFields, { extraContactId, type ContactField } from '../components/submit/ContactFields';
import { type ContactRow, newContactRow, toContactRows, fromContactRows } from '../utils/contacts';
import SubmitButton, { SUBMIT_FORM_ID } from '../components/submit/SubmitButton';
import {
  type SavedDraft, readSavedSubmitter, saveSubmitter, readDraft, clearDraft, scheduleFromDraft, repeatFromDraft, useDraftAutosave
} from '../components/submit/draft';
import { usePosterFile } from '../hooks/usePosterFile';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileHandle } from '../components/TurnstileWidget';

const CATEGORIES = EVENT_CATEGORIES;
const DESCRIPTION_SOFT_LIMIT = 600;
/** The server refuses longer descriptions (server/submission.ts) */
const DESCRIPTION_MAX = 2000;

/** Form fields that can show an error (`contact-0-name` is the second contact's name) */
type FieldName = 'title' | 'category' | 'dates' | 'repeat' | 'location' | 'description' | 'name' | 'email' | 'poster' | `contact-${number}-${ContactField}`;

const contactErrorKey = (index: number, field: ContactField): FieldName => `${extraContactId(index)}-${field}` as FieldName;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubmitEventPageProps {
  onBackToLogin?: () => void;
  currentUser?: AuthUser | null;
  events?: Event[];
  /** Pre-selected date (admin adding an event from a calendar day) */
  initialDate?: Date | null;
  /** Admins: an event to copy ("Duplicate"): its details are filled in, the dates are left to pick */
  template?: Event | null;
  /**
   * An event being changed (the series as stored), by an admin or by the staff member it belongs
   * to: the form opens with all its details and saves through /api/edit-event, which logs what
   * changed. Admins also set its status.
   */
  editing?: Event | null;
  /** Days deleted from that series earlier ("Delete only this occurrence"): left out of the dates */
  editingExceptions?: Date[];
  /** Admins editing a submission from the inbox: the status starts at Published */
  publishOnSave?: boolean;
  /** After the changes to `editing` are saved */
  onSaved?: (result: { event: Event; changed: boolean; exceptionsCleared: boolean }) => void;
}

/** A stored event's dates, times and places as the form shows them */
const scheduleOfEvent = (event: Event, exceptions?: Date[]): ScheduleState => {
  const remaining = materializeCustomSchedule(event, exceptions);
  // No suggested end time: an event saved without one keeps it that way
  return readScheduleFromEvent(remaining ? { ...event, ...remaining } : event, null);
};

const fmtChipDate = (d: Date) => formatOccurrenceLabel(d);

/** The event form for staff (sent for review) and admins (published straight away) */
const SubmitEventPage: React.FC<SubmitEventPageProps> = ({
  onBackToLogin, currentUser, events = [], initialDate, template, editing, editingExceptions, publishOnSave, onSaved
}) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const today = useToday();

  // No date is picked up front, except the day an admin opened the form from
  const defaultDate = useMemo(() => {
    if (!initialDate || isNaN(initialDate.getTime())) return null;
    const d = new Date(initialDate);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [initialDate]);

  // A saved draft is offered back unless the admin came here for a specific day or to duplicate
  // an event, whose details then fill the form instead (dates are left to pick), or someone is
  // changing their event (all of it is filled in)
  const source = editing ?? template;
  const [restoredDraft] = useState<SavedDraft | null>(() => {
    if (source) {
      const category = CATEGORIES.find((c) => c === source.category);
      return {
        title: source.title,
        category: category ?? '',
        dates: [],
        location: source.location,
        description: source.description,
        submitterName: source.submitterName,
        submitterEmail: source.submitterEmail,
        extraContacts: source.extraContacts
      };
    }
    return initialDate ? null : readDraft();
  });

  const [title, setTitle] = useState(restoredDraft?.title ?? '');
  // An event being changed keeps its category, even one an admin added (or none). A new one
  // starts with none picked, so it isn't sent off under the first category by mistake
  const [category, setCategory] = useState<string>(() => {
    if (editing) return editing.category ?? '';
    return restoredDraft && CATEGORIES.some((c) => c === restoredDraft.category) ? restoredDraft.category : '';
  });
  const scheduleControls = useEventSchedule(() =>
    editing ? scheduleOfEvent(editing, editingExceptions) : scheduleFromDraft(restoredDraft, defaultDate)
  );
  // Every week / 2 weeks / month from the first date (only with one date and one time picked)
  const [repeat, setRepeat] = useState<RepeatSetting>(() => (editing ? repeatFromRule(editing.recurrence) : repeatFromDraft(restoredDraft)));
  const { schedule, update: updateSchedule, sessions, occurrences, activePerDate } = scheduleControls;
  const { dates: selectedDates, shared: sharedTimes, sameTime: sameTimeForAll, perDate: perDateTimes, samePlace, location, places } = schedule;
  const setLocation = (value: string) => updateSchedule({ location: value });
  const [description, setDescription] = useState(restoredDraft?.description ?? '');
  // An event being changed keeps its own contact (an admin isn't filled in instead)
  const [submitterName, setSubmitterName] = useState(() =>
    editing ? editing.submitterName ?? '' : (source && restoredDraft?.submitterName) || currentUser?.fullName || restoredDraft?.submitterName || readSavedSubmitter().name);
  const [submitterEmail, setSubmitterEmail] = useState(() =>
    editing ? editing.submitterEmail ?? '' : (source && restoredDraft?.submitterEmail) || currentUser?.email || restoredDraft?.submitterEmail || readSavedSubmitter().email);
  // Admins: published or a draft, for a new event too (to publish it later); staff can't set it
  const [status, setStatus] = useState<EventStatus>(() => (publishOnSave ? 'published' : editing?.status ?? 'published'));
  const setsStatus = isAdmin;
  const publishesDraft = setsStatus && !!editing && editing.status === 'draft' && status === 'published';
  const savesDraft = isAdmin && !editing && status === 'draft';
  // The saved version the changes are made to; after a clash, the other person's (saving again replaces it)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(editing?.updatedAt);
  // More contact people (the person sending it in is the first)
  const [extraContacts, setExtraContacts] = useState<ContactRow[]>(() => toContactRows(restoredDraft?.extraContacts));
  const [showDraftNotice, setShowDraftNotice] = useState(!!restoredDraft && !source);
  const rememberedSubmitter = !currentUser && !!readSavedSubmitter().email;

  // Events at the same time are shown as a heads-up. Signed in, they're the calendar's own;
  // without an account the server lists what's published (people can't read the table).
  const [activeEvents, setActiveEvents] = useState<Event[]>(events || []);
  useEffect(() => {
    if (currentUser || (events && events.length > 0)) {
      setActiveEvents(events);
      return;
    }
    let isMounted = true;
    getPublishedEventsForSubmitters()
      .then((fetched) => {
        if (isMounted && fetched.length > 0) setActiveEvents(fetched);
      })
      .catch((err) => console.warn('Failed to load events for conflict detection in SubmitEventPage:', err));
    return () => {
      isMounted = false;
    };
  }, [events, currentUser]);

  const editingId = editing?.id;
  const conflictInfo = useMemo(
    () => detectOccurrenceConflicts(occurrences, getOccurrencesAroundDates(activeEvents, selectedDates), editingId),
    [occurrences, selectedDates, activeEvents, editingId]
  );
  // Same-time events, with likely duplicates (similar name or same venue) first
  const overlaps = useMemo(
    () => groupOverlaps(conflictInfo.conflicts, { title, location: samePlace ? location : '' }),
    [conflictInfo, title, location, samePlace]
  );

  // Venues used before, offered as suggestions while typing
  const knownVenues = useMemo(
    () => Array.from(new Set<string>(activeEvents.flatMap(getEventLocations))).sort((a, b) => a.localeCompare(b)),
    [activeEvents]
  );

  // Poster
  const poster = usePosterFile((message) =>
    setErrors((prev) => (prev.poster === (message ?? undefined) ? prev : { ...prev, poster: message ?? undefined }))
  );
  const { file: posterFile, preview: posterPreview } = poster;
  // Duplicating or changing an event: start with its poster (a copy shares it until replaced)
  const templatePosterUrl = source?.posterUrl ?? null;
  useEffect(() => {
    if (templatePosterUrl) poster.reset(templatePosterUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the template
  }, [templatePosterUrl]);

  // Anti-spam check for people without an account (only when Turnstile is set up)
  const needsHumanCheck = TURNSTILE_ENABLED && !currentUser;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  // Sending was tried with something missing: the button says how much is left to fix
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmissionSummary | null>(null);
  // Staff see what they entered before it is sent; admins publish straight away
  const [reviewing, setReviewing] = useState(false);
  const [focusField, setFocusField] = useState<ReviewField | 'top' | null>(null);
  const placeValues = useMemo(() => (samePlace ? [] : sessions.map((s) => places[s.key] ?? '')), [samePlace, sessions, places]);
  const submitErrorRef = useRef<HTMLDivElement>(null);

  // A repeat starts from one date at one time; with more picked, the event runs on just those
  const canRepeat = sessions.length <= 1;
  const activeRepeat = canRepeat ? repeat : NO_REPEAT;
  const firstStart = occurrences[0]?.start ?? null;
  const repeatLabel = firstStart ? describeSeries(ruleFromRepeat(activeRepeat), firstStart) : null;

  // Autosave the draft (text fields only — files can't be stored)
  const draftToSave: SavedDraft = {
    // (only a new event is kept as a draft, and its category is one of the list)
    title, category: category as EventCategoryName | '', location, description,
    dates: selectedDates.map((d) => d.toISOString()),
    sharedTimes,
    sameTime: sameTimeForAll, perDateTimes,
    samePlace, places,
    submitterName, submitterEmail,
    extraContacts: fromContactRows(extraContacts),
    repeat
  };
  // Changes to an existing event aren't kept as a draft (they'd come back as a new event)
  useDraftAutosave(draftToSave, [title, location, description, ...placeValues].some((v) => v.trim()), !submitted && !editing);

  // Changing an event: leaving with unsaved changes asks first (the poster is compared on its own:
  // it is filled in just after the first render)
  const formSnapshot = JSON.stringify([
    title, category, status, description, scheduleControls.snapshot, activeRepeat, submitterName, submitterEmail, fromContactRows(extraContacts)
  ]);
  const [baseline] = useState(formSnapshot);
  const hasChanges = () => formSnapshot !== baseline || !!posterFile || (posterPreview ?? null) !== templatePosterUrl;

  useEffect(() => {
    if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [submitError]);

  const clearError = (field: FieldName) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  // Contact people after the first: a new row's name field gets the focus
  const focusContactRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusContactRef.current === null) return;
    document.getElementById(`field-${extraContactId(focusContactRef.current)}-name`)?.focus();
    focusContactRef.current = null;
  }, [extraContacts.length]);
  const addContact = () => {
    focusContactRef.current = extraContacts.length;
    setExtraContacts((rows) => [...rows, newContactRow()]);
  };
  const changeContact = (index: number, field: ContactField, value: string) => {
    setExtraContacts((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    clearError(contactErrorKey(index, field));
  };
  const removeContact = (index: number) => {
    setExtraContacts((rows) => rows.filter((_, i) => i !== index));
    // The errors of the rows below move up with them
    setErrors((prev) => {
      const next: Partial<Record<FieldName, string>> = {};
      (Object.entries(prev) as Array<[FieldName, string | undefined]>).forEach(([key, message]) => {
        const match = /^contact-(\d+)-(name|email)$/.exec(key);
        const row = match ? Number(match[1]) : -1;
        if (!match || row < index) next[key] = message;
        else if (row > index) next[contactErrorKey(row - 1, match[2] as ContactField)] = message;
      });
      return next;
    });
  };

  const sortedDates = useMemo(() => [...selectedDates].sort((a, b) => a.getTime() - b.getTime()), [selectedDates]);

  const validate = (): Partial<Record<FieldName, string>> => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!title.trim()) next.title = 'Please give the event a name.';
    if (!editing && !category) next.category = 'Pick the category that fits best.';
    if (sortedDates.length === 0) next.dates = 'Pick at least one date in the calendar.';
    else {
      const timeError = scheduleControls.validateTimes();
      if (timeError) next.dates = timeError;
    }
    const lastDate = activeRepeat.type !== 'none' ? untilDate(activeRepeat.until) : undefined;
    if (lastDate && sortedDates.length > 0) {
      const firstDay = new Date(sortedDates[0]);
      firstDay.setHours(0, 0, 0, 0);
      if (lastDate < firstDay) next.repeat = 'The last date is before the first date.';
    }
    if (samePlace) {
      if (!location.trim()) next.location = 'Where is it happening? A room or address is fine.';
    } else {
      const placeError = scheduleControls.validatePlaces();
      if (placeError) next.location = placeError;
    }
    if (!description.trim()) next.description = 'Add a sentence or two about the event.';
    else if (description.trim().length > DESCRIPTION_MAX) next.description = `Please shorten the description to ${DESCRIPTION_MAX} characters.`;
    // An event saved without a contact (older ones admins made) may stay without one
    const keepsNoContact = !!editing && !editing.submitterName?.trim() && !editing.submitterEmail?.trim() &&
      !submitterName.trim() && !submitterEmail.trim();
    if (!keepsNoContact) {
      if (!submitterName.trim()) next.name = editing ? 'Please enter the contact’s name.' : 'Please enter your name.';
      if (!EMAIL_RE.test(submitterEmail.trim())) next.email = 'Please enter a valid email address.';
    }
    // A row left blank is dropped; a started one needs both
    extraContacts.forEach((row, i) => {
      if (!row.name.trim() && !row.email.trim()) return;
      if (!row.name.trim()) next[contactErrorKey(i, 'name')] = 'Please enter their name.';
      if (!EMAIL_RE.test(row.email.trim())) next[contactErrorKey(i, 'email')] = 'Please enter a valid email address.';
    });
    if (poster.busy) next.poster = 'Your PDF is still being turned into an image — one moment, then send again.';
    else if (poster.choosing) next.poster = 'Pick the page of your PDF to use as the poster (or cancel).';
    return next;
  };

  /** Scrolls to the first field with a problem, in the order they appear; false if there is none */
  const goToFirstError = (found: Partial<Record<FieldName, string>>): boolean => {
    const order: FieldName[] = [
      'title', 'category', 'dates', 'repeat', 'location', 'description', 'poster', 'name', 'email',
      ...extraContacts.flatMap((_, i) => [contactErrorKey(i, 'name'), contactErrorKey(i, 'email')])
    ];
    const firstInvalid = order.find((f) => found[f]);
    if (!firstInvalid) return false;
    const el = document.getElementById(`field-${firstInvalid}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el && 'focus' in el) (el as HTMLElement).focus({ preventScroll: true });
    return true;
  };

  // Enter in a one-line field doesn't send a half-filled form (or publish it, for admins);
  // on a phone the keyboard's Go key just closes the keyboard
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target;
    if (e.key !== 'Enter' || e.nativeEvent.defaultPrevented || !(target instanceof HTMLInputElement)) return;
    if (['checkbox', 'radio', 'button', 'submit', 'file'].includes(target.type)) return;
    e.preventDefault();
    if (window.matchMedia?.('(pointer: coarse)').matches) target.blur();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const found = validate();
    setErrors(found);
    setAttempted(true);
    if (goToFirstError(found)) return;

    // Admins publish, and changes to an event are saved, without the review screen
    if (isAdmin || editing) {
      void sendEvent();
      return;
    }
    setReviewing(true);
    window.scrollTo({ top: 0 });
  };

  /** Everything entered, grouped for showing back on the review and thank-you screens */
  const buildSummary = (): SubmissionSummary => {
    const days: SubmissionSummary['days'] = [];
    sessions.forEach((s) => {
      const key = s.key.split('#')[0];
      let day = days.find((d) => d.key === key);
      if (!day) {
        day = { key, date: fmtChipDate(s.day), sessions: [] };
        days.push(day);
      }
      day.sessions.push({ key: s.key, time: formatTimeRange(s.slot), place: samePlace ? '' : (places[s.key] ?? '').trim() });
    });
    return {
      title: title.trim(),
      category,
      days,
      repeat: repeatLabel ?? undefined,
      location: samePlace ? location.trim() : '',
      description: description.trim(),
      posterUrl: posterPreview,
      contacts: [{ name: submitterName.trim(), email: submitterEmail.trim() }, ...fromContactRows(extraContacts)]
    };
  };

  const handleEditFromReview = (field?: ReviewField) => {
    setReviewing(false);
    setSubmitError(null);
    setFocusField(field ?? 'top');
  };

  // Back on the form: jump to the part the user asked to change
  useEffect(() => {
    if (reviewing || !focusField) return;
    const frame = requestAnimationFrame(() => {
      if (focusField === 'top') {
        window.scrollTo({ top: 0 });
      } else {
        const el = document.getElementById(`field-${focusField}`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
      }
      setFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reviewing, focusField]);

  const sendEvent = async () => {
    const built = scheduleControls.build();
    const data: SubmissionData = {
      title: title.trim(),
      description: description.trim(),
      date: built.date,
      endDate: built.endDate,
      location: built.location,
      category,
      submitterName: submitterName.trim(),
      submitterEmail: submitterEmail.trim(),
      extraContacts: fromContactRows(extraContacts),
      posterFile: posterFile || undefined,
      // Picked dates make their own series; one date may repeat on a pattern
      recurrence: built.recurrence ?? ruleFromRepeat(activeRepeat)
    };
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (editing) {
        const result = await saveEventChanges(editing.id, data, {
          baseUpdatedAt,
          keepPoster: !!posterPreview && posterPreview === templatePosterUrl,
          status: setsStatus ? status : undefined
        });
        onSaved?.(result);
        return;
      }

      await submitEvent({
        ...data,
        existingPosterUrl: !posterFile && posterPreview && posterPreview === templatePosterUrl ? templatePosterUrl : null,
        publish: isAdmin && status === 'published',
        turnstileToken
      });

      clearDraft();
      setSubmitted(buildSummary());
      setReviewing(false);
      window.scrollTo({ top: 0 });
      if (!currentUser) saveSubmitter(submitterName.trim(), submitterEmail.trim());
    } catch (err: unknown) {
      console.error('Submission error:', err);
      // A check token works once; the next attempt needs a new one
      if (needsHumanCheck) turnstileRef.current?.reset();
      const message = err instanceof Error && err.message ? err.message : '';
      if (editing) {
        // Saved by someone else meanwhile: saving again knowingly replaces their version
        const theirs = err instanceof ApiError && err.status === 409 ? (err.data.event as { updated_at?: string } | null) : null;
        if (theirs?.updated_at) {
          setBaseUpdatedAt(new Date(theirs.updated_at));
          setSubmitError(`${message} Save again to replace their version with yours, or go back to the calendar to keep theirs.`);
        } else {
          setSubmitError(`Your changes could not be saved${message ? ` (${message})` : ''}. They are still in the form — please try again.`);
        }
      } else {
        setSubmitError(
          message
            ? `The event could not be sent (${message}). Your details are saved — please try again.`
            : 'The event could not be sent. Please check your connection and try again — your details are saved.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setExtraContacts([]);
    poster.reset();
    scheduleControls.reset(scheduleFromDraft(null, defaultDate));
    setRepeat(NO_REPEAT);
    setErrors({});
    setAttempted(false);
    setSubmitError(null);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    resetForm();
    setShowDraftNotice(false);
  };

  const handleSubmitAnother = () => {
    resetForm();
    setSubmitted(null);
    window.scrollTo({ top: 0 });
  };

  const backLabel = currentUser ? 'Back to calendar' : 'Staff login';
  const handleBack = onBackToLogin && (() => {
    if (editing && hasChanges() && !window.confirm('You have unsaved changes. Discard them?')) return;
    onBackToLogin();
  });

  // --- Success screen ---------------------------------------------------------
  if (submitted) {
    return (
      <SubmitSuccess
        summary={submitted}
        isAdmin={isAdmin}
        draft={savesDraft}
        signedIn={!!currentUser}
        onSubmitAnother={handleSubmitAnother}
        onBack={onBackToLogin}
      />
    );
  }

  // --- Review screen ----------------------------------------------------------
  if (reviewing) {
    return (
      <SubmitReview
        summary={buildSummary()}
        overlaps={overlaps}
        formatWhen={(d) => formatConflictDate(d, occurrences, fmtChipDate)}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onEdit={handleEditFromReview}
        onSend={() => void sendEvent()}
        beforeSend={needsHumanCheck ? <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} /> : undefined}
        canSend={!needsHumanCheck || !!turnstileToken}
      />
    );
  }

  // --- Form -------------------------------------------------------------------
  const dayTimes = (slots: TimeSlot[]) => [...slots].sort(compareByStartTime).map(formatTimeRange).join(' & ');
  const timeLabel = (() => {
    if (!activePerDate) return dayTimes(sharedTimes);
    const labels = new Set(sortedDates.map((d) => dayTimes(getSlotsForDate(activePerDate, d, sharedTimes))));
    return labels.size <= 1 ? [...labels][0] ?? dayTimes(sharedTimes) : 'Different time each date';
  })();
  const placeLabel = (() => {
    if (samePlace) return location.trim();
    const distinct = Array.from(new Set(placeValues.map((p) => p.trim()).filter(Boolean)));
    return distinct.length > 2 ? `${distinct.slice(0, 2).join(' · ')} +${distinct.length - 2} more` : distinct.join(' · ');
  })();
  const descLength = description.trim().length;
  // A new event on a day that has already gone is usually a slip in the calendar
  const pastDates = editing ? [] : sortedDates.filter((d) => d < today);
  const pastLabel = pastDates.length > 2
    ? `${pastDates.slice(0, 2).map(fmtChipDate).join(', ')} and ${pastDates.length - 2} more`
    : pastDates.map(fmtChipDate).join(' and ');
  const errorCount = attempted ? Object.values(errors).filter(Boolean).length : 0;
  const errorSummary = errorCount > 0 && (
    <button
      type="button"
      onClick={() => goToFirstError(errors)}
      className="inline-flex items-center gap-1.5 min-h-[32px] text-sm font-semibold text-red-600 dark:text-red-400 hover:underline underline-offset-2"
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      {errorCount === 1 ? '1 field to fix' : `${errorCount} fields to fix`} · Show
    </button>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900">
      <SubmitTopBar onBack={handleBack} backLabel={backLabel} />

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 pb-32 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:gap-10 lg:items-start">
          <div className="min-w-0">
            <SubmitIntro isAdmin={isAdmin} editing={editing ? { published: editing.status === 'published' } : null} />

            {publishesDraft && (
              <div className="mb-5 flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-ccp-green-50 dark:bg-ccp-green-950/30 border border-ccp-green-200 dark:border-ccp-green-800/60 text-sm text-ccp-green-800 dark:text-ccp-green-200" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-ccp-green-600 dark:text-ccp-green-400" />
                <span>Saving publishes this submission: it goes on the calendar and into the next digest.</span>
              </div>
            )}

            {showDraftNotice && (
              <RestoredDraftNotice onStartFresh={handleDiscardDraft} onDismiss={() => setShowDraftNotice(false)} />
            )}

            <form id={SUBMIT_FORM_ID} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="space-y-4 sm:space-y-5">
              {/* 1. What */}
              <Section step={1} title="What’s the event?">
                <div>
                  <label htmlFor="field-title" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Event name <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="field-title"
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); clearError('title'); }}
                    placeholder="e.g. Enterprise Network Breakfast"
                    maxLength={140}
                    aria-invalid={!!errors.title}
                    aria-describedby={errors.title ? 'err-title' : undefined}
                    className={`${inputClass(!!errors.title)} px-4 py-3`}
                  />
                  <FieldError id="err-title" message={errors.title} />
                </div>

                <CategoryPicker
                  value={category}
                  onChange={(value) => { setCategory(value); clearError('category'); }}
                  extra={editing?.category}
                  required={!editing}
                  error={errors.category}
                />

                {setsStatus && <StatusPicker value={status} onChange={setStatus} />}
              </Section>

              {/* 2. When */}
              <Section
                step={2}
                title="When is it?"
                hint="Tap the date, or every date of a series. Every week or month? Pick the first date and choose how it repeats below."
              >
                <div id="field-dates" tabIndex={-1} className="outline-none scroll-mt-24">
                  <MultiDatePicker
                    selectedDates={selectedDates}
                    onChangeDates={(dates) => {
                      updateSchedule({ dates });
                      if (dates.length > 0) clearError('dates');
                    }}
                    sharedTimes={sharedTimes}
                    onChangeSharedTimes={(times) => { updateSchedule({ shared: times }); clearError('dates'); }}
                    sameTimeForAll={sameTimeForAll}
                    onChangeSameTimeForAll={(same) => { updateSchedule({ sameTime: same }); clearError('dates'); }}
                    perDateTimes={perDateTimes}
                    onChangePerDateTimes={(times) => { updateSchedule({ perDate: times }); clearError('dates'); }}
                    error={errors.dates}
                  />
                </div>

                {pastDates.length > 0 && (
                  <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>
                      {pastLabel} {pastDates.length === 1 ? 'has' : 'have'} already passed. Is that the right{' '}
                      {pastDates.length === 1 ? 'date' : 'dates'}?
                    </span>
                  </p>
                )}

                <RepeatPicker
                  value={repeat}
                  onChange={(next) => { setRepeat(next); clearError('repeat'); }}
                  firstDate={firstStart}
                  dateCount={selectedDates.length}
                  sessionCount={sessions.length}
                  error={errors.repeat}
                />

                <OverlapList
                  entries={overlaps}
                  formatWhen={(d) => formatConflictDate(d, occurrences, fmtChipDate)}
                  forSubmitter
                  note="You can still submit — this is just a heads-up."
                />
              </Section>

              {/* 3. Where & details */}
              <Section step={3} title="Where, and what’s it about?">
                <div className="space-y-2">
                  <label htmlFor="field-location" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Venue / location <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  {samePlace && (
                    <div>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="field-location"
                          type="text"
                          list="known-venues"
                          value={location}
                          onChange={(e) => { setLocation(e.target.value); clearError('location'); }}
                          placeholder="e.g. Heron House, Room 4"
                          autoComplete="off"
                          aria-invalid={!!errors.location}
                          aria-describedby={errors.location ? 'err-location' : undefined}
                          className={`${inputClass(!!errors.location)} pl-10 pr-4 py-3`}
                        />
                        <datalist id="known-venues">
                          {knownVenues.map((v) => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                      <FieldError id="err-location" message={errors.location} />
                    </div>
                  )}
                  <SessionPlaces
                    id={samePlace ? undefined : 'field-location'}
                    sessions={sessions}
                    samePlace={samePlace}
                    onChangeSamePlace={(same) => { scheduleControls.setSamePlace(same); clearError('location'); }}
                    places={places}
                    onChangePlaces={(next) => { updateSchedule({ places: next }); clearError('location'); }}
                    suggestions={knownVenues}
                    error={samePlace ? undefined : errors.location}
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label htmlFor="field-description" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Short description <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <span className={`text-xs tabular-nums ${descLength > DESCRIPTION_SOFT_LIMIT ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-400'}`}>
                      {descLength}/{DESCRIPTION_SOFT_LIMIT}
                    </span>
                  </div>
                  <textarea
                    id="field-description"
                    rows={4}
                    maxLength={DESCRIPTION_MAX}
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); clearError('description'); }}
                    placeholder="Who is it for, what happens, anything people should bring or book in advance…"
                    aria-invalid={!!errors.description}
                    aria-describedby={errors.description ? 'err-description' : 'hint-description'}
                    className={`${inputClass(!!errors.description)} px-4 py-3 resize-y min-h-[7rem]`}
                  />
                  {errors.description ? (
                    <FieldError id="err-description" message={errors.description} />
                  ) : (
                    <p id="hint-description" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {descLength > DESCRIPTION_SOFT_LIMIT
                        ? 'That’s quite long — the digest reads best with a few lines.'
                        : 'A few lines is perfect. This appears in the digest sent to the Board & staff.'}
                    </p>
                  )}
                </div>

                <PosterUpload poster={poster} error={errors.poster} />
              </Section>

              {/* 4. Who */}
              <Section
                step={4}
                title={isAdmin || editing ? (extraContacts.length > 0 ? 'Contact people' : 'Contact person') : 'Your details'}
                hint={isAdmin || editing
                  ? 'Shown as the contact in the digest. Add more people if there are several.'
                  : 'So Elizabeth can reach you with any questions. Anyone else you add is shown as a contact in the digest too.'}
              >
                {rememberedSubmitter && (
                  <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Filled in from your last submission on this device.
                  </p>
                )}
                <ContactFields
                  name={submitterName}
                  onNameChange={(value) => { setSubmitterName(value); clearError('name'); }}
                  nameError={errors.name}
                  email={submitterEmail}
                  onEmailChange={(value) => { setSubmitterEmail(value); clearError('email'); }}
                  emailError={errors.email}
                  extra={extraContacts}
                  onExtraChange={changeContact}
                  onAddContact={addContact}
                  onRemoveContact={removeContact}
                  extraError={(i, field) => errors[contactErrorKey(i, field)]}
                />
              </Section>

              {submitError && (
                <div ref={submitErrorRef} role="alert" className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
                    <p>{submitError}</p>
                    <p>
                      Still not working? Email{' '}
                      <a href={buildSupportMailto(submitError)} className="font-semibold underline underline-offset-2 break-all">
                        {CONTACT_EMAIL}
                      </a>{' '}
                      and we’ll sort it out.
                    </p>
                  </div>
                </div>
              )}

              {/* Desktop / tablet submit */}
              <div className="hidden sm:flex items-center justify-between gap-4 pt-1">
                {errorSummary || <p className="text-sm text-slate-500 dark:text-slate-400">
                  {editing
                    ? ((setsStatus ? status : editing.status) === 'published'
                      ? 'Your changes go on the calendar straight away.'
                      : 'It stays in the review queue, with your changes.')
                    : savesDraft ? 'Saved as a draft: not on the calendar until you publish it.'
                    : isAdmin ? 'Published to the calendar immediately.' : 'Sent to Elizabeth for review before it’s published.'}
                </p>}
                <SubmitButton isAdmin={isAdmin} draft={savesDraft} isSubmitting={isSubmitting} editing={editing ? (publishesDraft ? 'publish' : 'save') : undefined} />
              </div>
            </form>
          </div>

          {/* Sidebar: live preview + what happens next (desktop) */}
          <SubmitPreview
            showGuide={!isAdmin && !editing}
            title={title}
            category={category}
            description={description}
            posterPreview={posterPreview}
            dates={sortedDates}
            timeLabel={timeLabel}
            placeLabel={placeLabel}
            repeatLabel={repeatLabel}
          />
        </div>
      </div>

      {/* Phone: submit bar always within thumb reach */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {errorSummary && <div className="-mt-1 mb-1.5 flex justify-center">{errorSummary}</div>}
        <SubmitButton isAdmin={isAdmin} draft={savesDraft} isSubmitting={isSubmitting} editing={editing ? (publishesDraft ? 'publish' : 'save') : undefined} full />
      </div>
    </div>
  );
};

export default SubmitEventPage;
