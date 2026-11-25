-- ============================================
-- Add Seminar/Conference to standard categories
-- ============================================
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================

INSERT INTO public.event_categories (name)
VALUES ('Seminar/Conference')
ON CONFLICT (name) DO NOTHING;
