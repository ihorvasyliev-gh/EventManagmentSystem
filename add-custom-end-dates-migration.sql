-- ============================================
-- Migration: Per-date times for multi-date events
-- ============================================
-- A multi-date event can now run at a different time on each picked date
-- ("Same time every day" unticked). Each date's start is kept in
-- recurrence_custom_dates; this column holds the matching end times.
-- Run this in Supabase Dashboard → SQL Editor. It is safe to run more than once.
-- ============================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recurrence_custom_end_dates TIMESTAMP WITH TIME ZONE[] DEFAULT NULL;

COMMENT ON COLUMN public.events.recurrence_custom_end_dates IS 'End time of each date in recurrence_custom_dates (same order). NULL means every date uses the event''s own start/end time of day.';

-- Make the API see the new column straight away
NOTIFY pgrst, 'reload schema';
