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
--   * Staff (every new account) see published events and can submit drafts.
--   * Admins see everything, publish, edit and delete. A role is changed only here, in SQL:
--       UPDATE public.users SET role = 'admin' WHERE email = 'name@partnershipcork.ie';
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
  poster_url TEXT,
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
  -- NULL for submissions sent without an account, or once the creator's account is deleted
  creator_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN public.events.recurrence_custom_dates IS 'Array of specific dates for custom recurrence (recurrence_type = custom). Each timestamp represents a manually picked event occurrence date.';
COMMENT ON COLUMN public.events.recurrence_custom_end_dates IS 'End time of each date in recurrence_custom_dates (same order). NULL means every date uses the event''s own start/end time of day.';
COMMENT ON COLUMN public.events.recurrence_custom_locations IS 'Address of each date in recurrence_custom_dates (same order). NULL means every date is at the event''s own location.';

CREATE TABLE IF NOT EXISTS public.event_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'pdf', 'document', 'other')),
  size BIGINT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.event_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed')),
  changes JSONB,
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

-- "Created" history entry for every new event (also for submissions without an account)
CREATE OR REPLACE FUNCTION public.create_event_history_entry()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  IF NEW.creator_id IS NOT NULL THEN
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

-- ============================================
-- 4. Row-level security
-- ============================================
-- No policy mentions anon, so visitors without an account can't read or write anything.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- users: profiles are readable by signed-in users; each person updates their own row
-- (prevent_role_escalation keeps roles admin-only). Accounts are created by Supabase Auth.
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON public.users;
CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- events: staff see published events and their own drafts and can only create drafts
DROP POLICY IF EXISTS "Signed-in users see published events, admins see all" ON public.events;
CREATE POLICY "Signed-in users see published events, admins see all"
  ON public.events FOR SELECT TO authenticated
  USING (status = 'published' OR creator_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Admins create events, staff create drafts" ON public.events;
CREATE POLICY "Admins create events, staff create drafts"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (status = 'draft' AND creator_id = auth.uid()));
DROP POLICY IF EXISTS "Admins update events" ON public.events;
CREATE POLICY "Admins update events"
  ON public.events FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete events" ON public.events;
CREATE POLICY "Admins delete events"
  ON public.events FOR DELETE TO authenticated
  USING (public.is_admin());

-- The events policy applies inside these subqueries: you see what belongs to events you can see
DROP POLICY IF EXISTS "Attachments follow their event" ON public.event_attachments;
CREATE POLICY "Attachments follow their event"
  ON public.event_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
DROP POLICY IF EXISTS "Admins add attachments" ON public.event_attachments;
CREATE POLICY "Admins add attachments"
  ON public.event_attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete attachments" ON public.event_attachments;
CREATE POLICY "Admins delete attachments"
  ON public.event_attachments FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "History follows its event" ON public.event_history;
CREATE POLICY "History follows its event"
  ON public.event_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
-- (The "created" entry is written by a trigger, which these policies don't limit)
DROP POLICY IF EXISTS "Admins write history" ON public.event_history;
CREATE POLICY "Admins write history"
  ON public.event_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Deleted dates follow their event" ON public.recurrence_exceptions;
CREATE POLICY "Deleted dates follow their event"
  ON public.recurrence_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
DROP POLICY IF EXISTS "Admins delete dates" ON public.recurrence_exceptions;
CREATE POLICY "Admins delete dates"
  ON public.recurrence_exceptions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins restore dates" ON public.recurrence_exceptions;
CREATE POLICY "Admins restore dates"
  ON public.recurrence_exceptions FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Signed-in users see categories" ON public.event_categories;
CREATE POLICY "Signed-in users see categories"
  ON public.event_categories FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Admins add categories" ON public.event_categories;
CREATE POLICY "Admins add categories"
  ON public.event_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete categories" ON public.event_categories;
CREATE POLICY "Admins delete categories"
  ON public.event_categories FOR DELETE TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
DROP POLICY IF EXISTS "Admins read error reports" ON public.client_errors;
CREATE POLICY "Admins read error reports"
  ON public.client_errors FOR SELECT TO authenticated
  USING (public.is_admin());

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
