import { callApi } from './apiClient';
import { digestPageUrl } from '../utils/digestLinks';
import type { DigestList } from '../utils/digestList';

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
