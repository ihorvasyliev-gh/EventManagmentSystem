import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAddresses, parseRecipientSettings, sameRecipients, MAX_RECIPIENTS } from '../utils/emailRecipients.ts';
import { DEFAULT_EMAIL_RECIPIENTS } from '../constants/digestRecipients.ts';
import { mailtoLink } from '../utils/mailto.ts';
import { generateReminderMailto, generateReminderMailtoSubject } from '../utils/reminderEmail.ts';
import { generateDigestMailto, generateDigestMailtoSubject, MAILTO_MAX_LENGTH } from '../utils/digestText.ts';
import { onRequestGet, onRequestPut } from '../functions/api/email-recipients.ts';
import { RECIPIENTS_KEY } from '../server/emailRecipients.ts';
import { mockFetch, authRoutes, env } from './support/mockFetch.ts';
import type { Event } from '../types.ts';

test('addresses are picked out of typed or pasted text, as Outlook copies them too', () => {
  assert.deepEqual(splitAddresses('ada@x.ie, bob@y.com;carol@z.org\ndan@w.ie  eve@v.ie'), {
    addresses: ['ada@x.ie', 'bob@y.com', 'carol@z.org', 'dan@w.ie', 'eve@v.ie'],
    invalid: []
  });
  assert.deepEqual(splitAddresses('Ada Admin <ada@x.ie>; "Barry, Brenda" <brenda@x.ie>; mailto:sam@x.ie'), {
    addresses: ['ada@x.ie', 'brenda@x.ie', 'sam@x.ie'],
    invalid: []
  });
  assert.deepEqual(splitAddresses('ada@x.ie, brenda, sam@x'), { addresses: ['ada@x.ie'], invalid: ['brenda', 'sam@x'] });
  assert.deepEqual(splitAddresses('  ,; '), { addresses: [], invalid: [] });
});

