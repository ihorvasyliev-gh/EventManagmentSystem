/** Flyers and the logo as data URLs jsPDF can embed */

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface LoadedPdfFlyer {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  format: 'JPEG' | 'PNG';
}

/** Runs `fn` over `items` with at most `limit` concurrent promises, preserving order */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * Loads an image as a JPEG/PNG data URL for jsPDF, at most `maxSide` px on its long side.
 * createImageBitmap applies the EXIF orientation, so phone photos come out upright.
 * `jpeg` flattens PNGs onto white: a flyer saved as PNG is several times larger otherwise.
 */
export const loadImageForPdf = async (url: string, maxSide = 1200, jpeg = false): Promise<LoadedPdfFlyer | null> => {
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const isPng = !jpeg && (blob.type === 'image/png' || url.toLowerCase().includes('.png'));
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (!isPng) {
      // JPEG has no alpha: keep transparent areas white rather than black
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    return {
      dataUrl: canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.86),
      width,
      height,
      aspectRatio: width / height,
      format: isPng ? 'PNG' : 'JPEG'
    };
  } catch (err) {
    console.warn('loadImageForPdf error:', err);
    return null;
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};

/** Images already prepared this session, so Preview then Download doesn't fetch and re-encode them twice */
const imageCache = new Map<string, Promise<LoadedPdfFlyer | null>>();
const IMAGE_CACHE_LIMIT = 80;

export const loadImageCached = (url: string, maxSide: number, jpeg = false): Promise<LoadedPdfFlyer | null> => {
  const key = `${maxSide}|${jpeg ? 'jpeg' : 'auto'}|${url}`;
  let pending = imageCache.get(key);
  if (!pending) {
    if (imageCache.size >= IMAGE_CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value!);
    pending = loadImageForPdf(url, maxSide, jpeg).then((img) => {
      // A failed load (offline, flyer not uploaded yet) is tried again next time
      if (!img) imageCache.delete(key);
      return img;
    });
    imageCache.set(key, pending);
  }
  return pending;
};
