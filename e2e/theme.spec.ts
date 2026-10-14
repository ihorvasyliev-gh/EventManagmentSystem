import { test, expect, type Page } from '@playwright/test';
import { mockSupabase, signIn, eventRow, daysFromNow } from './support';

/** Clicks the theme button and reports what the page is doing two frames later */
const switchTheme = (page: Page, label: string) =>
  page.evaluate(async (buttonLabel) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    (document.querySelector(`[aria-label="${buttonLabel}"]`) as HTMLButtonElement).click();
    await frame();
    await frame();
    const animations = document.getAnimations();
    return {
      dark: document.documentElement.classList.contains('dark'),
      // Before, 286 buttons, cards and fields faded on their own timing while the rest jumped
      elementTransitions: animations.filter((a) => a.constructor.name === 'CSSTransition').length,
      crossfade: animations.some((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition'))
    };
  }, label);

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`switching theme changes the whole page at once (${motion === 'reduce' ? 'less motion' : 'crossfade'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: motion });
    await mockSupabase(page, { events: [eventRow({ id: '10000000-0000-0000-0000-000000000001', title: 'Enterprise breakfast', date: daysFromNow(1), end_date: daysFromNow(1, 11) })] });
    await signIn(page);
    await expect(page.getByText('Enterprise breakfast').first()).toBeVisible();

    const toDark = await switchTheme(page, 'Switch to dark mode');
    expect(toDark).toMatchObject({ dark: true, elementTransitions: 0, crossfade: motion === 'no-preference' });
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/theme-switching/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    // The browser's own controls follow the theme too
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');

    const toLight = await switchTheme(page, 'Switch to light mode');
    expect(toLight).toMatchObject({ dark: false, elementTransitions: 0 });
    await expect(page.locator('html')).not.toHaveClass(/theme-switching/);
  });
}

test('the theme chosen in one tab applies to the other open tabs', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockSupabase(page, { events: [] });
  await signIn(page);
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('/submit');
  await expect(other.locator('html')).not.toHaveClass(/\bdark\b/);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(other.locator('html')).toHaveClass(/\bdark\b/);
  await expect(other.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});
