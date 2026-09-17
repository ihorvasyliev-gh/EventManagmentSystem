import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Event, UserRole, EventCategory, EventStatus, Attachment, EventComment, EventHistoryEntry, EventCategoryItem } from '../types';
import { X, MapPin, Clock, Calendar as CalendarIcon, Download, Upload, Loader2, Pencil, Tag, Users, CheckCircle, XCircle, Trash2, Plus, ChevronDown, ExternalLink, User, Mail, AlertCircle } from 'lucide-react';
import { formatDate, formatTime, isSameDay } from '../utils/date';
import { uploadPosterToR2, uploadAttachment, addComment, deleteComment, fetchEventDetails, deleteEvent, deleteRecurrenceInstance } from '../services/eventService';
import { rsvpToEvent, cancelRsvp, hasUserRsvped } from '../services/rsvpService';
import { getCategories, createCategory } from '../services/categoryService';
import EventComments from './EventComments';
import EventHistory from './EventHistory';
import { validateEvent } from '../utils/validation';
import { useTheme } from '../contexts/ThemeContext';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import LazyImage from './LazyImage';
import DatePickerCalendar from './DatePickerCalendar';
import TimePickerInput from './TimePickerInput';
import { EVENT_CATEGORIES } from '../constants/categories';
import { supabase } from '../lib/supabase';
import { detectConflicts, formatConflictMessage } from '../utils/conflictDetection';

// Convert "HH:mm" to minutes
const timeToMinutes = (t: string): number => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

// Convert minutes to "HH:mm"
const minutesToTime = (totalMinutes: number): string => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null; // If null, we are in "Create Mode"
  events?: Event[];
  initialDate?: Date | null; // Pre-fill date when creating from calendar day plus
  role: UserRole;
  currentUserId?: string;
  currentUserName?: string;
  onSave?: (eventData: Omit<Event, 'id' | 'createdAt'>) => Promise<void>;
  onUpdate?: (id: string, eventData: Omit<Event, 'id' | 'createdAt'>) => Promise<void>;
  onEventUpdate?: (event: Event) => void; // For RSVP and comment updates
  onDelete?: (id: string) => Promise<void>; // For event deletion
  onDeleteInstance?: (eventId: string, instanceDate: Date) => Promise<void>; // For instance deletion
  initialMode?: 'view' | 'edit';
  autoApproveOnSave?: boolean;
}

