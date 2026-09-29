import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2 } from 'lucide-react';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const slugify = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poster';

/**
 * Saves a poster under a readable name. The `download` attribute is ignored for files on
 * another origin (Supabase storage), so the image is fetched and saved as a blob; if that
 * fails the poster opens in a new tab instead.
 */
export const downloadPoster = async (url: string, title: string): Promise<void> => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ext = EXTENSIONS[blob.type] || url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${slugify(title)}-poster.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.warn('Poster download fell back to opening the file:', err);
    window.open(url, '_blank', 'noopener');
  }
};

/** Download button for a poster, with a spinner while the file is fetched */
export const PosterDownloadButton: React.FC<{ url: string; title: string; className?: string }> = ({ url, title, className = '' }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          await downloadPoster(url, title);
        } finally {
          setBusy(false);
        }
      }}
      aria-label="Download poster"
      title="Download poster"
      className={className}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
  );
};

interface PosterLightboxProps {
  src: string;
  title: string;
  onClose: () => void;
}

/** Full-screen view of a poster. Escape, the close button or a click outside the image closes it. */
const PosterLightbox: React.FC<PosterLightboxProps> = ({ src, title, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    // Capture phase + preventDefault: the dialog underneath skips an Escape that was already handled
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex flex-col animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Poster: ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 sm:px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <p className="text-sm font-semibold truncate min-w-0">{title}</p>
        <div className="flex items-center gap-2 shrink-0">
          <PosterDownloadButton
            url={src}
            title={title}
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close poster"
            className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <img
          src={src}
          alt={title}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
        />
      </div>
    </div>,
    document.body
  );
};

export default PosterLightbox;