test('settings from a request or the stored file are checked: real addresses, at least one per email', () => {
  const good = { digest: { to: ['a@x.ie'], cc: [' b@x.ie', 'B@x.ie'], bcc: [] }, reminder: { to: [], cc: [], bcc: ['c@x.ie'] } };
  assert.deepEqual(parseRecipientSettings(good), {
    digest: { to: ['a@x.ie'], cc: ['b@x.ie'], bcc: [] },
    reminder: { to: [], cc: [], bcc: ['c@x.ie'] }
  });
  // CC and BCC may be left out
  assert.deepEqual(parseRecipientSettings({ digest: { to: ['a@x.ie'] }, reminder: { to: ['a@x.ie'] } })?.reminder, { to: ['a@x.ie'], cc: [], bcc: [] });

  assert.equal(parseRecipientSettings(null), null);
  assert.equal(parseRecipientSettings({ digest: good.digest }), null);
  assert.equal(parseRecipientSettings({ ...good, reminder: { to: [], cc: [], bcc: [] } }), null);
  assert.equal(parseRecipientSettings({ ...good, reminder: { to: ['not an address'] } }), null);
  assert.equal(parseRecipientSettings({ ...good, reminder: { to: ['a@x.ie?cc=evil@y.ie'] } }), null);
  assert.equal(parseRecipientSettings({ ...good, reminder: { to: 'a@x.ie' } }), null);
  assert.equal(parseRecipientSettings({ ...good, reminder: { to: Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@x.ie`) } }), null);
});

test('the defaults are today\'s addresses: the digest CCs the two council contacts, the reminder goes to all staff only', () => {
  assert.deepEqual(DEFAULT_EMAIL_RECIPIENTS.digest, {
    to: ['allstaff@partnershipcork.ie'], cc: ['martin_davoren@corkcity.ie', 'kieran_oconnell@corkcity.ie'], bcc: []
  });
  assert.deepEqual(DEFAULT_EMAIL_RECIPIENTS.reminder, { to: ['allstaff@partnershipcork.ie'], cc: [], bcc: [] });
  assert.ok(sameRecipients(DEFAULT_EMAIL_RECIPIENTS.reminder, { to: ['AllStaff@partnershipcork.ie'], cc: [], bcc: [] }));
  assert.ok(!sameRecipients(DEFAULT_EMAIL_RECIPIENTS.reminder, DEFAULT_EMAIL_RECIPIENTS.digest));
});

test('a mailto: link carries To, CC and BCC, and an empty To still opens', () => {
  assert.equal(
    mailtoLink({ to: ['a@x.ie', 'b@x.ie'], cc: ['c@x.ie'], bcc: ['d@x.ie', "o'neill@x.ie"], subject: 'Hi there' }),
    "mailto:a@x.ie,b@x.ie?cc=c@x.ie&bcc=d@x.ie,o'neill@x.ie&subject=Hi%20there"
  );
  assert.equal(mailtoLink({ to: [], bcc: ['d@x.ie'], subject: 'Hi' }), 'mailto:?bcc=d@x.ie&subject=Hi');
});

const monday = new Date(2026, 9, 19, 9, 30);
const chosen = { to: ['team@x.ie'], cc: ['boss@x.ie'], bcc: ['quiet@x.ie'] };

test('the reminder and the digest each open with their own saved recipients', () => {
  assert.match(generateReminderMailtoSubject(monday, chosen), /^mailto:team@x\.ie\?cc=boss@x\.ie&bcc=quiet@x\.ie&subject=Reminder/);
  assert.match(generateReminderMailto(monday, { baseUrl: 'https://cal.test', recipients: chosen }), /^mailto:team@x\.ie\?cc=boss@x\.ie&bcc=quiet@x\.ie&subject=.+&body=/);

  const start = new Date(2026, 9, 12);
  const end = new Date(2026, 9, 26);
  assert.match(generateDigestMailtoSubject(start, end, chosen), /^mailto:team@x\.ie\?cc=boss@x\.ie&bcc=quiet@x\.ie&subject=Cork%20City/);
  // More recipients still keep the link short enough to open, naming fewer events
  const many = { to: Array.from({ length: 10 }, (_, i) => `person.number.${i}@partnershipcork.ie`), cc: [], bcc: ['quiet@x.ie'] };
  const events = Array.from({ length: 20 }, (_, i): Event => ({
    id: `e${i}`, title: `Event ${i}`, description: '', location: 'Hub', status: 'published',
    createdAt: new Date(2026, 0, 1), date: new Date(2026, 9, 13 + (i % 10), 10)
  }));
  const link = generateDigestMailto(events, start, end, { baseUrl: 'https://cal.test', recipients: many });
  assert.ok(link.startsWith('mailto:person.number.0@partnershipcork.ie,'));
  assert.ok(link.length <= MAILTO_MAX_LENGTH, `link is ${link.length} characters`);
});

/** An R2 bucket that keeps what was put in it */
const bucket = () => {
  const contents = new Map<string, Blob>();
  return {
    contents,
    put: async (key: string, value: unknown) => {
      contents.set(key, value as Blob);
      return {};
    },
    get: async (key: string) => {
      const value = contents.get(key);
      return value ? { text: () => value.text() } : null;
    },
    delete: async (key: string) => {
      contents.delete(key);
    }
  };
};

const ask = (token?: string, recipients?: unknown) =>
  new Request('https://app.test/api/email-recipients', {
    method: recipients === undefined ? 'GET' : 'PUT',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: recipients === undefined ? undefined : JSON.stringify({ recipients })
  });

test('admins see the defaults until they save their own, which every admin then gets', async () => {
  mockFetch(authRoutes);
  const BUCKET = bucket();
  let res = await onRequestGet({ request: ask('admin-token'), env: { ...env, BUCKET } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { recipients: DEFAULT_EMAIL_RECIPIENTS, updatedAt: null, updatedBy: null });

  const recipients = { digest: chosen, reminder: { to: ['allstaff@partnershipcork.ie'], cc: [], bcc: ['ihor@x.ie'] } };
  res = await onRequestPut({ request: ask('admin-token', recipients), env: { ...env, BUCKET } });
  assert.equal(res.status, 200);
  const saved = (await res.json()) as { recipients: unknown; updatedAt: string; updatedBy: string };
  assert.deepEqual(saved.recipients, recipients);
  assert.equal(saved.updatedBy, 'Ada Admin');
  assert.ok(!Number.isNaN(Date.parse(saved.updatedAt)));
  assert.ok(BUCKET.contents.has(RECIPIENTS_KEY));
  assert.ok(RECIPIENTS_KEY.startsWith('meta/'), 'never served by /api/file');

  res = await onRequestGet({ request: ask('admin-token'), env: { ...env, BUCKET } });
  assert.deepEqual(await res.json(), saved);
});

test('only admins see or change the recipients, and only to real addresses', async () => {
  mockFetch(authRoutes);
  const BUCKET = bucket();
  const recipients = { digest: chosen, reminder: chosen };
  assert.equal((await onRequestGet({ request: ask(), env: { ...env, BUCKET } })).status, 401);
  assert.equal((await onRequestGet({ request: ask('staff-token'), env: { ...env, BUCKET } })).status, 403);
  assert.equal((await onRequestPut({ request: ask('staff-token', recipients), env: { ...env, BUCKET } })).status, 403);
  assert.equal(BUCKET.contents.size, 0);

  const bad = await onRequestPut({ request: ask('admin-token', { digest: chosen, reminder: { to: ['nobody'] } }), env: { ...env, BUCKET } });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /valid address/);
  assert.equal((await onRequestPut({ request: ask('admin-token', { digest: chosen, reminder: { to: [], cc: [], bcc: [] } }), env: { ...env, BUCKET } })).status, 400);
  assert.equal(BUCKET.contents.size, 0);

  assert.equal((await onRequestGet({ request: ask('admin-token'), env })).status, 500);
});

test('a stored file that can\'t be read gives the defaults instead of breaking the emails', async () => {
  mockFetch(authRoutes);
  const BUCKET = bucket();
  BUCKET.contents.set(RECIPIENTS_KEY, new Blob(['{not json']));
  const res = await onRequestGet({ request: ask('admin-token'), env: { ...env, BUCKET } });
  assert.deepEqual(((await res.json()) as { recipients: unknown }).recipients, DEFAULT_EMAIL_RECIPIENTS);
});
