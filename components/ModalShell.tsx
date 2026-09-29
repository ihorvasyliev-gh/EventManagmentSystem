import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Extra controls shown in the header, left of the close button */
  headerActions?: React.ReactNode;
  /** Sticky action bar at the bottom of the dialog */
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const SIZE_CLASS: Record<NonNullable<ModalShellProps['size']>, string> = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl'
};

// Nested dialogs each lock scrolling; only the last one to close restores it
let scrollLocks = 0;

/**
 * Shared dialog frame: a bottom sheet on phones and a centred card from `sm` up.
 * Header and footer stay visible while the body scrolls.
 */
const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  size = 'md',
  children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Focus starts on the dialog itself so screen readers announce the title
  // and no button looks pre-selected
  useModalFocusTrap(isOpen, onClose, panelRef, true);

  useEffect(() => {
    if (!isOpen) return;
    scrollLocks++;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] animate-fade-in"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative outline-none w-full ${SIZE_CLASS[size]} max-h-[92dvh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 animate-slide-up overflow-hidden`}
      >
        {/* Grab handle hints that the sheet is a layer above the page on phones */}
        <div className="sm:hidden flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-start gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-slate-100 dark:border-slate-700/80">
          {icon && (
            <div className="shrink-0 p-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mr-1.5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-slate-100 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/40 px-5 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ModalShell;
