import { useCallback, useEffect, useRef, useState } from 'react';
import { OpenedPdf, PreparedPoster, checkPosterFile, isPdfFile, openPdf, prepareImagePoster } from '../utils/posterFile';

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'That file could not be used as a poster.';

/**
 * State of a poster field: the image to upload, its preview, and — for a PDF — the page
 * picker. A one-page PDF is converted straight away; with several pages the user picks one.
 *
 * `onError` gets a message to show, or null once a poster was chosen or a PDF opened.
 */
export function usePosterFile(onError: (message: string | null) => void) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** Set when the poster was made from a PDF */
  const [pdf, setPdf] = useState<PreparedPoster['pdf'] | null>(null);
  /** A PDF waiting for the user to pick its poster page */
  const [choosing, setChoosing] = useState<OpenedPdf | null>(null);
  /** Opening a PDF or rendering the picked page */
  const [busy, setBusy] = useState(false);

  // Only the latest action is applied, in case a slow PDF finishes after the user moved on
  const actionRef = useRef(0);
  const openRef = useRef<OpenedPdf | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const closePdf = () => {
    openRef.current?.close();
    openRef.current = null;
    setChoosing(null);
  };

  useEffect(() => () => openRef.current?.close(), []);

  const apply = (poster: PreparedPoster) => {
    setFile(poster.file);
    setPreview(poster.preview);
    setPdf(poster.pdf ?? null);
    onErrorRef.current(null);
  };

  /** Use a picked or dropped file */
  const accept = useCallback(async (picked: File | undefined) => {
    if (!picked) return;
    // A file that can't be used leaves the field as it was
    const problem = checkPosterFile(picked);
    if (problem) {
      onErrorRef.current(problem);
      return;
    }
    const action = ++actionRef.current;
    closePdf();
    const fromPdf = isPdfFile(picked);
    setBusy(fromPdf);
    try {
      if (!fromPdf) {
        const poster = await prepareImagePoster(picked);
        if (action === actionRef.current) apply(poster);
        return;
      }
      const opened = await openPdf(picked);
      if (action !== actionRef.current) {
        opened.close();
        return;
      }
      if (opened.pages === 1) {
        try {
          const poster = await opened.render(1);
          if (action === actionRef.current) apply(poster);
        } finally {
          opened.close();
        }
        return;
      }
      openRef.current = opened;
      setChoosing(opened);
      onErrorRef.current(null);
    } catch (err) {
      if (action === actionRef.current) onErrorRef.current(messageOf(err));
    } finally {
      if (action === actionRef.current) setBusy(false);
    }
  }, []);

  /** Use a page (1-based) of the PDF in the page picker */
  const choosePage = useCallback(async (page: number) => {
    const opened = openRef.current;
    if (!opened) return;
    const action = ++actionRef.current;
    setBusy(true);
    try {
      const poster = await opened.render(page);
      if (action !== actionRef.current) return;
      apply(poster);
      closePdf();
    } catch (err) {
      // The picker stays open so another page can be tried
      if (action === actionRef.current) onErrorRef.current(messageOf(err));
    } finally {
      if (action === actionRef.current) setBusy(false);
    }
  }, []);

  /** Close the page picker and keep the poster that was there before */
  const cancelChoice = useCallback(() => {
    actionRef.current++;
    closePdf();
    setBusy(false);
  }, []);

  /** Show an already uploaded poster (or none), dropping any pending file */
  const reset = useCallback((url: string | null = null) => {
    actionRef.current++;
    closePdf();
    setBusy(false);
    setFile(null);
    setPdf(null);
    setPreview(url);
  }, []);

  return { file, preview, pdf, choosing, busy, accept, choosePage, cancelChoice, reset };
}
