import { test, expect } from '@playwright/test';
import { mockSupabase, signIn, eventRow, daysFromNow } from './support';

const LINK = '/api/file/digests/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events.pdf';

test('an admin shares the digest as a link: copied, in the WhatsApp text and in the email, uploaded once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockSupabase(page, {
    events: [eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Coffee morning', date: daysFromNow(2), end_date: daysFromNow(2, 12) })]
  });
  const uploads: Array<{ type: string | undefined; isPdf: boolean }> = [];
  await page.route('**/api/digest', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    uploads.push({ type: route.request().headers()['content-type']?.split(';')[0], isPdf: body.includes('Content-Type: application/pdf') && body.includes('%PDF') });
    await route.fulfill({ status: 201, json: { url: LINK, expiresAt: new Date(Date.now() + 183 * 86400000).toISOString() } });
  });
  await signIn(page);
  await page.getByTitle('Generate the Upcoming Events Digest (PDF & WhatsApp)').first().click();
  const dialog = page.getByRole('dialog', { name: 'Upcoming Events Digest' });

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied — anyone with it can open this PDF for six months')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:4173${LINK}`);
  expect(uploads).toEqual([{ type: 'multipart/form-data', isPdf: true }]);

  await dialog.getByRole('button', { name: /WhatsApp/ }).click();
  await expect(page.getByText('WhatsApp summary copied — paste it into the group chat')).toBeVisible();
  const whatsapp = await page.evaluate(() => navigator.clipboard.readText());
  expect(whatsapp).toContain(`📄 Digest PDF: http://localhost:4173${LINK}`);
  expect(whatsapp).toContain('Coffee morning');

  await dialog.getByRole('button', { name: 'Email' }).click();
  await expect(page.getByText('Opening your email app — the text links to the digest PDF')).toBeVisible();
  expect(uploads).toHaveLength(1);

  // Closing the dialog (or reloading) and sharing the same digest again reuses the link
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByTitle('Generate the Upcoming Events Digest (PDF & WhatsApp)').first().click();
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied — anyone with it can open this PDF for six months')).toBeVisible();
  expect(uploads).toHaveLength(1);
  await page.keyboard.press('Escape');

  // An event in the period changed: a new PDF, so a new link
  await page.getByText('Coffee morning').first().click();
  await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: /Edit event/ }).click();
  const form = page.getByRole('dialog', { name: 'Edit Event' });
  await form.getByPlaceholder(/Enterprise Network Breakfast/).fill('Coffee morning & chat');
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Event updated successfully')).toBeVisible();
  await page.getByTitle('Generate the Upcoming Events Digest (PDF & WhatsApp)').first().click();
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect.poll(() => uploads.length).toBe(2);

  // Another layout is another PDF, so another link
  await dialog.getByRole('button', { name: /Compact table/ }).click();
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect.poll(() => uploads.length).toBe(3);
});

test('when the upload fails, the email still opens and the WhatsApp text is copied without the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockSupabase(page, {
    events: [eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Coffee morning', date: daysFromNow(2), end_date: daysFromNow(2, 12) })]
  });
  await page.route('**/api/digest', (route) => route.fulfill({ status: 502, json: { error: 'The digest could not be uploaded. Please try again.' } }));
  await signIn(page);
  await page.getByTitle('Generate the Upcoming Events Digest (PDF & WhatsApp)').first().click();
  const dialog = page.getByRole('dialog', { name: 'Upcoming Events Digest' });

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText(/The link could not be made \(The digest could not be uploaded/)).toBeVisible();

  await dialog.getByRole('button', { name: /WhatsApp/ }).click();
  await expect(page.getByText('WhatsApp summary copied, without the PDF link (the upload failed)')).toBeVisible();
  const whatsapp = await page.evaluate(() => navigator.clipboard.readText());
  expect(whatsapp).toContain('Coffee morning');
  expect(whatsapp).not.toContain('Digest PDF');

  await dialog.getByRole('button', { name: 'Email' }).click();
  await expect(page.getByText('The PDF could not be uploaded — attach it to the email by hand')).toBeVisible();
});

test('staff preview and download the digest; sharing it is for admins', async ({ page }) => {
  await mockSupabase(page, {
    role: 'staff',
    events: [eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Coffee morning', date: daysFromNow(2), end_date: daysFromNow(2, 12) })]
  });
  await signIn(page);
  await page.getByTitle('Generate the Upcoming Events Digest (PDF)').first().click();
  const dialog = page.getByRole('dialog', { name: 'Upcoming Events Digest' });
  await expect(dialog.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Preview' })).toBeVisible();
  for (const name of [/WhatsApp/, /^Email$/, /Copy link/]) {
    await expect(dialog.getByRole('button', { name })).toHaveCount(0);
  }
});
