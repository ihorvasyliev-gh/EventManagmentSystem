import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  MapPin, User, Mail, CheckCircle2, AlertCircle, UploadCloud, X, ArrowLeft, Send, Clock, CalendarDays,
  ImageIcon, Info, RotateCcw, Sparkles
} from 'lucide-react';
import { submitEvent, getEvents } from '../services/eventService';
import { User as AuthUser, UserRole, Event } from '../types';
import MultiDatePicker from '../components/MultiDatePicker';
import SessionPlaces from '../components/SessionPlaces';
import {
  TimeRange, TimeSlot, SessionPlaces as SessionPlacesMap, ScheduleState, makeSlot, formatTimeRange,
  compareByStartTime, getSlotsForDate
} from '../utils/multiDateUtils';
import { useEventSchedule } from '../hooks/useEventSchedule';
import { getEventLocations } from '../utils/recurrence';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';
import { EVENT_CATEGORIES, EventCategoryName } from '../constants/categories';
import { detectOccurrenceConflicts, formatConflictDate, getOccurrencesAroundDates } from '../utils/conflictDetection';
import { getCategoryDotColor } from '../components/WeekView';
import { formatOccurrenceLabel } from '../utils/digestGrouping';
import SubmitReview, { ScheduleList, SubmissionSummary, ReviewField } from '../components/SubmitReview';

const CATEGORIES = EVENT_CATEGORIES;
const DESCRIPTION_SOFT_LIMIT = 600;

// Staff submit most weeks: remember who they are on this device
const SUBMITTER_STORAGE_KEY = 'ccp_submitter_details';
// Unsent form, so a closed tab or lost connection doesn't cost the user their typing
const DRAFT_STORAGE_KEY = 'ccp_submit_draft';

const readSavedSubmitter = (): { name: string; email: string } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUBMITTER_STORAGE_KEY) || '{}');
    return { name: typeof parsed.name === 'string' ? parsed.name : '', email: typeof parsed.email === 'string' ? parsed.email : '' };
  } catch {
    return { name: '', email: '' };
  }
};

interface SavedDraft {
  title: string;
  category: EventCategoryName;
  dates: string[];
  /** Times used on every day (older drafts have one `startTime`/`endTime` instead) */
  sharedTimes?: TimeSlot[];
  startTime?: string;
  endTime?: string;
  /** false when each date has its own time (older drafts don't have it) */
  sameTime?: boolean;
  /** Each date's own times (older drafts hold one time range per date) */
  perDateTimes?: Record<string, TimeSlot[] | TimeRange>;
  /** false when each date and time has its own address */
  samePlace?: boolean;
  places?: SessionPlacesMap;
  location: string;
  description: string;
  submitterName?: string;
  submitterEmail?: string;
}

const readDraft = (): SavedDraft | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const places = parsed.places && typeof parsed.places === 'object' ? Object.values(parsed.places) : [];
    const hasContent = [parsed.title, parsed.location, parsed.description, ...places].some((v) => typeof v === 'string' && v.trim());
    return hasContent ? parsed as SavedDraft : null;
  } catch {
    return null;
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};

type FieldName = 'title' | 'dates' | 'location' | 'description' | 'name' | 'email' | 'poster';

interface SubmitEventPageProps {
  onBackToLogin?: () => void;
  currentUser?: AuthUser | null;
  events?: Event[];
  /** Pre-selected date (admin adding an event from a calendar day) */
  initialDate?: Date | null;
}

const inputBase =
  'w-full rounded-xl border bg-white dark:bg-slate-900/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-[15px] sm:text-sm transition-colors';
const inputClass = (hasError: boolean) =>
  `${inputBase} ${hasError ? 'border-red-400 dark:border-red-500 bg-red-50/40 dark:bg-red-950/20' : 'border-slate-300 dark:border-slate-600'}`;

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {message}
    </p>
  ) : null;

