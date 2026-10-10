import { type SupabaseConfig, serviceRest } from './supabase.ts';

/** The part of an R2 bucket binding the functions use (typed here so the app's checks can import it) */
export interface FileBucket {
  put(key: string, value: ReadableStream | ArrayBuffer | Blob, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/** Poster images: everything the public form may send */
export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Files are served back from the app's own origin, so only allow types that browsers
// can't execute as a page (no HTML/SVG/JS) — otherwise an upload becomes stored XSS.
export const ALLOWED_TYPES = new Set([
  ...IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

const FILE_PATH = '/api/file/';

export interface StoredFile {
  key: string;
  url: string;
  name: string;
  type: string;
  size: number;
}

/** Saves an upload under a random key; files are served through /api/file/<key> */
export const storeFile = async (bucket: FileBucket, file: File, contentType: string): Promise<StoredFile> => {
  const key = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType } });
  return { key, url: `${FILE_PATH}${key}`, name: file.name, type: contentType, size: file.size };
};

/** The R2 key behind a stored file's URL (relative or absolute), or null for any other URL */
export const fileKeyFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url, 'https://app.invalid').pathname;
  } catch {
    return null;
  }
  if (!path.startsWith(FILE_PATH)) return null;
  const key = decodeURIComponent(path.slice(FILE_PATH.length));
  return /^[0-9a-f-]{36}-[A-Za-z0-9._-]+$/i.test(key) ? key : null;
};

/** True while any event or attachment still points at the file (e.g. a duplicated event) */
export const isFileReferenced = async (cfg: SupabaseConfig, key: string): Promise<boolean> => {
  const url = encodeURIComponent(`${FILE_PATH}${key}`);
  const [posters, attachments] = await Promise.all([
    serviceRest(cfg, `events?select=id&poster_url=eq.${url}&limit=1`),
    serviceRest(cfg, `event_attachments?select=id&url=eq.${url}&limit=1`)
  ]);
  if (!posters.ok || !attachments.ok) return true; // when in doubt, keep the file
  const [p, a] = (await Promise.all([posters.json(), attachments.json()])) as [unknown[], unknown[]];
  return p.length > 0 || a.length > 0;
};

/** Deletes the given files from R2, skipping any that something still uses. Returns the keys deleted. */
export const deleteUnreferencedFiles = async (bucket: FileBucket, cfg: SupabaseConfig, urls: Array<string | null | undefined>): Promise<string[]> => {
  const keys = [...new Set(urls.map(fileKeyFromUrl).filter((k): k is string => !!k))];
  const deleted: string[] = [];
  for (const key of keys) {
    if (await isFileReferenced(cfg, key)) continue;
    await bucket.delete(key);
    deleted.push(key);
  }
  return deleted;
};
