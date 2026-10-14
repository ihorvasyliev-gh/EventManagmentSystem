import { safeGetStorage } from './authStorage.ts';

/**
 * A tab opened before a new version was deployed still asks for the old build's files, which
 * are gone: opening a window (an event, the digest, the inbox) failed with "Something went
 * wrong". Instead the page reloads once, which brings the new build. A second failure soon
 * after is a real problem (or the device is offline) and reaches the error screen.
 */

export const STALE_CHUNK_RELOAD_KEY = 'ccp_stale_chunk_reload';
/** A reload this recent means reloading didn't help: don't loop */
export const STALE_CHUNK_RELOAD_GUARD_MS = 30_000;

interface Deps {
  storage: Storage | null;
  reload: () => void;
  now: () => number;
}

const browserDeps = (): Deps => ({
  storage: safeGetStorage('session'),
  reload: () => window.location.reload(),
  now: Date.now
});

/** Runs a dynamic import; when it fails, reloads the page once (the promise then never settles) */
export const loadOrReload = <T>(load: () => Promise<T>, deps: Deps = browserDeps()): Promise<T> =>
  load().catch((err: unknown) => {
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
    deps.reload();
    // The page is going away; keep showing the loading state until it does
    return new Promise<T>(() => undefined);
  });
