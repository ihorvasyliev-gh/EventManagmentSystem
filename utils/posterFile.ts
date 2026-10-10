import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Poster uploads. Images are used as they are; a PDF flyer is turned into an image of one
 * page in the browser (the user picks the page when there are several), so every poster
 * (calendar, inbox, digest, Excel) is an image.
 */

export const POSTER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** `accept` attribute for poster file inputs */
export const POSTER_ACCEPT = [...POSTER_IMAGE_TYPES, 'application/pdf', '.pdf'].join(',');

export const MAX_POSTER_IMAGE_MB = 10;
/** A PDF never leaves the device (only the image made from it is uploaded), so it may be larger */
export const MAX_POSTER_PDF_MB = 25;

/**
 * A PDF page becomes a print-quality image: 300 DPI, but no more than phones can draw
 * (iOS Safari refuses canvases over 16.7 megapixels). A4 → 2480×3508, A3 → 2895×4096.
 */
const PDF_POSTER_DPI = 300;
export const PDF_POSTER_MAX_SIDE = 4096;
export const PDF_POSTER_MAX_PIXELS = 16_000_000;
/** Saved as lossless PNG; a photo-heavy page whose PNG would be bigger than this becomes a near-lossless JPG */
const PDF_POSTER_PNG_MAX_BYTES = 8 * 1024 * 1024;
const PDF_POSTER_JPEG_QUALITY = 0.95;
/** Page previews in the page picker */
const PDF_THUMB_LONG_SIDE = 320;
const PDF_THUMB_QUALITY = 0.8;
/** The page picker shows at most this many pages */
export const MAX_PICKER_PAGES = 30;

export const isPdfFile = (file: { type: string; name: string }): boolean =>
  /^application\/(x-)?pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);

/** Message for a file that can't be used as a poster, or null when it can */
export const checkPosterFile = (file: { type: string; name: string; size: number }): string | null => {
  if (isPdfFile(file)) {
    return file.size > MAX_POSTER_PDF_MB * 1024 * 1024
      ? `That PDF is over ${MAX_POSTER_PDF_MB}MB — please choose a smaller one.`
      : null;
  }
  if (!POSTER_IMAGE_TYPES.includes(file.type)) return 'Please choose an image (PNG, JPG, GIF or WEBP) or a PDF.';
  if (file.size > MAX_POSTER_IMAGE_MB * 1024 * 1024) {
    return `That image is over ${MAX_POSTER_IMAGE_MB}MB — please choose a smaller one.`;
  }
  return null;
};

/** Scale at which a page of `width`×`height` PDF points renders with its longest side at `longSide` px */
export const pdfRenderScale = (width: number, height: number, longSide: number): number => {
  const longest = Math.max(width, height);
  return longest > 0 && Number.isFinite(longest) ? longSide / longest : 1;
};

/** Scale for the poster image of a page of `width`×`height` PDF points (72 points = 1 inch) */
export const posterRenderScale = (width: number, height: number): number => {
  if (!(width > 0 && height > 0 && Number.isFinite(width * height))) return 1;
  return Math.min(
    PDF_POSTER_DPI / 72,
    PDF_POSTER_MAX_SIDE / Math.max(width, height),
    Math.sqrt(PDF_POSTER_MAX_PIXELS / (width * height))
  );
};

/** "Summer Fair.pdf" → "Summer Fair.png" */
export const posterNameFromPdf = (name: string, extension = 'png'): string =>
  `${name.replace(/\.pdf$/i, '') || 'poster'}.${extension}`;

export interface PreparedPoster {
  /** The image to upload */
  file: File;
  /** Data URL for the preview */
  preview: string;
  /** Set when the image was made from a PDF: its file name, page count and the page used */
  pdf?: { name: string; pages: number; page: number };
}

/** A PDF opened for picking its poster page. Call `close()` once done with it. */
export interface OpenedPdf {
  name: string;
  pages: number;
  /** Small preview of a page (1-based), as a data URL */
  thumbnail: (page: number) => Promise<string>;
  /** A page as a print-quality image (PNG, or JPG for a photo-heavy page) */
  render: (page: number) => Promise<PreparedPoster>;
  close: () => void;
}

