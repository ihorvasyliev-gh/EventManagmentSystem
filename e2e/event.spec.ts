import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, watchCsp, expectAccessible, eventRow, daysFromNow, SUPABASE } from './support';

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

test('the edit form checks fields, asks before dropping changes and saves repeats and contacts', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Coding club', date: daysFromNow(2, 16), end_date: daysFromNow(2, 17), location: 'Heron House', description: 'Learn to code', category: 'Education & Training' })]
  });
  await signIn(page);
  await page.getByText('Coding club').first().click();
  const details = page.getByRole('dialog', { name: 'Event Details' });
  await expect(details.getByRole('heading', { name: 'Coding club' })).toBeVisible();

  // "E" opens the form from the details
  await page.keyboard.press('e');
  const form = page.getByRole('dialog', { name: 'Edit Event' });
  const title = form.getByPlaceholder(/Enterprise Network Breakfast/);
  await expect(title).toHaveValue('Coding club');
  await expect(form.getByPlaceholder(/Heron House, Room 4/)).toHaveValue('Heron House');

  // Cancel with unsaved changes asks first: "no" keeps them, "yes" goes back to the saved details
  await title.fill('Coding club!');
  page.once('dialog', (d) => void d.dismiss());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(title).toHaveValue('Coding club!');
  page.once('dialog', (d) => void d.accept());
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(details.getByRole('heading', { name: 'Coding club' })).toBeVisible();

  // A blank description is caught before anything is sent
  await details.getByRole('button', { name: /Edit event/ }).click();
  await expect(title).toHaveValue('Coding club');
  const description = form.getByPlaceholder(/A few lines explaining/);
  await description.fill('   ');
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(form.getByText('Please provide a description.')).toBeVisible();
  await expect(form.getByText('Please fix the errors below.')).toBeVisible();
  expect(backend.writes).toHaveLength(0);
  await description.fill('Learn to code with us');
  await expect(form.getByText('Please provide a description.')).toBeHidden();

  // Weekly, every second week, with contact details
  await form.locator('select:has(option[value="weekly"])').selectOption('weekly');
  await form.locator('input[type="number"]').fill('2');
  await form.getByPlaceholder('e.g. Sarah Murphy').fill('Sam Staff');
  await form.getByPlaceholder('e.g. sarah@corkcitypartnership.ie').fill('sam@partnershipcork.ie');
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Event updated successfully')).toBeVisible();
  expect(backend.writes.find((w) => w.method === 'PATCH')?.body).toMatchObject({
    title: 'Coding club',
    description: 'Learn to code with us',
    location: 'Heron House',
    category: 'Education & Training',
    status: 'published',
    recurrence_type: 'weekly',
    recurrence_interval: 2,
    submitter_name: 'Sam Staff',
    submitter_email: 'sam@partnershipcork.ie'
  });
});

test('a save that fails reopens the form with the changes kept', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Job fair', date: daysFromNow(3), end_date: daysFromNow(3, 12), location: 'City Hall', description: 'Meet employers' })]
  });
  // The first save is refused by the server
  let refused = false;
  await page.route(`${SUPABASE}/rest/v1/events**`, (route) => {
    if (route.request().method() === 'PATCH' && !refused) {
      refused = true;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
    }
    return route.fallback();
  });
  await signIn(page);
  await page.getByText('Job fair').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: /Edit event/ }).click();
  const form = page.getByRole('dialog', { name: 'Edit Event' });
  await form.getByPlaceholder(/Enterprise Network Breakfast/).fill('Spring job fair');
  await form.getByPlaceholder(/A few lines explaining/).fill('Meet twenty employers');
  await form.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText(/Failed to update event/)).toBeVisible();
  await expect(form.getByPlaceholder(/Enterprise Network Breakfast/)).toHaveValue('Spring job fair');
  await expect(form.getByPlaceholder(/A few lines explaining/)).toHaveValue('Meet twenty employers');
  expect(backend.writes).toHaveLength(0);

  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Event updated successfully')).toBeVisible();
  expect(backend.writes.find((w) => w.method === 'PATCH')?.body).toMatchObject({ title: 'Spring job fair', description: 'Meet twenty employers' });
});
