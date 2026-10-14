import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeRepeat, describeSeries, repeatFromRule, ruleFromRepeat, isRepeatChoice, NO_REPEAT
} from '../utils/repeat.ts';
import { describeChanges, type ChangeSource } from '../utils/eventChanges.ts';
import { ownsEvent } from '../utils/eventOwnership.ts';

// Thursday 15 October 2026, 10:00 in Cork
const THURSDAY = '2026-10-15T09:00:00.000Z';

test('repeats are described in words, on Irish time', () => {
  assert.equal(describeRepeat({ type: 'weekly', interval: 1 }, THURSDAY), 'Every week on Thursday');
  assert.equal(describeRepeat({ type: 'weekly', interval: 2 }, THURSDAY), 'Every 2 weeks on Thursday');
  assert.equal(describeRepeat({ type: 'monthly' }, THURSDAY), 'Every month on the 15th');
  assert.equal(describeRepeat({ type: 'monthly' }, '2026-10-31T10:00:00.000Z'), 'Every month on the 31st (the last day in shorter months)');
  assert.equal(describeRepeat({ type: 'daily', interval: 3, occurrences: 6 }, THURSDAY), 'Every 3 days, 6 times');
  assert.equal(describeRepeat({ type: 'yearly' }, THURSDAY), 'Every year on 15 October');
  assert.equal(describeRepeat({ type: 'weekly', endDate: '2026-12-17T00:00:00.000Z' }, THURSDAY), 'Every week on Thursday, until Thu 17 Dec 2026');
  // 23:30 on a Wednesday in UTC is already Thursday in Cork (summer time)
  assert.equal(describeRepeat({ type: 'weekly' }, '2026-07-08T23:30:00.000Z'), 'Every week on Thursday');
  assert.equal(describeRepeat({ type: 'custom' }, THURSDAY), null);
  assert.equal(describeRepeat(undefined, THURSDAY), null);

  assert.equal(describeSeries({ type: 'weekly' }, THURSDAY), 'Every week on Thursday from Thu 15 Oct 2026, with no end date');
  assert.equal(
    describeSeries({ type: 'weekly', interval: 2, endDate: '2026-12-17T00:00:00.000Z' }, THURSDAY),
    'Every 2 weeks on Thursday from Thu 15 Oct 2026 until Thu 17 Dec 2026'
  );
  assert.equal(describeSeries({ type: 'none' }, THURSDAY), null);
});

test('the form’s repeat turns into a stored rule and back', () => {
  const rule = ruleFromRepeat({ type: 'weekly', interval: 2, until: '2026-12-17' });
  assert.equal(rule?.type, 'weekly');
  assert.equal(rule?.interval, 2);
  assert.equal(rule?.endDate?.getFullYear(), 2026);
  assert.equal(rule?.endDate?.getMonth(), 11);
  assert.equal(rule?.endDate?.getDate(), 17);
  assert.deepEqual(repeatFromRule(rule), { type: 'weekly', interval: 2, until: '2026-12-17' });
  assert.equal(ruleFromRepeat(NO_REPEAT), undefined);
  assert.equal(ruleFromRepeat({ type: 'monthly', interval: 1, until: '' })?.endDate, undefined);
  assert.deepEqual(repeatFromRule({ type: 'custom', customDates: [new Date()] }), NO_REPEAT);

  assert.ok(isRepeatChoice({ type: 'weekly', interval: 2 }));
  assert.ok(isRepeatChoice({ type: 'none', interval: 7 }));
  assert.equal(isRepeatChoice({ type: 'daily', interval: 3 }), false);
});

test('staff own the events they sent in signed in, or that name their email as the contact', () => {
  const me = { id: 'u1', email: 'Yvonne@PartnershipCork.ie' };
  assert.ok(ownsEvent({ creatorId: 'u1' }, me));
  assert.ok(ownsEvent({ creatorId: null, submitterEmail: ' yvonne@partnershipcork.ie ' }, me));
  assert.equal(ownsEvent({ creatorId: 'u2', submitterEmail: 'ann@partnershipcork.ie' }, me), false);
  assert.equal(ownsEvent({}, { id: 'u1', email: '' }), false);
  assert.equal(ownsEvent({ submitterEmail: '' }, { id: 'u1', email: '' }), false);
});

const event: ChangeSource = {
  title: 'Coffee morning',
  description: 'Tea and chats',
  date: THURSDAY,
  end_date: '2026-10-15T10:30:00.000Z',
  location: 'Mahon CC',
  poster_url: null,
  status: 'published',
  category: 'Community & Family',
  recurrence_type: 'none',
  submitter_name: 'Yvonne',
  submitter_email: 'yvonne@x.ie',
  extra_contacts: []
};