const Section: React.FC<{ step: number; title: string; hint?: string; children: React.ReactNode }> = ({ step, title, hint, children }) => (
  <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
    <div className="flex items-start gap-3 mb-4 sm:mb-5">
      <span className="shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center">{step}</span>
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-7">{title}</h2>
        {hint && <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    </div>
    <div className="space-y-5">{children}</div>
  </section>
);

const fmtChipDate = (d: Date) => formatOccurrenceLabel(d);

const isSlot = (v: unknown): v is TimeRange =>
  !!v && typeof v === 'object' && typeof (v as TimeRange).start === 'string' && typeof (v as TimeRange).end === 'string';

/** Draft times, in the current shape */
const readDraftSlots = (value: unknown): TimeSlot[] => {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(isSlot).map((s, i) => makeSlot(s.start, s.end, typeof (s as TimeSlot).id === 'string' ? (s as TimeSlot).id : `t${i + 1}`));
};

const scheduleFromDraft = (draft: SavedDraft | null, defaultDate: Date | null): ScheduleState => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Dates that have passed since the draft was saved are dropped
  const future = (draft?.dates || [])
    .map((s) => new Date(s))
    .filter((d) => !isNaN(d.getTime()) && d >= startOfToday);
  const shared = readDraftSlots(draft?.sharedTimes);
  const perDate: Record<string, TimeSlot[]> = {};
  if (draft?.perDateTimes && typeof draft.perDateTimes === 'object') {
    Object.entries(draft.perDateTimes).forEach(([key, value]) => {
      const slots = readDraftSlots(value);
      if (slots.length > 0) perDate[key] = slots;
    });
  }
  return {
    dates: future.length ? future : defaultDate ? [defaultDate] : [],
    shared: shared.length ? shared : [makeSlot(draft?.startTime || '10:00', draft?.endTime ?? '11:30', 't1')],
    sameTime: draft?.sameTime ?? true,
    perDate,
    samePlace: draft?.samePlace ?? true,
    location: draft?.location ?? '',
    places: draft?.places && typeof draft.places === 'object' ? draft.places : {},
  };
};

