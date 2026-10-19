import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, expectAccessible, eventRow, daysFromNow } from './support';

const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('a search lists its results across every date, not only the month on screen', async ({ page }) => {
  await mockSupabase(page, {
    events: [
      eventRow({ id: id(1), title: 'Coding club', date: daysFromNow(1) }),
      eventRow({ id: id(2), title: 'Coding club graduation', date: daysFromNow(45) }),
      eventRow({ id: id(3), title: 'Book club', date: daysFromNow(-20) }),
      eventRow({ id: id(4), title: 'Coffee morning', date: daysFromNow(2) })
    ]
  });
  await signIn(page);
  await expect(page.getByText('Coffee morning').first()).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search events' });
  await search.fill('club');
  await search.press('Enter');
  const results = page.getByRole('region', { name: 'Search results' });
  await expect(results.getByText('Coding club graduation')).toBeVisible();
  await expect(results.getByText('Coding club', { exact: true })).toBeVisible();
  await expect(results.getByText('Coffee morning')).toHaveCount(0);
  // Past results wait behind a button
  await expect(results.getByText('Book club')).toHaveCount(0);
  await results.getByRole('button', { name: 'Show past results (1)' }).click();
  await expect(results.getByText('Book club')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Show on calendar' }).click();
  await expect(results).toHaveCount(0);
  await page.getByRole('button', { name: 'Show as list' }).click();
  await expect(results).toBeVisible();
});

test('Agenda is one list from today on, loading later months as it reaches the end', async ({ page }) => {
  await mockSupabase(page, {
    events: [
      eventRow({ id: id(1), title: 'Near event', date: daysFromNow(2) }),
      eventRow({ id: id(2), title: 'Far event', date: daysFromNow(150) })
    ]
  });
  await signIn(page);
  await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Agenda' }).click();
  await expect(page.getByRole('heading', { name: 'Near event' })).toBeVisible();

  // Further months come as the end of the list scrolls into view
  await expect(async () => {
    await page.mouse.wheel(0, 2000);
    await expect(page.getByRole('heading', { name: 'Far event' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText('Nothing else is planned yet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Near event' })).toBeVisible();
});

test('staff see what they sent in under My events, and whether it is on the calendar yet', async ({ page }) => {
  await mockSupabase(page, {
    role: 'staff',
    events: [
      eventRow({ id: id(1), title: 'Coffee morning', date: daysFromNow(3), status: 'draft' }),
      eventRow({ id: id(2), title: 'Job fair', date: daysFromNow(5) }),
      eventRow({ id: id(3), title: 'Someone else’s talk', date: daysFromNow(4), creator_id: null, submitter_email: 'other@partnershipcork.ie' })
    ]
  });
  await signIn(page);
  await expect(page.getByText('Job fair').first()).toBeVisible();

  // In the top bar, in the place admins have the inbox (and the reminder to all staff is for admins)
  await expect(page.getByRole('button', { name: 'Reminder' })).toHaveCount(0);
  await page.getByRole('button', { name: 'My events' }).click();
  const mine = page.getByRole('dialog', { name: 'My events' });
  await expect(mine.getByText('1 waiting for review')).toBeVisible();
  await expect(mine.getByRole('button', { name: /Coffee morning/ })).toContainText('Pending review');
  await expect(mine.getByRole('button', { name: /Job fair/ })).toContainText('On the calendar');
  await expect(mine.getByText('Someone else’s talk')).toHaveCount(0);
  await expectAccessible(page);

  await mine.getByRole('button', { name: /Job fair/ }).click();
  await expect(page.getByRole('dialog', { name: 'Event Details' }).getByRole('heading', { name: 'Job fair' })).toBeVisible();
});

test('an admin can keep a new event as a draft, off the calendar, instead of publishing it', async ({ page }) => {
  await mockSupabase(page, { events: [eventRow({ id: id(1), title: 'Coffee morning', date: daysFromNow(3) })] });
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/submit', async (route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    sent = JSON.parse(body.match(/name="event"\r\n\r\n(.*?)\r\n--/s)?.[1] ?? '{}');
    await route.fulfill({ status: 201, json: { id: id(9), status: 'draft' } });
  });
  await signIn(page);
  await page.getByRole('button', { name: 'New Event' }).first().click();

  await page.getByLabel('Event name').fill('Board away day');
  // A new event needs a category
  await page.getByRole('button', { name: 'Publish event' }).last().click();
  await expect(page.locator('#err-category')).toBeVisible();
  await page.locator('#field-category').getByText('Community & Family', { exact: true }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  const now = new Date();
  await page.getByRole('button', { name: new Date(now.getFullYear(), now.getMonth() + 1, 15).toDateString() }).click();
  await page.locator('#field-location').fill('Heron House');
  await page.getByLabel('Short description').fill('Planning for next year.');

  await page.locator('label').filter({ hasText: /^Draft$/ }).click();
  await expect(page.getByRole('radio', { name: 'Draft' })).toBeChecked();
  await expect(page.getByText('Saved as a draft: not on the calendar until you publish it.')).toBeVisible();
  await page.getByRole('button', { name: 'Save as draft' }).last().click();
  await expect.poll(() => sent).toMatchObject({ title: 'Board away day', publish: false });
});
