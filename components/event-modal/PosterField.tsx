import React, { useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { POSTER_ACCEPT, MAX_POSTER_IMAGE_MB, MAX_POSTER_PDF_MB } from '../../utils/posterFile';
import type { usePosterFile } from '../../hooks/usePosterFile';
import PdfPagePicker from '../PdfPagePicker';

interface PosterFieldProps {
  poster: ReturnType<typeof usePosterFile>;
  /** Event title, to name the current poster */
  title: string;
}

/** Edit form: the poster or flyer — pick an image or a PDF page, or remove the current one */
const PosterField: React.FC<PosterFieldProps> = ({ poster, title }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { file: posterFile, preview: previewUrl, pdf: posterPdf } = poster;

  // Cleared just before the file dialog opens, not after a pick: the same file can be picked
  // again, and a file still being read stays readable (clearing it can break reading on phones)
  const openFilePicker = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleRemovePoster = () => {
    poster.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
        Poster / Flyer <span className="text-slate-400 font-normal lowercase">(optional)</span>
      </label>

      {poster.choosing ? (
        <PdfPagePicker pdf={poster.choosing} busy={poster.busy} onPick={poster.choosePage} onCancel={poster.cancelChoice} />
      ) : poster.busy ? (
        <div role="status" className="rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/20 p-5 text-center">
          <Loader2 className="w-7 h-7 text-brand-500 animate-spin mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Reading the PDF…</p>
          <p className="text-[11px] text-slate-400 mt-0.5">This only takes a moment</p>
        </div>
      ) : previewUrl ? (
        <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 p-2.5 flex items-center gap-4">
          <img
            src={previewUrl}
            alt="Poster preview"
            className="w-20 h-20 object-cover rounded-lg border border-slate-300 dark:border-slate-600"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
              {posterPdf?.name || posterFile?.name || (title ? `${title} flyer` : 'Current poster image')}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {posterPdf && (posterPdf.pages > 1 ? `Page ${posterPdf.page} of ${posterPdf.pages} · ` : 'Converted from PDF · ')}
              {posterFile ? `${(posterFile.size / 1024).toFixed(0)} KB` : 'Active poster'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemovePoster}
            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Remove poster"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div
          onClick={openFilePicker}
          className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-400 rounded-xl p-5 text-center transition-colors bg-slate-50/50 dark:bg-slate-800/50"
        >
          <Upload className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Click or drag and drop to upload flyer / poster
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            PNG, JPG or WEBP up to {MAX_POSTER_IMAGE_MB}MB · PDF up to {MAX_POSTER_PDF_MB}MB
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={POSTER_ACCEPT}
        className="hidden"
        onChange={(e) => void poster.accept(e.target.files?.[0])}
      />
    </div>
  );
};

export default PosterField;
