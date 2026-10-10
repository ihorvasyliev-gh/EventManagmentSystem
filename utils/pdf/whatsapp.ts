import { type Event } from '../../types';
import { isMultiDayEvent } from '../date';
import { formatAlsoOnDates } from '../digestGrouping';
import { toAbsoluteHttpUrl, toDate, MONTHS_LONG, WEEKDAYS_LONG, digestGroupsFor } from '../digestText.ts';
import { formatDateRange, formatEventTime } from './dates';

/**
 * Generate a preformatted text digest for WhatsApp groups (clean plain text without * or _ formatting).
 * `baseUrl` (the site) adds links to the live calendar and the submission form at the end.
 */
export const generateWhatsAppSummary = (
  events: Event[],
  startDate: Date | string,
  endDate: Date | string,
  baseUrl?: string
): string => {
  const cleanWa = (val?: string | null) => (val || '').replace(/[*_]/g, '').trim();

  // Repeated occurrences of one event are listed once, on their first date, with "Also on" dates
  const groups = digestGroupsFor(events, startDate, endDate);

  const dateRangeStr = cleanWa(formatDateRange(startDate, endDate));

  let text = `📅 CORK CITY PARTNERSHIP — UPCOMING EVENTS\n`;
  text += `Schedule: ${dateRangeStr}\n`;
  text += `────────────────────────────\n\n`;

  const calendarUrl = toAbsoluteHttpUrl('/', baseUrl);
  const submitUrl = toAbsoluteHttpUrl('/submit', baseUrl);
  const links = () => {
    let out = `────────────────────────────\n`;
    if (calendarUrl) out += `📌 Live calendar: ${calendarUrl}\n`;
    if (submitUrl) out += `✍️ Running an event? Send it in (no login needed): ${submitUrl}`;
    return out.trimEnd();
  };

  if (groups.length === 0) {
    text += `No upcoming events scheduled for this period.\n\n`;
    return calendarUrl ? text + links() : text;
  }

  // Group by date
  let currentDateGroup = '';

  groups.forEach((group) => {
    const ev = group.event;
    const evDate = toDate(ev.date) || new Date();
    const isMulti = isMultiDayEvent(ev.date, ev.endDate);
    const evDateStr = `${WEEKDAYS_LONG[evDate.getDay()]} ${evDate.getDate()} ${MONTHS_LONG[evDate.getMonth()]}`;

    if (isMulti && ev.endDate) {
      const multiHeader = `${formatDateRange(ev.date, ev.endDate)} (Multi-day)`;
      if (multiHeader !== currentDateGroup) {
        currentDateGroup = multiHeader;
        text += `🗓 ${cleanWa(currentDateGroup)}\n`;
      }
    } else if (evDateStr !== currentDateGroup) {
      currentDateGroup = evDateStr;
      text += `🗓 ${cleanWa(currentDateGroup)}\n`;
    }

    const timeStr = cleanWa(formatEventTime(ev.date, ev.endDate));
    const titleStr = cleanWa(ev.title);
    text += `⏰ ${timeStr} | ${titleStr}\n`;
    const alsoOn = cleanWa(formatAlsoOnDates(group, '; '));
    if (alsoOn) {
      text += `🔁 Also on: ${alsoOn}\n`;
    }
    if (ev.location) {
      const cleanLoc = cleanWa(ev.location);
      if (cleanLoc) {
        text += `📍 Venue: ${cleanLoc}\n`;
      }
    }
    if (ev.category) {
      text += `🏷 Category: ${cleanWa(ev.category)}\n`;
    }
    if (ev.description) {
      const firstLines = ev.description.split('\n').filter(Boolean).slice(0, 2).join(' ');
      const cleanDesc = cleanWa(firstLines);
      if (cleanDesc) {
        text += `ℹ️ ${cleanDesc}\n`;
      }
    }
    if (ev.submitterName) {
      // The email lets people ask the organiser directly
      text += `👤 Contact: ${cleanWa(ev.submitterName)}${ev.submitterEmail ? ` (${ev.submitterEmail.trim()})` : ''}\n`;
    }
    text += `\n`;
  });

  return text + (calendarUrl ? links() : `────────────────────────────\n📌 PDF Digest & Calendar: Check company portal.`);
};
