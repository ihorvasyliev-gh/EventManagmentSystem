import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Poster uploads. Images are used as they are; a PDF flyer is turned into a JPG of one
 * page in the browser (the user picks the page when there are several), so every poster
 * (calendar, inbox, digest, Excel) is an image.
 */

export const POSTER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** `accept` attribute for poster file inputs */
export const POSTER_ACCEPT = [...POSTER_IMAGE_TYPES, 'application/pdf', '.pdf'].join(',');

export const MAX_POSTER_IMAGE_MB = 10;
/** A PDF never leaves the device (only the JPG made from it is uploaded), so it may be larger */
export const MAX_POSTER_PDF_MB = 25;

/** Longest side of the JPG made from a PDF: sharp full-screen and in the digest, usually well under 1 MB */
export const PDF_POSTER_LONG_SIDE = 2000;
const PDF_POSTER_QUALITY = 0.9;
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
export const pdfRenderScale = (width: number, height: number, longSide = PDF_POSTER_LONG_SIDE): number => {
  const longest = Math.max(width, height);
  return longest > 0 && Number.isFinite(longest) ? longSide / longest : 1;
};

/** "Summer Fair.pdf" → "Summer Fair.jpg" */
export const posterNameFromPdf = (name: string): string => `${name.replace(/\.pdf$/i, '') || 'poster'}.jpg`;

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
  /** A page as a poster-sized JPG */
  render: (page: number) => Promise<PreparedPoster>;
  close: () => void;
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Short technical reason, shown after the message so a screenshot tells support what failed */
const describeError = (err: unknown): string => {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
};

const userError = (message: string, cause: unknown): Error => {
  console.warn(message, cause);
  return new Error(`${message} (${describeError(cause)})`, { cause });
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

const renderPageToJpeg = async (doc: PDFDocumentProxy, pageNumber: number, longSide: number, quality: number): Promise<Blob> => {
  const page = await doc.getPage(pageNumber);
  try {
    const { width, height } = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfRenderScale(width, height, longSide) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    // White paper: JPG has no transparency
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('The page could not be saved as an image');
    return blob;
  } finally {
    page.cleanup();
  }
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
    data = new Uint8Array(await bytes);
  } catch (err) {
    throw userError('The file could not be opened on this device. Please choose it again, or save the flyer as an image (PNG or JPG).', err);
  }

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
      throw new Error('That PDF is password-protected. Please remove the password or save the flyer as an image (PNG or JPG).');
    }
    throw userError('That PDF could not be read. Please save the flyer as an image (PNG or JPG) and try again.', err);
  }

  const pages = doc.numPages;
  return {
    name: file.name,
    pages,
    thumbnail: async (page) => readAsDataUrl(await renderPageToJpeg(doc, page, PDF_THUMB_LONG_SIDE, PDF_THUMB_QUALITY)),
    render: async (page) => {
      let blob: Blob;
      try {
        blob = await renderPageToJpeg(doc, page, PDF_POSTER_LONG_SIDE, PDF_POSTER_QUALITY);
      } catch (err) {
        throw userError('That page could not be turned into an image. Please try another page, or save the flyer as an image (PNG or JPG).', err);
      }
      const image = new File([blob], posterNameFromPdf(file.name), { type: 'image/jpeg' });
      return { file: image, preview: await readAsDataUrl(image), pdf: { name: file.name, pages, page } };
    },
    close: () => void task!.destroy()
  };
};

/** Checks a chosen image and reads it for the preview. Throws an Error whose message can be shown to the user. */
export const prepareImagePoster = async (file: File): Promise<PreparedPoster> => {
  const problem = checkPosterFile(file);
  if (problem) throw new Error(problem);
  return { file, preview: await readAsDataUrl(file) };
};
