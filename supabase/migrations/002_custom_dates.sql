-- ============================================
-- Migration: Custom Dates for Recurring Events
-- ============================================
-- Adds recurrence_custom_dates column to events table
-- to support manually picked dates for custom recurrence.
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recurrence_custom_dates TIMESTAMP WITH TIME ZONE[] DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.events.recurrence_custom_dates IS 'Array of specific dates for custom recurrence (recurrence_type = custom). Each timestamp represents a manually picked event occurrence date.';
