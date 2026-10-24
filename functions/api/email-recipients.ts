/**
 * Cloudflare Pages Function — who the digest and reminder emails go to (admins only)
 *   GET /api/email-recipients   →   { recipients: { digest, reminder }, updatedAt, updatedBy }
 *   PUT /api/email-recipients   { recipients: { digest: { to, cc, bcc }, reminder: { to, cc, bcc } } }
 *
 * The Email and Reminder buttons open a new email with these filled in. Until an admin saves
 * them, the defaults in constants/digestRecipients.ts.
 */
import { json, fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, type Caller, type SupabaseEnv } from '../../server/supabase.ts';
import type { IssueBucket } from '../../server/digestIssues.ts';
import { readRecipients, writeRecipients } from '../../server/emailRecipients.ts';
import { parseRecipientSettings } from '../../utils/emailRecipients.ts';

interface Env extends SupabaseEnv {
  BUCKET?: IssueBucket;
}

interface Context {
  request: Request;
  env: Env;
}

/** The bucket and the calling admin, or the response refusing the request */
const admin = async ({ request, env }: Context): Promise<{ bucket: IssueBucket; caller: Caller } | Response> => {
  if (!env.BUCKET) return fail("R2 Bucket binding 'BUCKET' not found.", 500);
  const cfg = supabaseConfig(env);
  if (!cfg) return fail('Email recipients are not set up on the server (missing Supabase keys).', 500);
  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can see and change who the emails go to.', 403);
  return { bucket: env.BUCKET, caller };
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestGet = async (context: Context): Promise<Response> => {
  const ok = await admin(context);
  if (ok instanceof Response) return ok;
  try {
    return json(await readRecipients(ok.bucket));
  } catch (err) {
    console.error('Reading the email recipients failed:', err);
    return fail('The email recipients could not be loaded.', 502);
  }
};

export const onRequestPut = async (context: Context): Promise<Response> => {
  const ok = await admin(context);
  if (ok instanceof Response) return ok;
  const body = await readJson<{ recipients?: unknown }>(context.request);
  const recipients = parseRecipientSettings(body?.recipients);
  if (!recipients) return fail('Each email needs at least one valid address (at most 50 in each of To, CC and BCC).', 400);
  const stored = { recipients, updatedAt: new Date().toISOString(), updatedBy: ok.caller.fullName };
  try {
    await writeRecipients(ok.bucket, stored);
  } catch (err) {
    console.error('Saving the email recipients failed:', err);
    return fail('The email recipients could not be saved. Please try again.', 502);
  }
  return json(stored);
};
