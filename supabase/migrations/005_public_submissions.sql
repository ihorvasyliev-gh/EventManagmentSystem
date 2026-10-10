-- ============================================
-- Migration: Public Event Submissions & Storage Setup
-- ============================================
-- Выполните этот скрипт в Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================

-- 1. Разрешаем creator_id быть NULL для анонимных заявок сотрудников
ALTER TABLE public.events ALTER COLUMN creator_id DROP NOT NULL;

-- 2. Добавляем колонки для submitter и end_date, если их еще нет
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS submitter_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS submitter_email TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;

-- 3. Удаляем старое CHECK-ограничение категорий (если существует), чтобы поддерживать новые категории
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;

-- 4. В таблице event_history разрешаем user_id быть NULL (для анонимных событий)
ALTER TABLE public.event_history ALTER COLUMN user_id DROP NOT NULL;

-- 5. Обновляем триггер создания истории: функция должна быть SECURITY DEFINER и поддерживать NULL creator_id
CREATE OR REPLACE FUNCTION public.create_event_history_entry()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  IF NEW.creator_id IS NOT NULL THEN
    SELECT full_name INTO current_user_name
    FROM public.users
    WHERE id = NEW.creator_id;

    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NEW.creator_id, COALESCE(current_user_name, 'Unknown'), 'created');
  ELSE
    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NULL, COALESCE(NEW.submitter_name, 'Staff Submission'), 'created');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Политика RLS: разрешаем любому (anon и authenticated) отправлять черновики событий (draft)
DROP POLICY IF EXISTS "Anyone can submit draft events" ON public.events;
CREATE POLICY "Anyone can submit draft events"
  ON public.events FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'draft');

-- 7. Создание bucket 'event-attachments' в Supabase Storage для постеров/вложений (публичный доступ)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-attachments', 'event-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 8. Политики Supabase Storage для загрузки и чтения постеров
DROP POLICY IF EXISTS "Public can upload event attachments" ON storage.objects;
CREATE POLICY "Public can upload event attachments"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'event-attachments');

DROP POLICY IF EXISTS "Public can view event attachments" ON storage.objects;
CREATE POLICY "Public can view event attachments"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'event-attachments');
