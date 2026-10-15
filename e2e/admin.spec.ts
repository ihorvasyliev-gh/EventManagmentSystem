import { test, expect, type Page } from '@playwright/test';
import { mockSupabase, signIn, expectAccessible, eventRow, daysFromNow, ADMIN_ID } from './support';

const ID = '10000000-0000-0000-0000-000000000001';
const GONE = '10000000-0000-0000-0000-0000000000d1';
const POSTER = '/api/file/posters/breakfast.png';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** The flyer, and which files were removed from storage */
const mockFiles = async (page: Page) => {
  const removed: string[] = [];
  await page.route('**/api/file/**', (route) => {
    if (route.request().method() === 'DELETE') {
      removed.push(new URL(route.request().url()).pathname);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ contentType: 'image/png', body: PIXEL });
  });
  return removed;
};

test('a deleted event comes back with Undo, and its flyer is only removed once the chance to undo has gone', async ({ page }) => {
  const backend = await mockSupabase(page, {
    events: [eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(1), end_date: daysFromNow(1, 11), poster_url: POSTER })]
  });
  const removed = await mockFiles(page);
  await signIn(page);

  const deleteIt = async () => {
    await page.getByText('Enterprise breakfast').first().click();
    await page.getByRole('dialog', { name: 'Event Details' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete Event' }).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Event deleted successfully')).toBeVisible();
    await expect(page.getByText('Enterprise breakfast')).toHaveCount(0);
  };

  await deleteIt();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('"Enterprise breakfast" is back on the calendar')).toBeVisible();
  await expect(page.getByText('Enterprise breakfast').first()).toBeVisible();
  // Put back as it was, with the same id (so links to it work again) and its flyer
  expect(backend.writes.filter((w) => w.method === 'POST')).toEqual([
    expect.objectContaining({ id: ID, body: expect.objectContaining({ title: 'Enterprise breakfast', poster_url: POSTER }) })
  ]);
  expect(removed).toEqual([]);

  // Closing the message instead: no undo, so the flyer goes
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await deleteIt();
  await page.getByText('Event deleted successfully').locator('..').getByRole('button', { name: 'Dismiss notification' }).click();
  await expect.poll(() => removed).toEqual([POSTER]);
  await expect(page.getByText('Enterprise breakfast')).toHaveCount(0);
});

test('admins restore a deleted event from the change log, and find entries by event name or person', async ({ page }) => {
  const backend = await mockSupabase(page, { events: [eventRow({ id: ID, title: 'Coffee morning', date: daysFromNow(2) })] });
  await mockFiles(page);
  await page.route('**/api/staff', (route) =>
    route.fulfill({
      json: {
        staff: [
          { id: ADMIN_ID, email: 'ada@partnershipcork.ie', fullName: 'Ada Admin', role: 'admin', mustChangePassword: false, createdAt: '2026-01-01T00:00:00Z' },
          { id: '00000000-0000-0000-0000-00000000000b', email: 'yq@partnershipcork.ie', fullName: 'Yvonne Quilligan', role: 'staff', mustChangePassword: false, createdAt: '2026-01-01T00:00:00Z' }
        ]
      }
    })
  );
  const asked: string[] = [];
  await page.route('**/rest/v1/event_history**', (route) => {
    if (route.request().method() === 'HEAD') {
      return route.fulfill({ status: 200, headers: { 'Content-Range': '*/0', 'Access-Control-Expose-Headers': 'Content-Range' } });
    }
    const url = decodeURIComponent(route.request().url());
    asked.push(url);
    if (!url.includes('action=eq.deleted')) return route.fulfill({ json: [] });
    if (url.includes('ilike') && !url.toLowerCase().includes('ilike.%job%')) return route.fulfill({ json: [] });
    return route.fulfill({
      json: [{
        id: 'h1', event_id: GONE, event_title: 'Job fair', user_id: ADMIN_ID, user_name: 'Ada Admin', action: 'deleted',
        timestamp: new Date().toISOString(),
        changes: { when: { old: 'Thu 22 Oct 2026, 09:00–17:00' } },
        snapshot: {
          event: eventRow({ id: GONE, title: 'Job fair', date: daysFromNow(3, 9), end_date: daysFromNow(3, 17) }),
          attachments: [],
          deleted_dates: []
        },
        users: { role: 'admin' }
      }]
    });
  });
  await signIn(page);

  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  await page.getByRole('menuitem', { name: /Change log/ }).click();
  const log = page.getByRole('dialog', { name: 'Change log' });
  await log.getByRole('tab', { name: 'Deleted' }).click();
  const entry = log.getByRole('listitem').filter({ hasText: 'Job fair' });
  await expect(entry).toContainText('Ada Admin deleted Job fair');
  expect(asked.at(-1)).toContain('snapshot');

  // Narrowing down: by name, then by who did it
  await log.getByRole('searchbox', { name: 'Search by event name' }).fill('quiz');
  await expect(log.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await log.getByRole('searchbox', { name: 'Search by event name' }).fill('Job');
  await expect(entry).toBeVisible();
  expect(asked.at(-1)).toContain('event_title=ilike.%Job%');
  await log.getByRole('combobox', { name: 'Who did it' }).selectOption({ label: 'Ada Admin' });
  await expect.poll(() => asked.at(-1)).toContain(`user_id=eq.${ADMIN_ID}`);
  await expect(entry).toBeVisible();
  await expectAccessible(page);

  await entry.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('"Job fair" is back on the calendar')).toBeVisible();
  await expect(entry.getByText('Back on the calendar')).toBeVisible();
  expect(backend.writes).toContainEqual(expect.objectContaining({ method: 'POST', id: GONE }));

  // Back on the calendar: its name opens it
  await entry.getByRole('button', { name: 'Job fair' }).click();
  await expect(page.getByRole('dialog', { name: 'Event Details' }).getByRole('heading', { name: 'Job fair' })).toBeVisible();
});

