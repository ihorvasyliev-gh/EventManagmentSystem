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
  // A typo in the organisation's domain is pointed out, and fixed with a click
  await page.getByLabel('Work email').fill('sam@pertnershipcork.ie');
  await page.getByRole('button', { name: 'sam@partnershipcork.ie' }).click();
  await expect(page.getByLabel('Work email')).toHaveValue('sam@partnershipcork.ie');
  await expect(page.getByText('Did you mean')).toHaveCount(0);
  // A second contact person: a started row needs both a name and an email
  await page.getByRole('button', { name: 'Add another contact person' }).click();
  await expect(page.locator('#field-contact-0-name')).toBeFocused();
  await page.locator('#field-contact-0-name').fill('Ann Partner');
  await page.getByRole('button', { name: 'Check & submit' }).last().click();
  await expect(page.locator('#err-contact-0-email')).toHaveText('Please enter a valid email address.');
  await page.locator('#field-contact-0-email').fill('ann@partnershipcork.ie');
  await page.getByRole('button', { name: 'Check & submit' }).last().click();

  // The review screen, then send
  await expect(page.getByText('Coffee morning').first()).toBeVisible();
  await expect(page.getByText('ann@partnershipcork.ie')).toBeVisible();
  await page.getByRole('button', { name: 'Send for review' }).last().click();
  await expect(page.getByRole('heading', { name: /event sent/i })).toBeVisible();

  expect(submitted).not.toBeNull();
  expect(submitted!.event).toMatchObject({
    title: 'Coffee morning',
    location: 'Mahon Community Centre',
    submitter_name: 'Sam Staff',
    submitter_email: 'sam@partnershipcork.ie',
    extra_contacts: [{ name: 'Ann Partner', email: 'ann@partnershipcork.ie' }],
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

test('Enter in a field doesn’t send the form, the button says what is left to fix, and a past date gets a heads-up', async ({ page }) => {
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  await page.goto('/submit');
  await page.getByLabel('Event name').fill('Coffee morning');
  await page.getByLabel('Event name').press('Enter');
  await expect(page.locator('#err-location')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /to fix/ })).toHaveCount(0);

  // Sending with the rest empty: dates, venue, description, name and email
  await page.getByRole('button', { name: 'Check & submit' }).last().click();
  await expect(page.locator('#field-dates')).toBeFocused();
  await page.locator('#field-location').fill('Mahon');
  await page.getByRole('button', { name: '4 fields to fix · Show' }).click();
  await expect(page.locator('#field-dates')).toBeFocused();

  // A day that has gone: it can still be picked, with a heads-up
  await page.getByRole('button', { name: 'Previous month' }).click();
  const now = new Date();
  const past = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  await page.getByRole('button', { name: past.toDateString() }).click();
  await expect(page.getByText(/has already passed\. Is that the right date\?/)).toBeVisible();
  await expect(page.getByRole('button', { name: '3 fields to fix · Show' })).toBeVisible();
  await expectAccessible(page);
});

test('a weekly event: one date, “Every week” under the calendar, and a last date', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/api/published-events', (route) => route.fulfill({ json: { events: [] } }));
  await page.route('**/api/submit', async (route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    submitted = JSON.parse(body.match(/name="event"\r\n\r\n(.*?)\r\n--/s)?.[1] ?? '{}');
    await route.fulfill({ status: 201, json: { id: 'new', status: 'draft' } });
  });

  await page.goto('/submit');
  await page.getByLabel('Event name').fill('Parent and toddler group');
  await page.getByRole('button', { name: 'Next month' }).click();
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const weekday = first.toLocaleDateString('en-IE', { weekday: 'long' });
  await page.getByRole('button', { name: first.toDateString() }).click();

  // Every week, from the picked date, until a last date
  await page.getByText('Every week', { exact: true }).click();
  await expect(page.getByText(`Every week on ${weekday} from`).first()).toBeVisible();
  await expect(page.getByText(', with no end date').first()).toBeVisible();
  const last = new Date(first.getFullYear(), first.getMonth() + 2, 1);
  const lastValue = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-01`;
  await page.getByLabel('Last date').fill(lastValue);
  await expectAccessible(page);

  // A second date turns the repeat off: the dates picked are the series
  const second = new Date(first.getFullYear(), first.getMonth(), 16);
  await page.getByRole('button', { name: second.toDateString() }).click();
  await expect(page.getByText('Repeating is off while more than one date or time is picked.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Every week', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: second.toDateString() }).click();
  await expect(page.getByRole('radio', { name: 'Every week', exact: true })).toBeChecked();

  await page.locator('#field-location').fill('Mahon Community Centre');
  await page.getByLabel('Short description').fill('Play, songs and a cuppa for parents.');
  await page.getByLabel('Full name').fill('Yvonne Staff');
  await page.getByLabel('Work email').fill('yvonne@partnershipcork.ie');
  await page.getByRole('button', { name: 'Check & submit' }).last().click();

  // The review screen says how it repeats
  await expect(page.getByText('Repeats', { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`Every week on ${weekday} from .* until`))).toBeVisible();
  await page.getByRole('button', { name: 'Send for review' }).last().click();
  await expect(page.getByRole('heading', { name: /event sent/i })).toBeVisible();

  expect(submitted).toMatchObject({
    title: 'Parent and toddler group',
    recurrence_type: 'weekly',
    recurrence_interval: 1,
    recurrence_custom_dates: null
  });
  const until = new Date(String(submitted!.recurrence_end_date));
  expect([until.getFullYear(), until.getMonth(), until.getDate()]).toEqual([last.getFullYear(), last.getMonth(), 1]);
  expect(new Date(String(submitted!.date)).getDate()).toBe(15);
});
