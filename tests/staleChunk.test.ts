import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOrReload, isChunkLoadError, builtFileUrls, refreshBrokenFiles, STALE_CHUNK_RELOAD_KEY, STALE_CHUNK_RELOAD_GUARD_MS
} from '../utils/staleChunk.ts';

const noRepair = async () => undefined;

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
  const mod = await loadOrReload(async () => ({ default: 'ok' }), { storage: memoryStorage(), repair: noRepair, reload: () => reloads++, now: () => 1000 });
  assert.deepEqual(mod, { default: 'ok' });
  assert.equal(reloads, 0);
});

test('an old build whose file is gone reloads the page once and waits for it', async () => {
  let reloads = 0;
  const storage = memoryStorage();
  const pending = loadOrReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), {
    storage, repair: noRepair, reload: () => reloads++, now: () => 50_000
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
    loadOrReload(() => Promise.reject(new Error('offline')), { storage, repair: noRepair, reload: () => reloads++, now: () => 50_000 + STALE_CHUNK_RELOAD_GUARD_MS - 1 }),
    /offline/
  );
  assert.equal(reloads, 0);
});

test('a later deploy reloads again', async () => {
  let reloads = 0;
  const storage = memoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, '50000');
  const pending = loadOrReload(() => Promise.reject(new Error('gone')), { storage, repair: noRepair, reload: () => reloads++, now: () => 50_000 + STALE_CHUNK_RELOAD_GUARD_MS });
  assert.equal(await settlesWithin(pending), false);
  assert.equal(reloads, 1);
});

test('without storage (blocked site data) the error is shown: a loop could not be stopped', async () => {
  let reloads = 0;
  await assert.rejects(loadOrReload(() => Promise.reject(new Error('gone')), { storage: null, repair: noRepair, reload: () => reloads++, now: () => 1 }), /gone/);
  assert.equal(reloads, 0);
});

test('the files are checked before the page reloads, and the reload waits for that', async () => {
  const steps: string[] = [];
  const failure = new TypeError('error loading dynamically imported module: https://ccp.example/assets/SubmitEventPage-BdWYBPer.js');
  let finishRepair = () => undefined as void;
  const pending = loadOrReload(() => Promise.reject(failure), {
    storage: memoryStorage(),
    repair: (err) => {
      steps.push(err === failure ? 'repair' : 'repair (wrong error)');
      return new Promise<void>((resolve) => { finishRepair = resolve; });
    },
    reload: () => steps.push('reload'),
    now: () => 50_000
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(steps, ['repair']);
  finishRepair();
  assert.equal(await settlesWithin(pending), false);
  assert.deepEqual(steps, ['repair', 'reload']);
});

test('a file that did not load is told apart from other errors, in every browser', () => {
  assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js')));
  assert.ok(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/assets/a.js')));
  assert.ok(isChunkLoadError(new TypeError('Importing a module script failed.')));
  assert.ok(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css')));
  assert.ok(!isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'title')")));
  assert.ok(!isChunkLoadError('dynamically imported module'));
});

test('the files to check: the site’s built scripts and styles the page asked for, and the one the error names', () => {
  const origin = 'https://ccp.example';
  const urls = builtFileUrls(
    new TypeError('Failed to fetch dynamically imported module: https://ccp.example/assets/SubmitEventPage-BdWYBPer.js.'),
    [
      'https://ccp.example/assets/index-AbC123.js',
      'https://ccp.example/assets/index-AbC123.js',
      'https://ccp.example/assets/index-Xy.css',
      'https://ccp.example/assets/ccp-logo-v2.png',
      'https://ccp.example/api/calendar',
      'https://e2e.supabase.co/rest/v1/events',
      'https://other.example/assets/evil.js'
    ],
    origin
  );
  assert.deepEqual(urls, [
    'https://ccp.example/assets/SubmitEventPage-BdWYBPer.js',
    'https://ccp.example/assets/index-AbC123.js',
    'https://ccp.example/assets/index-Xy.css'
  ]);
});

test('only a file the browser holds as a page (or failed) is downloaded again, past the cache', async () => {
  const calls: string[] = [];
  const kept: Record<string, Response | Error> = {
    '/assets/good.js': new Response('export{}', { headers: { 'content-type': 'application/javascript' } }),
    '/assets/page.js': new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    '/assets/missing.js': new Response('', { status: 404 }),
    '/assets/offline.js': new TypeError('NetworkError')
  };
  const fetchFile = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${url}${init?.cache ? ` (${init.cache})` : ''}`);
    if (init?.cache === 'reload') return new Response('export{}', { headers: { 'content-type': 'application/javascript' } });
    const answer = kept[url];
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  await refreshBrokenFiles(Object.keys(kept), fetchFile);
  assert.deepEqual(calls.filter((c) => c.endsWith('(reload)')).sort(), ['/assets/missing.js (reload)', '/assets/page.js (reload)']);
});
