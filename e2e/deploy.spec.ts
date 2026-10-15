import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, eventRow, daysFromNow } from './support';

const ID = '10000000-0000-0000-0000-000000000001';

test('a tab opened before a deploy reloads instead of crashing when a window’s file is gone', async ({ page }) => {
  await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(1), end_date: daysFromNow(1, 11), location: 'Heron House' })]
  });
  await signIn(page);

  // The deploy removed the old build's files: Cloudflare answers with the app's page instead
  let gone = true;
  await page.route(/\/assets\/EventModal-[^/]+\.js$/, (route) => {
    if (!gone) return route.continue();
    gone = false;
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body></body></html>' });
  });

  const reloaded = page.waitForEvent('load');
  await page.getByText('Enterprise breakfast').first().click();
  await reloaded;
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  // Still signed in, on the new build: the event opens
  await page.getByText('Enterprise breakfast').first().click();
  await expect(page.getByRole('dialog', { name: 'Event Details' }).getByRole('heading', { name: 'Enterprise breakfast' })).toBeVisible();
});

test('a file the browser kept as the app’s page (during a deploy) is fetched again, so the page loads without Ctrl+F5', async ({ page }) => {
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  // The browser's copy of the form's file is the app's page: the script and the app's first look
  // at the file get that copy; the next fetch is the one past the cache, and brings the real file
  // (routing turns the browser's cache off, so the copy is played here)
  let looks = 0;
  let refetched = false;
  await page.route(/\/assets\/SubmitEventPage-[^/]+\.js$/, (route) => {
    if (route.request().resourceType() === 'fetch' && ++looks >= 2) refetched = true;
    if (refetched) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body></body></html>' });
  });

  await page.goto('/submit');
  await expect(page.getByRole('heading', { name: 'Submit an upcoming event' })).toBeVisible();
  expect(refetched).toBe(true);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});

test('when a file still won’t load after the reload, the screen says the calendar was updated, not that something broke', async ({ page }) => {
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  await page.route(/\/assets\/SubmitEventPage-[^/]+\.js$/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><body></body></html>' })
  );

  await page.goto('/submit');
  await expect(page.getByRole('heading', { name: 'The calendar has just been updated' })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByText(/dynamically imported module/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeEnabled();
});
