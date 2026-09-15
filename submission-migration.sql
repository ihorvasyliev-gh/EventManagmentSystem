-- ============================================
-- Migration: Public Event Submissions & Fortnightly Bulletin
-- ============================================

-- 1. Allow creator_id to be nullable for anonymous staff submissions
ALTER TABLE public.events ALTER COLUMN creator_id DROP NOT NULL;

-- 2. Add submitter and end_date columns if they don't already exist
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS submitter_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS submitter_email TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- 3. Allow anonymous/public insertion of draft events
DROP POLICY IF EXISTS "Anyone can submit draft events" ON public.events;
CREATE POLICY "Anyone can submit draft events"
  ON public.events FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'draft');

-- 4. Allow public uploading of posters to storage bucket event-attachments
-- (Ensure event-attachments bucket is public in Supabase Storage Dashboard)
