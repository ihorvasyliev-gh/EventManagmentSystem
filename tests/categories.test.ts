import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CATEGORIES,
  MAX_CUSTOM_CATEGORIES,
  categoryFromKey,
  getCategoryIconId,
  getCategoryTone,
  mergeCategories,
  parseStoredCustomCategories,
  setCustomCategories,
  shortCategoryLabel,
  validateCategoryInput,
  validateCategoryPatch
} from '../constants/categories.ts';
import { TONE_RGB, getCategoryRgb } from '../constants/categoryColors.ts';
import { knownCategories } from '../utils/subscribeLinks.ts';
import { CATEGORIES_KEY } from '../server/categories.ts';
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost
} from '../functions/api/categories.ts';
import { onRequestGet as calendarGet } from '../functions/api/calendar.ts';
import { mockFetch, authRoutes, json, env } from './support/mockFetch.ts';

/** An in-memory R2 bucket matching IssueBucket */
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

const req = (method: string, options: { token?: string; body?: unknown; query?: string } = {}) =>
  new Request(`https://app.test/api/categories${options.query ?? ''}`, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

test('custom categories sit before Other, deduplicated by key against standard and custom names', () => {
  const merged = mergeCategories([
    { name: 'Youth & Sports', shortLabel: 'Youth', icon: 'trophy', color: 'indigo' },
    { name: 'seminar / conference', icon: 'mic', color: 'olive' }, // collides with built-in Seminar/Conference
    { name: 'Youth   Sports', icon: 'bike', color: 'olive' }, // collides with Youth & Sports
    { name: 'Arts & Culture', icon: 'palette', color: 'olive' }
  ]);
  const names = merged.map((c) => c.name);
  assert.equal(names[names.length - 1], 'Other', 'Other stays last');
  assert.equal(names[names.length - 3], 'Youth & Sports');
  assert.equal(names[names.length - 2], 'Arts & Culture');
  assert.equal(merged.length, DEFAULT_CATEGORIES.length + 2);
});

test('category input validation checks name, icon, colour, short label and duplicates', () => {
  const ok = validateCategoryInput({ name: '  Youth  &  Sports ', shortLabel: ' Youth ', icon: 'trophy', color: 'indigo' });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.category.name, 'Youth & Sports');
    assert.equal(ok.category.shortLabel, 'Youth');
    assert.equal(ok.category.icon, 'trophy');
    assert.equal(ok.category.color, 'indigo');
  }

  assert.equal(validateCategoryInput({ name: 'A', icon: 'trophy', color: 'indigo' }).ok, false);
  assert.equal(validateCategoryInput({ name: '!!!', icon: 'trophy', color: 'indigo' }).ok, false);
  assert.equal(validateCategoryInput({ name: 'Seminar / Conference', icon: 'trophy', color: 'indigo' }).ok, false);
  assert.equal(validateCategoryInput({ name: 'Youth', icon: 'not-an-icon', color: 'indigo' }).ok, false);
  assert.equal(validateCategoryInput({ name: 'Youth', icon: 'trophy', color: 'neon-pink' }).ok, false);
  assert.equal(validateCategoryInput({ name: 'Youth', shortLabel: 'x'.repeat(30), icon: 'trophy', color: 'indigo' }).ok, false);

  const patchOk = validateCategoryPatch({ icon: 'music', color: 'olive', shortLabel: '' });
  assert.equal(patchOk.ok, true);
  if (patchOk.ok) {
    assert.deepEqual(patchOk.patch, { icon: 'music', color: 'olive', shortLabel: null });
  }
  assert.equal(validateCategoryPatch({}).ok, false);
  assert.equal(validateCategoryPatch({ icon: 'invalid' }).ok, false);
});

