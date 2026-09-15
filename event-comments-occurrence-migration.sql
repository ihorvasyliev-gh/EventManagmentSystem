-- Migration: Comments per occurrence for recurring events
-- Run this in Supabase SQL Editor after backing up data.
-- Комментарии к повторяющимся событиям привязываются к конкретному вхождению (occurrence_date).

-- 1. Add occurrence_date column (nullable first for backfill)
ALTER TABLE public.event_comments
  ADD COLUMN IF NOT EXISTS occurrence_date TIMESTAMP WITH TIME ZONE;

-- 2. Backfill: set occurrence_date from event's date for existing rows
UPDATE public.event_comments c
SET occurrence_date = e.date
FROM public.events e
WHERE c.event_id = e.id AND c.occurrence_date IS NULL;

-- 3. Make column NOT NULL (after backfill)
ALTER TABLE public.event_comments
  ALTER COLUMN occurrence_date SET NOT NULL;

-- 4. Index for filtering by event + occurrence
CREATE INDEX IF NOT EXISTS idx_comments_event_occurrence
  ON public.event_comments(event_id, occurrence_date);
