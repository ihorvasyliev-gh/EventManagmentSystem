import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, RETRY_DELAYS_MS } from '../utils/networkRetry.ts';

const noWait = async () => undefined;

test('a request that got no answer is sent again, and the second answer is used', async () => {
  let calls = 0;
  const waits: number[] = [];
  const res = await fetchWithRetry(async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return new Response('ok');
  }, RETRY_DELAYS_MS, async (ms) => { waits.push(ms); });
  assert.equal(await res.text(), 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [RETRY_DELAYS_MS[0]]);
});

test('an answer from the server, even an error, is never retried', async () => {
  let calls = 0;
  const res = await fetchWithRetry(async () => { calls++; return new Response('no', { status: 500 }); }, RETRY_DELAYS_MS, noWait);
  assert.equal(res.status, 500);
  assert.equal(calls, 1);
});

test('it gives up after the last attempt with the network error', async () => {
  let calls = 0;
  await assert.rejects(fetchWithRetry(async () => { calls++; throw new TypeError('Failed to fetch'); }, RETRY_DELAYS_MS, noWait), TypeError);
  assert.equal(calls, RETRY_DELAYS_MS.length + 1);
});
