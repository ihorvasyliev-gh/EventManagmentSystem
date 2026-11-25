-- ============================================
-- Migration 020: audit security fixes
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to run more than once.
--
--  1. Narrow public.users SELECT policy so signed-in staff read only their own profile
--     while admins can still read every profile.
--  2. Pin search_path = public on public.update_updated_at_column().
--  3. Replace the 90-day global 5,000-row lockout in public.log_client_error() with a
--     per-day cap (200 new fingerprints per day) plus oldest-row eviction beyond 5,000 rows,
--     so a flood can never permanently silence error logging for 90 days.
-- ============================================

-- ---------- 1. Narrow public.users SELECT policy ----------
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON public.users;
CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ---------- 2. Pin search_path on update_updated_at_column() ----------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------- 3. Per-day cap + oldest-row eviction in log_client_error() ----------
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_fingerprint TEXT, p_message TEXT, p_stack TEXT, p_url TEXT,
  p_release TEXT, p_user_agent TEXT, p_user_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.client_errors WHERE day < CURRENT_DATE - 90;
  IF NOT EXISTS (SELECT 1 FROM public.client_errors WHERE fingerprint = p_fingerprint AND day = CURRENT_DATE)
     AND (SELECT count(*) FROM public.client_errors WHERE day = CURRENT_DATE) >= 200 THEN
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
  DELETE FROM public.client_errors
  WHERE id IN (
    SELECT id FROM public.client_errors
    ORDER BY day DESC, last_seen DESC, id DESC
    OFFSET 5000
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Make the API see the updated schema straight away
NOTIFY pgrst, 'reload schema';
