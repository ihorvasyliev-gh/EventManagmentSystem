/**
 * Notification emails through Resend (https://resend.com), optional.
 *
 * Environment variables:
 *   RESEND_API_KEY       encrypted secret; without it no email is sent and nothing fails
 *   NOTIFY_FROM          sender, e.g. "CCP Calendar <calendar@partnershipcork.ie>" (a domain verified in Resend)
 *   NOTIFY_ADMIN_EMAILS  optional, comma-separated; new submissions go here instead of to every admin
 *   APP_URL              optional, the site address used in links (defaults to the request's origin)
 */

export interface EmailEnv {
  RESEND_API_KEY?: string;
  NOTIFY_FROM?: string;
  NOTIFY_ADMIN_EMAILS?: string;
  APP_URL?: string;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export const emailConfigured = (env: EmailEnv): boolean => !!(env.RESEND_API_KEY && env.NOTIFY_FROM);

export const appUrl = (env: EmailEnv, request: Request): string =>
  (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TIMEOUT_MS = 10_000;
const RESEND_BATCH_MAX = 100;

const buildPayload = (env: EmailEnv, message: EmailMessage) => {
  const to = [...new Set(message.to.map((a) => a.trim().toLowerCase()).filter((a) => EMAIL_RE.test(a)))];
  if (to.length === 0) return null;
  return {
    from: env.NOTIFY_FROM,
    to,
    subject: message.subject,
    text: message.text,
    ...(message.replyTo && EMAIL_RE.test(message.replyTo) ? { reply_to: message.replyTo } : {})
  };
};

/** Sends one email; false when email isn't set up or the provider refused it (never throws) */
export const sendEmail = async (env: EmailEnv, message: EmailMessage): Promise<boolean> => {
  if (!emailConfigured(env)) return false;
  const payload = buildPayload(env, message);
  if (!payload) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS)
    });
    if (!res.ok) console.error('Email not sent:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Email not sent:', err);
    return false;
  }
};

/**
 * Sends one or more emails: uses the single-email endpoint for 1 message (preserving existing
 * behavior) and Resend's batch API for >1 messages (chunked at 100 per request). Never throws.
 */
export const sendEmailBatch = async (env: EmailEnv, messages: EmailMessage[]): Promise<boolean> => {
  if (!emailConfigured(env)) return false;
  const payloads = messages
    .map((m) => buildPayload(env, m))
    .filter((p): p is NonNullable<ReturnType<typeof buildPayload>> => p !== null);
  if (payloads.length === 0) return false;
  if (payloads.length === 1) {
    return sendEmail(env, messages.find((m) => buildPayload(env, m) !== null)!);
  }
  let allOk = true;
  for (let i = 0; i < payloads.length; i += RESEND_BATCH_MAX) {
    const chunk = payloads.slice(i, i + RESEND_BATCH_MAX);
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS)
      });
      if (!res.ok) {
        console.error('Email batch not sent:', res.status, await res.text());
        allOk = false;
      }
    } catch (err) {
      console.error('Email batch not sent:', err);
      allOk = false;
    }
  }
  return allOk;
};
