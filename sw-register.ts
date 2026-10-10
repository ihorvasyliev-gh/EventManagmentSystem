// Service Worker Registration
// Registers the service worker for offline support. A new version never reloads the page by
// itself (that could throw away an event being edited): the app shows "A new version is
// available" and the person reloads when it suits them.

export const SW_UPDATE_EVENT = 'ccp-sw-update';

let waitingWorker: ServiceWorker | null = null;

/** Activates the waiting new version and reloads once it has taken over */
export function applyServiceWorkerUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

const announce = (worker: ServiceWorker) => {
  waitingWorker = worker;
  window.dispatchEvent(new Event(SW_UPDATE_EVENT));
};

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // A new version already downloaded in an earlier visit
      if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          // "installed" with a controller: an update (not the first install) is ready
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) announce(newWorker);
        });
      });

      // Check for updates every hour
      setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Service Worker registration failed:', error);
    }
  });
}
