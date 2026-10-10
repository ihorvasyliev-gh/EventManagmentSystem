-- ============================================
-- Migration 012: who can read and write what, password resets, error reports
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, AFTER the app version with
-- /api/submit is deployed (the public form no longer writes to the database itself).
-- Before running it, check that Cloudflare Pages has SUPABASE_SERVICE_ROLE_KEY set:
-- the public form and the calendar feed read and write through it from now on.
-- Safe to run more than once.
--
--  1. Visitors without an account can no longer read anything. Events, history, files,
--     deleted dates and categories are for signed-in staff only; the public form and the
--     subscription feed get what they need from the server.
--  2. The public form no longer inserts events or uploads files directly (/api/submit does).
--  3. Staff can only create drafts. Publishing, editing and deleting events is for admins
--     (before, staff could publish or edit their own events straight through the API).
--  4. Only admins can add categories.
--  5. Comments and RSVPs are switched off: the app no longer has them. Their tables are kept
--     (nobody can reach them); the commented-out lines at the end delete them for good.
--  6. Submitters' emails are no longer copied into tags (submitter_email holds them).
--  7. users.must_change_password: set when an admin creates an account or resets a
--     password; the app then asks the person to choose their own password.
--  8. client_errors: errors from people's browsers, sent by /api/client-error.
--  9. Deleting a user account keeps the events they created and their history entries
--     (before, it deleted all of them).
-- ============================================

