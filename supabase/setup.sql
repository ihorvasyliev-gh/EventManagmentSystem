-- ============================================
-- CCP Event Calendar — database for a NEW Supabase project
-- ============================================
-- Supabase Dashboard → SQL Editor → New query → paste this file → Run.
-- This is the whole schema, up to date: a new project needs nothing else.
-- (An existing project instead runs the files in supabase/migrations/ it hasn't run yet.)
-- Safe to run more than once.
--
-- Who can do what:
--   * Nobody without an account can read or write anything. The public /submit form and the
--     calendar feed go through the Cloudflare functions, which use the service-role key.
--   * Staff (every new account) see published events and submit drafts through the /submit
--     form (/api/submit checks them). They change their own events through /api/edit-event,
--     which logs what changed; only admins write events directly.
--   * Nobody changes their row in users from the browser: accounts are managed by the
--     Cloudflare functions (service role) and here in SQL.
--   * Admins see everything, publish, edit and delete. A role is changed only here, in SQL:
--       UPDATE public.users SET role = 'admin' WHERE email = 'name@partnershipcork.ie';
--   * History is written, never changed: the database itself logs every new and deleted event
--     (with who deleted it), and an event's history stays after the event is gone.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Tables
-- ============================================

-- One row per Supabase Auth account (created by the handle_new_user trigger below)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
  -- Set when an admin creates the account or resets the password: the app then asks
  -- the person to choose their own password
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  location TEXT,
  -- A path on this site (/api/file/…) or an http(s) address: the app opens it
  poster_url TEXT CHECK (poster_url IS NULL OR poster_url ~* '^(/|https?://)'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  recurrence_type TEXT DEFAULT 'none' CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly', 'custom')),
  recurrence_interval INTEGER,
  recurrence_end_date TIMESTAMP WITH TIME ZONE,
  recurrence_occurrences INTEGER,
  recurrence_days_of_week INTEGER[],
  recurrence_custom_dates TIMESTAMP WITH TIME ZONE[] DEFAULT NULL,
  recurrence_custom_end_dates TIMESTAMP WITH TIME ZONE[] DEFAULT NULL,
  recurrence_custom_locations TEXT[] DEFAULT NULL,
  submitter_name TEXT,
  submitter_email TEXT,
  -- More contact people besides the submitter: [{"name": "...", "email": "..."}]
  extra_contacts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(extra_contacts) = 'array'),
  -- NULL for submissions sent without an account, or once the creator's account is deleted
  creator_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN public.events.recurrence_custom_dates IS 'Array of specific dates for custom recurrence (recurrence_type = custom). Each timestamp represents a manually picked event occurrence date.';
COMMENT ON COLUMN public.events.recurrence_custom_end_dates IS 'End time of each date in recurrence_custom_dates (same order). NULL means every date uses the event''s own start/end time of day.';
COMMENT ON COLUMN public.events.recurrence_custom_locations IS 'Address of each date in recurrence_custom_dates (same order). NULL means every date is at the event''s own location.';
COMMENT ON COLUMN public.events.extra_contacts IS 'Contact people besides submitter_name / submitter_email, shown after them: [{"name": "...", "email": "..."}].';

CREATE TABLE IF NOT EXISTS public.event_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url ~* '^(/|https?://)'),
  type TEXT NOT NULL CHECK (type IN ('image', 'pdf', 'document', 'other')),
  size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- No foreign key to events: the history of a deleted event stays (who deleted it, too)
CREATE TABLE IF NOT EXISTS public.event_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  -- The event's name when the entry was written (the event may be gone since)
  event_title TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed')),
  changes JSONB,
  -- A deleted event's copy (its row, attachments and deleted dates), to restore it
  snapshot JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Single dates deleted from a repeating event ("Delete only this occurrence")
CREATE TABLE IF NOT EXISTS public.recurrence_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  exception_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, exception_date)
);

-- Errors from people's browsers (written by /api/client-error through log_client_error)
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

