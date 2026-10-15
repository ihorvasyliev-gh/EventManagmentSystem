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

/**
 * Uploads the digest PDF (admins only) and returns the link to its page (which shows and downloads
 * it). `issue` records what it carried, for next week's NEW marks; `list` is its events as
 * text, which the page shows as a list (easier on a phone than the PDF).
 */
export const shareDigestPdf = async (pdf: Blob, fileName: string, issue?: DigestIssue, list?: DigestList): Promise<SharedDigest> => {
  const form = new FormData();
  form.append('file', new File([pdf], fileName, { type: 'application/pdf' }));
  if (issue) {
    form.append('issued', issue.issued);
    form.append('eventIds', JSON.stringify(issue.ids));
  }
  if (list) form.append('list', JSON.stringify(list));
  const { url, expiresAt } = await callApi<SharedDigest>('/api/digest', { method: 'POST', form });
  return { url: digestPageUrl(url, window.location.origin), expiresAt };
};

/** The last digest shared before `before` (YYYY-MM-DD), or null when none was; throws when it can't tell */
export const fetchPreviousDigestIssue = async (before: string): Promise<DigestIssue | null> => {
  const { issue } = await callApi<{ issue?: DigestIssue | null }>(`/api/digest-issues?before=${encodeURIComponent(before)}`);
  if (issue === undefined || (issue && (typeof issue.issued !== 'string' || !Array.isArray(issue.ids)))) {
    throw new Error('Unexpected answer about the last digest');
  }
  return issue;
};
