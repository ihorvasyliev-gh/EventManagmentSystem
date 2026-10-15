-- ============================================
-- Migration 019: a deleted event can be restored from the change log
-- ============================================
-- Run in Supabase Dashboard → SQL Editor → New query → Run, before or after deploying (the app
-- works without it: only Restore in the change log needs it, Undo straight after deleting doesn't).
-- Safe to run more than once.
--
-- Deleting an event now keeps a copy of it in its "deleted" history entry (snapshot): the
-- event's row, its attachments and its deleted dates. Admins restore it from the Deleted tab
-- of the change log, and the app puts the copy back as it was, under the same id. The entry is
-- written just before the row goes (BEFORE DELETE), while the attachments and deleted dates
-- are still there to copy. Who may see history doesn't change: deleted events' entries are for
-- admins only. Events deleted before this migration have no copy and can't be restored.
-- An event put back (the same id as a deleted one) is logged as restored, by whoever did it,
-- instead of as created again by the person who first sent it in.
-- ============================================

ALTER TABLE public.event_history ADD COLUMN IF NOT EXISTS snapshot JSONB;

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
  v_snapshot JSONB;
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

  v_snapshot := jsonb_build_object(
    'event', to_jsonb(OLD),
    'attachments', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.event_attachments a WHERE a.event_id = OLD.id), '[]'::jsonb),
    'deleted_dates', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.recurrence_exceptions x WHERE x.event_id = OLD.id), '[]'::jsonb)
  );

  INSERT INTO public.event_history (event_id, event_title, user_id, user_name, action, changes, snapshot)
  VALUES (OLD.id, OLD.title, v_user_id, COALESCE(v_user_name, 'Supabase (not an app account)'), 'deleted', v_changes, v_snapshot);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_event_deleted ON public.events;
CREATE TRIGGER on_event_deleted
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.log_event_deleted();

-- "Created" history entry for every new event (also for submissions without an account). An
-- event put back after it was deleted (the same id) is logged as restored, by whoever did it.
CREATE OR REPLACE FUNCTION public.create_event_history_entry()
RETURNS TRIGGER AS $$
DECLARE
  current_user_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_history WHERE event_id = NEW.id AND action = 'deleted') THEN
    SELECT full_name INTO current_user_name FROM public.users WHERE id = auth.uid();
    INSERT INTO public.event_history (event_id, user_id, user_name, action, changes)
    VALUES (NEW.id, auth.uid(), COALESCE(current_user_name, 'Unknown'), 'created', '{"restored": true}'::jsonb);
  ELSIF NEW.creator_id IS NOT NULL THEN
    SELECT full_name INTO current_user_name FROM public.users WHERE id = NEW.creator_id;
    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NEW.creator_id, COALESCE(current_user_name, 'Unknown'), 'created');
  ELSE
    INSERT INTO public.event_history (event_id, user_id, user_name, action)
    VALUES (NEW.id, NULL, COALESCE(NEW.submitter_name, 'Staff Submission'), 'created');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