-- Requests counted per network and time window (/api/submit's limit, via hit_rate_limit).
-- Networks are stored only as a hash, and only for a day.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- ============================================
-- 2. Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);
CREATE INDEX IF NOT EXISTS idx_events_creator ON public.events(creator_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_event ON public.event_attachments(event_id);
CREATE INDEX IF NOT EXISTS idx_history_event ON public.event_history(event_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON public.event_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON public.event_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_categories_name ON public.event_categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON public.event_categories(created_at);
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_event_id ON public.recurrence_exceptions(event_id);
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_date ON public.recurrence_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_client_errors_day ON public.client_errors(day);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);
-- "Is this file still used?" before a flyer or attachment is deleted from R2
CREATE INDEX IF NOT EXISTS idx_events_poster_url ON public.events(poster_url) WHERE poster_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_url ON public.event_attachments(url);

-- ============================================
-- 3. Functions and triggers
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- "Created" history entry for every new event (also for submissions without an account). An
-- event put back after it was deleted (the same id) is logged as restored, by whoever did it.
CREATE OR REPLACE FUNCTION public.create_event_history_entry()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_history WHERE event_id = NEW.id AND action = 'deleted') THEN
    SELECT full_name INTO current_user_name FROM public.users WHERE id = auth.uid();
    INSERT INTO public.event_history (event_id, user_id, user_name, action, changes)
    VALUES (NEW.id, auth.uid(), COALESCE(current_user_name, 'Unknown'), 'created', '{"restored": true}'::jsonb);
  ELSIF NEW.creator_id IS NOT NULL THEN
    SELECT full_name INTO current_user_name FROM public.users WHERE id = NEW.creator_id;
    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NEW.creator_id, COALESCE(current_user_name, 'Unknown'), 'created');
  ELSE
    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NULL, COALESCE(NEW.submitter_name, 'Staff Submission'), 'created');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_event_created ON public.events;
CREATE TRIGGER on_event_created
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.create_event_history_entry();

-- Each entry names its event and its author as the database knows them, not as sent
CREATE OR REPLACE FUNCTION public.fill_event_history_entry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title TEXT;
  v_name TEXT;
