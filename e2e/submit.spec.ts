import { test, expect } from '@playwright/test';
import { watchCsp, expectAccessible, eventRow, daysFromNow } from './support';

test('anyone can submit an event without an account, and it goes to /api/submit in one request', async ({ page }) => {
  const assertNoCsp = await watchCsp(page);
  let submitted: { event: Record<string, unknown>; hasPoster: boolean } | null = null;

  // People without an account learn about same-time events from the server, not the database
  await page.route('**/api/published-events', (route) =>
    route.fulfill({ json: { events: [eventRow({ id: '10000000-0000-0000-0000-000000000009', title: 'Job fair', date: daysFromNow(35) })] } })
  );
  await page.route('**/api/submit', async (route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    const eventJson = body.match(/name="event"\r\n\r\n(.*?)\r\n--/s)?.[1] ?? '{}';
    submitted = { event: JSON.parse(eventJson), hasPoster: body.includes('name="poster"') };
    await route.fulfill({ status: 201, json: { id: 'new', status: 'draft' } });
  });

  const response = await page.goto('/submit');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('heading', { name: 'Submit an upcoming event' })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Event name').fill('Coffee morning');
  await page.getByRole('button', { name: 'Next month' }).click();
  const now = new Date();
  await page.getByRole('button', { name: new Date(now.getFullYear(), now.getMonth() + 1, 15).toDateString() }).click();
  await page.locator('#field-location').fill('Mahon Community Centre');
  await page.getByLabel('Short description').fill('Tea, chats and information about local courses.');
  await page.getByLabel('Full name').fill('Sam Staff');
  await page.getByLabel('Work email').fill('sam@partnershipcork.ie');
  await page.getByRole('button', { name: 'Check & submit' }).last().click();

  // The review screen, then send
  await expect(page.getByText('Coffee morning').first()).toBeVisible();
  await page.getByRole('button', { name: 'Send for review' }).last().click();
  await expect(page.getByRole('heading', { name: /event sent/i })).toBeVisible();

  expect(submitted).not.toBeNull();
  expect(submitted!.event).toMatchObject({
    title: 'Coffee morning',
    location: 'Mahon Community Centre',
    submitter_name: 'Sam Staff',
    submitter_email: 'sam@partnershipcork.ie',
    publish: false
  });
  expect(submitted!.hasPoster).toBe(false);
  await assertNoCsp();
});

test('when the server refuses a submission, the reason is shown and the details are kept', async ({ page }) => {
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  await page.route('**/api/submit', (route) => route.fulfill({ status: 413, json: { error: 'The flyer is too large (max 15 MB).' } }));
  await page.goto('/submit');
  await page.getByLabel('Event name').fill('Coffee morning');
  await page.getByRole('button', { name: 'Next month' }).click();
  const now = new Date();
  await page.getByRole('button', { name: new Date(now.getFullYear(), now.getMonth() + 1, 15).toDateString() }).click();
  await page.locator('#field-location').fill('Mahon');
  await page.getByLabel('Short description').fill('Tea.');
  await page.getByLabel('Full name').fill('Sam Staff');
  await page.getByLabel('Work email').fill('sam@partnershipcork.ie');
  await page.getByRole('button', { name: 'Check & submit' }).last().click();
  await page.getByRole('button', { name: 'Send for review' }).last().click();
  await expect(page.getByRole('alert').filter({ hasText: 'too large' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send for review' }).last()).toBeEnabled();
});
