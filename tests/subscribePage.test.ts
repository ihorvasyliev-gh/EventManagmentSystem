import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, withSubscribeMeta, SUBSCRIBE_TITLE } from '../functions/subscribe.ts';

const HTML = '<html><head><meta name="description" content="CCP Event Calendar - Manage and view community events" />\n<title>CCP Event Calendar</title></head><body></body></html>';

test('the subscribe page gets its own title and link preview', async () => {
  const out = withSubscribeMeta(HTML, 'https://cal.test');
  assert.match(out, new RegExp(`<title>${SUBSCRIBE_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
  assert.match(out, /<meta property="og:url" content="https:\/\/cal\.test\/subscribe" \/>/);
  assert.match(out, /name="description" content="Subscribe to Cork City Partnership/);
  assert.doesNotMatch(out, /Manage and view/);

  const res = await onRequestGet({
    request: new Request('https://cal.test/subscribe'),
    next: async () => new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '10' } })
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /og:title/);
  assert.equal(res.headers.get('Content-Length'), null);
});

test('anything other than the page passes through untouched', async () => {
  const notFound = new Response('nope', { status: 404 });
  assert.equal(await onRequestGet({ request: new Request('https://cal.test/subscribe'), next: async () => notFound }), notFound);
});
