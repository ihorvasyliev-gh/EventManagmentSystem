// Service Worker for CCP Event Calendar
// Offline support: pages network-first (stored under /index.html), hashed assets & fonts
// cache-first, unhashed static assets stale-while-revalidate. The runtime cache is capped,
// and /api/ responses are never cached here (files under /api/file are cached by the browser,
// and calendar data must never come from a stale copy).

// v5: precache shell assets, cache-first only for hashed /assets/* & /fonts/*, single /index.html shell entry
const CACHE_NAME = 'ccp-calendar-v5';
const RUNTIME_CACHE = 'ccp-runtime-cache-v5';
// Built files have hashed names, so every deploy adds new ones: keep only the most recent
const MAX_RUNTIME_ENTRIES = 80;

// Assets to precache on install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/theme-init.js',
    '/fonts/Lato-Regular.woff2',
    '/assets/ccp-logo-v2.png',
];

self.addEventListener('install', (event) => {
    // No skipWaiting here: an update waits until the page asks for it ("Reload" in the app)
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

// Remove caches of older versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames
                .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                .map((name) => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

/** Hashed Vite bundles under /assets/ and immutable font files under /fonts/ */
function isImmutableAsset(pathname) {
    if (pathname.startsWith('/fonts/')) return true;
    return pathname.startsWith('/assets/') && /-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/i.test(pathname);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // The Cache API only stores GET responses (uploads are PUT) — let everything else through
    if (request.method !== 'GET') return;

    // Other sites (Supabase, Turnstile) and the app's API always go to the network
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

    // Pages - network first, stored under a single /index.html shell key so deep links never evict built chunks
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(event, request, '/index.html'));
        return;
    }

    // Hashed /assets/* bundles and immutable /fonts/* - cache first
    if (isImmutableAsset(url.pathname)) {
        event.respondWith(cacheFirst(event, request));
        return;
    }

    // Unhashed scripts, styles, icons and images (e.g. /theme-init.js, /icon-*.png) - stale-while-revalidate
    if (['script', 'style', 'image', 'font', 'worker'].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(event, request));
        return;
    }

    event.respondWith(networkFirst(event, request));
});

/** Drops the oldest entries once the cache holds more than the limit */
async function trimCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - MAX_RUNTIME_ENTRIES;
    for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
    }
}

/**
 * A file that no longer exists (an old build's script, asked for by a tab opened before a deploy)
 * comes back as the app's page: never keep that page under a script's, style's or image's name.
 */
function isPageForAsset(request, response) {
    const isPage = request.mode === 'navigate' || request.destination === 'document';
    return !isPage && (response.headers.get('content-type') || '').includes('text/html');
}

async function remember(request, response, cacheKey = request) {
    if (!response.ok || response.type === 'opaque' || isPageForAsset(request, response)) return;
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(cacheKey, response);
    await trimCache(cache);
}

async function cacheFirst(event, request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    event.waitUntil(remember(request, response.clone()));
    return response;
}

async function staleWhileRevalidate(event, request) {
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then((response) => {
        event.waitUntil(remember(request, response.clone()));
        return response;
    });
    if (cached) {
        event.waitUntil(networkPromise.catch(() => undefined));
        return cached;
    }
    return networkPromise;
}

async function networkFirst(event, request, cacheKey) {
    try {
        const response = await fetch(request);
        event.waitUntil(remember(request, response.clone(), cacheKey));
        return response;
    } catch (error) {
        const cached = (await caches.match(cacheKey || request))
            || (request.mode === 'navigate' ? await caches.match('/index.html') : undefined);
        if (cached) return cached;
        throw error;
    }
}

// The page asks the waiting version to take over
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
