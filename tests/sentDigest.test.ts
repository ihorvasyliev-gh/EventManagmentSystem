import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUpdatable, issuedDay, sentDigestChanges, sentOn, nameEvents } from '../utils/sentDigest.ts';
import { buildDigestList } from '../utils/digestList.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event>): Event => ({
  id: 'a', title: 'Coffee morning', description: 'Tea and chats.', date: new Date(2026, 9, 26, 10), endDate: new Date(2026, 9, 26, 11, 30),
  location: 'Mahon', category: 'Community & Family', status: 'published', createdAt: new Date(2026, 9, 1),
  submitterName: 'Sam Staff', submitterEmail: 'sam@x.ie', ...over
});

const key = 'digests/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events-2026-10-23-to-2026-11-06.pdf';
const period = { startDate: new Date(2026, 9, 23), endDate: new Date(2026, 10, 6, 23, 59, 59, 999) };

const calendar = [
  event({ id: 'a' }),
  event({ id: 'b', title: 'Job fair', date: new Date(2026, 9, 28, 9), endDate: new Date(2026, 9, 28, 13) }),
  event({ id: 'c', title: 'Tea dance', date: new Date(2026, 9, 30, 15), endDate: new Date(2026, 9, 30, 17) })
];
const sent = { digest: { issued: '2026-10-23', key }, list: buildDigestList(calendar, period) };

test('a digest can be updated for a week after it went out', () => {
  assert.equal(isUpdatable('2026-10-23', new Date(2026, 9, 23, 9)), true);
  assert.equal(isUpdatable('2026-10-23', new Date(2026, 9, 29, 23, 59)), true);
  assert.equal(isUpdatable('2026-10-23', new Date(2026, 9, 30, 0, 1)), false);
  assert.equal(issuedDay('2026-10-23').getTime(), new Date(2026, 9, 23).getTime());
});

test('nothing changed: the digest that went out matches the calendar', () => {
  const found = sentDigestChanges(sent, calendar);
  assert.deepEqual(found?.changed, []);
  assert.equal(found?.start.getTime(), new Date(2026, 9, 23).getTime());
  assert.equal(found?.end.getTime(), new Date(2026, 10, 6, 23, 59, 59, 999).getTime());
});

test('an event moved, added or taken out of the period since the digest went out is named', () => {
  const now = [
    // Maebh picked the wrong day
    event({ id: 'a', date: new Date(2026, 9, 27, 10), endDate: new Date(2026, 9, 27, 11, 30) }),
    calendar[1],
    // Moved out of the period
    event({ id: 'c', title: 'Tea dance', date: new Date(2026, 10, 20, 15), endDate: new Date(2026, 10, 20, 17) }),
    event({ id: 'd', title: 'Book club', date: new Date(2026, 10, 2, 18), endDate: new Date(2026, 10, 2, 19) })
  ];
  assert.deepEqual(sentDigestChanges(sent, now)?.changed, ['Coffee morning', 'Book club', 'Tea dance']);
});

test('without a list to compare with, or a digest to compare, nothing is claimed', () => {
  assert.equal(sentDigestChanges({ ...sent, list: null }, calendar)?.changed, null);
  assert.equal(sentDigestChanges(null, calendar), null);
  assert.equal(sentDigestChanges({ ...sent, digest: { issued: '2026-10-23', key: 'digests/odd.pdf' } }, calendar), null);
});

test('when it went out, and the events named in a line', () => {
  assert.equal(sentOn(new Date(2026, 9, 23), new Date(2026, 9, 23, 17)), 'today');
  assert.equal(sentOn(new Date(2026, 9, 23), new Date(2026, 9, 24)), 'on Fri 23 Oct');
  assert.equal(nameEvents(['A']), 'A');
  assert.equal(nameEvents(['A', 'B']), 'A and B');
  assert.equal(nameEvents(['A', 'B', 'C']), 'A, B and C');
  assert.equal(nameEvents(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more');
});
