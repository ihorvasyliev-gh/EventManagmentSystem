/**
 * A request that never got an answer (fetch throws: the connection dropped, a phone changing
 * between Wi-Fi and mobile data, a connection the browser kept open that had gone dead) is
 * tried again after a short wait. Browsers do this themselves for plain GETs but never for
 * uploads, which is how the first "Update digest" of a visit could fail and the second work.
 *
 * Only for requests that are safe to repeat: the server may have done the first one and only
 * its answer was lost. An answer from the server, even an error, is never retried.
 */

/** Waits before the second and third attempts */
export const RETRY_DELAYS_MS = [400, 1200];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const fetchWithRetry = async (
  send: () => Promise<Response>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  pause: (ms: number) => Promise<void> = wait
): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      await pause(delays[attempt]);
    }
  }
};
