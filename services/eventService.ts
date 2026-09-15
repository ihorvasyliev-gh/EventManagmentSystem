import { Event, Attachment, EventComment, EventHistoryEntry, RecurrenceRule } from '../types';
import { supabase } from '../lib/supabase';

interface RelatedData {
  attachmentsByEvent: Record<string, Attachment[]>;
  commentsByEvent: Record<string, EventComment[]>;
  historyByEvent: Record<string, EventHistoryEntry[]>;
  rsvpsByEvent: Record<string, string[]>;
  rsvpNamesByEvent: Record<string, { userId: string; userName: string }[]>;
}

/** Пакетная загрузка связанных данных для списка событий (4 запроса вместо 4×N) */
const fetchRelatedBatch = async (eventIds: string[]): Promise<RelatedData> => {
  if (eventIds.length === 0) {
    return { attachmentsByEvent: {}, commentsByEvent: {}, historyByEvent: {}, rsvpsByEvent: {}, rsvpNamesByEvent: {} };
  }

  const [attachmentsRes, commentsRes, historyRes, rsvpsRes] = await Promise.all([
    supabase
      .from('event_attachments')
      .select('*')
      .in('event_id', eventIds)
      .order('uploaded_at', { ascending: true }),
    supabase
      .from('event_comments')
      .select('*')
      .in('event_id', eventIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('event_history')
      .select('*')
      .in('event_id', eventIds)
      .order('timestamp', { ascending: true }),
    supabase
      .from('rsvps')
      .select('event_id, user_id, user_name')
      .in('event_id', eventIds)
      .eq('status', 'going')
  ]);

  const attachmentsByEvent: Record<string, Attachment[]> = {};
  const commentsByEvent: Record<string, EventComment[]> = {};
  const historyByEvent: Record<string, EventHistoryEntry[]> = {};
  const rsvpsByEvent: Record<string, string[]> = {};
  const rsvpNamesByEvent: Record<string, { userId: string; userName: string }[]> = {};

  for (const att of attachmentsRes.data || []) {
    const list = attachmentsByEvent[att.event_id] ??= [];
    list.push({
      id: att.id,
      name: att.name,
      url: att.url,
      type: att.type,
      size: att.size,
      uploadedAt: new Date(att.uploaded_at)
    });
  }

  for (const c of commentsRes.data || []) {
    const list = commentsByEvent[c.event_id] ??= [];
    list.push({
      id: c.id,
      eventId: c.event_id,
      occurrenceDate: c.occurrence_date ? new Date(c.occurrence_date) : new Date(0),
      userId: c.user_id,
      userName: c.user_name,
      content: c.content,
      createdAt: new Date(c.created_at)
    });
  }

  for (const h of historyRes.data || []) {
    const list = historyByEvent[h.event_id] ??= [];
    list.push({
      id: h.id,
      eventId: h.event_id,
      userId: h.user_id,
      userName: h.user_name,
      action: h.action,
      changes: h.changes || undefined,
      timestamp: new Date(h.timestamp)
    });
  }

  for (const r of rsvpsRes.data || []) {
    const list = rsvpsByEvent[r.event_id] ??= [];
    list.push(r.user_id);
    const nameList = rsvpNamesByEvent[r.event_id] ??= [];
    nameList.push({ userId: r.user_id, userName: r.user_name });
  }

  return { attachmentsByEvent, commentsByEvent, historyByEvent, rsvpsByEvent, rsvpNamesByEvent };
};

// Загрузка связанных данных для одного события (create/update/addComment).
// occurrenceDate — дата вхождения (для повторяющихся событий — конкретное вхождение).
const fetchRelatedForOne = async (eventId: string, occurrenceDate: Date): Promise<RelatedData> => {
  const occurrenceIso = occurrenceDate.toISOString();
  const [attachmentsRes, commentsRes, historyRes, rsvpsRes] = await Promise.all([
    supabase
      .from('event_attachments')
      .select('*')
      .eq('event_id', eventId)
      .order('uploaded_at', { ascending: true }),
    supabase
      .from('event_comments')
      .select('*')
      .eq('event_id', eventId)
      .eq('occurrence_date', occurrenceIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('event_history')
      .select('*')
      .eq('event_id', eventId)
      .order('timestamp', { ascending: true }),
    supabase
      .from('rsvps')
      .select('user_id, user_name')
      .eq('event_id', eventId)
      .eq('occurrence_date', occurrenceIso)
      .eq('status', 'going')
  ]);

  const attachments: Attachment[] = (attachmentsRes.data || []).map((att: any) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    type: att.type,
    size: att.size,
    uploadedAt: new Date(att.uploaded_at)
  }));
  const comments: EventComment[] = (commentsRes.data || []).map((c: any) => ({
    id: c.id,
    eventId: c.event_id,
    occurrenceDate: new Date(c.occurrence_date),
    userId: c.user_id,
    userName: c.user_name,
    content: c.content,
    createdAt: new Date(c.created_at)
  }));
  const history: EventHistoryEntry[] = (historyRes.data || []).map((h: any) => ({
    id: h.id,
    eventId: h.event_id,
    userId: h.user_id,
    userName: h.user_name,
    action: h.action,
    changes: h.changes || undefined,
    timestamp: new Date(h.timestamp)
  }));
  const attendees: string[] = (rsvpsRes.data || []).map((r: any) => r.user_id);
  const attendeeNames: { userId: string; userName: string }[] = (rsvpsRes.data || []).map((r: any) => ({
    userId: r.user_id,
    userName: r.user_name
  }));

  return {
    attachmentsByEvent: { [eventId]: attachments },
    commentsByEvent: { [eventId]: comments },
    historyByEvent: { [eventId]: history },
    rsvpsByEvent: { [eventId]: attendees },
    rsvpNamesByEvent: { [eventId]: attendeeNames }
  };
};

