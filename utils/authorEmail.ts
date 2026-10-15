/**
 * The email that tells someone their submission was approved or declined, as a mailto: link
 * that opens it in the admin's own mail, for when the server sends no emails itself. Same words
 * as the server's emails (server/notifications.ts).
 */
import type { Event } from '../types.ts';
import { approvedEmail, declinedEmail, type NotifiedEvent } from '../server/notifications.ts';

const iso = (d?: Date): string | null => (d && !isNaN(d.getTime()) ? d.toISOString() : null);

const notified = (event: Event): NotifiedEvent => {
  const rule = event.recurrence;
  return {
    title: event.title,
    date: event.date.toISOString(),
    location: event.location,
    recurrence_type: rule?.type ?? null,
    recurrence_interval: rule?.interval ?? null,
    recurrence_end_date: iso(rule?.endDate),
    recurrence_occurrences: rule?.occurrences ?? null,
    recurrence_custom_dates: rule?.type === 'custom' ? (rule.customDates ?? []).map((d) => d.toISOString()) : null,
    submitter_name: event.submitterName ?? null,
    submitter_email: event.submitterEmail ?? null,
    extra_contacts: event.extraContacts ?? null
  };
};

/** mailto: link with the subject and text filled in (line breaks as CRLF, RFC 6068) */
const mailto = (to: string, message: { subject: string; text: string }): string =>
  `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}` +
  `?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.text.replace(/\n/g, '\r\n'))}`;

/** "Your event is on the CCP calendar", with a link to it; null when there is no address */
export const approvedMailto = (event: Event, eventUrl: string): string | null =>
  event.submitterEmail?.trim()
    ? mailto(event.submitterEmail, approvedEmail(notified(event), new URL(eventUrl).origin, eventUrl))
    : null;

/** "This time it has not been added", with the reason if one was given; null when there is no address */
export const declinedMailto = (event: Event, reason = ''): string | null =>
  event.submitterEmail?.trim() ? mailto(event.submitterEmail, declinedEmail(notified(event), reason)) : null;

/** "Sam" from "Sam Staff", for "Email Sam" */
export const firstName = (name?: string): string => name?.trim().split(/\s+/)[0] ?? '';
