import React from 'react';
import { Loader2, X } from 'lucide-react';
import type { Event } from '../../types';

interface DeleteEventDialogProps {
  event: Event;
  isDark: boolean;
  isDeleting: boolean;
  /** true: the whole event (series); false: only this occurrence */
  onConfirm: (deleteAll: boolean) => void;
  onCancel: () => void;
}

/** Asks before deleting; a repeating event offers "only this occurrence" or the whole series */
const DeleteEventDialog: React.FC<DeleteEventDialogProps> = ({ event, isDark, isDeleting, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={() => !isDeleting && onCancel()}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title" className={`relative rounded-xl shadow-xl border border-white/20 w-full max-w-md mx-4 ${isDark ? 'glass-panel-dark' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
      <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
        <h3 id="delete-event-title" className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Delete Event
        </h3>
        <button onClick={() => !isDeleting && onCancel()} aria-label="Close" className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none" disabled={isDeleting}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-6 py-6">
        {event.recurrence && event.recurrence.type !== 'none' ? (
          <div className="space-y-4">
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              This is a recurring event. What would you like to delete?
            </p>
            <div className="space-y-3">
              <button
                onClick={() => onConfirm(false)}
                disabled={isDeleting}
                className="w-full px-4 py-3 text-left rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all disabled:opacity-50"
              >
                <div className="font-semibold text-slate-900 dark:text-white">Delete only this occurrence</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Remove this specific instance from the series
                </div>
              </button>
              <button
                onClick={() => onConfirm(true)}
                disabled={isDeleting}
                className="w-full px-4 py-3 text-left rounded-lg border-2 border-red-200 dark:border-red-800 hover:border-red-500 dark:hover:border-red-500 transition-all disabled:opacity-50"
              >
                <div className="font-semibold text-red-600 dark:text-red-400">Delete entire series</div>
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  Remove all occurrences of this event
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Are you sure you want to delete "{event.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onConfirm(true)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 font-medium"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Delete'}
              </button>
              <button
                onClick={onCancel}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-all disabled:opacity-50 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default DeleteEventDialog;
