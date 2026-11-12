import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS_BY_DEVICE, categoryQuery, deviceOf, feedUrlFor, knownCategories, subscribeLinks, subscribePageUrlFor, type AppId } from '../utils/subscribeLinks.ts';
import { EVENT_CATEGORIES, categoryFromKey, categoryKey } from '../constants/categories.ts';

const ORIGIN = 'https://cal.test';

test('a category goes into an address as a key of letters, digits and hyphens', () => {
  assert.deepEqual(EVENT_CATEGORIES.map(categoryKey), [
    'enterprise-employment', 'community-family', 'education-training', 'special-visits-celebrations',
    'public-information-session', 'health-wellbeing', 'other'
  ]);
  for (const cat of EVENT_CATEGORIES) {
    assert.equal(categoryFromKey(categoryKey(cat)), cat);
    assert.equal(categoryFromKey(cat.toUpperCase()), cat, 'the full name, in any case, is the same category');
  }
  assert.equal(categoryFromKey('nonsense'), undefined);
  assert.equal(categoryKey('  Встреча '), 'встреча', 'a name with no Latin letters keeps a key');
});

test('the feed and page addresses carry the ticked categories, in the list’s order, and need no escaping', () => {
  assert.equal(feedUrlFor([], ORIGIN), 'https://cal.test/api/calendar');
  assert.equal(subscribePageUrlFor([], ORIGIN), 'https://cal.test/subscribe');
  const ticked = knownCategories(['Other', 'health-wellbeing', 'Nonsense']);
  assert.deepEqual(ticked, ['Health & Wellbeing', 'Other']);
  assert.equal(categoryQuery(ticked), '?category=health-wellbeing,other');
  const feed = feedUrlFor(ticked, ORIGIN);
  assert.equal(feed, 'https://cal.test/api/calendar?category=health-wellbeing,other');
  assert.doesNotMatch(feed, /[%&\s]/, 'nothing an app could decode or encode differently');
  assert.equal(subscribePageUrlFor(ticked, ORIGIN), 'https://cal.test/subscribe?category=health-wellbeing,other');
});

test('each calendar’s link hands it the feed', () => {
  const links = subscribeLinks(['Health & Wellbeing'], ORIGIN, 'windows');
  const feed = 'https://cal.test/api/calendar?category=health-wellbeing';

  const work = new URL(links['outlook-work'].href);
  assert.equal(`${work.origin}${work.pathname}`, 'https://outlook.office.com/calendar/0/addfromweb');
  assert.equal(work.searchParams.get('url'), feed);
  assert.equal(work.searchParams.get('name'), 'CCP Events: Health & Wellbeing');

  const personal = new URL(links['outlook-personal'].href);
  assert.equal(`${personal.origin}${personal.pathname}`, 'https://outlook.live.com/calendar/0/addfromweb');
  assert.equal(personal.searchParams.get('url'), feed);

  // Apple Calendar and classic Outlook take the address itself, as webcal://
  assert.equal(links.apple.href, 'webcal://cal.test/api/calendar?category=health-wellbeing');
  assert.equal(links['outlook-classic'].href, links.apple.href);
  assert.equal(links.apple.newTab, false);

  const google = new URL(links.google.href);
  assert.equal(`${google.origin}${google.pathname}`, 'https://calendar.google.com/calendar/render');
  assert.equal(google.searchParams.get('cid'), 'webcal://cal.test/api/calendar?category=health-wellbeing');

  // Every event: no query at all
  assert.equal(new URL(subscribeLinks([], ORIGIN, 'windows')['outlook-work'].href).searchParams.get('url'), 'https://cal.test/api/calendar');
  assert.equal(new URL(subscribeLinks([], ORIGIN, 'windows')['outlook-work'].href).searchParams.get('name'), 'CCP Events');
});

test('the device decides which calendars are offered, and which comes first', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
  const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  assert.equal(deviceOf(IPHONE, 5), 'ios');
  assert.equal(deviceOf(MAC, 5), 'ios', 'an iPad says it is a Mac, but has a touch screen');
  assert.equal(deviceOf(MAC, 0), 'mac');
  assert.equal(deviceOf(ANDROID, 5), 'android');
  assert.equal(deviceOf(WINDOWS, 0), 'windows');
  assert.equal(deviceOf(LINUX, 0), 'other');

  assert.equal(APPS_BY_DEVICE.ios.main[0], 'apple');
  assert.equal(APPS_BY_DEVICE.android.main[0], 'google');
  assert.equal(APPS_BY_DEVICE.windows.main[0], 'outlook-work');
  // A webcal:// link only does something where an app takes it: Apple's devices, and Windows with classic Outlook
  assert.ok(!APPS_BY_DEVICE.android.main.includes('apple') && !APPS_BY_DEVICE.windows.main.includes('apple'));
  for (const device of ['ios', 'android', 'mac', 'other'] as const) assert.ok(!APPS_BY_DEVICE[device].main.includes('outlook-classic'));
  // Nothing is lost: every calendar is on every device, once
  const all: AppId[] = ['apple', 'google', 'outlook-classic', 'outlook-personal', 'outlook-work'];
  for (const { main, more } of Object.values(APPS_BY_DEVICE)) assert.deepEqual([...main, ...more].sort(), all);

  // The words say when a link won't work on this device
  assert.match(subscribeLinks([], ORIGIN, 'android').apple.hint, /open this page there/);
  assert.match(subscribeLinks([], ORIGIN, 'android').google.hint, /best on a computer/);
  assert.doesNotMatch(subscribeLinks([], ORIGIN, 'windows').google.hint, /best on a computer/);
});
