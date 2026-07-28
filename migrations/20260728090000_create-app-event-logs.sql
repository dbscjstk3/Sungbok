CREATE TABLE IF NOT EXISTS public.app_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  status text NOT NULL,
  session_id uuid,
  round_id uuid,
  round_number integer,
  trigger_source text,
  scheduled_for timestamptz,
  page_visibility text,
  candidate_count integer,
  matched_count integer,
  duration_ms integer,
  http_status integer,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT app_event_logs_round_number_check
    CHECK (round_number IS NULL OR round_number > 0),
  CONSTRAINT app_event_logs_counts_check
    CHECK (
      (candidate_count IS NULL OR candidate_count >= 0)
      AND (matched_count IS NULL OR matched_count >= 0)
      AND (duration_ms IS NULL OR duration_ms >= 0)
    )
);

CREATE INDEX IF NOT EXISTS app_event_logs_created_at_idx
  ON public.app_event_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS app_event_logs_session_created_at_idx
  ON public.app_event_logs (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.app_event_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_event_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_app_event(
  p_event_type text,
  p_status text,
  p_session_id uuid DEFAULT NULL,
  p_round_id uuid DEFAULT NULL,
  p_round_number integer DEFAULT NULL,
  p_trigger_source text DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_page_visibility text DEFAULT NULL,
  p_candidate_count integer DEFAULT NULL,
  p_matched_count integer DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_http_status integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'champion_fetch',
    'round_save',
    'round_undo',
    'session_restore'
  ) THEN
    RAISE EXCEPTION 'unsupported event type';
  END IF;

  IF p_status IS NULL OR length(p_status) > 40 THEN
    RAISE EXCEPTION 'invalid event status';
  END IF;

  IF p_page_visibility IS NOT NULL
    AND p_page_visibility NOT IN ('visible', 'hidden', 'prerender', 'unloaded', 'unknown') THEN
    RAISE EXCEPTION 'invalid page visibility';
  END IF;

  IF pg_column_size(COALESCE(p_metadata, '{}'::jsonb)) > 4096 THEN
    RAISE EXCEPTION 'event metadata is too large';
  END IF;

  -- Keep diagnostic data for 30 days. Cleanup runs opportunistically whenever
  -- a new event arrives, so no separate scheduler or edge function is required.
  DELETE FROM public.app_event_logs
  WHERE created_at < now() - interval '30 days';

  INSERT INTO public.app_event_logs (
    event_type,
    status,
    session_id,
    round_id,
    round_number,
    trigger_source,
    scheduled_for,
    page_visibility,
    candidate_count,
    matched_count,
    duration_ms,
    http_status,
    error_code,
    error_message,
    metadata
  )
  VALUES (
    p_event_type,
    left(p_status, 40),
    p_session_id,
    p_round_id,
    p_round_number,
    left(p_trigger_source, 60),
    p_scheduled_for,
    p_page_visibility,
    p_candidate_count,
    p_matched_count,
    p_duration_ms,
    p_http_status,
    left(p_error_code, 80),
    left(p_error_message, 300),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_app_event(
  text, text, uuid, uuid, integer, text, timestamptz, text,
  integer, integer, integer, integer, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_app_event(
  text, text, uuid, uuid, integer, text, timestamptz, text,
  integer, integer, integer, integer, text, text, jsonb
) TO anon, authenticated;
