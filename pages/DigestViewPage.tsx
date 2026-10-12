import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileText } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import ThemeToggle from '../components/ThemeToggle';
import { loadPdfJs } from '../utils/posterFile';
import { digestFromPagePath } from '../utils/digestLinks';

type ViewState = 'loading' | 'ready' | 'missing' | 'error';

const MAX_PAGE_WIDTH = 880;
const pageWidth = () => Math.max(280, Math.min(MAX_PAGE_WIDTH, window.innerWidth - 24));

/**
 * A shared digest (/digest/<id>-<name>): the PDF's pages drawn here with pdf.js, its links kept
 * clickable, and a download button. Phone email apps open links in a built-in browser that can't
 * show or save a PDF (a black screen), and desktop PDF extensions render it badly; a page works
 * everywhere. Anyone with the link can open it, for as long as the file is kept (six months).
 */
const DigestViewPage: React.FC = () => {
  const digest = useMemo(() => digestFromPagePath(window.location.pathname), []);
  const [state, setState] = useState<ViewState>(digest ? 'loading' : 'missing');
  const [width, setWidth] = useState(pageWidth);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Upcoming Events Digest${digest?.period ? `, ${digest.period}` : ''} · Cork City Partnership`;
  }, [digest]);

  // Turning a phone or resizing the window draws the pages again at the new width
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWidth((w) => (Math.abs(w - pageWidth()) > 40 ? pageWidth() : w)), 250);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!digest) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const res = await fetch(digest.fileUrl);
        if (res.status === 404) {
          if (!cancelled) setState('missing');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await loadPdfJs();
        task = pdfjs.getDocument({ data });
        const opened = await task.promise;
        if (cancelled) return;
        setDoc(opened);
        setState('ready');
      } catch (err) {
        console.error('Opening the digest failed:', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [digest]);

  // Each page as a canvas at the screen's pixel density, with its links laid over it
  useEffect(() => {
    const container = pagesRef.current;
    if (!doc || !container) return;
    let cancelled = false;
    container.replaceChildren();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    (async () => {
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const sheet = document.createElement('div');
        sheet.className = 'relative mx-auto bg-white shadow-md ring-1 ring-slate-200 dark:ring-slate-700';
        sheet.style.width = `${viewport.width}px`;
        sheet.style.height = `${viewport.height}px`;
        sheet.setAttribute('role', 'group');
        sheet.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        sheet.appendChild(canvas);
        container.appendChild(sheet);
        await page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0], background: '#ffffff' }).promise;
        const annotations = await page.getAnnotations();
        annotations.forEach((a: { subtype?: string; url?: string; rect?: number[] }) => {
          if (a.subtype !== 'Link' || !a.url || !a.rect || !/^(https?:|mailto:)/i.test(a.url)) return;
          const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
          const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
          const link = document.createElement('a');
          link.href = a.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'absolute';
          link.style.left = `${Math.min(x1, x2)}px`;
          link.style.top = `${Math.min(y1, y2)}px`;
          link.style.width = `${Math.abs(x2 - x1)}px`;
          link.style.height = `${Math.abs(y2 - y1)}px`;
          link.setAttribute('aria-label', a.url.replace(/^mailto:/i, 'Email '));
          sheet.appendChild(link);
        });
        page.cleanup();
      }
    })().catch((err) => {
      console.error('Drawing the digest failed:', err);
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [doc, width]);

  const download = digest && state !== 'missing' && (
    <a
      href={`${digest.fileUrl}?download=1`}
      download={digest.fileName}
      className="cta inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded bg-brand-600 hover:bg-brand-700 text-white !text-xs tracking-[0.1em] shadow-sm transition-colors"
    >
      <Download className="w-4 h-4 shrink-0" /> Download PDF
    </a>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-slate-900">
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-16 flex items-center gap-3">
          <span className="bg-white p-1 px-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 shrink-0">
            <img src="/assets/ccp-logo-v2.png" alt="Cork City Partnership" className="h-6 sm:h-7 w-auto object-contain" />
          </span>
          <div className="min-w-0 flex-1 hidden min-[480px]:block">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">Upcoming Events Digest</h1>
            {digest?.period && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{digest.period}</p>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {download}
          </div>
        </div>
      </header>

      <main className="py-4 sm:py-8 px-3">
        <div className="min-[480px]:hidden mb-3 text-center">
          <h1 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming Events Digest</h1>
          {digest?.period && <p className="text-xs text-slate-600 dark:text-slate-400">{digest.period}</p>}
        </div>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-600 dark:text-slate-400" role="status">
            <span className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            Opening the digest…
          </div>
        )}

        {(state === 'missing' || state === 'error') && (
          <div className="max-w-md mx-auto mt-12 p-6 rounded-leaf bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center" role="alert">
            {state === 'missing'
              ? <FileText className="w-8 h-8 mx-auto text-slate-400" />
              : <AlertCircle className="w-8 h-8 mx-auto text-red-500" />}
            <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
              {state === 'missing' ? 'This digest is no longer available' : 'The digest could not be shown here'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {state === 'missing'
                ? 'Links to a digest work for six months. Ask the person who sent it for the latest one.'
                : 'Download it instead to open it in your PDF app.'}
            </p>
            {state === 'error' && <div className="mt-4">{download}</div>}
          </div>
        )}

        <div ref={pagesRef} className={state === 'ready' ? 'flex flex-col gap-4 sm:gap-6' : 'hidden'} />

        {state === 'ready' && (
          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">
            Download doesn’t start in your email app? Open this page in your browser.
          </p>
        )}
      </main>
    </div>
  );
};

export default DigestViewPage;
