import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvedMailto, declinedMailto, firstName } from '../utils/authorEmail.ts';
import type { Event } from '../types.ts';

const event: Event = {
  id: 'e1', title: 'Coffee & chat', description: '', date: new Date('2026-11-05T10:00:00Z'), location: 'Mahon',
  status: 'draft', createdAt: new Date(), submitterName: 'Sam Staff', submitterEmail: 'sam@partnershipcork.ie'
};

const parse = (link: string) => {
  const url = new URL(link);
  return { to: decodeURIComponent(url.pathname), subject: url.searchParams.get('subject'), body: url.searchParams.get('body') ?? '' };
};

test('the approval email opens addressed to the submitter, with a link to the event', () => {
  const link = approvedMailto(event, 'https://cal.test/?event=e1')!;
  assert.ok(link.startsWith('mailto:sam@partnershipcork.ie?subject='));
  const { subject, body } = parse(link);
  assert.equal(subject, 'Your event is on the CCP calendar: Coffee & chat');
  assert.match(body, /^Hi Sam Staff,\r\n/);
  assert.match(body, /See it on the calendar: https:\/\/cal\.test\/\?event=e1/);
  assert.match(body, /When: Thu 5 Nov 2026, 10:00/);
});

test('the decline email carries the reason, if one was given', () => {
  assert.match(parse(declinedMailto(event, 'Not a CCP event')!).body, /Reason:\r\nNot a CCP event/);
  assert.doesNotMatch(parse(declinedMailto(event)!).body, /Reason:/);
});

test('no address, no email', () => {
  assert.equal(approvedMailto({ ...event, submitterEmail: '' }, 'https://cal.test/'), null);
  assert.equal(declinedMailto({ ...event, submitterEmail: undefined }), null);
  assert.equal(firstName('  Ann  Partner '), 'Ann');
  assert.equal(firstName(undefined), '');
});
