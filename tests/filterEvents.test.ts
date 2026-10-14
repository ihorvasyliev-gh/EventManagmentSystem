import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents } from '../utils/filterEvents.ts';
import type { Event, UserRole } from '../types.ts';

// The roles as strings: the UserRole enum can't be loaded here
const STAFF_ROLE = 'staff' as UserRole;
const ADMIN_ROLE = 'admin' as UserRole;
const STAFF = 'staff-1';
const OTHER = 'staff-2';

const event = (over: Partial<Event> = {}): Event => ({
  id: 'a', title: 'Coffee morning', description: '', date: new Date('2026-11-05T10:00:00Z'), location: 'Mahon',
  status: 'published', createdAt: new Date('2026-01-01T00:00:00Z'), ...over
});

const events = [
  event({ id: 'published', creatorId: OTHER }),
  event({ id: 'mine', status: 'draft', creatorId: STAFF }),
  event({ id: 'theirs', status: 'draft', creatorId: OTHER }),
  event({ id: 'no-account', status: 'draft' })
];
const ids = (list: Event[]) => list.map((e) => e.id);

test('staff see published events and their own submissions waiting for review', () => {
  assert.deepEqual(ids(filterEvents(events, {}, STAFF_ROLE, STAFF)), ['published', 'mine']);
});

test('staff never see a draft that is not theirs, and no drafts without a known user', () => {
  assert.deepEqual(ids(filterEvents(events, {}, STAFF_ROLE, OTHER)), ['published', 'theirs']);
  assert.deepEqual(ids(filterEvents(events, {}, STAFF_ROLE)), ['published']);
  assert.deepEqual(ids(filterEvents(events, {}, undefined, STAFF)), ['published', 'mine']);
});

test('admins see every draft', () => {
  assert.deepEqual(ids(filterEvents(events, {}, ADMIN_ROLE, STAFF)), ['published', 'mine', 'theirs', 'no-account']);
});

test('other filters still apply to a staff member’s own drafts', () => {
  assert.deepEqual(ids(filterEvents(events, { search: 'quiz' }, STAFF_ROLE, STAFF)), []);
  assert.deepEqual(ids(filterEvents(events, { status: 'published' }, STAFF_ROLE, STAFF)), ['published']);
});
