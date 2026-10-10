/**
 * Cloudflare Pages Function — admins approve or decline submissions (admins only)
 * URL: POST /api/submissions   { action: 'approve' | 'decline', ids: string[], reason?: string }
 *
 * approve: publishes the events and emails each submitter that their event is on the calendar
 *          (also used after "Save & approve", when the event is already published).
 * decline: emails each submitter (with the reason, if given), deletes the submissions and
 *          their flyers from R2.
 * Emails are optional (see server/email.ts); the action works without them.
 */
import { json, fail, bearerToken, readJson } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type SupabaseEnv } from '../../server/supabase.ts';
import { type EmailEnv, sendEmail, appUrl } from '../../server/email.ts';
import { type FileBucket, deleteUnreferencedFiles } from '../../server/files.ts';
import { approvedEmail, declinedEmail, type NotifiedEvent } from '../../server/notifications.ts';

interface Env extends SupabaseEnv, EmailEnv {
  BUCKET?: FileBucket;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const MAX_REASON = 1000;

type EventRow = NotifiedEvent & { id: string; status: string; poster_url: string | null; tags: string[] | null };

const isSubmission = (row: EventRow): boolean => !(row.tags ?? []).includes('admin-created');

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('Submissions are not set up on the server (missing Supabase keys).', 500);

  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);
  if (caller.role !== 'admin') return fail('Only admins can review submissions.', 403);

  const body = await readJson<{ action?: unknown; ids?: unknown; reason?: unknown }>(request);
  const ids = Array.isArray(body?.ids) ? [...new Set(body!.ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)))] : [];
  if (ids.length === 0 || ids.length > MAX_IDS) return fail('Invalid request.', 400);
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON) : '';
  const idFilter = `id=in.(${ids.join(',')})`;
  const columns = 'id,title,date,location,status,tags,poster_url,recurrence_custom_dates,submitter_name,submitter_email';

  const notify = (emails: Promise<unknown>) => {
    if (context.waitUntil) context.waitUntil(emails);
    else return emails;
  };

  if (body?.action === 'approve') {
    const res = await serviceRest(cfg, `events?${idFilter}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'published', updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      console.error('Approving failed:', res.status, await res.text());
      return fail('The submissions could not be approved. Please try again.', 502);
    }
    const rows = (await res.json()) as EventRow[];
    const site = appUrl(env, request);
    await notify(Promise.all(rows.filter(isSubmission).map((row) =>
      sendEmail(env, { to: [row.submitter_email ?? ''], ...approvedEmail(row, site), replyTo: caller.email })
    )));
    return json({ events: rows });
  }

  if (body?.action === 'decline') {
    // Only drafts can be declined: a published event is deleted from the event itself
    const found = await serviceRest(cfg, `events?${idFilter}&status=eq.draft&select=${columns}`);
    if (!found.ok) return fail('The submissions could not be found. Please refresh and try again.', 502);
    const rows = (await found.json()) as EventRow[];
    if (rows.length === 0) return json({ declined: [] });

    const attachments = await serviceRest(cfg, `event_attachments?event_id=in.(${rows.map((r) => r.id).join(',')})&select=url`);
    const attachmentUrls = attachments.ok ? ((await attachments.json()) as Array<{ url: string }>).map((a) => a.url) : [];

    const del = await serviceRest(cfg, `events?id=in.(${rows.map((r) => r.id).join(',')})&status=eq.draft`, { method: 'DELETE' });
    if (!del.ok) {
      console.error('Declining failed:', del.status, await del.text());
      return fail('The submissions could not be declined. Please try again.', 502);
    }
    if (env.BUCKET) {
      await deleteUnreferencedFiles(env.BUCKET, cfg, [...rows.map((r) => r.poster_url), ...attachmentUrls])
        .catch((err) => console.error('Removing declined flyers failed:', err));
    }
    await notify(Promise.all(rows.filter(isSubmission).map((row) =>
      sendEmail(env, { to: [row.submitter_email ?? ''], ...declinedEmail(row, reason), replyTo: caller.email })
    )));
    return json({ declined: rows.map((r) => r.id) });
  }

  return fail('Invalid request.', 400);
};
