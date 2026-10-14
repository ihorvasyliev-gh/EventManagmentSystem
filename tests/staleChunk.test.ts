import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOrReload, STALE_CHUNK_RELOAD_KEY, STALE_CHUNK_RELOAD_GUARD_MS } from '../utils/staleChunk.ts';

const memoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v))
  };
};

const settlesWithin = <T>(promise: Promise<T>, ms = 20) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

test('a module that loads is returned as it is, without reloading', async () => {
  let reloads = 0;
  const mod = await loadOrReload(async () => ({ default: 'ok' }), { storage: memoryStorage(), reload: () => reloads++, now: () => 1000 });
  assert.deepEqual(mod, { default: 'ok' });
  assert.equal(reloads, 0);
});

test('an old build whose file is gone reloads the page once and waits for it', async () => {
  let reloads = 0;
  const storage = memoryStorage();
  const pending = loadOrReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), {
    storage, reload: () => reloads++, now: () => 50_000
  });
  assert.equal(await settlesWithin(pending), false, 'the loading state stays until the page reloads');
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(STALE_CHUNK_RELOAD_KEY), '50000');
});

test('failing again right after a reload shows the error instead of reloading in a loop', async () => {
  let reloads = 0;
  const storage = memoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, '50000');
  await assert.rejects(
    loadOrReload(() => Promise.reject(new Error('offline')), { storage, reload: () => reloads++, now: () => 50_000 + STALE_CHUNK_RELOAD_GUARD_MS - 1 }),
    /offline/
  );
  assert.equal(reloads, 0);
});

test('a later deploy reloads again', async () => {
  let reloads = 0;
  const storage = memoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, '50000');
  const pending = loadOrReload(() => Promise.reject(new Error('gone')), { storage, reload: () => reloads++, now: () => 50_000 + STALE_CHUNK_RELOAD_GUARD_MS });
  assert.equal(await settlesWithin(pending), false);
  assert.equal(reloads, 1);
});

test('without storage (blocked site data) the error is shown: a loop could not be stopped', async () => {
  let reloads = 0;
  await assert.rejects(loadOrReload(() => Promise.reject(new Error('gone')), { storage: null, reload: () => reloads++, now: () => 1 }), /gone/);
  assert.equal(reloads, 0);
});
