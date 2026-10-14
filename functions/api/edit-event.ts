/**
 * Cloudflare Pages Function — saving changes to an event (the event form's edit mode)
 * URL: POST /api/edit-event   multipart: event (JSON), poster (image, optional)
 *
 * `event` holds the /submit form's fields (checked the same way, server/submission.ts) plus:
 *   id               the event
 *   base_updated_at  when the version the form was opened with was saved
 *   keep_poster      true: keep the stored flyer (when no new one is sent); false removes it
 *   status           admins only: 'draft' or 'published'
 *
 * Admins may change any event. Signed-in staff may change their own (utils/eventOwnership.ts):
 * the ones they sent in while signed in, or that name their email as the first contact; for
 * them the status stays as it is, so a pending event stays pending and a published one stays
 * published. Creator, tags and attachments are never changed here. What changed is written to
 * the event's history under the editor's name: admins see it in the change log. If someone saved
 * the event after the form was opened, nothing is written (409) and their version is returned.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY, and the R2 binding BUCKET for a new flyer.
 */
import { json, fail, bearerToken } from '../../server/http.ts';
import { supabaseConfig, getCaller, serviceRest, type SupabaseEnv } from '../../server/supabase.ts';
import { type FileBucket, MAX_UPLOAD_BYTES, storeFlyer, fileKeyFromUrl, deleteUnreferencedFiles } from '../../server/files.ts';
import { checkSubmission, type SubmissionInput } from '../../server/submission.ts';
import { ownsEvent } from '../../utils/eventOwnership.ts';
import { describeChanges, type ChangeSource } from '../../utils/eventChanges.ts';
import { isPatternType } from '../../utils/repeat.ts';

interface Env extends SupabaseEnv {
  BUCKET?: FileBucket;
}

