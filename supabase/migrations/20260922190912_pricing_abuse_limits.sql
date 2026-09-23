-- Shared API/MCP protection for Free and Premium; reserve AI quota before provider work.
CREATE OR REPLACE FUNCTION public.consume_api_user_minute_limit(
  p_user_id UUID,
  p_window_start TIMESTAMPTZ,
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
  v_window_start TIMESTAMPTZ := date_trunc('minute', p_window_start);
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'Invalid user rate limit payload';
  END IF;

  INSERT INTO public.api_user_rate_limit_windows (
    user_id,
    window_start,
    request_count
  ) VALUES (
    p_user_id,
    v_window_start,
    1
  )
  ON CONFLICT (user_id, window_start) DO UPDATE
    SET request_count = public.api_user_rate_limit_windows.request_count + 1
    WHERE public.api_user_rate_limit_windows.request_count < p_limit
  RETURNING public.api_user_rate_limit_windows.request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT public.api_user_rate_limit_windows.request_count
    INTO v_count
    FROM public.api_user_rate_limit_windows
    WHERE user_id = p_user_id
      AND window_start = v_window_start;

    RETURN QUERY SELECT
      FALSE,
      COALESCE(v_count, p_limit),
      0,
      v_window_start + INTERVAL '1 minute';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_count,
    GREATEST(p_limit - v_count, 0),
    v_window_start + INTERVAL '1 minute';
END;
$$;


REVOKE ALL ON FUNCTION public.consume_api_user_minute_limit(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_user_minute_limit(UUID, TIMESTAMPTZ, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.release_ai_quota(p_user_id UUID, p_window_start DATE)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ai_usage_windows
  SET request_count = greatest(0, request_count - 1)
  WHERE user_id = p_user_id AND window_start = p_window_start;
$$;
REVOKE ALL ON FUNCTION public.release_ai_quota(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_quota(UUID, DATE) TO service_role;
