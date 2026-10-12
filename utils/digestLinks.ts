/**
 * Links to shared digest PDFs, remembered on this device: clicking Email (or Copy link) again for
 * the same digest — same day, period, layout and events — reuses the link instead of uploading
 * the PDF again, even after the dialog was closed or the page reloaded. Any change to the events
 * in the period makes a new digest, and so a new link; links sent earlier keep their version.
 */
import type { Event } from '../types.ts';
import { eventContacts } from './contacts.ts';
import { formatLocalDate } from './date.ts';

const STORAGE_KEY = 'ccp_shared_digests';
const MAX_REMEMBERED = 10;

interface Remembered {
  key: string;
  url: string;
  expiresAt: string;
}

/** Short fingerprint of a long text (53-bit cyrb53) */
const fingerprint = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

const time = (d?: Date | string) => (d ? new Date(d).getTime() : 0);

/**
 * What a digest PDF is made from: the day it is issued (its date and "Today" marks), the period,
 * the layout and everything the PDF shows of each event in it.
 */
export const digestKeyOf = (options: { start: string; end: string; format: string; events: Event[]; today?: Date }): string =>
  fingerprint(JSON.stringify([
    formatLocalDate(options.today ?? new Date()),
    options.start,
    options.end,
    options.format,
    options.events.map((e) => [
      e.instanceKey ?? e.id, e.status, time(e.date), time(e.endDate),
      e.title, e.description, e.location, e.category, e.posterUrl ?? '', eventContacts(e)
    ])
  ]));

const readAll = (): Remembered[] => {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const now = Date.now();
    return Array.isArray(list)
      ? list.filter((r): r is Remembered =>
          !!r && typeof r.key === 'string' && typeof r.url === 'string' && typeof r.expiresAt === 'string' && time(r.expiresAt) > now)
      : [];
  } catch {
    return [];
  }
};

/** The link already shared for this digest, if any */
export const rememberedDigestLink = (key: string): string | null => readAll().find((r) => r.key === key)?.url ?? null;

export const rememberDigestLink = (key: string, shared: { url: string; expiresAt: string }) => {
  try {
    const list = [{ key, ...shared }, ...readAll().filter((r) => r.key !== key)].slice(0, MAX_REMEMBERED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the next click just uploads again
  }
};
