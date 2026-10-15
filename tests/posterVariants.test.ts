import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posterVariantUrl, posterVariantKeys, posterOfVariant, variantSize } from '../utils/posterVariants.ts';
import { onRequestGet } from '../functions/api/file/[[key]].ts';

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e-flyer.png';

test('a stored poster is shown from its lighter copy; anything else from where it is', () => {
  assert.equal(posterVariantUrl(`/api/file/${KEY}`, 'screen'), `/api/file/${KEY}.screen.jpg`);
  assert.equal(posterVariantUrl(`/api/file/${KEY}`, 'thumb'), `/api/file/${KEY}.thumb.jpg`);
  // A GIF may move: it has no copies
  const gif = '/api/file/0f8fad5b-d9cb-469f-a165-70867728950e-party.gif';
  assert.equal(posterVariantUrl(gif, 'screen'), gif);
  // Older posters elsewhere, files not uploaded by the app, a copy itself, no poster
  assert.equal(posterVariantUrl('https://x.supabase.co/storage/v1/object/public/p.png', 'thumb'), 'https://x.supabase.co/storage/v1/object/public/p.png');
  assert.equal(posterVariantUrl('/api/file/posters/breakfast.png', 'thumb'), '/api/file/posters/breakfast.png');
  assert.equal(posterVariantUrl(`/api/file/${KEY}.thumb.jpg`, 'screen'), `/api/file/${KEY}.thumb.jpg`);
  assert.equal(posterVariantUrl(null, 'screen'), undefined);
});

test('a poster’s copies are found from it, and it from them', () => {
  assert.deepEqual(posterVariantKeys(KEY), [`${KEY}.screen.jpg`, `${KEY}.thumb.jpg`]);
  assert.deepEqual(posterVariantKeys(`${KEY}.screen.jpg`), []);
  assert.deepEqual(posterVariantKeys('digests/0f0f0f0f-0000-0000-0000-000000000000-CCP.pdf'), []);
  assert.equal(posterOfVariant(`${KEY}.screen.jpg`), KEY);
  assert.equal(posterOfVariant(`${KEY}.thumb.jpg`), KEY);
  assert.equal(posterOfVariant(KEY), null);
  assert.equal(posterOfVariant('meta/x.screen.jpg'), null);
});

test('copies keep the poster’s shape and are never larger than it', () => {
  // An A4 page at 300 DPI
  assert.deepEqual(variantSize(2480, 3508, 1600), { width: 1131, height: 1600 });
  assert.deepEqual(variantSize(4000, 3000, 480), { width: 480, height: 360 });
  assert.deepEqual(variantSize(300, 400, 1600), { width: 300, height: 400 });
});

const bucketWith = (keys: string[]) => ({
  get: async (key: string) =>
    keys.includes(key)
      ? { body: new Blob(['image']).stream(), httpEtag: '"e"', writeHttpMetadata: (h: Headers) => h.set('content-type', 'image/jpeg') }
      : null,
  put: async () => ({}),
  delete: async () => {}
});

const get = (key: string, keys: string[]) =>
  onRequestGet({
    params: { key: key.split('/') },
    env: { BUCKET: bucketWith(keys) },
    request: new Request(`https://app.test/api/file/${key}`)
  });

test('a copy that was never made sends the browser to the poster itself; other missing files are not found', async () => {
  const copy = await get(`${KEY}.screen.jpg`, [`${KEY}.screen.jpg`]);
  assert.equal(copy.status, 200);
  assert.match(copy.headers.get('Cache-Control') ?? '', /immutable/);

  const missing = await get(`${KEY}.screen.jpg`, [KEY]);
  assert.equal(missing.status, 302);
  assert.equal(missing.headers.get('Location'), `/api/file/${KEY}`);
  assert.doesNotMatch(missing.headers.get('Cache-Control') ?? '', /immutable/);

  assert.equal((await get(KEY, [])).status, 404);
});
