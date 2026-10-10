/** Calendar and map links, used by the digest's cards and buttons */
import { toDate } from '../digestText.ts';

// ---------------------------------------------------------------------------
// Calendar / map links (also used by the digest cards)
// ---------------------------------------------------------------------------

/**
 * Generate deep link for adding an event directly into Google Calendar on the Web
 */
export const createGoogleCalendarUrl = (event: {
  title: string;
  description?: string;
  location?: string;
  date: Date | string;
  endDate?: Date | string;
}): string => {
  const start = toDate(event.date) || new Date();
  const end = toDate(event.endDate) || new Date(start.getTime() + 60 * 60 * 1000);

  const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Event',
    dates: `${formatGCalDate(start)}/${formatGCalDate(end)}`,
  });

  if (event.location) {
    params.set('location', event.location);
  }
  if (event.description) {
    const descShort = event.description.length > 1000 ? event.description.slice(0, 1000) : event.description;
    params.set('details', descShort);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * Generate deep link for adding an event directly into Outlook 365 on the Web
 */
export const createOutlookWebUrl = (event: {
  title: string;
  description?: string;
  location?: string;
  date: Date | string;
  endDate?: Date | string;
}): string => {
  const start = toDate(event.date) || new Date();
  const end = toDate(event.endDate) || new Date(start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title || 'Event',
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });

  if (event.location) {
    params.set('location', event.location);
  }
  if (event.description) {
    params.set('body', event.description);
  }

  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
};

export const createGoogleMapsUrl = (location: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
};
