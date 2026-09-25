import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  MapPin, User, Mail, CheckCircle2, AlertCircle, UploadCloud, X, ArrowLeft, Send, Clock, CalendarDays,
  ImageIcon, Info, RotateCcw, Sparkles
} from 'lucide-react';
import { submitEvent, getEvents } from '../services/eventService';
import { User as AuthUser, UserRole, Event, RecurrenceRule } from '../types';
import MultiDatePicker from '../components/MultiDatePicker';
import { EVENT_CATEGORIES, EventCategoryName } from '../constants/categories';
import { detectMultiDateConflicts, getOccurrencesAroundDates } from '../utils/conflictDetection';
import { getCategoryDotColor } from '../components/WeekView';
import { formatOccurrenceLabel } from '../utils/digestGrouping';

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
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  submitterName?: string;
  submitterEmail?: string;
}

const readDraft = (): SavedDraft | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const hasContent = [parsed.title, parsed.location, parsed.description].some((v) => typeof v === 'string' && v.trim());
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

const SubmitEventPage: React.FC<SubmitEventPageProps> = ({ onBackToLogin, currentUser, events = [], initialDate }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const defaultDate = useMemo(() => {
    if (initialDate && !isNaN(initialDate.getTime())) {
      const d = new Date(initialDate);
      d.setHours(10, 0, 0, 0);
      return d;
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [initialDate]);

  // A saved draft is offered back unless the admin came here for a specific day
  const [restoredDraft] = useState<SavedDraft | null>(() => (initialDate ? null : readDraft()));

  const [title, setTitle] = useState(restoredDraft?.title ?? '');
  const [category, setCategory] = useState<EventCategoryName>(
    restoredDraft && CATEGORIES.includes(restoredDraft.category) ? restoredDraft.category : CATEGORIES[0]
  );
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    // Dates that have passed since the draft was saved are dropped
    const future = (restoredDraft?.dates || [])
      .map((s) => new Date(s))
      .filter((d) => !isNaN(d.getTime()) && d >= startOfToday);
    return future.length ? future : [defaultDate];
  });
  const [startTimeStr, setStartTimeStr] = useState(restoredDraft?.startTime || '10:00');
  const [endTimeStr, setEndTimeStr] = useState(restoredDraft?.endTime ?? '11:30');
  const [location, setLocation] = useState(restoredDraft?.location ?? '');
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
    () => detectMultiDateConflicts(selectedDates, startTimeStr, endTimeStr, getOccurrencesAroundDates(activeEvents, selectedDates)),
    [selectedDates, startTimeStr, endTimeStr, activeEvents]
  );

  // Venues used before, offered as suggestions while typing
  const knownVenues = useMemo(
    () => Array.from(new Set<string>(activeEvents.map((e) => e.location?.trim()).filter((l): l is string => !!l))).sort((a, b) => a.localeCompare(b)),
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
  const [submitted, setSubmitted] = useState<{ title: string; dates: Date[]; time: string; location: string } | null>(null);
  const submitErrorRef = useRef<HTMLDivElement>(null);

  // Autosave the draft (text fields only — files can't be stored)
  useEffect(() => {
    if (submitted) return;
    const timer = setTimeout(() => {
      try {
        const draft: SavedDraft = {
          title, category, location, description,
          dates: selectedDates.map((d) => d.toISOString()),
          startTime: startTimeStr, endTime: endTimeStr,
          submitterName, submitterEmail
        };
        if ([title, location, description].some((v) => v.trim())) {
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        }
      } catch {
        // Storage unavailable — no autosave
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, category, location, description, selectedDates, startTimeStr, endTimeStr, submitterName, submitterEmail, submitted]);

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
    else if (!startTimeStr) next.dates = 'Please choose a start time.';
    else if (endTimeStr && endTimeStr < startTimeStr) next.dates = 'The end time is before the start time.';
    if (!location.trim()) next.location = 'Where is it happening? A room or address is fine.';
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

    const [startH, startM = 0] = startTimeStr.split(':').map(Number);
    const startDateTime = new Date(sortedDates[0]);
    startDateTime.setHours(startH, startM, 0, 0);

    let endDateTime: Date | undefined;
    if (endTimeStr) {
      const [endH, endM = 0] = endTimeStr.split(':').map(Number);
      endDateTime = new Date(sortedDates[0]);
      endDateTime.setHours(endH, endM, 0, 0);
    }

    const recurrence: RecurrenceRule | undefined = sortedDates.length > 1
      ? { type: 'custom', customDates: sortedDates }
      : undefined;

    setIsSubmitting(true);
    try {
      await submitEvent({
        title: title.trim(),
        description: description.trim(),
        date: startDateTime,
        endDate: endDateTime,
        location: location.trim(),
        category,
        submitterName: submitterName.trim(),
        submitterEmail: submitterEmail.trim(),
        posterFile: posterFile || undefined,
        status: isAdmin ? 'published' : 'draft',
        recurrence
      });

      clearDraft();
      setSubmitted({
        title: title.trim(),
        dates: sortedDates,
        time: endTimeStr ? `${startTimeStr} – ${endTimeStr}` : startTimeStr,
        location: location.trim()
      });
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
      setSubmitError(message || 'The event could not be sent. Please check your connection and try again — your details are saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setCategory(CATEGORIES[0]);
    handleRemovePoster();
    setSelectedDates([defaultDate]);
    setStartTimeStr('10:00');
    setEndTimeStr('11:30');
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
  };

  const backLabel = currentUser ? 'Back to calendar' : 'Staff login';

  // --- Success screen ---------------------------------------------------------
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-6 sm:p-8 text-center border border-slate-200 dark:border-slate-700 animate-scale-in">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {isAdmin ? 'Event published' : 'Thank you — event sent!'}
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">
            {isAdmin
              ? 'It is live on the calendar and will appear in the next Upcoming Events Digest.'
              : "Elizabeth will review it shortly. Once approved it appears on the calendar and in Friday's Upcoming Events Digest."}
          </p>

          <div className="text-left rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 mb-6">
            <p className="font-semibold text-slate-900 dark:text-white">{submitted.title}</p>
            <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
              {submitted.dates.map(fmtChipDate).join(', ')}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 shrink-0 text-slate-400" /> {submitted.time}
            </p>
            <p className="mt-1 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /> {submitted.location}
            </p>
            {!isAdmin && (
              <p className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Waiting for review
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleSubmitAnother}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm"
            >
              {isAdmin ? 'Create another event' : 'Submit another event'}
            </button>
            {onBackToLogin && (
              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors text-sm"
              >
                {currentUser ? 'Back to calendar' : 'Go to staff login'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Form -------------------------------------------------------------------
  const timeLabel = endTimeStr ? `${startTimeStr} – ${endTimeStr}` : startTimeStr;
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
                      setSelectedDates(dates);
                      if (dates.length > 0) clearError('dates');
                    }}
                    startTime={startTimeStr}
                    onChangeStartTime={(t) => { setStartTimeStr(t); clearError('dates'); }}
                    endTime={endTimeStr}
                    onChangeEndTime={(t) => { setEndTimeStr(t); clearError('dates'); }}
                    error={errors.dates}
                  />
                </div>

                {conflictInfo.hasConflict && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3.5 flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200 animate-fade-in">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Something else is on at the same time</span>
                      <span className="text-xs sm:text-sm">{conflictInfo.summaryMessage} You can still submit — this is just a heads-up.</span>
                    </div>
                  </div>
                )}
              </Section>

              {/* 3. Where & details */}
              <Section step={3} title="Where, and what’s it about?">
                <div>
                  <label htmlFor="field-location" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Venue / location <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
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

                <div>
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
                  <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>
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
                  <span className="break-words">{location.trim() || <span className="text-slate-300 dark:text-slate-600">Venue</span>}</span>
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
        {isAdmin ? 'Publish event' : 'Submit for review'}
      </>
    )}
  </button>
);

export default SubmitEventPage;
