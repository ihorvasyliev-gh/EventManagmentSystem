import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, watchCsp, expectAccessible, eventRow, daysFromNow } from './support';

const ID = '10000000-0000-0000-0000-000000000001';

test('an admin opens an event, adds it to a calendar, edits it and deletes it', async ({ page }) => {
  const assertNoCsp = await watchCsp(page);
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(1), end_date: daysFromNow(1, 11), location: 'Heron House', description: 'Meet employers. Details at https://example.ie' })]
  });
  await signIn(page);
  await page.getByText('Enterprise breakfast').first().click();

  const dialog = page.getByRole('dialog', { name: 'Event Details' });
  await expect(dialog.getByRole('heading', { name: 'Enterprise breakfast' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Heron House' })).toHaveAttribute('href', /google\.com\/maps/);
  await expectAccessible(page);

  await dialog.getByRole('button', { name: 'Add to Calendar' }).click();
  await expect(dialog.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Enterprise%20breakfast/);
  await expect(dialog.getByRole('link', { name: 'Office 365' })).toHaveAttribute('href', /outlook\.office\.com/);
  await page.keyboard.press('Escape');

  await dialog.getByRole('button', { name: /Edit event/ }).click();
  const form = page.getByRole('dialog', { name: 'Edit Event' });
  const title = form.getByPlaceholder(/Enterprise Network Breakfast/);
  await title.fill('Enterprise breakfast (moved)');
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Event updated successfully')).toBeVisible();
  expect(backend.writes.find((w) => w.method === 'PATCH')?.body).toMatchObject({ title: 'Enterprise breakfast (moved)', location: 'Heron House' });

  await page.getByText('Enterprise breakfast (moved)').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete Event' });
  await expect(confirm).toContainText('cannot be undone');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Event deleted successfully')).toBeVisible();
  expect(backend.writes.some((w) => w.method === 'DELETE' && w.id === ID)).toBe(true);
  await assertNoCsp();
});
