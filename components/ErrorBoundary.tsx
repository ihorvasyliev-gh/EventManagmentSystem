import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';
import { reportError } from '../utils/errorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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

      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-md w-full rounded-lg shadow-lg p-6 bg-white dark:bg-slate-800 dark:border dark:border-slate-700">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Something went wrong</h2>
            </div>
            <p className="mb-3 text-gray-600 dark:text-slate-300">
              The page hit an unexpected problem. Reloading usually fixes it.
            </p>
            {this.state.error?.message && (
              <p className="mb-3 text-xs font-mono break-words rounded-md px-3 py-2 bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                {this.state.error.message}
              </p>
            )}
            <p className="mb-4 text-sm text-gray-600 dark:text-slate-300">
              If it keeps happening, please email{' '}
              <a href={buildSupportMailto(this.state.error?.message)} className="font-semibold text-brand-600 dark:text-brand-400 underline underline-offset-2 break-all">
                {CONTACT_EMAIL}
              </a>{' '}
              and say what you were doing.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="cta w-full px-4 py-2.5 bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
