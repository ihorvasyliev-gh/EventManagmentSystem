-- ============================================
-- Migration 017: staff see the pending events that name them as the contact
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, after deploying (the app works
-- without it). Safe to run more than once.
--
-- Staff can now change their own events (through /api/edit-event, which checks this itself and
-- logs what changed). "Their own" are the events they sent in while signed in, and the ones
-- whose first contact is their email: most are sent from /submit without signing in. Published
-- events are visible to everyone already; this lets staff also see (and so open and change) a
-- pending one they sent in without signing in. Nothing else about who can do what changes.
-- ============================================

ALTER POLICY "Signed-in users see published events, admins see all" ON public.events
  USING (
    status = 'published'
    OR creator_id = (SELECT auth.uid())
    OR lower(submitter_email) = (SELECT lower(auth.jwt() ->> 'email'))
    OR (SELECT public.is_admin())
  );

NOTIFY pgrst, 'reload schema';
