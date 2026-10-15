import { type SupabaseConfig, serviceRest } from './supabase.ts';
import { sniffFileKind, KIND_OF_TYPE } from '../utils/fileKind.ts';
import { MAX_VARIANT_BYTES, POSTER_VARIANTS, posterVariantKey, posterVariantKeys, type PosterVariant } from '../utils/posterVariants.ts';

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

/**
 * Whether a file really is what its type says. The type comes from the file's name, and images
 * and PDFs are shown on this site's own pages, so their first bytes are checked (other files are
 * only ever downloaded).
 */
export const contentMatchesType = async (file: Blob, contentType: string): Promise<boolean> => {
  const expected = KIND_OF_TYPE[contentType];
  if (!expected) return true;
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return sniffFileKind(head) === expected;
};

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

/** A flyer's lighter copies as the form sent them (anything may arrive in a form field) */
type FlyerVariants = Partial<Record<PosterVariant, File | string | null>>;

/** The lighter copies a flyer was sent with (form fields poster_screen and poster_thumb) */
export const flyerVariantsOf = (form: FormData): FlyerVariants =>
  Object.fromEntries((Object.keys(POSTER_VARIANTS) as PosterVariant[]).map((v) => [v, form.get(`poster_${v}`)]));

/**
 * Stores the copies of a flyer that really are JPEGs of a sensible size, beside it
 * (utils/posterVariants.ts). Anything else is left out: the flyer is then served whole.
 */
const storeFlyerVariants = async (
  bucket: FileBucket,
  key: string,
  variants: FlyerVariants
): Promise<void> => {
  await Promise.all(Object.entries(variants).map(async ([variant, file]) => {
    if (!file || typeof file === 'string' || file.size === 0 || file.size > MAX_VARIANT_BYTES) return;
    if ((file.type || '').toLowerCase() !== 'image/jpeg' || !(await contentMatchesType(file, 'image/jpeg'))) return;
    try {
      await bucket.put(posterVariantKey(key, variant as PosterVariant), file.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
    } catch (err) {
      console.error('Storing a flyer copy failed:', key, variant, err);
    }
  }));
};

/**
 * Checks and stores a flyer sent with the event form (/api/submit, /api/edit-event): an image
 * (a PDF flyer arrives already turned into one) that really is one, with its lighter copies for
 * the screen when they were sent. Returns its URL, or why it was refused with the status to answer.
 */
export const storeFlyer = async (
  bucket: FileBucket | undefined,
  poster: File,
  variants: FlyerVariants = {}
): Promise<{ url: string } | { error: string; status: number }> => {
  if (!bucket) return { error: 'Flyer uploads are not set up on the server.', status: 500 };
  if (poster.size > MAX_UPLOAD_BYTES) return { error: 'The flyer is too large (max 15 MB).', status: 413 };
  const type = (poster.type || '').toLowerCase();
  if (!IMAGE_TYPES.has(type)) return { error: 'The flyer must be an image (PNG, JPG, GIF or WEBP) or a PDF.', status: 415 };
  if (!(await contentMatchesType(poster, type))) {
    return { error: 'The flyer’s file is damaged or isn’t really an image. Please save it again as a PNG or JPG and send it once more.', status: 415 };
  }
  try {
    const stored = await storeFile(bucket, poster, type);
    if (type !== 'image/gif') await storeFlyerVariants(bucket, stored.key, variants);
    return { url: stored.url };
  } catch (err) {
    console.error('Flyer upload failed:', err);
    return { error: 'The flyer could not be uploaded. Please try again.', status: 502 };
  }
};

/** Most a request with a flyer and its copies may carry, besides the form's own fields */
export const MAX_FLYER_REQUEST_BYTES = MAX_UPLOAD_BYTES + Object.keys(POSTER_VARIANTS).length * MAX_VARIANT_BYTES;

/** Removes a stored file and, for a poster, its lighter copies */
export const deleteStoredFile = async (bucket: FileBucket, key: string): Promise<void> => {
  await Promise.all([key, ...posterVariantKeys(key)].map((k) => bucket.delete(k)));
};

/**
 * How /api/file hands a stored file over, under its own name (without the random part of the key
 * or the digests/ folder). A shared digest downloads: opened in a tab, PDF extensions (Adobe
 * Acrobat's) take it over and render it badly; saved, it opens in the person's own PDF app.
 */
export const contentDisposition = (key: string, canShowInline: boolean): string => {
  const name = (key.split('/').pop() ?? key).replace(/^[0-9a-f-]{36}-/i, '').replace(/"/g, '');
  const download = !canShowInline || key.startsWith('digests/');
  return `${download ? 'attachment' : 'inline'}; filename="${name}"`;
};

/**
 * A shared digest opened as a page (a link tapped in an email, rather than the viewer fetching it
 * or its Download button): where to send the browser instead, the digest's own page, which
 * shows the PDF in any browser. Links sent before that page existed go there too.
 */
export const digestPageRedirect = (key: string, request: Request): string | null => {
  if (!key.startsWith('digests/')) return null;
  const url = new URL(request.url);
  if (url.searchParams.has('download')) return null;
  const dest = request.headers.get('Sec-Fetch-Dest');
  const asPage = dest ? dest === 'document' : (request.headers.get('Accept') || '').includes('text/html');
  return asPage ? new URL(`/digest/${key.slice('digests/'.length).replace(/\.pdf$/i, '')}`, url).toString() : null;
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
    await deleteStoredFile(bucket, key);
    deleted.push(key);
  }
  return deleted;
};