const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  events = [],
  initialDate,
  role,
  currentUserId = '1',
  currentUserName = 'User',
  onSave,
  onUpdate,
  onEventUpdate,
  onDelete,
  onDeleteInstance,
  initialMode = 'view',
  autoApproveOnSave = false
}) => {
  const { theme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [isRsvping, setIsRsvping] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('10:00');
  const [endDateStr, setEndDateStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('11:30');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [status, setStatus] = useState<EventStatus>('published');
  const [tags, setTags] = useState<string>('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [rsvpEnabled, setRsvpEnabled] = useState(false);
  const [maxAttendees, setMaxAttendees] = useState<number | ''>('');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  // Lazy loaded states
  const [comments, setComments] = useState<EventComment[]>([]);
  const [history, setHistory] = useState<EventHistoryEntry[]>([]);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeNames, setAttendeeNames] = useState<{ userId: string; userName: string }[]>([]);

  const [userHasRsvped, setUserHasRsvped] = useState(false);

  // Categories State
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);

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
  const [customDates, setCustomDates] = useState<Date[]>([]);

  // Inline validation errors (field id -> message)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Auto-synchronize dates & times
  const handleStartDateChange = (newDate: string) => {
    setStartDateStr(newDate);
    setEndDateStr(newDate);
    clearFieldError('date');
  };

  const handleStartTimeChange = (newTime: string) => {
    const prevStartM = timeToMinutes(startTimeStr);
    const prevEndM = timeToMinutes(endTimeStr);
    let duration = prevEndM - prevStartM;
    if (duration <= 0) duration = 90; // default 1.5 hours

    setStartTimeStr(newTime);
    clearFieldError('date');

    if (startDateStr === endDateStr) {
      const newStartM = timeToMinutes(newTime);
      setEndTimeStr(minutesToTime(newStartM + duration));
    }
  };

  const handleEndDateChange = (newDate: string) => {
    setEndDateStr(newDate);
    clearFieldError('endDate');
  };

  const handleEndTimeChange = (newTime: string) => {
    setEndTimeStr(newTime);
    clearFieldError('endDate');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(isOpen, onClose, modalPanelRef);

  // Determine if we are creating a new event from scratch
  const isCreating = !event;
  // Show form if we are creating OR editing
  const showForm = isCreating || isEditing;

  const conflictInfo = useMemo(() => {
    if (!startDateStr || !startTimeStr || !isOpen || !showForm) {
      return { hasConflict: false, conflictingEvents: [] };
    }
    const start = new Date(`${startDateStr}T${startTimeStr}:00`);
    if (isNaN(start.getTime())) {
      return { hasConflict: false, conflictingEvents: [] };
    }
    const partialEvent: Partial<Event> = {
      date: start,
      location: location.trim() || undefined
    };
    return detectConflicts(partialEvent, events || [], event?.id);
  }, [startDateStr, startTimeStr, location, isOpen, showForm, events, event?.id]);

  const hasInteractedWithRsvp = useRef(false);
  const prevEventId = useRef<string | null>(null);

  // Initialize form state when opening or switching modes
  useEffect(() => {
    if (isOpen) {
      if (event) {
        // We have an event (View/Edit mode)

        // Only reset interaction flag if we are viewing a different event or occurrence
        const instanceKey = event.instanceKey ?? event.id;
        if (instanceKey !== prevEventId.current) {
          hasInteractedWithRsvp.current = false;
          prevEventId.current = instanceKey;
        }

        setTitle(event.title);
        setDescription(event.description);
        setLocation(event.location);
        setCategory(event.category || '');
        setStatus(autoApproveOnSave ? 'published' : (event.status || 'published'));
        setTags(event.tags?.join(', ') || '');
        setSubmitterName(event.submitterName || '');
        setSubmitterEmail(event.submitterEmail || '');
        setRsvpEnabled(event.rsvpEnabled || false);
        setMaxAttendees(event.maxAttendees || '');
        setPreviewUrl(event.posterUrl || null);

        // Initial values from props (might be incomplete if lazy loaded)
        setAttachments(event.attachments || []);
        setComments(event.comments || []);
        setHistory(event.history || []);
        setAttendees(event.attendees || []);
        setAttendeeNames(event.attendeeNames || []);

        if (!hasInteractedWithRsvp.current) {
          setUserHasRsvped(event.attendees?.includes(currentUserId) || false);
        }

        // Format Start Date for Input (YYYY-MM-DD)
        const yyyy = event.date.getFullYear();
        const mm = String(event.date.getMonth() + 1).padStart(2, '0');
        const dd = String(event.date.getDate()).padStart(2, '0');
        const sDate = `${yyyy}-${mm}-${dd}`;
        setStartDateStr(sDate);

        // Format Start Time for Input (HH:MM)
        const hh = String(event.date.getHours()).padStart(2, '0');
        const min = String(event.date.getMinutes()).padStart(2, '0');
        setStartTimeStr(`${hh}:${min}`);

        // Format End Date & Time
        if (event.endDate) {
          const endYyyy = event.endDate.getFullYear();
          const endMm = String(event.endDate.getMonth() + 1).padStart(2, '0');
          const endDd = String(event.endDate.getDate()).padStart(2, '0');
          setEndDateStr(`${endYyyy}-${endMm}-${endDd}`);

          const endHh = String(event.endDate.getHours()).padStart(2, '0');
          const endMin = String(event.endDate.getMinutes()).padStart(2, '0');
          setEndTimeStr(`${endHh}:${endMin}`);
        } else {
          setEndDateStr(sDate);
          const startM = event.date.getHours() * 60 + event.date.getMinutes();
          setEndTimeStr(minutesToTime(startM + 90));
        }

        setPosterFile(null);
        setNewAttachments([]);

        // Load Recurrence Data
        if (event.recurrence) {
          setRecurrenceType(event.recurrence.type as any);
          setRecurrenceInterval(event.recurrence.interval || 1);
          setRecurrenceEndDate(event.recurrence.endDate ? event.recurrence.endDate.toISOString().split('T')[0] : '');
          setCustomDates(event.recurrence.customDates ? event.recurrence.customDates.map(d => new Date(d)) : []);
        } else {
          setRecurrenceType('none');
          setRecurrenceInterval(1);
          setRecurrenceEndDate('');
          setCustomDates([]);
        }

        setIsEditing(initialMode === 'edit');
        setFieldErrors({});

        // LAZY LOAD: If details are missing, fetch them in background (no loading state)
        const needsLoading = !event.comments || !event.history || !event.attachments || !event.attendees || (!event.attendeeNames && role === UserRole.ADMIN);

        let isActive = true;

        if (needsLoading) {
          fetchEventDetails(event.id, event.date).then(details => {
            if (!isActive) return;

            if (details.attachments) setAttachments(details.attachments);
            if (details.comments) setComments(details.comments);
            if (details.history) setHistory(details.history);
            if (details.attendees) {
              setAttendees(details.attendees);
              if (details.attendeeNames) setAttendeeNames(details.attendeeNames);
              if (!hasInteractedWithRsvp.current) {
                setUserHasRsvped(details.attendees.includes(currentUserId));
              }
            }
          }).catch(err => {
            console.error('Failed to lazy load event details:', err);
          });
        }

        return () => {
          isActive = false;
        };
      } else {
        // We are creating a new event
        setTitle('');
        setDescription('');
        setLocation('');
        setCategory('');
        setStatus('published');
        setTags('');
        setSubmitterName('');
        setSubmitterEmail('');
        setRsvpEnabled(false);
        setMaxAttendees('');
        setPreviewUrl(null);
        setPosterFile(null);

        // Auto-select date & time
        const baseDate = initialDate ? new Date(initialDate) : new Date();
        const yyyy = baseDate.getFullYear();
        const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
        const dd = String(baseDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        setStartDateStr(dateStr);
        setEndDateStr(dateStr);

        let sTime = '10:00';
        let eTime = '11:30';

        if (!initialDate) {
          const now = new Date();
          const nextHour = now.getHours() + 1;
          const clampedHour = Math.min(Math.max(nextHour, 8), 20);
          sTime = `${String(clampedHour).padStart(2, '0')}:00`;
          eTime = `${String(Math.min(clampedHour + 1, 23)).padStart(2, '0')}:30`;
        }

        setStartTimeStr(sTime);
        setEndTimeStr(eTime);

        setAttachments([]);
        setNewAttachments([]);
        setComments([]);
        setHistory([]);
        setAttendees([]);
        setAttendeeNames([]);
        setUserHasRsvped(false);
        setIsEditing(false);
        setRecurrenceType('none');
        setRecurrenceInterval(1);
        setRecurrenceEndDate('');
        setCustomDates([]);
        setFieldErrors({});
      }
    }
  }, [isOpen, event, initialDate, currentUserId, currentUserName, initialMode, autoApproveOnSave]);

  if (!isOpen) return null;

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name');
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
      alert(err.message || 'Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, or WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be under 10MB.');
      return;
    }

    setPosterFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePoster = () => {
    setPosterFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setFieldErrors(prev => ({ ...prev, title: 'Please enter an event title.' }));
      return;
    }
    if (!startDateStr || !startTimeStr) {
      setFieldErrors(prev => ({ ...prev, date: 'Please select a start date and time.' }));
      return;
    }

    const startDateTime = new Date(`${startDateStr}T${startTimeStr}`);
    if (isNaN(startDateTime.getTime())) {
      setFieldErrors(prev => ({ ...prev, date: 'Invalid start date or time.' }));
      return;
    }

    let endDateTime: Date | undefined = undefined;
    if (endDateStr && endTimeStr) {
      endDateTime = new Date(`${endDateStr}T${endTimeStr}`);
      if (isNaN(endDateTime.getTime())) {
        setFieldErrors(prev => ({ ...prev, endDate: 'Invalid end date or time.' }));
        return;
      }
      if (endDateTime < startDateTime) {
        setFieldErrors(prev => ({ ...prev, endDate: 'End Date & Time cannot be earlier than Start Date & Time.' }));
        return;
      }
    }

    if (!location.trim()) {
      setFieldErrors(prev => ({ ...prev, location: 'Please specify the venue/location.' }));
      return;
    }
    if (!description.trim()) {
      setFieldErrors(prev => ({ ...prev, description: 'Please provide a description.' }));
      return;
    }

    const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const eventDataToValidate = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      date: startDateTime,
      endDate: endDateTime,
      category: category || undefined,
      status: status || 'published',
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      rsvpEnabled,
      maxAttendees: maxAttendees ? Number(maxAttendees) : undefined,
      recurrence: recurrenceType !== 'none' ? {
        type: recurrenceType,
        interval: recurrenceType !== 'custom' ? recurrenceInterval : undefined,
        endDate: recurrenceType !== 'custom' && recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
        customDates: recurrenceType === 'custom' ? customDates : undefined,
      } : undefined
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

      // Upload to R2 or Supabase storage if a new file is selected
      if (posterFile) {
        try {
          finalPosterUrl = await uploadPosterToR2(posterFile);
        } catch (r2Err) {
          // Fallback to Supabase Storage bucket 'event-attachments'
          const fileExt = posterFile.name.split('.').pop() || 'jpg';
          const fileName = `posters/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('event-attachments')
            .upload(fileName, posterFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (!uploadError && uploadData) {
            const { data: publicUrlData } = supabase.storage
              .from('event-attachments')
              .getPublicUrl(fileName);
            finalPosterUrl = publicUrlData.publicUrl;
          } else {
            console.warn('Poster upload skipped:', uploadError || r2Err);
          }
        }
      }

      // If user removed the poster, finalPosterUrl is undefined
      if (!previewUrl && !posterFile) {
        finalPosterUrl = undefined;
      }

      // Upload new attachments
      const uploadedAttachments: Attachment[] = [];
      if (newAttachments.length > 0) {
        for (const file of newAttachments) {
          const attachment = await uploadAttachment(file) as Attachment;
          uploadedAttachments.push(attachment);
        }
      }

      const fullEventData = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        date: startDateTime,
        endDate: endDateTime,
        posterUrl: finalPosterUrl,
        category: category || undefined,
        status: autoApproveOnSave ? 'published' : (status || 'published'),
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        submitterName: submitterName.trim() || undefined,
        submitterEmail: submitterEmail.trim() || undefined,
        rsvpEnabled,
        maxAttendees: maxAttendees ? Number(maxAttendees) : undefined,
        attachments: [...attachments, ...uploadedAttachments],
        creatorId: event?.creatorId || currentUserId,
        recurrence: recurrenceType !== 'none' ? {
          type: recurrenceType,
          interval: recurrenceType !== 'custom' ? recurrenceInterval : undefined,
          endDate: recurrenceType !== 'custom' && recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
          customDates: recurrenceType === 'custom' ? customDates : undefined,
        } : undefined
      };

      if (isCreating && onSave) {
        await onSave(fullEventData);
      } else if (isEditing && event && onUpdate) {
        await onUpdate(event.id, fullEventData);
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRsvp = async () => {
    if (!event) return;
    hasInteractedWithRsvp.current = true;

    // Optimistic update: update UI immediately
    const wasRsvped = userHasRsvped;
    const previousAttendees = [...(attendees || [])];

    // Update local state immediately
    if (wasRsvped) {
      setUserHasRsvped(false);
      const newAttendees = attendees.filter(id => id !== currentUserId);
      setAttendees(newAttendees);
      if (onEventUpdate && event) {
        const updatedEvent = { ...event, attendees: newAttendees };
        onEventUpdate(updatedEvent);
      }
    } else {
      setUserHasRsvped(true);
      const newAttendees = [...attendees, currentUserId];
      setAttendees(newAttendees);
      if (onEventUpdate && event) {
        const updatedEvent = { ...event, attendees: newAttendees };
        onEventUpdate(updatedEvent);
      }
    }

    // Sync with server in background (no loading state); per-occurrence for recurring
    try {
      if (wasRsvped) {
        await cancelRsvp(event.id, currentUserId, event.date);
      } else {
        await rsvpToEvent(event.id, currentUserId, currentUserName, event.date);
      }
    } catch (err) {
      console.error('Failed to sync RSVP with server:', err);
      // Rollback optimistic update on error
      setUserHasRsvped(wasRsvped);
      setAttendees(previousAttendees);
      if (onEventUpdate && event) {
        const updatedEvent = { ...event, attendees: previousAttendees };
        onEventUpdate(updatedEvent);
      }
      // Show error toast (non-blocking)
      alert('Failed to update RSVP. Please try again.');
    }
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setNewAttachments(prev => [...prev, ...files]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewAttachment = (index: number) => {
    setNewAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddComment = async (content: string) => {
    if (!event) return;

    const occurrenceDate = event.date;
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticComment: EventComment = {
      id: tempId,
      eventId: event.id,
      occurrenceDate,
      userId: currentUserId,
      userName: currentUserName,
      content: content,
      createdAt: new Date()
    };

    setComments(prev => [...prev, optimisticComment]);
    if (onEventUpdate) {
      const updatedEvent = { ...event, comments: [...(event.comments || []), optimisticComment] };
      onEventUpdate(updatedEvent);
    }

    try {
      const serverComment = await addComment(event.id, currentUserId, currentUserName, content, occurrenceDate);
      // Replace temporary comment with server response
      setComments(prev => prev.map(c => c.id === tempId ? serverComment : c));
      if (onEventUpdate) {
        const updatedEvent = {
          ...event,
          comments: (event.comments || []).map(c => c.id === tempId ? serverComment : c)
        };
        onEventUpdate(updatedEvent);
      }
    } catch (err) {
      console.error('Failed to sync comment with server:', err);
      // Rollback optimistic update on error
      setComments(prev => prev.filter(c => c.id !== tempId));
      if (onEventUpdate) {
        const updatedEvent = {
          ...event,
          comments: (event.comments || []).filter(c => c.id !== tempId)
        };
        onEventUpdate(updatedEvent);
      }
      throw err; // Re-throw to show error in UI
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      await deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      if (onEventUpdate && event) {
        const updatedEvent = { ...event, comments: (event.comments || []).filter(c => c.id !== commentId) };
        onEventUpdate(updatedEvent);
      }
    } catch (error) {
      console.error('Failed to delete comment', error);
      alert('Failed to delete comment');
    }
  };

  const getCalendarLinks = () => {
    if (!event) return null;

    const title = encodeURIComponent(event.title || '');
    const description = encodeURIComponent(event.description || '');
    const location = encodeURIComponent(event.location || '');

    // Format dates (UTC)
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const start = formatDate(event.date);
    const end = formatDate(new Date(event.date.getTime() + 60 * 60 * 1000)); // 1 hour default

    return {
      google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${description}&location=${location}`,
      outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&body=${description}&location=${location}&startdt=${event.date.toISOString()}&enddt=${new Date(event.date.getTime() + 60 * 60 * 1000).toISOString()}`,
      office365: `https://outlook.office.com/calendar/0/deeplink/compose?subject=${title}&body=${description}&location=${location}&startdt=${event.date.toISOString()}&enddt=${new Date(event.date.getTime() + 60 * 60 * 1000).toISOString()}`,
    };
  };

  const handleDownloadIcs = () => {
    if (!event) return;

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const escapeICS = (str: string) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
    };

    const startDate = formatDate(event.date);
    const endDate = formatDate(new Date(event.date.getTime() + 60 * 60 * 1000));

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CCP Flow/Calendar//EN',
      'BEGIN:VEVENT',
      `UID:${event.id || Date.now()}@ccpflow.com`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDate}`,
      `SUMMARY:${escapeICS(event.title || '')}`,
      `DESCRIPTION:${escapeICS(event.description || '')}`,
      `LOCATION:${escapeICS(event.location || '')}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${(event.title || 'event').replace(/[^a-z0-9]/gi, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowCalendarDropdown(false);
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
      alert('Failed to delete event. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-0 px-0 pb-0 text-center sm:flex sm:items-center sm:p-0 sm:pt-4 sm:px-4 sm:pb-20">

        {/* Transparent Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-fade-in" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal Panel - Full Screen on Mobile */}
        <div ref={modalPanelRef} className={`relative flex flex-col rounded-none sm:rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] border-t sm:border border-white/20 animate-scale-in ${theme === 'dark' ? 'glass-panel-dark' : 'bg-white'}`}>

          {/* Header */}
          <div className="px-4 sm:px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0 z-10 bg-white dark:bg-slate-900">
            <h3 className={`text-base sm:text-lg font-semibold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`} id="modal-title">
              {isCreating ? 'Create New Event' : (isEditing ? 'Edit Event' : 'Event Details')}
            </h3>
            <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1.5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">

            {/* VIEW MODE */}
            {!showForm && event ? (
              <div className="space-y-6">
                {/* Header Info */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {event.status === 'draft' && <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">Draft</span>}
                    {event.category && (
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        event.category === 'Enterprise & Employment' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' :
                        event.category === 'Community & Family' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' :
                        event.category === 'Education & Training' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                        event.category === 'Special Visits & Celebrations' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' :
                        event.category === 'Public Information Session' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100' :
                        event.category === 'Health & Wellbeing' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {event.category}
                      </span>
                    )}
                    {(event.submitterName || event.submitterEmail) && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{event.submitterName || 'Staff Member'}</span>
                        {event.submitterEmail && <span className="text-slate-400 text-[11px]">({event.submitterEmail})</span>}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-start gap-4">
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      {event.title}
                    </h2>
                    {role === UserRole.ADMIN && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditing(true)}
                          className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                          title="Edit Event"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleDeleteClick}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                          title="Delete Event"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Poster & Attachments */}
                {(event.posterUrl || (event.attachments && event.attachments.length > 0)) && (
                  <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
                    {event.posterUrl && (
                      <div className="relative group">
                        <LazyImage
                          src={event.posterUrl}
                          alt={event.title}
                          className="w-full h-56"
                        />
                        <a href={event.posterUrl} download className="absolute bottom-3 right-3 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all text-slate-700 dark:text-slate-200 hover:scale-105">
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                    {event.attachments && event.attachments.length > 0 && (
                      <div className={`p-4 ${event.posterUrl ? 'border-t border-slate-100 dark:border-slate-800' : ''} bg-slate-50/50 dark:bg-slate-800/30`}>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attachments</h4>
                        <div className="grid gap-2">
                          {event.attachments.map((att, idx) => (
                            <a key={idx} href={att.url} download={att.name} className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 hover:border-brand-200 transition-colors group">
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
                              <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <CalendarIcon className="h-5 w-5 mr-3 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Date & Time</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 break-words">
                        {event.endDate && !isSameDay(event.date, event.endDate) ? (
                          <>
                            <span>{formatDate(event.date)} at {formatTime(event.date)}</span>
                            <span className="text-slate-400 dark:text-slate-500 mx-1.5 font-bold">→</span>
                            <span>{formatDate(event.endDate)} at {formatTime(event.endDate)}</span>
                          </>
                        ) : event.endDate ? (
                          <>
                            {formatDate(event.date)}, {formatTime(event.date)} – {formatTime(event.endDate)}
                          </>
                        ) : (
                          <>
                            {formatDate(event.date)} at {formatTime(event.date)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <MapPin className="h-5 w-5 mr-3 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Location</p>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 break-words block">
                        {event.location}
                      </a>
                    </div>
                  </div>
                </div>

                {event.tags && event.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {event.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        <Tag className="w-3 h-3 mr-1.5 opacity-50" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300">
                  <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
                </div>

                {/* RSVP Section */}
                {event.rsvpEnabled && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" /> RSVP Status
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {attendees.length} {event.maxAttendees ? `/ ${event.maxAttendees}` : ''} attending
                        </p>
                      </div>
                      <button
                        onClick={handleRsvp}
                        disabled={isRsvping || (event.maxAttendees && attendees.length >= event.maxAttendees && !userHasRsvped)}
                        className={`px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm font-bold rounded-lg transition-all active:scale-95 ${userHasRsvped
                          ? 'bg-white text-red-600 border border-red-100 hover:bg-red-50'
                          : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isRsvping ? <Loader2 className="h-4 w-4 animate-spin" /> : userHasRsvped ? 'Cancel RSVP' : 'Join Event'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Admin: Show Attendee Names */}
                {role === UserRole.ADMIN && attendeeNames.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Attendee List</h4>
                    <div className="flex flex-wrap gap-2">
                      {attendeeNames.map((attendee, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-sm">
                          {attendee.userName || 'Unknown User'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <button
                    onClick={() => setShowCalendarDropdown(!showCalendarDropdown)}
                    className="w-full py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    Add to Calendar
                    <ChevronDown className={`h-4 w-4 transition-transform ${showCalendarDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showCalendarDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowCalendarDropdown(false)} />
                      <div className="absolute bottom-full left-0 right-0 mb-2 p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 z-20 animate-scale-in origin-bottom">
                        <a
                          href={getCalendarLinks()?.office365}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
                        >
                          <span className="flex-1 font-medium">Office 365</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                        </a>
                        <a
                          href={getCalendarLinks()?.outlook}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
                        >
                          <span className="flex-1">Outlook.com</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                        </a>
                        <a
                          href={getCalendarLinks()?.google}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group"
                        >
                          <span className="flex-1">Google Calendar</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                        </a>
                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                        <button
                          onClick={handleDownloadIcs}
                          className="flex items-center w-full px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors group text-left"
                        >
                          <span className="flex-1">Download .ics File</span>
                          <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-500" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <EventComments
                  comments={comments}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                />
                {history.length > 0 && <EventHistory history={history} />}
              </div>
            ) : (
              // FORM MODE
              <form id="event-form" onSubmit={handleSubmit} className="space-y-5">
                {autoApproveOnSave && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-3.5 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Saving your edits will automatically approve and publish this submission to the calendar.</span>
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
                    className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all font-medium placeholder-slate-400 min-h-[44px] sm:min-h-0 ${fieldErrors.title ? 'border-2 border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                    placeholder="e.g. Enterprise Network Breakfast, Community Family Day"
                  />
                  {fieldErrors.title && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.title}</p>}
                </div>

                {/* 2. Category & Status */}
                <div className={`grid gap-4 ${role === UserRole.ADMIN ? 'grid-cols-1 sm:grid-cols-[1fr_auto_1fr]' : 'grid-cols-1 sm:grid-cols-[1fr_auto]'}`}>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value as EventCategory | '')}
                      className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all min-h-[44px] sm:min-h-0"
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
                      className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border transition-all focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      title="Add new category"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {role === UserRole.ADMIN && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as EventStatus)}
                        className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all min-h-[44px] sm:min-h-0"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 3. Start & End Date / Time */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      Start Date & Time <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        required
                        type="date"
                        value={startDateStr}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 [color-scheme:light] dark:[color-scheme:dark] ${fieldErrors.date ? 'border-2 border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                      />
                      <TimePickerInput
                        required
                        value={startTimeStr}
                        onChange={handleStartTimeChange}
                        className="!rounded-lg !pl-3 !pr-9 !py-2.5 sm:!py-2 min-h-[44px] sm:min-h-0 text-sm border-slate-200 dark:border-slate-700 dark:!bg-slate-800 focus:border-brand-500"
                        placeholder="10:00"
                      />
                    </div>
                    {fieldErrors.date && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.date}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                        End Date & Time <span className="text-slate-400 font-normal lowercase">(optional)</span>
                      </label>
                      {startDateStr && endDateStr && startDateStr === endDateStr && (
                        <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded">
                          Same day
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        min={startDateStr}
                        value={endDateStr}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        className="block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 [color-scheme:light] dark:[color-scheme:dark] border-slate-200 dark:border-slate-700 focus:border-brand-500"
                      />
                      <TimePickerInput
                        value={endTimeStr}
                        onChange={handleEndTimeChange}
                        referenceStartTime={startDateStr === endDateStr ? startTimeStr : undefined}
                        className="!rounded-lg !pl-3 !pr-9 !py-2.5 sm:!py-2 min-h-[44px] sm:min-h-0 text-sm border-slate-200 dark:border-slate-700 dark:!bg-slate-800 focus:border-brand-500"
                        placeholder="11:30"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-1">Duration:</span>
                      {[
                        { label: '30m', mins: 30 },
                        { label: '1h', mins: 60 },
                        { label: '1.5h', mins: 90 },
                        { label: '2h', mins: 120 },
                        { label: '3h', mins: 180 }
                      ].map(({ label, mins }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            const startM = timeToMinutes(startTimeStr);
                            setEndDateStr(startDateStr);
                            setEndTimeStr(minutesToTime(startM + mins));
                            clearFieldError('endDate');
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {fieldErrors.endDate && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.endDate}</p>}
                  </div>
                </div>

                {conflictInfo.hasConflict && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3.5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300 animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Schedule Notice</span>
                      <span>{formatConflictMessage(conflictInfo.conflictingEvents)}</span>
                    </div>
                  </div>
                )}

                {/* 4. Location / Venue */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Location / Venue <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 sm:top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      required
                      type="text"
                      value={location}
                      onChange={(e) => { setLocation(e.target.value); clearFieldError('location'); }}
                      className={`block w-full pl-9 rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0 ${fieldErrors.location ? 'border-2 border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                      placeholder="e.g. Heron House, Room 4 / Mahon Community Centre"
                    />
                  </div>
                  {fieldErrors.location && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.location}</p>}
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
                    className={`block w-full rounded-lg bg-white dark:bg-slate-800 dark:text-white px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all resize-y min-h-[80px] ${fieldErrors.description ? 'border-2 border-red-500 dark:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'}`}
                    placeholder="A few lines explaining what the event is about, who it's for, and key details for the Board & staff to pencil in."
                  />
                  {fieldErrors.description && <p className="text-red-500 dark:text-red-400 text-xs mt-1" role="alert">{fieldErrors.description}</p>}
                </div>

                {/* 6. Poster / Flyer Upload & Removal */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Poster / Flyer Image <span className="text-slate-400 font-normal lowercase">(optional)</span>
                  </label>

                  {previewUrl ? (
                    <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 p-2.5 flex items-center gap-4">
                      <img
                        src={previewUrl}
                        alt="Poster preview"
                        className="w-20 h-20 object-cover rounded-lg border border-slate-300 dark:border-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {posterFile?.name || (title ? `${title} flyer` : 'Current poster image')}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-400 rounded-xl p-5 text-center transition-colors bg-slate-50/50 dark:bg-slate-800/50"
                    >
                      <Upload className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Click or drag and drop to upload flyer / poster
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
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
                    <div className={recurrenceType !== 'custom' ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : ''}>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Repeat</label>
                        <select
                          value={recurrenceType}
                          onChange={(e) => setRecurrenceType(e.target.value as any)}
                          className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                        >
                          <option value="none">None</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="custom">Custom Dates</option>
                        </select>
                      </div>

                      {recurrenceType !== 'none' && recurrenceType !== 'custom' && (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Interval (Every X)</label>
                            <input
                              type="number"
                              min="1"
                              value={recurrenceInterval}
                              onChange={(e) => setRecurrenceInterval(Number(e.target.value))}
                              className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">End Date</label>
                            <input
                              type="date"
                              value={recurrenceEndDate}
                              onChange={(e) => setRecurrenceEndDate(e.target.value)}
                              className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-2.5 py-2.5 sm:py-1.5 text-sm focus:ring-2 focus:ring-brand-500/20 transition-all min-h-[44px] sm:min-h-0"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {recurrenceType === 'custom' && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase">Select Event Dates</label>
                        <DatePickerCalendar
                          selectedDates={customDates}
                          onChange={setCustomDates}
                          referenceTime={startTimeStr ? { hours: parseInt(startTimeStr.split(':')[0]), minutes: parseInt(startTimeStr.split(':')[1]) } : undefined}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Delete Confirmation Dialog */}
          {showDeleteDialog && event && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => !isDeleting && setShowDeleteDialog(false)}>
              <div className={`relative rounded-xl shadow-xl border border-white/20 w-full max-w-md mx-4 ${theme === 'dark' ? 'glass-panel-dark' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                  <h3 className={`text-lg font-semibold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Delete Event
                  </h3>
                  <button onClick={() => !isDeleting && setShowDeleteDialog(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none" disabled={isDeleting}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="px-6 py-6">
                  {event.recurrence && event.recurrence.type !== 'none' ? (
                    <div className="space-y-4">
                      <p className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                        This is a recurring event. What would you like to delete?
                      </p>
                      <div className="space-y-3">
                        <button
                          onClick={() => handleDeleteConfirm(false)}
                          disabled={isDeleting}
                          className="w-full px-4 py-3 text-left rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all disabled:opacity-50"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white">Delete only this occurrence</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Remove this specific instance from the series
                          </div>
                        </button>
                        <button
                          onClick={() => handleDeleteConfirm(true)}
                          disabled={isDeleting}
                          className="w-full px-4 py-3 text-left rounded-lg border-2 border-red-200 dark:border-red-800 hover:border-red-500 dark:hover:border-red-500 transition-all disabled:opacity-50"
                        >
                          <div className="font-semibold text-red-600 dark:text-red-400">Delete entire series</div>
                          <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                            Remove all occurrences of this event
                          </div>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                        Are you sure you want to delete "{event.title}"? This action cannot be undone.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleDeleteConfirm(true)}
                          disabled={isDeleting}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 font-medium"
                        >
                          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Delete'}
                        </button>
                        <button
                          onClick={() => setShowDeleteDialog(false)}
                          disabled={isDeleting}
                          className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-all disabled:opacity-50 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Add Category Modal */}
          {showAddCategoryModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddCategoryModal(false)}>
              <div className={`relative rounded-xl shadow-xl border border-white/20 w-full max-w-md mx-4 ${theme === 'dark' ? 'glass-panel-dark' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                  <h3 className={`text-lg font-semibold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Add New Category
                  </h3>
                  <button onClick={() => setShowAddCategoryModal(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="px-6 py-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Category Name</label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                      className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium placeholder-slate-400"
                      placeholder="Enter category name"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={isCreatingCategory || !newCategoryName.trim()}
                    className="inline-flex justify-center rounded-lg px-5 py-2 bg-slate-900 text-white font-medium hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 text-sm"
                  >
                    {isCreatingCategory ? <Loader2 className="animate-spin h-4 w-4" /> : 'Add Category'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCategoryModal(false);
                      setNewCategoryName('');
                    }}
                    disabled={isCreatingCategory}
                    className="inline-flex justify-center rounded-lg px-5 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 border border-slate-200 dark:border-slate-600 transition-all text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row-reverse gap-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            {showForm ? (
              <>
                <button type="submit" form="event-form" disabled={isSubmitting} className="inline-flex justify-center items-center rounded-lg px-5 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-slate-900 text-white font-medium hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 text-sm w-full sm:w-auto">
                  {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : (isEditing ? (autoApproveOnSave ? 'Save & Approve' : 'Save Changes') : 'Create Event')}
                </button>
                <button type="button" onClick={() => { (isEditing && !autoApproveOnSave && initialMode !== 'edit') ? setIsEditing(false) : onClose() }} disabled={isSubmitting} className="inline-flex justify-center items-center rounded-lg px-5 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 border border-slate-200 dark:border-slate-600 transition-all text-sm w-full sm:w-auto">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={onClose} className="inline-flex justify-center items-center rounded-lg px-5 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 border border-slate-200 dark:border-slate-600 transition-all text-sm w-full sm:w-auto">
                Close
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(EventModal, (prevProps, nextProps) => {
  // Only re-render if critical props changed
  if (prevProps.isOpen !== nextProps.isOpen) return false;
  if (prevProps.role !== nextProps.role) return false;
  if (prevProps.currentUserId !== nextProps.currentUserId) return false;
  if (prevProps.currentUserName !== nextProps.currentUserName) return false;
  if (prevProps.initialMode !== nextProps.initialMode) return false;
  if (prevProps.autoApproveOnSave !== nextProps.autoApproveOnSave) return false;

  // Compare event objects
  if (prevProps.event?.id !== nextProps.event?.id) return false;
  if (prevProps.event?.title !== nextProps.event?.title) return false;
  if (prevProps.event?.category !== nextProps.event?.category) return false;
  if (prevProps.event?.location !== nextProps.event?.location) return false;
  if (prevProps.event?.date?.getTime() !== nextProps.event?.date?.getTime()) return false;
  if (prevProps.event?.endDate?.getTime() !== nextProps.event?.endDate?.getTime()) return false;
  if (prevProps.event?.submitterName !== nextProps.event?.submitterName) return false;
  if (prevProps.event?.submitterEmail !== nextProps.event?.submitterEmail) return false;
  if (prevProps.event?.status !== nextProps.event?.status) return false;
  if (prevProps.initialDate?.getTime() !== nextProps.initialDate?.getTime()) return false;

  // Compare callbacks
  if (prevProps.onClose !== nextProps.onClose) return false;
  if (prevProps.onSave !== nextProps.onSave) return false;
  if (prevProps.onUpdate !== nextProps.onUpdate) return false;
  if (prevProps.onEventUpdate !== nextProps.onEventUpdate) return false;

  return true; // Props are equal, skip re-render
});