interface Context {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredEvent = ChangeSource & {
  id: string;
  creator_id: string | null;
  updated_at: string | null;
};

const CONFLICT = 'Someone else changed this event while you were editing it, so your changes were not saved yet.';

// Typed by hand (not PagesFunction) so the app's type check and tests can import it
export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const cfg = supabaseConfig(env);
  if (!cfg?.serviceKey) return fail('Editing events is not set up on the server (missing Supabase keys).', 500);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 256 * 1024) return fail('The flyer is too large (max 15 MB).', 413);

  const caller = await getCaller(cfg, bearerToken(request));
  if (!caller) return fail('Your session has expired. Please sign in again.', 401);

  let form: FormData;
  let input: SubmissionInput & { id?: unknown; base_updated_at?: unknown; keep_poster?: unknown; status?: unknown };
  try {
    form = await request.formData();
    input = JSON.parse(String(form.get('event') ?? ''));
  } catch {
    return fail('Invalid request.', 400);
  }
  const id = typeof input.id === 'string' && UUID_RE.test(input.id) ? input.id : null;
  if (!id) return fail('Invalid request.', 400);

  const found = await serviceRest(cfg, `events?id=eq.${id}&select=*`);
  if (!found.ok) {
    console.error('Reading the event failed:', found.status, await found.text());
    return fail('The event could not be loaded. Please try again.', 502);
  }
  const [stored] = (await found.json()) as StoredEvent[];
  if (!stored) return fail('This event no longer exists.', 404);
  if (caller.role !== 'admin' && !ownsEvent({ creatorId: stored.creator_id, submitterEmail: stored.submitter_email }, caller)) {
    return fail('You can only change events you sent in. Please email the calendar’s admins about this one.', 403);
  }

  // An event saved without a contact (older ones admins made) may stay without one
  const checked = checkSubmission(input, { contactOptional: !stored.submitter_name?.trim() && !stored.submitter_email?.trim() });
  if ('error' in checked) return fail(checked.error, 400);

  // Saved since the form was opened (by an admin, or in another tab)
  const base = typeof input.base_updated_at === 'string' ? new Date(input.base_updated_at).getTime() : NaN;
  const savedAt = stored.updated_at ? new Date(stored.updated_at).getTime() : NaN;
  if (!isNaN(base) && !isNaN(savedAt) && base !== savedAt) return json({ error: CONFLICT, event: stored }, 409);

  let posterUrl = input.keep_poster === true ? stored.poster_url ?? null : null;
  let newPoster: string | null = null;
  const poster = form.get('poster');
  if (poster && typeof poster !== 'string') {
    const result = await storeFlyer(env.BUCKET, poster);
    if ('error' in result) return fail(result.error, result.status);
    posterUrl = newPoster = result.url;
  }
  const discardNewPoster = async () => {
    const key = fileKeyFromUrl(newPoster);
    if (key && env.BUCKET) await env.BUCKET.delete(key).catch(() => undefined);
  };

  // Only admins publish or unpublish
  const status = caller.role === 'admin' && (input.status === 'draft' || input.status === 'published') ? { status: input.status } : {};
  const update = { ...checked.row, ...status, poster_url: posterUrl };
  const changes = describeChanges(stored, { ...stored, ...update });
  if (Object.keys(changes).length === 0) return json({ event: stored, changed: false, exceptionsCleared: false });

  // Only if nobody saved it between the check above and this write
  const guard = stored.updated_at ? `&updated_at=eq.${encodeURIComponent(stored.updated_at)}` : '';
  const res = await serviceRest(cfg, `events?id=eq.${id}${guard}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(update)
  });
  if (!res.ok) {
    console.error('Saving an edit failed:', res.status, await res.text());
    await discardNewPoster();
    return fail('The changes could not be saved. Please try again.', 502);
  }
  let [saved] = (await res.json()) as StoredEvent[];
  if (!saved) {
    await discardNewPoster();
    const current = await serviceRest(cfg, `events?id=eq.${id}&select=*`);
    const [latest] = current.ok ? ((await current.json()) as StoredEvent[]) : [];
    return json({ error: CONFLICT, event: latest ?? null }, 409);
  }

  // Days deleted from the series earlier belong to the old dates: hand-picked dates were read
  // without them (the list is now complete), and other dates must not lose a day by chance.
  // Only a series that keeps repeating the same way keeps them.
  const keepsExceptions = isPatternType(update.recurrence_type) && update.recurrence_type === stored.recurrence_type;
  let exceptionsCleared = false;
  if (!keepsExceptions) {
    const cleared = await serviceRest(cfg, `recurrence_exceptions?event_id=eq.${id}&select=id`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' }
    });
    if (cleared.ok) {
      exceptionsCleared = true;
      // Removing deleted dates touches the event (so open calendars hear of it): the saved
      // version is the one after that, or the next edit would look like someone else's
      if (((await cleared.json()) as unknown[]).length > 0) {
        const fresh = await serviceRest(cfg, `events?id=eq.${id}&select=*`);
        if (fresh.ok) saved = ((await fresh.json()) as StoredEvent[])[0] ?? saved;
      }
    } else {
      console.error('Clearing deleted dates failed:', cleared.status, await cleared.text());
    }
  }

  const logged = await serviceRest(cfg, 'event_history', {
    method: 'POST',
    body: JSON.stringify({ event_id: id, user_id: caller.id, user_name: caller.fullName, action: 'updated', changes })
  });
  // The event is saved; only its history line is missing
  if (!logged.ok) console.error('Writing the history failed:', logged.status, await logged.text());

  // A replaced or removed flyer goes, unless another event still uses it
  if (stored.poster_url && stored.poster_url !== posterUrl && env.BUCKET) {
    const cleanup = deleteUnreferencedFiles(env.BUCKET, cfg, [stored.poster_url]).catch((err) => {
      console.error('Removing the old flyer failed:', err);
      return [];
    });
    if (context.waitUntil) context.waitUntil(cleanup);
    else await cleanup;
  }

  return json({ event: saved, changed: true, exceptionsCleared });
};