test('an unchanged event has no changes (blank and missing values count as the same)', () => {
  assert.deepEqual(describeChanges(event, { ...event }), {});
  assert.deepEqual(describeChanges({ ...event, description: null, category: '' }, { ...event, description: '', category: null }), {});
  // The form saves emails in lower case, and one address for every date as the event's own
  assert.deepEqual(describeChanges({ ...event, submitter_email: 'Yvonne@X.ie ' }, event), {});
  const dates = ['2026-10-15T09:00:00.000Z', '2026-10-22T09:00:00.000Z'];
  const series = { ...event, recurrence_type: 'custom', recurrence_custom_dates: dates };
  assert.deepEqual(describeChanges({ ...series, recurrence_custom_locations: ['Mahon CC', 'Mahon CC'] }, series), {});
});

test('changes are listed field by field, old and new, in words', () => {
  const changes = describeChanges(event, {
    ...event,
    title: 'Coffee morning (weekly)',
    date: '2026-10-22T09:00:00.000Z',
    end_date: '2026-10-22T10:30:00.000Z',
    location: 'Heron House',
    poster_url: '/api/file/new.png',
    extra_contacts: [{ name: 'Ann', email: 'ann@x.ie' }]
  });
  assert.deepEqual(changes.title, { old: 'Coffee morning', new: 'Coffee morning (weekly)' });
  assert.deepEqual(changes.when, { old: 'Thu 15 Oct 2026, 10:00–11:30', new: 'Thu 22 Oct 2026, 10:00–11:30' });
  assert.deepEqual(changes.location, { old: 'Mahon CC', new: 'Heron House' });
  assert.deepEqual(changes.poster, { old: null, new: 'Added' });
  assert.deepEqual(changes.contacts, { old: 'Yvonne (yvonne@x.ie)', new: 'Yvonne (yvonne@x.ie); Ann (ann@x.ie)' });
  assert.equal(changes.description, undefined);
  assert.equal(changes.repeat, undefined, 'a one-off stays a one-off');

  assert.deepEqual(describeChanges({ ...event, poster_url: '/a.png' }, { ...event, poster_url: null }).poster, { old: null, new: 'Removed' });
  assert.deepEqual(describeChanges({ ...event, poster_url: '/a.png' }, { ...event, poster_url: '/b.png' }).poster, { old: null, new: 'Replaced' });
  assert.deepEqual(describeChanges({ ...event, status: 'draft' }, event).status, { old: 'Pending review', new: 'Published' });
});

test('starting to repeat every week is one change, with the dates left as they were', () => {
  const changes = describeChanges(event, { ...event, recurrence_type: 'weekly', recurrence_interval: 1 });
  assert.deepEqual(Object.keys(changes), ['repeat']);
  assert.deepEqual(changes.repeat, { old: 'Does not repeat', new: 'Every week on Thursday' });
  const until = describeChanges(
    { ...event, recurrence_type: 'weekly', recurrence_interval: 1 },
    { ...event, recurrence_type: 'weekly', recurrence_interval: 1, recurrence_end_date: '2026-12-17T00:00:00.000Z' }
  );
  assert.deepEqual(until.repeat, { old: 'Every week on Thursday', new: 'Every week on Thursday, until Thu 17 Dec 2026' });
});

test('for picked dates only the dates taken out and put in are listed', () => {
  const dates = (...days: number[]) => days.map((d) => `2026-10-${d}T09:00:00.000Z`);
  const series = { ...event, recurrence_type: 'custom', recurrence_custom_dates: dates(15, 22, 29) };
  const changes = describeChanges(series, { ...series, recurrence_custom_dates: dates(15, 22, 30) });
  assert.deepEqual(changes.when, { old: 'Thu 29 Oct 2026, 10:00–11:30', new: 'Fri 30 Oct 2026, 10:00–11:30' });
  assert.deepEqual(describeChanges(series, { ...series, recurrence_custom_dates: dates(15, 22) }).when, { old: 'Thu 29 Oct 2026, 10:00–11:30', new: null });

  // Older series stored their dates at midnight: they run at the event's own time
  const old = { ...series, recurrence_custom_dates: ['2026-10-14T23:00:00.000Z', '2026-10-21T23:00:00.000Z'] };
  assert.deepEqual(describeChanges(old, { ...old, recurrence_custom_dates: dates(15, 22) }), {});

  // A long list is cut short
  const many = describeChanges(event, { ...event, recurrence_type: 'custom', recurrence_custom_dates: dates(16, 17, 18, 19, 20, 21, 22, 23) });
  assert.match(many.when.new ?? '', /; Wed 21 Oct 2026, 10:00–11:30 and 2 more$/);
  assert.equal(many.repeat, undefined, 'one date ↔ picked dates shows in the dates');
});
