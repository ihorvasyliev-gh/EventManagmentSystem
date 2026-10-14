import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSubmission } from '../server/submission.ts';
import { fileKeyFromUrl, contentMatchesType } from '../server/files.ts';
import { generateTempPassword } from '../server/password.ts';
import { describeWhen, declinedEmail, newSubmissionEmail } from '../server/notifications.ts';
import { selectAll, getCaller } from '../server/supabase.ts';
import { errorFingerprint } from '../functions/api/client-error.ts';

const valid = {
  title: ' Coffee morning ',
  description: 'Tea and chats',
  date: '2026-11-05T10:00:00.000Z',
  end_date: '2026-11-05T11:30:00.000Z',
  location: 'Mahon CC',
  category: 'Community & Family',
  submitter_name: 'Sam',
  submitter_email: 'Sam@Partnershipcork.ie'
};

test('a valid submission becomes a trimmed row; status and creator are not taken from the input', () => {
  const result = checkSubmission({ ...valid, status: 'published', creator_id: 'x' } as never);
  assert.ok(result.ok);
  assert.equal(result.row.title, 'Coffee morning');
  assert.equal(result.row.submitter_email, 'sam@partnershipcork.ie');
  assert.equal(result.row.recurrence_type, 'none');
  assert.ok(!('status' in result.row) && !('creator_id' in result.row));
});

test('submissions are refused when required fields are missing or too long', () => {
  assert.equal(checkSubmission({ ...valid, title: '  ' }).ok, false);
  assert.equal(checkSubmission({ ...valid, description: 'x'.repeat(2001) }).ok, false);
  assert.equal(checkSubmission({ ...valid, submitter_email: 'nope' }).ok, false);
  assert.equal(checkSubmission({ ...valid, date: 'tomorrow' }).ok, false);
  assert.equal(checkSubmission({ ...valid, end_date: '2026-11-05T09:00:00.000Z' }).ok, false);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'fortnightly' }).ok, false);
});

test('an event can repeat every week, 2 weeks or month from its date, until a last date or on and on', () => {
  const weekly = checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_interval: 2, recurrence_end_date: '2026-12-17T00:00:00.000Z' });
  assert.ok(weekly.ok);
  assert.equal(weekly.row.recurrence_type, 'weekly');
  assert.equal(weekly.row.recurrence_interval, 2);
  assert.equal(weekly.row.recurrence_end_date, '2026-12-17T00:00:00.000Z');
  assert.equal(weekly.row.recurrence_custom_dates, null);

  const forever = checkSubmission({ ...valid, recurrence_type: 'monthly' });
  assert.ok(forever.ok);
  assert.equal(forever.row.recurrence_interval, 1);
  assert.equal(forever.row.recurrence_end_date, null);

  // The last date may be the first day itself (its midnight is before the start time)
  assert.ok(checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_end_date: '2026-11-05T00:00:00.000Z' }).ok);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_end_date: '2026-11-03T00:00:00.000Z' }).ok, false);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_end_date: 'soon' }).ok, false);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_interval: 0 }).ok, false);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'weekly', recurrence_interval: 1.5 }).ok, false);

  // A one-off or picked dates carry no repeat fields, whatever was sent
  const single = checkSubmission({ ...valid, recurrence_interval: 2, recurrence_end_date: '2026-12-17T00:00:00.000Z' });
  assert.ok(single.ok);
  assert.equal(single.row.recurrence_interval, null);
  assert.equal(single.row.recurrence_end_date, null);
});

test('an event saved without a contact may be changed and stay without one; otherwise the contact is needed', () => {
  const noContact = { ...valid, submitter_name: '', submitter_email: ' ' };
  assert.equal(checkSubmission(noContact).ok, false);
  const kept = checkSubmission(noContact, { contactOptional: true });
  assert.ok(kept.ok);
  assert.equal(kept.row.submitter_name, null);
  assert.equal(kept.row.submitter_email, null);
  // Half a contact is still checked
  assert.equal(checkSubmission({ ...noContact, submitter_name: 'Ann' }, { contactOptional: true }).ok, false);
});

