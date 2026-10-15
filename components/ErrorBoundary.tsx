import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';
import { reportError } from '../utils/errorReporting';
import { isChunkLoadError, repairBuiltFiles } from '../utils/staleChunk';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reloading?: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    void reportError(error, 'Screen crashed');
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // A file of the app that didn't load (usually just after a new version went live) isn't
      // a fault in the page: say so calmly, without the technical message
      const { error, reloading } = this.state;
      const updated = isChunkLoadError(error);
      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-md w-full rounded-lg shadow-lg p-6 bg-white dark:bg-slate-800 dark:border dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4">
              {updated
                ? <RefreshCw className="h-8 w-8 shrink-0 text-brand-600 dark:text-brand-400" />
                : <AlertCircle className="h-8 w-8 shrink-0 text-red-500" />}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {updated ? 'The calendar has just been updated' : 'Something went wrong'}
              </h2>
            </div>
            <p className="mb-3 text-gray-600 dark:text-slate-300">
              {updated
                ? 'This page needs the new version. Reload to carry on; nothing you saved is lost.'
                : 'The page hit an unexpected problem. Reloading usually fixes it.'}
            </p>
            {!updated && error?.message && (
              <p className="mb-3 text-xs font-mono break-words rounded-md px-3 py-2 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                {error.message}
              </p>
            )}
            <p className="mb-4 text-sm text-gray-600 dark:text-slate-300">
              {updated && 'If it doesn’t load, check the internet connection. '}
              If it keeps happening, please email{' '}
              <a href={buildSupportMailto(error?.message)} className="font-semibold text-brand-600 dark:text-brand-400 underline underline-offset-2 break-all">
                {CONTACT_EMAIL}
              </a>{' '}
              and say what you were doing.
            </p>
            <button
              type="button"
              disabled={reloading}
              onClick={() => {
                // Files the browser kept broken are fetched again first: a plain reload reused them
                this.setState({ reloading: true });
                void repairBuiltFiles(error).finally(() => window.location.reload());
              }}
              className="cta w-full px-4 py-2.5 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors disabled:opacity-70"
            >
              {reloading ? 'Reloading…' : 'Reload page'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
