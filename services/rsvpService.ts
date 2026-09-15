import { supabase } from '../lib/supabase';

/** Normalize occurrence date to start of day in UTC for consistent matching (optional). We store exact timestamp. */
function toISODate(d: Date): string {
  return d.toISOString();
}

/**
 * RSVP to a specific occurrence of an event.
 * For recurring events, occurrenceDate is the instance date; for single events use the event's date.
 */
export const rsvpToEvent = async (
  eventId: string,
  userId: string,
  userName: string,
  occurrenceDate: Date
): Promise<void> => {
  const { error } = await supabase
    .from('rsvps')
    .upsert(
      {
        event_id: eventId,
        occurrence_date: toISODate(occurrenceDate),
        user_id: userId,
        user_name: userName,
        status: 'going'
      },
      { onConflict: 'event_id,user_id,occurrence_date' }
    );

  if (error) {
    console.error('Error RSVPing to event:', error);
    throw new Error(error.message || 'Failed to RSVP');
  }
};

export const cancelRsvp = async (
  eventId: string,
  userId: string,
  occurrenceDate: Date
): Promise<void> => {
  const { error } = await supabase
    .from('rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('occurrence_date', toISODate(occurrenceDate));

  if (error) {
    console.error('Error cancelling RSVP:', error);
    throw new Error(error.message || 'Failed to cancel RSVP');
  }
};

/** Get attendee user IDs for a specific occurrence. */
export const getEventAttendees = async (
  eventId: string,
  occurrenceDate: Date
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('occurrence_date', toISODate(occurrenceDate))
    .eq('status', 'going');

  if (error) {
    console.error('Error fetching attendees:', error);
    return [];
  }

  return (data || []).map((r: { user_id: string }) => r.user_id);
};

export const getEventAttendeesWithNames = async (
  eventId: string,
  occurrenceDate: Date
): Promise<{ userId: string; userName: string }[]> => {
  const { data, error } = await supabase
    .from('rsvps')
    .select('user_id, user_name')
    .eq('event_id', eventId)
    .eq('occurrence_date', toISODate(occurrenceDate))
    .eq('status', 'going');

  if (error) {
    console.error('Error fetching attendees with names:', error);
    return [];
  }

  return (data || []).map((r: { user_id: string; user_name: string }) => ({
    userId: r.user_id,
    userName: r.user_name
  }));
};

export const hasUserRsvped = async (
  eventId: string,
  userId: string,
  occurrenceDate: Date
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('occurrence_date', toISODate(occurrenceDate))
    .eq('status', 'going')
    .maybeSingle();

  if (error) {
    console.error('Error checking RSVP status:', error);
    return false;
  }

  return !!data;
};

/**
 * Returns instance keys for occurrences the user has RSVP'd to.
 * Instance key format: `${event_id}_${occurrence_date.getTime()}` (matches recurrence.ts).
 */
export const getUserRsvps = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('rsvps')
    .select('event_id, occurrence_date')
    .eq('user_id', userId)
    .eq('status', 'going');

  if (error) {
    console.error('Error fetching user RSVPs:', error);
    return [];
  }

  return (data || []).map(
    (r: { event_id: string; occurrence_date: string }) =>
      `${r.event_id}_${new Date(r.occurrence_date).getTime()}`
  );
};
