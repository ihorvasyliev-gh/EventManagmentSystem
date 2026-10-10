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

/** Sends one email; false when email isn't set up or the provider refused it (never throws) */
export const sendEmail = async (env: EmailEnv, message: EmailMessage): Promise<boolean> => {
  const to = [...new Set(message.to.map((a) => a.trim().toLowerCase()).filter((a) => EMAIL_RE.test(a)))];
  if (!emailConfigured(env) || to.length === 0) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to,
        subject: message.subject,
        text: message.text,
        ...(message.replyTo && EMAIL_RE.test(message.replyTo) ? { reply_to: message.replyTo } : {})
      })
    });
    if (!res.ok) console.error('Email not sent:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Email not sent:', err);
    return false;
  }
};
