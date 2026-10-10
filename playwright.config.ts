import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests: the production build, served by `vite preview` with the same
 * headers (and Content-Security-Policy) as Cloudflare, and Supabase / the /api functions
 * answered by the tests themselves (e2e/support.ts). No real backend is needed.
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'Europe/Dublin',
    // Finished screens, not frames in the middle of an animation, for the contrast checks
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'en-IE',
    // A service worker would answer requests before the test's mocks could
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    // The cloud sandbox has Chromium pre-installed here; CI downloads its own
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {})
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /submit\.spec\.ts/ }
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://e2e.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key'
    }
  }
});
