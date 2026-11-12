/**
 * Subscribing to the live calendar feed: its address for some categories, the one-click links
 * for Outlook, Apple and Google, and which of them suit the device the page is opened on.
 * Pure functions, so they can be tested.
 */
import { EVENT_CATEGORIES, categoryKey } from '../constants/categories.ts';
import { calendarName } from '../server/feed.ts';

/** Ticked categories in the order of the category list, and only official ones (given as keys or names) */
export const knownCategories = (names: string[]): string[] => {
  const wanted = new Set(names.map(categoryKey));
  return EVENT_CATEGORIES.filter((c) => wanted.has(categoryKey(c)));
};

/** `?category=health-wellbeing,other` for some categories, or nothing for every event */
export const categoryQuery = (categories: string[]): string =>
  categories.length > 0 ? `?category=${categories.map(categoryKey).join(',')}` : '';

/** The live feed's address for some categories (none = every published event) */
export const feedUrlFor = (categories: string[], origin: string): string => `${origin}/api/calendar${categoryQuery(categories)}`;

/** The public subscribe page, with the same categories ticked */
export const subscribePageUrlFor = (categories: string[], origin: string): string => `${origin}/subscribe${categoryQuery(categories)}`;

/** The name the calendar gets in Outlook (the feed names itself the same way for other apps) */
export const feedNameFor = calendarName;

export type AppId = 'outlook-work' | 'outlook-personal' | 'apple' | 'google' | 'outlook-classic';
export type Device = 'ios' | 'android' | 'mac' | 'windows' | 'other';

/** The kind of device a browser says it is (an iPad says it is a Mac, but has a touch screen) */
export const deviceOf = (userAgent: string, touchPoints = 0): Device => {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  return 'other';
};

/**
 * The calendars offered on a device, the likeliest first, and the ones kept under "More
 * calendars" because their link does nothing there (Apple Calendar's on Windows or Android,
 * classic Outlook's anywhere but Windows)
 */
export const APPS_BY_DEVICE: Record<Device, { main: AppId[]; more: AppId[] }> = {
  ios: { main: ['apple', 'outlook-work', 'outlook-personal', 'google'], more: ['outlook-classic'] },
  android: { main: ['google', 'outlook-work', 'outlook-personal'], more: ['apple', 'outlook-classic'] },
  mac: { main: ['outlook-work', 'apple', 'outlook-personal', 'google'], more: ['outlook-classic'] },
  windows: { main: ['outlook-work', 'outlook-personal', 'google', 'outlook-classic'], more: ['apple'] },
  other: { main: ['outlook-work', 'outlook-personal', 'google'], more: ['apple', 'outlook-classic'] },
};

export interface SubscribeLink {
  id: AppId;
  href: string;
  name: string;
  /** One line under the name: what it is for, or why it may not work on this device */
  hint: string;
  /** Opens a web page (a new tab); otherwise it hands the address to a calendar app on the device */
  newTab: boolean;
  /** What to do in the window the link opens */
  next: { title: string; text: string };
}

/** The link that adds the feed to each calendar, with the words for the device it is shown on */
export function subscribeLinks(categories: string[], origin: string, device: Device): Record<AppId, SubscribeLink> {
  const feedUrl = feedUrlFor(categories, origin);
  // webcal:// opens the calendar app that registers for it (Apple Calendar, classic Outlook);
  // Outlook on the web and Google get their own links (Android has no webcal app at all)
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const addFromWeb = (host: string) =>
    `https://${host}/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(feedNameFor(categories))}`;
  const onPhone = device === 'ios' || device === 'android';
  const outlookNext = {
    title: 'Outlook opened in a new tab',
    text: 'Sign in there if it asks, then press Import. The calendar appears in your calendar list.',
  };
  return {
    'outlook-work': {
      id: 'outlook-work', href: addFromWeb('outlook.office.com'), newTab: true,
      name: 'Outlook (work or school account)',
      hint: 'Microsoft 365. Then also in Outlook on your computer and phone',
      next: outlookNext,
    },
    'outlook-personal': {
      id: 'outlook-personal', href: addFromWeb('outlook.live.com'), newTab: true,
      name: 'Outlook.com (personal account)',
      hint: 'Outlook.com, Hotmail or Live',
      next: outlookNext,
    },
    apple: {
      id: 'apple', href: webcalUrl, newTab: false,
      name: 'Apple Calendar',
      hint: device === 'ios' || device === 'mac' ? 'iPhone, iPad or Mac' : 'Only on an iPhone, iPad or Mac: open this page there',
      next: { title: 'Your device asks to subscribe', text: 'Press Subscribe when it asks, then Add (on a Mac, OK).' },
    },
    google: {
      id: 'google', href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`, newTab: true,
      name: 'Google Calendar',
      hint: onPhone
        ? 'Works best on a computer: Google’s phone app can’t add calendars, but shows them once added'
        : 'Opens Google Calendar; then on your Android phone too',
      next: {
        title: 'Google Calendar opened in a new tab',
        text: onPhone
          ? 'Press Add if it asks. If nothing is added, open this page on a computer: the calendar then shows on your phone too.'
          : 'Press Add when it asks. The calendar appears under Other calendars.',
      },
    },
    'outlook-classic': {
      id: 'outlook-classic', href: webcalUrl, newTab: false,
      name: 'Classic Outlook on Windows',
      hint: device === 'windows' ? 'Opens the Outlook app on this computer; only on this computer' : 'Only on a Windows computer with the Outlook app',
      next: { title: 'Outlook asks to add the calendar', text: 'Press Yes when Outlook asks to add this Internet Calendar and subscribe to updates.' },
    },
  };
}
