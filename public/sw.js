// Service Worker for CCP Event Calendar
// Offline support: pages network-first, built assets cache-first. The runtime cache is capped,
// and /api/ responses are never cached here (files under /api/file are cached by the browser,
// and calendar data must never come from a stale copy).

const CACHE_NAME = 'ccp-calendar-v3';
const RUNTIME_CACHE = 'ccp-runtime-cache-v3';
// Built files have hashed names, so every deploy adds new ones: keep only the most recent
const MAX_RUNTIME_ENTRIES = 80;

// Assets to precache on install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
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

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // The Cache API only stores GET responses (uploads are PUT) — let everything else through
    if (request.method !== 'GET') return;

    // Other sites (Supabase, Turnstile) and the app's API always go to the network
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

    // Pages - network first (always get fresh content)
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Built assets, fonts and images - cache first
    if (['script', 'style', 'image', 'font', 'worker'].includes(request.destination)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    event.respondWith(networkFirst(request));
});

/** Drops the oldest entries once the cache holds more than the limit */
async function trimCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - MAX_RUNTIME_ENTRIES;
    for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
    }
}

async function remember(request, response) {
    if (!response.ok || response.type === 'opaque') return;
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response);
    await trimCache(cache);
}

async function cacheFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    remember(request, response.clone());
    return response;
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        remember(request, response.clone());
        return response;
    } catch (error) {
        const cached = (await caches.match(request)) || (request.mode === 'navigate' ? await caches.match('/index.html') : undefined);
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
