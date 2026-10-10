import { Event, Attachment, EventHistoryEntry, RecurrenceRule } from '../types';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from './paging';
import { EVENT_COLUMNS, EventRow, AttachmentRow, HistoryRow, mapEventRow, mapAttachmentRow, mapHistoryRow, eventToRow, toIsoList } from './eventMapper';
import { deleteStoredFiles } from './fileService';

export { uploadPoster as uploadPosterToR2 } from './fileService';

/** Every event the signed-in user may see (row-level security decides which), oldest first */
export const getEvents = async (): Promise<Event[]> => {
  const rows = await fetchAllPages<EventRow>((from, to) =>
    supabase
      .from('events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  return rows.map(row => mapEventRow(row));
};

/** Files and change history of one event, loaded when it is opened */
export const fetchEventDetails = async (eventId: string): Promise<{ attachments: Attachment[]; history: EventHistoryEntry[] }> => {
  const [attachmentsRes, historyRes] = await Promise.all([
    supabase.from('event_attachments').select('*').eq('event_id', eventId).order('uploaded_at', { ascending: true }),
    supabase.from('event_history').select('*').eq('event_id', eventId).order('timestamp', { ascending: true })
  ]);
  return {
    attachments: ((attachmentsRes.data || []) as AttachmentRow[]).map(mapAttachmentRow),
    history: ((historyRes.data || []) as HistoryRow[]).map(mapHistoryRow)
  };
};

/** The events with their attachments (and a poster taken from an image attachment), e.g. for export */
export const getEventsWithRelated = async (events: Event[]): Promise<Event[]> => {
  if (events.length === 0) return [];
  const eventIds = [...new Set(events.map(e => e.id))];
  const { data } = await supabase
    .from('event_attachments')
    .select('*')
    .in('event_id', eventIds)
    .order('uploaded_at', { ascending: true });
  const byEvent = new Map<string, Attachment[]>();
  for (const row of (data || []) as AttachmentRow[]) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push(mapAttachmentRow(row));
    byEvent.set(row.event_id, list);
  }
  return events.map(event => {
    const attachments = byEvent.get(event.id) ?? [];
    return {
      ...event,
      attachments: attachments.length > 0 ? attachments : undefined,
      posterUrl: event.posterUrl || attachments.find(att => att.type === 'image')?.url || undefined
    };
  });
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const updateEvent = async (id: string, eventData: Omit<Event, 'id' | 'createdAt'>, userId: string, userName: string): Promise<Event> => {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
    console.error('updateEvent: invalid or non-UUID id', { id });
    throw new Error('Invalid event ID. Please close and reopen the event.');
  }

  // The saved event, to record what changed
  const { data: oldEventData, error: fetchError } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .single<EventRow>();

  if (fetchError || !oldEventData) {
    throw new Error('Event not found');
  }

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (eventData.title !== oldEventData.title) changes.title = { old: oldEventData.title, new: eventData.title };
  if (eventData.description !== oldEventData.description) changes.description = { old: oldEventData.description || '', new: eventData.description || '' };
  if (eventData.location !== oldEventData.location) changes.location = { old: oldEventData.location || '', new: eventData.location || '' };
  if (eventData.status !== oldEventData.status) changes.status = { old: oldEventData.status, new: eventData.status };
  if (eventData.category !== oldEventData.category) changes.category = { old: oldEventData.category || null, new: eventData.category || null };

  const { data: updatedEventData, error: updateError } = await supabase
    .from('events')
    .update(eventToRow(eventData))
    .eq('id', id)
    .select(EVENT_COLUMNS)
    .single<EventRow>();

  if (updateError || !updatedEventData) {
    console.error('Error updating event:', updateError);
    throw new Error(updateError?.message || 'Failed to update event');
  }

  const { error: historyError } = await supabase
    .from('event_history')
    .insert({
      event_id: id,
      user_id: userId,
      user_name: userName,
      action: 'updated',
      changes: Object.keys(changes).length > 0 ? changes : null
    });
  if (historyError) {
    // The event is saved; only its history line is missing
    console.error('Error creating history entry:', historyError);
  }

  // A replaced or removed poster is no longer needed (kept if another event still uses it)
  if (oldEventData.poster_url && oldEventData.poster_url !== updatedEventData.poster_url) {
    void deleteStoredFiles([oldEventData.poster_url]);
  }

  return mapEventRow(updatedEventData);
};

/**
 * Получить список исключений для группы событий одним пакетным запросом (1 запрос вместо N)
 */
export const getRecurrenceExceptionsBatch = async (eventIds: string[]): Promise<Map<string, Date[]>> => {
  const map = new Map<string, Date[]>();
  if (!eventIds || eventIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from('recurrence_exceptions')
    .select('event_id, exception_date')
    .in('event_id', eventIds);

  if (error) {
    console.error('Error fetching batch recurrence exceptions:', error);
    return map;
  }

  for (const item of data || []) {
    const list = map.get(item.event_id) || [];
    list.push(new Date(item.exception_date));
    map.set(item.event_id, list);
  }

  return map;
};

/**
 * Every deleted occurrence the user may see (row-level security limits it to visible events).
 * Needs no event ids, so the calendar fetches it alongside the events instead of after them,
 * and a long list of ids can't make the request URL too long.
 */
export const getAllRecurrenceExceptions = async (): Promise<Map<string, Date[]>> => {
  const rows = await fetchAllPages<{ event_id: string; exception_date: string }>((from, to) =>
    supabase
      .from('recurrence_exceptions')
      .select('event_id, exception_date', { count: 'exact' })
      .order('id', { ascending: true })
      .range(from, to)
  );

  const map = new Map<string, Date[]>();
  for (const item of rows) {
    const list = map.get(item.event_id) || [];
    list.push(new Date(item.exception_date));
    map.set(item.event_id, list);
  }
  return map;
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
 * Saves a new set of dates for a custom-dates series (e.g. after removing one date) and
 * drops the event's old per-day exceptions, since the date list is now complete.
 */
export const saveCustomSchedule = async (
  eventId: string,
  schedule: { date: Date; endDate?: Date; location?: string; recurrence?: RecurrenceRule },
  userId: string,
  userName: string,
  removedDay?: Date
): Promise<void> => {
  const payload = {
    date: schedule.date.toISOString(),
    end_date: schedule.endDate ? schedule.endDate.toISOString() : null,
    // A series in different places starts at its first remaining date's address
    ...(schedule.location !== undefined ? { location: schedule.location || null } : {}),
    recurrence_type: schedule.recurrence?.type || 'none',
    recurrence_custom_dates: toIsoList(schedule.recurrence?.customDates),
    recurrence_custom_end_dates: toIsoList(schedule.recurrence?.customEndDates),
    recurrence_custom_locations: schedule.recurrence?.customLocations ?? null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('events').update(payload).eq('id', eventId);
  if (error) {
    console.error('Error saving event dates:', error);
    throw new Error(error.message || 'Failed to update event dates');
  }

  await clearRecurrenceExceptions(eventId);

  if (removedDay) {
    const { error: historyError } = await supabase.from('event_history').insert({
      event_id: eventId,
      user_id: userId,
      user_name: userName,
      action: 'updated',
      changes: {
        deleted_instance: {
          // With several sessions a day, the time says which one went
          old: removedDay.toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            ...(removedDay.getHours() || removedDay.getMinutes() ? { hour: '2-digit', minute: '2-digit' } : {})
          }),
          new: 'deleted'
        }
      }
    });
    if (historyError) console.error('Error creating history entry:', historyError);
  }
};

/** Removes all "deleted occurrence" records of an event */
export const clearRecurrenceExceptions = async (eventId: string): Promise<void> => {
  const { error } = await supabase.from('recurrence_exceptions').delete().eq('event_id', eventId);
  if (error) console.error('Error clearing recurrence exceptions:', error);
};

/** Deletes an event (the whole series) and then its poster and attachments from R2 */
export const deleteEvent = async (id: string): Promise<void> => {
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('id, poster_url')
    .eq('id', id)
    .single<{ id: string; poster_url: string | null }>();

  if (fetchError || !eventData) {
    throw new Error('Event not found');
  }
  const { data: attachments } = await supabase.from('event_attachments').select('url').eq('event_id', id);

  // History, attachments and deleted dates go with it (on delete cascade)
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (deleteError) {
    console.error('Error deleting event:', deleteError);
    throw new Error(deleteError.message || 'Failed to delete event');
  }

  void deleteStoredFiles([eventData.poster_url, ...(attachments || []).map((a: { url: string }) => a.url)]);
};
