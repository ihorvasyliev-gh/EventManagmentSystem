-- ============================================
-- Sync Event Categories with Standard CCP Categories
-- ============================================
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================

INSERT INTO public.event_categories (name)
VALUES 
  ('Enterprise & Employment'),
  ('Community & Family'),
  ('Education & Training'),
  ('Special Visits & Celebrations'),
  ('Public Information Session'),
  ('Health & Wellbeing'),
  ('Other')
ON CONFLICT (name) DO NOTHING;
