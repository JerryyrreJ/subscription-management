-- AI capture quotas and cost guardrails.
--
-- The AI subscription-capture feature ("万能录入") is the most expensive surface
-- per call, so volume is bounded in two independent layers:
--   1. ai_usage_windows  -> per-user daily parse quota (free vs premium).
--   2. ai_cost_windows   -> a global monthly token accumulator the function reads
--                           as a circuit breaker against the configured budget.
-- Both follow the same fixed-window + SECURITY DEFINER RPC pattern as the public
-- API rate limiter. Nothing here stores the user's pasted content.

-- 1. Per-user daily parse quota -----------------------------------------------

CREATE TABLE public.ai_usage_windows (
  user_id UUID NOT NULL,
  window_start DATE NOT NULL,
  request_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_usage_windows_pkey PRIMARY KEY (user_id, window_start),
  CONSTRAINT ai_usage_windows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT ai_usage_windows_count_nonnegative CHECK (request_count >= 0)
);

COMMENT ON TABLE public.ai_usage_windows IS 'Fixed-window (daily) AI capture parse counters keyed by user. No request content is stored.';

CREATE INDEX ai_usage_windows_window_start_idx ON public.ai_usage_windows(window_start);

CREATE TRIGGER ai_usage_windows_set_updated_at
BEFORE UPDATE ON public.ai_usage_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_usage_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.ai_usage_windows FROM anon, authenticated;
GRANT ALL ON public.ai_usage_windows TO service_role;

-- 2. Global monthly token accumulator (budget circuit breaker) ----------------

CREATE TABLE public.ai_cost_windows (
  window_start DATE NOT NULL,
  input_tokens BIGINT DEFAULT 0 NOT NULL,
  output_tokens BIGINT DEFAULT 0 NOT NULL,
  request_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_cost_windows_pkey PRIMARY KEY (window_start),
  CONSTRAINT ai_cost_windows_tokens_nonnegative CHECK (input_tokens >= 0 AND output_tokens >= 0 AND request_count >= 0)
);

COMMENT ON TABLE public.ai_cost_windows IS 'Workspace-wide monthly token totals for the AI capture feature. Read as a budget circuit breaker; holds aggregate counts only.';

CREATE TRIGGER ai_cost_windows_set_updated_at
BEFORE UPDATE ON public.ai_cost_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_cost_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.ai_cost_windows FROM anon, authenticated;
GRANT ALL ON public.ai_cost_windows TO service_role;

-- 3. RPCs ---------------------------------------------------------------------

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
  v_reset TIMESTAMPTZ := ((p_window_start + 1)::TIMESTAMP) AT TIME ZONE 'UTC';
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

CREATE OR REPLACE FUNCTION public.add_ai_cost(
  p_window_start DATE,
  p_input_tokens BIGINT,
  p_output_tokens BIGINT
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
    OR p_input_tokens IS NULL OR p_input_tokens < 0
    OR p_output_tokens IS NULL OR p_output_tokens < 0
  THEN
    RAISE EXCEPTION 'Invalid AI cost payload';
  END IF;

  INSERT INTO public.ai_cost_windows (window_start, input_tokens, output_tokens, request_count)
  VALUES (p_window_start, p_input_tokens, p_output_tokens, 1)
  ON CONFLICT (window_start) DO UPDATE
    SET input_tokens = public.ai_cost_windows.input_tokens + p_input_tokens,
        output_tokens = public.ai_cost_windows.output_tokens + p_output_tokens,
        request_count = public.ai_cost_windows.request_count + 1
  RETURNING
    public.ai_cost_windows.input_tokens,
    public.ai_cost_windows.output_tokens,
    public.ai_cost_windows.request_count
  INTO v_input, v_output, v_count;

  RETURN QUERY SELECT v_input, v_output, v_count;
END;
$$;

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

REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_ai_cost(DATE, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_budget(DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_ai_cost(DATE, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, DATE, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_ai_cost(DATE, BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget(DATE, BIGINT, BIGINT, NUMERIC, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_ai_cost(DATE, BIGINT, BIGINT) TO service_role;
