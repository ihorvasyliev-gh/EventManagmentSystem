-- ============================================
-- Migration 014: profiles only the server changes, and a limit on the public form
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run. It can run before or after the
-- app version that uses it is deployed: until it has run, the form simply has no limit.
-- Safe to run more than once.
--
--  1. Nobody can change their row in users from the browser any more. Before, anyone signed
--     in could edit all of it: clear must_change_password and keep the temporary password an
--     admin had read out to them, or put someone else's address in email (it is the reply-to
--     of their emails). Accounts and roles are managed by the Cloudflare functions and in SQL.
--  2. must_change_password now clears itself when the person's password really changes
--     (the app used to clear it, which is what let anyone clear it).
--  3. rate_limits and hit_rate_limit(): /api/submit counts submissions per network, so the
--     form (open to anyone with the link) can't be flooded. Networks are stored only as a
--     hash, and only for a day.
-- ============================================

-- ---------- 1. users: read-only from the browser ----------
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- ---------- 2. The forced password change clears itself ----------
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET must_change_password = false WHERE id = NEW.id AND must_change_password;
  RETURN NEW;
END;
$$;

-- An admin's reset changes the password too: /api/staff-password sets the flag again after it
DROP TRIGGER IF EXISTS on_auth_password_changed ON auth.users;
CREATE TRIGGER on_auth_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
  EXECUTE FUNCTION public.clear_must_change_password();

-- ---------- 3. Rate limits ----------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

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

-- Make the API see the new function straight away
NOTIFY pgrst, 'reload schema';