/**
 * Work apps under an organisation's app protection (Microsoft Intune, "MAM") save files
 * encrypted: an attachment saved from work Outlook on a phone starts with this tag instead
 * of its own header. Only those apps hold the key, so no browser or website can read it.
 */
const MANAGED_ENCRYPTION_TAG = 'MSMAMAR';
export const MANAGED_ENCRYPTION_MESSAGE =
  'This flyer was saved from a protected work app (such as Outlook), so it’s encrypted and can’t be uploaded from this phone. Please upload it from a computer, or send the event without a poster and email the flyer to the coordinator.';

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'managed-encrypted' | 'unknown';

/** What a file really is, from its first bytes (at least 16; up to 1 KB for a PDF) */
export const sniffFileKind = (head: Uint8Array): FileKind => {
  const text = String.fromCharCode(...head.subarray(0, 1024));
  if (text.slice(0, 32).includes(MANAGED_ENCRYPTION_TAG)) return 'managed-encrypted';
  if (head[0] === 0x89 && text.slice(1, 4) === 'PNG') return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (text.startsWith('GIF8')) return 'gif';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'webp';
  if (text.includes('%PDF-')) return 'pdf';
  return 'unknown';
};

/** A whole PDF starts with "%PDF-" and ends with "%%EOF" (each may sit within 1 KB of its end of the file) */
export const looksLikeWholePdf = (data: Uint8Array): boolean => {
  const text = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to));
  return text(0, 1024).includes('%PDF-') && text(Math.max(0, data.length - 1024), data.length).includes('%%EOF');
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readWithFileReader = (file: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

const READ_CHUNK_BYTES = 1024 * 1024;
const readInChunks = async (file: Blob): Promise<ArrayBuffer> => {
  const parts: ArrayBuffer[] = [];
  for (let at = 0; at < file.size; at += READ_CHUNK_BYTES) parts.push(await file.slice(at, at + READ_CHUNK_BYTES).arrayBuffer());
  return new Blob(parts).arrayBuffer();
};

/**
 * Reads a picked PDF in full. Some phone browsers hand over a file cut short (for example
 * while the files app is still fetching it from the cloud), so an incomplete read is
 * retried a moment later in other ways. Returns the most complete copy it got.
 */
const readWholePdf = async (file: File, first: Promise<ArrayBuffer>): Promise<Uint8Array> => {
  const attempts: [number, () => Promise<ArrayBuffer>][] = [
    [0, () => first],
    [400, () => readWithFileReader(file)],
    [1500, () => readInChunks(file)]
  ];
  let best: Uint8Array | null = null;
  let lastError: unknown;
  for (const [delay, read] of attempts) {
    if (delay) await wait(delay);
    try {
      const data = new Uint8Array(await read());
      // An encrypted copy reads the same every time: no point trying again
      if ((data.length === file.size && looksLikeWholePdf(data)) || sniffFileKind(data) === 'managed-encrypted') return data;
      console.warn(`Incomplete read of the PDF poster: ${data.length} of ${file.size} bytes`);
      if (!best || data.length > best.length) best = data;
    } catch (err) {
      lastError = err;
    }
  }
  if (best) return best;
  throw lastError;
};

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** An error whose message is shown to the user as it is; the technical cause only goes to the console */
const userError = (message: string, cause?: unknown): Error => {
  console.warn(message, cause);
  return new Error(message, { cause });
};

/** pdf.js is only downloaded when a PDF is picked */
const loadPdfJs = async () => {
  const [pdfjs, { default: workerSrc }] = await Promise.all([
    // The legacy build also runs on older phone browsers (Safari < 17)
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`The page could not be saved as ${type}`))), type, quality);
  });

/** Draws a page on white paper at `scale(width, height)` and saves it with `encode` */
const renderPage = async (
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: (width: number, height: number) => number,
  encode: (canvas: HTMLCanvasElement) => Promise<Blob>
): Promise<Blob> => {
  const page = await doc.getPage(pageNumber);
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scale(width, height) });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return await encode(canvas);
  } finally {
    // Phones run out of canvas memory quickly: let this one go straight away
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
};

