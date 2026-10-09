import type { Event } from '../types.ts';
import { isMultiDayEvent } from './date.ts';
import { groupDigestOccurrences, formatAlsoOnDates, type DigestEventGroup, monthShort } from './digestGrouping.ts';

/**
 * Plain-text parts of the Events Digest (the covering email) and the date / link helpers the
 * PDF shares with them. No jsPDF here, so it loads in unit tests.
 */

/**
 * Links inside a PDF or an email must be absolute: a site-relative poster URL ("/api/file/…")
 * would open as a file on the reader's computer. Returns null when no web link can be made.
 */
export const toAbsoluteHttpUrl = (url: string | undefined, base = typeof window !== 'undefined' ? window.location.origin : ''): string | null => {
  if (!url) return null;
  try {
    const abs = new URL(url, base || undefined);
    return abs.protocol === 'https:' || abs.protocol === 'http:' ? abs.href : null;
  } catch {
    return null;
  }
};

export const toDate = (d: Date | string | number | undefined | null): Date | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
};

export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad2 = (n: number) => String(n).padStart(2, '0');
export const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** True for events without a meaningful time (starting at midnight and not ending at a set time) */
export const isAllDay = (start: Date, end: Date | null): boolean =>
  start.getHours() === 0 && start.getMinutes() === 0 &&
  (!end || (end.getHours() === 23 && end.getMinutes() >= 59) || (end.getHours() === 0 && end.getMinutes() === 0));

/** "Friday 25 September – Friday 9 October 2026" (year shown once when shared) */
export const formatLongRange = (s: Date, e: Date): string => {
  const long = (d: Date, withYear: boolean) =>
    `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
  if (startOfLocalDay(s).getTime() === startOfLocalDay(e).getTime()) return long(s, true);
  return `${long(s, s.getFullYear() !== e.getFullYear())} – ${long(e, true)}`;
};

/** Published occurrences inside the period, merged per event (as in the PDF) */
export const digestGroupsFor = (events: Event[], startDate: Date | string, endDate: Date | string): DigestEventGroup[] => {
  const startMs = (toDate(startDate) || new Date()).getTime();
  const endMs = (toDate(endDate) || new Date()).getTime();
  return groupDigestOccurrences(
    events.filter((e) => {
      // Drafts and pending submissions are never circulated
      if (e.status && e.status !== 'published') return false;
      const d = toDate(e.date);
      if (!d) return false;
      const t = d.getTime();
      return t >= startMs && t <= endMs;
    })
  );
};

/** "9 – 23 October 2026", "9 October – 15 December 2026" */
export const formatPeriodShort = (start: Date, end: Date): string => {
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear && start.getMonth() === end.getMonth()) {
    return start.getDate() === end.getDate()
      ? `${start.getDate()} ${MONTHS_LONG[end.getMonth()]} ${end.getFullYear()}`
      : `${start.getDate()} – ${end.getDate()} ${MONTHS_LONG[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS_LONG[start.getMonth()]}${sameYear ? '' : ` ${start.getFullYear()}`} – ${end.getDate()} ${MONTHS_LONG[end.getMonth()]} ${end.getFullYear()}`;
};

/** Cuts long text at a comma or space before `max` characters ("Training room, O'Connell Court…") */
const shorten = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const at = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(' '));
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
};

export interface DigestEmail {
  subject: string;
  body: string;
}

/** Most events listed by name in the email; the rest are counted ("…and 4 more") */
const EMAIL_LIST_LIMIT = 20;

/**
 * Covering email for the PDF (the routine sends it to the Board and staff every fortnight):
 * subject, greeting, one line per event, how to send in an event, and a sign-off from the
 * organisation. No one's name is in it. `listLimit` caps how many events are named.
 */
export const generateDigestEmail = (
  events: Event[],
  startDate: Date,
  endDate: Date,
  options: { baseUrl?: string; listLimit?: number } = {}
): DigestEmail => {
  const groups = digestGroupsFor(events, startDate, endDate);
  const period = formatPeriodShort(startDate, endDate);
  const subject = `Cork City Partnership: Upcoming Events Digest, ${period}`;
  const listLimit = Math.max(1, options.listLimit ?? EMAIL_LIST_LIMIT);

  const lines: string[] = ['Dear Board Members and Colleagues,', ''];
  if (groups.length === 0) {
    lines.push(`There are no events scheduled for ${period} yet, so there is no digest this time.`);
  } else {
    lines.push(
      `Please find attached our Upcoming Events Digest for ${formatLongRange(startDate, endDate)}. ` +
      (groups.length === 1 ? 'It has one event:' : `It has ${groups.length} events:`),
      ''
    );
    groups.slice(0, listLimit).forEach((group) => {
      const ev = group.event;
      const s = toDate(ev.date) || startDate;
      const e = toDate(ev.endDate);
      const when = `${WEEKDAYS_LONG[s.getDay()].slice(0, 3)} ${s.getDate()} ${monthShort(s)}${isAllDay(s, e) ? '' : `, ${clock(s)}`}`;
      const venue = ev.location?.trim() ? `, ${shorten(ev.location.trim().replace(/\s+/g, ' '), 60)}` : '';
      const alsoOn = formatAlsoOnDates(group, ', ');
      const until = e && isMultiDayEvent(s, e) ? ` (until ${WEEKDAYS_LONG[e.getDay()].slice(0, 3)} ${e.getDate()} ${monthShort(e)})` : '';
      lines.push(`• ${when} – ${ev.title.trim()}${until}${venue}${alsoOn ? ` (also ${alsoOn})` : ''}`);
    });
    if (groups.length > listLimit) {
      const more = groups.length - listLimit;
      lines.push(`• …and ${more} more ${more === 1 ? 'event' : 'events'} in the attached PDF`);
    }
    lines.push(
      '',
      'Each event in the PDF has its venue (with a map link), a contact, and buttons to add it to your Outlook or Google calendar.'
    );
  }
  const submitUrl = toAbsoluteHttpUrl('/submit', options.baseUrl);
  if (submitUrl) {
    lines.push('', `Running an event? Send it in at ${submitUrl} (no login needed) and it will be in the next digest.`);
  }
  lines.push('', 'Kind regards,', 'Cork City Partnership CLG');

  return { subject, body: lines.join('\n') };
};

/**
 * Chrome and Edge on Windows ignore a mailto: link over 2,048 characters, so for a busy period
 * the email app would not open at all. 2,000 leaves a margin.
 */
export const MAILTO_MAX_LENGTH = 2000;

/** mailto: link with no recipient, the subject and the text (line breaks as CRLF, RFC 6068) */
const toMailto = ({ subject, body }: DigestEmail): string =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;

/**
 * Link that opens a new email with the subject and text filled in and no recipient; the PDF is
 * attached by hand (a link cannot carry a file). When the full list makes the link too long,
 * fewer events are named and the rest counted ("…and 6 more events in the attached PDF").
 */
export const generateDigestMailto = (
  events: Event[],
  startDate: Date,
  endDate: Date,
  options: { baseUrl?: string; maxLength?: number } = {}
): string => {
  const maxLength = options.maxLength ?? MAILTO_MAX_LENGTH;
  let limit = Math.min(EMAIL_LIST_LIMIT, digestGroupsFor(events, startDate, endDate).length);
  let link = toMailto(generateDigestEmail(events, startDate, endDate, { baseUrl: options.baseUrl, listLimit: limit }));
  while (link.length > maxLength && limit > 1) {
    limit -= 1;
    link = toMailto(generateDigestEmail(events, startDate, endDate, { baseUrl: options.baseUrl, listLimit: limit }));
  }
  return link;
};