BEGIN
  -- (a deleted event is gone already: its entry brings the name with it)
  SELECT title INTO v_title FROM public.events WHERE id = NEW.event_id;
  NEW.event_title := COALESCE(v_title, NEW.event_title);
  IF NEW.user_id IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.users WHERE id = NEW.user_id;
    NEW.user_name := COALESCE(v_name, NEW.user_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_event_history_insert ON public.event_history;
CREATE TRIGGER on_event_history_insert
  BEFORE INSERT ON public.event_history
  FOR EACH ROW EXECUTE FUNCTION public.fill_event_history_entry();

-- Deleting an event logs who did it and what the event was (written here, so every way of
-- deleting is logged), with a copy of it to restore it from the change log. Written before the
-- row goes, while its attachments and deleted dates are still there to copy.
CREATE OR REPLACE FUNCTION public.log_event_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims JSONB := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers JSONB := NULLIF(current_setting('request.headers', true), '')::jsonb;
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_declined BOOLEAN := false;
  v_tz TEXT := 'Europe/Dublin';
  v_unit TEXT;
  v_when TEXT;
  v_repeat TEXT;
  v_changes JSONB;
  v_snapshot JSONB;
BEGIN
  -- The Cloudflare functions delete with the service role key, naming the admin they act for
  -- (only that key can, so nobody else can put a name here)
  IF v_claims ->> 'role' = 'service_role' THEN
    IF v_user_id IS NULL AND v_headers ->> 'x-acting-user' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_user_id := (v_headers ->> 'x-acting-user')::uuid;
    END IF;
    v_declined := COALESCE(v_headers ->> 'x-delete-reason' = 'declined', false);
  END IF;
  IF v_user_id IS NOT NULL THEN
    -- (no such account: nobody is named)
    SELECT id, full_name INTO v_user_id, v_user_name FROM public.users WHERE id = v_user_id;
  END IF;

  v_when := to_char(OLD.date AT TIME ZONE v_tz, 'Dy FMDD Mon YYYY, HH24:MI')
    || CASE
         WHEN OLD.end_date IS NULL OR OLD.end_date <= OLD.date THEN ''
         WHEN (OLD.end_date AT TIME ZONE v_tz)::date = (OLD.date AT TIME ZONE v_tz)::date
           THEN '–' || to_char(OLD.end_date AT TIME ZONE v_tz, 'HH24:MI')
         ELSE ' – ' || to_char(OLD.end_date AT TIME ZONE v_tz, 'Dy FMDD Mon YYYY, HH24:MI')
       END;
  v_unit := CASE OLD.recurrence_type WHEN 'daily' THEN 'day' WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' WHEN 'yearly' THEN 'year' END;
  v_repeat := CASE
    WHEN OLD.recurrence_type = 'custom' THEN
      'On ' || COALESCE(cardinality(OLD.recurrence_custom_dates), 0) || ' picked date'
        || CASE WHEN COALESCE(cardinality(OLD.recurrence_custom_dates), 0) = 1 THEN '' ELSE 's' END
    WHEN v_unit IS NULL THEN NULL
    WHEN COALESCE(OLD.recurrence_interval, 1) > 1 THEN 'Every ' || OLD.recurrence_interval || ' ' || v_unit || 's'
    ELSE 'Every ' || v_unit
  END;

  -- What the event was (besides its name, the entry's event_title), as the change log shows a
  -- change: each value struck out ({"old": …})
  SELECT jsonb_object_agg(key, jsonb_build_object('old', value)) INTO v_changes
  FROM jsonb_each(jsonb_strip_nulls(jsonb_build_object(
    'category', NULLIF(OLD.category, ''),
    'status', CASE OLD.status WHEN 'draft' THEN 'Pending review' WHEN 'published' THEN 'Published' ELSE OLD.status END,
    'when', v_when,
    'repeat', v_repeat,
    'location', NULLIF(trim(OLD.location), ''),
    'contacts', NULLIF(concat_ws(' ', NULLIF(trim(OLD.submitter_name), ''), '(' || NULLIF(lower(trim(OLD.submitter_email)), '') || ')'), '')
  )));
  IF v_declined THEN
    v_changes := v_changes || '{"declined": true}'::jsonb;
  END IF;

  v_snapshot := jsonb_build_object(
    'event', to_jsonb(OLD),
    'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.event_attachments a WHERE a.event_id = OLD.id), '[]'::jsonb),
    'deleted_dates', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.recurrence_exceptions x WHERE x.event_id = OLD.id), '[]'::jsonb)
  );

  INSERT INTO public.event_history (event_id, event_title, user_id, user_name, action, changes, snapshot)
  VALUES (OLD.id, OLD.title, v_user_id, COALESCE(v_user_name, 'Supabase (not an app account)'), 'deleted', v_changes, v_snapshot);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_event_deleted ON public.events;
CREATE TRIGGER on_event_deleted
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.log_event_deleted();

-- A deleted or restored date of a repeating event counts as a change to the event: only the
-- events table sends live updates, so this is what tells the other open calendars
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

-- Every new account gets the role staff, whatever the sign-up request says
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Only admins change roles (the SQL Editor and the service role, where auth.uid() is NULL, can too)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_user_role_change ON public.users;
CREATE TRIGGER on_user_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- The forced password change (must_change_password) clears itself once the password really
-- changes. An admin's reset changes it too: /api/staff-password sets the flag again after it.
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET must_change_password = false WHERE id = NEW.id AND must_change_password;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_password_changed ON auth.users;
CREATE TRIGGER on_auth_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
  EXECUTE FUNCTION public.clear_must_change_password();