const SubmitEventPage: React.FC<SubmitEventPageProps> = ({ onBackToLogin, currentUser, events = [], initialDate }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // No date is picked up front, except the day an admin opened the form from
  const defaultDate = useMemo(() => {
    if (!initialDate || isNaN(initialDate.getTime())) return null;
    const d = new Date(initialDate);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [initialDate]);

  // A saved draft is offered back unless the admin came here for a specific day
  const [restoredDraft] = useState<SavedDraft | null>(() => (initialDate ? null : readDraft()));

  const [title, setTitle] = useState(restoredDraft?.title ?? '');
  const [category, setCategory] = useState<EventCategoryName>(
    restoredDraft && CATEGORIES.includes(restoredDraft.category) ? restoredDraft.category : CATEGORIES[0]
  );
  const scheduleControls = useEventSchedule(() => scheduleFromDraft(restoredDraft, defaultDate));
  const { schedule, update: updateSchedule, sessions, occurrences, activePerDate } = scheduleControls;
  const { dates: selectedDates, shared: sharedTimes, sameTime: sameTimeForAll, perDate: perDateTimes, samePlace, location, places } = schedule;
  const setLocation = (value: string) => updateSchedule({ location: value });
  const [description, setDescription] = useState(restoredDraft?.description ?? '');
  const [submitterName, setSubmitterName] = useState(() => currentUser?.fullName || restoredDraft?.submitterName || readSavedSubmitter().name);
  const [submitterEmail, setSubmitterEmail] = useState(() => currentUser?.email || restoredDraft?.submitterEmail || readSavedSubmitter().email);
  const [showDraftNotice, setShowDraftNotice] = useState(!!restoredDraft);
  const rememberedSubmitter = !currentUser && !!readSavedSubmitter().email;

  const [activeEvents, setActiveEvents] = useState<Event[]>(events || []);
  useEffect(() => {
    if (events && events.length > 0) {
      setActiveEvents(events);
      return;
    }
    let isMounted = true;
    getEvents()
      .then((fetched) => {
        if (isMounted && fetched && fetched.length > 0) setActiveEvents(fetched);
      })
      .catch((err) => console.warn('Failed to load events for conflict detection in SubmitEventPage:', err));
    return () => {
      isMounted = false;
    };
  }, [events]);

  const conflictInfo = useMemo(
    () => detectOccurrenceConflicts(occurrences, getOccurrencesAroundDates(activeEvents, selectedDates)),
    [occurrences, selectedDates, activeEvents]
  );

  // Venues used before, offered as suggestions while typing
  const knownVenues = useMemo(
    () => Array.from(new Set<string>(activeEvents.flatMap(getEventLocations))).sort((a, b) => a.localeCompare(b)),
    [activeEvents]
  );

  // Poster
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmissionSummary | null>(null);
  // Staff see what they entered before it is sent; admins publish straight away
  const [reviewing, setReviewing] = useState(false);
  const [focusField, setFocusField] = useState<ReviewField | 'top' | null>(null);
  const placeValues = samePlace ? [] : sessions.map((s) => places[s.key] ?? '');
  const submitErrorRef = useRef<HTMLDivElement>(null);

  // Autosave the draft (text fields only — files can't be stored)
  useEffect(() => {
    if (submitted) return;
    const timer = setTimeout(() => {
      try {
        const draft: SavedDraft = {
          title, category, location, description,
          dates: selectedDates.map((d) => d.toISOString()),
          sharedTimes,
          sameTime: sameTimeForAll, perDateTimes,
          samePlace, places,
          submitterName, submitterEmail
        };
        if ([title, location, description, ...placeValues].some((v) => v.trim())) {
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        }
      } catch {
        // Storage unavailable — no autosave
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, category, location, description, selectedDates, sharedTimes, sameTimeForAll, perDateTimes, samePlace, places, submitterName, submitterEmail, submitted]);

  useEffect(() => {
    if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [submitError]);

  const clearError = (field: FieldName) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const acceptFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setErrors((prev) => ({ ...prev, poster: 'Please choose an image (PNG, JPG, GIF or WEBP).' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, poster: 'That image is over 10MB — please choose a smaller one.' }));
      return;
    }
    setPosterFile(file);
    const reader = new FileReader();
    reader.onload = () => setPosterPreview(reader.result as string);
    reader.readAsDataURL(file);
    clearError('poster');
  }, []);

  const handleRemovePoster = () => {
    setPosterFile(null);
    setPosterPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sortedDates = useMemo(() => [...selectedDates].sort((a, b) => a.getTime() - b.getTime()), [selectedDates]);

  const validate = (): Partial<Record<FieldName, string>> => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!title.trim()) next.title = 'Please give the event a name.';
    if (sortedDates.length === 0) next.dates = 'Pick at least one date in the calendar.';
    else {
      const timeError = scheduleControls.validateTimes();
      if (timeError) next.dates = timeError;
    }
    if (samePlace) {
      if (!location.trim()) next.location = 'Where is it happening? A room or address is fine.';
    } else {
      const placeError = scheduleControls.validatePlaces();
      if (placeError) next.location = placeError;
    }
    if (!description.trim()) next.description = 'Add a sentence or two about the event.';
    if (!submitterName.trim()) next.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail.trim())) next.email = 'Please enter a valid email address.';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const found = validate();
    setErrors(found);
    const firstInvalid = (['title', 'dates', 'location', 'description', 'name', 'email'] as FieldName[]).find((f) => found[f]);
    if (firstInvalid) {
      const el = document.getElementById(`field-${firstInvalid}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (el && 'focus' in el) (el as HTMLElement).focus({ preventScroll: true });
      return;
    }

    if (isAdmin) {
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
      location: samePlace ? location.trim() : '',
      description: description.trim(),
      posterUrl: posterPreview,
      name: submitterName.trim(),
      email: submitterEmail.trim()
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
    const { date: startDateTime, endDate: endDateTime, location: eventLocation, recurrence } = scheduleControls.build();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await submitEvent({
        title: title.trim(),
        description: description.trim(),
        date: startDateTime,
        endDate: endDateTime,
        location: eventLocation,
        category,
        submitterName: submitterName.trim(),
        submitterEmail: submitterEmail.trim(),
        posterFile: posterFile || undefined,
        status: isAdmin ? 'published' : 'draft',
        recurrence
      });

      clearDraft();
      setSubmitted(buildSummary());
      setReviewing(false);
      window.scrollTo({ top: 0 });
      if (!currentUser) {
        try {
          localStorage.setItem(SUBMITTER_STORAGE_KEY, JSON.stringify({ name: submitterName.trim(), email: submitterEmail.trim() }));
        } catch {
          // Storage unavailable — details just won't be prefilled next time
        }
      }
    } catch (err: unknown) {
      console.error('Submission error:', err);
      const message = err instanceof Error && err.message ? err.message : '';
      setSubmitError(
        message
          ? `The event could not be sent (${message}). Your details are saved — please try again.`
          : 'The event could not be sent. Please check your connection and try again — your details are saved.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory(CATEGORIES[0]);
    handleRemovePoster();
    scheduleControls.reset(scheduleFromDraft(null, defaultDate));
    setErrors({});
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

  // --- Success screen ---------------------------------------------------------
  if (submitted) {
    const steps: Array<[string, string, 'done' | 'current' | 'next']> = isAdmin
      ? [['Published', 'Live on the calendar now', 'done'], ['Upcoming Events Digest', 'Included in the next issue', 'next']]
      : [
          ['Sent', 'We have your event', 'done'],
          ['Review', 'Elizabeth checks the details', 'current'],
          ['On the calendar', "And in Friday's Upcoming Events Digest", 'next']
        ];
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-3 py-8 sm:p-6">
        <div className="max-w-lg w-full animate-scale-in">
          <div className="text-center mb-6">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping [animation-iteration-count:2]" aria-hidden="true" />
              <span className="relative w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-9 h-9" />
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {isAdmin ? 'Event published' : 'Thank you — event sent!'}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
              {isAdmin
                ? 'It is live on the calendar and will appear in the next Upcoming Events Digest.'
                : `We'll let you know at ${submitted.email} if anything needs changing.`}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex gap-4 p-4 sm:p-5">
              {submitted.posterUrl && (
                <img src={submitted.posterUrl} alt="" className="w-20 h-24 sm:w-24 sm:h-28 shrink-0 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(submitted.category)}`} /> {submitted.category}
                </span>
                <p className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-white break-words">{submitted.title}</p>
                {submitted.location && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /> <span className="break-words">{submitted.location}</span>
                  </p>
                )}
                {!isAdmin && (
                  <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Waiting for review
                  </p>
                )}
              </div>
            </div>
            <div className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-700 text-sm">
              <ScheduleList days={submitted.days} compact />
            </div>
            <ol className="px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 space-y-3">
              {steps.map(([label, hint, state], i) => (
                <li key={label} className="flex items-start gap-3">
                  <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    state === 'done' ? 'bg-emerald-500 text-white'
                      : state === 'current' ? 'bg-amber-400 text-amber-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {state === 'done' ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
            <button
              type="button"
              onClick={handleSubmitAnother}
              className="flex-1 h-12 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm"
            >
              {isAdmin ? 'Create another event' : 'Submit another event'}
            </button>
            {onBackToLogin && (
              <button
                type="button"
                onClick={onBackToLogin}
                className="flex-1 h-12 px-4 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors text-sm"
              >
                {currentUser ? 'Back to calendar' : 'Go to staff login'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Review screen ----------------------------------------------------------
  if (reviewing) {
    return (
      <SubmitReview
        summary={buildSummary()}
        conflicts={conflictInfo.conflicts.map((c) => ({
          label: formatConflictDate(c.date, occurrences, fmtChipDate),
          titles: c.conflictingEvents.map((ev) => ev.title)
        }))}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onEdit={handleEditFromReview}
        onSend={() => void sendEvent()}
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-3">
          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1.5 h-10 px-2.5 -ml-1 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden min-[340px]:inline">{backLabel}</span>
            </button>
          )}
          <span className="ml-auto bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <img src="/assets/ccp-logo.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 pb-32 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:gap-10 lg:items-start">
          <div className="min-w-0">
            {/* Intro */}
            <div className="mb-5 sm:mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                {isAdmin ? 'Admin · publishes immediately' : 'Staff event form · no login needed'}
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isAdmin ? 'Create a new event' : 'Submit an upcoming event'}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl">
                {isAdmin
                  ? 'It goes straight onto the calendar and into the next Upcoming Events Digest.'
                  : 'Meetings, courses, family days, visits or info sessions in the next few weeks — fill in the four short steps below. It takes about two minutes.'}
              </p>
            </div>

            {showDraftNotice && (
              <div className="mb-5 flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-sm text-sky-900 dark:text-sky-100" role="status">
                <RotateCcw className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <span className="flex-1">We restored the event you hadn’t sent yet.</span>
                <button type="button" onClick={handleDiscardDraft} className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline">
                  Start fresh
                </button>
                <button type="button" onClick={() => setShowDraftNotice(false)} aria-label="Dismiss" className="shrink-0 p-1 -m-1 rounded-lg text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form id="submit-event-form" onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
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

                <fieldset>
                  <legend className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Category</legend>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const selected = category === cat;
                      return (
                        <label
                          key={cat}
                          className={`relative inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-full border text-sm font-medium cursor-pointer select-none transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="category"
                            value={cat}
                            checked={selected}
                            onChange={() => setCategory(cat)}
                            className="sr-only"
                          />
                          <span className={`w-2.5 h-2.5 rounded-full ${getCategoryDotColor(cat)}`} aria-hidden="true" />
                          {cat}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </Section>

              {/* 2. When */}
              <Section step={2} title="When is it?" hint="Tap every date it runs on — for a series, pick each day.">
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

                {conflictInfo.hasConflict && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3.5 flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200 animate-fade-in">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold block">Something else is on at the same time</span>
                      <ul className="mt-1 space-y-0.5 text-xs sm:text-sm">
                        {conflictInfo.conflicts.map((c) => (
                          <li key={c.date.getTime()}>
                            <span className="font-semibold">{formatConflictDate(c.date, occurrences, fmtChipDate)}:</span>{' '}
                            {c.conflictingEvents.slice(0, 2).map((ev) => `“${ev.title}”`).join(', ')}
                            {c.conflictingEvents.length > 2 && ` +${c.conflictingEvents.length - 2} more`}
                          </li>
                        ))}
                      </ul>
                      <span className="mt-1 block text-xs text-amber-800/80 dark:text-amber-200/80">You can still submit — this is just a heads-up.</span>
                    </div>
                  </div>
                )}
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

                <div id="field-poster" tabIndex={-1} className="outline-none scroll-mt-24">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Poster or flyer <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  {posterPreview ? (
                    <div className="flex items-center gap-4 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                      <img src={posterPreview} alt="Poster preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{posterFile?.name || 'Uploaded flyer'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{posterFile ? `${Math.max(1, Math.round(posterFile.size / 1024))} KB` : ''}</p>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                          Replace
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemovePoster}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        aria-label="Remove image"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                      className={`w-full flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                        isDragging
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                          : errors.poster
                          ? 'border-red-300 dark:border-red-700'
                          : 'border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500 bg-slate-50/60 dark:bg-slate-900/30'
                      }`}
                    >
                      <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-brand-500' : 'text-slate-400'}`} />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span className="sm:hidden">Tap to add an image</span>
                        <span className="hidden sm:inline">Click to choose, or drop an image here</span>
                      </span>
                      <span className="text-xs text-slate-400">PNG, JPG or WEBP · up to 10MB</span>
                    </button>
                  )}
                  <FieldError id="err-poster" message={errors.poster} />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                  />
                </div>
              </Section>

              {/* 4. Who */}
              <Section
                step={4}
                title={isAdmin ? 'Contact person' : 'Your details'}
                hint={isAdmin ? 'Shown as the contact in the digest.' : 'So Elizabeth can reach you with any questions.'}
              >
                {rememberedSubmitter && (
                  <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Filled in from your last submission on this device.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="field-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                      Full name <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="field-name"
                        type="text"
                        autoComplete="name"
                        value={submitterName}
                        onChange={(e) => { setSubmitterName(e.target.value); clearError('name'); }}
                        placeholder="e.g. Sarah Murphy"
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? 'err-name' : undefined}
                        className={`${inputClass(!!errors.name)} pl-10 pr-3 py-3`}
                      />
                    </div>
                    <FieldError id="err-name" message={errors.name} />
                  </div>
                  <div>
                    <label htmlFor="field-email" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                      Work email <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="field-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={submitterEmail}
                        onChange={(e) => { setSubmitterEmail(e.target.value); clearError('email'); }}
                        placeholder="name@partnershipcork.ie"
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? 'err-email' : undefined}
                        className={`${inputClass(!!errors.email)} pl-10 pr-3 py-3`}
                      />
                    </div>
                    <FieldError id="err-email" message={errors.email} />
                  </div>
                </div>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Published to the calendar immediately.' : 'Sent to Elizabeth for review before it’s published.'}
                </p>
                <SubmitButton isAdmin={isAdmin} isSubmitting={isSubmitting} />
              </div>
            </form>
          </div>

          {/* Sidebar: live preview + what happens next (desktop) */}
          <aside className="hidden lg:block sticky top-24 space-y-4" aria-label="Preview">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Sparkles className="w-3.5 h-3.5" /> Preview
              </div>
              {posterPreview ? (
                <img src={posterPreview} alt="" className="w-full h-40 object-cover border-y border-slate-100 dark:border-slate-700" />
              ) : (
                <div className="h-24 mx-5 mb-1 rounded-xl bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <ImageIcon className="w-7 h-7" />
                </div>
              )}
              <div className="p-5 space-y-2.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${getCategoryDotColor(category)}`} /> {category}
                </span>
                <p className={`text-lg font-bold leading-snug break-words ${title.trim() ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'}`}>
                  {title.trim() || 'Your event name'}
                </p>
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                  <span>
                    {sortedDates.length === 0 ? 'No date yet' : sortedDates.slice(0, 4).map(fmtChipDate).join(', ')}
                    {sortedDates.length > 4 && ` +${sortedDates.length - 4} more`}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Clock className="w-4 h-4 shrink-0 text-slate-400" /> {timeLabel}
                </p>
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                  <span className="break-words">{placeLabel || <span className="text-slate-300 dark:text-slate-600">Venue</span>}</span>
                </p>
                {description.trim() && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-line">{description.trim()}</p>
                )}
              </div>
            </div>

            {!isAdmin && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">What happens next</p>
                <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  {[
                    ['You submit', 'Any time — Wednesdays are best.'],
                    ['Elizabeth reviews', 'Usually on Thursday.'],
                    ['It’s published', 'On the calendar and in Friday’s digest.']
                  ].map(([head, sub], i) => (
                    <li key={head} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold flex items-center justify-center text-slate-600 dark:text-slate-300">{i + 1}</span>
                      <span>
                        <span className="block font-medium text-slate-800 dark:text-slate-200">{head}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{sub}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Phone: submit bar always within thumb reach */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <SubmitButton isAdmin={isAdmin} isSubmitting={isSubmitting} full />
      </div>
    </div>
  );
};

const SubmitButton: React.FC<{ isAdmin: boolean; isSubmitting: boolean; full?: boolean }> = ({ isAdmin, isSubmitting, full }) => (
  <button
    type="submit"
    form="submit-event-form"
    disabled={isSubmitting}
    className={`${full ? 'w-full' : 'shrink-0'} inline-flex items-center justify-center gap-2 h-12 px-6 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-md shadow-brand-600/20 transition-colors text-[15px] disabled:opacity-60`}
  >
    {isSubmitting ? (
      <>
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        {isAdmin ? 'Publishing…' : 'Sending…'}
      </>
    ) : (
      <>
        <Send className="w-4 h-4" />
        {isAdmin ? 'Publish event' : 'Check & submit'}
      </>
    )}
  </button>
);

export default SubmitEventPage;
