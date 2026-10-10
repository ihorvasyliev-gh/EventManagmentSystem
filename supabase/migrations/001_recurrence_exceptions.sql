-- ============================================
-- Migration: Recurrence Exceptions Table
-- ============================================
-- Таблица для хранения удаленных экземпляров повторяющихся событий
-- ============================================

-- Таблица исключений для повторяющихся событий
CREATE TABLE IF NOT EXISTS public.recurrence_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  exception_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, exception_date)
);

-- Индекс для быстрого поиска исключений по событию
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_event_id ON public.recurrence_exceptions(event_id);

-- Индекс для быстрого поиска исключений по дате
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_date ON public.recurrence_exceptions(exception_date);

-- ============================================
-- ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS POLICIES)
-- ============================================

-- Включаем RLS
ALTER TABLE public.recurrence_exceptions ENABLE ROW LEVEL SECURITY;

-- Все авторизованные пользователи могут видеть исключения для событий, которые они могут видеть
DROP POLICY IF EXISTS "Users can view recurrence exceptions" ON public.recurrence_exceptions;
CREATE POLICY "Users can view recurrence exceptions"
  ON public.recurrence_exceptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = recurrence_exceptions.event_id AND (
        events.status = 'published' OR
        events.creator_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Только создатель события или админ могут создавать исключения
DROP POLICY IF EXISTS "Users can create recurrence exceptions" ON public.recurrence_exceptions;
CREATE POLICY "Users can create recurrence exceptions"
  ON public.recurrence_exceptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = recurrence_exceptions.event_id AND (
        events.creator_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Только создатель события или админ могут удалять исключения
DROP POLICY IF EXISTS "Users can delete recurrence exceptions" ON public.recurrence_exceptions;
CREATE POLICY "Users can delete recurrence exceptions"
  ON public.recurrence_exceptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = recurrence_exceptions.event_id AND (
        events.creator_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );
