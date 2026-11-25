import React, { Suspense, lazy } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateBanner from './components/UpdateBanner';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { loadOrReload } from './utils/staleChunk';

// Routes load when visited; after a deploy an old tab reloads instead of crashing
const lazyWithReload = <T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  lazy(() => loadOrReload(load));

// A shared digest's page (/digest/…): anyone with the link, no account, no calendar
const DigestViewPage = lazyWithReload(() => import('./pages/DigestViewPage'));
const isDigestPage = () => window.location.pathname.startsWith('/digest/');
// The public page to subscribe to the calendar (/subscribe): no account
const SubscribePage = lazyWithReload(() => import('./pages/SubscribePage'));
const isSubscribePage = () => /^\/subscribe\/?$/.test(window.location.pathname);
// The authenticated calendar shell (and login/submit pages): split so public routes never download it
const AuthenticatedApp = lazyWithReload(() => import('./AuthenticatedApp'));

const PageFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[100dvh] bg-slate-50 dark:bg-slate-900" role="status" aria-label="Loading">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
  </div>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          {isDigestPage() ? (
            <Suspense fallback={<PageFallback />}>
              <DigestViewPage />
            </Suspense>
          ) : (
            isSubscribePage() ? (
              <Suspense fallback={<PageFallback />}>
                <SubscribePage />
              </Suspense>
            ) : (
              <Suspense fallback={<PageFallback />}>
                <AuthenticatedApp />
              </Suspense>
            )
          )}
          <UpdateBanner />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
