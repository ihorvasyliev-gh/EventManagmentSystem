/** Building blocks of the submission form: numbered sections, field styles and errors */
import React from 'react';
import { AlertCircle } from 'lucide-react';

const inputBase =
  'w-full rounded-xl border bg-white dark:bg-slate-900/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 text-[15px] sm:text-sm transition-colors';

export const inputClass = (hasError: boolean) =>
  `${inputBase} ${hasError ? 'border-red-400 dark:border-red-500 bg-red-50/40 dark:bg-red-950/20' : 'border-slate-300 dark:border-slate-600'}`;

export const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {message}
    </p>
  ) : null;

export const Section: React.FC<{ step: number; title: string; hint?: string; children: React.ReactNode }> = ({ step, title, hint, children }) => (
  <section className="bg-white dark:bg-slate-800 rounded-leaf-sm sm:rounded-leaf shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
    <div className="flex items-start gap-3 mb-4 sm:mb-5">
      <span className="shrink-0 w-7 h-7 rounded-leaf-xs bg-brand-600 text-white text-sm font-bold flex items-center justify-center">{step}</span>
      <div>
        <h2 className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white leading-7">{title}</h2>
        {hint && <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    </div>
    <div className="space-y-5">{children}</div>
  </section>
);
