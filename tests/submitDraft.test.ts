import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readDraft, clearDraft, scheduleFromDraft, readSavedSubmitter, saveSubmitter, type SavedDraft
} from '../components/submit/draft.ts';

// The form's draft and the submitter's details live in localStorage
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key)
};
beforeEach(() => store.clear());

const inDays = (days: number, hour = 10) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour);
};

const draft = (over: Partial<SavedDraft> = {}): SavedDraft => ({
  title: '',
  category: 'Other',
  dates: [],
  location: '',
  description: '',
  ...over
});

test('an empty form starts with no date (or the day it was opened from) at 10:00–11:30', () => {
  const empty = scheduleFromDraft(null, null);
  assert.deepEqual(empty.dates, []);
  assert.deepEqual(empty.shared, [{ id: 't1', start: '10:00', end: '11:30' }]);
  assert.equal(empty.sameTime, true);
  assert.equal(empty.samePlace, true);
  assert.equal(empty.location, '');

  const day = inDays(3);
  assert.deepEqual(scheduleFromDraft(null, day).dates, [day]);
});

test('a draft keeps its upcoming dates and drops the ones that have passed', () => {
  const tomorrow = inDays(1);
  const schedule = scheduleFromDraft(
    draft({ dates: [inDays(-2).toISOString(), tomorrow.toISOString(), 'not a date'] }),
    inDays(5)
  );
  assert.deepEqual(schedule.dates, [tomorrow]);
});

test('a draft whose dates have all passed falls back to the default day', () => {
  const day = inDays(4);
  assert.deepEqual(scheduleFromDraft(draft({ dates: [inDays(-1).toISOString()] }), day).dates, [day]);
});

test('older drafts: one start and end time, and one time range per date, are read as slots', () => {
  const schedule = scheduleFromDraft(
    draft({
      startTime: '09:15',
      endTime: '',
      sameTime: false,
      perDateTimes: { '2030-05-01': { start: '14:00', end: '15:00' } }
    }),
    null
  );
  assert.deepEqual(schedule.shared, [{ id: 't1', start: '09:15', end: '' }]);
  assert.equal(schedule.sameTime, false);
  assert.deepEqual(schedule.perDate, { '2030-05-01': [{ id: 't1', start: '14:00', end: '15:00' }] });
});

test('current drafts keep their slots, places and per-date times', () => {
  const schedule = scheduleFromDraft(
    draft({
      sharedTimes: [{ id: 'a', start: '10:00', end: '11:00' }, { id: 'b', start: '18:00', end: '19:00' }],
      perDateTimes: { '2030-05-02': [{ id: 'c', start: '12:00', end: '13:00' }], '2030-05-03': [] },
      samePlace: false,
      places: { '2030-05-02#c': 'Heron House' },
      location: 'Mahon'
    }),
    null
  );
  assert.deepEqual(schedule.shared.map((s) => s.id), ['a', 'b']);
  assert.deepEqual(Object.keys(schedule.perDate), ['2030-05-02']);
  assert.equal(schedule.samePlace, false);
  assert.deepEqual(schedule.places, { '2030-05-02#c': 'Heron House' });
  assert.equal(schedule.location, 'Mahon');
});

test('a saved draft is offered back only when something was typed in it', () => {
  assert.equal(readDraft(), null);
  store.set('ccp_submit_draft', JSON.stringify(draft({ title: '   ' })));
  assert.equal(readDraft(), null);
  store.set('ccp_submit_draft', JSON.stringify(draft({ title: 'Coffee morning' })));
  assert.equal(readDraft()?.title, 'Coffee morning');
  // A place typed for one date and time counts too
  store.set('ccp_submit_draft', JSON.stringify(draft({ samePlace: false, places: { k: 'Mahon' } })));
  assert.ok(readDraft());
  store.set('ccp_submit_draft', '{not json');
  assert.equal(readDraft(), null);
});

test('clearDraft removes the saved draft', () => {
  store.set('ccp_submit_draft', JSON.stringify(draft({ title: 'Coffee morning' })));
  clearDraft();
  assert.equal(readDraft(), null);
});

test('the submitter is remembered on this device, and bad data is ignored', () => {
  assert.deepEqual(readSavedSubmitter(), { name: '', email: '' });
  saveSubmitter('Sam Staff', 'sam@partnershipcork.ie');
  assert.deepEqual(readSavedSubmitter(), { name: 'Sam Staff', email: 'sam@partnershipcork.ie' });
  store.set('ccp_submitter_details', JSON.stringify({ name: 42, email: 'x@y.ie' }));
  assert.deepEqual(readSavedSubmitter(), { name: '', email: 'x@y.ie' });
  store.set('ccp_submitter_details', 'oops');
  assert.deepEqual(readSavedSubmitter(), { name: '', email: '' });
});
