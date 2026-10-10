import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, eventRow, daysFromNow, SUPABASE } from './support';

const EVENT = '10000000-0000-0000-0000-000000000011';
const DRAFT = '10000000-0000-0000-0000-000000000012';
const SERIES = '10000000-0000-0000-0000-000000000013';

const events = () => [
  eventRow({ id: EVENT, title: 'Lord Mayor visit', date: daysFromNow(2, 12), location: 'City Hall' }),
  eventRow({
    id: DRAFT, title: 'Coffee morning', date: daysFromNow(3), status: 'draft', creator_id: null,
    submitter_name: 'Sam Staff', submitter_email: 'sam@partnershipcork.ie', created_at: new Date().toISOString()
  }),
  eventRow({ id: SERIES, title: 'Coding club', date: daysFromNow(1, 16), end_date: daysFromNow(1, 17), recurrence_type: 'weekly', recurrence_occurrences: 4 })
];

test('a link to an event opens it, and a link to the inbox opens the submissions', async ({ page }) => {
  await mockSupabase(page, { events: events() });
  await signIn(page);
  await expect(page.getByText('Lord Mayor visit').first()).toBeVisible();
  // Signed in on this device, the link opens straight into the event
  await page.goto(`/?event=${EVENT}`);
  const details = page.getByRole('dialog', { name: 'Event Details' });
  await expect(details.getByRole('heading', { name: 'Lord Mayor visit' })).toBeVisible();
  // The link is used up: the address no longer carries it
  await expect(page).not.toHaveURL(/event=/);
  await details.getByRole('button', { name: 'Close' }).first().click();

  await page.goto('/?inbox');
  await expect(page.getByRole('dialog', { name: 'Submissions inbox' }).getByRole('heading', { name: 'Coffee morning' })).toBeVisible();
  await expect(page).not.toHaveURL(/inbox/);
});

test('an admin approves a submission from the inbox', async ({ page }) => {
  await mockSupabase(page, { events: events() });
  let body: unknown = null;
  await page.route('**/api/submissions', async (route) => {
    body = route.request().postDataJSON();
    const row = events().find((e) => e.id === DRAFT)!;
    await route.fulfill({ json: { events: [{ ...row, status: 'published' }] } });
  });
  await signIn(page);
  await page.getByText('1 submission is waiting for review').click();
  await page.getByRole('button', { name: /^Approve$|Approve & publish|Publish/ }).first().click();
  await expect(page.getByText('Event "Coffee morning" approved and published!')).toBeVisible();
  expect(body).toEqual({ action: 'approve', ids: [DRAFT] });
  await expect(page.getByText('1 submission is waiting for review')).toBeHidden();
});

test('deleting one date of a weekly event keeps the rest', async ({ page }) => {
  const backend = await mockSupabase(page, { events: events() });
  const exceptions: unknown[] = [];
  await page.route(`${SUPABASE}/rest/v1/recurrence_exceptions**`, (route) => {
    if (route.request().method() === 'POST') {
      exceptions.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fallback();
  });
  await signIn(page);
  await page.getByText('Coding club').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Event' }).getByText('Delete only this occurrence').click();
  await expect(page.getByText('Event instance deleted')).toBeVisible();
  expect(exceptions).toHaveLength(1);
  expect(backend.writes.some((w) => w.method === 'DELETE')).toBe(false);
});
