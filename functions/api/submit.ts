/**
 * Cloudflare Pages Function — the public /submit form
 * URL: POST /api/submit   multipart: event (JSON), poster (image, optional), turnstileToken
 *
 * Anyone can submit (no account needed): the event is saved as a draft for review. Signed-in
 * admins can publish straight away. The flyer and the event are saved in one request, so an
 * event never arrives without the flyer that was sent with it.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and the R2 binding BUCKET. Optional: TURNSTILE_SECRET_KEY
 * (bot check) and the email settings in server/email.ts (tell admins about new submissions).
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type SupabaseEnv } from '../../server/supabase.ts';
import { verifyTurnstile, type TurnstileEnv } from '../../server/turnstile.ts';
import { type EmailEnv, sendEmail, appUrl } from '../../server/email.ts';
import { type FileBucket, IMAGE_TYPES, MAX_UPLOAD_BYTES, storeFile, fileKeyFromUrl } from '../../server/files.ts';
import { checkSubmission, type SubmissionInput } from '../../server/submission.ts';
import { newSubmissionEmail } from '../../server/notifications.ts';

interface Env extends SupabaseEnv, TurnstileEnv, EmailEnv {
  BUCKET?: FileBucket;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Admins to tell about a new submission: NOTIFY_ADMIN_EMAILS, or every admin account */
const adminEmails = async (env: Env, cfg: NonNullable<ReturnType<typeof supabaseConfig>>): Promise<string[]> => {
  if (env.NOTIFY_ADMIN_EMAILS?.trim()) return env.NOTIFY_ADMIN_EMAILS.split(',').map((a) => a.trim());
  const res = await serviceRest(cfg, 'users?select=email&role=eq.admin');
  return res.ok ? ((await res.json()) as Array<{ email: string }>).map((u) => u.email) : [];
};

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('Submissions are not set up on the server (missing Supabase keys).', 500);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 256 * 1024) return fail('The flyer is too large (max 15 MB).', 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Invalid request.', 400);
  }

  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) {
    const token = form.get('turnstileToken');
    const human = await verifyTurnstile(env, typeof token === 'string' ? token : null, request.headers.get('CF-Connecting-IP'));
    if (!human) return fail('We couldn’t confirm the form was sent by a person. Please complete the check above the Send button and try again.', 403);
  }

  let input: SubmissionInput & { publish?: unknown; poster_url?: unknown };
  try {
    input = JSON.parse(String(form.get('event') ?? ''));
  } catch {
    return fail('Invalid request.', 400);
  }
  const checked = checkSubmission(input);
  if ('error' in checked) return fail(checked.error, 400);
  const publish = caller?.role === 'admin' && input.publish === true;

  let posterUrl: string | null = null;
  // Admins duplicating an event keep its poster (one already stored here, or an older https one)
  if (caller?.role === 'admin' && typeof input.poster_url === 'string' && input.poster_url.length <= 500 &&
      (fileKeyFromUrl(input.poster_url) || input.poster_url.startsWith('https://'))) {
    posterUrl = input.poster_url;
  }
  const poster = form.get('poster');
  if (poster && typeof poster !== 'string') {
    if (!env.BUCKET) return fail('Flyer uploads are not set up on the server.', 500);
    if (poster.size > MAX_UPLOAD_BYTES) return fail('The flyer is too large (max 15 MB).', 413);
    const type = (poster.type || '').toLowerCase();
    if (!IMAGE_TYPES.has(type)) return fail('The flyer must be an image (PNG, JPG, GIF or WEBP) or a PDF.', 415);
    try {
      posterUrl = (await storeFile(env.BUCKET, poster, type)).url;
    } catch (err) {
      console.error('Flyer upload failed:', err);
      return fail('The flyer could not be uploaded. Please try again.', 502);
    }
  }

  const row = {
    ...checked.row,
    poster_url: posterUrl,
    status: publish ? 'published' : 'draft',
    creator_id: caller?.id ?? null,
    tags: [publish ? 'admin-created' : 'staff-submission']
  };
  const res = await serviceRest(cfg, 'events?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    console.error('Saving a submission failed:', res.status, await res.text());
    const key = poster && typeof poster !== 'string' ? fileKeyFromUrl(posterUrl) : null;
    if (key && env.BUCKET) await env.BUCKET.delete(key).catch(() => undefined);
    return fail('The event could not be saved. Please try again.', 502);
  }
  const [saved] = (await res.json()) as Array<{ id: string }>;

  if (!publish) {
    const notify = adminEmails(env, cfg).then((to) => {
      const email = newSubmissionEmail(checked.row, appUrl(env, request));
      return sendEmail(env, { to, ...email, replyTo: checked.row.submitter_email });
    });
    // Called on the context (not destructured): the runtime needs it bound
    if (context.waitUntil) context.waitUntil(notify);
    else await notify;
  }

  return json({ id: saved?.id, status: row.status, posterUrl }, 201);
};
