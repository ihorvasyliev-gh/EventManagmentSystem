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
  /** false: no close button, and Escape / a click outside do nothing (a step that must be finished) */
  dismissible?: boolean;
  children: React.ReactNode;
}

const SIZE_CLASS: Record<NonNullable<ModalShellProps['size']>, string> = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl'
};

// Nested dialogs each lock scrolling; only the last one to close restores it
let scrollLocks = 0;

// Phones: how far (px) the sheet is pulled down before letting go closes it, or how fast (px/ms)
const SWIPE_CLOSE_DISTANCE = 120;
const SWIPE_CLOSE_SPEED = 0.5;

/**
 * Shared dialog frame: a bottom sheet on phones and a centred "leaf" card (the site's shape) from `sm` up.
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
  dismissible = true,
  children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Focus starts on the dialog itself so screen readers announce the title
  // and no button looks pre-selected
  const close = dismissible ? onClose : () => undefined;
  useModalFocusTrap(isOpen, close, panelRef, true);

  // Phones: the sheet follows a finger pulling its handle or header down, and closes when let go
  // far or fast enough (otherwise it settles back)
  const dragRef = useRef<{ startY: number; startTime: number; dy: number } | null>(null);
  const onDragStart = (e: React.TouchEvent) => {
    if (!dismissible || e.touches.length !== 1 || !window.matchMedia('(max-width: 639px)').matches) return;
    dragRef.current = { startY: e.touches[0].clientY, startTime: performance.now(), dy: 0 };
  };
  const onDragMove = (e: React.TouchEvent) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.startY);
    // The opening animation holds the transform until it is taken off
    panel.style.animation = 'none';
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${drag.dy}px)`;
  };
  const onDragEnd = () => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    dragRef.current = null;
    if (!drag || !panel || drag.dy === 0) return;
    const speed = drag.dy / Math.max(1, performance.now() - drag.startTime);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (drag.dy > SWIPE_CLOSE_DISTANCE || (drag.dy > 40 && speed > SWIPE_CLOSE_SPEED)) {
      if (reduceMotion) {
        onClose();
        return;
      }
      panel.style.transition = 'transform 0.18s cubic-bezier(0.4, 0, 1, 1)';
      panel.style.transform = 'translateY(100%)';
      window.setTimeout(onClose, 160);
      return;
    }
    panel.style.transition = reduceMotion ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    panel.style.transform = '';
  };
  const dragHandlers = { onTouchStart: onDragStart, onTouchMove: onDragMove, onTouchEnd: onDragEnd, onTouchCancel: onDragEnd };

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
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative outline-none w-full ${SIZE_CLASS[size]} max-h-[92dvh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-slate-800 rounded-tl-[24px] rounded-tr-md sm:rounded-leaf shadow-2xl border border-slate-200 dark:border-slate-700 animate-slide-up overflow-hidden`}
      >
        {/* Phones: pull the handle or the header down to close the sheet */}
        <div {...dragHandlers} className="touch-none sm:touch-auto">
          {dismissible && (
            <div className="sm:hidden flex justify-center pt-2.5" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>
          )}

          <div className={`flex items-start gap-3 px-5 sm:px-6 ${dismissible ? 'pt-3' : 'pt-5'} sm:pt-5 pb-4 border-b border-slate-100 dark:border-slate-700/80`}>
            {icon && (
              <div className="shrink-0 p-2 rounded-leaf-xs bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-300">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white leading-tight">
                {title}
              </h2>
              {subtitle && <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
            {headerActions}
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 -mr-1.5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
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
