import { test, expect } from '@playwright/test';
import { mockSupabase, mockEditEvent, signIn, eventRow, daysFromNow, expectAccessible } from './support';

const LINK = '/api/file/digests/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events.pdf';
// What is shared: the digest's page, which shows the PDF and downloads it
const PAGE = '/digest/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events';

test('an admin shares the digest as a link: copied, in the WhatsApp text and in the email, uploaded once', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Coffee morning', date: daysFromNow(2), end_date: daysFromNow(2, 12) })]
  });
  await mockEditEvent(page, backend);
  const uploads: Array<{ type: string | undefined; isPdf: boolean; recordsEvents: boolean }> = [];
  await page.route('**/api/digest', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    uploads.push({
      type: route.request().headers()['content-type']?.split(';')[0],
      isPdf: body.includes('Content-Type: application/pdf') && body.includes('%PDF'),
      // What it carries, for next week's NEW marks
      recordsEvents: body.includes('name="issued"') && /name="eventIds"\r\n\r\n\["10000000-0000-0000-0000-000000000001"\]/.test(body)
        // and the same events as a list, for the digest's page
        && /name="list"\r\n\r\n\{"version":1,.*"title":"Coffee morning"/.test(body)
    });
    await route.fulfill({ status: 201, json: { url: LINK, expiresAt: new Date(Date.now() + 183 * 86400000).toISOString() } });
  });
  await signIn(page);
  await page.getByTitle('Generate the Upcoming Events Digest (PDF & WhatsApp)').first().click();
  const dialog = page.getByRole('dialog', { name: 'Upcoming Events Digest' });

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied — anyone with it can open this PDF for six months')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:4173${PAGE}`);
  expect(uploads).toEqual([{ type: 'multipart/form-data', isPdf: true, recordsEvents: true }]);

  await dialog.getByRole('button', { name: /WhatsApp/ }).click();
  await expect(page.getByText('WhatsApp summary copied — paste it into the group chat')).toBeVisible();
  const whatsapp = await page.evaluate(() => navigator.clipboard.readText());
  expect(whatsapp).toContain(`📄 Digest PDF: http://localhost:4173${PAGE}`);
  expect(whatsapp).toContain('Coffee morning');

  // Email: the formatted email (with a clickable button to the PDF) is copied to be pasted in
  await dialog.getByRole('button', { name: 'Email' }).click();
  await expect(page.getByText('Email copied — click into the new message and press Ctrl+V to paste it')).toBeVisible();
  const email = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  expect(email.html).toContain(`href="http://localhost:4173${PAGE}"`);
  expect(email.html).toContain('Click here for details');
  expect(email.html).toContain('Coffee morning');
  expect(email.text).toContain(`http://localhost:4173${PAGE}`);
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
  await page.getByLabel('Event name').fill('Coffee morning & chat');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Event updated')).toBeVisible();
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
  await expect(page.getByText(/Email copied .*The PDF could not be uploaded: attach it by hand\./)).toBeVisible();
  const html = await page.evaluate(async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text());
  expect(html).toContain('Please find attached');
  expect(html).not.toContain('Click here for details');
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
  // Flyers to print are on unless turned off, and stay off on this device once turned off
  const flyers = dialog.getByRole('checkbox', { name: /Flyers to print at the end/ });
  await expect(flyers).toBeChecked();
  await flyers.uncheck();
  await page.keyboard.press('Escape');
  await page.getByTitle('Generate the Upcoming Events Digest (PDF)').first().click();
  await expect(flyers).not.toBeChecked();
});

test('an admin emails all staff a reminder to send in their events, formatted like the digest', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockSupabase(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Reminder' }).click();
  await expect(page.getByText('Reminder copied — click into the new message and press Ctrl+V to paste it')).toBeVisible();
  const email = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  expect(email.html).toContain('REMINDER');
  expect(email.html).toContain('href="http://localhost:4173/submit"');
  expect(email.html).toContain('Send in an event');
  expect(email.html).toContain('href="mailto:ivasyliev@partnershipcork.ie"');
  expect(email.text).toMatch(/before Friday \d+ \w+ so it makes it into the next Upcoming Events Digest/);
  expect(email.text).toContain('Email ivasyliev@partnershipcork.ie.');
});

