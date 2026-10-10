import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle, MapPin, Plus, Repeat } from 'lucide-react';
import { type Event, type EventCategory, type EventStatus, UserRole } from '../../types';
import { getEventLocations } from '../../utils/recurrence';
import { detectOccurrenceConflicts, getOccurrencesAroundDates } from '../../utils/conflictDetection';
import MultiDatePicker from '../MultiDatePicker';
import SessionPlaces from '../SessionPlaces';
import PosterField from './PosterField';
import SubmitterFields from './SubmitterFields';
import RecurrenceFields from './RecurrenceFields';
import { type EventFormState, isRecurringEvent } from './useEventForm';

export const EVENT_FORM_ID = 'event-form';

interface EventFormProps {
  form: EventFormState;
  role: UserRole;
  /** The event being edited */
  event: Event | null;
  /** All events: for clashes on the picked dates and venues used before */
  events: Event[];
  isEditing: boolean;
  autoApproveOnSave: boolean;
  availableCategories: string[];
  onAddCategory: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

/** The event window's edit form */
const EventForm: React.FC<EventFormProps> = ({
  form,
  role,
  event,
  events,
  isEditing,
  autoApproveOnSave,
  availableCategories,
  onAddCategory,
  onSubmit
}) => {
  const { schedule: scheduleControls, fieldErrors, clearFieldError } = form;
  const { schedule, update: updateSchedule, sessions, occurrences } = scheduleControls;
  const { dates: selectedDates, shared: sharedTimes, sameTime: sameTimeForAll, perDate: perDateTimes, samePlace, location, places } = schedule;

  const conflictInfo = useMemo(() => {
    if (!selectedDates || selectedDates.length === 0) {
      return { hasConflict: false, conflicts: [], summaryMessage: '' };
    }
    return detectOccurrenceConflicts(occurrences, getOccurrencesAroundDates(events || [], selectedDates), event?.id);
  }, [selectedDates, occurrences, events, event?.id]);

  // Addresses used before, offered while typing a per-date address
  const knownVenues = useMemo(
    () => Array.from(new Set<string>((events || []).flatMap(getEventLocations))).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  return (
    <form id={EVENT_FORM_ID} onSubmit={onSubmit} className="space-y-5">
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
          value={form.title}
          onChange={(e) => { form.setTitle(e.target.value); clearFieldError('title'); }}
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
            value={form.category}
            onChange={(e) => form.setCategory(e.target.value as EventCategory | '')}
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
            onClick={onAddCategory}
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
              value={form.status}
              onChange={(e) => form.setStatus(e.target.value as EventStatus)}
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
          value={form.description}
          onChange={(e) => { form.setDescription(e.target.value); clearFieldError('description'); }}
          rows={3}
          className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all resize-y min-h-[80px] ${fieldErrors.description ? 'border-2 border-red-500 dark:border-red-500' : 'border border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
          placeholder="A few lines explaining what the event is about, who it's for, and key details for the Board & staff to pencil in."
        />
        {fieldErrors.description && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.description}</p>}
      </div>

      {/* 6. Poster / Flyer */}
      <PosterField poster={form.poster} title={form.title} />

      {/* 7. Submitter Details */}
      <SubmitterFields
        name={form.submitterName}
        onNameChange={form.setSubmitterName}
        email={form.submitterEmail}
        onEmailChange={form.setSubmitterEmail}
      />

      {/* 8. Recurrence */}
      <RecurrenceFields
        sessionCount={sessions.length}
        dateCount={selectedDates.length}
        type={form.recurrenceType}
        onTypeChange={form.setRecurrenceType}
        interval={form.recurrenceInterval}
        onIntervalChange={form.setRecurrenceInterval}
        endDate={form.recurrenceEndDate}
        onEndDateChange={form.setRecurrenceEndDate}
      />
    </form>
  );
};

export default EventForm;