/** Lossless PNG, unless that is too big to upload comfortably (a full-page photo): then a near-lossless JPG */
const encodePoster = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const png = await canvasToBlob(canvas, 'image/png');
  return png.size <= PDF_POSTER_PNG_MAX_BYTES ? png : canvasToBlob(canvas, 'image/jpeg', PDF_POSTER_JPEG_QUALITY);
};

/**
 * Opens a PDF for picking a page. Throws an Error whose message can be shown to the user.
 *
 * Pass `bytes` when the file was read as soon as it was picked: on phones a picked file
 * can stop being readable a moment later.
 */
export const openPdf = async (file: File, bytes: Promise<ArrayBuffer> = file.arrayBuffer()): Promise<OpenedPdf> => {
  let data: Uint8Array;
  try {
    data = await readWholePdf(file, bytes);
  } catch (err) {
    throw userError('The file could not be opened on this device. Please choose it again, or save the flyer as an image (PNG or JPG).', err);
  }
  if (sniffFileKind(data) === 'managed-encrypted') throw userError(MANAGED_ENCRYPTION_MESSAGE);
  // Worked out before pdf.js takes the bytes over to its worker
  const cutShort = data.length < file.size;
  const whole = looksLikeWholePdf(data);

  let pdfjs: Awaited<ReturnType<typeof loadPdfJs>>;
  try {
    pdfjs = await loadPdfJs();
  } catch (err) {
    throw userError('The PDF reader could not be loaded. Please check your connection and try again.', err);
  }

  let task: PDFDocumentLoadingTask | undefined;
  let doc: PDFDocumentProxy;
  try {
    task = pdfjs.getDocument({ data });
    doc = await task.promise;
  } catch (err) {
    void task?.destroy();
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new Error('That PDF is password-protected. Please remove the password or save the flyer as an image (PNG or JPG).', { cause: err });
    }
    const message = cutShort
      ? 'Your browser only handed over part of this PDF. Please try again in a moment, try another browser (such as Chrome), or save the flyer as an image (PNG or JPG).'
      : !whole
        ? 'This PDF looks incomplete or damaged — it may not have finished downloading to this device. Open it here to check, download it again, or save the flyer as an image (PNG or JPG).'
        : 'That PDF could not be read. Please save the flyer as an image (PNG or JPG) and try again.';
    throw userError(message, err);
  }

  const pages = doc.numPages;
  return {
    name: file.name,
    pages,
    thumbnail: async (page) =>
      readAsDataUrl(await renderPage(
        doc, page,
        (width, height) => pdfRenderScale(width, height, PDF_THUMB_LONG_SIDE),
        (canvas) => canvasToBlob(canvas, 'image/jpeg', PDF_THUMB_QUALITY)
      )),
    render: async (page) => {
      let blob: Blob;
      try {
        blob = await renderPage(doc, page, posterRenderScale, encodePoster);
      } catch (err) {
        throw userError('That page could not be turned into an image. Please try another page, or save the flyer as an image (PNG or JPG).', err);
      }
      const image = new File([blob], posterNameFromPdf(file.name, blob.type === 'image/png' ? 'png' : 'jpg'), { type: blob.type });
      return { file: image, preview: await readAsDataUrl(image), pdf: { name: file.name, pages, page } };
    },
    close: () => void task!.destroy()
  };
};

/** Checks a chosen image and reads it for the preview. Throws an Error whose message can be shown to the user. */
export const prepareImagePoster = async (file: File): Promise<PreparedPoster> => {
  const problem = checkPosterFile(file);
  if (problem) throw new Error(problem);
  const [head, preview] = await Promise.all([file.slice(0, 32).arrayBuffer(), readAsDataUrl(file)]);
  // Never upload something that would show as a broken poster
  const kind = sniffFileKind(new Uint8Array(head));
  if (kind === 'managed-encrypted') throw new Error(MANAGED_ENCRYPTION_MESSAGE);
  if (kind !== 'png' && kind !== 'jpeg' && kind !== 'gif' && kind !== 'webp') {
    throw new Error('That image could not be read: it isn’t a PNG, JPG, GIF or WEBP inside. Please choose another file.');
  }
  return { file, preview };
};