-- Admin check used by the policies below (reads users as the owner, so no policy recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

-- The "created" history trigger runs with the owner's rights: pin its search path
ALTER FUNCTION public.create_event_history_entry() SET search_path = public;

-- 7. Password reset flag
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ---------- 1–3. events ----------
DROP POLICY IF EXISTS "Published events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Users can create events" ON public.events;
DROP POLICY IF EXISTS "Users can update own events" ON public.events;
DROP POLICY IF EXISTS "Users can delete own events" ON public.events;
DROP POLICY IF EXISTS "Anyone can submit draft events" ON public.events;
DROP POLICY IF EXISTS "Signed-in users see published events, admins see all" ON public.events;
DROP POLICY IF EXISTS "Admins create events, staff create drafts" ON public.events;
DROP POLICY IF EXISTS "Admins update events" ON public.events;
DROP POLICY IF EXISTS "Admins delete events" ON public.events;

CREATE POLICY "Signed-in users see published events, admins see all"
  ON public.events FOR SELECT TO authenticated
  USING (status = 'published' OR creator_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins create events, staff create drafts"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (status = 'draft' AND creator_id = auth.uid()));

CREATE POLICY "Admins update events"
  ON public.events FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete events"
  ON public.events FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------- event_attachments ----------
DROP POLICY IF EXISTS "Attachments are viewable for published events" ON public.event_attachments;
DROP POLICY IF EXISTS "Users can insert attachments to own events" ON public.event_attachments;
DROP POLICY IF EXISTS "Users can delete attachments from own events" ON public.event_attachments;
DROP POLICY IF EXISTS "Attachments follow their event" ON public.event_attachments;
DROP POLICY IF EXISTS "Admins add attachments" ON public.event_attachments;
DROP POLICY IF EXISTS "Admins delete attachments" ON public.event_attachments;

-- The events policy applies inside the subquery: you see the files of events you can see
CREATE POLICY "Attachments follow their event"
  ON public.event_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
CREATE POLICY "Admins add attachments"
  ON public.event_attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete attachments"
  ON public.event_attachments FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------- event_history ----------
DROP POLICY IF EXISTS "History is viewable for published events" ON public.event_history;
DROP POLICY IF EXISTS "History can be inserted by system" ON public.event_history;
DROP POLICY IF EXISTS "History follows its event" ON public.event_history;
DROP POLICY IF EXISTS "Admins write history" ON public.event_history;

CREATE POLICY "History follows its event"
  ON public.event_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
-- (The "created" entry is written by a trigger, which these policies don't limit)
CREATE POLICY "Admins write history"
  ON public.event_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND user_id = auth.uid());

-- ---------- recurrence_exceptions ----------
DROP POLICY IF EXISTS "Users can view recurrence exceptions" ON public.recurrence_exceptions;
DROP POLICY IF EXISTS "Users can create recurrence exceptions" ON public.recurrence_exceptions;
DROP POLICY IF EXISTS "Users can delete recurrence exceptions" ON public.recurrence_exceptions;
DROP POLICY IF EXISTS "Deleted dates follow their event" ON public.recurrence_exceptions;
DROP POLICY IF EXISTS "Admins delete dates" ON public.recurrence_exceptions;
DROP POLICY IF EXISTS "Admins restore dates" ON public.recurrence_exceptions;

CREATE POLICY "Deleted dates follow their event"
  ON public.recurrence_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
CREATE POLICY "Admins delete dates"
  ON public.recurrence_exceptions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Admins restore dates"
  ON public.recurrence_exceptions FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------- 4. event_categories ----------
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.event_categories;
DROP POLICY IF EXISTS "Authenticated users can create categories" ON public.event_categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.event_categories;
DROP POLICY IF EXISTS "Signed-in users see categories" ON public.event_categories;
DROP POLICY IF EXISTS "Admins add categories" ON public.event_categories;
DROP POLICY IF EXISTS "Admins delete categories" ON public.event_categories;

CREATE POLICY "Signed-in users see categories"
  ON public.event_categories FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Admins add categories"
  ON public.event_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete categories"
  ON public.event_categories FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------- users ----------
-- Profiles are readable by signed-in users ("Users are viewable by authenticated users",
-- from 011); each person updates their own row, and the prevent_role_escalation trigger
-- keeps roles admin-only. Accounts are only created by Supabase Auth (handle_new_user).
DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------- 2. Supabase Storage: the old flyer fallback ----------
-- Flyers go to R2 through the server; nobody uploads to the public bucket any more.
-- Files already there stay readable (older events may still point at them).
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can upload event attachments" ON storage.objects;
  END IF;
END $$;

-- ---------- 5. Comments and RSVPs: no access ----------
DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_comments', 'rsvps'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.get_event_with_details(UUID);

-- ---------- 6. Submitters' emails out of tags ----------
UPDATE public.events e
SET submitter_email = (SELECT substr(t, 7) FROM unnest(e.tags) AS t WHERE t LIKE 'email:%' LIMIT 1)
WHERE e.submitter_email IS NULL
  AND EXISTS (SELECT 1 FROM unnest(e.tags) AS t WHERE t LIKE 'email:%');

UPDATE public.events e
SET tags = ARRAY(SELECT t FROM unnest(e.tags) AS t WHERE t NOT LIKE 'email:%')
WHERE EXISTS (SELECT 1 FROM unnest(e.tags) AS t WHERE t LIKE 'email:%');

-- ---------- 9. Deleting an account keeps its events and history ----------
ALTER TABLE public.events ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_creator_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_history ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.event_history DROP CONSTRAINT IF EXISTS event_history_user_id_fkey;
ALTER TABLE public.event_history
  ADD CONSTRAINT event_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------- 8. Error reports from browsers ----------
CREATE TABLE IF NOT EXISTS public.client_errors (
  id BIGSERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  release TEXT,
  user_agent TEXT,
  user_email TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fingerprint, day)
);
CREATE INDEX IF NOT EXISTS idx_client_errors_day ON public.client_errors(day);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
DROP POLICY IF EXISTS "Admins read error reports" ON public.client_errors;
CREATE POLICY "Admins read error reports"
  ON public.client_errors FOR SELECT TO authenticated
  USING (public.is_admin());

-- One row per error per day (repeats raise the count). Reports older than 90 days are
-- dropped, and once 5,000 are stored new kinds of error are ignored, so a flood of
-- fake reports can't fill the database.
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_fingerprint TEXT, p_message TEXT, p_stack TEXT, p_url TEXT,
  p_release TEXT, p_user_agent TEXT, p_user_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.client_errors WHERE day < CURRENT_DATE - 90;
  IF NOT EXISTS (SELECT 1 FROM public.client_errors WHERE fingerprint = p_fingerprint AND day = CURRENT_DATE)
     AND (SELECT count(*) FROM public.client_errors) >= 5000 THEN
    RETURN;
  END IF;
  INSERT INTO public.client_errors AS c (fingerprint, message, stack, url, release, user_agent, user_email)
  VALUES (p_fingerprint, left(p_message, 500), left(p_stack, 4000), left(p_url, 500),
          left(p_release, 40), left(p_user_agent, 300), p_user_email)
  ON CONFLICT (fingerprint, day) DO UPDATE
    SET count = c.count + 1,
        last_seen = NOW(),
        url = EXCLUDED.url,
        user_email = COALESCE(EXCLUDED.user_email, c.user_email);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Make the API see the changes straight away
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Optional, cannot be undone: delete the old comments and RSVPs for good.
-- DROP TABLE IF EXISTS public.event_comments;
-- DROP TABLE IF EXISTS public.rsvps;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS rsvp_enabled, DROP COLUMN IF EXISTS max_attendees;
-- ============================================
-- Check afterwards:
--   SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
-- ============================================
