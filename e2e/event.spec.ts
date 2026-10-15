import { test, expect } from '@playwright/test';
import { mockSupabase, mockEditEvent, signIn, watchCsp, expectAccessible, eventRow, daysFromNow } from './support';

const ID = '10000000-0000-0000-0000-000000000001';

test('an admin opens an event, adds it to a calendar, edits it in the event form and deletes it', async ({ page }) => {
  const assertNoCsp = await watchCsp(page);
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(1), end_date: daysFromNow(1, 11), location: 'Heron House', description: 'Meet employers. Details at https://example.ie' })]
  });
  const saves = await mockEditEvent(page, backend);
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

  // The same form staff use, with the status
  await dialog.getByRole('button', { name: /Edit event/ }).click();
  await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Published' })).toBeChecked();
  await expectAccessible(page);
  await page.getByLabel('Event name').fill('Enterprise breakfast (moved)');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Event updated')).toBeVisible();
  expect(saves[0]).toMatchObject({ id: ID, title: 'Enterprise breakfast (moved)', location: 'Heron House', status: 'published' });

  await page.getByText('Enterprise breakfast (moved)').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete Event' });
  await expect(confirm).toContainText('You can undo it');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Event deleted successfully')).toBeVisible();
  expect(backend.writes.some((w) => w.method === 'DELETE' && w.id === ID)).toBe(true);
  await assertNoCsp();
});

test('the event form checks fields, asks before dropping changes and saves status, repeats and contacts', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({
      id: ID, title: 'Coding club', date: daysFromNow(2, 16), end_date: daysFromNow(2, 17), location: 'Heron House', description: 'Learn to code',
      category: 'Education & Training', submitter_name: 'Sam Staff', submitter_email: 'sam@partnershipcork.ie'
    })]
  });
  const saves = await mockEditEvent(page, backend);
  await signIn(page);
  await page.getByText('Coding club').first().click();
  await expect(page.getByRole('dialog', { name: 'Event Details' }).getByRole('heading', { name: 'Coding club' })).toBeVisible();

  // "E" opens the form from the details
  await page.keyboard.press('e');
  const title = page.getByLabel('Event name');
  await expect(title).toHaveValue('Coding club');
  await expect(page.locator('#field-location')).toHaveValue('Heron House');
  await expect(page.getByRole('radio', { name: 'Education & Training' })).toBeChecked();

  // Leaving with unsaved changes asks first: "no" keeps them, "yes" goes back to the calendar
  await title.fill('Coding club!');
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Back to calendar' }).click();
  await expect(title).toHaveValue('Coding club!');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Back to calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Edit event' })).toHaveCount(0);

  // A blank description is caught before anything is sent
  await page.getByText('Coding club').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: /Edit event/ }).click();
  await expect(title).toHaveValue('Coding club');
  const description = page.getByLabel('Short description');
  await description.fill('   ');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.locator('#err-description')).toHaveText('Add a sentence or two about the event.');
  expect(saves).toHaveLength(0);
  await description.fill('Learn to code with us');
  await expect(page.locator('#err-description')).toHaveCount(0);

  // Back to draft, every second week, and a second contact
  await page.getByText('Draft', { exact: true }).click();
  await page.getByText('Every 2 weeks', { exact: true }).click();
  await page.getByRole('button', { name: 'Add another contact person' }).click();
  await page.locator('#field-contact-0-name').fill('Ann Partner');
  await page.locator('#field-contact-0-email').fill('ann@partnershipcork.ie');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Event updated')).toBeVisible();
  expect(saves[0]).toMatchObject({
    title: 'Coding club',
    description: 'Learn to code with us',
    location: 'Heron House',
    category: 'Education & Training',
    status: 'draft',
    recurrence_type: 'weekly',
    recurrence_interval: 2,
    submitter_name: 'Sam Staff',
    submitter_email: 'sam@partnershipcork.ie',
    extra_contacts: [{ name: 'Ann Partner', email: 'ann@partnershipcork.ie' }]
  });
});

test('a save that fails keeps the changes in the form', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Job fair', date: daysFromNow(3), end_date: daysFromNow(3, 12), location: 'City Hall', description: 'Meet employers', submitter_name: 'Sam', submitter_email: 'sam@partnershipcork.ie' })]
  });
  const saves = await mockEditEvent(page, backend, { failFirst: true });
  await signIn(page);
  await page.getByText('Job fair').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: /Edit event/ }).click();
  await page.getByLabel('Event name').fill('Spring job fair');
  await page.getByLabel('Short description').fill('Meet twenty employers');
  await page.getByRole('button', { name: 'Save changes' }).last().click();

  await expect(page.getByRole('alert').filter({ hasText: 'Your changes could not be saved' })).toBeVisible();
  await expect(page.getByLabel('Event name')).toHaveValue('Spring job fair');
  await expect(page.getByLabel('Short description')).toHaveValue('Meet twenty employers');
  expect(saves).toHaveLength(0);

  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Event updated')).toBeVisible();
  expect(saves[0]).toMatchObject({ title: 'Spring job fair', description: 'Meet twenty employers' });
});

test('saving after someone else changed the event says so; saving again replaces their version', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({
      id: ID, title: 'Job fair', date: daysFromNow(3), end_date: daysFromNow(3, 12), location: 'City Hall', description: 'Meet employers',
      submitter_name: 'Sam', submitter_email: 'sam@partnershipcork.ie', updated_at: '2026-10-01T08:00:00.000001+00:00'
    })]
  });
  const saves = await mockEditEvent(page, backend);
  await signIn(page);
  await page.getByText('Job fair').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: /Edit event/ }).click();

  // Meanwhile another admin moves it
  Object.assign(backend.events[0], { location: 'Heron House', updated_at: '2026-10-01T09:30:00.000001+00:00' });
  await page.getByLabel('Event name').fill('Spring job fair');
  await page.getByRole('button', { name: 'Save changes' }).last().click();

  await expect(page.getByRole('alert').filter({ hasText: /Someone else changed this event.*Save again to replace their version/ })).toBeVisible();
  expect(saves).toHaveLength(0);
  await expect(page.getByLabel('Event name')).toHaveValue('Spring job fair');

  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Event updated')).toBeVisible();
  expect(saves[0]).toMatchObject({ title: 'Spring job fair', location: 'City Hall', base_updated_at: '2026-10-01T09:30:00.000Z' });
});

test('editing a submission from the inbox opens the event form set to publish it', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({
      id: ID, title: 'Coffee morning', date: daysFromNow(2), status: 'draft', creator_id: null,
      submitter_name: 'Yvonne', submitter_email: 'yvonne@partnershipcork.ie', tags: ['staff-submission']
    })]
  });
  const saves = await mockEditEvent(page, backend);
  await signIn(page);
  await page.getByText('1 submission is waiting for review').click();
  await page.getByRole('dialog', { name: 'Submissions inbox' }).getByRole('button', { name: 'Edit' }).click();

  await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Published' })).toBeChecked();
  await expect(page.getByText('Saving publishes this submission')).toBeVisible();
  // The contact stays the person who sent it in (not the admin)
  await expect(page.getByLabel('Full name')).toHaveValue('Yvonne');
  await page.getByLabel('Event name').fill('Coffee morning for parents');
  await page.getByRole('button', { name: 'Save & publish' }).last().click();
  await expect(page.getByText('"Coffee morning for parents" is saved and published')).toBeVisible();
  expect(saves[0]).toMatchObject({ title: 'Coffee morning for parents', status: 'published', submitter_email: 'yvonne@partnershipcork.ie' });
});
