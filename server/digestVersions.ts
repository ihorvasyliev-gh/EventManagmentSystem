/**
 * Every shared digest PDF still kept, and the issue it belongs to: its week. The digest goes out
 * once a week (on Fridays); when an event in it changes afterwards, the digest is updated, which
 * shares a new PDF for the same week. Every link to a week's digest shows its newest PDF, so an
 * email that already went out stays right, and the weeks before make the archive.
 */
import { type DigestIssue, type DigestLayout, type IssueBucket, DIGEST_KEY_RE } from './digestIssues.ts';

export const DIGEST_PREFIX = 'digests/';

/** Listing as well as storing: digests are found by their upload date */
export interface DigestBucket extends IssueBucket {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: Array<{ key: string; uploaded: Date }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

/** One shared PDF: its issue's day (YYYY-MM-DD), when it was uploaded, and whether it is an update */
export interface DigestVersion {
  key: string;
  issued: string;
  at: Date;
  update: boolean;
  layout?: DigestLayout;
  flyers?: boolean;
}

/** One issue: the week (its Monday) and its PDFs, oldest first; the last is what its links show */
export interface DigestWeek {
  week: string;
  versions: DigestVersion[];
}

/** What a link shows: the newest PDF of its week, and when it was updated (null: as it went out) */
export interface DigestRef {
  key: string;
  issued: string;
  updatedAt: string | null;
}

/** The latest issue, for updating it: what its links show now, and the PDF that went out */
export interface SentDigest {
  issued: string;
  key: string;
  /** The newest PDF that isn't an update: an update marks what changed since it */
  base: string;
  layout?: DigestLayout;
  flyers?: boolean;
}

/** Everything stored under digests/ (the PDFs and their lists), with when it was uploaded */
export const listDigestObjects = async (bucket: DigestBucket): Promise<Array<{ key: string; uploaded: Date }>> => {
  const objects: Array<{ key: string; uploaded: Date }> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: DIGEST_PREFIX, cursor });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
};

// A digest shared before its issue was recorded belongs to the day it was uploaded, in Ireland
// (where the digest is sent from)
const IRISH_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The PDFs among the stored objects, each with its issue, oldest first */
export const digestVersions = (objects: Array<{ key: string; uploaded: Date }>, issues: DigestIssue[]): DigestVersion[] => {
  const recorded = new Map(issues.flatMap((issue) => (issue.versions ?? []).map((v) => [v.key, { ...v, issued: issue.issued }] as const)));
  return objects
    .filter((o) => DIGEST_KEY_RE.test(o.key))
    .map((o): DigestVersion => {
      const at = new Date(o.uploaded);
      const r = recorded.get(o.key);
      return {
        key: o.key,
        issued: r?.issued ?? IRISH_DAY.format(at),
        at,
        update: !!r?.update,
        ...(r?.layout ? { layout: r.layout } : {}),
        ...(r?.flyers !== undefined ? { flyers: r.flyers } : {})
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
};

/** Monday of the week a day (YYYY-MM-DD) falls in: one issue a week */
export const issueWeek = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

/** The digests by issue, newest week first */
export const digestWeeks = (versions: DigestVersion[]): DigestWeek[] => {
  const weeks = new Map<string, DigestVersion[]>();
  versions.forEach((v) => {
    const week = issueWeek(v.issued);
    weeks.set(week, [...(weeks.get(week) ?? []), v]);
  });
  return [...weeks].map(([week, list]) => ({ week, versions: list })).sort((a, b) => b.week.localeCompare(a.week));
};

export const refOf = ({ versions }: DigestWeek): DigestRef => {
  const shown = versions[versions.length - 1];
  return { key: shown.key, issued: shown.issued, updatedAt: shown.update ? shown.at.toISOString() : null };
};

export const sentDigestOf = ({ versions }: DigestWeek): SentDigest => {
  const shown = versions[versions.length - 1];
  const base = versions.filter((v) => !v.update).at(-1) ?? versions[0];
  const layout = shown.layout ?? base.layout;
  const flyers = shown.flyers ?? base.flyers;
  return {
    issued: shown.issued,
    key: shown.key,
    base: base.key,
    ...(layout ? { layout } : {}),
    ...(flyers !== undefined ? { flyers } : {})
  };
};
