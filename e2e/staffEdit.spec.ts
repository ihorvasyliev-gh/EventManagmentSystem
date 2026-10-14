import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, eventRow, daysFromNow, expectAccessible, ADMIN_ID } from './support';

const OWN = '10000000-0000-0000-0000-000000000011';
const SOMEONE_ELSES = '10000000-0000-0000-0000-000000000012';

test('staff change an event they sent in: the form opens filled in and saves through /api/edit-event', async ({ page }) => {
  const own = eventRow({
    id: OWN, title: 'Coffee morning', date: daysFromNow(2, 10), end_date: daysFromNow(2, 11),
    submitter_name: 'Ada Admin', submitter_email: 'ada@partnershipcork.ie', updated_at: '2026-10-01T09:00:00.123+00:00'
  });
  await mockSupabase(page, {
    role: 'staff',
    events: [
      own,
      eventRow({ id: SOMEONE_ELSES, title: 'Job fair', date: daysFromNow(3), creator_id: '00000000-0000-0000-0000-00000000000c', submitter_email: 'ann@partnershipcork.ie' })
    ]
  });
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/edit-event', async (route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    sent = JSON.parse(body.match(/name="event"\r\n\r\n(.*?)\r\n--/s)?.[1] ?? '{}');
    await route.fulfill({
      json: { event: { ...own, title: sent!.title, recurrence_type: 'weekly', recurrence_interval: 1, updated_at: '2026-10-14T12:00:00+00:00' }, changed: true, exceptionsCleared: true }
    });
  });

  await signIn(page);

  // Someone else's event: no Edit
  await page.getByText('Job fair').first().click();
  const details = page.getByRole('dialog', { name: 'Event Details' });
  await expect(details.getByRole('heading', { name: 'Job fair' })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Edit event' })).toHaveCount(0);
  await details.getByRole('button', { name: 'Close' }).first().click();

  // Their own
  await page.getByText('Coffee morning').first().click();
  await details.getByRole('button', { name: 'Edit event' }).click();
  await expect(page.getByRole('heading', { name: 'Edit your event' })).toBeVisible();
  await expect(page.getByLabel('Event name')).toHaveValue('Coffee morning');
  await expect(page.locator('#field-location')).toHaveValue('Heron House');
  await expect(page.getByRole('radio', { name: 'No', exact: true })).toBeChecked();
  await expectAccessible(page);

  await page.getByLabel('Event name').fill('Coffee morning for parents');
  await page.getByText('Every week', { exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).last().click();

  await expect(page.getByText('Your changes are saved and on the calendar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edit your event' })).toHaveCount(0);
  expect(sent).toMatchObject({
    id: OWN,
    title: 'Coffee morning for parents',
    location: 'Heron House',
    recurrence_type: 'weekly',
    recurrence_interval: 1,
    submitter_email: 'ada@partnershipcork.ie',
    keep_poster: false,
    base_updated_at: '2026-10-01T09:00:00.123Z'
  });
  expect(sent).not.toHaveProperty('status');
});

test('leaving the edit form with unsaved changes asks first; a clash with someone else’s save is explained', async ({ page }) => {
  await mockSupabase(page, {
    role: 'staff',
    events: [eventRow({ id: OWN, title: 'Coffee morning', date: daysFromNow(2), creator_id: ADMIN_ID })]
  });
  await page.route('**/api/edit-event', (route) =>
    route.fulfill({ status: 409, json: { error: 'Someone else changed this event while you were editing it. Your changes were not saved.' } })
  );
  await signIn(page);
  await page.getByText('Coffee morning').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: 'Edit event' }).click();
  await page.getByLabel('Event name').fill('Coffee morning (moved)');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Someone else changed this event' })).toBeVisible();

  let asked = '';
  page.once('dialog', (dialog) => {
    asked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Back to calendar' }).click();
  expect(asked).toContain('unsaved changes');
  await expect(page.getByRole('heading', { name: 'Edit your event' })).toBeVisible();
});

test('admins see staff edits in the change log, with what changed', async ({ page }) => {
  await mockSupabase(page, {
    role: 'admin',
    events: [eventRow({ id: OWN, title: 'Coffee morning', date: daysFromNow(2) })]
  });
  const recent = new Date(Date.now() + 60_000).toISOString();
  await page.route('**/rest/v1/event_history**', (route) => {
    if (route.request().method() === 'HEAD') {
      // (Supabase lets the page read the count, as here)
      return route.fulfill({ status: 200, headers: { 'Content-Range': '*/1', 'Access-Control-Expose-Headers': 'Content-Range' } });
    }
    return route.fulfill({
      json: [{
        id: 'h1', event_id: OWN, user_id: '00000000-0000-0000-0000-00000000000b', user_name: 'Yvonne Quilligan',
        action: 'updated', timestamp: recent,
        changes: {
          repeat: { old: 'Does not repeat', new: 'Every week on Thursday' },
          title: { old: 'Coffee morning', new: 'Coffee morning for parents' }
        },
        events: { title: 'Coffee morning for parents' }, users: { role: 'staff' }
      }]
    });
  });
  await signIn(page);

  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  const item = page.getByRole('menuitem', { name: /Change log/ });
  await expect(item).toContainText('1');
  await item.click();

  const log = page.getByRole('dialog', { name: 'Change log' });
  await expect(log.getByText('Yvonne Quilligan')).toBeVisible();
  await expect(log.getByText('New', { exact: true })).toBeVisible();
  await expect(log.getByText('Every week on Thursday')).toBeVisible();
  await expect(log.locator('del').filter({ hasText: 'Does not repeat' })).toBeVisible();
  // Name comes before Repeats, whatever order the database keeps
  await expect(log.locator('dt').first()).toHaveText(/^Name:/);
  await expectAccessible(page);

  await log.getByRole('button', { name: 'Coffee morning for parents' }).click();
  await expect(page.getByRole('dialog', { name: 'Event Details' })).toBeVisible();
});
