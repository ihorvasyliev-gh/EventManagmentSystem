import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reminderDeadline, generateReminderEmail, generateReminderEmailHtml, generateReminderMailto, generateReminderMailtoSubject
} from '../utils/reminderEmail.ts';

const BASE = 'https://ccp-event-calendar.pages.dev';
const monday = new Date(2026, 9, 19, 9, 30);

test('the deadline is the coming Friday, and next week\'s from Friday on', () => {
  const friday = (d: Date) => reminderDeadline(d).toDateString();
  assert.equal(friday(monday), new Date(2026, 9, 23).toDateString());
  assert.equal(friday(new Date(2026, 9, 22, 17)), new Date(2026, 9, 23).toDateString());
  // That day's digest has gone out
  assert.equal(friday(new Date(2026, 9, 23, 8)), new Date(2026, 9, 30).toDateString());
  assert.equal(friday(new Date(2026, 9, 25)), new Date(2026, 9, 30).toDateString());
  assert.equal(friday(new Date(2026, 11, 28)), new Date(2027, 0, 1).toDateString());
});

test('the new email goes to all staff only, with the subject, for the formatted text to be pasted in', () => {
  assert.equal(
    generateReminderMailtoSubject(monday),
    `mailto:allstaff@partnershipcork.ie?subject=${encodeURIComponent('Reminder: send in your events before Friday 23 October')}`
  );
});

test('without the clipboard the plain text goes in the new email', () => {
  const link = generateReminderMailto(monday, { baseUrl: BASE });
  const [to, query] = link.slice('mailto:'.length).split('?');
  assert.equal(to, 'allstaff@partnershipcork.ie');
  const params = new Map(query.split('&').map((pair) => pair.split('=') as [string, string]));
  assert.deepEqual([...params.keys()], ['subject', 'body']);
  const body = decodeURIComponent(params.get('body')!);
  assert.equal(body, generateReminderEmail(monday, { baseUrl: BASE }).body.replace(/\n/g, '\r\n'));
  assert.ok(!link.includes('+'));
});

test('the text asks for events before Friday for the digest, links the form and names who to ask about the site', () => {
  const { body } = generateReminderEmail(monday, { baseUrl: BASE });
  assert.match(body, /^Hi everyone,/);
  assert.match(body, /before Friday 23 October so it makes it into the next Upcoming Events Digest/);
  assert.ok(body.split('\n').includes(`${BASE}/submit`));
  assert.match(body, /Questions or suggestions about the calendar site\? Email ivasyliev@partnershipcork\.ie\./);
});

test('the formatted email has the digest\'s look, a button to the form and a link to write to', () => {
  const html = generateReminderEmailHtml(monday, { baseUrl: BASE });
  assert.match(html, />REMINDER</);
  assert.ok(html.includes('Send in your events before <span style="white-space:nowrap;">Friday 23 October</span>'));
  assert.ok(html.includes(`<a href="${BASE}/submit"`), 'the button opens the form');
  assert.match(html, /Send in an event/);
  assert.ok(html.includes('href="mailto:ivasyliev@partnershipcork.ie"'));
  assert.ok(html.includes(`${BASE}/assets/ccp-logo-v2.png`));
  assert.ok(html.includes('bgcolor="#B90B4F"'), 'colour from cell backgrounds, which the new Outlook keeps');
  assert.doesNotMatch(html, /martin_davoren|kieran_oconnell/);
});
