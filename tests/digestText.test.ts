import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDigestEmail, generateDigestMailto, MAILTO_MAX_LENGTH, formatPeriodShort, toAbsoluteHttpUrl } from '../utils/digestText.ts';
import type { Event } from '../types.ts';

const BASE = 'https://ccp-event-calendar.pages.dev';

const makeEvent = (id: string, date: Date, extra: Partial<Event> = {}): Event => ({
  id,
  title: id,
  description: '',
  location: '',
  status: 'published',
  createdAt: new Date(2026, 0, 1),
  date,
  ...extra,
});

const start = new Date(2026, 9, 9);
const end = new Date(2026, 9, 23, 23, 59, 59, 999);

test('email lists published events in date order with time, venue and repeat dates', () => {
  const lunch = { title: "Togher Men's Lunch Club", location: "Cork City Partnership Training room, O'Connell Court, Togher Cross, Togher." };
  const { subject, body } = generateDigestEmail(
    [
      makeEvent('dance', new Date(2026, 9, 18, 15, 0), { title: 'Sunday Tea Dance', location: 'The HUT 11 Gurranabraher Road' }),
      makeEvent('lunch', new Date(2026, 9, 13, 13, 0), lunch),
      makeEvent('lunch', new Date(2026, 9, 20, 13, 0), lunch),
      makeEvent('draft', new Date(2026, 9, 14, 10, 0), { title: 'Not approved yet', status: 'draft' }),
      makeEvent('later', new Date(2026, 10, 2, 10, 0), { title: 'Outside the period' }),
    ],
    start,
    end,
    { baseUrl: BASE }
  );

  assert.equal(subject, 'Cork City Partnership: Upcoming Events Digest, 9 – 23 October 2026');
  assert.match(body, /Upcoming Events Digest for Friday 9 October – Friday 23 October 2026\. It has 2 events:/);
  const items = body.split('\n').filter((l) => l.startsWith('• '));
  assert.deepEqual(items, [
    "• Tue 13 Oct, 13:00 – Togher Men's Lunch Club, Cork City Partnership Training room, O'Connell Court… (also Tue 20 Oct)",
    '• Sun 18 Oct, 15:00 – Sunday Tea Dance, The HUT 11 Gurranabraher Road',
  ]);
  assert.ok(!body.includes('Not approved yet'));
  assert.ok(!body.includes('Outside the period'));
  assert.ok(body.includes(`${BASE}/submit (no login needed)`));
  // No name under the sign-off
  assert.ok(body.endsWith('\n\nKind regards,'));
});

test('email says how long a multi-day event runs and leaves the time off all-day events', () => {
  const { body } = generateDigestEmail(
    [
      makeEvent('fest', new Date(2026, 9, 16, 10, 0), { title: 'Festival', endDate: new Date(2026, 9, 18, 17, 0) }),
      makeEvent('open', new Date(2026, 9, 20), { title: 'Open day', endDate: new Date(2026, 9, 20, 23, 59) }),
    ],
    start,
    end
  );
  assert.ok(body.includes('• Fri 16 Oct, 10:00 – Festival (until Sun 18 Oct)'));
  assert.ok(body.includes('• Tue 20 Oct – Open day'));
});

test('email names the first 20 events and counts the rest', () => {
  const many = Array.from({ length: 23 }, (_, i) => makeEvent(`e${i}`, new Date(2026, 9, 10, 9, i)));
  const { body } = generateDigestEmail(many, start, end);
  const items = body.split('\n').filter((l) => l.startsWith('• '));
  assert.equal(items.length, 21);
  assert.equal(items[20], '• …and 3 more events in the attached PDF');
});

/** Splits a mailto: link into its recipient, subject and body */
const parseMailto = (link: string) => {
  assert.ok(link.startsWith('mailto:'));
  const [to, query] = link.slice('mailto:'.length).split('?');
  const params = new Map(query.split('&').map((p) => {
    const [k, v] = p.split('=');
    return [k, decodeURIComponent(v)] as [string, string];
  }));
  return { to, subject: params.get('subject'), body: params.get('body'), keys: [...params.keys()] };
};

test('mailto link has no recipient, only the subject and the email text', () => {
  const events = [makeEvent('dance', new Date(2026, 9, 18, 15, 0), { title: 'Sunday Tea Dance', location: 'The HUT' })];
  const link = generateDigestMailto(events, start, end, { baseUrl: BASE });
  const { to, subject, body, keys } = parseMailto(link);
  const email = generateDigestEmail(events, start, end, { baseUrl: BASE });
  assert.equal(to, '');
  assert.deepEqual(keys, ['subject', 'body']);
  assert.equal(subject, email.subject);
  assert.equal(body, email.body.replace(/\n/g, '\r\n'));
  // Spaces must be %20: a "+" would show up in the email
  assert.ok(!link.includes('+'));
});

test('mailto link names fewer events when the full list would be too long to open', () => {
  const many = Array.from({ length: 23 }, (_, i) =>
    makeEvent(`e${i}`, new Date(2026, 9, 10 + (i % 10), 9, i), { title: `Community event number ${i}`, location: 'Cork City Partnership, Heron House, Blackpool Park' })
  );
  const link = generateDigestMailto(many, start, end, { baseUrl: BASE });
  assert.ok(link.length <= MAILTO_MAX_LENGTH, `link is ${link.length} characters`);
  const { body } = parseMailto(link);
  const items = body!.split('\r\n').filter((l) => l.startsWith('• '));
  const named = items.length - 1;
  assert.ok(named >= 1 && named < 20, `named ${named} events`);
  assert.equal(items[items.length - 1], `• …and ${23 - named} more events in the attached PDF`);
  assert.match(body!, /It has 23 events:/);
  assert.ok(body!.endsWith('\r\n\r\nKind regards,'));
});

test('mailto link keeps the whole list when it fits', () => {
  const few = Array.from({ length: 3 }, (_, i) => makeEvent(`e${i}`, new Date(2026, 9, 10, 9, i)));
  const { body } = parseMailto(generateDigestMailto(few, start, end, { baseUrl: BASE }));
  assert.equal(body!.split('\r\n').filter((l) => l.startsWith('• ')).length, 3);
  assert.ok(!body!.includes('more event'));
});

test('email for an empty period says so instead of listing nothing', () => {
  const { body } = generateDigestEmail([], start, end, { baseUrl: BASE });
  assert.match(body, /no events scheduled for 9 – 23 October 2026/);
  assert.ok(!body.includes('Please find attached'));
});

test('formatPeriodShort keeps one month or year once', () => {
  assert.equal(formatPeriodShort(new Date(2026, 9, 9), new Date(2026, 9, 9)), '9 October 2026');
  assert.equal(formatPeriodShort(new Date(2026, 9, 9), new Date(2026, 11, 15)), '9 October – 15 December 2026');
  assert.equal(formatPeriodShort(new Date(2026, 11, 28), new Date(2027, 0, 8)), '28 December 2026 – 8 January 2027');
});

test('toAbsoluteHttpUrl resolves site paths and refuses other schemes', () => {
  assert.equal(toAbsoluteHttpUrl('/submit', BASE), `${BASE}/submit`);
  assert.equal(toAbsoluteHttpUrl('https://example.org/a.png', BASE), 'https://example.org/a.png');
  assert.equal(toAbsoluteHttpUrl('javascript:alert(1)', BASE), null);
  assert.equal(toAbsoluteHttpUrl(undefined, BASE), null);
});
