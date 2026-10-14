-- ============================================
-- Migration 015: deleted dates reach every open calendar, events only through the server
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, before or after deploying.
-- Safe to run more than once.
--
--  1. Deleting (or restoring) one date of a repeating event now reaches the other open
--     calendars straight away. Only the events table sends live updates, and a deleted date is
--     a row in recurrence_exceptions, so other screens showed it until they were refreshed.
--     The event's updated_at is now touched with it, which sends the update.
--  2. Staff can no longer insert events straight through the API. Everyone sends events through
--     /api/submit, which checks them; the old policy also let staff write any poster link,
--     tag or length the form would refuse.
--  3. Poster and attachment links must be a path on this site (/api/file/…) or an http(s)
--     address: the app opens them, so a "javascript:" link must never get in. Existing rows
--     aren't checked; to see any that wouldn't pass:
--       SELECT id, poster_url FROM public.events WHERE poster_url !~* '^(/|https?://)';
--       SELECT id, url FROM public.event_attachments WHERE url !~* '^(/|https?://)';
-- ============================================

-- ---------- 1. A deleted or restored date counts as a change to its event ----------
CREATE OR REPLACE FUNCTION public.touch_events_of_exceptions()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- changed_rows: the dates added, or removed (rows removed along with their event, on delete
  -- cascade, find no event left to touch)
  UPDATE public.events SET updated_at = NOW() WHERE id IN (SELECT DISTINCT event_id FROM changed_rows);
  RETURN NULL;
END;
$$;

-- Once per statement: clearing a series' dates sends one update, not one per date
DROP TRIGGER IF EXISTS on_recurrence_exceptions_added ON public.recurrence_exceptions;
CREATE TRIGGER on_recurrence_exceptions_added
  AFTER INSERT ON public.recurrence_exceptions
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.touch_events_of_exceptions();

DROP TRIGGER IF EXISTS on_recurrence_exceptions_removed ON public.recurrence_exceptions;
CREATE TRIGGER on_recurrence_exceptions_removed
  AFTER DELETE ON public.recurrence_exceptions
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.touch_events_of_exceptions();

-- ---------- 2. Only admins insert events directly ----------
DROP POLICY IF EXISTS "Admins create events, staff create drafts" ON public.events;
DROP POLICY IF EXISTS "Admins create events" ON public.events;
CREATE POLICY "Admins create events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ---------- 3. Links the app can open safely ----------
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_poster_url_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_poster_url_check CHECK (poster_url IS NULL OR poster_url ~* '^(/|https?://)') NOT VALID;

ALTER TABLE public.event_attachments DROP CONSTRAINT IF EXISTS event_attachments_url_check;
ALTER TABLE public.event_attachments
  ADD CONSTRAINT event_attachments_url_check CHECK (url ~* '^(/|https?://)') NOT VALID;

NOTIFY pgrst, 'reload schema';
