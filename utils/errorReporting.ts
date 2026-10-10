import { supabase } from '../lib/supabase';

/**
 * Sends errors from people's browsers to /api/client-error (stored in Supabase's client_errors
 * table), so problems surface without anyone having to email. Production only; a few per page
 * view at most, and each message once.
 */

declare const __APP_RELEASE__: string;

const MAX_REPORTS_PER_PAGE = 5;
const reported = new Set<string>();

// Noise from browser extensions and aborted requests, not from the app
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i, /AbortError/i];

export const reportError = async (error: unknown, context?: string): Promise<void> => {
  if (!import.meta.env.PROD || reported.size >= MAX_REPORTS_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  const message = `${context ? `${context}: ` : ''}${err.message || String(err)}`.slice(0, 500);
  if (!message || reported.has(message) || IGNORED.some((re) => re.test(message) || re.test(err.stack ?? ''))) return;
  reported.add(message);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch('/api/client-error', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message,
        stack: err.stack?.slice(0, 4000),
        url: window.location.pathname + window.location.search,
        release: typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : 'dev'
      })
    });
  } catch {
    // Reporting must never cause another error
  }
};

/** Catches errors nothing else handled (call once at start-up) */
export const initErrorReporting = (): void => {
  if (!import.meta.env.PROD) return;
  window.addEventListener('error', (e) => void reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => void reportError(e.reason, 'Unhandled promise'));
};
