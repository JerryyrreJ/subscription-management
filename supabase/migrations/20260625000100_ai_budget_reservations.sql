-- Atomic AI budget reservation helpers.
--
-- The original AI capture migration created aggregate token accounting. This
-- follow-up adds pre-call reservation so concurrent requests cannot all observe
-- the same old monthly spend and enter the provider call together.

CREATE OR REPLACE FUNCTION public.reserve_ai_budget(
  p_window_start DATE,
  p_estimated_input_tokens BIGINT,
  p_estimated_output_tokens BIGINT,
  p_monthly_budget_usd NUMERIC,
  p_input_usd_per_million NUMERIC,
  p_output_usd_per_million NUMERIC
)
RETURNS TABLE (
  allowed BOOLEAN,
  input_tokens BIGINT,
  output_tokens BIGINT,
  request_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_input BIGINT;
  v_output BIGINT;
  v_count INTEGER;
  v_spent_usd NUMERIC;
  v_estimated_usd NUMERIC;
BEGIN
  IF p_window_start IS NULL
    OR p_estimated_input_tokens IS NULL OR p_estimated_input_tokens < 0
    OR p_estimated_output_tokens IS NULL OR p_estimated_output_tokens < 0
    OR p_monthly_budget_usd IS NULL OR p_monthly_budget_usd <= 0
    OR p_input_usd_per_million IS NULL OR p_input_usd_per_million <= 0
    OR p_output_usd_per_million IS NULL OR p_output_usd_per_million <= 0
  THEN
    RAISE EXCEPTION 'Invalid AI budget reservation payload';
  END IF;

  INSERT INTO public.ai_cost_windows (window_start, input_tokens, output_tokens, request_count)
  VALUES (p_window_start, 0, 0, 0)
  ON CONFLICT (window_start) DO NOTHING;

  SELECT public.ai_cost_windows.input_tokens,
         public.ai_cost_windows.output_tokens,
         public.ai_cost_windows.request_count
  INTO v_input, v_output, v_count
  FROM public.ai_cost_windows
  WHERE window_start = p_window_start
  FOR UPDATE;

  v_spent_usd :=
    (v_input::NUMERIC / 1000000) * p_input_usd_per_million +
    (v_output::NUMERIC / 1000000) * p_output_usd_per_million;
  v_estimated_usd :=
    (p_estimated_input_tokens::NUMERIC / 1000000) * p_input_usd_per_million +
    (p_estimated_output_tokens::NUMERIC / 1000000) * p_output_usd_per_million;

  IF v_spent_usd + v_estimated_usd > p_monthly_budget_usd THEN
    RETURN QUERY SELECT FALSE, v_input, v_output, v_count;
    RETURN;
  END IF;

  UPDATE public.ai_cost_windows
  SET input_tokens = public.ai_cost_windows.input_tokens + p_estimated_input_tokens,
      output_tokens = public.ai_cost_windows.output_tokens + p_estimated_output_tokens,
      request_count = public.ai_cost_windows.request_count + 1
  WHERE window_start = p_window_start
  RETURNING public.ai_cost_windows.input_tokens,
            public.ai_cost_windows.output_tokens,
            public.ai_cost_windows.request_count
  INTO v_input, v_output, v_count;

  RETURN QUERY SELECT TRUE, v_input, v_output, v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_ai_cost(
  p_window_start DATE,
  p_input_token_delta BIGINT,
  p_output_token_delta BIGINT
)
RETURNS TABLE (
  input_tokens BIGINT,
  output_tokens BIGINT,
  request_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_input BIGINT;
  v_output BIGINT;
  v_count INTEGER;
BEGIN
  IF p_window_start IS NULL
    OR p_input_token_delta IS NULL
    OR p_output_token_delta IS NULL
  THEN
    RAISE EXCEPTION 'Invalid AI cost adjustment payload';
  END IF;

  UPDATE public.ai_cost_windows
  SET input_tokens = GREATEST(public.ai_cost_windows.input_tokens + p_input_token_delta, 0),
      output_tokens = GREATEST(public.ai_cost_windows.output_tokens + p_output_token_delta, 0)
  WHERE window_start = p_window_start
  RETURNING public.ai_cost_windows.input_tokens,
            public.ai_cost_windows.output_tokens,
            public.ai_cost_windows.request_count
  INTO v_input, v_output, v_count;

  IF v_input IS NULL THEN
    RAISE EXCEPTION 'AI cost window does not exist';
  END IF;

  RETURN QUERY SELECT v_input, v_output, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_budget(DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_ai_cost(DATE, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget(DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_ai_cost(DATE, BIGINT, BIGINT) TO service_role;
