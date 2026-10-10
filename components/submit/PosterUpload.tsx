import React, { useRef, useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { POSTER_ACCEPT, MAX_POSTER_IMAGE_MB, MAX_POSTER_PDF_MB } from '../../utils/posterFile';
import type { usePosterFile } from '../../hooks/usePosterFile';
import PdfPagePicker from '../PdfPagePicker';
import { FieldError } from './formParts';

interface PosterUploadProps {
  poster: ReturnType<typeof usePosterFile>;
  error?: string;
}

/** The optional poster or flyer: pick or drop an image or PDF (then a page), replace or remove it */
const PosterUpload: React.FC<PosterUploadProps> = ({ poster, error }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { file: posterFile, preview: posterPreview, pdf: posterPdf } = poster;

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div id="field-poster" tabIndex={-1} className="outline-none scroll-mt-24">
      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
        Poster or flyer <span className="font-normal text-slate-400">(optional)</span>
      </span>
      {poster.choosing ? (
        <PdfPagePicker pdf={poster.choosing} busy={poster.busy} onPick={poster.choosePage} onCancel={poster.cancelChoice} />
      ) : poster.busy ? (
        <div role="status" className="w-full flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/20 p-6 text-center">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reading your PDF…</span>
          <span className="text-xs text-slate-400">This only takes a moment</span>
        </div>
      ) : posterPreview ? (
        <div className="flex items-center gap-4 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
          <img src={posterPreview} alt="Poster preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{posterPdf?.name || posterFile?.name || 'Uploaded flyer'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {posterPdf && (posterPdf.pages > 1 ? `Page ${posterPdf.page} of ${posterPdf.pages} · ` : 'Converted from PDF · ')}
              {posterFile ? `${Math.max(1, Math.round(posterFile.size / 1024))} KB` : ''}
            </p>
            <button type="button" onClick={openFilePicker} className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              Replace
            </button>
          </div>
          <button
            type="button"
            onClick={handleRemovePoster}
            className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Remove poster"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openFilePicker}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); void poster.accept(e.dataTransfer.files?.[0]); }}
          className={`w-full flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            isDragging
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
              : error
              ? 'border-red-300 dark:border-red-700'
              : 'border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500 bg-slate-50/60 dark:bg-slate-900/30'
          }`}
        >
          <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-brand-500' : 'text-slate-400'}`} />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span className="sm:hidden">Tap to add an image or PDF</span>
            <span className="hidden sm:inline">Click to choose, or drop an image or PDF here</span>
          </span>
          <span className="text-xs text-slate-400">PNG, JPG or WEBP up to {MAX_POSTER_IMAGE_MB}MB · PDF up to {MAX_POSTER_PDF_MB}MB</span>
        </button>
      )}
      <FieldError id="err-poster" message={error} />
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

export default PosterUpload;
