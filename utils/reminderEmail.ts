/**
 * The admins' reminder to all staff: send in your events before Friday, when the Events Digest goes
 * out, and where to send questions or suggestions about the site. Formatted like the digest's
 * covering email (emailHtml.ts) and sent the same way: the HTML is copied to be pasted into the new
 * email, with the plain text for email apps that only take that.
 */
import { REMINDER_EMAIL_TO } from '../constants/digestRecipients.ts';
import { CONTACT_EMAIL } from '../constants/support.ts';
import { toAbsoluteHttpUrl, startOfLocalDay, WEEKDAYS_LONG, MONTHS_LONG } from './digestText.ts';
import { BRAND, INK, esc, nowrap, p, smallPrint, emailButton, emailShell } from './emailHtml.ts';
import { mailtoLink } from './mailto.ts';

const FRIDAY = 5;

/** The Friday the next digest goes out: this week's, or next week's from Friday on (that day's has gone) */
export const reminderDeadline = (today: Date): Date => {
  const day = startOfLocalDay(today);
  day.setDate(day.getDate() + ((FRIDAY - day.getDay() + 7) % 7 || 7));
  return day;
};

/** "Friday 23 October" */
const deadlineOf = (today: Date): string => {
  const d = reminderDeadline(today);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
};

export const reminderEmailSubject = (today: Date): string => `Reminder: send in your events before ${deadlineOf(today)}`;

export const generateReminderEmail = (today: Date, options: { baseUrl?: string } = {}): { subject: string; body: string } => {
  const submitUrl = toAbsoluteHttpUrl('/submit', options.baseUrl);
  const lines = [
    'Hi everyone,',
    '',
    `Running an event in the coming weeks? Please send it in before ${deadlineOf(today)} so it makes it into the next Upcoming Events Digest.`,
    ''
  ];
  if (submitUrl) lines.push('Send it in here (no login needed, and you can add your flyer):', submitUrl, '');
  lines.push(
    "Already sent yours in? Thank you, there's nothing more to do.",
    '',
    `Questions or suggestions about the calendar site? Email ${CONTACT_EMAIL}.`
  );
  return { subject: reminderEmailSubject(today), body: lines.join('\n') };
};

export const generateReminderEmailHtml = (today: Date, options: { baseUrl?: string } = {}): string => {
  const submitUrl = toAbsoluteHttpUrl('/submit', options.baseUrl);
  const deadline = nowrap(esc(deadlineOf(today)));
  return emailShell({
    baseUrl: options.baseUrl,
    eyebrow: 'REMINDER',
    heading: `Send in your events before ${deadline}`,
    body: [
      p('Hi everyone,'),
      p(`Running an event in the coming weeks? Please send it in before <strong style="color:${INK};">${deadline}</strong> so it makes it into the next Upcoming Events Digest.`),
      submitUrl ? emailButton(submitUrl, 'Send in an event') : '',
      smallPrint(`${submitUrl ? 'No login needed, and you can add your flyer. ' : ''}Already sent yours in? Thank you, there's nothing more to do.`)
    ],
    note: `<strong style="color:${INK};">Questions or suggestions about the calendar site?</strong> Email <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:${BRAND};font-weight:bold;">${esc(CONTACT_EMAIL)}</a>.`
  });
};

/** New email to all staff with the reminder's subject and text filled in, for when the formatted one can't be copied */
export const generateReminderMailto = (today: Date, options: { baseUrl?: string } = {}): string =>
  mailtoLink({ to: REMINDER_EMAIL_TO, ...generateReminderEmail(today, options) });

/** New email to all staff with the subject filled in: the formatted text is pasted in from the clipboard */
export const generateReminderMailtoSubject = (today: Date): string =>
  mailtoLink({ to: REMINDER_EMAIL_TO, subject: reminderEmailSubject(today) });
