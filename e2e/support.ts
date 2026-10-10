import { expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const SUPABASE = 'https://e2e.supabase.co';
export const ADMIN_ID = '00000000-0000-0000-0000-00000000000a';

export interface EventRow {
  id: string;
  title: string;
  date: string;
  status: 'draft' | 'published';
  [key: string]: unknown;
}

export const eventRow = (over: Partial<EventRow> & Pick<EventRow, 'id' | 'title' | 'date'>): EventRow => ({
  description: 'A short description.',
  end_date: null,
  location: 'Heron House',
  poster_url: null,
  status: 'published',
  category: 'Community & Family',
  tags: [],
  recurrence_type: 'none',
  recurrence_interval: null,
  recurrence_end_date: null,
  recurrence_occurrences: null,
  recurrence_days_of_week: null,
  recurrence_custom_dates: null,
  recurrence_custom_end_dates: null,
  recurrence_custom_locations: null,
  submitter_name: null,
  submitter_email: null,
  creator_id: ADMIN_ID,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  ...over
});

/** A day at 10:00 the given number of days from today (Irish time in the browser) */
export const daysFromNow = (days: number, hour = 10): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

interface BackendOptions {
  role?: 'admin' | 'staff';
  mustChangePassword?: boolean;
  events?: EventRow[];
}

/** Answers Supabase (auth, REST, realtime) for a signed-in-able user with the given events */
export const mockSupabase = async (page: Page, { role = 'admin', mustChangePassword = false, events = [] }: BackendOptions = {}) => {
  const user = { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'ada@partnershipcork.ie', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const profile = { id: ADMIN_ID, email: user.email, full_name: 'Ada Admin', role, must_change_password: mustChangePassword };
  const state = { profile, events, passwordChanges: [] as string[] };

  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {
    // Accept the connection and stay quiet: no live changes in these tests
  });

  await page.route(`${SUPABASE}/auth/v1/token**`, (route) =>
    json(route, {
      access_token: 'e2e-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'e2e-refresh-token',
      user
    })
  );
  await page.route(`${SUPABASE}/auth/v1/user**`, async (route) => {
    if (route.request().method() === 'PUT') state.passwordChanges.push(JSON.parse(route.request().postData() || '{}').password);
    return json(route, user);
  });
  await page.route(`${SUPABASE}/auth/v1/logout**`, (route) => route.fulfill({ status: 204 }));
  await page.route(`${SUPABASE}/rest/v1/users**`, async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      Object.assign(state.profile, JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 204 });
    }
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    return json(route, single ? state.profile : [state.profile]);
  });
  await page.route(`${SUPABASE}/rest/v1/events**`, (route) => {
    const url = new URL(route.request().url());
    const drafts = url.searchParams.get('status') === 'eq.draft';
    const rows = state.events.filter((e) => !drafts || e.status === 'draft');
    return json(route, rows, 200, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  });
  await page.route(`${SUPABASE}/rest/v1/recurrence_exceptions**`, (route) =>
    json(route, [], 200, { 'Content-Range': '*/0' })
  );
  await page.route(`${SUPABASE}/rest/v1/event_attachments**`, (route) => json(route, []));
  await page.route(`${SUPABASE}/rest/v1/event_history**`, (route) => json(route, []));
  return state;
};

/** Signs in through the login form */
export const signIn = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('ada@partnershipcork.ie');
  await page.getByLabel('Password', { exact: true }).fill('correct horse');
  await page.getByRole('button', { name: 'Sign in' }).click();
};

/** Records Content-Security-Policy violations, so a test can assert there were none */
export const watchCsp = async (page: Page) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return async () => {
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations, 'Content-Security-Policy violations').toEqual([]);
  };
};

/** No serious or critical accessibility problems on what's on screen */
export const expectAccessible = async (page: Page, exclude: string[] = []) => {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
  expect(serious, 'accessibility problems').toEqual([]);
};
