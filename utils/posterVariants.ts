/**
 * Lighter copies of a stored poster, kept beside it in R2: `<key>.screen.jpg` (1600 px on its
 * long side) for the event window and the digest, `<key>.thumb.jpg` (480 px) for small previews.
 * A poster is often a phone photo or a page of a PDF at print quality, several MB, while these
 * are a few hundred KB at most. The browser makes them when the poster is sent; the original
 * stays for the full view, downloads and print.
 *
 * A poster sent before the copies existed (or whose copies couldn't be made) has none: /api/file
 * answers a missing copy with the poster itself. GIFs get none (they may move).
 */

export type PosterVariant = 'screen' | 'thumb';

export const POSTER_VARIANTS: Record<PosterVariant, { longSide: number; quality: number }> = {
  screen: { longSide: 1600, quality: 0.85 },
  thumb: { longSide: 480, quality: 0.8 }
};

/** Largest copy the server keeps (a 1600 px JPEG of a busy photo is well under this) */
export const MAX_VARIANT_BYTES = 3 * 1024 * 1024;

const FILE_PATH = '/api/file/';
/** A key /api/upload or a flyer upload made: a random UUID, then the file's name */
const STORED_KEY = /^[0-9a-f-]{36}-[A-Za-z0-9._-]+$/i;
const VARIANT_KEY = /^([0-9a-f-]{36}-[A-Za-z0-9._-]+)\.(screen|thumb)\.jpg$/i;

/** Whether the stored file under `key` may have lighter copies */
export const hasPosterVariants = (key: string): boolean =>
  STORED_KEY.test(key) && !VARIANT_KEY.test(key) && !/\.gif$/i.test(key);

export const posterVariantKey = (key: string, variant: PosterVariant): string => `${key}.${variant}.jpg`;

/** The keys of every copy a stored file may have (none for anything else) */
export const posterVariantKeys = (key: string): string[] =>
  hasPosterVariants(key) ? (Object.keys(POSTER_VARIANTS) as PosterVariant[]).map((v) => posterVariantKey(key, v)) : [];

/** The poster a copy was made from, or null when `key` isn't a copy */
export const posterOfVariant = (key: string): string | null => VARIANT_KEY.exec(key)?.[1] ?? null;

/** Where to load a poster's lighter copy from; the poster's own URL when it can't have one */
export function posterVariantUrl(url: string, variant: PosterVariant): string;
export function posterVariantUrl(url: string | null | undefined, variant: PosterVariant): string | undefined;
export function posterVariantUrl(url: string | null | undefined, variant: PosterVariant): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith(FILE_PATH)) return url;
  const key = url.slice(FILE_PATH.length);
  return hasPosterVariants(key) ? `${FILE_PATH}${posterVariantKey(key, variant)}` : url;
}

/** Width and height of a copy at most `longSide` px on its long side (never larger than the original) */
export const variantSize = (width: number, height: number, longSide: number): { width: number; height: number } => {
  const scale = Math.min(1, longSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};
