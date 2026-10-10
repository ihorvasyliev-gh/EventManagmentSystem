import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSubmission } from '../server/submission.ts';
import { fileKeyFromUrl } from '../server/files.ts';
import { generateTempPassword } from '../server/password.ts';
import { describeWhen, declinedEmail, newSubmissionEmail } from '../server/notifications.ts';
import { selectAll } from '../server/supabase.ts';
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
  assert.equal(checkSubmission({ ...valid, recurrence_type: 'weekly' }).ok, false);
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
