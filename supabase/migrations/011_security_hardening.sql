-- ============================================
-- Migration: Security hardening before release
-- ============================================
-- Выполните этот скрипт в Supabase Dashboard → SQL Editor → New Query → Run
-- (после supabase-setup.sql и submission-migration.sql). Скрипт идемпотентный.
--
-- Закрывает:
--   1. Регистрацию с ролью admin через signUp (role брался из user metadata, которую задаёт клиент)
--   2. Самоповышение staff → admin через UPDATE своей строки в public.users
--   3. Чтение списка сотрудников (email, имена, роли) анонимно по публичному anon key
--   4. Анонимные заявки от имени чужого creator_id
--   5. Вызов SECURITY DEFINER функций через /rest/v1/rpc в обход RLS
--   6. Загрузку любых файлов любого размера в публичный bucket event-attachments
-- ============================================

-- 1. Новые пользователи всегда получают роль staff; admin назначается только через SQL Editor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'staff'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Роль может менять только админ (или SQL Editor / service role, где auth.uid() IS NULL)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE id = auth.uid() AND role = 'admin'
     ) THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_user_role_change ON public.users;
CREATE TRIGGER on_user_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. Профили сотрудников видны только залогиненным (приложение без входа их не читает)
DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON public.users;
CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- 4. Заявка-черновик: аноним не может подставить чужой creator_id
DROP POLICY IF EXISTS "Anyone can submit draft events" ON public.events;
CREATE POLICY "Anyone can submit draft events"
  ON public.events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'draft' AND
    (creator_id IS NULL OR creator_id = auth.uid())
  );

-- 5. SECURITY DEFINER функции не должны быть доступны через API (приложение их не вызывает)
DO $$
BEGIN
  IF to_regprocedure('public.auto_confirm_user_email(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.auto_confirm_user_email(UUID) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.get_event_with_details(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_event_with_details(UUID) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 6. Bucket event-attachments используется только для постеров (fallback, если R2 недоступен)
UPDATE storage.buckets
SET file_size_limit = 15728640, -- 15 MB, как в /api/upload
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
WHERE id = 'event-attachments';

-- ============================================
-- Проверка после выполнения:
--   SELECT policyname, roles FROM pg_policies WHERE tablename IN ('users', 'events');
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass;
-- ============================================
