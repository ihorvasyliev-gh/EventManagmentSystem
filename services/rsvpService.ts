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

