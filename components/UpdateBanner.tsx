import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { SW_UPDATE_EVENT, applyServiceWorkerUpdate } from '../sw-register';

/** "A new version is available": reloading is up to the person, so nothing they typed is lost */
const UpdateBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(SW_UPDATE_EVENT, show);
    return () => window.removeEventListener(SW_UPDATE_EVENT, show);
  }, []);

  if (!visible) return null;

  return (
    <div role="status" className="fixed z-[70] left-3 right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4 [@media(max-height:499px)]:bottom-4 md:left-auto md:right-4 md:max-w-sm animate-slide-up">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl px-4 py-3">
        <RefreshCw className="w-5 h-5 shrink-0 opacity-80" aria-hidden="true" />
        <p className="flex-1 text-sm">A new version of the calendar is available.</p>
        <button type="button" onClick={applyServiceWorkerUpdate} className="shrink-0 h-9 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
          Reload
        </button>
        <button type="button" onClick={() => setVisible(false)} aria-label="Later" className="shrink-0 -mr-1 p-1.5 rounded-lg opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
