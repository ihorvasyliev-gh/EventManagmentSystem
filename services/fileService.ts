import { callApi } from './apiClient';

/** Uploads a poster image to R2 (admins) and returns its /api/file URL */
export const uploadPoster = async (file: File): Promise<string> => {
  const form = new FormData();
  form.append('file', file);
  const { url } = await callApi<{ url: string }>('/api/upload', { method: 'PUT', form });
  return url;
};

/**
 * Removes files of a deleted event from R2. The server keeps any file another event still uses,
 * and a failure only leaves a file behind, so errors are ignored.
 */
export const deleteStoredFiles = async (urls: Array<string | null | undefined>): Promise<void> => {
  const paths = [...new Set(urls.filter((u): u is string => !!u && u.startsWith('/api/file/')))];
  await Promise.all(paths.map((path) => callApi(path, { method: 'DELETE' }).catch(() => undefined)));
};
