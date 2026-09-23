import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MapPin, User, Mail, CheckCircle2, AlertCircle, Upload, X, ArrowLeft } from 'lucide-react';
import { submitEvent, getEvents } from '../services/eventService';
import { User as AuthUser, UserRole, Event, RecurrenceRule } from '../types';
import MultiDatePicker from '../components/MultiDatePicker';
import { EVENT_CATEGORIES, EventCategoryName } from '../constants/categories';
import { detectMultiDateConflicts } from '../utils/conflictDetection';

const CATEGORIES = EVENT_CATEGORIES;

interface SubmitEventPageProps {
  onBackToLogin?: () => void;
  currentUser?: AuthUser | null;
  events?: Event[];
}

const SubmitEventPage: React.FC<SubmitEventPageProps> = ({ onBackToLogin, currentUser, events = [] }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategoryName>(CATEGORIES[0]);

  const [activeEvents, setActiveEvents] = useState<Event[]>(events || []);

  useEffect(() => {
    if (events && events.length > 0) {
      setActiveEvents(events);
    } else {
      let isMounted = true;
      getEvents()
        .then((fetched) => {
          if (isMounted && fetched && fetched.length > 0) {
            setActiveEvents(fetched);
          }
        })
        .catch((err) => {
          console.warn('Failed to load events for conflict detection in SubmitEventPage:', err);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [events]);

  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  }, []);

  const [selectedDates, setSelectedDates] = useState<Date[]>([defaultDate]);
  const [startTimeStr, setStartTimeStr] = useState('10:00');
  const [endTimeStr, setEndTimeStr] = useState('11:30');
  const [dateError, setDateError] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitterName, setSubmitterName] = useState(currentUser?.fullName || '');
  const [submitterEmail, setSubmitterEmail] = useState(currentUser?.email || '');

  const conflictInfo = useMemo(() => {
    return detectMultiDateConflicts(selectedDates, startTimeStr, endTimeStr, activeEvents);
  }, [selectedDates, startTimeStr, endTimeStr, activeEvents]);

  // Poster state
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (PNG, JPG, or WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image size must be under 10MB.');
      return;
    }

    setPosterFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPosterPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMsg(null);
  };

  const handleRemovePoster = () => {
    setPosterFile(null);
    setPosterPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setDateError(undefined);

    // Basic validation
    if (!title.trim()) {
      setErrorMsg('Please enter an event title.');
      return;
    }
    if (!selectedDates || selectedDates.length === 0) {
      const msg = 'Please select at least one date for the event.';
      setErrorMsg(msg);
      setDateError(msg);
      return;
    }
    if (!startTimeStr) {
      const msg = 'Please select a start time.';
      setErrorMsg(msg);
      setDateError(msg);
      return;
    }

    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const [startH, startM = 0] = startTimeStr.split(':').map(Number);
    const startDateTime = new Date(sortedDates[0]);
    startDateTime.setHours(startH, startM, 0, 0);

    if (isNaN(startDateTime.getTime())) {
      setErrorMsg('Invalid start date or time.');
      return;
    }

    let endDateTime: Date | undefined = undefined;
    if (endTimeStr) {
      const [endH, endM = 0] = endTimeStr.split(':').map(Number);
      const end = new Date(sortedDates[0]);
      end.setHours(endH, endM, 0, 0);
      if (isNaN(end.getTime())) {
        setErrorMsg('Invalid end date or time.');
        return;
      }
      if (end < startDateTime) {
        setErrorMsg('End time cannot be earlier than start time.');
        return;
      }
      endDateTime = end;
    }

    if (!location.trim()) {
      setErrorMsg('Please specify the venue/location.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please provide a brief description (a few lines).');
      return;
    }
    if (!submitterName.trim()) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (!submitterEmail.trim() || !submitterEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    let recurrence: RecurrenceRule | undefined = undefined;
    if (sortedDates.length > 1) {
      recurrence = {
        type: 'custom',
        customDates: sortedDates
      };
    }

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

      setSubmittedTitle(title.trim());
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMsg(err?.message || 'Failed to submit event. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    handleRemovePoster();
    setSelectedDates([defaultDate]);
    setStartTimeStr('10:00');
    setEndTimeStr('11:30');
    setDateError(undefined);
    setSubmittedTitle(null);
    setErrorMsg(null);
  };

  // Success Screen
  if (submittedTitle) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center border border-slate-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {isAdmin ? 'Event Created & Published!' : 'Event Submitted!'}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">
            {isAdmin ? (
              <>
                Great! <span className="font-semibold text-slate-900 dark:text-white">{submitterName}</span>, your event <span className="font-semibold text-brand-600 dark:text-brand-400">"{submittedTitle}"</span> has been published directly to the calendar.
              </>
            ) : (
              <>
                Thank you, <span className="font-semibold text-slate-900 dark:text-white">{submitterName}</span>. Your event <span className="font-semibold text-brand-600 dark:text-brand-400">"{submittedTitle}"</span> has been sent for Elizabeth's review.
              </>
            )}
          </p>

          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 mb-6 text-left space-y-1.5 border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isAdmin ? 'bg-emerald-500' : 'bg-green-500'}`}></span>
              <span>{isAdmin ? 'Status: Published & visible on calendar' : "Review: Pending Elizabeth's review"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Upcoming Events Digest: Scheduled for Friday morning release</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleReset}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl shadow-sm transition-colors text-sm"
            >
              {isAdmin ? 'Create Another Event' : 'Submit Another Event'}
            </button>
            {onBackToLogin && (
              <button
                onClick={onBackToLogin}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors text-sm"
              >
                {currentUser ? 'Back to Calendar' : 'Go to Staff Login / Calendar'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Navigation & Header */}
        <div className="mb-6 flex items-center justify-between">
          {onBackToLogin && (
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {currentUser ? 'Back to Calendar' : 'Staff Login'}
            </button>
          )}
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wider ml-auto">
            {isAdmin ? 'Admin Event Form' : 'Staff Event Form'}
          </span>
        </div>

        {/* Brand Card Header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-4">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs flex-shrink-0">
              <img
                src="/assets/ccp-logo.png"
                alt="Cork City Partnership"
                className="h-12 sm:h-14 w-auto max-w-[240px] object-contain"
                onError={(e) => {
                  // Fallback if logo fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Upcoming Events Submission
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Submissions for the Upcoming Events Digest (circulated every Friday to the Board & staff).
              </p>
            </div>
          </div>

          <div className="bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900/50 rounded-xl p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
            <p className="font-semibold text-brand-700 dark:text-brand-300 mb-1">
              📌 Wednesday Event Roundup:
            </p>
            <p>
              Please submit details of any upcoming meetings, courses, family fun days, Lord Mayor visits, or info sessions happening over the next two weeks. Elizabeth will review and prepare the official bulletin.
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-6">
          {/* 1. Title */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Event Name / Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Enterprise Network Breakfast, Community Family Day"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
          </div>

          {/* 2. Category */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Category <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategoryName)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm appearance-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                ▼
              </div>
            </div>
          </div>

          {/* 3. Date & Time */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Event Date(s) & Time <span className="text-red-500">*</span>
            </label>
            <MultiDatePicker
              selectedDates={selectedDates}
              onChangeDates={(dates) => {
                setSelectedDates(dates);
                if (dates.length > 0) setDateError(undefined);
              }}
              startTime={startTimeStr}
              onChangeStartTime={setStartTimeStr}
              endTime={endTimeStr}
              onChangeEndTime={setEndTimeStr}
              error={dateError}
            />
          </div>

          {/* Schedule Conflict Notice */}
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
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Location / Venue <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Heron House, Room 4 / Mahon Community Centre"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          {/* 5. Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Short Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A few lines explaining what the event is about, who it's for, and key details for the Board & staff to pencil in."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-y"
            />
          </div>

          {/* 6. Poster / Flyer Upload */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              Poster / Flyer Image <span className="text-slate-400 font-normal">(optional)</span>
            </label>

            {posterPreview ? (
              <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 p-2 flex items-center gap-4">
                <img
                  src={posterPreview}
                  alt="Poster preview"
                  className="w-20 h-20 object-cover rounded-lg border border-slate-300 dark:border-slate-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    {posterFile?.name || 'Uploaded flyer'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {(posterFile ? (posterFile.size / 1024).toFixed(0) : '0')} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePoster}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Remove image"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-400 rounded-xl p-6 text-center transition-colors bg-slate-50/50 dark:bg-slate-800/50"
              >
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Click or drag and drop to upload flyer / poster
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  PNG, JPG or WEBP up to 10MB
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Submitter Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                    placeholder="e.g. Sarah Murphy"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                  />
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Your Work Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={submitterEmail}
                    onChange={(e) => setSubmitterEmail(e.target.value)}
                    placeholder="e.g. sarah@partnershipcork.ie"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-6 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Submitting Event...</span>
                </>
              ) : (
                <>
                  <span>Submit Event for Review</span>
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-400 mt-2">
              This event will be added to the pending queue for Elizabeth's review before publication.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitEventPage;
