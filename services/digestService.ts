import { callApi } from './apiClient';
import { digestPageUrl, digestFromKey, digestListUrl } from '../utils/digestLinks';
import { parseDigestList, type DigestList } from '../utils/digestList';
import { formatLocalDate } from '../utils/date';
import { digestWeekStart } from '../utils/digestGrouping';
import { isUpdatable, type SentDigestState } from '../utils/sentDigest';

/** A shared digest: a link anyone can open, until it expires (about six months) */
export interface SharedDigest {
  url: string;
  expiresAt: string;
}

/** A shared digest's day (YYYY-MM-DD) and the ids of the events it carried */
export interface DigestIssue {
  issued: string;
  ids: string[];
}

export type DigestLayout = 'executive' | 'compact';

/**
 * The latest digest shared (its week's newest PDF), for updating it: its day, what its links show
 * (`key`, digests/<id>-<name>.pdf), the PDF that went out (`base`) and how it was laid out
 */
export interface SentDigest {
  issued: string;
  key: string;
  base: string;
  layout?: DigestLayout;
  flyers?: boolean;
}

/** How the PDF was made, so an update looks the same; `update` shares it as the issue's update */
export interface ShareOptions {
  layout?: DigestLayout;
  flyers?: boolean;
  update?: boolean;
}

/**
 * Uploads the digest PDF (admins only) and returns the link to its page (which shows and downloads
 * it). `issue` records what it carried, for next week's NEW marks, and which day's digest it is;
 * `list` is its events as text, which the page shows as a list (easier on a phone than the PDF).
 */
export const shareDigestPdf = async (
  pdf: Blob, fileName: string, issue?: DigestIssue, list?: DigestList, options: ShareOptions = {}
): Promise<SharedDigest> => {
  const form = new FormData();
  form.append('file', new File([pdf], fileName, { type: 'application/pdf' }));
  if (issue) {
    form.append('issued', issue.issued);
    form.append('eventIds', JSON.stringify(issue.ids));
  }
  if (list) form.append('list', JSON.stringify(list));
  if (options.layout) form.append('layout', options.layout);
  if (options.flyers !== undefined) form.append('flyers', options.flyers ? '1' : '0');
  if (options.update) form.append('update', '1');
  const { url, expiresAt } = await callApi<SharedDigest>('/api/digest', { method: 'POST', form });
  return { url: digestPageUrl(url, window.location.origin), expiresAt };
};

const sentDigestFrom = (value: unknown): SentDigest | null => {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (typeof s.issued !== 'string' || typeof s.key !== 'string' || typeof s.base !== 'string') return null;
  return {
    issued: s.issued,
    key: s.key,
    base: s.base,
    ...(s.layout === 'executive' || s.layout === 'compact' ? { layout: s.layout } : {}),
    ...(typeof s.flyers === 'boolean' ? { flyers: s.flyers } : {})
  };
};

/**
 * The last digest shared before `before` (YYYY-MM-DD), or null when none was (throws when it
 * can't tell), and the latest digest shared, for updating it (null when none, or unknown)
 */
export const fetchDigestIssues = async (before: string): Promise<{ previous: DigestIssue | null; latest: SentDigest | null }> => {
  const { issue, latest } = await callApi<{ issue?: DigestIssue | null; latest?: unknown }>(`/api/digest-issues?before=${encodeURIComponent(before)}`);
  if (issue === undefined || (issue && (typeof issue.issued !== 'string' || !Array.isArray(issue.ids)))) {
    throw new Error('Unexpected answer about the last digest');
  }
  return { previous: issue, latest: sentDigestFrom(latest) };
};

/** A shared digest's list of events (beside its PDF), or null when it has none or can't be had */
export const fetchDigestList = async (key: string): Promise<DigestList | null> => {
  const file = digestFromKey(key);
  if (!file) return null;
  try {
    const res = await fetch(digestListUrl(file));
    return res.ok ? parseDigestList(await res.json()) : null;
  } catch {
    return null;
  }
};

/** The latest digest shared and its events as its link shows them, while it can still be updated */
export const fetchSentDigest = async (): Promise<SentDigestState<SentDigest> | null> => {
  const { latest } = await fetchDigestIssues(formatLocalDate(digestWeekStart(new Date())));
  if (!latest || !isUpdatable(latest.issued)) return null;
  return { digest: latest, list: await fetchDigestList(latest.key) };
};