test('runtime category registry powers icons, tones, PDF colours, short labels and subscribe links', () => {
  try {
    setCustomCategories([
      { name: 'Youth & Sports', shortLabel: 'Youth', icon: 'trophy', color: 'indigo' }
    ]);
    assert.equal(getCategoryTone('Youth & Sports'), 'indigo');
    assert.equal(getCategoryIconId('Youth & Sports'), 'trophy');
    assert.equal(shortCategoryLabel('Youth & Sports'), 'Youth');
    assert.deepEqual(getCategoryRgb('Youth & Sports'), TONE_RGB.indigo);
    assert.equal(categoryFromKey('youth-sports'), 'Youth & Sports');
    assert.deepEqual(knownCategories(['youth-sports', 'other']), ['Youth & Sports', 'Other']);
  } finally {
    setCustomCategories([]);
  }
  assert.equal(getCategoryTone('Youth & Sports'), 'other');
  assert.equal(getCategoryIconId('Youth & Sports'), 'tag');
});

test('parseStoredCustomCategories drops invalid items and respects the limit', () => {
  const many = Array.from({ length: MAX_CUSTOM_CATEGORIES + 5 }, (_, i) => ({
    name: `Custom ${i + 1}`,
    icon: 'star',
    color: 'indigo'
  }));
  const parsed = parseStoredCustomCategories([null, { name: 'x' }, ...many]);
  assert.equal(parsed.length, MAX_CUSTOM_CATEGORIES);
});

test('GET /api/categories is public and returns defaults until an admin adds custom categories', async () => {
  const BUCKET = bucket();
  let res = await onRequestGet({ request: req('GET'), env: { ...env, BUCKET } });
  assert.equal(res.status, 200);
  const initial = (await res.json()) as { categories: Array<{ name: string }>; custom: unknown[] };
  assert.deepEqual(initial.categories.map((c) => c.name), DEFAULT_CATEGORIES.map((c) => c.name));
  assert.deepEqual(initial.custom, []);

  // Even without BUCKET, GET gracefully returns the standard categories
  res = await onRequestGet({ request: req('GET'), env });
  assert.equal(res.status, 200);

  // Corrupt JSON falls back cleanly to defaults
  BUCKET.contents.set(CATEGORIES_KEY, new Blob(['{broken']));
  res = await onRequestGet({ request: req('GET'), env: { ...env, BUCKET } });
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { custom: unknown[] }).custom, []);
});

