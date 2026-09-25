// Service Worker Registration
// Registers the service worker for offline support and performance improvements

export function registerServiceWorker(): void {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                });

                if (import.meta.env.DEV) console.log('✅ Service Worker registered:', registration.scope);

                // Check for updates periodically
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available, prompt user or auto-update
                                if (import.meta.env.DEV) console.log('🔄 New version available! Refreshing...');

                                // Send skip waiting message to service worker
                                newWorker.postMessage({ type: 'SKIP_WAITING' });

                                // Reload page when service worker is activated
                                let refreshing = false;
                                navigator.serviceWorker.addEventListener('controllerchange', () => {
                                    if (!refreshing) {
                                        refreshing = true;
                                        window.location.reload();
                                    }
                                });
                            }
                        });
                    }
                });

                // Check for updates every hour
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);

            } catch (error) {
                if (import.meta.env.DEV) console.error('❌ Service Worker registration failed:', error);
            }
        });
    }
}

