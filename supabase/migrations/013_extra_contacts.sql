-- ============================================
-- Migration 013: several contact people per event
-- ============================================
-- An event can now list more than one contact person (the form's "Add another contact
-- person"). The first one stays in submitter_name / submitter_email (the person who sent
-- it in); the others are kept here, in order, as [{"name": "...", "email": "..."}].
--
-- Run in Supabase Dashboard → SQL Editor → New query → Run, BEFORE deploying the app
-- version that has this feature: that version reads and writes the new column, and its
-- calendar can't load events until the column exists. The older app keeps working with
-- it (it doesn't read the column). Safe to run more than once.
-- ============================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS extra_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_extra_contacts_check;
ALTER TABLE public.events
ADD CONSTRAINT events_extra_contacts_check CHECK (jsonb_typeof(extra_contacts) = 'array');

COMMENT ON COLUMN public.events.extra_contacts IS 'Contact people besides submitter_name / submitter_email, shown after them: [{"name": "...", "email": "..."}].';

-- Make the API see the new column straight away
NOTIFY pgrst, 'reload schema';
