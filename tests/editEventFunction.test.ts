import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/edit-event.ts';
import { mockFetch, authRoutes, json, env, fakeBucket, type Call } from './support/mockFetch.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '00000000-0000-0000-0000-00000000000b';
const OLD_POSTER = '/api/file/0f8fad5b-d9cb-469f-a165-70867728950e-old.png';
const SAVED_AT = '2026-10-14T12:00:00.123456+00:00';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

const storedEvent = (over: Record<string, unknown> = {}) => ({
  id: ID,
  title: 'Coffee morning',
  description: 'Tea and chats',
  date: '2026-11-05T10:00:00.000Z',
  end_date: '2026-11-05T11:30:00.000Z',
  location: 'Mahon CC',
  poster_url: OLD_POSTER,
  status: 'published',
  category: 'Community & Family',
  tags: ['staff-submission'],
  recurrence_type: 'none',
  recurrence_interval: null,
  recurrence_end_date: null,
  recurrence_occurrences: null,
  recurrence_days_of_week: null,
  recurrence_custom_dates: null,
  recurrence_custom_end_dates: null,
  recurrence_custom_locations: null,
  submitter_name: 'Sam',
  submitter_email: 'sam@x.ie',
  extra_contacts: [],
  creator_id: STAFF_ID,
  updated_at: SAVED_AT,
  ...over
});

/** The form as the app sends it: the stored event's fields, then the changes */
const form = (stored: ReturnType<typeof storedEvent>, changes: Record<string, unknown> = {}) => ({
  id: ID,
  title: stored.title,
  description: stored.description,
  date: stored.date,
  end_date: stored.end_date,
  location: stored.location,
  category: stored.category,
  recurrence_type: stored.recurrence_type,
  recurrence_interval: stored.recurrence_interval,
  recurrence_end_date: stored.recurrence_end_date,
  recurrence_custom_dates: stored.recurrence_custom_dates,
  recurrence_custom_end_dates: stored.recurrence_custom_end_dates,
  recurrence_custom_locations: stored.recurrence_custom_locations,
  submitter_name: stored.submitter_name,
  submitter_email: stored.submitter_email,
  extra_contacts: stored.extra_contacts,
  base_updated_at: '2026-10-14T12:00:00.123Z',
  keep_poster: true,
  ...changes
});

const send = (event: unknown, { auth = 'staff-token', poster }: { auth?: string | null; poster?: File } = {}) => {
  const body = new FormData();
  body.append('event', JSON.stringify(event));
  if (poster) body.append('poster', poster);
  return new Request('https://app.test/api/edit-event', {
    method: 'POST',
    body,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {}
  });
};

/** Supabase with one stored event; records what is written */
const backend = (stored: ReturnType<typeof storedEvent>, options: { savedMeanwhile?: boolean; exceptions?: number } = {}) => {
  const writes = { patched: [] as Array<Record<string, unknown>>, history: [] as Array<Record<string, unknown>>, clearedExceptions: 0 };
  const calls: Call[] = mockFetch([
    ...authRoutes,
    ({ url, method, body }) => {
      if (method === 'GET' && url.includes(`/rest/v1/events?id=eq.${ID}`)) return json([stored]);
      if (method === 'PATCH' && url.includes(`/rest/v1/events?id=eq.${ID}`)) {
        if (options.savedMeanwhile) return json([]);
        const changes = JSON.parse(body!);
        writes.patched.push(changes);
        return json([{ ...stored, ...changes, updated_at: '2026-10-14T13:00:00.000000+00:00' }]);
      }
      if (method === 'DELETE' && url.includes('/rest/v1/recurrence_exceptions?event_id=eq.')) {
        writes.clearedExceptions++;
        return json(Array.from({ length: options.exceptions ?? 0 }, (_, i) => ({ id: i })));
      }
      if (method === 'POST' && url.endsWith('/rest/v1/event_history')) {
        writes.history.push(JSON.parse(body!));
        return json(null, 201);
      }
      // "Is the old flyer still used?" — no
      if (method === 'GET' && (url.includes('/rest/v1/events?select=id&poster_url=') || url.includes('/rest/v1/event_attachments?select=id&url='))) return json([]);
      return undefined;
    }
  ]);
  return { writes, calls };
};

