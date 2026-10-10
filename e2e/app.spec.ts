import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, watchCsp, expectAccessible, eventRow, daysFromNow } from './support';

test('the login page explains how to get a forgotten password reset', async ({ page }) => {
  const assertNoCsp = await watchCsp(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.getByText('temporary password')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ivasyliev@partnershipcork.ie' }).first()).toHaveAttribute('href', /password%20reset/);
  await assertNoCsp();
});

test('an admin signs in, sees the calendar and declines a submission with a reason', async ({ page }) => {
  const assertNoCsp = await watchCsp(page);
  await mockSupabase(page, {
    events: [
      eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Enterprise breakfast', date: daysFromNow(1) }),
      eventRow({
        id: '10000000-0000-0000-0000-000000000002', title: 'Coffee morning', date: daysFromNow(2), status: 'draft',
        creator_id: null, submitter_name: 'Sam Staff', submitter_email: 'sam@partnershipcork.ie', tags: ['staff-submission'], created_at: new Date().toISOString()
      })
    ]
  });
  let declined: unknown = null;
  await page.route('**/api/submissions', async (route) => {
    declined = route.request().postDataJSON();
    await route.fulfill({ json: { declined: ['10000000-0000-0000-0000-000000000002'] } });
  });

  await signIn(page);
  await expect(page.getByText('1 submission is waiting for review')).toBeVisible();
  await expect(page.getByText('Enterprise breakfast').first()).toBeVisible();
  await expectAccessible(page);

  await page.getByText('1 submission is waiting for review').click();
  await page.getByRole('button', { name: 'Decline' }).click();
  await page.getByPlaceholder(/Reason for Sam Staff/).fill('This one is not a CCP event.');
  await page.getByRole('button', { name: 'Yes, decline' }).click();
  await expect(page.getByText('Submission declined')).toBeVisible();
  expect(declined).toEqual({ action: 'decline', ids: ['10000000-0000-0000-0000-000000000002'], reason: 'This one is not a CCP event.' });
  await assertNoCsp();
});

test('after a password reset, the app asks for a new password before anything else', async ({ page }) => {
  const backend = await mockSupabase(page, { role: 'staff', mustChangePassword: true });
  await signIn(page);
  const dialog = page.getByRole('dialog', { name: 'Choose your own password' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('New password', { exact: true }).fill('a-new-long-password');
  await dialog.getByLabel('New password again').fill('a-new-long-password');
  await dialog.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password has been changed')).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(backend.passwordChanges).toEqual(['a-new-long-password']);
  expect(backend.profile.must_change_password).toBe(false);
});

test('an admin resets a forgotten password from Staff accounts', async ({ page }) => {
  await mockSupabase(page);
  await page.route('**/api/staff', (route) =>
    route.fulfill({
      json: {
        staff: [
          { id: '00000000-0000-0000-0000-00000000000a', email: 'ada@partnershipcork.ie', fullName: 'Ada Admin', role: 'admin', mustChangePassword: false, createdAt: '2026-01-01' },
          { id: '00000000-0000-0000-0000-00000000000b', email: 'brenda@partnershipcork.ie', fullName: 'Brenda Barry', role: 'staff', mustChangePassword: false, createdAt: '2026-01-01' }
        ]
      }
    })
  );
  await page.route('**/api/staff-password', (route) => route.fulfill({ json: { tempPassword: 'Kp7m-3xQa-9tVw', mustChangePassword: true } }));

  await signIn(page);
  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Staff accounts' }).click();
  const dialog = page.getByRole('dialog', { name: 'Staff accounts' });
  await expect(dialog.getByText('Brenda Barry')).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await dialog.getByRole('button', { name: 'Reset password' }).last().click();
  await expect(page.getByText('Kp7m-3xQa-9tVw')).toBeVisible();
});
