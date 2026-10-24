/**
 * Links to shared digest PDFs, remembered on this device: clicking Email (or Copy link) again for
 * the same digest — same day, period, layout and events — reuses the link instead of uploading
 * the PDF again, even after the dialog was closed or the page reloaded. Any change to the events
 * in the period makes a new PDF, and so a new link; every link to the week's digest opens its
 * newest PDF (functions/api/digest-versions.ts).
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

/** A shared digest's PDF: its key in storage, its URL, file name and the period it covers */
export interface DigestFile {
  key: string;
  fileUrl: string;
  fileName: string;
  /** "12 – 26 October 2026", or null when the name doesn't say */
  period: string | null;
  /** The period as YYYY-MM-DD, or null when the name doesn't say */
  start: string | null;
  end: string | null;
}

/** For a digest's name (<id>-<file name>, without .pdf): its PDF and the period it covers */
const digestFromName = (name: string): DigestFile => {
  const dates = /(\d{4})-(\d{2})-(\d{2})-to-(\d{4})-(\d{2})-(\d{2})/.exec(name);
  const period = dates
    ? formatPeriodShort(new Date(+dates[1], +dates[2] - 1, +dates[3]), new Date(+dates[4], +dates[5] - 1, +dates[6]))
    : null;
  return {
    key: `digests/${name}.pdf`,
    fileUrl: `${FILE_PREFIX}${name}.pdf`,
    fileName: `${name.slice(37)}.pdf`,
    period,
    start: dates ? `${dates[1]}-${dates[2]}-${dates[3]}` : null,
    end: dates ? `${dates[4]}-${dates[5]}-${dates[6]}` : null
  };
};

/** For a digest page's path: the PDF to show, its file name and the period it covers ("12 – 26 October 2026") */
export const digestFromPagePath = (pathname: string): DigestFile | null => {
  const match = PAGE_RE.exec(pathname);
  return match ? digestFromName(match[1].replace(/\.pdf$/i, '')) : null;
};

/** For a digest's key in storage (digests/<id>-<name>.pdf): the same */
export const digestFromKey = (key: string): DigestFile | null => {
  const match = /^digests\/(.+)\.pdf$/i.exec(key);
  return match && PAGE_RE.test(`/digest/${match[1]}`) ? digestFromName(match[1]) : null;
};

/** Where a shared digest's events are kept as a list (beside its PDF) */
export const digestListUrl = (digest: Pick<DigestFile, 'fileUrl'>): string => digest.fileUrl.replace(/\.pdf$/i, '.json');

/** A week's digest as /api/digest-versions names it: its newest PDF, its day, and when it was updated */
export interface DigestRef {
  digest: DigestFile;
  /** YYYY-MM-DD */
  issued: string;
  updatedAt: Date | null;
}

/** What a digest link shows (its week's newest PDF) and each week's, newest first */
export interface DigestVersions {
  latest: DigestRef;
  archive: DigestRef[];
}

const refFrom = (value: unknown): DigestRef | null => {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const digest = typeof r.key === 'string' ? digestFromKey(r.key) : null;
  if (!digest || typeof r.issued !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.issued)) return null;
  const updatedAt = typeof r.updatedAt === 'string' ? new Date(r.updatedAt) : null;
  return { digest, issued: r.issued, updatedAt: updatedAt && !isNaN(updatedAt.getTime()) ? updatedAt : null };
};

/** The answer of /api/digest-versions, or null when it isn't one */
export const parseDigestVersions = (value: unknown): DigestVersions | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const latest = refFrom(data.latest);
  if (!latest) return null;
  const archive = (Array.isArray(data.archive) ? data.archive : []).map(refFrom).filter((r): r is DigestRef => !!r);
  return { latest, archive };
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
 * What a digest PDF is made from: the day it is issued (its date, and which events count as new),
 * the period, the layout, whether the flyers are printed at the end, and everything the PDF shows
 * of each event in it.
 */
export const digestKeyOf = (options: {
  start: string; end: string; format: string; flyers?: boolean; events: Event[]; today?: Date;
}): string =>
  fingerprint(JSON.stringify([
    formatLocalDate(options.today ?? new Date()),
    options.start,
    options.end,
    options.format,
    options.flyers !== false,
    options.events.map((e) => [
      e.instanceKey ?? e.id, e.status, time(e.date), time(e.endDate),
      e.title, e.description, e.location, e.category, e.posterUrl ?? '', eventContacts(e), time(e.createdAt)
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
