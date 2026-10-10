import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MapPin, AlertCircle } from 'lucide-react';
import { submitEvent, getPublishedEventsForSubmitters } from '../services/submissionService';
import { type User as AuthUser, UserRole, type Event } from '../types';
import MultiDatePicker from '../components/MultiDatePicker';
import SessionPlaces from '../components/SessionPlaces';
import { type TimeSlot, formatTimeRange, compareByStartTime, getSlotsForDate } from '../utils/multiDateUtils';
import { useEventSchedule } from '../hooks/useEventSchedule';
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
import PosterUpload from '../components/submit/PosterUpload';
import ContactFields from '../components/submit/ContactFields';
import SubmitButton, { SUBMIT_FORM_ID } from '../components/submit/SubmitButton';
import {
  type SavedDraft, readSavedSubmitter, saveSubmitter, readDraft, clearDraft, scheduleFromDraft, useDraftAutosave
} from '../components/submit/draft';
import { usePosterFile } from '../hooks/usePosterFile';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileHandle } from '../components/TurnstileWidget';

const CATEGORIES = EVENT_CATEGORIES;
const DESCRIPTION_SOFT_LIMIT = 600;
/** The server refuses longer descriptions (server/submission.ts) */
const DESCRIPTION_MAX = 2000;

type FieldName = 'title' | 'dates' | 'location' | 'description' | 'name' | 'email' | 'poster';

interface SubmitEventPageProps {
  onBackToLogin?: () => void;
  currentUser?: AuthUser | null;
  events?: Event[];
  /** Pre-selected date (admin adding an event from a calendar day) */
  initialDate?: Date | null;
  /** Admins: an event to copy ("Duplicate"): its details are filled in, the dates are left to pick */
  template?: Event | null;
}

const fmtChipDate = (d: Date) => formatOccurrenceLabel(d);

