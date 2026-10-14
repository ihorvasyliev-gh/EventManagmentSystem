-- ============================================
-- Migration 018: deleted events stay in the change log, with who deleted them
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, after deploying. Safe to run more
-- than once.
--
-- An event's history used to be deleted along with the event (on delete cascade), so a deleted
-- event left no trace and nobody could tell who deleted it.
--  1. History outlives its event: event_history.event_id no longer points at events, and each
--     entry keeps the event's name (event_title) for when the event is gone.
--  2. Deleting an event writes a "deleted" entry: who deleted it and what the event was (name,
--     date, status, contact…). The database writes it, so every way of deleting is logged: the
--     app, declining a submission (/api/submissions names the admin), the API itself, SQL.
--  3. Admins see the history of deleted events. Nobody changes or deletes history from the app,
--     and a "deleted" entry can't be written by hand.
--  4. An entry's author is named as their account is (it used to be whatever the app sent).
-- ============================================

-- ---------- 1. History outlives its event ----------
ALTER TABLE public.event_history ADD COLUMN IF NOT EXISTS event_title TEXT;

UPDATE public.event_history h SET event_title = e.title
FROM public.events e
WHERE e.id = h.event_id AND h.event_title IS NULL;

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.event_history'::regclass AND contype = 'f' AND confrelid = 'public.events'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.event_history DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

-- Each entry names its event and its author as the database knows them, not as sent
CREATE OR REPLACE FUNCTION public.fill_event_history_entry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title TEXT;
  v_name TEXT;
BEGIN
  -- (a deleted event is gone already: its entry brings the name with it)
  SELECT title INTO v_title FROM public.events WHERE id = NEW.event_id;
  NEW.event_title := COALESCE(v_title, NEW.event_title);
  IF NEW.user_id IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.users WHERE id = NEW.user_id;
    NEW.user_name := COALESCE(v_name, NEW.user_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_event_history_insert ON public.event_history;
CREATE TRIGGER on_event_history_insert
  BEFORE INSERT ON public.event_history
  FOR EACH ROW EXECUTE FUNCTION public.fill_event_history_entry();

-- ---------- 2. Who deleted an event, and what it was ----------
CREATE OR REPLACE FUNCTION public.log_event_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims JSONB := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers JSONB := NULLIF(current_setting('request.headers', true), '')::jsonb;
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_declined BOOLEAN := false;
  v_tz TEXT := 'Europe/Dublin';
  v_unit TEXT;
  v_when TEXT;
  v_repeat TEXT;
  v_changes JSONB;
BEGIN
  -- The Cloudflare functions delete with the service role key, naming the admin they act for
  -- (only that key can, so nobody else can put a name here)
  IF v_claims ->> 'role' = 'service_role' THEN
    IF v_user_id IS NULL AND v_headers ->> 'x-acting-user' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_user_id := (v_headers ->> 'x-acting-user')::uuid;
    END IF;
    v_declined := COALESCE(v_headers ->> 'x-delete-reason' = 'declined', false);
  END IF;
  IF v_user_id IS NOT NULL THEN
    -- (no such account: nobody is named)
    SELECT id, full_name INTO v_user_id, v_user_name FROM public.users WHERE id = v_user_id;
  END IF;

  v_when := to_char(OLD.date AT TIME ZONE v_tz, 'Dy FMDD Mon YYYY, HH24:MI')
    || CASE
         WHEN OLD.end_date IS NULL OR OLD.end_date <= OLD.date THEN ''
         WHEN (OLD.end_date AT TIME ZONE v_tz)::date = (OLD.date AT TIME ZONE v_tz)::date
           THEN '–' || to_char(OLD.end_date AT TIME ZONE v_tz, 'HH24:MI')
         ELSE ' – ' || to_char(OLD.end_date AT TIME ZONE v_tz, 'Dy FMDD Mon YYYY, HH24:MI')
       END;
  v_unit := CASE OLD.recurrence_type WHEN 'daily' THEN 'day' WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' WHEN 'yearly' THEN 'year' END;
  v_repeat := CASE
    WHEN OLD.recurrence_type = 'custom' THEN
      'On ' || COALESCE(cardinality(OLD.recurrence_custom_dates), 0) || ' picked date'
        || CASE WHEN COALESCE(cardinality(OLD.recurrence_custom_dates), 0) = 1 THEN '' ELSE 's' END
    WHEN v_unit IS NULL THEN NULL
    WHEN COALESCE(OLD.recurrence_interval, 1) > 1 THEN 'Every ' || OLD.recurrence_interval || ' ' || v_unit || 's'
    ELSE 'Every ' || v_unit
  END;

  -- What the event was (besides its name, the entry's event_title), as the change log shows a
  -- change: each value struck out ({"old": …})
  SELECT jsonb_object_agg(key, jsonb_build_object('old', value)) INTO v_changes
  FROM jsonb_each(jsonb_strip_nulls(jsonb_build_object(
    'category', NULLIF(OLD.category, ''),
    'status', CASE OLD.status WHEN 'draft' THEN 'Pending review' WHEN 'published' THEN 'Published' ELSE OLD.status END,
    'when', v_when,
    'repeat', v_repeat,
    'location', NULLIF(trim(OLD.location), ''),
    'contacts', NULLIF(concat_ws(' ', NULLIF(trim(OLD.submitter_name), ''), '(' || NULLIF(lower(trim(OLD.submitter_email)), '') || ')'), '')
  )));
  IF v_declined THEN
    v_changes := v_changes || '{"declined": true}'::jsonb;
  END IF;

  INSERT INTO public.event_history (event_id, event_title, user_id, user_name, action, changes)
  VALUES (OLD.id, OLD.title, v_user_id, COALESCE(v_user_name, 'Supabase (not an app account)'), 'deleted', v_changes);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_event_deleted ON public.events;
CREATE TRIGGER on_event_deleted
  AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.log_event_deleted();

-- ---------- 3. Admins see all history; nobody rewrites it ----------
DROP POLICY IF EXISTS "History follows its event" ON public.event_history;
DROP POLICY IF EXISTS "History follows its event, admins see all" ON public.event_history;
CREATE POLICY "History follows its event, admins see all"
  ON public.event_history FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()) OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));

DROP POLICY IF EXISTS "Admins write history" ON public.event_history;
CREATE POLICY "Admins write history"
  ON public.event_history FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()) AND user_id = (SELECT auth.uid()) AND action <> 'deleted');

REVOKE UPDATE, DELETE, TRUNCATE ON public.event_history FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
