import { callApi } from './apiClient';
import { digestPageUrl } from '../utils/digestLinks';

/** A shared digest: a link anyone can open, until it expires (about six months) */
export interface SharedDigest {
  url: string;
  expiresAt: string;
}

/** Uploads the digest PDF (admins only) and returns the link to its page (which shows and downloads it) */
export const shareDigestPdf = async (pdf: Blob, fileName: string): Promise<SharedDigest> => {
  const form = new FormData();
  form.append('file', new File([pdf], fileName, { type: 'application/pdf' }));
  const { url, expiresAt } = await callApi<SharedDigest>('/api/digest', { method: 'POST', form });
  return { url: digestPageUrl(url, window.location.origin), expiresAt };
};
