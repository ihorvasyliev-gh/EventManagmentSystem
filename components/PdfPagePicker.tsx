import React, { useEffect, useId, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { MAX_PICKER_PAGES, type OpenedPdf } from '../utils/posterFile';

interface PdfPagePickerProps {
  pdf: OpenedPdf;
  /** The picked page is being turned into the poster */
  busy: boolean;
  onPick: (page: number) => void;
  onCancel: () => void;
}

/** Grid of a PDF's pages: the user taps the one to use as the poster. */
const PdfPagePicker: React.FC<PdfPagePickerProps> = ({ pdf, busy, onPick, onCancel }) => {
  const shown = Math.min(pdf.pages, MAX_PICKER_PAGES);
  // Data URL per page; null while it renders, '' if it could not be drawn
  const [thumbs, setThumbs] = useState<(string | null)[]>(() => Array(shown).fill(null));
  const [picked, setPicked] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    setThumbs(Array(shown).fill(null));
    let cancelled = false;
    // One page at a time keeps memory low on phones
    (async () => {
      for (let page = 1; page <= shown && !cancelled; page++) {
        let src = '';
        try {
          src = await pdf.thumbnail(page);
        } catch {
          // Shown as a plain "Page N" tile, still pickable
        }
        if (cancelled) return;
        setThumbs((prev) => prev.map((t, i) => (i === page - 1 ? src : t)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, shown]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Which page is the poster?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
            <FileText className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
            {pdf.name} has {pdf.pages} pages. Tap the one to use.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
      <div
        role="group"
        aria-labelledby={titleId}
        className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[24rem] overflow-y-auto p-0.5"
      >
        {thumbs.map((src, i) => {
          const page = i + 1;
          const rendering = busy && picked === page;
          return (
            <button
              key={page}
              type="button"
              disabled={busy}
              onClick={() => {
                setPicked(page);
                onPick(page);
              }}
              aria-label={`Use page ${page} as the poster`}
              className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 focus:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-wait disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700 transition-colors"
            >
              {src ? (
                <img src={src} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-600">
                  {src === null ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-6 h-6" />}
                </span>
              )}
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/75 text-white text-[10px] font-semibold leading-none">
                {page}
              </span>
              {rendering && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pdf.pages > shown && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Only the first {shown} pages are shown.</p>
      )}
    </div>
  );
};

export default PdfPagePicker;