test('only admins can add, edit or delete categories, and added categories are served to everyone', async () => {
  const calls = mockFetch([
    ...authRoutes,
    ({ url, method }) => (url.includes('/rest/v1/event_categories') && (method === 'POST' || method === 'DELETE') ? new Response(null, { status: 201 }) : undefined)
  ]);
  const BUCKET = bucket();
  const newCat = { name: 'Youth & Sports', shortLabel: 'Youth', icon: 'trophy', color: 'indigo' };

  // Signed-out and staff callers are refused
  assert.equal((await onRequestPost({ request: req('POST', { body: newCat }), env: { ...env, BUCKET } })).status, 401);
  assert.equal((await onRequestPost({ request: req('POST', { token: 'staff-token', body: newCat }), env: { ...env, BUCKET } })).status, 403);
  assert.equal((await onRequestPatch({ request: req('PATCH', { token: 'staff-token', body: { name: 'Youth & Sports', icon: 'bike' } }), env: { ...env, BUCKET } })).status, 403);
  assert.equal((await onRequestDelete({ request: req('DELETE', { token: 'staff-token', query: '?name=Youth' }), env: { ...env, BUCKET } })).status, 403);
  assert.equal(BUCKET.contents.size, 0);

  // Admin creates the category
  const createdRes = await onRequestPost({ request: req('POST', { token: 'admin-token', body: newCat }), env: { ...env, BUCKET } });
  assert.equal(createdRes.status, 201);
  const createdBody = (await createdRes.json()) as {
    category: { name: string; shortLabel?: string; icon: string; color: string; createdBy?: string };
    categories: Array<{ name: string }>;
    custom: Array<{ name: string }>;
  };
  assert.equal(createdBody.category.name, 'Youth & Sports');
  assert.equal(createdBody.category.icon, 'trophy');
  assert.equal(createdBody.category.color, 'indigo');
  assert.equal(createdBody.category.createdBy, 'Ada Admin');
  assert.ok(BUCKET.contents.has(CATEGORIES_KEY));
  assert.ok(CATEGORIES_KEY.startsWith('meta/'), 'never served by /api/file');
  assert.ok(calls.some((c) => c.url.includes('/rest/v1/event_categories') && c.method === 'POST'));

  // Duplicate (even with different case/punctuation) is refused with 409
  const dup = await onRequestPost({
    request: req('POST', { token: 'admin-token', body: { name: 'youth sports', icon: 'bike', color: 'olive' } }),
    env: { ...env, BUCKET }
  });
  assert.equal(dup.status, 409);

  // Public GET now includes the new category right before Other
  const publicRes = await onRequestGet({ request: req('GET'), env: { ...env, BUCKET } });
  const publicData = (await publicRes.json()) as { categories: Array<{ name: string }>; custom: Array<{ name: string; icon: string }> };
  assert.equal(publicData.categories.at(-2)?.name, 'Youth & Sports');
  assert.equal(publicData.categories.at(-1)?.name, 'Other');

  // Admin updates icon and clears shortLabel
  const patchRes = await onRequestPatch({
    request: req('PATCH', { token: 'admin-token', body: { name: 'Youth & Sports', icon: 'bike', color: 'olive', shortLabel: '' } }),
    env: { ...env, BUCKET }
  });
  assert.equal(patchRes.status, 200);
  const patched = (await patchRes.json()) as { category: { icon: string; color: string; shortLabel?: string } };
  assert.equal(patched.category.icon, 'bike');
  assert.equal(patched.category.color, 'olive');
  assert.equal(patched.category.shortLabel, undefined);

  // Built-in categories cannot be edited or deleted
  assert.equal((await onRequestPatch({ request: req('PATCH', { token: 'admin-token', body: { name: 'Seminar/Conference', icon: 'mic' } }), env: { ...env, BUCKET } })).status, 400);
  assert.equal((await onRequestDelete({ request: req('DELETE', { token: 'admin-token', query: '?name=Seminar%2FConference' }), env: { ...env, BUCKET } })).status, 400);

  // Admin deletes the custom category
  const delRes = await onRequestDelete({
    request: req('DELETE', { token: 'admin-token', query: '?name=Youth%20%26%20Sports' }),
    env: { ...env, BUCKET }
  });
  assert.equal(delRes.status, 200);
  const delBody = (await delRes.json()) as { deleted: string; custom: unknown[] };
  assert.equal(delBody.deleted, 'Youth & Sports');
  assert.deepEqual(delBody.custom, []);

  // Deleting again returns 404
  assert.equal((await onRequestDelete({ request: req('DELETE', { token: 'admin-token', query: '?name=Youth%20%26%20Sports' }), env: { ...env, BUCKET } })).status, 404);
});

test('the ICS calendar feed names a custom category properly when filtered by its key', async () => {
  const BUCKET = bucket();
  await BUCKET.put(CATEGORIES_KEY, new Blob([JSON.stringify({
    custom: [{ name: 'Youth & Sports', icon: 'trophy', color: 'indigo' }],
    updatedAt: '2026-11-25T10:00:00Z',
    updatedBy: 'Ada Admin'
  })]));
  const row = {
    id: '10000000-0000-0000-0000-000000000099',
    title: '5-a-side Tournament',
    description: 'Community match',
    date: '2026-09-18T17:00:00.000Z',
    end_date: '2026-09-18T19:00:00.000Z',
    location: 'Sports Hall',
    status: 'published',
    category: 'Youth & Sports',
    recurrence_type: 'none',
    recurrence_interval: null,
    recurrence_end_date: null,
    recurrence_occurrences: null,
    recurrence_days_of_week: null,
    recurrence_custom_dates: null,
    recurrence_custom_end_dates: null,
    recurrence_custom_locations: null,
    created_at: '2026-01-01T00:00:00Z'
  };
  const page = (rows: unknown[]) => json(rows, 200, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  mockFetch([
    ({ url }) => (url.includes('/rest/v1/events?') ? page([row]) : undefined),
    ({ url }) => (url.includes('/rest/v1/recurrence_exceptions?') ? page([]) : undefined)
  ]);

  const res = await calendarGet({ request: new Request('https://app.test/api/calendar?category=youth-sports'), env: { ...env, BUCKET } });
  assert.equal(res.status, 200);
  const ics = await res.text();
  assert.match(ics, /SUMMARY:5-a-side Tournament/);
  assert.match(ics, /X-WR-CALNAME:CCP Events: Youth & Sports/);
});
