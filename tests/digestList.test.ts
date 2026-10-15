import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestList, parseDigestList } from '../utils/digestList.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event>): Event => ({
  id: 'a', title: 'Coffee morning', description: 'Tea and chats.', date: new Date(2026, 9, 20, 10), endDate: new Date(2026, 9, 20, 11, 30),
  location: 'Mahon', category: 'Community & Family', status: 'published', createdAt: new Date(2026, 9, 1),
  submitterName: 'Sam Staff', submitterEmail: 'sam@x.ie', ...over
});

const options = { startDate: new Date(2026, 9, 16), endDate: new Date(2026, 9, 30, 23, 59), previousIssue: { issued: new Date(2026, 9, 9), ids: ['old'] } };

test('the list carries what the PDF shows: day, time, place, other dates, contacts and NEW', () => {
  const list = buildDigestList([
    event({ id: 'old', title: 'Job fair', date: new Date(2026, 9, 22, 9), endDate: new Date(2026, 9, 23, 17) }),
    event({ id: 'a' }),
    event({ id: 'a', date: new Date(2026, 9, 27, 10), endDate: new Date(2026, 9, 27, 11, 30) }),
    event({ id: 'd', title: 'Draft', status: 'draft' })
  ], options);
  assert.equal(list.period, '16 – 30 October 2026');
  assert.deepEqual(list.entries.map((e) => e.title), ['Coffee morning', 'Job fair']);
  const [coffee, fair] = list.entries;
  assert.equal(coffee.day, 'Tuesday 20 October');
  assert.equal(coffee.time, '10:00 – 11:30');
  assert.equal(coffee.also, 'Tue 27 Oct');
  assert.deepEqual(coffee.contacts, [{ name: 'Sam Staff', email: 'sam@x.ie' }]);
  assert.equal(coffee.isNew, true);
  assert.equal(fair.time, '09:00 – Fri 23 Oct, 17:00');
  assert.equal(fair.isNew, false);
});

test('a stored list is read back only if it is one, and only its known fields', () => {
  const list = buildDigestList([event({})], options);
  assert.deepEqual(parseDigestList(JSON.parse(JSON.stringify(list))), list);
  assert.equal(parseDigestList(null), null);
  assert.equal(parseDigestList({ version: 2, entries: [] }), null);
  const odd = parseDigestList({ version: 1, period: 'P', entries: [{ title: 'T', day: 'D', html: '<b>x</b>', contacts: [{ name: 1 }, { email: 'e@x.ie' }] }, { title: '' }] });
  assert.deepEqual(odd, {
    version: 1, period: 'P',
    entries: [{ day: 'D', title: 'T', category: '', time: '', where: '', also: '', description: '', contacts: [{ name: '', email: 'e@x.ie' }], isNew: false }]
  });
});