test('staff change their own event: it is saved as checked, stays published, and the change is logged under their name', async () => {
  const stored = storedEvent();
  const { writes } = backend(stored);
  const res = await onRequestPost({
    request: send(form(stored, { title: 'Coffee morning (weekly)', recurrence_type: 'weekly', recurrence_interval: 1, status: 'draft', creator_id: 'x', tags: ['admin-created'] })),
    env
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.changed, true);
  assert.equal(body.event.title, 'Coffee morning (weekly)');

  assert.equal(writes.patched.length, 1);
  const patch = writes.patched[0];
  assert.equal(patch.title, 'Coffee morning (weekly)');
  assert.equal(patch.recurrence_type, 'weekly');
  assert.equal(patch.poster_url, OLD_POSTER, 'the flyer is kept');
  assert.ok(!('status' in patch) && !('creator_id' in patch) && !('tags' in patch), 'status, creator and tags are not the form’s to change');

  assert.equal(writes.history.length, 1);
  const entry = writes.history[0];
  assert.equal(entry.event_id, ID);
  assert.equal(entry.user_id, STAFF_ID);
  assert.equal(entry.user_name, 'Sam Staff');
  assert.equal(entry.action, 'updated');
  assert.deepEqual(Object.keys(entry.changes as object).sort(), ['repeat', 'title']);
  assert.equal(writes.clearedExceptions, 1, 'a one-off that starts repeating drops any old deleted days');
});

test('an event that names their email as the contact is theirs too; anyone else’s is refused', async () => {
  const byEmail = storedEvent({ creator_id: null, submitter_email: 'STAFF@x.ie' });
  backend(byEmail);
  const ok = await onRequestPost({ request: send(form(byEmail, { title: 'New name' })), env });
  assert.equal(ok.status, 200);

  const someoneElse = storedEvent({ creator_id: '00000000-0000-0000-0000-00000000000c', submitter_email: 'ann@x.ie' });
  const { writes } = backend(someoneElse);
  const refused = await onRequestPost({ request: send(form(someoneElse, { title: 'Mine now' })), env });
  assert.equal(refused.status, 403);
  assert.equal(writes.patched.length, 0);
  assert.equal(writes.history.length, 0);

  // Admins may change any event
  const asAdmin = await onRequestPost({ request: send(form(someoneElse, { title: 'Fixed' }), { auth: 'admin-token' }), env });
  assert.equal(asAdmin.status, 200);
});

test('without a session nothing is read or written', async () => {
  const stored = storedEvent();
  const { writes, calls } = backend(stored);
  const res = await onRequestPost({ request: send(form(stored, { title: 'x' }), { auth: null }), env });
  assert.equal(res.status, 401);
  assert.equal(writes.patched.length, 0);
  assert.ok(!calls.some((c) => c.url.includes('/rest/v1/events')));
});

test('if someone saved the event after the form was opened, nothing is written and their version comes back', async () => {
  const stored = storedEvent({ updated_at: '2026-10-14T12:30:00.000000+00:00', title: 'Renamed by Elizabeth' });
  const { writes } = backend(stored);
  const res = await onRequestPost({ request: send(form(stored, { title: 'Mine' })), env });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /Someone else changed this event/);
  assert.equal(body.event.title, 'Renamed by Elizabeth');
  assert.equal(writes.patched.length, 0);

  // Saved between the check and the write: the new flyer is not left behind
  const fresh = storedEvent();
  backend(fresh, { savedMeanwhile: true });
  const bucket = fakeBucket();
  const raced = await onRequestPost({
    request: send(form(fresh, { title: 'Mine' }), { poster: new File([PNG], 'new.png', { type: 'image/png' }) }),
    env: { ...env, BUCKET: bucket }
  });
  assert.equal(raced.status, 409);
  assert.equal(bucket.stored.size, 0);
  assert.equal(bucket.deleted.length, 1);
});

test('a new flyer replaces the old one, which is deleted once nothing uses it; keep_poster false removes it', async () => {
  const stored = storedEvent();
  const { writes } = backend(stored);
  const bucket = fakeBucket();
  const res = await onRequestPost({
    request: send(form(stored), { poster: new File([PNG], 'new.png', { type: 'image/png' }) }),
    env: { ...env, BUCKET: bucket }
  });
  assert.equal(res.status, 200);
  assert.match(String(writes.patched[0].poster_url), /^\/api\/file\/[0-9a-f-]{36}-new\.png$/);
  assert.deepEqual(writes.history[0].changes, { poster: { old: null, new: 'Replaced' } });
  assert.deepEqual(bucket.deleted, ['0f8fad5b-d9cb-469f-a165-70867728950e-old.png']);

  const again = backend(stored);
  await onRequestPost({ request: send(form(stored, { keep_poster: false })), env: { ...env, BUCKET: fakeBucket() } });
  assert.equal(again.writes.patched[0].poster_url, null);
  assert.deepEqual(again.writes.history[0].changes, { poster: { old: null, new: 'Removed' } });
});

test('saving without changes writes nothing', async () => {
  const stored = storedEvent();
  const { writes } = backend(stored);
  const res = await onRequestPost({ request: send(form(stored)), env });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).changed, false);
  assert.equal(writes.patched.length, 0);
  assert.equal(writes.history.length, 0);
});

test('a series that keeps repeating the same way keeps its deleted days; picked dates are saved complete', async () => {
  const weekly = storedEvent({ recurrence_type: 'weekly', recurrence_interval: 1 });
  const kept = backend(weekly);
  await onRequestPost({ request: send(form(weekly, { recurrence_end_date: '2026-12-17T00:00:00.000Z' })), env });
  assert.equal(kept.writes.patched.length, 1);
  assert.equal(kept.writes.clearedExceptions, 0);

  const dates = ['2026-11-05T10:00:00.000Z', '2026-11-12T10:00:00.000Z'];
  const custom = storedEvent({ recurrence_type: 'custom', recurrence_custom_dates: dates });
  const cleared = backend(custom, { exceptions: 1 });
  const res = await onRequestPost({ request: send(form(custom, { recurrence_custom_dates: [dates[0]] })), env });
  const body = await res.json();
  assert.equal(cleared.writes.clearedExceptions, 1);
  assert.equal(body.exceptionsCleared, true);
});

test('the form’s fields are checked like a new submission', async () => {
  const stored = storedEvent();
  const { writes } = backend(stored);
  const res = await onRequestPost({ request: send(form(stored, { title: '   ' })), env });
  assert.equal(res.status, 400);
  assert.equal(writes.patched.length, 0);
  const bad = await onRequestPost({ request: send({ ...form(stored), id: 'not-an-id' }), env });
  assert.equal(bad.status, 400);
});