test('admins choose who the digest and the reminder go to, with To, CC and BCC for each', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const backend = await mockSupabase(page);
  await signIn(page);

  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Email recipients' }).click();
  const dialog = page.getByRole('dialog', { name: 'Email recipients' });
  const digest = dialog.getByRole('region', { name: 'Events Digest' });
  const reminder = dialog.getByRole('region', { name: 'Reminder' });
  // Today's addresses to start with
  await expect(digest.getByText('martin_davoren@corkcity.ie')).toBeVisible();
  await expect(reminder.getByText('allstaff@partnershipcork.ie')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expectAccessible(page);

  // One CC off the digest; a BCC, pasted the way Outlook copies it, and a typed CC on the reminder
  await digest.getByRole('button', { name: 'Remove kieran_oconnell@corkcity.ie from Events Digest CC' }).click();
  const bcc = reminder.getByLabel('Reminder BCC: add an address');
  await bcc.focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Ihor Vasyliev <ivasyliev@partnershipcork.ie>; elizabeth@partnershipcork.ie');
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(reminder.getByText('ivasyliev@partnershipcork.ie')).toBeVisible();
  await expect(reminder.getByText('elizabeth@partnershipcork.ie')).toBeVisible();
  const cc = reminder.getByLabel('Reminder CC: add an address');
  await cc.fill('sam');
  await cc.press('Enter');
  await expect(reminder.getByText('“sam” isn’t a full email address.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await cc.fill('sam@partnershipcork.ie');
  await cc.press('Enter');
  await expect(reminder.getByText('sam@partnershipcork.ie')).toBeVisible();

  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Email recipients saved')).toBeVisible();
  expect(backend.emailRecipients.recipients).toEqual({
    digest: { to: ['allstaff@partnershipcork.ie'], cc: ['martin_davoren@corkcity.ie'], bcc: [] },
    reminder: {
      to: ['allstaff@partnershipcork.ie'],
      cc: ['sam@partnershipcork.ie'],
      bcc: ['ivasyliev@partnershipcork.ie', 'elizabeth@partnershipcork.ie']
    }
  });

  // Opened again: what was saved, and by whom; the digest's original addresses can be put back
  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Email recipients' }).click();
  await expect(dialog.getByText(/Last changed by Ada Admin/)).toBeVisible();
  await expect(reminder.getByText('elizabeth@partnershipcork.ie')).toBeVisible();
  await digest.getByRole('button', { name: 'Original addresses' }).click();
  await expect(digest.getByText('kieran_oconnell@corkcity.ie')).toBeVisible();
  await page.keyboard.press('Escape');

  // The Reminder button asks for the saved recipients before it opens the email
  backend.recipientRequests.length = 0;
  await page.getByRole('button', { name: 'Reminder' }).click();
  await expect(page.getByText('Reminder copied — click into the new message and press Ctrl+V to paste it')).toBeVisible();
  expect(backend.recipientRequests).toEqual(['GET']);
});

/** A one-page PDF with a line of text and a link, made by hand (offsets counted for the xref) */
const tinyPdf = (): Buffer => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R] >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Link /Rect [72 700 300 730] /Border [0 0 0] /A << /S /URI /URI (https://example.org/coffee) >> >>'
  ];
  const stream = 'BT /F1 24 Tf 72 710 Td (Coffee morning) Tj ET';
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};

test('anyone with the link sees the digest drawn on its page, links working, with a download button', async ({ page }) => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events-2026-10-12-to-2026-10-26';
  await page.route(`**/api/file/digests/${id}.pdf*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment' }, body: tinyPdf() }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/digest/${id}`);
  await expect(page.getByRole('heading', { name: 'Upcoming Events Digest' })).toBeVisible();
  await expect(page.locator('main').getByText('12 – 26 October 2026')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Page 1 of 1' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Page 1 of 1' }).locator('canvas')).toHaveCount(1);
  await expect(page.locator('a[href="https://example.org/coffee"]')).toHaveCount(1);
  const download = page.getByRole('link', { name: 'Download PDF' });
  await expect(download).toHaveAttribute('href', `/api/file/digests/${id}.pdf?download=1`);
  await expect(download).toHaveAttribute('download', 'CCP-Upcoming-Events-2026-10-12-to-2026-10-26.pdf');
  await expectAccessible(page);
});

test('on a phone the digest opens as a list of its events; the PDF loads only when asked for', async ({ page }) => {
  const id = '0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events-2026-10-12-to-2026-10-26';
  let pdfRequested = false;
  await page.route(`**/api/file/digests/${id}.pdf*`, (route) => {
    pdfRequested = true;
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
  });
  await page.route(`**/api/file/digests/${id}.json`, (route) => route.fulfill({ json: {
    version: 1,
    period: '12 – 26 October 2026',
    entries: [
      { day: 'Thursday 15 October', title: 'Coffee morning', category: 'Community & Family', time: '10:00 – 11:30', where: 'Mahon Community Centre',
        also: 'Thu 22 Oct', description: 'Tea and chats.', contacts: [{ name: 'Sam Staff', email: 'sam@partnershipcork.ie' }], isNew: true },
      { day: 'Friday 16 October', title: 'Job fair', category: 'Enterprise & Employment', time: '09:00 – 13:00', where: 'City Hall', also: '', description: '', contacts: [], isNew: false }
    ]
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/digest/${id}`);
  await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
  const thursday = page.getByRole('region', { name: 'Thursday 15 October' });
  await expect(thursday.getByRole('heading', { name: 'Coffee morning' })).toBeVisible();
  await expect(thursday).toContainText('Also on Thu 22 Oct');
  await expect(thursday.getByText('New', { exact: true })).toBeVisible();
  await expect(thursday.getByRole('link', { name: 'sam@partnershipcork.ie' })).toHaveAttribute('href', /^mailto:sam@partnershipcork\.ie/);
  await expect(page.getByRole('region', { name: 'Friday 16 October' }).getByRole('heading', { name: 'Job fair' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible();
  await expectAccessible(page);
  expect(pdfRequested).toBe(false);

  await page.getByRole('tab', { name: 'PDF' }).click();
  await expect(page.getByRole('group', { name: 'Page 1 of 1' }).locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Coffee morning' })).toHaveCount(0);
});

test('an expired digest link says so', async ({ page }) => {
  await page.route('**/api/file/digests/**', (route) => route.fulfill({ status: 404, body: 'File not found' }));
  await page.goto('/digest/0f0f0f0f-0000-0000-0000-000000000000-CCP-Upcoming-Events-2026-01-01-to-2026-01-14');
  await expect(page.getByRole('heading', { name: 'This digest is no longer available' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveCount(0);
});