test('more contact people are checked like the submitter: a name and a valid email each, up to five in all', () => {
  const ok = checkSubmission({ ...valid, extra_contacts: [{ name: ' Ann ', email: 'Ann@X.ie' }] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.row.extra_contacts, [{ name: 'Ann', email: 'ann@x.ie' }]);
  const none = checkSubmission(valid);
  assert.ok(none.ok);
  assert.deepEqual(none.row.extra_contacts, []);
  assert.equal(checkSubmission({ ...valid, extra_contacts: [{ name: '', email: 'a@x.ie' }] }).ok, false);
  assert.equal(checkSubmission({ ...valid, extra_contacts: [{ name: 'Ann', email: 'nope' }] }).ok, false);
  assert.equal(checkSubmission({ ...valid, extra_contacts: 'Ann' }).ok, false);
  const five = Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, email: `p${i}@x.ie` }));
  assert.equal(checkSubmission({ ...valid, extra_contacts: five.slice(0, 4) }).ok, true);
  assert.equal(checkSubmission({ ...valid, extra_contacts: five }).ok, false);
});

test('a multi-date submission keeps its per-date times and places, which must match the dates', () => {
  const dates = ['2026-11-05T10:00:00.000Z', '2026-11-12T14:00:00.000Z'];
  const ok = checkSubmission({
    ...valid,
    recurrence_type: 'custom',
    recurrence_custom_dates: dates,
    recurrence_custom_end_dates: ['2026-11-05T11:00:00.000Z', '2026-11-12T15:00:00.000Z'],
    recurrence_custom_locations: [' Room 1 ', null]
  });
  assert.ok(ok.ok);
  assert.deepEqual(ok.row.recurrence_custom_locations, ['Room 1', null]);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'custom', recurrence_custom_dates: dates, recurrence_custom_end_dates: [dates[0]] }).ok, false);
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'custom', recurrence_custom_dates: [] }).ok, false);
});

test('only URLs of files stored in R2 map to a key', () => {
  const key = '0f8fad5b-d9cb-469f-a165-70867728950e-flyer.png';
  assert.equal(fileKeyFromUrl(`/api/file/${key}`), key);
  assert.equal(fileKeyFromUrl(`https://ccp-event-calendar.pages.dev/api/file/${key}`), key);
  assert.equal(fileKeyFromUrl('https://x.supabase.co/storage/v1/object/public/a.png'), null);
  assert.equal(fileKeyFromUrl('/api/file/../../secret'), null);
  assert.equal(fileKeyFromUrl(null), null);
});

test('temporary passwords are readable and pass strict password rules', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const pw = generateTempPassword();
    assert.match(pw, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /\d/);
    assert.doesNotMatch(pw, /[01lIoO]/);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});

test('emails name the event, its first date in Irish time and how many more dates', () => {
  const ev = { title: 'Culture Night', date: '2026-09-18T17:00:00.000Z', location: 'City Hall', recurrence_custom_dates: ['a', 'b', 'c'], submitter_name: 'Ann', submitter_email: 'ann@x.ie' };
  assert.match(describeWhen(ev), /Fri 18 Sept? 2026, 18:00 \(and 2 more dates\)/);
  const declined = declinedEmail(ev, 'Not a CCP event');
  assert.match(declined.text, /Reason:\nNot a CCP event/);
  assert.match(declined.text, /^Hi Ann,/);
  assert.match(newSubmissionEmail(ev, 'https://app.test').text, /https:\/\/app\.test\/\?inbox/);
  assert.doesNotMatch(newSubmissionEmail(ev, 'https://app.test').text, /Other contacts/);
  const withOthers = { ...ev, extra_contacts: [{ name: 'Bob', email: 'bob@x.ie' }, { name: 'Cat', email: 'cat@x.ie' }] };
  assert.match(newSubmissionEmail(withOthers, 'https://app.test').text, /Other contacts: Bob \(bob@x\.ie\), Cat \(cat@x\.ie\)/);

  const weekly = { title: 'Coffee morning', date: '2026-10-15T09:00:00.000Z', recurrence_type: 'weekly', recurrence_interval: 1, recurrence_end_date: null };
  assert.match(describeWhen(weekly), /Thu 15 Oct 2026, 10:00 \(every week on Thursday\)/);
  assert.match(describeWhen({ ...weekly, recurrence_end_date: '2026-12-17T00:00:00.000Z' }), /\(every week on Thursday, until Thu 17 Dec 2026\)/);
});

