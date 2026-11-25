/**
 * Request limits per network, counted in Supabase (hit_rate_limit, migration 014). The public
 * form is open to anyone with the link, so without a limit a script could fill the inbox, R2
 * and the admins' mailboxes. Networks are stored only as a hash.
 */
import { type SupabaseConfig, serviceRest } from './supabase.ts';

export interface RateLimit {
  /** Keeps the counts of different limits apart */
  name: string;
  max: number;
  windowSeconds: number;
}

/**
 * Submissions per network. Staff in one office share an address, so it allows a busy
 * submission morning; a script is stopped after a few dozen.
 */
export const SUBMIT_LIMIT: RateLimit = { name: 'submit', max: 30, windowSeconds: 15 * 60 };

/** Browser error reports per network */
export const CLIENT_ERROR_LIMIT: RateLimit = { name: 'client_error', max: 20, windowSeconds: 15 * 60 };

export const hashIp = async (ip: string, secret: string): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
  return Array.from(new Uint8Array(sig).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Counts one request from this network; false once it has used up the limit. Any failure
 * (e.g. migration 014 not run yet) lets the request through: the limit must never stop the
 * form from working.
 */
export const withinRateLimit = async (cfg: SupabaseConfig, limit: RateLimit, ip: string | null): Promise<boolean> => {
  try {
    const secret = cfg.serviceKey || cfg.anonKey;
    const res = await serviceRest(cfg, 'rpc/hit_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_bucket: `${limit.name}:${await hashIp(ip || 'unknown', secret)}`,
        p_window_seconds: limit.windowSeconds,
        p_max: limit.max
      })
    });
    if (!res.ok) {
      console.error('Rate limit not checked (has migration 014 been run?):', res.status, await res.text());
      return true;
    }
    return (await res.json()) !== false;
  } catch (err) {
    console.error('Rate limit not checked:', err);
    return true;
  }
};