-- Admin check used by the policies (reads users as the owner, so no policy recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

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

-- Counts one request in the current window; true while the bucket is within p_max.
-- Windows older than a day are dropped as it goes.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_bucket TEXT, p_window_seconds INTEGER, p_max INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_hits INTEGER;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 OR p_max IS NULL THEN
    RAISE EXCEPTION 'hit_rate_limit: the window must be 1 second to 1 day, with a limit';
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  INSERT INTO public.rate_limits AS r (bucket, window_start, hits)
  VALUES (left(p_bucket, 200), v_window, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_max;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hit_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================
-- 4. Row-level security
-- ============================================
-- No policy mentions anon, so visitors without an account can't read or write anything.
-- is_admin() and auth.uid() sit in a sub-select: worked out once per query, not per row.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- users: profiles are readable by signed-in users and changed only by the server: anyone
-- editing their own row could clear must_change_password or take someone else's email.
-- Accounts are created by Supabase Auth (handle_new_user).
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON public.users;
CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;

-- events: staff see published events and their own drafts (sent in signed in, or naming their
-- email as the contact); their submissions and changes go through /api/submit and
-- /api/edit-event (service role), so only admins write directly
DROP POLICY IF EXISTS "Signed-in users see published events, admins see all" ON public.events;
CREATE POLICY "Signed-in users see published events, admins see all"
  ON public.events FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR creator_id = (SELECT auth.uid())
    OR lower(submitter_email) = (SELECT lower(auth.jwt() ->> 'email'))
    OR (SELECT public.is_admin())
  );
DROP POLICY IF EXISTS "Admins create events, staff create drafts" ON public.events;
DROP POLICY IF EXISTS "Admins create events" ON public.events;
CREATE POLICY "Admins create events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins update events" ON public.events;
CREATE POLICY "Admins update events"
  ON public.events FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins delete events" ON public.events;
CREATE POLICY "Admins delete events"
  ON public.events FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- The events policy applies inside these subqueries: you see what belongs to events you can see
DROP POLICY IF EXISTS "Attachments follow their event" ON public.event_attachments;
CREATE POLICY "Attachments follow their event"
  ON public.event_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
DROP POLICY IF EXISTS "Admins add attachments" ON public.event_attachments;
CREATE POLICY "Admins add attachments"
  ON public.event_attachments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins delete attachments" ON public.event_attachments;
CREATE POLICY "Admins delete attachments"
  ON public.event_attachments FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- Admins also see the history of deleted events
DROP POLICY IF EXISTS "History follows its event" ON public.event_history;
DROP POLICY IF EXISTS "History follows its event, admins see all" ON public.event_history;
CREATE POLICY "History follows its event, admins see all"
  ON public.event_history FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
-- (The "created" and "deleted" entries are written by triggers, which these policies don't
-- limit; nobody writes a "deleted" one by hand, and nobody changes or deletes history)
DROP POLICY IF EXISTS "Admins write history" ON public.event_history;
CREATE POLICY "Admins write history"
  ON public.event_history FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()) AND user_id = (SELECT auth.uid()) AND action <> 'deleted');
REVOKE UPDATE, DELETE, TRUNCATE ON public.event_history FROM anon, authenticated;

DROP POLICY IF EXISTS "Deleted dates follow their event" ON public.recurrence_exceptions;
CREATE POLICY "Deleted dates follow their event"
  ON public.recurrence_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
DROP POLICY IF EXISTS "Admins delete dates" ON public.recurrence_exceptions;
CREATE POLICY "Admins delete dates"
  ON public.recurrence_exceptions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins restore dates" ON public.recurrence_exceptions;
CREATE POLICY "Admins restore dates"
  ON public.recurrence_exceptions FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Signed-in users see categories" ON public.event_categories;
CREATE POLICY "Signed-in users see categories"
  ON public.event_categories FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Admins add categories" ON public.event_categories;
CREATE POLICY "Admins add categories"
  ON public.event_categories FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins delete categories" ON public.event_categories;
CREATE POLICY "Admins delete categories"
  ON public.event_categories FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE ALL ON public.rate_limits FROM anon, authenticated;

REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
DROP POLICY IF EXISTS "Admins read error reports" ON public.client_errors;
CREATE POLICY "Admins read error reports"
  ON public.client_errors FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================
-- 5. Standard CCP categories
-- ============================================

INSERT INTO public.event_categories (name)
VALUES
  ('Enterprise & Employment'),
  ('Community & Family'),
  ('Education & Training'),
  ('Special Visits & Celebrations'),
  ('Public Information Session'),
  ('Health & Wellbeing'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. Live updates (Supabase Realtime)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

-- Updates and deletes carry the whole row, so open calendars can apply them directly
ALTER TABLE public.events REPLICA IDENTITY FULL;

-- Make the API see the new schema straight away
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Done. Next (see SUPABASE_SETUP.md):
--   1. Authentication → Sign In / Providers → "Allow new users to sign up": OFF
--   2. Create the first account (Authentication → Users → Add user), then make it an admin:
--        UPDATE public.users SET role = 'admin' WHERE email = 'name@partnershipcork.ie';
--   3. Cloudflare Pages: SUPABASE_SERVICE_ROLE_KEY and the other variables in DEPLOY.md
-- ============================================
