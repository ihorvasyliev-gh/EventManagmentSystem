import { callApi } from './apiClient';

/**
 * Removes files of a deleted event from R2. The server keeps any file another event still uses,
 * and a failure only leaves a file behind, so errors are ignored.
 */
export const deleteStoredFiles = async (urls: Array<string | null | undefined>): Promise<void> => {
  const paths = [...new Set(urls.filter((u): u is string => !!u && u.startsWith('/api/file/')))];
  await Promise.all(paths.map((path) => callApi(path, { method: 'DELETE' }).catch(() => undefined)));
};
