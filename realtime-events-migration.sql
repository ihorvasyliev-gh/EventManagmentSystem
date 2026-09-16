-- ============================================
-- Migration: Enable Supabase Realtime for Events Table
-- ============================================
-- Выполните этот скрипт в Supabase Dashboard → SQL Editor → New Query → Run
-- Это позволит мгновенно получать обновления заявок и событий без F5.
-- ============================================

-- 1. Добавляем таблицу events в публикацию supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END $$;

-- 2. Устанавливаем REPLICA IDENTITY FULL, чтобы при обновлениях и удалениях передавались полные данные строк
ALTER TABLE public.events REPLICA IDENTITY FULL;
