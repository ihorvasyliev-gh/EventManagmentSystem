import { callApi } from './apiClient';

/** A shared digest: a link anyone can open, until it expires (about six months) */
export interface SharedDigest {
  url: string;
  expiresAt: string;
}

/** Uploads the digest PDF (admins only) and returns its link */
export const shareDigestPdf = async (pdf: Blob, fileName: string): Promise<SharedDigest> => {
  const form = new FormData();
  form.append('file', new File([pdf], fileName, { type: 'application/pdf' }));
  const { url, expiresAt } = await callApi<SharedDigest>('/api/digest', { method: 'POST', form });
  return { url: new URL(url, window.location.origin).toString(), expiresAt };
};
