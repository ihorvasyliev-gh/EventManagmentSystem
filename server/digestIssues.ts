/**
 * Which events each shared digest carried, so the next week's digest marks NEW only what its
 * readers haven't had yet. Kept in R2 as one small JSON file, outside digests/ so the six-month
 * cleanup never removes it, and /api/file refuses to serve anything under meta/.
 */
import type { FileBucket } from './files.ts';

export const ISSUES_KEY = 'meta/digest-issues.json';
/** About half a year of weekly digests */
export const MAX_ISSUES = 26;
/** Far more events than a digest period holds; anything beyond is ignored */
export const MAX_IDS = 2000;

/** One shared digest: the day it was shared (YYYY-MM-DD, the sender's date) and its events' ids */
export interface DigestIssue {
  issued: string;
  ids: string[];
}

export interface IssueBucket extends FileBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const isIssueDay = (value: unknown): value is string => typeof value === 'string' && DAY_RE.test(value);

/** A digest issue from untrusted input (the share request, or the stored file), or null */
export const parseIssue = (issued: unknown, ids: unknown): DigestIssue | null => {
  if (!isIssueDay(issued) || !Array.isArray(ids)) return null;
  const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && ID_RE.test(id)))];
  return { issued, ids: clean.slice(0, MAX_IDS) };
};

export const readIssues = async (bucket: IssueBucket): Promise<DigestIssue[]> => {
  const object = await bucket.get(ISSUES_KEY);
  if (!object) return [];
  try {
    const data: unknown = JSON.parse(await object.text());
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => (item && typeof item === 'object' ? parseIssue((item as DigestIssue).issued, (item as DigestIssue).ids) : null))
      .filter((issue): issue is DigestIssue => !!issue);
  } catch {
    return [];
  }
};

/** Adds a shared digest; sharing again the same day adds its events to that day's issue */
export const recordIssue = async (bucket: IssueBucket, issue: DigestIssue): Promise<void> => {
  const issues = await readIssues(bucket);
  const sameDay = issues.find((i) => i.issued === issue.issued);
  if (sameDay) sameDay.ids = [...new Set([...sameDay.ids, ...issue.ids])].slice(0, MAX_IDS);
  else issues.push(issue);
  issues.sort((a, b) => a.issued.localeCompare(b.issued));
  await bucket.put(ISSUES_KEY, new Blob([JSON.stringify(issues.slice(-MAX_ISSUES))]), { httpMetadata: { contentType: 'application/json' } });
};

/** The latest digest shared before `before` (a day), or null when there is none */
export const previousIssue = (issues: DigestIssue[], before: string): DigestIssue | null =>
  issues.filter((i) => i.issued < before).at(-1) ?? null;
