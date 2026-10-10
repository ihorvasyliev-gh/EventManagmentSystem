import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile: a privacy-friendly "are you a person" check for people who submit
 * without an account. Most people never see a puzzle; it usually passes by itself.
 * Off unless VITE_TURNSTILE_SITE_KEY is set (with TURNSTILE_SECRET_KEY on the server).
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const TURNSTILE_ENABLED = !!SITE_KEY;

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
const loadScript = (): Promise<void> => {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile could not load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export interface TurnstileHandle {
  /** A token works once: get a fresh one after a failed send */
  reset: () => void;
}

const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void }>(({ onToken }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    }
  }), []);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action: 'submit-event',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null)
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  if (!SITE_KEY) return null;
  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {failed && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
          The anti-spam check didn’t load. Please check your connection, turn off any blocker for this page, or try another browser.
        </p>
      )}
    </div>
  );
});
TurnstileWidget.displayName = 'TurnstileWidget';

export default TurnstileWidget;