/** The event form for staff (sent for review) and admins (published straight away) */
const SubmitEventPage: React.FC<SubmitEventPageProps> = ({ onBackToLogin, currentUser, events = [], initialDate, template }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // No date is picked up front, except the day an admin opened the form from
  const defaultDate = useMemo(() => {
    if (!initialDate || isNaN(initialDate.getTime())) return null;
    const d = new Date(initialDate);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [initialDate]);

  // A saved draft is offered back unless the admin came here for a specific day or to duplicate
  // an event, whose details then fill the form instead (dates are left to pick)
  const [restoredDraft] = useState<SavedDraft | null>(() => {
    if (template) {
      const category = CATEGORIES.find((c) => c === template.category);
      return {
        title: template.title,
        category: category ?? CATEGORIES[0],
        dates: [],
        location: template.location,
        description: template.description,
        submitterName: template.submitterName,
        submitterEmail: template.submitterEmail
      };
    }
    return initialDate ? null : readDraft();
  });

  const [title, setTitle] = useState(restoredDraft?.title ?? '');
  const [category, setCategory] = useState<EventCategoryName>(
    restoredDraft && CATEGORIES.includes(restoredDraft.category) ? restoredDraft.category : CATEGORIES[0]
  );
  const scheduleControls = useEventSchedule(() => scheduleFromDraft(restoredDraft, defaultDate));
  const { schedule, update: updateSchedule, sessions, occurrences, activePerDate } = scheduleControls;
  const { dates: selectedDates, shared: sharedTimes, sameTime: sameTimeForAll, perDate: perDateTimes, samePlace, location, places } = schedule;
  const setLocation = (value: string) => updateSchedule({ location: value });
  const [description, setDescription] = useState(restoredDraft?.description ?? '');
  const [submitterName, setSubmitterName] = useState(() => (template && restoredDraft?.submitterName) || currentUser?.fullName || restoredDraft?.submitterName || readSavedSubmitter().name);
  const [submitterEmail, setSubmitterEmail] = useState(() => (template && restoredDraft?.submitterEmail) || currentUser?.email || restoredDraft?.submitterEmail || readSavedSubmitter().email);
  const [showDraftNotice, setShowDraftNotice] = useState(!!restoredDraft && !template);
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

  const conflictInfo = useMemo(
    () => detectOccurrenceConflicts(occurrences, getOccurrencesAroundDates(activeEvents, selectedDates)),
    [occurrences, selectedDates, activeEvents]
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
  // Duplicating: start with the original's poster (it stays shared until replaced)
  const templatePosterUrl = template?.posterUrl ?? null;
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmissionSummary | null>(null);
  // Staff see what they entered before it is sent; admins publish straight away
  const [reviewing, setReviewing] = useState(false);
  const [focusField, setFocusField] = useState<ReviewField | 'top' | null>(null);
  const placeValues = useMemo(() => (samePlace ? [] : sessions.map((s) => places[s.key] ?? '')), [samePlace, sessions, places]);
  const submitErrorRef = useRef<HTMLDivElement>(null);

  // Autosave the draft (text fields only — files can't be stored)
  const draftToSave: SavedDraft = {
    title, category, location, description,
    dates: selectedDates.map((d) => d.toISOString()),
    sharedTimes,
    sameTime: sameTimeForAll, perDateTimes,
    samePlace, places,
    submitterName, submitterEmail
  };
  useDraftAutosave(draftToSave, [title, location, description, ...placeValues].some((v) => v.trim()), !submitted);

  useEffect(() => {
    if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [submitError]);

  const clearError = (field: FieldName) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

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
    else if (description.trim().length > DESCRIPTION_MAX) next.description = `Please shorten the description to ${DESCRIPTION_MAX} characters.`;
    if (!submitterName.trim()) next.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail.trim())) next.email = 'Please enter a valid email address.';
    if (poster.busy) next.poster = 'Your PDF is still being turned into an image — one moment, then send again.';
    else if (poster.choosing) next.poster = 'Pick the page of your PDF to use as the poster (or cancel).';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const found = validate();
    setErrors(found);
    const firstInvalid = (['title', 'dates', 'location', 'description', 'poster', 'name', 'email'] as FieldName[]).find((f) => found[f]);
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
        existingPosterUrl: !posterFile && posterPreview && posterPreview === templatePosterUrl ? templatePosterUrl : null,
        publish: isAdmin,
        recurrence,
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
    poster.reset();
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
    return (
      <SubmitSuccess
        summary={submitted}
        isAdmin={isAdmin}
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

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-900">
      <SubmitTopBar onBack={onBackToLogin} backLabel={backLabel} />

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 pb-32 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:gap-10 lg:items-start">
          <div className="min-w-0">
            <SubmitIntro isAdmin={isAdmin} />

            {showDraftNotice && (
              <RestoredDraftNotice onStartFresh={handleDiscardDraft} onDismiss={() => setShowDraftNotice(false)} />
            )}

            <form id={SUBMIT_FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
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

                <CategoryPicker value={category} onChange={setCategory} />
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
                title={isAdmin ? 'Contact person' : 'Your details'}
                hint={isAdmin ? 'Shown as the contact in the digest.' : 'So Elizabeth can reach you with any questions.'}
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Published to the calendar immediately.' : 'Sent to Elizabeth for review before it’s published.'}
                </p>
                <SubmitButton isAdmin={isAdmin} isSubmitting={isSubmitting} />
              </div>
            </form>
          </div>

          {/* Sidebar: live preview + what happens next (desktop) */}
          <SubmitPreview
            isAdmin={isAdmin}
            title={title}
            category={category}
            description={description}
            posterPreview={posterPreview}
            dates={sortedDates}
            timeLabel={timeLabel}
            placeLabel={placeLabel}
          />
        </div>
      </div>

      {/* Phone: submit bar always within thumb reach */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <SubmitButton isAdmin={isAdmin} isSubmitting={isSubmitting} full />
      </div>
    </div>
  );
};

export default SubmitEventPage;
