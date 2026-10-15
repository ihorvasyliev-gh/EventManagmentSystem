import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventContacts, formatContact, fromContactRows, newContactRow, suggestEmailFix, toContactRows } from '../utils/contacts.ts';
import { areEventsEqual } from '../utils/eventsEqual.ts';
import { withContactsColumnFallback, withoutContactsInUrl, withoutContactsInBody } from '../services/contactsColumnFallback.ts';
import type { Event } from '../types.ts';

const event = (over: Partial<Event> = {}): Event => ({
  id: 'a', title: 'Coffee morning', description: '', date: new Date('2026-11-05T10:00:00Z'), location: 'Mahon',
  status: 'published', createdAt: new Date('2026-01-01T00:00:00Z'), ...over
});

test('an event lists the submitter first, then the other contact people, leaving out blanks', () => {
  const ev = event({
    submitterName: ' Ann ', submitterEmail: 'ann@x.ie',
    extraContacts: [{ name: 'Bob', email: 'bob@x.ie' }, { name: '  ', email: '' }, { name: 'Cat' }]
  });
  assert.deepEqual(eventContacts(ev), [{ name: 'Ann', email: 'ann@x.ie' }, { name: 'Bob', email: 'bob@x.ie' }, { name: 'Cat' }]);
  assert.deepEqual(eventContacts(event()), []);
  assert.deepEqual(eventContacts(event({ submitterEmail: 'ann@x.ie' })), [{ name: '', email: 'ann@x.ie' }]);
});

test('a contact reads as "name · email", or whichever of the two it has', () => {
  assert.equal(formatContact({ name: 'Ann', email: 'ann@x.ie' }), 'Ann · ann@x.ie');
  assert.equal(formatContact({ name: 'Ann' }), 'Ann');
  assert.equal(formatContact({ name: '', email: 'ann@x.ie' }), 'ann@x.ie');
  assert.equal(formatContact({ name: 'Ann', email: 'ann@x.ie' }, ', '), 'Ann, ann@x.ie');
});

test('form rows keep a key of their own and come back as contacts without the blank ones', () => {
  const rows = [...toContactRows([{ name: 'Bob', email: 'bob@x.ie' }]), newContactRow(), newContactRow({ name: ' Cat ' })];
  assert.equal(new Set(rows.map((r) => r.key)).size, 3);
  assert.deepEqual(fromContactRows(rows), [{ name: 'Bob', email: 'bob@x.ie' }, { name: 'Cat' }]);
});

test('a changed contact list counts as a change to the event', () => {
  const ev = event({ submitterName: 'Ann', extraContacts: [{ name: 'Bob Byrne', email: 'bob@x.ie' }] });
  assert.equal(areEventsEqual([ev], [{ ...ev, extraContacts: [{ name: 'Bob Byrne', email: 'bob@x.ie' }] }]), true);
  assert.equal(areEventsEqual([ev], [{ ...ev, extraContacts: [] }]), false);
});

test('before migration 013, events requests naming extra_contacts are sent again without it (and from then on straight away)', async () => {
  const sent: Array<{ url: string; body?: string }> = [];
  const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    sent.push({ url, body });
    return url.includes('extra_contacts') || body?.includes('extra_contacts')
      ? new Response(JSON.stringify({ code: '42703', message: 'column events.extra_contacts does not exist' }), { status: 400 })
      : new Response('[]', { status: 200 });
  }) as typeof fetch;
  const f = withContactsColumnFallback(base);
  const read = 'https://sb.test/rest/v1/events?select=id%2Csubmitter_email%2Cextra_contacts%2Ccreator_id&order=date.asc';
  assert.equal((await f(read)).status, 200);
  assert.equal(sent[1].url, 'https://sb.test/rest/v1/events?select=id%2Csubmitter_email%2Ccreator_id&order=date.asc');
  const write = await f('https://sb.test/rest/v1/events?id=eq.1&select=id,extra_contacts', { method: 'PATCH', body: JSON.stringify({ title: 'A', extra_contacts: [] }) });
  assert.equal(write.status, 200);
  assert.equal(sent.length, 3, 'once the column is known to be missing, it is left out up front');
  assert.equal(sent[2].url, 'https://sb.test/rest/v1/events?id=eq.1&select=id');
  assert.deepEqual(JSON.parse(sent[2].body!), { title: 'A' });
  // Other requests are left alone
  await f('https://sb.test/rest/v1/users?select=id');
  assert.equal(sent[3].url, 'https://sb.test/rest/v1/users?select=id');
});

test('the column comes out of a select list wherever it stands', () => {
  assert.equal(withoutContactsInUrl('https://x/rest/v1/events?select=extra_contacts,id'), 'https://x/rest/v1/events?select=id');
  assert.equal(withoutContactsInUrl('https://x/rest/v1/events?select=id,extra_contacts'), 'https://x/rest/v1/events?select=id');
  assert.equal(withoutContactsInUrl('https://x/rest/v1/events?select=id,extra_contacts&id=eq.1'), 'https://x/rest/v1/events?select=id&id=eq.1');
  assert.equal(withoutContactsInBody('[{"a":1,"extra_contacts":[]}]'), '[{"a":1}]');
});

test('an email whose domain is a letter or two off the organisation\'s own gets it suggested', () => {
  assert.equal(suggestEmailFix('cnimhaidin@pertnershipcork.ie'), 'cnimhaidin@partnershipcork.ie');
  assert.equal(suggestEmailFix(' ann@partnershipcork.i '), 'ann@partnershipcork.ie');
  assert.equal(suggestEmailFix('ann@PartnershipCork.ie'), null, 'only the case differs');
  assert.equal(suggestEmailFix('ann@partnershipcork.ie'), null);
  assert.equal(suggestEmailFix('ann@gmail.com'), null);
  assert.equal(suggestEmailFix('ann@partnershipcork.com'), null, 'too far off to guess');
  assert.equal(suggestEmailFix('ann'), null);
  assert.equal(suggestEmailFix(''), null);
});
