/**
 * Cloudflare Turnstile check for the public submission form, optional.
 *
 * TURNSTILE_SECRET_KEY (encrypted secret) turns it on; the app needs the matching
 * VITE_TURNSTILE_SITE_KEY at build time. Without the secret every request passes.
 */

export interface TurnstileEnv {
  TURNSTILE_SECRET_KEY?: string;
}

export const verifyTurnstile = async (env: TurnstileEnv, token: string | null, ip?: string | null): Promise<boolean> => {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const outcome = (await res.json()) as { success?: boolean };
    return outcome.success === true;
  } catch {
    return false;
  }
};