/**
 * Lazy load full details for an event (for a specific occurrence).
 * occurrenceDate — date of the instance (event.date for the opened instance).
 */
export const fetchEventDetails = async (
  eventId: string,
  occurrenceDate: Date
): Promise<Partial<Event>> => {
  const related = await fetchRelatedForOne(eventId, occurrenceDate);
  const attachments = related.attachmentsByEvent[eventId] || [];
  const comments = related.commentsByEvent[eventId] || [];
  const history = related.historyByEvent[eventId] || [];
  const attendees = related.rsvpsByEvent[eventId] || [];
  const attendeeNames = related.rsvpNamesByEvent[eventId] || [];

  return {
    attachments,
    comments,
    history,
    attendees,
    attendeeNames
  };
}

// Преобразуем данные из Supabase (snake_case) в TypeScript типы (camelCase)
const mapSupabaseEventToEvent = async (
  supabaseEvent: any,
  related?: RelatedData,
  skipRelatedFetch = false
): Promise<Event> => {
  const eventId = supabaseEvent.id;
  let attachments: Attachment[] | undefined;
  let comments: EventComment[] | undefined;
  let history: EventHistoryEntry[] | undefined;
  let attendees: string[] | undefined;
  let attendeeNames: { userId: string; userName: string }[] | undefined;

  if (related) {
    attachments = related.attachmentsByEvent[eventId];
    comments = related.commentsByEvent[eventId];
    history = related.historyByEvent[eventId];
    attendees = related.rsvpsByEvent[eventId];
    attendeeNames = related.rsvpNamesByEvent[eventId];
  } else if (!skipRelatedFetch) {
    // Create/Update case: fetch everything immediately to return full object
    const eventDate = new Date(supabaseEvent.date);
    const one = await fetchRelatedForOne(eventId, eventDate);
    attachments = one.attachmentsByEvent[eventId] ?? [];
    comments = one.commentsByEvent[eventId] ?? [];
    history = one.historyByEvent[eventId] ?? [];
    attendees = one.rsvpsByEvent[eventId] ?? [];
    attendeeNames = one.rsvpNamesByEvent[eventId] ?? [];
  }
  // If skipRelatedFetch is true and related is undefined, fields remain undefined (Lazy Load)

  let recurrence: RecurrenceRule | undefined;
  if (supabaseEvent.recurrence_type && supabaseEvent.recurrence_type !== 'none') {
    recurrence = {
      type: supabaseEvent.recurrence_type,
      interval: supabaseEvent.recurrence_interval || undefined,
      endDate: supabaseEvent.recurrence_end_date ? new Date(supabaseEvent.recurrence_end_date) : undefined,
      occurrences: supabaseEvent.recurrence_occurrences || undefined,
      daysOfWeek: supabaseEvent.recurrence_days_of_week || undefined,
      customDates: supabaseEvent.recurrence_custom_dates
        ? supabaseEvent.recurrence_custom_dates.map((d: string) => new Date(d))
        : undefined
    };
  }

  // Use poster_url directly, or fallback to first image attachment if available
  const posterAttachment = attachments?.find(att => att.type === 'image');
  const posterUrl = supabaseEvent.poster_url || posterAttachment?.url || undefined;

  return {
    id: supabaseEvent.id,
    title: supabaseEvent.title,
    description: supabaseEvent.description || '',
    date: new Date(supabaseEvent.date),
    location: supabaseEvent.location || '',
    posterUrl,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    category: supabaseEvent.category || undefined,
    tags: supabaseEvent.tags || [],
    status: supabaseEvent.status,
    recurrence,
    rsvpEnabled: supabaseEvent.rsvp_enabled || false,
    maxAttendees: supabaseEvent.max_attendees || undefined,
    attendees: attendees && attendees.length > 0 ? attendees : undefined,
    attendeeNames: attendeeNames && attendeeNames.length > 0 ? attendeeNames : undefined,
    comments: comments && comments.length > 0 ? comments : undefined,
    history: history && history.length > 0 ? history : undefined,
    creatorId: supabaseEvent.creator_id,
    createdAt: new Date(supabaseEvent.created_at)
  };
};

