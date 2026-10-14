-- ============================================
-- Migration 016: row-level security checked once per query, not once per row
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, before or after deploying
-- (nothing in the app depends on it). Safe to run more than once.
--
--  1. The policies call is_admin() and auth.uid() inside a sub-select, so Postgres works them
--     out once per query instead of for every row it looks at (Supabase's Performance Advisor
--     flags the plain calls as "auth_rls_initplan"). Who can do what doesn't change.
--  2. Indexes for "is this file still used?", which runs whenever an event, a flyer or a
--     declined submission is deleted.
-- ============================================

-- ---------- 1. Policies ----------
ALTER POLICY "Signed-in users see published events, admins see all" ON public.events
  USING (status = 'published' OR creator_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
ALTER POLICY "Admins create events" ON public.events
  WITH CHECK ((SELECT public.is_admin()));
ALTER POLICY "Admins update events" ON public.events
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
ALTER POLICY "Admins delete events" ON public.events
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins add attachments" ON public.event_attachments
  WITH CHECK ((SELECT public.is_admin()));
ALTER POLICY "Admins delete attachments" ON public.event_attachments
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins write history" ON public.event_history
  WITH CHECK ((SELECT public.is_admin()) AND user_id = (SELECT auth.uid()));

ALTER POLICY "Admins delete dates" ON public.recurrence_exceptions
  WITH CHECK ((SELECT public.is_admin()));
ALTER POLICY "Admins restore dates" ON public.recurrence_exceptions
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins add categories" ON public.event_categories
  WITH CHECK ((SELECT public.is_admin()));
ALTER POLICY "Admins delete categories" ON public.event_categories
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins read error reports" ON public.client_errors
  USING ((SELECT public.is_admin()));

-- ---------- 2. Indexes ----------
CREATE INDEX IF NOT EXISTS idx_events_poster_url ON public.events(poster_url) WHERE poster_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_url ON public.event_attachments(url);
