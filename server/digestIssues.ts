/**
 * Which events each shared digest carried, so the next week's digest marks NEW only what its
 * readers haven't had yet, and which PDFs were shared as it (the newest is what its links show:
 * server/digestVersions.ts). Kept in R2 as one small JSON file, outside digests/ so the six-month
 * cleanup never removes it, and /api/file refuses to serve anything under meta/.
 */
import type { FileBucket } from './files.ts';

export const ISSUES_KEY = 'meta/digest-issues.json';
/** About half a year of weekly digests */
export const MAX_ISSUES = 26;
/** Far more events than a digest period holds; anything beyond is ignored */
export const MAX_IDS = 2000;
/** Each change shared makes a new PDF; the last ones of an issue are plenty */
export const MAX_VERSIONS = 40;

export type DigestLayout = 'executive' | 'compact';

/**
 * One PDF shared as an issue. An update is the issue made again after its events changed: its
 * links show it, with what changed marked. Layout and flyers let the next update look the same.
 */
export interface DigestVersionRecord {
  key: string;
  update?: true;
  layout?: DigestLayout;
  flyers?: boolean;
}

/** One shared digest: the day it was shared (YYYY-MM-DD, the sender's date) and its events' ids */
export interface DigestIssue {
  issued: string;
  ids: string[];
  /** The PDFs shared as this issue, oldest first (not recorded before updates existed) */
  versions?: DigestVersionRecord[];
}

export interface IssueBucket extends FileBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** A shared digest's PDF: digests/<uuid>-<file name>.pdf */
export const DIGEST_KEY_RE = /^digests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+\.pdf$/i;

export const isIssueDay = (value: unknown): value is string => typeof value === 'string' && DAY_RE.test(value);

export const isDigestLayout = (value: unknown): value is DigestLayout => value === 'executive' || value === 'compact';

/** A digest issue from untrusted input (the share request, or the stored file), or null */
export const parseIssue = (issued: unknown, ids: unknown): DigestIssue | null => {
  if (!isIssueDay(issued) || !Array.isArray(ids)) return null;
  const clean = [...new Set(ids.filter((id): id is string => typeof id === 'string' && ID_RE.test(id)))];
  return { issued, ids: clean.slice(0, MAX_IDS) };
};

/** A recorded PDF of an issue (from the stored file), or null */
const parseVersion = (value: unknown): DigestVersionRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== 'string' || !DIGEST_KEY_RE.test(v.key)) return null;
  return {
    key: v.key,
    ...(v.update === true ? { update: true as const } : {}),
    ...(isDigestLayout(v.layout) ? { layout: v.layout } : {}),
    ...(typeof v.flyers === 'boolean' ? { flyers: v.flyers } : {})
  };
};

export const readIssues = async (bucket: IssueBucket): Promise<DigestIssue[]> => {
  const object = await bucket.get(ISSUES_KEY);
  if (!object) return [];
  try {
    const data: unknown = JSON.parse(await object.text());
    if (!Array.isArray(data)) return [];
    return data.flatMap((item): DigestIssue[] => {
      if (!item || typeof item !== 'object') return [];
      const issue = parseIssue((item as DigestIssue).issued, (item as DigestIssue).ids);
      if (!issue) return [];
      const raw = (item as DigestIssue).versions;
      const versions = Array.isArray(raw) ? raw.map(parseVersion).filter((v): v is DigestVersionRecord => !!v) : [];
      return [versions.length ? { ...issue, versions } : issue];
    });
  } catch {
    return [];
  }
};

/**
 * Adds a shared digest; sharing again the same day (or updating that day's issue) adds its
 * events to that day's issue. `version` is the PDF shared, recorded with the issue.
 */
export const recordIssue = async (bucket: IssueBucket, issue: DigestIssue, version?: DigestVersionRecord): Promise<void> => {
  const issues = await readIssues(bucket);
  let entry = issues.find((i) => i.issued === issue.issued);
  if (entry) entry.ids = [...new Set([...entry.ids, ...issue.ids])].slice(0, MAX_IDS);
  else issues.push(entry = { issued: issue.issued, ids: issue.ids });
  if (version) entry.versions = [...(entry.versions ?? []), version].slice(-MAX_VERSIONS);
  issues.sort((a, b) => a.issued.localeCompare(b.issued));
  await bucket.put(ISSUES_KEY, new Blob([JSON.stringify(issues.slice(-MAX_ISSUES))]), { httpMetadata: { contentType: 'application/json' } });
};

/** The latest digest shared before `before` (a day), or null when there is none */
export const previousIssue = (issues: DigestIssue[], before: string): DigestIssue | null => {
  const found = issues.filter((i) => i.issued < before).at(-1);
  return found ? { issued: found.issued, ids: found.ids } : null;
};
