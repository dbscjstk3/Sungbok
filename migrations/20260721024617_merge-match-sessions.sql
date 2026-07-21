CREATE OR REPLACE FUNCTION public.merge_match_sessions(
  p_target_session_id UUID,
  p_source_session_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_source_ids UUID[];
  v_expected_count INTEGER;
  v_found_count INTEGER;
  v_moved_rounds INTEGER;
BEGIN
  IF p_target_session_id IS NULL THEN
    RAISE EXCEPTION 'target session is required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT source_id), ARRAY[]::UUID[])
  INTO v_source_ids
  FROM unnest(COALESCE(p_source_session_ids, ARRAY[]::UUID[])) AS source_id
  WHERE source_id IS NOT NULL
    AND source_id <> p_target_session_id;

  v_expected_count := cardinality(v_source_ids);
  IF v_expected_count = 0 THEN
    RAISE EXCEPTION 'at least one source session is required';
  END IF;

  PERFORM 1
  FROM public.sessions
  WHERE id = p_target_session_id
    AND ended_at IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target session does not exist or is not completed';
  END IF;

  PERFORM id
  FROM public.sessions
  WHERE id = ANY(v_source_ids)
    AND ended_at IS NOT NULL
  FOR UPDATE;

  SELECT count(*)
  INTO v_found_count
  FROM public.sessions
  WHERE id = ANY(v_source_ids)
    AND ended_at IS NOT NULL;

  IF v_found_count <> v_expected_count THEN
    RAISE EXCEPTION 'one or more source sessions do not exist or are not completed';
  END IF;

  UPDATE public.rounds
  SET session_id = p_target_session_id
  WHERE session_id = ANY(v_source_ids);
  GET DIAGNOSTICS v_moved_rounds = ROW_COUNT;

  DELETE FROM public.sessions
  WHERE id = ANY(v_source_ids);

  RETURN v_moved_rounds;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_match_sessions(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_match_sessions(UUID, UUID[]) TO anon, authenticated;
