import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { CONTACT_EMAIL, buildSupportMailto } from '../constants/support';

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
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      return (
        <div className={`min-h-[100dvh] flex items-center justify-center p-4 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
          <div className={`max-w-md w-full rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white'}`}>
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Something went wrong</h2>
            </div>
            <p className={`mb-3 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
              The page hit an unexpected problem. Reloading usually fixes it.
            </p>
            {this.state.error?.message && (
              <p className={`mb-3 text-xs font-mono break-words rounded-md px-3 py-2 ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                {this.state.error.message}
              </p>
            )}
            <p className={`mb-4 text-sm ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
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
