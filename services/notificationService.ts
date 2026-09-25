import { supabase } from '../lib/supabase';

// Request browser notification permission
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    if (import.meta.env.DEV) console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Show browser notification
const showBrowserNotification = (title: string, options?: NotificationOptions) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options
    });
  }
};

export const checkTomorrowRSVPEvents = async (userId: string): Promise<void> => {
  // 1. Get user's RSVPs with recurrence dates
  const { data: rsvps } = await supabase
    .from('rsvps')
    .select('event_id, occurrence_date')
    .eq('user_id', userId)
    .eq('status', 'going');

  if (!rsvps || rsvps.length === 0) return;

  // 2. Filter for RSVPs happening tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const tomorrowRsvps = rsvps.filter((r: any) => {
    const rsvpDate = new Date(r.occurrence_date);
    return rsvpDate >= tomorrow && rsvpDate < dayAfterTomorrow;
  });

  if (tomorrowRsvps.length === 0) return;

  const eventIds = [...new Set(tomorrowRsvps.map((r: any) => r.event_id))];

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .in('id', eventIds);

  if (!events || events.length === 0) return;

  // 3. Notify
  const permission = await requestNotificationPermission();
  if (!permission) return;

  const notifiedKey = `notified_events_${new Date().toDateString()}`;
  const notifiedEvents = JSON.parse(localStorage.getItem(notifiedKey) || '[]');

  for (const event of events) {
    if (!notifiedEvents.includes(event.id)) {
      // Find the specific time for this event from the RSVP
      const rsvp = tomorrowRsvps.find((r: any) => r.event_id === event.id);
      const eventDate = rsvp ? new Date(rsvp.occurrence_date) : new Date(event.date);

      showBrowserNotification(`Upcoming Event: ${event.title}`, {
        body: `You have an event tomorrow at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${event.location || 'No location'}`,
        icon: event.poster_url || '/favicon.ico'
      });
      notifiedEvents.push(event.id);
    }
  }

  localStorage.setItem(notifiedKey, JSON.stringify(notifiedEvents));
};
