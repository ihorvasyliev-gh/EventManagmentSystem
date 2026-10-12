/**
 * Links to shared digest PDFs, remembered on this device: clicking Email (or Copy link) again for
 * the same digest — same day, period, layout and events — reuses the link instead of uploading
 * the PDF again, even after the dialog was closed or the page reloaded. Any change to the events
 * in the period makes a new digest, and so a new link; links sent earlier keep their version.
 */
import type { Event } from '../types.ts';
import { eventContacts } from './contacts.ts';
import { formatLocalDate } from './date.ts';
import { formatPeriodShort } from './digestText.ts';

// Remembered links are to the digest's page (earlier ones went straight to the file)
const STORAGE_KEY = 'ccp_shared_digest_pages';
const FILE_PREFIX = '/api/file/digests/';
const PAGE_RE = /^\/digest\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+)\/?$/i;

/**
 * The page that shows a shared digest, /digest/<id>-<name>: it draws the PDF itself and offers
 * the download, so it works in phone email apps' built-in browsers (a straight file download
 * shows a black screen there) and isn't taken over by PDF browser extensions.
 */
export const digestPageUrl = (fileUrl: string, origin: string): string => {
  const path = new URL(fileUrl, origin).pathname;
  if (!path.startsWith(FILE_PREFIX)) return new URL(fileUrl, origin).toString();
  return new URL(`/digest/${path.slice(FILE_PREFIX.length).replace(/\.pdf$/i, '')}`, origin).toString();
};

/** For a digest page's path: the PDF to show, its file name and the period it covers ("12 – 26 October 2026") */
export const digestFromPagePath = (pathname: string): { fileUrl: string; fileName: string; period: string | null } | null => {
  const match = PAGE_RE.exec(pathname);
  if (!match) return null;
  const name = match[1].replace(/\.pdf$/i, '');
  const fileName = `${name.slice(37)}.pdf`;
  const dates = /(\d{4})-(\d{2})-(\d{2})-to-(\d{4})-(\d{2})-(\d{2})/.exec(name);
  const period = dates
    ? formatPeriodShort(new Date(+dates[1], +dates[2] - 1, +dates[3]), new Date(+dates[4], +dates[5] - 1, +dates[6]))
    : null;
  return { fileUrl: `${FILE_PREFIX}${name}.pdf`, fileName, period };
};

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
