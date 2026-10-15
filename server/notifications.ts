/** Wording of the notification emails (plain text, so they read well in any mail app) */
import { describeRepeat } from '../utils/repeat.ts';

export interface NotifiedEvent {
  title: string;
  date: string;
  location?: string | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_occurrences?: number | null;
  recurrence_custom_dates?: string[] | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  extra_contacts?: Array<{ name?: string | null; email?: string | null }> | null;
}

const whenFormatter = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'Europe/Dublin',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/**
 * "Thu 15 Oct 2026, 10:00", plus "(and 3 more dates)" for picked dates or "(every week on
 * Thursday, until …)" for a repeating series
 */
export const describeWhen = (ev: NotifiedEvent): string => {
  const first = new Date(ev.date);
  const label = isNaN(first.getTime()) ? ev.date : whenFormatter.format(first);
  const repeat = describeRepeat({
    type: ev.recurrence_type,
    interval: ev.recurrence_interval,
    endDate: ev.recurrence_end_date,
    occurrences: ev.recurrence_occurrences
  }, ev.date);
  if (repeat) return `${label} (${repeat.charAt(0).toLowerCase()}${repeat.slice(1)})`;
  const more = (ev.recurrence_custom_dates?.length ?? 1) - 1;
  return more > 0 ? `${label} (and ${more} more ${more === 1 ? 'date' : 'dates'})` : label;
};

const eventLines = (ev: NotifiedEvent): string[] => [
  ev.title,
  `When: ${describeWhen(ev)}`,
  ...(ev.location?.trim() ? [`Where: ${ev.location.trim()}`] : [])
];

/** "Ann (ann@x.ie), Bob (bob@x.ie)": the contact people besides the submitter */
const otherContacts = (ev: NotifiedEvent): string =>
  (ev.extra_contacts ?? [])
    .map((c) => `${c.name?.trim() ?? ''}${c.email?.trim() ? ` (${c.email.trim()})` : ''}`.trim())
    .filter(Boolean)
    .join(', ');

export const newSubmissionEmail = (ev: NotifiedEvent, appUrl: string) => ({
  subject: `New event submitted: ${ev.title}`,
  text: [
    `${ev.submitter_name || 'A member of staff'}${ev.submitter_email ? ` (${ev.submitter_email})` : ''} submitted an event for the CCP calendar.`,
    '',
    ...eventLines(ev),
    ...(otherContacts(ev) ? [`Other contacts: ${otherContacts(ev)}`] : []),
    '',
    `Review it in the submissions inbox: ${appUrl}/?inbox`,
    '',
    'You can reply to this email to contact the person who submitted it.'
  ].join('\n')
});

/** `eventUrl`, when given, links straight to the event instead of the calendar */
export const approvedEmail = (ev: NotifiedEvent, appUrl: string, eventUrl?: string) => ({
  subject: `Your event is on the CCP calendar: ${ev.title}`,
  text: [
    `Hi ${ev.submitter_name?.trim() || 'there'},`,
    '',
    'Good news: the event you submitted has been approved and is now on the CCP calendar.',
    '',
    ...eventLines(ev),
    '',
    eventUrl ? `See it on the calendar: ${eventUrl}` : `See the calendar: ${appUrl}`,
    '',
    'Kind regards,'
  ].join('\n')
});

export const declinedEmail = (ev: NotifiedEvent, reason: string) => ({
  subject: `About the event you submitted: ${ev.title}`,
  text: [
    `Hi ${ev.submitter_name?.trim() || 'there'},`,
    '',
    'Thank you for sending in your event. This time it has not been added to the CCP calendar.',
    '',
    ...eventLines(ev),
    '',
    ...(reason.trim() ? ['Reason:', reason.trim(), ''] : []),
    'If you have any questions, just reply to this email.',
    '',
    'Kind regards,'
  ].join('\n')
});