export const getEvents = async (): Promise<Event[]> => {
  const { data: eventsData, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    throw new Error(error.message || 'Failed to fetch events');
  }

  if (!eventsData || eventsData.length === 0) {
    return [];
  }

  // OPTIMIZATION: Do NOT fetch related data (comments, history, etc) for the list view.
  // Passing skipRelatedFetch=true lazy loads these on demand in EventModal.
  const events = await Promise.all(
    eventsData.map((e: any) => mapSupabaseEventToEvent(e, undefined, true))
  );
  return events;
};

/** Load comments, attachments, and poster for a list of events (e.g. for export). Comments are filtered by occurrence date. */
export const getEventsWithRelated = async (events: Event[]): Promise<Event[]> => {
  if (events.length === 0) return [];
  const eventIds = [...new Set(events.map(e => e.id))];
  const related = await fetchRelatedBatch(eventIds);
  return events.map(event => {
    const attachments = related.attachmentsByEvent[event.id] ?? [];
    const allComments = related.commentsByEvent[event.id] ?? [];
    const eventTime = event.date.getTime();
    const comments = allComments.filter(c => c.occurrenceDate?.getTime() === eventTime);
    const posterAttachment = attachments.find(att => att.type === 'image');
    const posterUrl = event.posterUrl || posterAttachment?.url || undefined;
    return {
      ...event,
      comments: comments.length > 0 ? comments : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      posterUrl
    };
  });
};

