/**
 * Poster uploads. Images are used as they are; a PDF flyer is turned into a JPG of its
 * first page in the browser, so every poster (calendar, inbox, digest, Excel) is an image.
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
  /** Set when the image was made from a PDF: its file name and page count (only page 1 is used) */
  pdf?: { name: string; pages: number };
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Renders the first page of a PDF to a JPG. pdf.js is only downloaded when a PDF is picked. */
const pdfToPosterImage = async (pdf: File): Promise<{ file: File; pages: number }> => {
  const [pdfjs, { default: workerSrc }] = await Promise.all([
    // The legacy build also runs on older phone browsers (Safari < 17)
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pdfRenderScale(width, height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    // White paper: JPG has no transparency
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PDF_POSTER_QUALITY));
    if (!blob) throw new Error('The page could not be saved as an image');
    return { file: new File([blob], posterNameFromPdf(pdf.name), { type: 'image/jpeg' }), pages: doc.numPages };
  } finally {
    void task.destroy();
  }
};

/**
 * Checks a chosen poster and, for a PDF, converts its first page to a JPG.
 * Throws an Error whose message can be shown to the user.
 */
export const preparePosterFile = async (file: File): Promise<PreparedPoster> => {
  const problem = checkPosterFile(file);
  if (problem) throw new Error(problem);

  if (!isPdfFile(file)) return { file, preview: await readAsDataUrl(file) };

  let image: { file: File; pages: number };
  try {
    image = await pdfToPosterImage(file);
  } catch (err) {
    console.warn('PDF poster conversion failed:', err);
    const locked = err instanceof Error && err.name === 'PasswordException';
    throw new Error(
      locked
        ? 'That PDF is password-protected. Please remove the password or save the flyer as an image (PNG or JPG).'
        : 'That PDF could not be read. Please save the flyer as an image (PNG or JPG) and try again.'
    );
  }
  return { file: image.file, preview: await readAsDataUrl(image.file), pdf: { name: file.name, pages: image.pages } };
};
