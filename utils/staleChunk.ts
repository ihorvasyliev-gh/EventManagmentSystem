import { safeGetStorage } from './authStorage.ts';

/**
 * A tab opened before a new version was deployed still asks for the old build's files, which
 * are gone: opening a window (an event, the digest, the inbox) failed with "Something went
 * wrong". Instead the page reloads once, which brings the new build. A second failure soon
 * after is a real problem (or the device is offline) and reaches the error screen.
 *
 * A file asked for while a deploy is still reaching every server can also come back as the
 * app's page, and the browser then keeps that page under the file's name (built files are
 * cached as never changing): a plain reload failed the same way and only Ctrl+F5 helped. So
 * before reloading, any built file the browser holds as a page is downloaded again.
 */

export const STALE_CHUNK_RELOAD_KEY = 'ccp_stale_chunk_reload';
/** A reload this recent means reloading didn't help: don't loop */
export const STALE_CHUNK_RELOAD_GUARD_MS = 30_000;
/** Checking the files never holds up the reload for longer than this */
const REPAIR_TIMEOUT_MS = 8_000;

/**
 * A script or style of the app that didn't load: "Failed to fetch dynamically imported module"
 * (Chrome), "error loading dynamically imported module" (Firefox), "Importing a module script
 * failed" (Safari), "Unable to preload CSS" (Vite)
 */
export const isChunkLoadError = (err: unknown): boolean =>
  err instanceof Error && /dynamically imported module|importing a module script failed|unable to preload css/i.test(err.message);

/** The site's built files (under /assets/) among those the page asked for and those the error names */
export const builtFileUrls = (err: unknown, requested: string[], origin: string): string[] => {
  const named = err instanceof Error ? err.message.match(/https?:\/\/[^\s'"]+/g) ?? [] : [];
  const urls = new Set<string>();
  for (const raw of [...named, ...requested]) {
    try {
      const url = new URL(raw.replace(/[.,;:)]+$/, ''), origin);
      if (url.origin === origin && /^\/assets\/.+\.(?:m?js|css)$/.test(url.pathname)) urls.add(url.href);
    } catch {
      // Not a URL
    }
  }
  return [...urls];
};

/** Each file the browser gives back as a page (or not at all) is downloaded again, past its cache */
export const refreshBrokenFiles = async (urls: string[], fetchFile: typeof fetch): Promise<void> => {
  await Promise.all(urls.map(async (url) => {
    try {
      const kept = await fetchFile(url);
      if (kept.ok && !(kept.headers.get('content-type') || '').includes('text/html')) return;
      // Read to the end, so the browser keeps the whole new copy
      await (await fetchFile(url, { cache: 'reload' })).arrayBuffer();
    } catch {
      // Offline: the reload shows that
    }
  }));
};

/** Looks over the built files this page has asked for, and replaces any the browser holds as a page */
export const repairBuiltFiles = (err: unknown): Promise<void> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve();
  const requested = typeof performance === 'undefined' ? [] : performance.getEntriesByType('resource').map((e) => e.name);
  const repair = refreshBrokenFiles(builtFileUrls(err, requested, window.location.origin), fetch.bind(window));
  return Promise.race([repair, new Promise<void>((resolve) => setTimeout(resolve, REPAIR_TIMEOUT_MS))]);
};

interface Deps {
  storage: Storage | null;
  /** Before reloading: make sure the reload gets working copies of the files */
  repair: (err: unknown) => Promise<void>;
  reload: () => void;
  now: () => number;
}

const browserDeps = (): Deps => ({
  storage: safeGetStorage('session'),
  repair: repairBuiltFiles,
  reload: () => window.location.reload(),
  now: Date.now
});

/** Runs a dynamic import; when it fails, reloads the page once (the promise then never settles) */
export const loadOrReload = <T>(load: () => Promise<T>, deps: Deps = browserDeps()): Promise<T> =>
  load().catch(async (err: unknown) => {
    const { storage, now } = deps;
    // Without storage a reload can't be told from a reload loop
    if (!storage) throw err;
    try {
      const last = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY)) || 0;
      if (now() - last < STALE_CHUNK_RELOAD_GUARD_MS) throw err;
      storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now()));
    } catch {
      throw err;
    }
    await deps.repair(err);
    deps.reload();
    // The page is going away; keep showing the loading state until it does
    return new Promise<T>(() => undefined);
  });