test('with a search on, the export says how many events it takes and can take them all', async ({ page }) => {
  await mockSupabase(page, {
    events: [
      eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(1) }),
      eventRow({ id: GONE, title: 'Coffee morning', date: daysFromNow(2) }),
      eventRow({ id: '10000000-0000-0000-0000-0000000000d3', title: 'Draft idea', date: daysFromNow(3), status: 'draft' })
    ]
  });
  await signIn(page);
  await expect(page.getByText('Enterprise breakfast').first()).toBeVisible();

  const exportCount = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Export & subscribe' }).getByRole('button', { name: /^Download/ }).click();
    const file = await (await download).path();
    const { readFile } = await import('node:fs/promises');
    return ((await readFile(file, 'utf8')).match(/BEGIN:VEVENT/g) ?? []).length;
  };

  // Nothing narrowed down: no choice to make
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export & subscribe' });
  await expect(dialog.getByText('Export 2 published events as')).toBeVisible();
  await expect(dialog.getByText('Your search or filters are on')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('searchbox', { name: 'Search events' }).fill('breakfast');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByText('Your search or filters are on')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Only the 1 published event that matches' })).toBeChecked();
  await expect(dialog.getByText('Export 1 published event as')).toBeVisible();
  await expectAccessible(page);
  expect(await exportCount()).toBe(1);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await dialog.getByRole('radio', { name: 'All 2 published events' }).check();
  await expect(dialog.getByText('Export 2 published events as')).toBeVisible();
  expect(await exportCount()).toBe(2);
});

test('statistics download as an Excel workbook for the period', async ({ page }) => {
  await mockSupabase(page, {
    events: [
      eventRow({ id: ID, title: 'Enterprise breakfast', date: daysFromNow(0) }),
      eventRow({ id: GONE, title: 'Coffee morning', date: daysFromNow(0, 14), location: 'Mahon Library' })
    ]
  });
  await signIn(page);
  await expect(page.getByText('Enterprise breakfast').first()).toBeVisible();
  await page.getByRole('button', { name: /Ada Admin|Account menu/ }).click();
  await page.getByRole('menuitem', { name: /Statistics/ }).click();
  const stats = page.getByRole('dialog', { name: 'Statistics' });
  await expect(stats.getByText('dates held', { exact: true })).toBeVisible();
  await expectAccessible(page);

  const download = page.waitForEvent('download');
  await stats.getByRole('button', { name: 'Download Excel' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^ccp-statistics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await file.path());
  expect(book.getWorksheet('Dates')!.rowCount).toBe(3);
});
