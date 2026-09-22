-- Switch AI capture per-user quota from daily windows to calendar-month windows.
-- Counters still live in ai_usage_windows; callers now pass the month-start DATE
-- (YYYY-MM-01). reset_at becomes the start of the following UTC month.
-- Successful parses only are charged by the application layer (consume after parse).

COMMENT ON TABLE public.ai_usage_windows IS
  'Fixed-window (calendar month, UTC) AI capture parse counters keyed by user. No request content is stored.';

CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  p_user_id UUID,
  p_window_start DATE,
  p_limit INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  request_count INTEGER,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reset TIMESTAMPTZ := ((p_window_start + INTERVAL '1 month')::TIMESTAMP) AT TIME ZONE 'UTC';
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_window_start IS NULL OR p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'Invalid AI quota payload';
  END IF;

  INSERT INTO public.ai_usage_windows (user_id, window_start, request_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start) DO UPDATE
    SET request_count = public.ai_usage_windows.request_count + 1
    WHERE public.ai_usage_windows.request_count < p_limit
  RETURNING public.ai_usage_windows.request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT public.ai_usage_windows.request_count
    INTO v_count
    FROM public.ai_usage_windows
    WHERE user_id = p_user_id AND window_start = p_window_start;

    RETURN QUERY SELECT FALSE, COALESCE(v_count, p_limit), 0, v_reset;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, v_count, GREATEST(p_limit - v_count, 0), v_reset;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, DATE, INTEGER) TO service_role;