test('selectAll pages through every row instead of stopping at the API limit', async () => {
  const total = 2345;
  const requested: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const range = (init!.headers as Record<string, string>).Range;
    requested.push(range);
    const [from, to] = range.split('-').map(Number);
    // The server returns at most 1000 rows per request
    const end = Math.min(to, from + 999, total - 1);
    const rows = Array.from({ length: Math.max(0, end - from + 1) }, (_, i) => ({ n: from + i }));
    return new Response(JSON.stringify(rows), { status: 206, headers: { 'Content-Range': `${from}-${end}/${total}` } });
  }) as typeof fetch;
  const rows = await selectAll<{ n: number }>({ url: 'https://sb.test', anonKey: 'a', serviceKey: 's' }, 'events?select=id');
  assert.equal(rows.length, total);
  assert.equal(rows[total - 1].n, total - 1);
  assert.deepEqual(requested, ['0-999', '1000-1999', '2000-2999']);
});

test('error reports group by message and first stack line, not by numbers in them', async () => {
  const a = await errorFingerprint('Failed to load event 42', 'Error: x\n    at load (app.js:10:5)');
  const b = await errorFingerprint('Failed to load event 77', 'Error: x\n    at load (app.js:12:9)');
  const c = await errorFingerprint('Something else', 'Error: x\n    at load (app.js:10:5)');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('images and PDFs must really be what their type says; other files are only downloaded', async () => {
  const file = (bytes: string | Uint8Array, type: string) => new File([bytes], 'f', { type });
  assert.equal(await contentMatchesType(file(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), 'image/png'), true);
  assert.equal(await contentMatchesType(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]), 'image/jpeg'), 'image/jpeg'), true);
  assert.equal(await contentMatchesType(file('%PDF-1.7', 'application/pdf'), 'application/pdf'), true);
  // A page renamed flyer.png, or a JPG called .png
  assert.equal(await contentMatchesType(file('<svg onload="alert(1)">', 'image/png'), 'image/png'), false);
  assert.equal(await contentMatchesType(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]), 'image/png'), 'image/png'), false);
  assert.equal(await contentMatchesType(file('<html>', 'application/pdf'), 'application/pdf'), false);
  // Word, Excel and text files are served as downloads, never shown on the site
  assert.equal(await contentMatchesType(file('a,b\n1,2', 'application/vnd.ms-excel'), 'application/vnd.ms-excel'), true);
});

test('the caller is checked by the auth server and their profile read at the same time', async () => {
  const ADMIN = '00000000-0000-0000-0000-00000000000a';
  const OTHER = '00000000-0000-0000-0000-00000000000c';
  const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;
  const cfg = { url: 'https://sb.test', anonKey: 'anon' };
  const realFetch = globalThis.fetch;
  try {
    const run = async (token: string, confirmedId: string | null) => {
      const profiles: Array<{ id: string; whileChecking: boolean }> = [];
      let checking = false;
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/v1/user')) {
          checking = true;
          await new Promise((resolve) => setTimeout(resolve, 20));
          checking = false;
          return confirmedId ? Response.json({ id: confirmedId, email: 'a@x.ie' }) : new Response('{}', { status: 401 });
        }
        const id = /id=eq\.([0-9a-f-]+)/.exec(url)![1];
        profiles.push({ id, whileChecking: checking });
        return Response.json([{ role: id === ADMIN ? 'admin' : 'staff', full_name: id === ADMIN ? 'Ada' : 'Other', email: 'a@x.ie' }]);
      }) as typeof fetch;
      return { caller: await getCaller(cfg, token), profiles };
    };

    const both = await run(jwt(ADMIN), ADMIN);
    assert.equal(both.caller?.role, 'admin');
    assert.deepEqual(both.profiles, [{ id: ADMIN, whileChecking: true }], 'read while the token is checked: one round trip, not two');

    // A token naming someone else than the auth server confirms: the confirmed id's profile is used
    const mismatch = await run(jwt(ADMIN), OTHER);
    assert.equal(mismatch.caller?.id, OTHER);
    assert.equal(mismatch.caller?.role, 'staff');

    // A refused token is no caller, whatever it claims
    assert.equal((await run(jwt(ADMIN), null)).caller, null);
    // Not a JWT: the profile is read after the check, as before
    const plain = await run('opaque-token', ADMIN);
    assert.deepEqual(plain.profiles, [{ id: ADMIN, whileChecking: false }]);
    assert.equal(plain.caller?.role, 'admin');
  } finally {
    globalThis.fetch = realFetch;
  }
});
