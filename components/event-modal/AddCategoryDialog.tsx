import React from 'react';
import { Loader2, X } from 'lucide-react';

interface AddCategoryDialogProps {
  isDark: boolean;
  name: string;
  onNameChange: (name: string) => void;
  isCreating: boolean;
  onAdd: () => void;
  onCancel: () => void;
}

/** Admins add a category that isn't in the standard list */
const AddCategoryDialog: React.FC<AddCategoryDialogProps> = ({ isDark, name, onNameChange, isCreating, onAdd, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-labelledby="add-category-title" className={`relative rounded-xl shadow-xl border border-white/20 w-full max-w-md mx-4 ${isDark ? 'glass-panel-dark' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
      <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
        <h3 id="add-category-title" className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Add New Category
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors focus:outline-none">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-6 py-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Category Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onAdd();
              }
            }}
            className="block w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium placeholder-slate-400"
            placeholder="Enter category name"
            autoFocus
          />
        </div>
      </div>
      <div className="bg-slate-50 dark:bg-slate-800/50 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 flex flex-row-reverse gap-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onAdd}
          disabled={isCreating || !name.trim()}
          className="inline-flex justify-center rounded-lg px-5 py-2 bg-slate-900 text-white font-medium hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 text-sm"
        >
          {isCreating ? <Loader2 className="animate-spin h-4 w-4" /> : 'Add Category'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isCreating}
          className="inline-flex justify-center rounded-lg px-5 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 border border-slate-200 dark:border-slate-600 transition-all text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export default AddCategoryDialog;
