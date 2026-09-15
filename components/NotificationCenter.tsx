import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, Trash2, Calendar, Users, AlertCircle } from 'lucide-react';
import { Notification, getNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../services/notificationService';
import { Event } from '../types';

interface NotificationCenterProps {
  userId: string;
  events?: Event[];
  userRsvpEventIds?: Set<string>;
  className?: string;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId, events = [], userRsvpEventIds = new Set(), className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter upcoming events that user has RSVP'd to
  const upcomingRsvpEvents = React.useMemo(() => {
    const now = new Date();
    const rsvpEvents: Event[] = [];
    const eventsMap = new Map(events.map(e => [e.id, e]));

    userRsvpEventIds.forEach((rsvpId: string) => {
      // 1. Try exact match (simple ID)
      if (eventsMap.has(rsvpId)) {
        const event = eventsMap.get(rsvpId)!;
        if (new Date(event.date) > now) {
          rsvpEvents.push(event);
        }
        return;
      }

      // 2. Try composite ID (eventId_timestamp)
      // Format from rsvpService: `${event_id}_${occurrence_date.getTime()}`
      const lastUnderscoreIndex = rsvpId.lastIndexOf('_');
      if (lastUnderscoreIndex !== -1) {
        const eventId = rsvpId.substring(0, lastUnderscoreIndex);
        const timestampStr = rsvpId.substring(lastUnderscoreIndex + 1);
        const timestamp = parseInt(timestampStr, 10);

        if (eventsMap.has(eventId) && !isNaN(timestamp)) {
          const baseEvent = eventsMap.get(eventId)!;
          const instanceDate = new Date(timestamp);

          if (instanceDate > now) {
            // Create a virtual instance for this RSVP
            rsvpEvents.push({
              ...baseEvent,
              id: rsvpId, // Use unique composite ID
              date: instanceDate // Use specific instance date
            });
          }
        }
      }
    });

    return rsvpEvents
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [events, userRsvpEventIds]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, userId]);

  // Real-time updates simulation or actual subscription if available
  // notificationService mock doesn't support subscribeToNotifications yet in this file's imports?
  // checking imports... yes I added subscribeToNotifications but it might not handle the mock correctly.
  // Actually notificationService.ts provided in step 60 DOES NOT export subscribeToNotifications.
  // So I cannot import it. I will remove it from imports.

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await getNotifications(userId);
      setNotifications(data);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'event_reminder':
      case 'event_created':
      case 'event_updated':
        return <Calendar className="h-5 w-5" />;
      case 'rsvp_update':
        return <Users className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative ${className || 'p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 max-h-[calc(100vh-5rem)] overflow-hidden flex flex-col animate-slide-down origin-top-right">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h3>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="p-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                  title="Mark all as read"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {/* Upcoming RSVP Events Section */}
            {upcomingRsvpEvents.length > 0 && (
              <div className="border-b border-slate-100 dark:border-slate-700">
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/30 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Upcoming Events
                </div>
                {upcomingRsvpEvents.map(event => (
                  <div key={`upcoming-${event.id}`} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-l-2 border-green-500 bg-green-50/10">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="p-1.5 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {event.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(event.date).toLocaleDateString()} at {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-brand-600 dark:text-brand-400 mt-1 font-medium">
                          You are going!
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
            ) : notifications.length === 0 && upcomingRsvpEvents.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">No notifications</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className={`p-1.5 rounded-full ${notification.type.includes('reminder')
                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                          }`}>
                          {getIcon(notification.type)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notification.read ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{notification.message}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center space-x-1">
                        {!notification.read && (
                          <button
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(notification.id, e)}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default NotificationCenter;
