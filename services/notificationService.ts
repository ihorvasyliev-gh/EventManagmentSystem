import { Event } from '../types';
import { supabase } from '../lib/supabase';


export type NotificationType = 'event_reminder' | 'event_created' | 'event_updated' | 'event_cancelled' | 'rsvp_update';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  eventId?: string;
  event?: Event;
  read: boolean;
  createdAt: Date;
}

// Mock notifications storage
let MOCK_NOTIFICATIONS: Notification[] = [];

// Request browser notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
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
export const showBrowserNotification = (title: string, options?: NotificationOptions) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options
    });
  }
};

// Create notification
export const createNotification = (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification => {
  const newNotification: Notification = {
    ...notification,
    id: Math.random().toString(36).substr(2, 9),
    read: false,
    createdAt: new Date()
  };
  MOCK_NOTIFICATIONS.unshift(newNotification);
  return newNotification;
};

// Get notifications
export const getNotifications = async (userId: string, unreadOnly: boolean = false): Promise<Notification[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      let notifications = [...MOCK_NOTIFICATIONS];
      if (unreadOnly) {
        notifications = notifications.filter(n => !n.read);
      }
      resolve(notifications);
    }, 300);
  });
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const notification = MOCK_NOTIFICATIONS.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
      }
      resolve();
    }, 200);
  });
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      MOCK_NOTIFICATIONS.forEach(n => n.read = true);
      resolve();
    }, 200);
  });
};

// Delete notification
export const deleteNotification = async (notificationId: string): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      MOCK_NOTIFICATIONS = MOCK_NOTIFICATIONS.filter(n => n.id !== notificationId);
      resolve();
    }, 200);
  });
};

// Schedule event reminder
export const scheduleEventReminder = (event: Event, reminderMinutes: number): void => {
  const reminderTime = new Date(event.date.getTime() - reminderMinutes * 60 * 1000);
  const now = new Date();
  const delay = reminderTime.getTime() - now.getTime();

  if (delay > 0) {
    setTimeout(() => {
      createNotification({
        type: 'event_reminder',
        title: `Reminder: ${event.title}`,
        message: `Event "${event.title}" starts in ${reminderMinutes} minutes`,
        eventId: event.id,
        event
      });
      showBrowserNotification(`Reminder: ${event.title}`, {
        body: `Event starts in ${reminderMinutes} minutes at ${event.location}`,
        tag: `event-reminder-${event.id}`
      });
    }, delay);
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