export const createEvent = async (eventData: Omit<Event, 'id' | 'createdAt'>, userId: string, userName: string): Promise<Event> => {
  // Подготавливаем данные для вставки в БД
  const eventInsert = {
    title: eventData.title,
    description: eventData.description || null,
    date: eventData.date.toISOString(),
    location: eventData.location || null,
    poster_url: eventData.posterUrl || null,
    status: eventData.status,
    category: eventData.category || null,
    tags: eventData.tags || [],
    recurrence_type: eventData.recurrence?.type || 'none',
    recurrence_interval: eventData.recurrence?.interval || null,
    recurrence_end_date: eventData.recurrence?.endDate ? eventData.recurrence.endDate.toISOString() : null,
    recurrence_occurrences: eventData.recurrence?.occurrences || null,
    recurrence_days_of_week: eventData.recurrence?.daysOfWeek || null,
    recurrence_custom_dates: eventData.recurrence?.customDates
      ? eventData.recurrence.customDates.map(d => d.toISOString())
      : null,
    rsvp_enabled: eventData.rsvpEnabled || false,
    max_attendees: eventData.maxAttendees || null,
    creator_id: userId
  };

  const { data: newEventData, error: eventError } = await supabase
    .from('events')
    .insert(eventInsert)
    .select()
    .single();

  if (eventError || !newEventData) {
    console.error('Error creating event:', eventError);
    throw new Error(eventError?.message || 'Failed to create event');
  }

  // Если есть attachments, сохраняем их
  if (eventData.attachments && eventData.attachments.length > 0) {
    const attachmentsInsert = eventData.attachments.map(att => ({
      event_id: newEventData.id,
      name: att.name,
      url: att.url,
      type: att.type,
      size: att.size,
      uploaded_by: userId
    }));

    const { error: attachmentsError } = await supabase
      .from('event_attachments')
      .insert(attachmentsInsert);

    if (attachmentsError) {
      console.error('Error creating attachments:', attachmentsError);
      // Не прерываем создание события, только логируем ошибку
    }
  }

  // История создается автоматически через триггер, но можем убедиться
  // Преобразуем обратно в Event формат
  const createdEvent = await mapSupabaseEventToEvent(newEventData);
  return createdEvent;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const updateEvent = async (id: string, eventData: Omit<Event, 'id' | 'createdAt'>, userId: string, userName: string): Promise<Event> => {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
    console.error('updateEvent: invalid or non-UUID id', { id });
    throw new Error('Invalid event ID. Please close and reopen the event.');
  }

  // Сначала получаем старое событие для отслеживания изменений
  const { data: oldEventData, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !oldEventData) {
    throw new Error('Event not found');
  }

  // Определяем изменения
  const changes: Record<string, { old: any; new: any }> = {};
  if (eventData.title !== oldEventData.title) changes.title = { old: oldEventData.title, new: eventData.title };
  if (eventData.description !== oldEventData.description) changes.description = { old: oldEventData.description || '', new: eventData.description || '' };
  if (eventData.location !== oldEventData.location) changes.location = { old: oldEventData.location || '', new: eventData.location || '' };
  if (eventData.status !== oldEventData.status) changes.status = { old: oldEventData.status, new: eventData.status };
  if (eventData.category !== oldEventData.category) changes.category = { old: oldEventData.category || null, new: eventData.category || null };

  // Подготавливаем данные для обновления
  const eventUpdate = {
    title: eventData.title,
    description: eventData.description || null,
    date: eventData.date.toISOString(),
    location: eventData.location || null,
    poster_url: eventData.posterUrl || null,
    status: eventData.status,
    category: eventData.category || null,
    tags: eventData.tags || [],
    recurrence_type: eventData.recurrence?.type || 'none',
    recurrence_interval: eventData.recurrence?.interval || null,
    recurrence_end_date: eventData.recurrence?.endDate ? eventData.recurrence.endDate.toISOString() : null,
    recurrence_occurrences: eventData.recurrence?.occurrences || null,
    recurrence_days_of_week: eventData.recurrence?.daysOfWeek || null,
    recurrence_custom_dates: eventData.recurrence?.customDates
      ? eventData.recurrence.customDates.map(d => d.toISOString())
      : null,
    rsvp_enabled: eventData.rsvpEnabled || false,
    max_attendees: eventData.maxAttendees || null
  };

  const { data: updatedEventData, error: updateError } = await supabase
    .from('events')
    .update(eventUpdate)
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updatedEventData) {
    console.error('Error updating event:', updateError);
    throw new Error(updateError?.message || 'Failed to update event');
  }

  // Создаем запись в истории изменений
  const action = 'updated';

  const { error: historyError } = await supabase
    .from('event_history')
    .insert({
      event_id: id,
      user_id: userId,
      user_name: userName,
      action: action,
      changes: Object.keys(changes).length > 0 ? changes : null
    });

  if (historyError) {
    console.error('Error creating history entry:', historyError);
    // Не прерываем обновление события, только логируем ошибку
  }

  // Если есть новые attachments, добавляем их
  if (eventData.attachments && eventData.attachments.length > 0) {
    // Получаем существующие attachments
    const { data: existingAttachments } = await supabase
      .from('event_attachments')
      .select('id, url')
      .eq('event_id', id);

    const existingUrls = new Set(existingAttachments?.map(att => att.url) || []);

    // Добавляем только новые attachments
    const newAttachments = eventData.attachments.filter(att => !existingUrls.has(att.url));

    if (newAttachments.length > 0) {
      const attachmentsInsert = newAttachments.map(att => ({
        event_id: id,
        name: att.name,
        url: att.url,
        type: att.type,
        size: att.size,
        uploaded_by: userId
      }));

      const { error: attachmentsError } = await supabase
        .from('event_attachments')
        .insert(attachmentsInsert);

      if (attachmentsError) {
        console.error('Error creating attachments:', attachmentsError);
        // Не прерываем обновление события
      }
    }
  }

  // Преобразуем обратно в Event формат
  const updatedEvent = await mapSupabaseEventToEvent(updatedEventData);
  return updatedEvent;
};

// Cloudflare R2 Upload via Pages Functions
export const uploadPosterToR2 = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'PUT',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload poster');
  }

  const data = await response.json();
  return data.url;
};

export const uploadAttachment = async (file: File): Promise<{ id: string; name: string; url: string; type: string; size: number; uploadedAt: Date }> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'PUT',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload attachment');
  }

  const data = await response.json();

  return {
    id: data.key, // Use the R2 key as the ID for now, or generate one if needed
    name: data.name,
    url: data.url,
    type: data.type.startsWith('image/') ? 'image' : data.type === 'application/pdf' ? 'pdf' : 'document',
    size: data.size,
    uploadedAt: new Date()
  };
};

