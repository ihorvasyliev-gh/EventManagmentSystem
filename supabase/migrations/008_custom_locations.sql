-- ============================================
-- Migration: Per-date addresses for multi-date events
-- ============================================
-- A multi-date event can now be held in a different place on each date, and on each
-- time of a date ("Same place for all dates" unticked). Each date's start is kept in
-- recurrence_custom_dates; this column holds the matching addresses.
-- Run this in Supabase Dashboard → SQL Editor. It is safe to run more than once.
-- ============================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recurrence_custom_locations TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.events.recurrence_custom_locations IS 'Address of each date in recurrence_custom_dates (same order). NULL means every date is at the event''s own location.';

-- Make the API see the new column straight away
NOTIFY pgrst, 'reload schema';
