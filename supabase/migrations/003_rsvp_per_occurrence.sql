-- Migration: RSVP per occurrence for recurring events
-- Run this in Supabase SQL Editor after backing up data.

-- 1. Add occurrence_date column (nullable first for backfill)
ALTER TABLE public.rsvps
  ADD COLUMN IF NOT EXISTS occurrence_date TIMESTAMP WITH TIME ZONE;

-- 2. Backfill: set occurrence_date from event's date for existing rows
UPDATE public.rsvps r
SET occurrence_date = e.date
FROM public.events e
WHERE r.event_id = e.id AND r.occurrence_date IS NULL;

-- 3. Make column NOT NULL (after backfill)
ALTER TABLE public.rsvps
  ALTER COLUMN occurrence_date SET NOT NULL;

-- 4. Drop old unique constraint
ALTER TABLE public.rsvps
  DROP CONSTRAINT IF EXISTS rsvps_event_id_user_id_key;

-- 5. Add new unique constraint (one RSVP per user per event per occurrence)
ALTER TABLE public.rsvps
  ADD CONSTRAINT rsvps_event_id_user_id_occurrence_date_key
  UNIQUE (event_id, user_id, occurrence_date);

-- 6. Index for filtering by event + occurrence
CREATE INDEX IF NOT EXISTS idx_rsvps_event_occurrence
  ON public.rsvps(event_id, occurrence_date);
