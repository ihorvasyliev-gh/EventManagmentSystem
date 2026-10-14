import React from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';

interface EventModalFooterProps {
  onClose: () => void;
  /** Admins: delete the event (or one of its dates) */
  onDelete?: () => void;
  /** Admins: a new event with the same details */
  onDuplicate?: () => void;
  /** Opens the event form (admins: any event; staff: their own) */
  onEdit?: () => void;
}

const secondaryButton = 'cta inline-flex justify-center items-center rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-600 transition-all w-full sm:w-auto';

/** Under the event details: Delete and Duplicate (admins), Close, and Edit */
const EventModalFooter: React.FC<EventModalFooterProps> = ({ onClose, onDelete, onDuplicate, onEdit }) => (
  <div className="bg-slate-50 dark:bg-slate-800/50 px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 flex flex-col-reverse sm:flex-row-reverse gap-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
    {onEdit ? (
      <div className="flex w-full items-center gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="cta inline-flex justify-center items-center gap-1.5 rounded px-3 sm:px-4 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            title="Delete event"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>Delete</span>
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="cta inline-flex justify-center items-center gap-1.5 rounded px-3 sm:px-4 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
            title="New event with the same details"
          >
            <Copy className="h-4 w-4 shrink-0" />
            <span className="hidden min-[400px]:inline">Duplicate</span>
          </button>
        )}
        <button type="button" onClick={onClose} className="cta hidden sm:inline-flex sm:ml-auto justify-center items-center rounded px-5 py-2.5 bg-white dark:bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-slate-300 dark:border-slate-600 transition-all">
          Close
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="cta inline-flex justify-center items-center gap-1.5 rounded px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all flex-1 sm:flex-none"
          title="Edit event (E)"
          aria-keyshortcuts="e"
        >
          {/* Words only under 400px: with the icon it didn't fit beside Delete and Duplicate */}
          <Pencil className="hidden min-[400px]:block h-4 w-4 shrink-0" />
          Edit event
        </button>
      </div>
    ) : (
      <button type="button" onClick={onClose} className={secondaryButton}>
        Close
      </button>
    )}
  </div>
);

export default EventModalFooter;
