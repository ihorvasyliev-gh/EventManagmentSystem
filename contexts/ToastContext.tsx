import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';

// Error toasts carry a contact line, so they stay up long enough to read it
const MIN_ERROR_DURATION = 10000;

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = Math.random().toString(36).substr(2, 9);
    if (type === 'error' && duration > 0) duration = Math.max(duration, MIN_ERROR_DURATION);
    const toast: Toast = { id, message, type, duration };
    
    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-ccp-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStyles = (type: ToastType) => {
    if (isDark) {
      switch (type) {
        case 'success':
          return 'bg-ccp-green-900/90 border-ccp-green-700 text-ccp-green-100';
        case 'error':
          return 'bg-red-900/90 border-red-700 text-red-100';
        case 'warning':
          return 'bg-amber-900/90 border-amber-700 text-amber-100';
        default:
          return 'bg-blue-900/90 border-blue-700 text-blue-100';
      }
    }
    switch (type) {
      case 'success':
        return 'bg-ccp-green-50 border-ccp-green-200 text-ccp-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    // Above modals (z-[60]) so errors raised while a dialog is open are visible
    <div
      className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm z-[100] space-y-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : undefined}
          className={`${getStyles(toast.type)} pointer-events-auto border rounded-lg shadow-lg p-4 flex items-start space-x-3 animate-slide-down`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {getIcon(toast.type)}
          </div>
          <div className="flex-1 min-w-0 text-sm font-medium">
            {toast.message}
            {toast.type === 'error' && (
              <p className="mt-1 text-xs font-normal opacity-90">
                If this keeps happening, contact{' '}
                <a href={buildSupportMailto(toast.message)} className="font-semibold underline underline-offset-2 break-all">
                  {CONTACT_EMAIL}
                </a>
              </p>
            )}
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-300 dark:text-slate-400 dark:hover:text-slate-300"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
