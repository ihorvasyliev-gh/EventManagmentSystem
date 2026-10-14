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
