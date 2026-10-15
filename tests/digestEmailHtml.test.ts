import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDigestEmailHtml } from '../utils/digestEmailHtml.ts';
import { generateDigestMailtoSubject } from '../utils/digestText.ts';
import type { Event } from '../types.ts';

const BASE = 'https://ccp-event-calendar.pages.dev';
const PDF = `${BASE}/api/file/digests/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events.pdf`;
const start = new Date(2026, 9, 12);
const end = new Date(2026, 9, 26, 23, 59, 59, 999);

const ev = (id: string, date: Date, extra: Partial<Event> = {}): Event => ({
  id, title: id, description: '', location: '', status: 'published', createdAt: new Date(2026, 0, 1), date, ...extra
});

test('a long series reads "every Thursday" in bold, then its dates by month', () => {
  const dinner = { title: 'Communal Dinner', location: 'Outreach Office', recurrence: { type: 'weekly' as const } };
  const html = generateDigestEmailHtml(
    [0, 7, 14, 21, 28, 35].map((d) => ev('dinner', new Date(2026, 9, 15 + d, 12, 30), dinner)),
    new Date(2026, 9, 15), new Date(2026, 10, 30, 23, 59), { baseUrl: BASE, pdfUrl: PDF }
  );
  assert.ok(html.includes('Also on <strong style="color:#222222;">every Thursday</strong>: 22, 29 Oct · 5, 12, 19 Nov'));
});

test('the formatted email has a clickable button to the PDF and lists each event once, in date order', () => {
  const lunch = { title: "Togher Men's Lunch Club", location: "O'Connell Court, Togher", category: 'Health & Wellbeing' };
  const html = generateDigestEmailHtml([
    ev('dance', new Date(2026, 9, 18, 15), { title: 'Sunday Tea Dance', endDate: new Date(2026, 9, 18, 18), location: 'The HUT' }),
    ev('lunch', new Date(2026, 9, 13, 13), { ...lunch, endDate: new Date(2026, 9, 13, 15) }),
    ev('lunch', new Date(2026, 9, 20, 13), { ...lunch, endDate: new Date(2026, 9, 20, 15) }),
    ev('draft', new Date(2026, 9, 14, 10), { title: 'Not approved yet', status: 'draft' })
  ], start, end, { baseUrl: BASE, pdfUrl: PDF });

  assert.ok(html.includes(`<a href="${PDF}"`), 'the PDF link is a real link');
  assert.match(html, /Click here for details/);
  assert.equal(html.split('12 – 26 October 2026').length, 2, 'the period is shown once, beside the logo');
  assert.ok(html.includes('<span style="white-space:nowrap;">12 – 26 October 2026</span>'), 'one month stays on one line');
  const twoMonths = generateDigestEmailHtml([], new Date(2026, 9, 23), new Date(2026, 10, 6), { baseUrl: BASE });
  assert.ok(twoMonths.includes('<span style="white-space:nowrap;">23 October –</span> <span style="white-space:nowrap;">6 November 2026</span>'), 'two months may wrap after the dash');
  assert.match(html, /UPCOMING EVENTS/);
  assert.doesNotMatch(html, /Kind regards/, "the sender's email signature follows");
  assert.match(html, /Here are our 2 upcoming events\./);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /digest|PDF|download/i, 'plain words for every reader');
  assert.ok(html.indexOf('Togher Men&#39;s Lunch Club') < html.indexOf('Sunday Tea Dance'));
  assert.equal(html.split('Togher Men&#39;s Lunch Club').length, 2, 'a repeating event is listed once');
  assert.match(html, /Also on Tue 20 Oct/);
  assert.match(html, /13:00 – 15:00/);
  assert.ok(html.includes('href="https://www.google.com/maps/search/?api=1&amp;query=O&#39;Connell%20Court%2C%20Togher"'), 'the venue links to Google Maps');
  assert.ok(!html.includes('Not approved yet'));
  assert.ok(html.includes(`${BASE}/assets/ccp-logo-v2.png`));
  assert.ok(html.includes(`href="${BASE}/submit"`));
  assert.ok(!html.includes('attached'));
});

test('text from events is escaped, and without a link the email says the PDF is attached', () => {
  const html = generateDigestEmailHtml([ev('x', new Date(2026, 9, 13, 10), { title: '<script>alert(1)</script> & "Co"', location: 'A <b>place</b>' })], start, end, { baseUrl: BASE });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;'));
  assert.ok(!html.includes('<b>place</b>'));
  assert.match(html, /Please find attached our one upcoming event\./);
  assert.doesNotMatch(html, /Click here for details/);

  const empty = generateDigestEmailHtml([], start, end, { baseUrl: BASE, pdfUrl: PDF });
  assert.match(empty, /There are no events scheduled/);
  assert.doesNotMatch(empty, /Click here for details/);
});

test('the new email opens with only the subject, for the formatted text to be pasted in', () => {
  assert.equal(
    generateDigestMailtoSubject(start, new Date(2026, 9, 26)),
    `mailto:?subject=${encodeURIComponent('Cork City Partnership: Upcoming Events Digest, 12 – 26 October 2026')}`
  );
});