/**
 * Получить список исключений для события (удаленных экземпляров)
 */
export const getRecurrenceExceptions = async (eventId: string): Promise<Date[]> => {
  const { data, error } = await supabase
    .from('recurrence_exceptions')
    .select('exception_date')
    .eq('event_id', eventId);

  if (error) {
    console.error('Error fetching recurrence exceptions:', error);
    return [];
  }

  return (data || []).map(item => new Date(item.exception_date));
};

/**
 * Удалить конкретный экземпляр повторяющегося события
 */
export const deleteRecurrenceInstance = async (eventId: string, instanceDate: Date, userId: string, userName: string): Promise<void> => {
  // Проверяем, существует ли событие и является ли оно повторяющимся
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('id, recurrence_type')
    .eq('id', eventId)
    .single();

  if (fetchError || !eventData) {
    throw new Error('Event not found');
  }

  if (!eventData.recurrence_type || eventData.recurrence_type === 'none') {
    throw new Error('Event is not recurring');
  }

  // Нормализуем дату (убираем время, оставляем только дату)
  const normalizedDate = new Date(instanceDate);
  normalizedDate.setHours(0, 0, 0, 0);

  // Добавляем исключение
  const { error: insertError } = await supabase
    .from('recurrence_exceptions')
    .insert({
      event_id: eventId,
      exception_date: normalizedDate.toISOString()
    });

  if (insertError) {
    // Если исключение уже существует, это нормально (idempotent)
    if (insertError.code !== '23505') { // Unique constraint violation
      console.error('Error adding recurrence exception:', insertError);
      throw new Error(insertError.message || 'Failed to delete instance');
    }
  }

  // Добавляем запись в историю
  const formattedDate = normalizedDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const { error: historyError } = await supabase
    .from('event_history')
    .insert({
      event_id: eventId,
      user_id: userId,
      user_name: userName,
      action: 'updated',
      changes: {
        deleted_instance: {
          old: formattedDate,
          new: 'deleted'
        }
      }
    });

  if (historyError) {
    console.error('Error creating history entry:', historyError);
    // Не прерываем операцию, только логируем
  }
};

/**
 * Удалить событие (всю серию, если оно повторяющееся)
 */
export const deleteEvent = async (id: string, userId?: string, userName?: string): Promise<void> => {
  // Сначала проверяем, существует ли событие
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .single();

  if (fetchError || !eventData) {
    throw new Error('Event not found');
  }

  // Добавляем запись в историю перед удалением (если есть userId и userName)
  if (userId && userName) {
    const { error: historyError } = await supabase
      .from('event_history')
      .insert({
        event_id: id,
        user_id: userId,
        user_name: userName,
        action: 'deleted'
      });

    if (historyError) {
      console.error('Error creating history entry:', historyError);
      // Не прерываем операцию, только логируем
    }
  }

  // Удаляем событие (каскадное удаление удалит связанные записи автоматически)
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (deleteError) {
    console.error('Error deleting event:', deleteError);
    throw new Error(deleteError.message || 'Failed to delete event');
  }
};

/** Добавить комментарий к событию (к конкретному вхождению для повторяющихся). */
export const addComment = async (
  eventId: string,
  userId: string,
  userName: string,
  content: string,
  occurrenceDate: Date
): Promise<EventComment> => {
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .single();

  if (fetchError || !eventData) {
    throw new Error('Event not found');
  }

  const occurrenceIso = occurrenceDate.toISOString();
  const { data: commentData, error: commentError } = await supabase
    .from('event_comments')
    .insert({
      event_id: eventId,
      occurrence_date: occurrenceIso,
      user_id: userId,
      user_name: userName,
      content: content
    })
    .select()
    .single();

  if (commentError || !commentData) {
    console.error('Error adding comment:', commentError);
    throw new Error(commentError?.message || 'Failed to add comment');
  }

  return {
    id: commentData.id,
    eventId: commentData.event_id,
    occurrenceDate: new Date(commentData.occurrence_date),
    userId: commentData.user_id,
    userName: commentData.user_name,
    content: commentData.content,
    createdAt: new Date(commentData.created_at)
  };
};

export const deleteComment = async (commentId: string): Promise<void> => {
  const { error } = await supabase
    .from('event_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('Error deleting comment:', error);
    throw new Error(error.message || 'Failed to delete comment');
  }
};
